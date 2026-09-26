import { state } from './state.js';
import { apiFetch } from './session.js?v=idda13';
import {
    collectActivityDirectionFieldIds,
    collectSelfDisplayFieldIds
} from './model.js?v=idda9';
import { getRehberEvalSnapshot } from './assessments.js?v=idda47';

var NA = 'Məlumat mövcud deyil';
var START_YEAR = 2023;
var SEARCH_FIELDS = [
    'summary', 'status', 'duedate', 'description',
    'customfield_10807', 'customfield_10808',
    'customfield_15611', 'customfield_15612', 'customfield_15613', 'customfield_15614',
    'customfield_15615', 'customfield_15616', 'customfield_15617', 'customfield_15618',
    'customfield_15619', 'customfield_15620',
    'components', 'assignee', 'reporter', 'updated', 'created', 'resolutiondate',
    'priority', 'labels', 'customfield_10101', 'customfield_10107', 'customfield_10008',
    'customfield_10015', 'customfield_10016', 'customfield_12703', 'customfield_13608',
    'customfield_12424',
    'customfield_17311', 'customfield_17312', 'customfield_17313', 'customfield_17314',
    'customfield_17315', 'customfield_17316', 'customfield_17317', 'customfield_17318',
    'customfield_17319', 'customfield_17320', 'customfield_17435',
    'issuetype', 'subtasks', 'parent', 'issuelinks'
];

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function yearTitle(year) {
    var d = Number(year) % 10;
    var suffix = 'ci';
    if (d === 3 || d === 4) suffix = 'cü';
    else if (d === 6) suffix = 'cı';
    else if (d === 9 || d === 0) suffix = 'cu';
    return year + '-' + suffix + ' il üzrə nəticələr';
}

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

function mergeNames(names) {
    if (!names) return;
    var cur = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (Object.prototype.hasOwnProperty.call(names, key) && names[key]) cur[key] = names[key];
    }
    state.jiraFieldNames = cur;
}

function searchFields() {
    var extra = collectActivityDirectionFieldIds().concat(collectSelfDisplayFieldIds());
    var parts = SEARCH_FIELDS.slice();
    var seen = {};
    var i;
    for (i = 0; i < parts.length; i++) seen[parts[i]] = true;
    for (i = 0; i < extra.length; i++) {
        if (extra[i] && !seen[extra[i]]) {
            seen[extra[i]] = true;
            parts.push(extra[i]);
        }
    }
    return parts.join(',');
}

async function postJson(url, body) {
    var res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    var text = await res.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) {
        throw new Error(NA);
    }
    if (!res.ok) throw new Error((data && data.error) || NA);
    return data;
}

async function fetchFieldCatalog() {
    try {
        var data = await postJson('/api/jira/fields', {});
        if (data && data.names) mergeNames(data.names);
    } catch (e) { /* names optional once issues return expand=names */ }
}

async function fetchYearIssues(projectKey, year) {
    var jql = 'project = ' + projectKey
        + ' AND created >= "' + year + '-01-01"'
        + ' AND created < "' + (year + 1) + '-01-01"'
        + ' ORDER BY created ASC';
    var data = await postJson('/api/jira', {
        jql: jql,
        fields: searchFields(),
        projectKey: projectKey
    });
    mergeNames(data && data.names);
    return data && data.issues ? data.issues : [];
}

function indexIssues(issues) {
    state.issueIndex = {};
    state.issueIndexById = {};
    state.parentCache = {};
    (issues || []).forEach(function(t) {
        if (!t || !t.key) return;
        state.issueIndex[t.key] = t;
        if (t.id != null) state.issueIndexById[String(t.id)] = t;
    });
    state.dataEpoch = (state.dataEpoch || 0) + 1;
}

function renderEmptyStats() {
    setText('diagStatDone', NA);
    setText('diagStatProgress', NA);
    setText('diagStatPlanned', NA);
    setText('selfStatChecked', NA);
    setText('selfStatChecking', NA);
    setText('selfStatOngoing', NA);
    var yearGrid = document.getElementById('diagYearGrid');
    if (yearGrid) {
        yearGrid.innerHTML = '<div class="card"><p class="eval-empty">' + esc(NA) + '</p></div>';
    }
    var selfBody = document.getElementById('selfTableBody');
    if (selfBody) {
        selfBody.innerHTML = '<tr><td colspan="3">' + esc(NA) + '</td></tr>';
    }
    var bars = document.getElementById('selfBars');
    if (bars) bars.innerHTML = '<p class="eval-empty">' + esc(NA) + '</p>';
    var note = document.getElementById('selfOngoingNote');
    if (note) {
        note.hidden = true;
        note.textContent = '';
    }
}

