import { state } from './state.js';
import { apiFetch, rememberCurrentProject } from './session.js?v=idda17';
import { normalizeStr, showToast, hideSettings, setLoadingOverlayText, stopLoadingTips, markDashboardBooted, beginLoadingOverlay, dismissLoadingOverlay } from './utils.js?v=idda15';
import { belongsToDept, collectActivityDirectionFieldIds, collectMeqsedDisplayFieldIds, collectSelfDisplayFieldIds, collectIsqDisplayFieldIds, collectEsdKindFieldIds, collectEsdStatusFieldIds, collectEsdSentLetterFieldIds, collectReviewPartyFieldIds, collectReviewUnitFieldIds, hasTeamComponent } from './model.js?v=idda26';
import { applyFilters, afterFilterPaint, captureViewState, loadFiltersFromStorage, persistViewState, populateSprintFilter, restoreOpenSections, restoreViewChrome } from './filters.js?v=idda55';

var DEFAULT_BASE_URL = 'https://jira.idda.az';
var DEFAULT_PROJECT_KEY = 'DGD';
var MAX_RESULTS = 500;
var SEARCH_FIELDS = [
    'summary', 'status', 'duedate', 'description',
    'customfield_10807', 'customfield_10808',
    'customfield_15611', 'customfield_15612', 'customfield_15613', 'customfield_15614',
    'customfield_15615', 'customfield_15616', 'customfield_15617', 'customfield_15618',
    'customfield_15619', 'customfield_15620',
    'components', 'assignee', 'reporter', 'updated', 'created', 'resolutiondate',
    'priority', 'labels', 'customfield_10101', 'customfield_10107', 'customfield_10008',
    'customfield_10015', 'customfield_10016', 'customfield_12703', 'customfield_13608',
    'customfield_13611', 'customfield_12424',
    'customfield_17311', 'customfield_17312', 'customfield_17313', 'customfield_17314',
    'customfield_17315', 'customfield_17316', 'customfield_17317', 'customfield_17318',
    'customfield_17319', 'customfield_17320', 'customfield_17435',
    'customfield_17503', 'customfield_17504', 'customfield_17505', 'customfield_17506',
    'customfield_17507', 'customfield_17508', 'customfield_17509', 'customfield_17510',
    'customfield_17511', 'customfield_17512',
    'customfield_17634', 'customfield_17635', 'customfield_17636', 'customfield_17637',
    'customfield_17638', 'customfield_17639',
    'customfield_17439', 'customfield_17632', 'customfield_17706',
    'issuetype', 'subtasks', 'parent', 'issuelinks'
].join(',');

var NETWORK_BLOCK_MSG = 'Jira-ya qoşulmaq mümkün olmadı. Ofis şəbəkəsi və ya VPN açıq olmalıdır.';

function useFlaskProxy() {
    return true;
}

function hasJiraAuth(pat) {
    if (pat || state.hasServerToken) return true;
    // Lokal Flask proxy sessiya ilə serverdəki PAT-i işlədir; hasToken bayrağı
    // köhnə/qüsurlu olsa belə sorğunu serverə buraxırıq.
    return useFlaskProxy();
}

function readInputValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
}

function readPat() {
    return readInputValue('pat');
}

