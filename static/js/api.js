import { state } from './state.js';
import { normalizeStr, showToast, toggleSettings } from './utils.js';
import { belongsToDept, hasKomplaynsComponent } from './model.js';
import { applyFilters, loadFiltersFromStorage, populateSprintFilter } from './filters.js';

var DEFAULT_BASE_URL = 'https://jira.idda.az';
var DEFAULT_PROJECT_KEY = 'DGD';
var MAX_RESULTS = 500;
var SEARCH_FIELDS = [
    'summary', 'status', 'duedate',
    'customfield_10807', 'customfield_10808',
    'customfield_15611', 'customfield_15612', 'customfield_15613', 'customfield_15614',
    'customfield_15615', 'customfield_15616', 'customfield_15617', 'customfield_15618',
    'customfield_15619', 'customfield_15620',
    'components', 'assignee', 'reporter', 'updated', 'created', 'resolutiondate',
    'priority', 'labels', 'customfield_10101', 'customfield_10107', 'customfield_10008',
    'customfield_10015', 'customfield_10016', 'customfield_12703', 'customfield_13608',
    'issuetype', 'subtasks', 'parent', 'issuelinks'
].join(',');

function useFlaskProxy() {
    var host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || location.port === '5000';
}

function saveClientCredentials(baseUrl, pat, projectKey) {
    if (baseUrl) localStorage.setItem('jiraBaseUrl', baseUrl);
    if (pat) localStorage.setItem('jiraPat', pat);
    if (projectKey) localStorage.setItem('jiraProjectKey', projectKey);
}

export async function loadServerConfig() {
    var cfg = { baseUrl: DEFAULT_BASE_URL, projectKey: DEFAULT_PROJECT_KEY, hasToken: false };
    if (useFlaskProxy()) {
        try {
            var res = await fetch('/api/config');
            if (res.ok) {
                var remote = await res.json();
                if (remote.baseUrl) cfg.baseUrl = remote.baseUrl;
                if (remote.projectKey) cfg.projectKey = remote.projectKey;
            }
        } catch (e) {
            console.error('Server konfiqi yüklənmədi:', e);
        }
    }
    var baseEl = document.getElementById('baseUrl');
    var projectEl = document.getElementById('projectKey');
    if (cfg.baseUrl && baseEl && !baseEl.value) baseEl.value = cfg.baseUrl;
    if (cfg.projectKey && projectEl && !projectEl.value) projectEl.value = cfg.projectKey;
    return cfg;
}

async function parseJiraError(res, text) {
    try {
        var data = JSON.parse(text);
        throw new Error('Jira API xətası: ' + (data.errorMessages ? data.errorMessages[0] : (data.error || res.status)));
    } catch (e) {
        if (e.message && e.message.indexOf('Jira API xətası') === 0) throw e;
        throw new Error('Jira cavabı JSON deyil: ' + String(text).substring(0, 150));
    }
}

async function fetchJiraDirect(baseUrl, pat, jql, expandChangelog) {
    var root = String(baseUrl || '').replace(/\/+$/, '');
    var allIssues = [];
    var startAt = 0;
    var names = {};
    while (true) {
        var params = new URLSearchParams({
            jql: jql,
            startAt: String(startAt),
            maxResults: String(MAX_RESULTS),
            fields: SEARCH_FIELDS
        });
        if (expandChangelog) params.set('expand', 'changelog');
        var res;
        try {
            res = await fetch(root + '/rest/api/2/search?' + params.toString(), {
                headers: {
                    Authorization: 'Bearer ' + pat,
                    Accept: 'application/json'
                }
            });
        } catch (err) {
            throw new Error('Jira-ya qoşulmaq mümkün olmadı. Ofis şəbəkəsi və ya VPN açıq olmalıdır.');
        }
        var text = await res.text();
        if (!res.ok) await parseJiraError(res, text);
        var data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Jira cavabı JSON deyil: ' + text.substring(0, 150));
        }
        allIssues = allIssues.concat(data.issues || []);
        if (data.names) names = data.names;
        startAt += MAX_RESULTS;
        if (startAt >= (data.total || 0)) break;
    }
    return { issues: allIssues, total: allIssues.length, names: names };
}

async function fetchJiraProxy(baseUrl, pat, jql, expandChangelog) {
    var body = { baseUrl: baseUrl, jql: jql, pat: pat };
    if (expandChangelog) body.expandChangelog = true;
    var res = await fetch('/api/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    var text = await res.text();
    try {
        var data = JSON.parse(text);
        if (!res.ok) throw new Error('Jira API xətası: ' + (data.errorMessages ? data.errorMessages[0] : (data.error || res.status)));
        return data;
    } catch (e) {
        if (e.message && e.message.indexOf('Jira API xətası') === 0) throw e;
        throw new Error('Server cavabı JSON deyil: ' + text.substring(0, 150));
    }
}

export async function fetchJQL(baseUrl, pat, jql, expandChangelog) {
    if (!pat) throw new Error('Yuxarıdakı Token düyməsindən PAT daxil edin.');
    var data = useFlaskProxy()
        ? await fetchJiraProxy(baseUrl, pat, jql, expandChangelog)
        : await fetchJiraDirect(baseUrl, pat, jql, expandChangelog);
    if (data.names) state.jiraFieldNames = data.names;
    return data;
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
    if (!baseUrl || !projectKey || !pat) return;
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

function applyDashboardPayload(data) {
    if (data.names) state.jiraFieldNames = data.names;
    state.allDirections = []; state.allTasks = []; state.issueIndex = {}; state.parentCache = {};
    (data.issues || []).forEach(function(t) {
        state.issueIndex[t.key] = t;
        state.issueIndexById[String(t.id)] = t;
    });
    (data.issues || []).forEach(function(t) {
        var typeName = t.fields.issuetype ? normalizeStr(t.fields.issuetype.name) : '';
        if (!typeName.includes('alt') && (typeName.includes('istiqamət') || typeName.includes('istiqamet') || typeName.includes('epic') || typeName.includes('tədbir') || typeName.includes('tedbir'))) {
            if (hasKomplaynsComponent(t)) {
                state.allDirections.push(t);
            }
            return;
        }
    });
    (data.issues || []).forEach(function(t) {
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
    var todayTmp = new Date(); todayTmp.setHours(0,0,0,0);
    state.todayTasks = state.allTasks.filter(function(t) {
        var d = new Date(t.fields.updated); d.setHours(0,0,0,0);
        return d.getTime() === todayTmp.getTime();
    });
}

export async function fetchDashboardData() {
     var baseUrl = document.getElementById('baseUrl').value;
     var pat = document.getElementById('pat').value;
     var projectKey = document.getElementById('projectKey').value.toUpperCase();
     if (!baseUrl || !projectKey) { toggleSettings(); showToast('Zəhmət olmasa Jira URL və layihə kodunu daxil edin!', 'error'); return; }
     if (!pat) { toggleSettings(); showToast('Yuxarıdakı Token düyməsindən PAT daxil edin.', 'error'); return; }
     saveClientCredentials(baseUrl, pat, projectKey);
     state.currentBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
     document.getElementById('loadingOverlay').classList.remove('hidden');
     try {
         var jql = 'project = ' + projectKey + ' ORDER BY updated DESC';
         var data = await fetchJQL(state.currentBaseUrl, pat, jql);
         applyDashboardPayload(data);
         showToast('Məlumatlar uğurla yeniləndi!', 'success');
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
