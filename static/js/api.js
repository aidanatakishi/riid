import { state } from './state.js';
import { normalizeStr, showToast, toggleSettings } from './utils.js';
import { belongsToDept, hasKomplaynsComponent } from './model.js';
import { applyFilters, loadFiltersFromStorage, populateSprintFilter } from './filters.js';

export async function loadServerConfig() {
    var res = await fetch('/api/config');
    var cfg = await res.json();
    var baseEl = document.getElementById('baseUrl');
    var projectEl = document.getElementById('projectKey');
    if (cfg.baseUrl && !baseEl.value) baseEl.value = cfg.baseUrl;
    if (cfg.projectKey && !projectEl.value) projectEl.value = cfg.projectKey;
    return cfg;
}

export async function fetchJQL(baseUrl, pat, jql, expandChangelog) {
    var isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    var url = isLocal ? '/api/jira' : '/.netlify/functions/jira';
    var body = { baseUrl: baseUrl, jql: jql };
    if (pat) body.pat = pat;
    if (expandChangelog) body.expandChangelog = true;
    var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var text = await res.text();
    try {
        var data = JSON.parse(text);
        if (!res.ok) throw new Error('Jira API xətası: ' + (data.errorMessages ? data.errorMessages[0] : (data.error || res.status)));
        if (data.names) state.jiraFieldNames = data.names;
        return data;
    } catch (e) {
        throw new Error('Server cavabı JSON deyil: ' + text.substring(0, 150));
    }
}

var changelogPending = {};

export async function ensureChangelogs(tasks) {
    var missing = (tasks || []).filter(function(t) {
        return t && t.key && !t.changelog && !changelogPending[t.key];
    });
    if (!missing.length) return false;
    missing.forEach(function(t) { changelogPending[t.key] = true; });
    try {
        var baseUrl = state.currentBaseUrl;
        var pat = document.getElementById('pat').value;
        var chunkSize = 40;
        for (var i = 0; i < missing.length; i += chunkSize) {
            var chunk = missing.slice(i, i + chunkSize);
            var jql = 'key in (' + chunk.map(function(t) { return t.key; }).join(',') + ')';
            var data = await fetchJQL(baseUrl, pat, jql, true);
            (data.issues || []).forEach(function(fresh) {
                var existing = state.issueIndex[fresh.key];
                if (existing) existing.changelog = fresh.changelog || { histories: [] };
            });
        }
        missing.forEach(function(t) {
            var existing = state.issueIndex[t.key];
            if (existing && !existing.changelog) existing.changelog = { histories: [] };
        });
        return true;
    } finally {
        missing.forEach(function(t) { delete changelogPending[t.key]; });
    }
}

state.ensureChangelogs = ensureChangelogs;

export async function fetchTodayChanges() {
    var baseUrl = document.getElementById('baseUrl').value;
    var pat = document.getElementById('pat').value;
    var projectKey = document.getElementById('projectKey').value.toUpperCase();
    if (!baseUrl || !projectKey) return;
    state.currentBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var jql = 'project = ' + projectKey + ' AND updated >= "' + todayStr + '" ORDER BY updated DESC';
    try {
        var data = await fetchJQL(state.currentBaseUrl, pat, jql);
        var updatedCount = 0;
        data.issues.forEach(function(t) {
            var assigneeName = t.fields.assignee ? normalizeStr(t.fields.assignee.displayName) : '';
            var isExcluded = state.EXCLUDED_USERS.some(function(ex) { return assigneeName.includes(ex); });
            if (isExcluded) return;
            var typeName = t.fields.issuetype ? normalizeStr(t.fields.issuetype.name) : '';
            if (state.STRUCTURE_TYPES.includes(typeName)) return;
            var idx = state.allTasks.findIndex(function(at) { return at.key === t.key; });
            var prev = idx !== -1 ? state.allTasks[idx] : state.issueIndex[t.key];
            if (prev && prev.changelog && !t.changelog) t.changelog = prev.changelog;
            state.issueIndex[t.key] = t;
            state.parentCache = {};
            if (!belongsToDept(t)) {
                if (idx !== -1) { state.allTasks.splice(idx, 1); updatedCount++; }
                return;
            }
            var statusNorm = normalizeStr(t.fields.status.name);
            var isPaused = statusNorm.includes('dayandır') || statusNorm.includes('dayandir') || statusNorm.includes('müvəqqəti') || statusNorm.includes('muveqqeti');
            var shouldInclude = !statusNorm.includes('başlanmamış') && !statusNorm.includes('baslanmamis');
            if (idx !== -1) { state.allTasks[idx] = t; updatedCount++; }
            else if (shouldInclude || isPaused) { state.allTasks.unshift(t); updatedCount++; }
        });
        if (updatedCount > 0) applyFilters();
    } catch (error) {
        console.error('Bugünkü dəyişikliklər yüklənmədi:', error);
    }
}