function readBaseUrl() {
    return (readInputValue('baseUrl') || DEFAULT_BASE_URL).replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function readProjectKey() {
    var fromInput = readInputValue('projectKey').toUpperCase();
    var key = fromInput || String(state.currentProjectKey || DEFAULT_PROJECT_KEY).toUpperCase();
    var el = document.getElementById('projectKey');
    if (el && key && el.value !== key) el.value = key;
    return key;
}

function readProxyInput() {
    var el = document.getElementById('proxyUrl');
    return el ? String(el.value || '').trim().replace(/\/+$/, '') : '';
}

function saveClientCredentials(baseUrl, pat, projectKey) {
    if (baseUrl) localStorage.setItem('jiraBaseUrl', baseUrl);
    if (projectKey) localStorage.setItem('jiraProjectKey', projectKey);
    localStorage.removeItem('jiraPat');
    var proxy = readProxyInput();
    if (proxy) localStorage.setItem('jiraProxyUrl', proxy);
    else localStorage.removeItem('jiraProxyUrl');
    try { localStorage.removeItem('jiraChatApiKey'); } catch (e) {}
}

export async function loadServerConfig() {
    var cfg = { baseUrl: DEFAULT_BASE_URL, projectKey: DEFAULT_PROJECT_KEY, hasToken: false, hasChatLlm: false };
    if (useFlaskProxy()) {
        try {
            var res = await apiFetch('/api/config');
            if (res.ok) {
                var remote = await res.json();
                if (remote.baseUrl) cfg.baseUrl = remote.baseUrl;
                if (remote.projectKey) cfg.projectKey = remote.projectKey;
                if (remote.currentProjectKey) cfg.currentProjectKey = remote.currentProjectKey;
                if (remote.currentTeam) cfg.currentTeam = remote.currentTeam;
                if (remote.homeProjectKey) cfg.homeProjectKey = remote.homeProjectKey;
                cfg.hasToken = !!(remote.hasToken || (remote.user && remote.user.hasPat));
                if (remote.hasChatLlm) cfg.hasChatLlm = true;
                if (remote.user) cfg.user = remote.user;
                if (typeof remote.canSeeDiagnostics === 'boolean') cfg.canSeeDiagnostics = remote.canSeeDiagnostics;
                state.hasServerToken = cfg.hasToken;
                if (remote.homeProjectKey) state.homeProjectKey = String(remote.homeProjectKey).toUpperCase();
                if (remote.projectKey) state.currentProjectKey = String(remote.projectKey).toUpperCase();
                if (remote.user) state.currentUser = remote.user;
            }
        } catch (e) {
            console.error('Server konfiqi yüklənmədi:', e);
        }
    }
    var baseEl = document.getElementById('baseUrl');
    var projectEl = document.getElementById('projectKey');
    var proxyEl = document.getElementById('proxyUrl');
    var savedProxy = localStorage.getItem('jiraProxyUrl');
    if (cfg.baseUrl && baseEl && !baseEl.value) baseEl.value = cfg.baseUrl;
    if (cfg.projectKey && projectEl) projectEl.value = cfg.projectKey;
    if (proxyEl && savedProxy && !proxyEl.value) proxyEl.value = savedProxy;
    return cfg;
}

async function pickTransport() {
    if (useFlaskProxy()) return { type: 'proxy', root: '' };
    var saved = readProxyInput() || (localStorage.getItem('jiraProxyUrl') || '').replace(/\/+$/, '');
    if (saved) return { type: 'proxy', root: saved };
    return { type: 'direct' };
}

async function describeDirectFailure() {
    return NETWORK_BLOCK_MSG;
}

function formatJiraFail(res, data) {
    var msg = '';
    if (data && data.errorMessages && data.errorMessages[0]) msg = data.errorMessages[0];
    else if (data && data.error) msg = data.error;
    if (msg) {
        var low = String(msg).toLowerCase();
        if (low.indexOf("does not exist for the field 'project'") !== -1
            || low.indexOf('does not exist for the field "project"') !== -1) {
            return 'Jira layihəni görmür (DGD). Token səhv/bitib ola bilər, və ya bu layihəyə icazəniz yoxdur. Tənzimləmələrdə yeni PAT yazın; KEY-i jira.idda.az URL-indən yoxlayın.';
        }
        return msg;
    }
    if (res && res.status === 401) {
        return 'Jira tokeni səhvdir və ya bitib. Tənzimləmələrdə yeni Personal Access Token yazın.';
    }
    if (res && res.status === 503) {
        return 'Jira müvəqqəti əlçatan deyil (503). Brauzerdə jira.idda.az açın və bir az sonra yenidən yoxlayın.';
    }
    return 'Jira API xətası: ' + ((res && res.status) || 'naməlum');
}

async function parseJiraError(res, text) {
    try {
        var data = JSON.parse(text);
        throw new Error(formatJiraFail(res, data));
    } catch (e) {
        if (e && e.message && (e.message.indexOf('Jira') === 0 || e.message.indexOf('HTTP') === 0)) throw e;
        if (res && res.status === 503) {
            throw new Error('Jira müvəqqəti əlçatan deyil (503). Brauzerdə jira.idda.az açın və bir az sonra yenidən yoxlayın.');
        }
        throw new Error('Jira cavabı JSON deyil: ' + String(text).substring(0, 150));
    }
}

function searchFieldsList() {
    var extra = collectActivityDirectionFieldIds()
        .concat(collectMeqsedDisplayFieldIds())
        .concat(collectSelfDisplayFieldIds())
        .concat(collectIsqDisplayFieldIds())
        .concat(collectEsdKindFieldIds())
        .concat(collectEsdStatusFieldIds())
        .concat(collectEsdSentLetterFieldIds())
        .concat(collectReviewPartyFieldIds())
        .concat(collectReviewUnitFieldIds());
    var parts = SEARCH_FIELDS.split(',');
    var seen = {};
    var i;
    for (i = 0; i < parts.length; i++) seen[parts[i]] = true;
    for (i = 0; i < extra.length; i++) {
        if (extra[i] && !seen[extra[i]]) parts.push(extra[i]);
    }
    return parts.join(',');
}

function mergeFieldNames(names) {
    if (!names) return;
    var cur = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (Object.prototype.hasOwnProperty.call(names, key) && names[key]) cur[key] = names[key];
    }
    state.jiraFieldNames = cur;
}

async function fetchJiraFieldCatalog(baseUrl, pat) {
    if (fetchJiraFieldCatalog.loaded) return;
    var transport = await pickTransport();
    try {
        var data;
        if (transport.type === 'proxy') {
            var res = await apiFetch((transport.root || '') + '/api/jira/fields', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl: baseUrl, pat: pat })
            });
            var text = await res.text();
            data = JSON.parse(text);
            if (!res.ok) return;
        } else {
            var root = String(baseUrl || '').replace(/\/+$/, '');
            var res2 = await fetch(root + '/rest/api/2/field', {
                headers: {
                    Authorization: 'Bearer ' + pat,
                    Accept: 'application/json'
                }
            });
            if (!res2.ok) return;
            var list = await res2.json();
            var names = {};
            if (Array.isArray(list)) {
                list.forEach(function(item) {
                    if (item && item.id && item.name) names[item.id] = item.name;
                });
            }
            data = { names: names };
        }
        if (data && data.names) {
            mergeFieldNames(data.names);
            fetchJiraFieldCatalog.loaded = true;
        }
    } catch (e) { /* catalog is optional; search still runs */ }
}