function renderYearCard(block) {
    var rowsHtml;
    if (!block.rows.length) {
        rowsHtml = '<tr><td colspan="2">' + esc(NA) + '</td></tr>';
    } else {
        rowsHtml = block.rows.map(function(row) {
            var result = row.hasScore ? row.scoreLabel : row.status;
            var cls = row.hasScore ? ' class="num"' : '';
            return '<tr><td>' + esc(row.qurum) + '</td><td' + cls + '>' + esc(result || NA) + '</td></tr>';
        }).join('');
    }
    var thClass = block.resultHeader === 'Nəticə' ? ' class="num"' : '';
    return '<div class="card">'
        + '<h4 style="font-size:14px;color:var(--navy);margin-bottom:10px;">' + esc(yearTitle(block.year)) + '</h4>'
        + '<div class="table-wrap eval-table-wrap"><table>'
        + '<thead><tr><th>Qurum</th><th' + thClass + '>' + esc(block.resultHeader) + '</th></tr></thead>'
        + '<tbody>' + rowsHtml + '</tbody>'
        + '</table></div></div>';
}

function renderSnapshot(snap) {
    setText('diagStatDone', String(snap.diagStats.done));
    setText('diagStatProgress', String(snap.diagStats.progress));
    setText('diagStatPlanned', String(snap.diagStats.planned));
    setText('selfStatChecked', String(snap.selfStats.checked));
    setText('selfStatChecking', String(snap.selfStats.checking));
    setText('selfStatOngoing', String(snap.selfStats.ongoing));

    var yearGrid = document.getElementById('diagYearGrid');
    if (yearGrid) {
        if (!snap.diagByYear.length) {
            yearGrid.innerHTML = '<div class="card"><p class="eval-empty">' + esc(NA) + '</p></div>';
        } else {
            yearGrid.innerHTML = snap.diagByYear.map(renderYearCard).join('');
        }
    }

    var selfBody = document.getElementById('selfTableBody');
    if (selfBody) {
        if (!snap.selfTable.length) {
            selfBody.innerHTML = '<tr><td colspan="3">' + esc(NA) + '</td></tr>';
        } else {
            selfBody.innerHTML = snap.selfTable.map(function(row) {
                return '<tr><td>' + esc(row.qurum) + '</td><td>' + esc(row.status) + '</td>'
                    + '<td class="num">' + esc(row.scoreLabel) + '</td></tr>';
            }).join('');
        }
    }

    var bars = document.getElementById('selfBars');
    if (bars) {
        if (!snap.selfBars.length) {
            bars.innerHTML = '<p class="eval-empty">' + esc(NA) + '</p>';
        } else {
            var max = snap.selfBars[0].score;
            if (!max) max = 1;
            bars.innerHTML = snap.selfBars.map(function(row) {
                var pct = ((row.score / max) * 100).toFixed(1);
                return '<div class="hbar-row">'
                    + '<div class="lbl" title="' + esc(row.qurum) + '">' + esc(row.qurum) + '</div>'
                    + '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:#B8802A;"></div></div>'
                    + '<div class="v">' + esc(row.scoreLabel) + '</div>'
                    + '</div>';
            }).join('');
        }
    }

    var note = document.getElementById('selfOngoingNote');
    if (note) {
        if (snap.selfOngoing && snap.selfOngoing.length) {
            note.hidden = false;
            note.textContent = 'Özünüqiymətləndirmə prosesi davam edən qurumlar: ' + snap.selfOngoing.join(', ') + '.';
        } else {
            note.hidden = true;
            note.textContent = '';
        }
    }
}

function setLoadHint(text) {
    var el = document.getElementById('evalLoadHint');
    if (!el) return;
    if (!text) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = text;
}

async function loadEvalFromJira() {
    setLoadHint('Jira-dan yüklənir...');
    var cfgRes = await apiFetch('/api/config');
    var cfg = cfgRes.ok ? await cfgRes.json() : {};
    if (cfg.projectKey) state.currentProjectKey = String(cfg.projectKey).toUpperCase();
    if (cfg.homeProjectKey) state.homeProjectKey = String(cfg.homeProjectKey).toUpperCase();
    if (cfg.currentTeam) state.currentTeam = cfg.currentTeam;
    if (typeof cfg.hasToken === 'boolean') state.hasServerToken = !!cfg.hasToken;
    var projectKey = String(state.currentProjectKey || 'DGD').toUpperCase();
    if (!state.hasServerToken) {
        renderEmptyStats();
        setLoadHint('');
        return;
    }
    await fetchFieldCatalog();
    var endYear = new Date().getFullYear();
    var byKey = {};
    var y;
    for (y = START_YEAR; y <= endYear; y++) {
        var chunk = await fetchYearIssues(projectKey, y);
        chunk.forEach(function(iss) {
            if (iss && iss.key) byKey[iss.key] = iss;
        });
    }
    indexIssues(Object.keys(byKey).map(function(k) { return byKey[k]; }));
    renderSnapshot(getRehberEvalSnapshot());
    setLoadHint('');
}

function boot() {
    loadEvalFromJira().catch(function() {
        renderEmptyStats();
        setLoadHint('');
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