export async function fetchDashboardData() {
     var baseUrl = document.getElementById('baseUrl').value;
     var pat = document.getElementById('pat').value;
     var projectKey = document.getElementById('projectKey').value.toUpperCase();
     if (!baseUrl || !projectKey) { toggleSettings(); showToast('Zəhmət olmasa Jira URL və layihə kodunu daxil edin!', 'error'); return; }
     state.currentBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
     document.getElementById('loadingOverlay').classList.remove('hidden');
     try {
         var jql = 'project = ' + projectKey + ' ORDER BY updated DESC';
         var data = await fetchJQL(state.currentBaseUrl, pat, jql);
         state.allDirections = []; state.allTasks = []; state.issueIndex = {}; state.parentCache = {};
         data.issues.forEach(function(t) { state.issueIndex[t.key] = t; state.issueIndexById[String(t.id)] = t; });
         data.issues.forEach(function(t) {
             var typeName = t.fields.issuetype ? normalizeStr(t.fields.issuetype.name) : '';
             if (!typeName.includes('alt') && (typeName.includes('istiqamət') || typeName.includes('istiqamet') || typeName.includes('epic') || typeName.includes('tədbir') || typeName.includes('tedbir'))) {
                 if (hasKomplaynsComponent(t)) {
                     state.allDirections.push(t); 
                 }
                 return;
             }
         });
         data.issues.forEach(function(t) {
             var assigneeName = t.fields.assignee ? normalizeStr(t.fields.assignee.displayName) : '';
             var isExcluded = state.EXCLUDED_USERS.some(function(ex) { return assigneeName.includes(ex); });
             if (isExcluded) return;
             var typeName = t.fields.issuetype ? normalizeStr(t.fields.issuetype.name) : '';
             if (state.STRUCTURE_TYPES.includes(typeName)) return;
             if (!belongsToDept(t)) return;
             var statusNorm = normalizeStr(t.fields.status.name);
             var isPaused = statusNorm.includes('dayandır') || statusNorm.includes('dayandir') || statusNorm.includes('müvəqqəti') || statusNorm.includes('muveqqeti');
             if ((!statusNorm.includes('başlanmamış') && !statusNorm.includes('baslanmamis')) || isPaused) state.allTasks.push(t);
         });
         document.getElementById('settingsPanel').classList.add('hidden');
         populateSprintFilter(); 
         loadFiltersFromStorage(); 
         applyFilters(); 
         showToast('Məlumatlar uğurla yeniləndi!', 'success');
         var todayTmp = new Date(); todayTmp.setHours(0,0,0,0);
         state.todayTasks = state.allTasks.filter(function(t) {
             var d = new Date(t.fields.updated); d.setHours(0,0,0,0);
             return d.getTime() === todayTmp.getTime();
         });
         if (state.todayRefreshInterval) clearInterval(state.todayRefreshInterval);
         state.todayRefreshInterval = setInterval(function() { fetchTodayChanges(); }, 60000);
         if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
         state.autoRefreshInterval = setInterval(function() { fetchDashboardData(); }, 900000); 
     } catch (error) {
         showToast(error.message, 'error');
     } finally {
         document.getElementById('loadingOverlay').classList.add('hidden');
     }
 }