async function fetchJiraDirect(baseUrl, pat, jql, expandChangelog, fieldsOverride) {
    var root = String(baseUrl || '').replace(/\/+$/, '');
    var allIssues = [];
    var startAt = 0;
    var names = {};
    var fields = fieldsOverride || searchFieldsList();
    while (true) {
        var params = new URLSearchParams({
            jql: jql,
            startAt: String(startAt),
            maxResults: String(MAX_RESULTS),
            fields: fields
        });
        params.set('expand', expandChangelog ? 'names,changelog' : 'names');
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
        if (data.names) {
            var nk;
            for (nk in data.names) {
                if (Object.prototype.hasOwnProperty.call(data.names, nk)) names[nk] = data.names[nk];
            }
        }
        startAt += MAX_RESULTS;
        if (startAt >= (data.total || 0)) break;
    }
    return { issues: allIssues, total: allIssues.length, names: names };
}

async function fetchJiraProxy(baseUrl, pat, jql, expandChangelog, proxyRoot, fieldsOverride) {
    var projectEl = document.getElementById('projectKey');
    var body = {
        baseUrl: baseUrl,
        jql: jql,
        pat: pat,
        fields: fieldsOverride || searchFieldsList(),
        projectKey: projectEl ? String(projectEl.value || '').trim().toUpperCase() : ''
    };
    if (expandChangelog) body.expandChangelog = true;
    var url = (proxyRoot || '') + '/api/jira';
    var res;
    try {
        res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new Error('Lokal proxy-ə qoşulmaq mümkün olmadı (' + (proxyRoot || '/api/jira') + '). python app.py işləyirmi?');
    }
    var text = await res.text();
    var data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('Server cavabı JSON deyil: ' + String(text).substring(0, 150));
    }
    if (!res.ok) throw new Error(formatJiraFail(res, data));
    return data;
}

var jqlInflight = {};
var lastJqlCache = { key: '', data: null };

export async function fetchJQL(baseUrl, pat, jql, expandChangelog, fieldsOverride) {
    if (!hasJiraAuth(pat)) throw new Error('Jira hələ qurulmayıb.');
    await fetchJiraFieldCatalog(baseUrl, pat);
    var fieldsKey = fieldsOverride || searchFieldsList();
    var cacheKey = String(baseUrl || '') + '\n' + String(jql || '') + '\n' + (expandChangelog ? '1' : '0') + '\n' + fieldsKey;
    if (jqlInflight[cacheKey]) return jqlInflight[cacheKey];
    if (!expandChangelog && !fieldsOverride && lastJqlCache.key === cacheKey && lastJqlCache.data) return lastJqlCache.data;
    var run = (async function() {
        var transport = await pickTransport();
        var data;
        try {
            data = transport.type === 'proxy'
                ? await fetchJiraProxy(baseUrl, pat, jql, expandChangelog, transport.root, fieldsOverride)
                : await fetchJiraDirect(baseUrl, pat, jql, expandChangelog, fieldsOverride);
        } catch (err) {
            var msg = err && err.message ? err.message : '';
            if (transport.type === 'direct' && msg.indexOf('qoşulmaq mümkün olmadı') !== -1) {
                throw new Error(await describeDirectFailure());
            }
            throw err;
        }
        if (data.names) mergeFieldNames(data.names);
        if (!expandChangelog && !fieldsOverride) {
            lastJqlCache.key = cacheKey;
            lastJqlCache.data = data;
        }
        return data;
    })();
    jqlInflight[cacheKey] = run;
    try {
        return await run;
    } finally {
        delete jqlInflight[cacheKey];
    }
}

var changelogPending = {};

function pad2(n) {
    return (n < 10 ? '0' : '') + String(n);
}

var JIRA_SEARCH_SOFT_CAP = 1000;
var ASSESS_DATA_START_YEAR = 2023;
var FETCH_YEAR_CONCURRENCY = 2;
var FETCH_MONTH_CONCURRENCY = 3;
var CHANGELOG_CHUNK_CONCURRENCY = 2;
var CHANGELOG_MAX_KEYS_PER_PASS = 80;
var TODAY_POLL_MS = 120000;
var AUTO_REFRESH_MS = 900000;

/** Run async workers over items with a concurrency cap (keeps UI responsive). */
async function mapPool(items, limit, worker) {
    var list = items || [];
    var results = new Array(list.length);
    var cursor = 0;
    var n = Math.max(1, Math.min(limit || 2, list.length || 1));
    async function runOne() {
        while (cursor < list.length) {
            var i = cursor++;
            results[i] = await worker(list[i], i);
        }
    }
    var runners = [];
    var r;
    for (r = 0; r < n; r++) runners.push(runOne());
    await Promise.all(runners);
    return results;
}

function mergeIssueBatch(byKey, names, data) {
    (data.issues || []).forEach(function(iss) {
        if (iss && iss.key) byKey[iss.key] = iss;
    });
    if (!data.names) return;
    var k;
    for (k in data.names) {
        if (Object.prototype.hasOwnProperty.call(data.names, k)) names[k] = data.names[k];
    }
}

function createdSpanJql(projectKey, startIso, endExclusiveIso) {
    return 'project = ' + projectKey
        + ' AND created >= "' + startIso + '"'
        + ' AND created < "' + endExclusiveIso + '"'
        + ' ORDER BY created ASC';
}

function openSprintJql(projectKey) {
    return 'project = ' + projectKey
        + ' AND sprint in openSprints()'
        + ' ORDER BY updated DESC';
}

async function fetchCreatedSpan(baseUrl, pat, projectKey, startIso, endExclusiveIso) {
    return fetchJQL(baseUrl, pat, createdSpanJql(projectKey, startIso, endExclusiveIso));
}

/** Cari (aktiv) sprint — panelı tez açmaq üçün kiçik ilk paket. */
async function fetchOpenSprintIssues(baseUrl, pat, projectKey) {
    return fetchJQL(baseUrl, pat, openSprintJql(projectKey));
}

async function fetchRecentMonthsIssues(baseUrl, pat, projectKey, monthCount) {
    var n = Math.max(1, monthCount || 2);
    var now = new Date();
    var endY = now.getFullYear();
    var endM = now.getMonth() + 1;
    var start = new Date(endY, endM - n, 1);
    var startIso = start.getFullYear() + '-' + pad2(start.getMonth() + 1) + '-01';
    var endIso = endY + '-' + pad2(endM) + '-' + pad2(now.getDate());
    return fetchIssuesCreatedRange(baseUrl, pat, projectKey, startIso, endIso);
}

/** İlk boyama: openSprints; boş/xəta olsa son 2 ay. */
async function fetchFirstPaintIssues(baseUrl, pat, projectKey) {
    try {
        var sprintChunk = await fetchOpenSprintIssues(baseUrl, pat, projectKey);
        if ((sprintChunk.issues || []).length) return { data: sprintChunk, source: 'sprint' };
    } catch (err) { /* fallback aşağıda */ }
    try {
        var recent = await fetchRecentMonthsIssues(baseUrl, pat, projectKey, 2);
        if ((recent.issues || []).length) return { data: recent, source: 'recent' };
    } catch (err2) { /* fallback cari il */ }
    var yearChunk = await fetchCreatedYear(baseUrl, pat, projectKey, new Date().getFullYear());
    return { data: yearChunk, source: 'year' };
}

var bgHydrateGen = 0;

/**
 * Cari sprint göstərildikdən sonra qalan illəri səssiz yüklə.
 * Progress bar / overlay yox — istifadəçi hiss etməsin.
 */
function scheduleBackgroundHydration(baseUrl, pat, projectKey, endYear, firstSource) {
    var gen = ++bgHydrateGen;
    state.dashboardBgHydrateBusy = true;
    var bgYears = [];
    var y;
    if (firstSource !== 'year') bgYears.push(endYear);
    for (y = endYear - 1; y >= ASSESS_DATA_START_YEAR; y--) bgYears.push(y);
    if (!bgYears.length) {
        state.dashboardBgHydrateBusy = false;
        markPartialLoadDone();
        return;
    }
    setTimeout(function() {
        (async function() {
            var selectedBefore = '';
            try {
                var sf = document.getElementById('sprintFilter');
                selectedBefore = sf ? String(sf.value || '') : '';
            } catch (eSel) { selectedBefore = ''; }
            try {
                await mapPool(bgYears, FETCH_YEAR_CONCURRENCY, async function(year) {
                    if (gen !== bgHydrateGen) return;
                    var chunk = await fetchCreatedYear(baseUrl, pat, projectKey, year);
                    if (gen !== bgHydrateGen) return;
                    mergeFetchedIssues(chunk, { skipDashboardRefresh: true });
                });
                if (gen !== bgHydrateGen) return;
                var snap = null;
                try { snap = captureViewState(); } catch (eSnap) { snap = null; }
                state.restoreQuiet = true;
                rebuildDashboardListsFromIndex();
                bumpDataEpoch();
                populateSprintFilter();
                if (selectedBefore) {
                    try {
                        var sprintEl = document.getElementById('sprintFilter');
                        if (sprintEl && Array.from(sprintEl.options).some(function(o) { return o.value === selectedBefore; })) {
                            sprintEl.value = selectedBefore;
                        }
                    } catch (eKeep) {}
                }
                markPartialLoadDone();
                applyFilters();
                afterFilterPaint(function() {
                    if (snap) restoreViewChrome(snap);
                    state.restoreQuiet = false;
                });
                setTimeout(function() { state.restoreQuiet = false; }, 1500);
                if (typeof window.syncNk303Route === 'function') window.syncNk303Route();
            } catch (err) {
                state.restoreQuiet = false;
                if (gen === bgHydrateGen) markPartialLoadDone();
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('Background hydrate:', err && err.message ? err.message : err);
                }
            } finally {
                if (gen === bgHydrateGen) {
                    state.dashboardBgHydrateBusy = false;
                    markPartialLoadDone();
                }
            }
        })();
    }, 0);
}

function cancelBackgroundHydration() {
    bgHydrateGen += 1;
    state.dashboardBgHydrateBusy = false;
}

function markPartialLoadDone() {
    state.dashboardPartialLoad = false;
}

/** Son N gün yenilənən işlər — köhnə illərin status/sprint dəyişikliyini tutur. */
async function fetchRecentlyUpdated(baseUrl, pat, projectKey, days) {
    var n = Math.max(1, Math.min(days || 14, 60));
    var jql = 'project = ' + projectKey
        + ' AND updated >= -' + n + 'd'
        + ' ORDER BY updated DESC';
    return fetchJQL(baseUrl, pat, jql);
}

async function fetchCreatedYear(baseUrl, pat, projectKey, year) {
    var startIso = year + '-01-01';
    var endExclusiveIso = (year + 1) + '-01-01';
    var data;
    try {
        data = await fetchCreatedSpan(baseUrl, pat, projectKey, startIso, endExclusiveIso);
    } catch (err) {
        return fetchCreatedYearByMonth(baseUrl, pat, projectKey, year);
    }
    if ((data.issues || []).length >= JIRA_SEARCH_SOFT_CAP) {
        return fetchCreatedYearByMonth(baseUrl, pat, projectKey, year);
    }
    return data;
}

async function fetchCreatedYearByMonth(baseUrl, pat, projectKey, year) {
    var byKey = {};
    var names = {};
    var months = [];
    var m;
    for (m = 1; m <= 12; m++) months.push(m);
    await mapPool(months, FETCH_MONTH_CONCURRENCY, async function(month) {
        var startIso = year + '-' + pad2(month) + '-01';
        var endExclusiveIso = month === 12
            ? ((year + 1) + '-01-01')
            : (year + '-' + pad2(month + 1) + '-01');
        var chunk = await fetchCreatedSpan(baseUrl, pat, projectKey, startIso, endExclusiveIso);
        mergeIssueBatch(byKey, names, chunk);
    });
    var issues = Object.keys(byKey).map(function(k) { return byKey[k]; });
    return { issues: issues, total: issues.length, names: names };
}

function addDaysIso(iso, days) {
    var p = String(iso || '').split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function monthStartIso(year, month) {
    return year + '-' + pad2(month) + '-01';
}

function nextMonthStartIso(year, month) {
    if (month === 12) return (year + 1) + '-01-01';
    return year + '-' + pad2(month + 1) + '-01';
}

async function fetchCreatedRangeByMonth(baseUrl, pat, projectKey, startIso, endIsoInclusive) {
    var byKey = {};
    var names = {};
    var endExclusive = addDaysIso(endIsoInclusive, 1);
    var y = Number(startIso.slice(0, 4));
    var m = Number(startIso.slice(5, 7));
    var endY = Number(endIsoInclusive.slice(0, 4));
    var endM = Number(endIsoInclusive.slice(5, 7));
    var spans = [];
    var guard = 0;
    while (y < endY || (y === endY && m <= endM)) {
        var spanStart = monthStartIso(y, m);
        if (spanStart < startIso) spanStart = startIso;
        var spanEndEx = nextMonthStartIso(y, m);
        if (spanEndEx > endExclusive) spanEndEx = endExclusive;
        if (spanStart < spanEndEx) spans.push({ start: spanStart, end: spanEndEx });
        m += 1;
        if (m > 12) { m = 1; y += 1; }
        guard += 1;
        if (guard > 240) break;
    }
    await mapPool(spans, FETCH_MONTH_CONCURRENCY, async function(span) {
        var chunk = await fetchCreatedSpan(baseUrl, pat, projectKey, span.start, span.end);
        mergeIssueBatch(byKey, names, chunk);
    });
    var issues = Object.keys(byKey).map(function(k) { return byKey[k]; });
    return { issues: issues, total: issues.length, names: names };
}

export async function fetchIssuesCreatedRange(baseUrl, pat, projectKey, startIso, endIsoInclusive) {
    var endExclusive = addDaysIso(endIsoInclusive, 1);
    var data;
    try {
        data = await fetchCreatedSpan(baseUrl, pat, projectKey, startIso, endExclusive);
    } catch (err) {
        return fetchCreatedRangeByMonth(baseUrl, pat, projectKey, startIso, endIsoInclusive);
    }
    if ((data.issues || []).length >= JIRA_SEARCH_SOFT_CAP) {
        return fetchCreatedRangeByMonth(baseUrl, pat, projectKey, startIso, endIsoInclusive);
    }
    return data;
}

function setRefreshButtonSpinning(on) {
    var btn = document.getElementById('refreshDashboardBtn');
    if (!btn) return;
    btn.classList.toggle('is-spinning', !!on);
    if (on) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
}

function setDataLoadProgress(text, pct) {
    var el = document.getElementById('dataLoadProgress');
    if (!text) {
        if (el) {
            el.classList.add('hidden');
            el.style.removeProperty('--load-pct');
            var label = el.querySelector('.app-data-progress-text');
            if (label) label.textContent = '';
            else el.textContent = '';
        }
        return;
    }
    if (!el) {
        el = document.createElement('div');
        el.id = 'dataLoadProgress';
        el.className = 'app-data-progress';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<span class="app-data-progress-text"></span>';
        document.body.appendChild(el);
    }
    var label = el.querySelector('.app-data-progress-text');
    if (!label) {
        el.innerHTML = '<span class="app-data-progress-text"></span>';
        label = el.querySelector('.app-data-progress-text');
    }
    label.textContent = text;
    if (typeof pct === 'number' && !isNaN(pct)) {
        el.style.setProperty('--load-pct', Math.max(8, Math.min(100, pct)) + '%');
    }
    el.classList.remove('hidden');
}

async function fetchDashboardIssues(baseUrl, pat, projectKey) {
    var endYear = new Date().getFullYear();
    var byKey = {};
    var names = {};
    var years = [];
    var y;
    for (y = ASSESS_DATA_START_YEAR; y <= endYear; y++) years.push(y);
    await mapPool(years, FETCH_YEAR_CONCURRENCY, async function(year) {
        var chunk = await fetchCreatedYear(baseUrl, pat, projectKey, year);
        mergeIssueBatch(byKey, names, chunk);
    });
    var issues = Object.keys(byKey).map(function(k) { return byKey[k]; });
    return { issues: issues, total: issues.length, names: names };
}

export async function ensureChangelogs(tasks) {
    var missing = (tasks || []).filter(function(t) {
        return t && t.key && !t.changelog && !changelogPending[t.key];
    });
    if (!missing.length) return false;
    /* Cap per pass so opening Daily Activity does not stall the UI. */
    if (missing.length > CHANGELOG_MAX_KEYS_PER_PASS) {
        missing = missing.slice(0, CHANGELOG_MAX_KEYS_PER_PASS);
    }
    missing.forEach(function(t) { changelogPending[t.key] = true; });
    try {
        var baseUrl = state.currentBaseUrl;
        var pat = readPat();
        var chunkSize = 40;
        var chunks = [];
        var i;
        for (i = 0; i < missing.length; i += chunkSize) {
            chunks.push(missing.slice(i, i + chunkSize));
        }
        await mapPool(chunks, CHANGELOG_CHUNK_CONCURRENCY, async function(chunk) {
            var jql = 'key in (' + chunk.map(function(t) { return t.key; }).join(',') + ')';
            var data = await fetchJQL(baseUrl, pat, jql, true);
            (data.issues || []).forEach(function(fresh) {
                var existing = state.issueIndex[fresh.key];
                if (existing) existing.changelog = fresh.changelog || { histories: [] };
            });
        });
        missing.forEach(function(t) {
            var existing = state.issueIndex[t.key];
            if (existing && !existing.changelog) existing.changelog = { histories: [] };
        });
        return true;
    } finally {
        missing.forEach(function(t) { delete changelogPending[t.key]; });
    }
}

function mergeFreshIssue(fresh) {
    if (!fresh || !fresh.key) return;
    var existing = state.issueIndex[fresh.key] || (state.allTasks || []).filter(function(t) { return t && t.key === fresh.key; })[0];
    if (!existing) {
        state.issueIndex[fresh.key] = fresh;
        return;
    }
    if (fresh.fields) {
        existing.fields = Object.assign({}, existing.fields || {}, fresh.fields);
    }
    if (fresh.changelog) existing.changelog = fresh.changelog;
    state.issueIndex[fresh.key] = existing;
    var idx = (state.allTasks || []).findIndex(function(t) { return t && t.key === fresh.key; });
    if (idx !== -1) state.allTasks[idx] = existing;
}

/** Aylıq hesabat üçün mərhələ sahələri + comment + changelog-u token ilə yeniləyir. */
export async function ensureReportEnrichment(tasks) {
    var list = (tasks || []).filter(function(t) { return t && t.key; });
    if (!list.length) return { ok: false, keys: 0, comments: 0 };
    if (!hasJiraAuth(readPat()) && !state.hasServerToken) {
        throw new Error('Jira tokeni yoxdur. Aylıq hesabat üçün Tənzimləmələrdə API token daxil edin.');
    }
    var baseUrl = state.currentBaseUrl || readBaseUrl();
    var pat = readPat();
    var keys = [];
    var seen = {};
    list.forEach(function(t) {
        if (!t.key || seen[t.key]) return;
        seen[t.key] = true;
        keys.push(t.key);
    });
    var fields = searchFieldsList();
    if ((',' + fields + ',').indexOf(',comment,') === -1) fields += ',comment';
    var chunkSize = 30;
    var touched = 0;
    for (var i = 0; i < keys.length; i += chunkSize) {
        var chunk = keys.slice(i, i + chunkSize);
        var jql = 'key in (' + chunk.join(',') + ')';
        var data = await fetchJQL(baseUrl, pat, jql, true, fields);
        (data.issues || []).forEach(function(fresh) {
            mergeFreshIssue(fresh);
            touched += 1;
        });
    }
    var commentHits = 0;
    try {
        var transport = await pickTransport();
        var url = (transport.root || '') + '/api/jira/comments';
        for (var j = 0; j < keys.length; j += 40) {
            var cChunk = keys.slice(j, j + 40);
            var res = await apiFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl: baseUrl, pat: pat, keys: cChunk })
            });
            if (!res.ok) continue;
            var payload = await res.json();
            var map = (payload && payload.comments) || {};
            Object.keys(map).forEach(function(key) {
                var existing = state.issueIndex[key];
                if (!existing) return;
                if (!existing.fields) existing.fields = {};
                existing.fields.comment = {
                    comments: map[key] || [],
                    total: (map[key] || []).length
                };
                commentHits += (map[key] || []).length;
            });
        }
    } catch (err) {
        console.warn('Comment enrichment failed', err);
    }
    return { ok: true, keys: keys.length, refreshed: touched, comments: commentHits };
}

state.ensureChangelogs = ensureChangelogs;
state.ensureReportEnrichment = ensureReportEnrichment;

export async function fetchTodayChanges() {
    var baseUrl = readBaseUrl();
    var pat = readPat();
    var projectKey = readProjectKey();
    if (!baseUrl || !projectKey || !hasJiraAuth(pat)) return;
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
            if (idx !== -1) { state.allTasks[idx] = t; updatedCount++; }
            else { state.allTasks.unshift(t); updatedCount++; }
        });
        if (updatedCount > 0) {
            var snap = captureViewState();
            state.restoreQuiet = true;
            applyFilters();
            afterFilterPaint(function() {
                restoreViewChrome(snap);
                state.restoreQuiet = false;
            });
        }
    } catch (error) {
        console.error('Bugünkü dəyişikliklər yüklənmədi:', error);
    }
}

function isDashboardDirectionType(typeName) {
    return !typeName.includes('alt') && (
        typeName.includes('istiqamət') || typeName.includes('istiqamet')
        || typeName.includes('epic') || typeName.includes('tədbir') || typeName.includes('tedbir')
    );
}

function indexIssue(t) {
    if (!t || !t.key) return;
    state.issueIndex[t.key] = t;
    if (t.id != null) state.issueIndexById[String(t.id)] = t;
}

function rebuildDashboardListsFromIndex() {
    state.allDirections = [];
    state.allTasks = [];
    state.parentCache = {};
    var keys = Object.keys(state.issueIndex);
    var i;
    for (i = 0; i < keys.length; i++) {
        var t = state.issueIndex[keys[i]];
        if (!t || !t.fields) continue;
        var typeName = t.fields.issuetype ? normalizeStr(t.fields.issuetype.name) : '';
        if (isDashboardDirectionType(typeName) && hasTeamComponent(t)) {
            state.allDirections.push(t);
        }
    }
    for (i = 0; i < keys.length; i++) {
        var t2 = state.issueIndex[keys[i]];
        if (!t2 || !t2.fields) continue;
        var typeName2 = t2.fields.issuetype ? normalizeStr(t2.fields.issuetype.name) : '';
        if (isDashboardDirectionType(typeName2)) continue;
        var assigneeName = t2.fields.assignee ? normalizeStr(t2.fields.assignee.displayName) : '';
        var isExcluded = state.EXCLUDED_USERS.some(function(ex) { return assigneeName.includes(ex); });
        if (isExcluded) continue;
        if (state.STRUCTURE_TYPES.includes(typeName2)) continue;
        if (!belongsToDept(t2)) continue;
        state.allTasks.push(t2);
    }
}

function refreshTodayTasks() {
    var todayTmp = new Date(); todayTmp.setHours(0, 0, 0, 0);
    state.todayTasks = state.allTasks.filter(function(t) {
        if (!t || !t.fields || !t.fields.updated) return false;
        var d = new Date(t.fields.updated); d.setHours(0, 0, 0, 0);
        return d.getTime() === todayTmp.getTime();
    });
    if (typeof state.syncAiBotNotify === 'function') {
        try { state.syncAiBotNotify(); } catch (e) {}
    }
}

function bumpDataEpoch() {
    state.dataEpoch = (state.dataEpoch || 0) + 1;
}

function applyDashboardPayload(data, opts) {
    opts = opts || {};
    if (data.names) mergeFieldNames(data.names);
    state.issueIndex = {};
    state.issueIndexById = {};
    state.parentCache = {};
    (data.issues || []).forEach(indexIssue);
    rebuildDashboardListsFromIndex();
    bumpDataEpoch();
    if (!opts.silent) {
        hideSettings();
    }
    populateSprintFilter();
    loadFiltersFromStorage();
    applyFilters();
    refreshTodayTasks();
    state.hasLoadedDashboard = true;
}

export function applyTeamScope() {
    if (!state.hasLoadedDashboard) return;
    rebuildDashboardListsFromIndex();
    bumpDataEpoch();
    populateSprintFilter();
    applyFilters();
    refreshTodayTasks();
    if (typeof window.renderAssessmentSections === 'function') {
        try { window.renderAssessmentSections(); } catch (e) {}
    }
}

function mergeFetchedIssues(data, opts) {
    if (data.names) mergeFieldNames(data.names);
    (data.issues || []).forEach(function(t) {
        if (!t || !t.key) return;
        var prev = state.issueIndex[t.key];
        if (prev && prev.changelog && !t.changelog) t.changelog = prev.changelog;
        indexIssue(t);
    });
    state.parentCache = {};
    bumpDataEpoch();
    if (opts && opts.skipDashboardRefresh) return;
    rebuildDashboardListsFromIndex();
    refreshTodayTasks();
    applyFilters();
}

function readDashboardCredentials() {
    return { baseUrl: readBaseUrl(), pat: readPat(), projectKey: readProjectKey() };
}

export async function loadAssessmentCreatedRange(startIso, endIso) {
    var creds = readDashboardCredentials();
    if (!creds.baseUrl || !creds.projectKey) {
        showToast('Jira hələ qurulmayıb. Öz Jira tokeninizi daxil olanda və ya Tənzimləmələrdə yazın.', 'error');
        return false;
    }
    if (!hasJiraAuth(creds.pat)) {
        showToast('Jira hələ qurulmayıb. Öz Jira tokeninizi daxil olanda və ya Tənzimləmələrdə yazın.', 'error');
        return false;
    }
    saveClientCredentials(creds.baseUrl, creds.pat, creds.projectKey);
    state.currentBaseUrl = creds.baseUrl.endsWith('/') ? creds.baseUrl.slice(0, -1) : creds.baseUrl;
    var sectionLoading = document.getElementById('assessSectionLoading');
    if (sectionLoading) {
        sectionLoading.classList.remove('hidden');
        sectionLoading.removeAttribute('hidden');
        sectionLoading.setAttribute('aria-busy', 'true');
    }
    try {
        var data = await fetchIssuesCreatedRange(state.currentBaseUrl, creds.pat, creds.projectKey, startIso, endIso);
        mergeFetchedIssues(data, { skipDashboardRefresh: true });
        return true;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    } finally {
        if (sectionLoading) {
            sectionLoading.classList.add('hidden');
            sectionLoading.setAttribute('hidden', '');
            sectionLoading.setAttribute('aria-busy', 'false');
        }
    }
}

export async function fetchDashboardData(opts) {
     opts = opts || {};
     var silent = !!opts.silent;
     if (state.dashboardFetchBusy) return;
     var baseUrl = readBaseUrl();
     var pat = readPat();
     var projectKey = readProjectKey();
     if (!baseUrl || !projectKey) { showToast('Jira hələ qurulmayıb. Öz Jira tokeninizi daxil olanda və ya Tənzimləmələrdə yazın.', 'error'); return; }
     if (!hasJiraAuth(pat)) { showToast('Jira hələ qurulmayıb. Öz Jira tokeninizi daxil olanda və ya Tənzimləmələrdə yazın.', 'error'); return; }
     saveClientCredentials(baseUrl, pat, projectKey);
     await rememberCurrentProject();
     state.currentBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
     cancelBackgroundHydration();
     state.dashboardFetchBusy = true;
     var firstLoad = !state.hasLoadedDashboard;
     var snap = firstLoad ? null : captureViewState();
     if (!firstLoad) {
         state.listViewAction = snap.listViewAction || state.listViewAction;
         if (snap.taskListView) state.taskListView = snap.taskListView;
         if (typeof snap.taskListSearch === 'string') state.taskListSearch = snap.taskListSearch;
         if (snap.currentPage) state.currentPage = snap.currentPage;
         state.restoreQuiet = true;
         restoreOpenSections(snap);
     }
     var overlay = document.getElementById('loadingOverlay');
     var endYear = new Date().getFullYear();
     var progressive = firstLoad && !silent;
     var overlayDismissed = false;
     if (!silent) {
         var bootMsg = progressive
             ? 'Cari sprint yüklənir…'
             : 'Panelı təzələyirəm…';
         beginLoadingOverlay(overlay, bootMsg);
         setRefreshButtonSpinning(true);
     }
     try {
         lastJqlCache.key = '';
         lastJqlCache.data = null;
         if (progressive) {
             /* İlk açılış: cari sprint → UI açılsın; qalanı istifadəçi görmədən arxa planda */
             state.dashboardPartialLoad = true;
             var firstPaint = await fetchFirstPaintIssues(state.currentBaseUrl, pat, projectKey);
             applyDashboardPayload(firstPaint.data, { silent: silent });
             setRefreshButtonSpinning(false);
             await dismissLoadingOverlay(overlay, { reveal: true });
             overlayDismissed = true;
             if (typeof window.syncNk303Route === 'function') window.syncNk303Route();
             if (!state.todayRefreshInterval) {
                 state.todayRefreshInterval = setInterval(function() { fetchTodayChanges(); }, TODAY_POLL_MS);
             }
             if (!state.autoRefreshInterval) {
                 state.autoRefreshInterval = setInterval(function() { fetchDashboardData({ silent: true }); }, AUTO_REFRESH_MS);
             }
             afterFilterPaint(function() {
                 if (snap) restoreViewChrome(snap);
                 persistViewState();
                 state.restoreQuiet = false;
             });
             setTimeout(function() { state.restoreQuiet = false; }, 2000);
             /* Qalan illər — overlay/progress olmadan arxa planda */
             scheduleBackgroundHydration(
                 state.currentBaseUrl, pat, projectKey, endYear, firstPaint.source
             );
         } else if (silent) {
             /* Arxa plan: cari il + son 14 gün yenilənənlər (köhnə illər də yenilənsin) */
             var silentChunk = await fetchCreatedYear(state.currentBaseUrl, pat, projectKey, endYear);
             mergeFetchedIssues(silentChunk);
             try {
                 var recentUpd = await fetchRecentlyUpdated(
                     state.currentBaseUrl, pat, projectKey, 14
                 );
                 mergeFetchedIssues(recentUpd);
             } catch (eSilentUpd) {
                 if (typeof console !== 'undefined' && console.warn) {
                     console.warn('Silent updated refresh:', eSilentUpd && eSilentUpd.message
                         ? eSilentUpd.message : eSilentUpd);
                 }
             }
         } else {
             /* Manual Yenilə: paralel illər */
             var data = await fetchDashboardIssues(state.currentBaseUrl, pat, projectKey);
             applyDashboardPayload(data, { silent: silent });
             await dismissLoadingOverlay(overlay, { reveal: true });
             overlayDismissed = true;
             showToast('Məlumatlar uğurla yeniləndi!', 'success');
             if (typeof window.syncNk303Route === 'function') window.syncNk303Route();
             if (!state.todayRefreshInterval) {
                 state.todayRefreshInterval = setInterval(function() { fetchTodayChanges(); }, TODAY_POLL_MS);
             }
             if (!state.autoRefreshInterval) {
                 state.autoRefreshInterval = setInterval(function() { fetchDashboardData({ silent: true }); }, AUTO_REFRESH_MS);
             }
             afterFilterPaint(function() {
                 if (snap) restoreViewChrome(snap);
                 persistViewState();
                 state.restoreQuiet = false;
             });
             setTimeout(function() { state.restoreQuiet = false; }, 2000);
         }
     } catch (error) {
         state.restoreQuiet = false;
         markPartialLoadDone();
         setDataLoadProgress('');
         if (!overlayDismissed && !silent) {
             await dismissLoadingOverlay(overlay, { reveal: false });
             overlayDismissed = true;
         } else {
             stopLoadingTips();
             markDashboardBooted();
         }
         showToast(error.message, 'error');
     } finally {
         state.dashboardFetchBusy = false;
         setDataLoadProgress('');
         stopLoadingTips();
         setLoadingOverlayText('AI Done işə düşür…');
         if (!overlayDismissed && overlay && !silent) {
             overlay.classList.add('hidden');
             overlay.classList.remove('is-fading');
             document.body.classList.remove('is-loading');
             var bootRoot = document.getElementById('done-bot');
             if (bootRoot && bootRoot.classList.contains('is-boot-hero') && window.DoneBot && window.DoneBot.exitBootHero) {
                 window.DoneBot.exitBootHero(function() {});
             }
         }
         setRefreshButtonSpinning(false);
         if (!document.body.classList.contains('is-ready')) markDashboardBooted();
     }
}
