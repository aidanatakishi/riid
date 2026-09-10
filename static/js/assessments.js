import { state } from './state.js';
import { normalizeStr, showToast } from './utils.js';
import {
    classifyAssessmentCategory,
    formatAssessmentFieldText,
    getAssessmentQurumLabel,
    getAssessmentTaskTime,
    getAssessmentYear,
    getDiagHeadline,
    getTaskCreatedDate,
    getTaskDueDate,
    getTaskStartDate,
    parsePhaseDate,
    getDiagScore,
    getExqServiceCount,
    getExqScore,
    getPhaseFieldText,
    PHASE_FIELDS,
    getMeqsedInfo,
    meqsedModalVisibility,
    MEQSED_NOVU_KINDS,
    MEQSED_NOVU_LABELS,
    qurumMatchKey,
    canonicalQurumName,
    getQurumName,
    sameQurum,
    getSelfAssessInfo,
    SELF_DIR_FIELDS,
    getStatusGroup,
    hasAssessmentResult,
    belongsToDept,
    isTaskOrSubtaskType,
    isDiagOverallLabel,
    parseDiagUmumiNetice
} from './model.js';

var SECTIONS = ['diag', 'isq', 'self', 'exq', 'meqsed'];
var searchState = { diag: '', isq: '', self: '', exq: '', meqsed: '' };
var activeTab = 'diag';
var selectedYear = 'all';
var yearTouched = false;
var rangeStartIso = '';
var rangeEndIso = '';
var periodLoadBusy = false;
var lastLoadedPeriodKey = '';
var ASSESS_START_YEAR = 2023;
var searchDebounceTimer = null;
var pageState = { diag: 1, isq: 1, self: 1, exq: 1, meqsed: 1 };
var listDashFilterByTab = { diag: '', isq: '', self: '', exq: '', meqsed: '' };
var listSortByTab = { diag: 'date', isq: 'date', self: 'date', exq: 'date', meqsed: 'date' };
var PAGE_SIZE = 10;
var STATUS_GROUP_LABELS = {
    done: 'Tamamlanıb',
    progress: 'İcradadır',
    planned: 'Planlaşdırılıb',
    paused: 'Dayandırılıb',
    review: 'Rəydə',
    esd: 'ESD',
    blocked: 'Bloklanıb',
    rejected: 'İmtina',
    other: 'İcraya başlanmayıb'
};
var STATUS_GROUP_ORDER = ['done', 'progress', 'planned', 'paused', 'review', 'esd', 'blocked', 'rejected', 'other'];
var LIST_DASH_SECTIONS = {};
var meqsedOvActiveFilter;
var SECTION_LABELS = {
    diag: 'Diaqnostika',
    isq: 'İSQ',
    self: 'Özünüqiymətləndirmə',
    exq: 'EXQ',
    meqsed: 'Məqsədəuyğunluq'
};
var CAT_COLORS = {
    diag: '#7c3aed',
    isq: '#2563eb',
    self: '#059669',
    exq: '#d97706',
    meqsed: '#5b21b6'
};
var MEQSED_RESULT_COLORS = {
    pos: '#5b21b6',
    posAlt: '#7c3aed',
    neg: '#dc2626',
    revision: '#d97706',
    baxilir: '#64748b'
};
var lastDashSig = '';
var YEAR_SELECT_ID = 'assessmentYearSelect';
var hubViewCache = {};
var hubNavCache = null;
var hubCacheStamp = '';

function hubCacheKey() {
    return [
        state.dataEpoch || 0,
        state.currentQurumFilter || '',
        selectedYear,
        rangeStartIso || '',
        rangeEndIso || '',
        Object.keys(state.jiraFieldNames || {}).length
    ].join('|');
}

function ensureHubViewCache() {
    var stamp = hubCacheKey();
    if (hubCacheStamp === stamp) return;
    hubCacheStamp = stamp;
    hubViewCache = {};
    hubNavCache = null;
}
var HUB_BODY_ID = 'assessmentHubBody';
var DIAG_MODAL_ID = 'assessDiagModal';
var openDiagKey = null;
var hubRowByKey = {};
var lastEyeBtn = null;
var modalEscBound = false;
var rowCache = null;
var tabCountRaf = 0;

var EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">'
    + '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />'
    + '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getLastPhaseText(t) {
    if (!t || !t.fields) return '';
    var i, text;
    for (i = PHASE_FIELDS.length - 1; i >= 0; i--) {
        text = getPhaseFieldText(t, PHASE_FIELDS[i].text);
        if (text) return text;
    }
    return '';
}

function statusPill(name, task) {
    var raw = name || '—';
    var g = getStatusGroup(raw) || 'other';
    var pill = '<span class="assess-status assess-status--' + g + '">' + escapeHtml(raw) + '</span>';
    var phase = getLastPhaseText(task);
    if (!phase) return '<span class="assess-status-wrap">' + pill + '</span>';
    return '<span class="assess-status-wrap is-tipped" tabindex="0">'
        + pill
        + '<span class="assess-status-tip" role="tooltip">' + escapeHtml(phase) + '</span>'
        + '</span>';
}

function assessmentSourceIssues() {
    var idx = state.issueIndex || {};
    var keys = Object.keys(idx);
    var out = [];
    var seen = {};
    var excluded = state.EXCLUDED_USERS || [];
    for (var i = 0; i < keys.length; i++) {
        var t = idx[keys[i]];
        if (!t || !t.key || seen[t.key]) continue;
        seen[t.key] = true;
        if (!isTaskOrSubtaskType(t)) continue;
        if (!belongsToDept(t)) continue;
        var assigneeName = t.fields && t.fields.assignee ? normalizeStr(t.fields.assignee.displayName) : '';
        var skipUser = false;
        for (var u = 0; u < excluded.length; u++) {
            if (assigneeName.includes(excluded[u])) { skipUser = true; break; }
        }
        if (skipUser) continue;
        out.push(t);
    }
    return out;
}

function getRowCache() {
    var tasks = assessmentSourceIssues();
    var qf = state.currentQurumFilter || '';
    var srcRef = state.issueIndex;
    var srcLen = tasks.length;
    var epoch = state.dataEpoch || 0;
    if (rowCache && rowCache.src === srcRef && rowCache.qurum === qf && rowCache.len === srcLen && rowCache.epoch === epoch) {
        return rowCache;
    }
    var byCat = { diag: [], isq: [], self: [], exq: [], meqsed: [] };
    var years = {};
    for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        var cat = classifyAssessmentCategory(t);
        if (!cat || !byCat[cat]) continue;
        var qurum = getAssessmentQurumLabel(t) || t.key || '—';
        qurum = canonicalQurumName(qurum) || qurum;
        if (qf) {
            var q = qurum || getQurumName(t) || 'Təyin edilməyib';
            if (!sameQurum(q, qf)) continue;
        }
        var year = getAssessmentYear(t);
        if (year != null && isFinite(year) && year >= 2015 && year <= 2035) years[Number(year)] = true;
        byCat[cat].push({
            task: t,
            qurum: qurum,
            year: year,
            years: year != null ? [year] : [],
            hasResult: hasAssessmentResult(cat, t),
            time: getAssessmentTaskTime(t)
        });
    }
    rowCache = {
        src: srcRef,
        qurum: qf,
        len: srcLen,
        epoch: epoch,
        byCat: byCat,
        years: Object.keys(years).map(Number).sort(function(a, b) { return b - a; })
    };
    return rowCache;
}

function collectCategoryTasks(category) {
    return getRowCache().byCat[category] || [];
}

export function getDiagHubRows() {
    return collectCategoryTasks('diag').slice();
}

export function getDiagPeriodRows() {
    var includeUndated = isAllYears(selectedYear) && !hasActivePeriod();
    return pickSectionRows('diag', collectCategoryTasks('diag'), selectedYear, includeUndated);
}

export function getAssessmentPeriodState() {
    return { year: selectedYear, start: rangeStartIso, end: rangeEndIso };
}

export function getAssessmentPeriodLabel() {
    return periodLabel(selectedYear);
}

export function getAssessmentHubYears(section) {
    var fromSection = yearsForSection(section || 'diag');
    var listed = listedYears();
    var seen = {};
    var out = [];
    function add(y) {
        var n = Number(y);
        if (!isFinite(n) || seen[n]) return;
        seen[n] = true;
        out.push(n);
    }
    (fromSection || []).forEach(add);
    (listed || []).forEach(add);
    var cur = Number(selectedYear);
    if (isFinite(cur)) add(cur);
    return out.sort(function(a, b) { return b - a; });
}

export function getAssessmentHubNav() {
    ensureHubViewCache();
    if (hubNavCache) return hubNavCache;
    var includeUndated = isAllYears(selectedYear) && !hasActivePeriod();
    hubNavCache = SECTIONS.map(function(id) {
        var rows = pickSectionRows(id, collectCategoryTasks(id), selectedYear, includeUndated);
        return {
            id: id,
            label: SECTION_LABELS[id],
            color: CAT_COLORS[id],
            count: countQurums(rows)
        };
    });
    return hubNavCache;
}

export function getAssessmentHubView(section) {
    section = SECTIONS.indexOf(section) >= 0 ? section : 'diag';
    ensureHubViewCache();
    if (hubViewCache[section]) return hubViewCache[section];
    var includeUndated = isAllYears(selectedYear) && !hasActivePeriod();
    var rows = pickSectionRows(section, collectCategoryTasks(section), selectedYear, includeUndated);
    var stats;
    if (section === 'diag') stats = collectDiagListStats(rows);
    else if (section === 'isq') stats = collectIsqListStats(rows);
    else if (section === 'self') stats = collectSelfListStats(rows);
    else if (section === 'exq') stats = collectExqListStats(rows);
    else stats = collectMeqsedListStats(rows);
    hubViewCache[section] = {
        section: section,
        label: SECTION_LABELS[section],
        color: CAT_COLORS[section],
        period: periodLabel(selectedYear),
        stats: stats,
        rows: rows.map(function(r, i) { return serializeHubRow(section, r, i); })
    };
    return hubViewCache[section];
}

export function prefetchAssessmentHubViews() {
    ensureHubViewCache();
    getAssessmentHubNav();
    var i = 0;
    function step() {
        ensureHubViewCache();
        if (i >= SECTIONS.length) return;
        var id = SECTIONS[i++];
        try {
            if (!hubViewCache[id]) getAssessmentHubView(id);
        } catch (e) {}
        if (i < SECTIONS.length) {
            if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 280 });
            else setTimeout(step, 0);
        }
    }
    step();
}

function serializeHubRow(section, r, i) {
    var t = r && r.task;
    var status = (t && t.fields && t.fields.status && t.fields.status.name) || '—';
    var row = {
        key: (t && t.key) || '',
        qurum: r && r.qurum ? r.qurum : '—',
        year: r && r.year != null ? r.year : '',
        status: status,
        statusGroup: getStatusGroup(status) || 'other',
        score: null,
        result: '',
        extra: '',
        canOpen: !!(t && t.key),
        time: (r && r.time) || 0
    };
    if (section === 'diag') {
        row.score = diagNumericScore(r);
    } else if (section === 'isq') {
        row.score = isqNumericScore(r);
        row.result = formatAssessmentFieldText(t && t.fields && t.fields.customfield_17316);
    } else if (section === 'self') {
        var selfInfo = getSelfAssessInfo(t);
        row.score = parseScoreForSort(selfInfo && selfInfo.score);
        row.result = selfInfo && selfInfo.score != null && selfInfo.score !== '' ? String(selfInfo.score) : '';
    } else if (section === 'exq') {
        row.score = exqNumericScore(r);
        row.svc = getExqServiceCount(t);
        row.result = formatAssessmentFieldText(t && t.fields && t.fields.customfield_17317);
    } else if (section === 'meqsed') {
        var info = getMeqsedInfo(t);
        var units = meqsedRowUnits(info);
        row.novu = info && info.novu ? info.novu : '—';
        row.netice = info && info.netice ? info.netice : '—';
        row.opinion = (info && info.opinionKind) || '';
        row.novuKind = units.kind || 'other';
        row.isNew = !!units.isNew;
        row.isExist = !!units.isExist;
        row.isSystem = !!units.isSystem;
        row.isService = !!units.isService;
        row.resultKey = meqsedResultKey(r);
        row.sistemAdi = info && info.sistemAdi && info.sistemAdi !== '—' ? info.sistemAdi : '';
        var due = getTaskDueDate(t);
        row.date = due ? formatDueMonthYear(due) : '';
        if (due) row.time = due.getTime();
        row.result = row.netice;
    }
    return row;
}

function collectGlobalYears() {
    return getRowCache().years.slice();
}

function yearsForSection(section) {
    var set = {};
    (getRowCache().byCat[section] || []).forEach(function(r) {
        if (r.year != null && isFinite(r.year)) set[Number(r.year)] = true;
    });
    return Object.keys(set).map(Number).sort(function(a, b) { return b - a; });
}

function isAllYears(year) {
    return year === 'all' || year == null || year === '';
}

function isCustomPeriod(year) {
    return year === 'custom';
}

function pad2(n) {
    return (n < 10 ? '0' : '') + String(n);
}

function listedYears() {
    var end = new Date().getFullYear();
    var out = [];
    var y;
    for (y = end; y >= ASSESS_START_YEAR; y--) out.push(y);
    return out;
}

function lastDayOfMonthIso(year, month) {
    var d = new Date(Number(year), Number(month), 0);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function lastDayOfYearIso(year) {
    return String(year) + '-12-31';
}

function startDayIso(t) {
    var d = getTaskStartDate(t);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function formatAzDay(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length < 3) return iso;
    return p[2] + '.' + p[1] + '.' + p[0];
}

function inferYearKey(startIso, endIso) {
    if (!startIso || !endIso) return 'all';
    var y = Number(startIso.slice(0, 4));
    if (startIso === y + '-01-01' && endIso === lastDayOfYearIso(y)) return y;
    return 'custom';
}

function hasActivePeriod() {
    return !!(rangeStartIso || rangeEndIso);
}

function periodLabel(year) {
    if (hasActivePeriod()) {
        if (rangeStartIso && rangeEndIso) return formatAzDay(rangeStartIso) + ' – ' + formatAzDay(rangeEndIso);
        if (rangeStartIso) return formatAzDay(rangeStartIso) + '-dən';
        return formatAzDay(rangeEndIso) + '-dək';
    }
    if (isAllYears(year) || isCustomPeriod(year)) return 'Bütün illər';
    return String(year);
}

function todayIso() {
    var today = new Date();
    return today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
}

function readPeriodInputs() {
    var startEl = document.getElementById('assessStartDate');
    var endEl = document.getElementById('assessEndDate');
    return {
        start: startEl ? String(startEl.value || '').trim() : '',
        end: endEl ? String(endEl.value || '').trim() : ''
    };
}

function syncPeriodInputs() {
    var startEl = document.getElementById('assessStartDate');
    var endEl = document.getElementById('assessEndDate');
    var maxDay = todayIso();
    var minDay = ASSESS_START_YEAR + '-01-01';
    if (startEl) {
        startEl.min = minDay;
        startEl.max = maxDay;
        startEl.value = rangeStartIso || '';
    }
    if (endEl) {
        endEl.min = minDay;
        endEl.max = maxDay;
        endEl.value = rangeEndIso && rangeEndIso > maxDay ? maxDay : (rangeEndIso || '');
    }
}

function rowMatchesYear(r, year, includeUndated) {
    if (isAllYears(year) || isCustomPeriod(year)) return true;
    if (r.year != null && Number(r.year) === Number(year)) return true;
    if (includeUndated && (r.year == null || r.year === '')) return true;
    return false;
}

function rowMatchesPeriod(r, year, includeUndated) {
    if (hasActivePeriod()) {
        var day = startDayIso(r && r.task);
        if (!day) return !!(includeUndated && isAllYears(year));
        if (rangeStartIso && day < rangeStartIso) return false;
        if (rangeEndIso && day > rangeEndIso) return false;
        return true;
    }
    return rowMatchesYear(r, year, includeUndated);
}

function resolveSelectedYear(section, globalYears) {
    if (isCustomPeriod(selectedYear)) return 'custom';
    if (!yearTouched || isAllYears(selectedYear)) return 'all';
    var y = Number(selectedYear);
    if (!isFinite(y)) return 'all';
    var sectionYears = yearsForSection(section);
    if (sectionYears.indexOf(y) !== -1) return y;
    if (globalYears && globalYears.indexOf(y) !== -1) return y;
    return y;
}

function pickBestPerQurumYear(rows, year, includeUndated) {
    var groups = {};
    var all = isAllYears(year);
    rows.forEach(function(r) {
        if (!rowMatchesPeriod(r, year, includeUndated)) return;
        var qKey = qurumMatchKey(r.qurum) || r.qurum || (r.task && r.task.key) || '—';
        var key = all ? (qKey + '::' + (r.year == null ? 'na' : r.year)) : qKey;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });
    var picked = [];
    Object.keys(groups).forEach(function(key) {
        var list = groups[key].slice();
        var withResult = list.filter(function(r) { return r.hasResult; });
        var pool = withResult.length ? withResult : list;
        pool.sort(function(a, b) { return b.time - a.time; });
        picked.push(pool[0]);
    });
    picked.sort(function(a, b) {
        var ya = a.year == null ? 0 : Number(a.year);
        var yb = b.year == null ? 0 : Number(b.year);
        if (all && yb !== ya) return yb - ya;
        return String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
    });
    return picked;
}

function pickSectionRows(section, rows, year, includeUndated) {
    var out = (rows || []).filter(function(r) {
        return rowMatchesPeriod(r, year, includeUndated);
    });
    out.sort(function(a, b) {
        var ya = a.year == null ? 0 : Number(a.year);
        var yb = b.year == null ? 0 : Number(b.year);
        if (yb !== ya) return yb - ya;
        var q = String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
        if (q) return q;
        return String((a.task && a.task.key) || '').localeCompare(String((b.task && b.task.key) || ''));
    });
    return out;
}

function meqsedSearchHaystack(r) {
    var parts = [r && r.qurum ? String(r.qurum) : ''];
    var info = getMeqsedInfo(r && r.task);
    if (info && info.sistemAdi && info.sistemAdi !== '—') {
        parts.push(info.sistemAdi);
    }
    if (info && info.xidmetMelumat && info.xidmetMelumat !== '—') {
        parts.push(info.xidmetMelumat);
    }
    return parts.join(' ');
}

function filterBySearch(rows, section) {
    var q = (searchState[section] || '').trim();
    if (!q) return rows;
    var normQ = normalizeStr(q);
    return rows.filter(function(r) {
        var hay = section === 'meqsed' ? meqsedSearchHaystack(r) : (r.qurum || '');
        return normalizeStr(hay).includes(normQ);
    });
}

function parseScoreForSort(value) {
    if (value == null || value === '' || value === '—') return null;
    var s = String(value).trim().replace(',', '.');
    var m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return isFinite(n) ? n : null;
}

function diagNumericScore(r) {
    var n = parseScoreForSort(getDiagHeadline(r && r.task));
    if (n != null) return n;
    return parseScoreForSort(getDiagScore(r && r.task));
}

function selfNumericScore(r) {
    return parseScoreForSort(getSelfAssessInfo(r && r.task).score);
}

function sortDiagRows(rows) {
    return sortRowsByMetric(rows, 'diag', -1);
}

function rowSortMetric(section, r) {
    if (section === 'diag') return diagNumericScore(r);
    if (section === 'isq') return isqNumericScore(r);
    if (section === 'self') return selfNumericScore(r);
    if (section === 'exq') {
        var score = exqNumericScore(r);
        if (score != null) return score;
        var svc = getExqServiceCount(r && r.task);
        return svc != null && svc > 0 ? svc : null;
    }
    if (section === 'meqsed') {
        var units = meqsedRowUnits(getMeqsedInfo(r && r.task));
        var n = (units.xidmet || 0) + (units.sistem || 0);
        return n > 0 ? n : null;
    }
    return null;
}

function sortRowsByDate(rows) {
    return (rows || []).slice().sort(function(a, b) {
        var ta = Number(a.time) || 0;
        var tb = Number(b.time) || 0;
        if (tb !== ta) return tb - ta;
        var ya = a.year == null ? 0 : Number(a.year);
        var yb = b.year == null ? 0 : Number(b.year);
        if (yb !== ya) return yb - ya;
        var q = String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
        if (q) return q;
        return String((a.task && a.task.key) || '').localeCompare(String((b.task && b.task.key) || ''));
    });
}

function sortRowsByMetric(rows, section, dir) {
    return (rows || []).slice().sort(function(a, b) {
        var sa = rowSortMetric(section, a);
        var sb = rowSortMetric(section, b);
        if (sa == null && sb == null) {
            return String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
        }
        if (sa == null) return 1;
        if (sb == null) return -1;
        if (sa !== sb) return dir * (sa - sb);
        return String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
    });
}

function applyListSort(section, rows) {
    var mode = listSortByTab[section] || 'date';
    if (mode === 'asc') return sortRowsByMetric(rows, section, 1);
    if (mode === 'desc') return sortRowsByMetric(rows, section, -1);
    return sortRowsByDate(rows);
}

function listSortMode(section) {
    return listSortByTab[section] || 'date';
}

function listSortCaption(mode) {
    if (mode === 'desc') return 'Çoxdan aza';
    if (mode === 'asc') return 'Azdan çoxa';
    return 'Tarixə görə';
}

function listSortBtnHtml(section) {
    var mode = listSortMode(section);
    var nextHint = mode === 'date' ? 'çoxdan aza' : (mode === 'desc' ? 'azdan çoxa' : 'tarixə görə');
    var title = 'İndi: ' + listSortCaption(mode) + '. Kliklə — ' + nextHint;
    return '<button type="button" class="assess-sort-btn is-' + mode + '"'
        + ' title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"'
        + ' onclick="event.stopPropagation(); cycleAssessListSort()">'
        + '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'
        + '<path stroke-linecap="round" stroke-linejoin="round" d="M8 7l4-4 4 4M16 17l-4 4-4-4" />'
        + '</svg><span>' + escapeHtml(listSortCaption(mode)) + '</span></button>';
}

export function cycleAssessListSort() {
    var section = activeTab;
    if (SECTIONS.indexOf(section) === -1) return;
    var cur = listSortByTab[section] || 'date';
    listSortByTab[section] = cur === 'date' ? 'desc' : (cur === 'desc' ? 'asc' : 'date');
    pageState[section] = 1;
    renderOne(section, { skipHubDash: true, skipYearSelect: true });
}

export function setAssessListSort(mode) {
    var section = activeTab;
    if (SECTIONS.indexOf(section) === -1) return;
    if (mode !== 'date' && mode !== 'desc' && mode !== 'asc') return;
    listSortByTab[section] = mode;
    pageState[section] = 1;
    renderOne(section, { skipHubDash: true, skipYearSelect: true, skipListDash: true });
}

function listFilterGroups(section) {
    var statusItems = STATUS_GROUP_ORDER.filter(function(g) {
        return g !== 'esd' && g !== 'blocked' && g !== 'rejected';
    }).map(function(g) {
        return { key: 'st_' + g, label: STATUS_GROUP_LABELS[g] || g };
    });
    var groups = [{ title: 'Status', items: statusItems }];
    if (section === 'diag' || section === 'isq' || section === 'self' || section === 'exq') {
        groups.push({
            title: 'Nəticə',
            items: [
                { key: 'has_result', label: 'Nəticəsi olan' },
                { key: 'no_result', label: 'Nəticəsiz' },
                { key: 'score_high', label: 'Bal ≥ 70' },
                { key: 'score_mid', label: 'Bal 40–69' },
                { key: 'score_low', label: 'Bal < 40' }
            ]
        });
    }
    if (section === 'exq') {
        groups.push({
            title: 'Xidmət',
            items: [
                { key: 'svc_sum', label: 'Xidməti olan' },
                { key: 'svc_1_5', label: '1–5 xidmət' },
                { key: 'svc_6_20', label: '6–20 xidmət' },
                { key: 'svc_21', label: '21+ xidmət' },
                { key: 'svc_none', label: 'Xidmət yox' }
            ]
        });
    }
    if (section === 'meqsed') {
        groups.push({
            title: 'Rəy',
            items: [
                { key: 'pos', label: 'Müsbət' },
                { key: 'neg', label: 'Mənfi' },
                { key: 'partial', label: 'Qismən' },
                { key: 'revision', label: 'Düzəlişə göndərildi' },
                { key: 'baxilir', label: 'İcradadır' }
            ]
        });
        groups.push({
            title: 'Müraciət növü',
            items: (MEQSED_NOVU_KINDS || []).map(function(k) {
                return { key: k, label: MEQSED_NOVU_LABELS[k] || k };
            }).concat([{ key: 'other', label: MEQSED_NOVU_LABELS.other || 'Digər' }])
        });
    }
    return groups;
}

function listFilterIsActive(section) {
    var cur = listDashFilter(section);
    return !!(cur && cur !== 'all');
}

function syncAssessListFilterBtn() {
    var btn = document.getElementById('assessListFilterBtn');
    var dot = document.getElementById('assessListFilterDot');
    var pop = document.getElementById('assessListFilterPop');
    var card = document.getElementById('assessHubCard');
    if (!btn) return;
    var on = listFilterIsActive(activeTab);
    var open = pop && !pop.classList.contains('hidden');
    btn.classList.toggle('is-active', on);
    btn.classList.toggle('is-open', !!open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var label = listDashFilterLabel(activeTab, listDashFilter(activeTab));
    btn.title = on && label ? ('Filtr: ' + label) : 'Filtrlə';
    if (dot) dot.classList.toggle('hidden', !on);
    if (card) card.classList.toggle('is-filter-open', !!open);
}

function fillAssessListFilterPopover() {
    var pop = document.getElementById('assessListFilterPop');
    if (!pop) return;
    var section = activeTab;
    var cur = listDashFilter(section);
    var noneOn = !cur || cur === 'all';
    var sortMode = listSortMode(section);
    var html = '<div class="assess-filter-pop-head"><strong>Filtr</strong>'
        + (noneOn ? '' : '<button type="button" class="assess-filter-clear" onclick="event.stopPropagation(); setAssessListFilter(\'\')">Sıfırla</button>')
        + '</div>';
    html += '<div class="assess-filter-group"><p class="assess-filter-group-title">Siyahı</p><div class="assess-filter-opts">'
        + '<button type="button" class="assess-filter-opt' + (noneOn ? ' is-on' : '') + '" onclick="event.stopPropagation(); setAssessListFilter(\'\')">Hamısı</button>'
        + '</div></div>';
    listFilterGroups(section).forEach(function(group) {
        html += '<div class="assess-filter-group"><p class="assess-filter-group-title">' + escapeHtml(group.title) + '</p>'
            + '<div class="assess-filter-opts">'
            + group.items.map(function(it) {
                var on = cur === it.key;
                return '<button type="button" class="assess-filter-opt' + (on ? ' is-on' : '') + '"'
                    + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + it.key + '\')">'
                    + escapeHtml(it.label) + '</button>';
            }).join('')
            + '</div></div>';
    });
    html += '<div class="assess-filter-group"><p class="assess-filter-group-title">Sıralama</p><div class="assess-filter-opts">'
        + [['date', 'Tarixə görə'], ['desc', 'Çoxdan aza'], ['asc', 'Azdan çoxa']].map(function(pair) {
            var on = sortMode === pair[0];
            return '<button type="button" class="assess-filter-opt' + (on ? ' is-on' : '') + '"'
                + ' onclick="event.stopPropagation(); setAssessListSort(\'' + pair[0] + '\')">'
                + escapeHtml(pair[1]) + '</button>';
        }).join('')
        + '</div></div>';
    pop.innerHTML = html;
    syncAssessListFilterBtn();
}

export function closeAssessListFilterMenu() {
    var pop = document.getElementById('assessListFilterPop');
    if (pop) pop.classList.add('hidden');
    syncAssessListFilterBtn();
}

export function toggleAssessListFilterMenu(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var pop = document.getElementById('assessListFilterPop');
    if (!pop) return;
    var willOpen = pop.classList.contains('hidden');
    if (willOpen) {
        fillAssessListFilterPopover();
        pop.classList.remove('hidden');
        openAssessmentQurumList(false);
    } else {
        pop.classList.add('hidden');
    }
    syncAssessListFilterBtn();
}

var assessFilterOutsideBound = false;
function bindAssessListFilterOutside() {
    if (assessFilterOutsideBound) return;
    assessFilterOutsideBound = true;
    document.addEventListener('click', function(e) {
        var wrap = document.querySelector('.assess-filter-wrap');
        if (!wrap || wrap.contains(e.target)) return;
        closeAssessListFilterMenu();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') closeAssessListFilterMenu();
    });
}

function fillYearSelect(years, selected) {
    var allOn = isAllYears(selected);
    var customOn = isCustomPeriod(selected);
    var opts = listedYears();
    var extra = (years || []).map(Number).filter(function(y) { return isFinite(y) && opts.indexOf(y) === -1; });
    if (extra.length) opts = opts.concat(extra).sort(function(a, b) { return b - a; });
    if (!allOn && !customOn) {
        var selectedNum = Number(selected);
        if (isFinite(selectedNum) && opts.indexOf(selectedNum) === -1) opts.push(selectedNum);
        opts.sort(function(a, b) { return b - a; });
    }

    var el = document.getElementById(YEAR_SELECT_ID);
    if (el) {
        el.innerHTML = '<option value="all"' + (allOn ? ' selected' : '') + '>Hamısı</option>'
            + opts.map(function(y) {
                return '<option value="' + y + '"' + (!allOn && !customOn && y === Number(selected) ? ' selected' : '') + '>' + y + '</option>';
            }).join('');
        el.value = allOn || customOn ? 'all' : String(selected);
        if (customOn) el.value = 'all';
    }

    var pills = document.getElementById('assessmentYearPills');
    if (pills) {
        var hamisi = '<button type="button" class="assess-year-pill' + (allOn ? ' is-active' : '') + '"'
            + ' aria-pressed="' + (allOn ? 'true' : 'false') + '"'
            + ' onclick="event.stopPropagation(); setAssessmentYearForActiveTab(\'all\')">Hamısı</button>';
        pills.innerHTML = hamisi + opts.map(function(y) {
            var on = !allOn && !customOn && y === Number(selected);
            return '<button type="button" class="assess-year-pill' + (on ? ' is-active' : '') + '"'
                + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
                + ' onclick="event.stopPropagation(); setAssessmentYearForActiveTab(' + y + ')">'
                + y + '</button>';
        }).join('');
    }
}

function updateHubMeta(count, searchActive, year) {
    var meta = document.getElementById('assessHubMeta');
    if (!meta) return;
    var yearBit = periodLabel(year);
    if (searchActive) {
        meta.textContent = yearBit + ' · ' + (count === 1 ? '1 nəticə tapıldı' : count + ' nəticə tapıldı');
        meta.classList.add('is-search');
    } else if (count > 0) {
        meta.textContent = yearBit + ' · ' + (count === 1 ? '1 qeyd' : count + ' qeyd');
        meta.classList.remove('is-search');
    } else {
        meta.textContent = yearBit + ' · qeyd yoxdur';
        meta.classList.remove('is-search');
    }
}

function syncSearchInput() {
    var input = document.getElementById('assessSearchInput');
    var clearBtn = document.getElementById('assessSearchClear');
    if (!input) return;
    var val = searchState[activeTab] || '';
    input.value = val;
    input.placeholder = activeTab === 'meqsed' ? 'Qurum və ya xidmət axtar...' : 'Qurum axtar...';
    if (clearBtn) clearBtn.classList.toggle('hidden', !val);
}

function syncTabPanels() {
    document.querySelectorAll('.assess-tab').forEach(function(btn) {
        var tab = btn.getAttribute('data-tab');
        var isActive = tab === activeTab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

function getSectionRows(section) {
    var allRows = collectCategoryTasks(section);
    var globalYears = collectGlobalYears();
    var year = resolveSelectedYear(section, globalYears);
    var includeUndated = isAllYears(year) && !hasActivePeriod();
    var searchActive = !!(searchState[section] || '').trim();
    var pool = (section === 'meqsed' && searchActive) ? filterBySearch(allRows, section) : allRows;
    var rows = pickSectionRows(section, pool, year, includeUndated);
    return { allRows: allRows, years: globalYears, year: year, rows: rows, searchApplied: section === 'meqsed' && searchActive };
}

function updateTabCounts() {
    SECTIONS.forEach(function(section) {
        var btn = document.querySelector('.assess-tab[data-tab="' + section + '"]');
        if (!btn) return;
        var data = getSectionRows(section);
        var count = countQurums(data.searchApplied ? data.rows : filterBySearch(data.rows, section));
        var badge = btn.querySelector('.assess-tab-count');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'assess-tab-count';
                btn.appendChild(badge);
            }
            badge.textContent = String(count);
            badge.title = count + ' qurum';
            badge.setAttribute('aria-label', count + ' qurum');
        } else if (badge) {
            badge.remove();
        }
    });
}

function scheduleTabCounts() {
    if (tabCountRaf) return;
    tabCountRaf = requestAnimationFrame(function() {
        tabCountRaf = 0;
        updateTabCounts();
    });
}

function emptyHtml() {
    var msg;
    if (hasActivePeriod()) msg = 'Bu dövrdə qeyd tapılmadı.';
    else if (isAllYears(selectedYear)) msg = 'Qeyd tapılmadı.';
    else msg = 'Bu ildə qeyd tapılmadı.';
    return '<div class="assess-hub-empty">'
        + '<div class="assess-hub-empty-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">'
        + '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />'
        + '</svg></div><p>' + msg + '</p></div>';
}

function searchEmptyHtml() {
    return '<div class="assess-hub-empty">'
        + '<div class="assess-hub-empty-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">'
        + '<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />'
        + '</svg></div><p>Axtarışa uyğun qurum tapılmadı.</p></div>';
}

function scoreBadge(value) {
    return '<span class="assess-score-badge">' + escapeHtml(value) + '</span>';
}

function taskBrowseUrl(task) {
    var key = task && task.key;
    if (!key) return '';
    var base = (state.currentBaseUrl || '').replace(/\/+$/, '');
    if (!base) return '';
    return base + '/browse/' + key;
}

function qurumCell(r) {
    var raw = r && r.qurum != null ? String(r.qurum).trim() : '';
    var name = escapeHtml(raw || '—');
    var url = taskBrowseUrl(r.task);
    if (!url) {
        return '<div class="assess-hub-qurum">' + name + '</div>';
    }
    return '<div class="assess-hub-qurum">'
        + '<a class="assess-hub-qurum-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"'
        + ' onclick="event.stopPropagation();">'
        + name
        + '</a></div>';
}

function hubTable(section, headers, rowsHtml) {
    var ths = headers.map(function(h) {
        return '<div class="assess-hub-th">' + (h ? escapeHtml(h) : '&nbsp;') + '</div>';
    }).join('');
    return '<div class="assess-hub-table assess-hub-table--' + section + '" role="table">'
        + '<div class="assess-hub-thead" role="rowgroup">' + ths + '</div>'
        + '<div class="assess-hub-rows" role="rowgroup">' + rowsHtml + '</div></div>';
}

function hubRow(cells, detailHtml) {
    var cellsHtml = cells.map(function(c) {
        var cls = 'assess-hub-cell' + (c.cls ? ' ' + c.cls : '');
        return '<div class="' + cls + '" data-label="' + escapeHtml(c.label || '') + '">' + c.html + '</div>';
    }).join('');
    var detail = detailHtml
        ? '<div class="assess-hub-detail-wrap">' + detailHtml + '</div>'
        : '';
    return '<div class="assess-hub-row" role="row">' + cellsHtml + detail + '</div>';
}

function pagerHtml(section, page, pages, qurumN, rowTotal) {
    if ((rowTotal != null ? rowTotal : qurumN) <= PAGE_SIZE) return '';
    var prev = page > 1
        ? '<button type="button" class="tl-page-btn" onclick="event.stopPropagation(); setAssessmentPage(\'' + section + '\',' + (page - 1) + ')">Əvvəlki</button>'
        : '';
    var next = page < pages
        ? '<button type="button" class="tl-page-btn" onclick="event.stopPropagation(); setAssessmentPage(\'' + section + '\',' + (page + 1) + ')">Növbəti</button>'
        : '';
    return '<div class="tl-pagination assess-pager">' + prev
        + '<span class="tl-page-label">' + page + ' / ' + pages + ' · ' + qurumN + ' qurum</span>'
        + next + '</div>';
}

function paginateRows(rows, section) {
    var total = (rows || []).length;
    var qurumN = countQurums(rows);
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var page = pageState[section] || 1;
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    pageState[section] = page;
    var start = (page - 1) * PAGE_SIZE;
    return {
        slice: rows.slice(start, start + PAGE_SIZE),
        page: page,
        pages: pages,
        total: total,
        qurumN: qurumN,
        html: pagerHtml(section, page, pages, qurumN, total)
    };
}

function destroyAssessChart(key, canvasId) {
    if (state[key]) {
        try { state[key].destroy(); } catch (e) {}
        state[key] = null;
    }
    var canvas = document.getElementById(canvasId);
    if (canvas && typeof Chart !== 'undefined') {
        var ex = Chart.getChart(canvas);
        if (ex) {
            try { ex.destroy(); } catch (e2) {}
        }
    }
}

function setAssessChartVisible(wrapId, emptyId, show) {
    var wrap = document.getElementById(wrapId);
    var empty = document.getElementById(emptyId);
    if (wrap) wrap.classList.toggle('hidden', !show);
    if (empty) empty.classList.toggle('hidden', show);
}

function collectDashModel() {
    var catIncludeUndated = isAllYears(selectedYear) && !hasActivePeriod();
    var catCounts = SECTIONS.map(function(s) {
        var rows = pickSectionRows(s, collectCategoryTasks(s), selectedYear, catIncludeUndated);
        return { s: s, n: countQurums(rows) };
    });
    var byYear = {};
    SECTIONS.forEach(function(s) {
        var pi = SECTIONS.indexOf(s);
        pickSectionRows(s, collectCategoryTasks(s), selectedYear, catIncludeUndated).forEach(function(r) {
            var started = getTaskStartDate(r && r.task);
            var y = started ? started.getFullYear() : (r.year != null ? Number(r.year) : null);
            if (y == null || !isFinite(y)) return;
            if (!byYear[y]) {
                byYear[y] = {
                    y: y,
                    total: 0,
                    parts: SECTIONS.map(function(s2) { return { s: s2, n: 0 }; }),
                    qset: {},
                    partSets: SECTIONS.map(function() { return {}; })
                };
            }
            var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || '';
            if (!qk) return;
            byYear[y].qset[qk] = true;
            byYear[y].partSets[pi][qk] = true;
        });
    });
    var yearCounts = Object.keys(byYear).map(Number).sort(function(a, b) { return a - b; }).map(function(y) {
        var row = byYear[y];
        row.parts = row.partSets.map(function(set, i) {
            return { s: SECTIONS[i], n: Object.keys(set).length };
        });
        row.total = Object.keys(row.qset).length;
        delete row.qset;
        delete row.partSets;
        return row;
    });
    return { yearCounts: yearCounts, catCounts: catCounts };
}

function pickYearFromChartEvent(els, yearCounts) {
    if (!els || !els.length) return null;
    var idx = els[0].index;
    var row = yearCounts[idx];
    return row && row.y != null ? row.y : null;
}

function drawAssessYearChart(yearCounts) {
    var canvas = document.getElementById('assessYearChart');
    if (!canvas || typeof Chart === 'undefined') return;
    destroyAssessChart('assessYearChart', 'assessYearChart');
    var labels = yearCounts.map(function(row) { return String(row.y); });
    var data = yearCounts.map(function(row) { return row.total; });
    var selectedOn = !isAllYears(selectedYear) && !isCustomPeriod(selectedYear);
    var selectedNum = Number(selectedYear);
    var colors = yearCounts.map(function(row) {
        return (!selectedOn || row.y === selectedNum) ? '#7c3aed' : 'rgba(124, 58, 237, 0.28)';
    });
    var barValuesPlugin = {
        id: 'assessYearBarValues',
        afterDatasetsDraw: function(chart) {
            var meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data) return;
            var c = chart.ctx;
            var ds = chart.data.datasets[0];
            c.save();
            c.font = '600 11px Inter, sans-serif';
            c.fillStyle = '#475569';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            meta.data.forEach(function(bar, i) {
                var n = ds.data[i];
                if (!n) return;
                c.fillText(String(n), bar.x, bar.y - 3);
            });
            c.restore();
        }
    };
    var ctx = canvas.getContext('2d');
    state.assessYearChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Qurum',
                data: data,
                backgroundColor: colors,
                hoverBackgroundColor: '#6d28d9',
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 18, right: 8, left: 4, bottom: 0 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
                    callbacks: {
                        label: function(item) {
                            return ' ' + (item.parsed.y || 0) + ' qurum';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'İl', font: { family: 'Inter', size: 11, weight: '600' }, color: '#64748b' },
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 11, weight: '600' }, color: '#64748b' }
                },
                y: {
                    title: { display: true, text: 'Qurum sayı', font: { family: 'Inter', size: 11, weight: '600' }, color: '#64748b' },
                    beginAtZero: true,
                    grace: '12%',
                    ticks: { precision: 0, font: { family: 'Inter', size: 11 }, color: '#94a3b8' },
                    grid: { color: 'rgba(226, 232, 240, 0.9)' },
                    border: { display: false }
                }
            },
            onHover: function(e, els) {
                if (e && e.native && e.native.target) e.native.target.style.cursor = els[0] ? 'pointer' : 'default';
            },
            onClick: function(e, els) {
                var year = pickYearFromChartEvent(els, yearCounts);
                if (year != null) setAssessmentYearForActiveTab(year);
            }
        },
        plugins: [barValuesPlugin]
    });
}

function drawAssessCatChart(catCounts) {
    var canvas = document.getElementById('assessCatChart');
    if (!canvas || typeof Chart === 'undefined') return;
    destroyAssessChart('assessCatChart', 'assessCatChart');
    var labels = catCounts.map(function(c) { return SECTION_LABELS[c.s]; });
    var data = catCounts.map(function(c) { return c.n; });
    var solidColors = catCounts.map(function(c) { return CAT_COLORS[c.s]; });
    var total = data.reduce(function(a, b) { return a + b; }, 0);
    var centerPlugin = {
        id: 'assessCatCenter',
        afterDraw: function(chart) {
            var area = chart.chartArea;
            if (!area) return;
            var c = chart.ctx;
            var cx = (area.left + area.right) / 2;
            var cy = (area.top + area.bottom) / 2;
            c.save();
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = '800 26px Inter, system-ui, sans-serif';
            c.fillStyle = '#0f172a';
            c.fillText(String(total), cx, cy - 9);
            c.font = '600 11px Inter, system-ui, sans-serif';
            c.fillStyle = '#64748b';
            c.fillText('qurum', cx, cy + 12);
            c.restore();
        }
    };
    state.assessCatChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: solidColors.slice(),
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBackgroundColor: solidColors.slice(),
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            layout: { padding: 4 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#e2e8f0',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(item) {
                            var n = item.parsed || 0;
                            var pct = total ? Math.round((n / total) * 100) : 0;
                            return ' ' + n + ' qurum (' + pct + '%)';
                        }
                    }
                }
            },
            onHover: function(e, els) {
                if (e && e.native && e.native.target) e.native.target.style.cursor = els[0] ? 'pointer' : 'default';
            },
            onClick: function(e, els) {
                if (!els.length) return;
                var sec = catCounts[els[0].index] && catCounts[els[0].index].s;
                if (sec) focusAssessmentSection(sec);
            }
        },
        plugins: [centerPlugin]
    });
}

function renderAssessCatLegend(catCounts) {
    var el = document.getElementById('assessCatLegend');
    if (!el) return;
    var total = (catCounts || []).reduce(function(sum, c) { return sum + (c.n || 0); }, 0);
    if (!total) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = catCounts.map(function(c) {
        var pct = total ? Math.round((c.n / total) * 100) : 0;
        var on = c.s === activeTab ? ' is-active' : '';
        var color = CAT_COLORS[c.s] || '#64748b';
        return '<button type="button" class="assess-cat-leg' + on + '" role="listitem"'
            + ' style="--cat-color:' + color + '"'
            + ' onclick="event.stopPropagation(); focusAssessmentSection(\'' + c.s + '\')">'
            + '<span class="assess-cat-leg-dot" aria-hidden="true"></span>'
            + '<span class="assess-cat-leg-meta">'
            + '<span class="assess-cat-leg-label">' + escapeHtml(SECTION_LABELS[c.s]) + '</span>'
            + '<span class="assess-cat-leg-pct">' + pct + '%</span>'
            + '</span>'
            + '<strong class="assess-cat-leg-n">' + c.n + '<span class="assess-cat-leg-unit">qurum</span></strong>'
            + '<span class="assess-cat-leg-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>'
            + '</button>';
    }).join('');
}

function renderAssessDash() {
    var el = document.getElementById('assessDash');
    if (!el) return;
    var kpis = document.getElementById('assessDashKpis');
    var hint = document.getElementById('assessCatPeriodHint');
    var titleEl = document.getElementById('assessCatChartTitle');
    var legendEl = document.getElementById('assessCatLegend');
    var hasIssues = Object.keys(state.issueIndex || {}).length > 0;
    if (kpis) {
        kpis.innerHTML = '';
        kpis.classList.add('hidden');
        kpis.setAttribute('hidden', '');
    }
    if (!hasIssues) {
        lastDashSig = '';
        destroyAssessChart('assessYearChart', 'assessYearChart');
        destroyAssessChart('assessCatChart', 'assessCatChart');
        setAssessChartVisible('assessCatChartWrap', 'assessCatEmpty', false);
        if (hint) hint.textContent = '';
        if (legendEl) legendEl.innerHTML = '';
        return;
    }
    var model = collectDashModel();
    var catCounts = model.catCounts;
    var period = periodLabel(selectedYear);
    if (titleEl) titleEl.textContent = 'Bölmələr üzrə qurum sayı';
    if (hint) hint.textContent = period ? ('Seçilmiş dövr: ' + period) : '';
    var sig = String(selectedYear) + '|' + activeTab + '|'
        + catCounts.map(function(c) { return c.s + ':' + c.n; }).join(',');
    var catOk = catCounts.some(function(c) { return c.n > 0; });
    setAssessChartVisible('assessCatChartWrap', 'assessCatEmpty', catOk);
    destroyAssessChart('assessYearChart', 'assessYearChart');
    renderAssessCatLegend(catOk ? catCounts : []);
    if (sig === lastDashSig) {
        if (!catOk || state.assessCatChart) return;
    }
    lastDashSig = sig;
    if (catOk) drawAssessCatChart(catCounts);
    else destroyAssessChart('assessCatChart', 'assessCatChart');
}

function hubListDetailActive(section, searchActive) {
    if (searchActive) return true;
    if (!LIST_DASH_SECTIONS[section]) return true;
    return !!listDashFilter(section);
}

function renderBlocks(blocks) {
    if (!blocks || !blocks.length) {
        return '<p class="text-sm text-slate-400">Nəticə qeyd edilməyib.</p>';
    }
    return '<div class="assess-blocks">' + blocks.map(function(b) {
        var label = b.label ? '<div class="assess-block-label">' + escapeHtml(b.label) + '</div>' : '';
        var value = '<div class="assess-block-value">' + escapeHtml(b.value || '—') + '</div>';
        return '<div class="assess-block">' + label + value + '</div>';
    }).join('') + '</div>';
}

function rememberHubRows(rows) {
    hubRowByKey = {};
    (rows || []).forEach(function(r) {
        var key = r && r.task && r.task.key;
        if (key) hubRowByKey[key] = r;
    });
}

function eyeButton(key) {
    var open = openDiagKey === key;
    return '<button type="button" class="assess-eye-btn' + (open ? ' is-open' : '') + '"'
        + ' data-diag-key="' + escapeHtml(key) + '"'
        + ' aria-label="Ətraflı baxış" title="Ətraflı baxış"'
        + ' onclick="event.stopPropagation(); openDiagModal(\'' + escapeHtml(key) + '\', this);">'
        + EYE_SVG + '</button>';
}

function headlineCell(value) {
    var v = value == null || value === '' ? '—' : String(value);
    return '<span class="assess-text-value">' + escapeHtml(v) + '</span>';
}

function sendDateHtml(task) {
    var due = getTaskDueDate(task);
    var gonderilme = due ? formatDueMonthYear(due) : '—';
    return '<span class="assess-text-value assess-date-value">' + escapeHtml(gonderilme) + '</span>';
}

function renderQurumNameList(section, rows, withEye) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var cells = [
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) }
        ];
        if (withEye && r.task && r.task.key) {
            cells.push({ label: '', cls: 'assess-hub-cell--action', html: eyeButton(r.task.key) });
        }
        return hubRow(cells, '');
    }).join('');
    return hubTable(section, withEye ? ['Qurum adı', ''] : ['Qurum adı'], body);
}

function renderDiag(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var headline = getDiagHeadline(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Diaqnostika balı', html: scoreBadge(headline) },
            { label: 'Göndərilmə tarixi', cls: 'assess-hub-cell--date', html: sendDateHtml(t) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(t.key) }
        ], '');
    }).join('');
    return hubTable('diag', ['Qurum adı', 'Diaqnostika balı', 'Göndərilmə tarixi', ''], body);
}

function renderIsq(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var netice = formatAssessmentFieldText(t.fields && t.fields.customfield_17316);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'İSQ Nəticəsi', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(netice) + '</span>' }
        ], '');
    }).join('');
    return hubTable('isq', ['Qurum adı', 'İSQ Nəticəsi'], body);
}

function renderSelf(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var info = getSelfAssessInfo(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Nəticə', html: scoreBadge(info.score) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(t.key) }
        ], '');
    }).join('');
    return hubTable('self', ['Qurum adı', 'Nəticə', ''], body);
}

function renderExq(rows) {
    if (!rows.length) return emptyHtml();
    var stats = collectExqListStats(rows);
    var avg = stats.avg;
    var maxSvc = 0;
    (rows || []).forEach(function(r) {
        var c = getExqServiceCount(r && r.task);
        if (c != null && c > maxSvc) maxSvc = c;
    });
    var body = (rows || []).map(function(r) {
        var t = r.task;
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var bal = getExqScore(t);
        var count = getExqServiceCount(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Status', html: statusPill(status, t) },
            { label: 'Xidmət və bal', cls: 'assess-hub-cell--exq-metrics', html: exqRowMetricsHtml(bal, count, avg, maxSvc) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(t.key) }
        ], '');
    }).join('');
    return hubTable('exq', ['Qurum adı', 'Status', 'Xidmət və bal', ''], body);
}

function parseXidmetUnits(info) {
    var raw = info && info.xidmetSayi != null ? String(info.xidmetSayi).replace(',', '.') : '';
    var n = parseFloat(raw);
    if (isFinite(n) && n > 0) return Math.round(n);
    return 0;
}

function meqsedRowUnits(info) {
    var kind = (info && info.novuKind) || '';
    var isService = kind === 'new_service' || kind === 'exist_service';
    var isSystem = kind === 'new_system' || kind === 'exist_system';
    var xidmet = 0;
    var sistem = 0;
    if (isService) xidmet = parseXidmetUnits(info) || 1;
    else if (isSystem) sistem = 1;
    return {
        xidmet: xidmet,
        sistem: sistem,
        isNew: kind === 'new_system' || kind === 'new_service',
        isExist: kind === 'exist_system' || kind === 'exist_service',
        isService: isService,
        isSystem: isSystem,
        kind: kind
    };
}

function emptyOpinionBucket() {
    return { pos: 0, neg: 0, partial: 0, revision: 0 };
}

function emptyUnitOpinions() {
    return { pos: 0, neg: 0, revision: 0 };
}

function emptyLifeUnit() {
    return { sistem: emptyUnitOpinions(), xidmet: emptyUnitOpinions() };
}

function emptyResultSplit() {
    return { pos: 0, neg: 0, revision: 0, baxilir: 0, none: 0, total: 0 };
}

function emptyMeqsedKindCounts() {
    var o = { other: 0 };
    (MEQSED_NOVU_KINDS || []).forEach(function(k) { o[k] = 0; });
    return o;
}

function emptyMeqsedKindSplits() {
    var o = { other: emptyResultSplit() };
    (MEQSED_NOVU_KINDS || []).forEach(function(k) { o[k] = emptyResultSplit(); });
    return o;
}

function meqsedResultKey(r) {
    var info = getMeqsedInfo(r && r.task);
    var op = (info && info.opinionKind) || '';
    if (op === 'pos' || op === 'neg' || op === 'revision') return op;
    if (rowStatusGroup(r) === 'progress') return 'baxilir';
    return '';
}

function meqsedReviewDays(t) {
    if (!t || !t.fields) return null;
    var start = getTaskStartDate(t) || getTaskCreatedDate(t);
    var end = parsePhaseDate(t.fields.resolutiondate);
    var statusName = (t.fields.status && t.fields.status.name) || '';
    if (!end && getStatusGroup(statusName) === 'done') {
        end = parsePhaseDate(t.fields.updated);
    }
    if (!start || !end) return null;
    var days = Math.round((end.getTime() - start.getTime()) / 86400000);
    if (!isFinite(days) || days < 0 || days > 3650) return null;
    return days;
}

function bumpResultSplit(bucket, key) {
    if (!bucket) return;
    bucket.total += 1;
    if (key && Object.prototype.hasOwnProperty.call(bucket, key)) bucket[key] += 1;
    else bucket.none += 1;
}

function collectMeqsedListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        pos: 0,
        neg: 0,
        partial: 0,
        other: 0,
        yeni: 0,
        movcud: 0,
        sistem: 0,
        xidmet: 0,
        xidmetUnits: 0,
        byKind: emptyMeqsedKindCounts(),
        byLifecycle: { yeni: emptyOpinionBucket(), movcud: emptyOpinionBucket() },
        byLifeUnit: { yeni: emptyLifeUnit(), movcud: emptyLifeUnit() },
        sistemPos: 0,
        sistemNeg: 0,
        sistemPartial: 0,
        sistemRevision: 0,
        xidmetPos: 0,
        xidmetNeg: 0,
        xidmetUnitsPos: 0,
        xidmetUnitsNeg: 0,
        xidmetUnitsPartial: 0,
        xidmetUnitsRevision: 0,
        byStatus: emptyStatusCounts(),
        baxilir: 0,
        progressAll: 0,
        avgDays: null,
        avgDaysN: 0,
        resubmitPct: null,
        resubmitN: 0,
        resubmitDenom: 0,
        byMonth: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(emptyResultSplit),
        byKindResult: emptyMeqsedKindSplits(),
        topQurums: [],
        qurumAll: 0
    };
    var qset = {};
    var qcount = {};
    var resubmitGroups = {};
    var reviewSum = 0;
    var reviewN = 0;
    (rows || []).forEach(function(r) {
        var info = getMeqsedInfo(r && r.task);
        var units = meqsedRowUnits(info);
        var opinion = (info && info.opinionKind) || '';
        var result = meqsedResultKey(r);
        stats.total += 1;
        var sg = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, sg)) sg = 'other';
        stats.byStatus[sg] += 1;
        if (sg === 'progress') stats.progressAll += 1;
        if (result === 'baxilir') stats.baxilir += 1;
        var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || '';
        if (qk) {
            qset[qk] = true;
            if (!qcount[qk]) {
                qcount[qk] = { name: canonicalQurumName(r && r.qurum) || (r && r.qurum) || '—', n: 0 };
            }
            qcount[qk].n += 1;
        }
        var kind = units.kind || 'other';
        if (!Object.prototype.hasOwnProperty.call(stats.byKind, kind)) kind = 'other';
        stats.byKind[kind] += 1;
        bumpResultSplit(stats.byKindResult[kind], result || 'none');
        var when = getTaskStartDate(r && r.task) || getTaskCreatedDate(r && r.task);
        if (when && isFinite(when.getTime())) {
            bumpResultSplit(stats.byMonth[when.getMonth()], result || 'none');
        }
        if (units.isNew) stats.yeni += 1;
        if (units.isExist) stats.movcud += 1;
        if (units.isSystem) stats.sistem += 1;
        if (units.isService) stats.xidmet += 1;
        stats.xidmetUnits += units.xidmet;
        var lifeKey = units.isNew ? 'yeni' : (units.isExist ? 'movcud' : '');
        var unitKey = units.isSystem ? 'sistem' : (units.isService ? 'xidmet' : '');
        function bumpLife(op) {
            if (lifeKey && Object.prototype.hasOwnProperty.call(stats.byLifecycle[lifeKey], op)) {
                stats.byLifecycle[lifeKey][op] += 1;
            }
            if (lifeKey && unitKey && stats.byLifeUnit[lifeKey] && stats.byLifeUnit[lifeKey][unitKey]
                && Object.prototype.hasOwnProperty.call(stats.byLifeUnit[lifeKey][unitKey], op)) {
                var add = unitKey === 'xidmet' ? (units.xidmet || 0) : 1;
                if (add > 0) stats.byLifeUnit[lifeKey][unitKey][op] += add;
            }
        }
        if (opinion === 'pos') {
            stats.pos += 1;
            bumpLife('pos');
            if (units.isSystem) stats.sistemPos += 1;
            if (units.isService) {
                stats.xidmetPos += 1;
                stats.xidmetUnitsPos += units.xidmet;
            }
        } else if (opinion === 'neg') {
            stats.neg += 1;
            bumpLife('neg');
            if (units.isSystem) stats.sistemNeg += 1;
            if (units.isService) {
                stats.xidmetNeg += 1;
                stats.xidmetUnitsNeg += units.xidmet;
            }
        } else if (opinion === 'partial') {
            stats.partial += 1;
            bumpLife('partial');
            if (units.isSystem) stats.sistemPartial += 1;
            if (units.isService) stats.xidmetUnitsPartial += units.xidmet;
        } else if (opinion === 'revision') {
            stats.other += 1;
            bumpLife('revision');
            if (units.isSystem) stats.sistemRevision += 1;
            if (units.isService) stats.xidmetUnitsRevision += units.xidmet;
        }
        if (opinion === 'pos' || opinion === 'neg' || opinion === 'revision') {
            var days = meqsedReviewDays(r && r.task);
            if (days != null) {
                reviewSum += days;
                reviewN += 1;
            }
        }
        var rk = (qk || '') + '|' + normalizeStr(
            (info && (info.sistemAdi || info.xidmetMelumat))
            || (r && r.task && r.task.fields && r.task.fields.summary)
            || ''
        );
        if (!resubmitGroups[rk]) resubmitGroups[rk] = [];
        resubmitGroups[rk].push({
            t: when && isFinite(when.getTime()) ? when.getTime() : 0,
            opinion: opinion
        });
    });
    stats.qurum = Object.keys(qset).length;
    stats.qurumAll = countQurums(collectCategoryTasks('meqsed'));
    stats.avgDaysN = reviewN;
    stats.avgDays = reviewN ? Math.round(reviewSum / reviewN) : null;
    stats.topQurums = Object.keys(qcount).map(function(k) {
        return qcount[k];
    }).sort(function(a, b) {
        return (b.n - a.n) || String(a.name).localeCompare(String(b.name), 'az');
    }).slice(0, 8);
    var resubmitN = 0;
    var resubmitDenom = 0;
    Object.keys(resubmitGroups).forEach(function(k) {
        var items = resubmitGroups[k].slice().sort(function(a, b) { return a.t - b.t; });
        var seenRev = false;
        var i;
        for (i = 0; i < items.length; i++) {
            if (items[i].opinion === 'revision') seenRev = true;
            else if (seenRev && (items[i].opinion === 'pos' || items[i].opinion === 'neg')) {
                resubmitDenom += 1;
                if (items[i].opinion === 'pos') resubmitN += 1;
                seenRev = false;
            }
        }
    });
    stats.resubmitN = resubmitN;
    stats.resubmitDenom = resubmitDenom;
    stats.resubmitPct = resubmitDenom ? Math.round((resubmitN / resubmitDenom) * 100) : null;
    return stats;
}

var MEQSED_DASH_FILTER_LABELS = {
    pos: 'Müsbət rəy',
    neg: 'Mənfi rəy',
    partial: 'Qismən',
    revision: 'Düzəlişə göndərildi',
    baxilir: 'İcradadır',
    yeni: 'Yeni yaradılan',
    movcud: 'Mövcudda dəyişiklik',
    sistem: 'Sistem',
    xidmet: 'Xidmət',
    new_system: MEQSED_NOVU_LABELS.new_system,
    exist_system: MEQSED_NOVU_LABELS.exist_system,
    new_service: MEQSED_NOVU_LABELS.new_service,
    exist_service: MEQSED_NOVU_LABELS.exist_service,
    fiziki: MEQSED_NOVU_LABELS.fiziki,
    rsd: MEQSED_NOVU_LABELS.rsd,
    cloud: MEQSED_NOVU_LABELS.cloud,
    other: MEQSED_NOVU_LABELS.other,
    sistem_pos: 'Sistem — müsbət',
    sistem_neg: 'Sistem — mənfi',
    sistem_partial: 'Sistem — qismən',
    sistem_revision: 'Sistem — düzəlişə göndərildi',
    xidmet_pos: 'Xidmət — müsbət',
    xidmet_neg: 'Xidmət — mənfi',
    xidmet_partial: 'Xidmət — qismən',
    xidmet_revision: 'Xidmət — düzəlişə göndərildi',
    yeni_pos: 'Yeni — müsbət',
    yeni_neg: 'Yeni — mənfi',
    yeni_partial: 'Yeni — qismən',
    yeni_revision: 'Yeni — düzəlişə göndərildi',
    movcud_pos: 'Mövcud — müsbət',
    movcud_neg: 'Mövcud — mənfi',
    movcud_partial: 'Mövcud — qismən',
    movcud_revision: 'Mövcud — düzəlişə göndərildi'
};

var COMMON_DASH_FILTER_LABELS = {
    has_result: 'Nəticəsi olan',
    no_result: 'Nəticəsiz',
    orgs: 'Müraciət edən qurumlar',
    score_high: 'Bal ≥ 70',
    score_mid: 'Bal 40–69',
    score_low: 'Bal < 40',
    score_none: 'Balsız',
    svc_none: 'Xidmət yox',
    svc_1_5: '1–5 xidmət',
    svc_6_20: '6–20 xidmət',
    svc_21: '21+ xidmət',
    svc_sum: 'Xidməti olan'
};

STATUS_GROUP_ORDER.forEach(function(g) {
    COMMON_DASH_FILTER_LABELS['st_' + g] = STATUS_GROUP_LABELS[g] || g;
});

function listDashFilter(section) {
    return listDashFilterByTab[section || activeTab] || '';
}

function listDashFilterOn(section, key) {
    var cur = listDashFilter(section);
    if (key === 'all') return cur === 'all';
    return cur === key;
}

function listDashFilterLabel(section, key) {
    if (!key) return '';
    if (key === 'all') return 'Bütün qurumlar';
    if (section === 'meqsed' && MEQSED_DASH_FILTER_LABELS[key]) return MEQSED_DASH_FILTER_LABELS[key];
    if (COMMON_DASH_FILTER_LABELS[key]) return COMMON_DASH_FILTER_LABELS[key];
    return key;
}

function rowStatusGroup(r) {
    var name = r && r.task && r.task.fields && r.task.fields.status ? r.task.fields.status.name : '';
    return getStatusGroup(name) || 'other';
}

function scoreBandKey(n) {
    if (n == null || !isFinite(n)) return 'score_none';
    if (n >= 70) return 'score_high';
    if (n >= 40) return 'score_mid';
    return 'score_low';
}

function exqSvcBandKey(count) {
    if (count == null || !isFinite(count) || count <= 0) return 'svc_none';
    if (count <= 5) return 'svc_1_5';
    if (count <= 20) return 'svc_6_20';
    return 'svc_21';
}

function hasTextResult(val) {
    var t = formatAssessmentFieldText(val);
    return !!(t && t !== '—');
}

function emptyStatusCounts() {
    var out = {};
    STATUS_GROUP_ORDER.forEach(function(g) { out[g] = 0; });
    return out;
}

function countQurums(rows) {
    var qset = {};
    (rows || []).forEach(function(r, i) {
        var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || ('__row_' + (i + 1));
        if (qk) qset[qk] = true;
    });
    return Object.keys(qset).length;
}

function qurumRowKey(r, i) {
    return qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || ('__row_' + ((i || 0) + 1));
}

function preferExqQurumRow(a, b) {
    var ca = getExqServiceCount(a && a.task);
    var cb = getExqServiceCount(b && b.task);
    var na = ca != null && isFinite(ca) && ca > 0 ? ca : -1;
    var nb = cb != null && isFinite(cb) && cb > 0 ? cb : -1;
    if (nb !== na) return nb > na ? b : a;
    var sa = exqNumericScore(a);
    var sb = exqNumericScore(b);
    if ((sa == null) !== (sb == null)) return sb != null ? b : a;
    return a;
}

function uniqueQurumRows(rows, pick) {
    var map = {};
    var keys = [];
    (rows || []).forEach(function(r, i) {
        var qk = qurumRowKey(r, i);
        if (!map[qk]) {
            map[qk] = r;
            keys.push(qk);
            return;
        }
        map[qk] = pick ? pick(map[qk], r) : map[qk];
    });
    return keys.map(function(k) { return map[k]; });
}

function avgOf(nums) {
    if (!nums || !nums.length) return null;
    var sum = 0;
    nums.forEach(function(n) { sum += n; });
    return Math.round((sum / nums.length) * 10) / 10;
}

function formatAvg(n) {
    return n == null ? '—' : String(n);
}

function scoreToneClass(n) {
    var k = scoreBandKey(n);
    if (k === 'score_high') return 'high';
    if (k === 'score_mid') return 'mid';
    if (k === 'score_low') return 'low';
    return 'none';
}

function exqScoreMeterHtml(score, opts) {
    opts = opts || {};
    var has = score != null && isFinite(Number(score));
    var n = has ? Number(score) : null;
    var pct = has ? Math.max(0, Math.min(100, n)) : 0;
    var tone = scoreToneClass(n);
    var shown = has ? (Math.round(n * 10) / 10) : '—';
    var avg = opts.avg;
    var avgPct = avg != null && isFinite(avg) ? Math.max(0, Math.min(100, avg)) : null;
    var cls = 'exq-meter is-' + tone + (opts.compact ? ' is-compact' : '');
    var avgMark = avgPct != null
        ? '<em class="exq-meter-avg" style="left:' + avgPct + '%" title="Ümumi orta: ' + escapeHtml(formatAvg(avg)) + '"></em>'
        : '';
    return '<div class="' + cls + '">'
        + '<div class="exq-meter-top">'
        + '<span>' + escapeHtml(opts.label || 'Orta bal') + '</span>'
        + '<b>' + (has ? escapeHtml(String(shown)) + ' <i>/ 100</i>' : '—') + '</b>'
        + '</div>'
        + '<div class="exq-meter-track" role="meter" aria-valuemin="0" aria-valuemax="100"'
        + (has ? ' aria-valuenow="' + Math.round(pct) + '"' : ' aria-valuetext="Bal yoxdur"')
        + '>'
        + '<i style="width:' + pct + '%"></i>'
        + avgMark
        + '</div></div>';
}

function exqSvcHeroHtml(sum, qurumN, filterKey) {
    var section = 'exq';
    var on = filterKey && listDashFilterOn(section, filterKey);
    var n = Number(sum) || 0;
    return '<button type="button" class="exq-svc-hero' + (on ? ' is-active' : '') + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' title="Qiymətləndirilmiş xidmətləri göstər"'
        + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + (filterKey || 'svc_sum') + '\')">'
        + '<span>Ümumi xidmət sayı</span>'
        + '<b>' + n + '</b>'
        + '<em>' + (qurumN || 0) + ' qurumda qiymətləndirilib</em>'
        + '</button>';
}

function exqRowMetricsHtml(score, count, avg, maxSvc) {
    var n = parseScoreForSort(score);
    var svcN = count == null || !isFinite(Number(count)) ? 0 : Number(count);
    var hasSvc = count != null && isFinite(Number(count));
    var pct = maxSvc > 0 ? Math.round((svcN / maxSvc) * 100) : 0;
    return '<div class="exq-row-metrics">'
        + '<div class="exq-row-svc-bar">'
        + '<div class="exq-row-svc"><span>Qiymətləndirilmiş xidmət</span><b>' + (hasSvc ? svcN : '—') + '</b></div>'
        + '<div class="exq-meter-track" aria-hidden="true"><i style="width:' + pct + '%"></i></div>'
        + '</div>'
        + exqScoreMeterHtml(n, { label: 'Bal', compact: true, avg: avg })
        + '</div>';
}

function meqsedRowMatchesDashFilter(r, filter) {
    if (!filter || filter === 'all' || filter === 'orgs') return true;
    if (filter.indexOf('st_') === 0) return rowStatusGroup(r) === filter.slice(3);
    var info = getMeqsedInfo(r && r.task);
    var units = meqsedRowUnits(info);
    var opinion = (info && info.opinionKind) || '';
    var kind = units.kind || 'other';
    if (filter === 'pos') return opinion === 'pos';
    if (filter === 'neg') return opinion === 'neg';
    if (filter === 'partial') return opinion === 'partial';
    if (filter === 'revision') return opinion === 'revision';
    if (filter === 'baxilir') return meqsedResultKey(r) === 'baxilir';
    if (filter === 'yeni') return !!units.isNew;
    if (filter === 'movcud') return !!units.isExist;
    if (filter === 'sistem') return !!units.isSystem;
    if (filter === 'xidmet') return !!units.isService;
    if (filter === 'sistem_pos') return !!(units.isSystem && opinion === 'pos');
    if (filter === 'sistem_neg') return !!(units.isSystem && opinion === 'neg');
    if (filter === 'sistem_partial') return !!(units.isSystem && opinion === 'partial');
    if (filter === 'sistem_revision') return !!(units.isSystem && opinion === 'revision');
    if (filter === 'xidmet_pos') return !!(units.isService && opinion === 'pos');
    if (filter === 'xidmet_neg') return !!(units.isService && opinion === 'neg');
    if (filter === 'xidmet_partial') return !!(units.isService && opinion === 'partial');
    if (filter === 'xidmet_revision') return !!(units.isService && opinion === 'revision');
    if (filter === 'yeni_pos') return !!(units.isNew && opinion === 'pos');
    if (filter === 'yeni_neg') return !!(units.isNew && opinion === 'neg');
    if (filter === 'yeni_partial') return !!(units.isNew && opinion === 'partial');
    if (filter === 'yeni_revision') return !!(units.isNew && opinion === 'revision');
    if (filter === 'movcud_pos') return !!(units.isExist && opinion === 'pos');
    if (filter === 'movcud_neg') return !!(units.isExist && opinion === 'neg');
    if (filter === 'movcud_partial') return !!(units.isExist && opinion === 'partial');
    if (filter === 'movcud_revision') return !!(units.isExist && opinion === 'revision');
    if (filter === 'new_system' || filter === 'exist_system' || filter === 'new_service'
        || filter === 'exist_service' || filter === 'fiziki' || filter === 'rsd'
        || filter === 'cloud' || filter === 'other') {
        return kind === filter;
    }
    return true;
}

function diagRowMatchesDashFilter(r, filter) {
    if (!filter) return true;
    if (filter.indexOf('st_') === 0) return rowStatusGroup(r) === filter.slice(3);
    var score = diagNumericScore(r);
    if (filter === 'has_result') return score != null;
    if (filter === 'no_result') return score == null;
    if (filter === 'score_high' || filter === 'score_mid' || filter === 'score_low' || filter === 'score_none') {
        return scoreBandKey(score) === filter;
    }
    return true;
}

function isqRowMatchesDashFilter(r, filter) {
    if (!filter) return true;
    if (filter.indexOf('st_') === 0) return rowStatusGroup(r) === filter.slice(3);
    var score = isqNumericScore(r);
    if (filter === 'has_result') return score != null;
    if (filter === 'no_result') return score == null;
    if (filter === 'score_high' || filter === 'score_mid' || filter === 'score_low' || filter === 'score_none') {
        return scoreBandKey(score) === filter;
    }
    return true;
}

function exqRowMatchesDashFilter(r, filter) {
    if (!filter) return true;
    if (filter.indexOf('st_') === 0) return rowStatusGroup(r) === filter.slice(3);
    var t = r && r.task;
    var count = getExqServiceCount(t);
    var score = exqNumericScore(r);
    var has = score != null || hasTextResult(t && t.fields && t.fields.customfield_17317);
    if (filter === 'has_result') return has;
    if (filter === 'no_result') return !has;
    if (filter === 'svc_sum') return count != null && count > 0;
    if (filter === 'svc_none' || filter === 'svc_1_5' || filter === 'svc_6_20' || filter === 'svc_21') {
        return exqSvcBandKey(count) === filter;
    }
    if (filter === 'score_high' || filter === 'score_mid' || filter === 'score_low' || filter === 'score_none') {
        return scoreBandKey(score) === filter;
    }
    return true;
}

function selfRowMatchesDashFilter(r, filter) {
    if (!filter) return true;
    if (filter.indexOf('st_') === 0) return rowStatusGroup(r) === filter.slice(3);
    var score = selfNumericScore(r);
    if (filter === 'has_result') return score != null;
    if (filter === 'no_result') return score == null;
    if (filter === 'score_high' || filter === 'score_mid' || filter === 'score_low' || filter === 'score_none') {
        return scoreBandKey(score) === filter;
    }
    return true;
}

function rowMatchesListDashFilter(section, r, filter) {
    if (!filter || filter === 'all') return true;
    if (section === 'meqsed') return meqsedRowMatchesDashFilter(r, filter);
    if (section === 'diag') return diagRowMatchesDashFilter(r, filter);
    if (section === 'isq') return isqRowMatchesDashFilter(r, filter);
    if (section === 'exq') return exqRowMatchesDashFilter(r, filter);
    if (section === 'self') return selfRowMatchesDashFilter(r, filter);
    return true;
}

function filterRowsByListDash(section, rows) {
    var filter = listDashFilter(section);
    if (!filter) return rows || [];
    return (rows || []).filter(function(r) {
        return rowMatchesListDashFilter(section, r, filter);
    });
}

function ldKpi(section, label, value, filterKey, extraClass) {
    var clickable = !!filterKey;
    var on = clickable && listDashFilterOn(section, filterKey);
    var cls = 'meqsed-ld-kpi'
        + (extraClass ? ' ' + extraClass : '')
        + (clickable ? ' is-clickable' : '')
        + (on ? ' is-active' : '');
    if (!clickable) {
        return '<article class="' + cls + '">'
            + '<span>' + escapeHtml(label) + '</span>'
            + '<strong>' + escapeHtml(String(value)) + '</strong>'
            + '</article>';
    }
    return '<button type="button" class="' + cls + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' title="' + escapeHtml(label) + ' üzrə siyahını göstər"'
        + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + filterKey + '\')">'
        + '<span>' + escapeHtml(label) + '</span>'
        + '<strong>' + escapeHtml(String(value)) + '</strong>'
        + '</button>';
}

function ldSplitChip(section, label, n, filterKey) {
    var on = listDashFilterOn(section, filterKey);
    return '<button type="button" class="meqsed-ld-chip' + (on ? ' is-active' : '') + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + filterKey + '\')">'
        + escapeHtml(label) + ' <b>' + n + '</b></button>';
}

function ldKindRow(section, label, n, total, filterKey) {
    var pct = total ? Math.round((n / total) * 100) : 0;
    var on = listDashFilterOn(section, filterKey);
    return '<button type="button" class="meqsed-ld-kind' + (on ? ' is-active' : '') + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + filterKey + '\')">'
        + '<div class="meqsed-ld-kind-meta"><span>' + escapeHtml(label) + '</span><b>' + n + '</b></div>'
        + '<div class="meqsed-ld-kind-track" aria-hidden="true"><i style="width:' + pct + '%"></i></div>'
        + '</button>';
}

function ldReyPill(section, label, n, filterKey, tone) {
    var on = listDashFilterOn(section, filterKey);
    return '<button type="button" class="meqsed-ld-pill is-' + tone + (on ? ' is-active' : '') + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + filterKey + '\')">'
        + escapeHtml(label) + ' ' + n + '</button>';
}

function ldHead(section, title) {
    var period = periodLabel(selectedYear);
    var filter = listDashFilter(section);
    var filterLabel = listDashFilterLabel(section, filter);
    var allOn = listDashFilterOn(section, 'all');
    return '<div class="meqsed-ld-head">'
        + '<div class="meqsed-ld-head-left">'
        + '<h3>' + escapeHtml(title) + '</h3>'
        + '<button type="button" class="assess-ld-full-list' + (allOn ? ' is-active' : '') + '"'
        + ' aria-pressed="' + (allOn ? 'true' : 'false') + '"'
        + ' title="Bu fəaliyyət üzrə bütün qurum siyahısını göstər"'
        + ' onclick="event.stopPropagation(); showAssessFullList()">'
        + 'Bütün siyahı</button>'
        + listSortBtnHtml(section)
        + '</div>'
        + '<div class="meqsed-ld-head-right">'
        + '<p>' + escapeHtml(period) + '</p>'
        + (filterLabel
            ? '<button type="button" class="meqsed-ld-clear" onclick="event.stopPropagation(); setAssessListFilter(\'\')" title="Filtri sıfırla">'
                + 'Filtr: ' + escapeHtml(filterLabel) + ' ×</button>'
            : '')
        + '</div></div>';
}

function ldStatusRowsHtml(section, byStatus, total) {
    var items = STATUS_GROUP_ORDER.filter(function(g) { return (byStatus[g] || 0) > 0; });
    if (!items.length) {
        return '<p class="meqsed-ld-chart-empty" style="padding:0.75rem 0">Status məlumatı yoxdur.</p>';
    }
    return '<div class="meqsed-ld-status">'
        + items.map(function(g) {
            var n = byStatus[g] || 0;
            var pct = total ? Math.round((n / total) * 100) : 0;
            var on = listDashFilterOn(section, 'st_' + g);
            return '<button type="button" class="meqsed-ld-status-chip is-' + g + (on ? ' is-active' : '') + '"'
                + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
                + ' title="' + escapeHtml(STATUS_GROUP_LABELS[g] || g) + ' üzrə siyahını göstər"'
                + ' onclick="event.stopPropagation(); setAssessListFilter(\'st_' + g + '\')">'
                + '<span class="meqsed-ld-status-chip-label">' + escapeHtml(STATUS_GROUP_LABELS[g] || g) + '</span>'
                + '<strong>' + n + '</strong>'
                + '<em>' + pct + '%</em>'
                + '</button>';
        }).join('')
        + '</div>';
}

function collectDiagListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        hasResult: 0,
        noResult: 0,
        byStatus: emptyStatusCounts(),
        byBand: { score_high: 0, score_mid: 0, score_low: 0, score_none: 0 },
        scores: [],
        dirRadar: [],
        bestDirection: null
    };
    var overallByQurum = {};
    var dirByQurum = {};
    var dirTitles = [];
    (rows || []).forEach(function(r, i) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var score = diagNumericScore(r);
        var band = scoreBandKey(score);
        stats.byBand[band] += 1;
        var qk = qurumRowKey(r, i);
        if (score != null) {
            stats.hasResult += 1;
            stats.scores.push(score);
            if (!overallByQurum[qk]) overallByQurum[qk] = [];
            overallByQurum[qk].push(score);
        } else {
            stats.noResult += 1;
        }
        var parsed = parseDiagUmumiNetice(r && r.task && r.task.fields && r.task.fields.customfield_17319);
        var dirs = (parsed && parsed.directions) || [];
        if (!dirTitles.length && dirs.length) {
            dirTitles = dirs.map(function(d) { return d.title; });
        }
        dirs.forEach(function(d) {
            var n = parseScoreForSort(d && d.score);
            if (n == null) return;
            if (!dirByQurum[qk]) dirByQurum[qk] = {};
            if (!dirByQurum[qk][d.title]) dirByQurum[qk][d.title] = [];
            dirByQurum[qk][d.title].push(n);
        });
    });
    stats.qurum = countQurums(rows);
    var qurumOverall = Object.keys(overallByQurum).map(function(k) {
        return avgOf(overallByQurum[k]);
    }).filter(function(n) { return n != null && isFinite(n); });
    var countryAvg = avgOf(qurumOverall);
    stats.avg = countryAvg != null ? countryAvg : avgOf(stats.scores);
    stats.dirRadar = (dirTitles.length ? dirTitles : []).map(function(title) {
        var qurumAvgs = Object.keys(dirByQurum).map(function(qk) {
            return avgOf(dirByQurum[qk][title]);
        }).filter(function(n) { return n != null && isFinite(n); });
        var dirAvg = avgOf(qurumAvgs);
        return {
            title: title,
            short: diagDirShortLabel(title),
            avg: dirAvg,
            target: diagMaturityTarget(dirAvg),
            qurumN: qurumAvgs.length
        };
    });
    var ranked = stats.dirRadar.filter(function(d) { return d.avg != null && isFinite(d.avg); })
        .slice().sort(function(a, b) { return b.avg - a.avg; });
    stats.bestDirection = ranked.length ? ranked[0] : null;
    return stats;
}

function diagDirShortLabel(title) {
    var n = normalizeStr(title);
    if (n.indexOf('strategiya') !== -1) return 'Strategiya';
    if (n.indexOf('texniki') !== -1 || n.indexOf('infrastruktur') !== -1) return 'Texniki-texnoloji';
    if (n.indexOf('xidmət') !== -1 || n.indexOf('xidmet') !== -1) return 'Xidmətlər';
    if (n.indexOf('məliyyat') !== -1 || n.indexOf('emeliyyat') !== -1) return 'Əməliyyat';
    return String(title || '').replace(/\s+üzrə nəticə/gi, '');
}

function diagMaturityTarget(score) {
    if (score == null || !isFinite(score)) return null;
    if (score < 25) return (25 + 49) / 2;
    if (score < 50) return (50 + 74) / 2;
    if (score < 75) return (75 + 100) / 2;
    return 100;
}

function isqNumericScore(r) {
    var raw = r && r.task && r.task.fields ? r.task.fields.customfield_17316 : null;
    var text = formatAssessmentFieldText(raw);
    var n = parseScoreForSort(text);
    if (n != null) return n;
    return parseScoreForSort(raw);
}

function exqNumericScore(r) {
    return parseScoreForSort(getExqScore(r && r.task));
}

function collectIsqListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        hasResult: 0,
        noResult: 0,
        byStatus: emptyStatusCounts(),
        byBand: { score_high: 0, score_mid: 0, score_low: 0, score_none: 0 },
        avg: null
    };
    var byQurumScores = {};
    (rows || []).forEach(function(r) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var score = isqNumericScore(r);
        var band = scoreBandKey(score);
        stats.byBand[band] += 1;
        var has = score != null || hasTextResult(r && r.task && r.task.fields && r.task.fields.customfield_17316);
        if (has) stats.hasResult += 1;
        else stats.noResult += 1;
        if (score == null) return;
        var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || '';
        if (!qk) return;
        if (!byQurumScores[qk]) byQurumScores[qk] = [];
        byQurumScores[qk].push(score);
    });
    var qurumAvgs = Object.keys(byQurumScores).map(function(k) {
        return avgOf(byQurumScores[k]);
    }).filter(function(n) { return n != null && isFinite(n); });
    stats.avg = avgOf(qurumAvgs);
    stats.qurum = countQurums(rows);
    return stats;
}

function collectSelfListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        hasResult: 0,
        noResult: 0,
        byStatus: emptyStatusCounts(),
        byBand: { score_high: 0, score_mid: 0, score_low: 0, score_none: 0 },
        scores: [],
        dirRadar: [],
        bestDirection: null,
        avg: null
    };
    var overallByQurum = {};
    var dirByQurum = {};
    var dirTitles = (SELF_DIR_FIELDS || []).map(function(d) { return d.title; });
    (rows || []).forEach(function(r, i) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var info = getSelfAssessInfo(r && r.task);
        var score = parseScoreForSort(info && info.score);
        stats.byBand[scoreBandKey(score)] += 1;
        var qk = qurumRowKey(r, i);
        if (score != null) {
            stats.hasResult += 1;
            stats.scores.push(score);
            if (!overallByQurum[qk]) overallByQurum[qk] = [];
            overallByQurum[qk].push(score);
        } else {
            stats.noResult += 1;
        }
        var dirs = (info && info.directions) || [];
        dirs.forEach(function(d) {
            var n = parseScoreForSort(d && d.score);
            if (n == null) return;
            if (!dirByQurum[qk]) dirByQurum[qk] = {};
            if (!dirByQurum[qk][d.title]) dirByQurum[qk][d.title] = [];
            dirByQurum[qk][d.title].push(n);
        });
    });
    stats.qurum = countQurums(rows);
    var qurumOverall = Object.keys(overallByQurum).map(function(k) {
        return avgOf(overallByQurum[k]);
    }).filter(function(n) { return n != null && isFinite(n); });
    var countryAvg = avgOf(qurumOverall);
    stats.avg = countryAvg != null ? countryAvg : avgOf(stats.scores);
    stats.dirRadar = dirTitles.map(function(title) {
        var qurumAvgs = Object.keys(dirByQurum).map(function(qk) {
            return avgOf(dirByQurum[qk][title]);
        }).filter(function(n) { return n != null && isFinite(n); });
        var dirAvg = avgOf(qurumAvgs);
        return {
            title: title,
            short: diagDirShortLabel(title),
            avg: dirAvg,
            target: diagMaturityTarget(dirAvg),
            qurumN: qurumAvgs.length
        };
    });
    var ranked = stats.dirRadar.filter(function(d) { return d.avg != null && isFinite(d.avg); })
        .slice().sort(function(a, b) { return b.avg - a.avg; });
    stats.bestDirection = ranked.length ? ranked[0] : null;
    return stats;
}

function collectExqListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        hasResult: 0,
        noResult: 0,
        svcSum: 0,
        withSvc: 0,
        avg: null,
        weightedAvg: null,
        scoreWeight: 0,
        scoreWeightedSum: 0,
        byStatus: emptyStatusCounts(),
        byBand: { score_high: 0, score_mid: 0, score_low: 0, score_none: 0 },
        bySvc: { svc_none: 0, svc_1_5: 0, svc_6_20: 0, svc_21: 0 },
        byQurum: []
    };
    var byQurumScores = {};
    var byQurumMap = {};
    (rows || []).forEach(function(r) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var t = r && r.task;
        var count = getExqServiceCount(t);
        var score = exqNumericScore(r);
        var band = exqSvcBandKey(count);
        stats.bySvc[band] += 1;
        stats.byBand[scoreBandKey(score)] += 1;
        if (count != null && count > 0) {
            stats.svcSum += count;
            stats.withSvc += 1;
        }
        var has = score != null || hasTextResult(t && t.fields && t.fields.customfield_17317);
        if (has) stats.hasResult += 1;
        else stats.noResult += 1;
        var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || ('__row_' + stats.total);
        var qName = canonicalQurumName(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || '—';
        if (!byQurumMap[qk]) byQurumMap[qk] = { key: qk, name: qName, svc: 0, scores: [], hasResult: false };
        if (count != null && count > 0) byQurumMap[qk].svc += count;
        if (score != null) byQurumMap[qk].scores.push(score);
        if (has || (count != null && count > 0)) byQurumMap[qk].hasResult = true;
        if (score == null) return;
        var weight = count != null && count > 0 ? count : 1;
        stats.scoreWeight += weight;
        stats.scoreWeightedSum += score * weight;
        if (!byQurumScores[qk]) byQurumScores[qk] = [];
        byQurumScores[qk].push(score);
    });
    var qurumAvgs = Object.keys(byQurumScores).map(function(k) {
        return avgOf(byQurumScores[k]);
    }).filter(function(n) { return n != null && isFinite(n); });
    stats.avg = avgOf(qurumAvgs);
    if (stats.scoreWeight > 0) {
        stats.weightedAvg = Math.round((stats.scoreWeightedSum / stats.scoreWeight) * 10) / 10;
    }
    stats.byQurum = Object.keys(byQurumMap).map(function(k) {
        var row = byQurumMap[k];
        return {
            key: row.key,
            name: row.name,
            svc: row.svc || 0,
            score: avgOf(row.scores),
            hasResult: !!row.hasResult
        };
    }).sort(function(a, b) {
        var aHas = a.score != null && isFinite(a.score);
        var bHas = b.score != null && isFinite(b.score);
        if (aHas && bHas && b.score !== a.score) return b.score - a.score;
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (b.svc !== a.svc) return b.svc - a.svc;
        return String(a.name).localeCompare(String(b.name), 'az');
    });
    stats.qurum = stats.byQurum.length;
    stats.qurumWithSvc = stats.byQurum.filter(function(q) {
        return (q.svc || 0) > 0;
    }).length;
    return stats;
}

function ldSideMeta(label, value, filterKey) {
    var clickable = !!filterKey;
    var on = clickable && listDashFilterOn(currentAssessSection(), filterKey);
    var cls = 'exq-ld-svc-total' + (on ? ' is-active' : '');
    if (!clickable) {
        return '<span class="' + cls + ' is-static" aria-hidden="false">'
            + '<span>' + escapeHtml(label) + '</span><b>' + escapeHtml(String(value)) + '</b></span>';
    }
    return '<button type="button" class="' + cls + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' title="' + escapeHtml(label) + ' üzrə siyahını göstər"'
        + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + filterKey + '\')">'
        + '<span>' + escapeHtml(label) + '</span><b>' + escapeHtml(String(value)) + '</b></button>';
}

function ldComboCard(title, leftHtml, chartLabel, hasChart, ariaLabel, gridClass, chartExtraHtml) {
    var section = currentAssessSection();
    return ldHead(section, title)
        + '<div class="meqsed-ld-card assess-ld-panel exq-ld-combo assess-ld-combo">'
        + '<div class="exq-ld-combo-body assess-ld-panel-grid ' + (gridClass || 'assess-ld-panel-grid--exq') + '">'
        + '<div class="exq-ld-side assess-ld-block">' + leftHtml + '</div>'
        + '<div class="exq-ld-chart-pane assess-ld-block">'
        + '<div class="assess-ld-donut-meta">'
        + '<p class="assess-ld-block-label">' + escapeHtml(chartLabel) + '</p>'
        + (chartExtraHtml || '')
        + '</div>'
        + '<div class="meqsed-ld-chart-box exq-ld-status-chart assess-ld-donut">'
        + (hasChart
            ? '<canvas id="assessListDonut" aria-label="' + escapeHtml(ariaLabel || chartLabel) + '"></canvas>'
            : '<p class="meqsed-ld-chart-empty">' + escapeHtml(chartLabel) + ' məlumatı yoxdur.</p>')
        + '</div></div></div></div>';
}

function currentAssessSection() {
    var el = document.getElementById('assessListDash') || document.getElementById('meqsedListDash');
    return (el && el.getAttribute('data-section')) || state.assessmentTab || '';
}

function hasStatusSlices(byStatus) {
    return STATUS_GROUP_ORDER.some(function(g) { return (byStatus[g] || 0) > 0; });
}

function statusDonutItems(byStatus) {
    return STATUS_GROUP_ORDER.filter(function(g) {
        return (byStatus[g] || 0) > 0;
    }).map(function(g) {
        return {
            key: g,
            label: STATUS_GROUP_LABELS[g] || g,
            n: byStatus[g] || 0,
            color: STATUS_CHART_COLORS[g] || '#64748b',
            filter: 'st_' + g
        };
    });
}

function opinionDonutItems(stats) {
    return [
        { key: 'pos', label: 'Müsbət', n: stats.pos || 0, color: MEQSED_RESULT_COLORS.pos, filter: 'pos' },
        { key: 'neg', label: 'Mənfi', n: stats.neg || 0, color: '#dc2626', filter: 'neg' },
        { key: 'revision', label: 'Düzəliş', n: stats.other || 0, color: '#d97706', filter: 'revision' }
    ].filter(function(item) { return item.n > 0; });
}

var SCORE_BAND_DEFS = [
    { key: 'score_high', label: '≥ 70', color: '#059669' },
    { key: 'score_mid', label: '40–69', color: '#d97706' },
    { key: 'score_low', label: '< 40', color: '#dc2626' },
    { key: 'score_none', label: 'Balsız', color: '#94a3b8' }
];

function scoreBandDefs(hideNone) {
    if (!hideNone) return SCORE_BAND_DEFS;
    return SCORE_BAND_DEFS.filter(function(def) { return def.key !== 'score_none'; });
}

function scoreBandItems(byBand, hideNone) {
    byBand = byBand || {};
    return scoreBandDefs(hideNone).map(function(def) {
        return {
            key: def.key,
            label: def.label,
            n: byBand[def.key] || 0,
            color: def.color,
            filter: def.key
        };
    });
}

function hasScoreBandData(byBand, hideNone) {
    return scoreBandDefs(hideNone).some(function(def) { return ((byBand && byBand[def.key]) || 0) > 0; });
}

function diagListDashHtml(stats) {
    var radar = stats.dirRadar || [];
    var hasRadar = radar.some(function(d) { return d.avg != null && isFinite(d.avg); });
    var best = stats.bestDirection;
    var left = '<div class="diag-radar-panel">'
        + '<p class="assess-ld-block-label">Rəqəmsallaşma istiqamətləri</p>'
        + exqScoreMeterHtml(stats.avg, { label: 'Ölkə üzrə ortalama bal' })
        + (best
            ? '<div class="diag-best-dir">'
                + '<span>Ən yaxşı istiqamət</span>'
                + '<b>' + escapeHtml(best.short || best.title) + '</b>'
                + '<em>' + escapeHtml(formatAvg(best.avg)) + '</em>'
                + '</div>'
            : '')
        + '<ul class="nk303-compare-legend">'
        + '<li class="is-now">Mövcud vəziyyət</li>'
        + '<li class="is-goal">Hədəf olunan</li>'
        + '</ul>'
        + '<div class="meqsed-ld-chart-box assess-ld-radar-chart">'
        + (hasRadar
            ? '<canvas id="assessDiagRadarChart" aria-label="Mövcud vəziyyət və hədəf olunan"></canvas>'
            : '<p class="meqsed-ld-chart-empty">İstiqamət balı yoxdur.</p>')
        + '</div></div>';
    return ldComboCard(
        'Diaqnostika nəticələri',
        left,
        'Status',
        hasStatusSlices(stats.byStatus),
        'Diaqnostika status və qurum',
        'assess-ld-panel-grid--bands'
    );
}

function isqListDashHtml(stats) {
    var left = '<div class="exq-ld-side-head">'
        + '<p class="assess-ld-block-label">Bal diapazonu</p>'
        + ldSideMeta('Orta', formatAvg(stats.avg), '')
        + '</div>'
        + '<div class="meqsed-ld-chart-box assess-ld-score-chart">'
        + (hasScoreBandData(stats.byBand, true)
            ? '<canvas id="assessScoreBandChart" aria-label="İSQ bal diapazonu"></canvas>'
            : '<p class="meqsed-ld-chart-empty">Bal məlumatı yoxdur.</p>')
        + '</div>';
    return ldComboCard(
        'İSQ nəticələri',
        left,
        'Status',
        hasStatusSlices(stats.byStatus),
        'İSQ status və qurum',
        'assess-ld-panel-grid--bands'
    );
}

function exqSvcMixHtml(bySvc) {
    var section = 'exq';
    var parts = [
        { key: 'svc_1_5', label: '1–5', n: (bySvc && bySvc.svc_1_5) || 0, color: '#93c5fd' },
        { key: 'svc_6_20', label: '6–20', n: (bySvc && bySvc.svc_6_20) || 0, color: '#6366f1' },
        { key: 'svc_21', label: '21+', n: (bySvc && bySvc.svc_21) || 0, color: '#4338ca' }
    ];
    var total = parts.reduce(function(s, p) { return s + p.n; }, 0);
    var segs = parts.filter(function(p) { return p.n > 0; }).map(function(p) {
        var pct = total ? Math.round((p.n / total) * 100) : 0;
        var on = listDashFilterOn(section, p.key);
        return '<button type="button" class="exq-mix-seg' + (on ? ' is-active' : '') + '"'
            + ' style="flex-grow:' + Math.max(p.n, 0) + ';background:' + p.color + '"'
            + ' title="' + escapeHtml(p.label) + ' xidmət: ' + p.n + ' qurum"'
            + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + p.key + '\')">'
            + escapeHtml(p.label) + ' · ' + pct + '%'
            + '</button>';
    }).join('');
    if (!segs) return '';
    return '<div class="exq-mix" aria-hidden="false">' + segs + '</div>';
}

function exqQurumsOnDash(items) {
    return (items || []).filter(function(q) {
        return q && (q.svc || 0) > 0;
    });
}

function exqListDashHtml(stats) {
    var section = currentAssessSection() || 'exq';
    var overall = stats.weightedAvg != null ? stats.weightedAvg : stats.avg;
    var chartQurums = exqQurumsOnDash(stats.byQurum);
    var chartN = chartQurums.length;
    var svcSum = stats.svcSum || 0;
    var qurumWithSvc = stats.qurumWithSvc != null ? stats.qurumWithSvc : chartN;
    var hasQurum = chartN > 0;
    var chartH = Math.max(10, 1.9 * Math.max(chartN, 1) + 2.2);
    var summary = qurumWithSvc + ' qurumda ' + svcSum + ' xidmət qiymətləndirilib';
    return ldHead(section, 'Elektron xidmət qiymətləndirmə nəticələri')
        + '<div class="meqsed-ld-card assess-ld-panel exq-ld-combo assess-ld-combo">'
        + '<div class="exq-overview">'
        + exqSvcHeroHtml(svcSum, qurumWithSvc, 'svc_sum')
        + exqScoreMeterHtml(overall, { label: 'Ölkə üzrə bal ortalaması' })
        + '</div>'
        + '<p class="exq-overview-summary">' + escapeHtml(summary) + '</p>'
        + '<p class="assess-ld-block-label">Qurumların balları</p>'
        + (hasQurum
            ? '<div class="exq-qurum-chart-wrap">'
                + '<div class="meqsed-ld-chart-box exq-qurum-chart" style="height:' + chartH + 'rem">'
                + '<canvas id="exqQurumSvcChart" aria-label="Qiymətləndirilmiş qurumlar üzrə bal"></canvas></div></div>'
            : '<p class="meqsed-ld-chart-empty">Qiymətləndirilmiş qurum yoxdur.</p>')
        + '</div>';
}

function meqsedLifeHasData(stats) {
    var life = (stats && stats.byLifeUnit) || {};
    var keys = ['yeni', 'movcud'];
    var units = ['sistem', 'xidmet'];
    var ops = ['pos', 'neg', 'revision'];
    return keys.some(function(k) {
        var row = life[k] || {};
        return units.some(function(u) {
            var b = row[u] || {};
            return ops.some(function(op) { return (b[op] || 0) > 0; });
        });
    });
}

function meqsedResultItems(stats) {
    return [
        { key: 'pos', label: 'Müsbət', n: stats.pos || 0, color: MEQSED_RESULT_COLORS.pos, filter: 'pos' },
        { key: 'neg', label: 'Mənfi', n: stats.neg || 0, color: MEQSED_RESULT_COLORS.neg, filter: 'neg' },
        { key: 'revision', label: 'Düzəlişə göndərilib', n: stats.other || 0, color: MEQSED_RESULT_COLORS.revision, filter: 'revision' },
        { key: 'baxilir', label: 'İcradadır', n: stats.baxilir || 0, color: MEQSED_RESULT_COLORS.baxilir, filter: 'baxilir' }
    ];
}

var MEQSED_MONTH_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];
var MEQSED_KIND_ORDER = (MEQSED_NOVU_KINDS || []).concat(['other']);

function meqsedDecidedN(stats) {
    return (stats.pos || 0) + (stats.neg || 0) + (stats.other || 0);
}

function meqsedOvFilterOn(key) {
    var cur = meqsedOvActiveFilter !== undefined ? meqsedOvActiveFilter : listDashFilter('meqsed');
    if (key === 'all') return !cur || cur === 'all';
    return cur === key;
}

function meqsedOvKpi(label, value, sub, filterKey) {
    var on = filterKey && meqsedOvFilterOn(filterKey);
    var cls = 'meqsed-ov-kpi' + (filterKey ? ' is-clickable' : '') + (on ? ' is-active' : '');
    var inner = '<span class="meqsed-ov-kpi-label">' + escapeHtml(label) + '</span>'
        + '<strong>' + escapeHtml(String(value)) + '</strong>'
        + (sub ? '<em>' + escapeHtml(sub) + '</em>' : '');
    if (!filterKey) return '<article class="' + cls + '">' + inner + '</article>';
    var clickFn = filterKey === 'all'
        ? 'showAssessFullList()'
        : 'setAssessListFilter(\'' + filterKey + '\')';
    return '<button type="button" class="' + cls + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' onclick="event.stopPropagation(); ' + clickFn + '">'
        + inner + '</button>';
}

function meqsedMixBarHtml(items, total) {
    var segs = items.filter(function(it) { return it.n > 0; }).map(function(it) {
        var on = meqsedOvFilterOn(it.filter);
        return '<button type="button" class="meqsed-ov-mix-seg' + (on ? ' is-active' : '') + '"'
            + ' style="flex-grow:' + Math.max(it.n, 0) + ';flex-basis:0;background:' + it.color + '"'
            + ' title="' + escapeHtml(it.label) + ': ' + it.n + '"'
            + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + it.filter + '\')"></button>';
    }).join('');
    if (!segs) {
        return '<div class="meqsed-ov-mix-bar is-empty"></div>';
    }
    return '<div class="meqsed-ov-mix-bar" role="img" aria-label="Rəyin nəticəsi">' + segs + '</div>';
}

function meqsedMixLegendHtml(items, total) {
    return '<ul class="meqsed-ov-legend">' + items.map(function(it) {
        var pct = total ? Math.round((it.n / total) * 100) : 0;
        var on = meqsedOvFilterOn(it.filter);
        return '<li><button type="button" class="meqsed-ov-leg' + (on ? ' is-active' : '') + '"'
            + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + it.filter + '\')">'
            + '<i style="background:' + it.color + '"></i>'
            + '<span>' + escapeHtml(it.label) + '</span>'
            + '<b>' + pct + '%</b>'
            + '<em>' + it.n + '</em>'
            + '</button></li>';
    }).join('') + '</ul>';
}

function meqsedKindRowsHtml(stats) {
    var kinds = MEQSED_KIND_ORDER.filter(function(k) {
        return k !== 'other' || ((stats.byKind && stats.byKind.other) || 0) > 0;
    });
    var items = meqsedResultItems(stats);
    return '<div class="meqsed-ov-kinds">' + kinds.map(function(kind) {
        var split = (stats.byKindResult && stats.byKindResult[kind]) || emptyResultSplit();
        var n = split.total || 0;
        var on = meqsedOvFilterOn(kind);
        var segs = items.map(function(it) {
            var v = split[it.key] || 0;
            if (!v) return '';
            return '<i style="flex-grow:' + v + ';background:' + it.color + '" title="' + escapeHtml(it.label) + ': ' + v + '"></i>';
        }).join('');
        return '<button type="button" class="meqsed-ov-kind' + (on ? ' is-active' : '') + '"'
            + ' onclick="event.stopPropagation(); setAssessListFilter(\'' + kind + '\')">'
            + '<span class="meqsed-ov-kind-name">' + escapeHtml(MEQSED_NOVU_LABELS[kind] || kind) + '</span>'
            + '<div class="meqsed-ov-kind-bar">' + (segs || '<i class="is-empty"></i>') + '</div>'
            + '<b>' + n + '</b>'
            + '</button>';
    }).join('') + '</div>';
}

function meqsedTopQurumHtml(stats) {
    var rows = stats.topQurums || [];
    if (!rows.length) return '<p class="meqsed-ld-chart-empty">Qurum müraciəti yoxdur.</p>';
    var max = rows[0].n || 1;
    return '<ul class="meqsed-ov-orgs">' + rows.map(function(row) {
        var pct = max ? Math.round((row.n / max) * 100) : 0;
        return '<li><button type="button" class="meqsed-ov-org"'
            + ' title="' + escapeHtml(row.name) + '"'
            + ' onclick="event.stopPropagation(); setAssessmentSearch(\'meqsed\', \''
            + String(row.name).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\')">'
            + '<span>' + escapeHtml(row.name) + '</span>'
            + '<div class="meqsed-ov-org-track"><i style="width:' + pct + '%"></i></div>'
            + '<b>' + row.n + '</b>'
            + '</button></li>';
    }).join('') + '</ul>';
}

function meqsedOverviewBodyHtml(stats) {
    stats = stats || {};
    var items = meqsedResultItems(stats);
    var total = stats.total || 0;
    var decided = meqsedDecidedN(stats);
    var posPct = decided ? Math.round(((stats.pos || 0) / decided) * 100) : 0;
    var negPct = decided ? Math.round(((stats.neg || 0) / decided) * 100) : 0;
    var qurumSub = (stats.qurumAll && stats.qurumAll !== stats.qurum)
        ? (stats.qurumAll + ' qurumdan')
        : 'unikal qurum';
    var avgVal = stats.avgDays != null ? (stats.avgDays + ' gün') : '—';
    var avgSub = stats.avgDaysN ? 'tamamlanmış üzrə' : 'Məlumat mövcud deyil';
    var peak = 0;
    (stats.byMonth || []).forEach(function(m) {
        if (m && m.total > peak) peak = m.total;
    });
    var monthNote = peak ? ('Ən yüksək ay: ' + peak + ' müraciət') : '';
    var hasMonth = (stats.byMonth || []).some(function(m) { return m && m.total > 0; });
    return '<div class="meqsed-ov">'
        + '<div class="meqsed-ov-kpis">'
        + meqsedOvKpi('Ümumi müraciət', total, (stats.baxilir || 0) + ' icradadır', 'all')
        + meqsedOvKpi('Müraciət edən qurum', stats.qurum || 0, qurumSub, 'orgs')
        + meqsedOvKpi('Müsbət rəy', posPct + '%', (stats.pos || 0) + ' rəy', 'pos')
        + meqsedOvKpi('Mənfi rəy', negPct + '%', (stats.neg || 0) + ' rəy', 'neg')
        + meqsedOvKpi('Orta baxılma müddəti', avgVal, avgSub, '')
        + '</div>'
        + '<div class="meqsed-ov-grid">'
        + '<section class="meqsed-ov-card">'
        + '<h4>Rəyin nəticəsi <span>— seqmentə klikləyərək filtrləyin</span></h4>'
        + meqsedMixBarHtml(items, total)
        + meqsedMixLegendHtml(items, total)
        + '</section>'
        + '<section class="meqsed-ov-card">'
        + '<h4>Müraciət növü üzrə nəticə</h4>'
        + meqsedKindRowsHtml(stats)
        + '</section>'
        + '<section class="meqsed-ov-card">'
        + '<h4>Aylıq axın</h4>'
        + (hasMonth
            ? '<div class="meqsed-ov-month"><canvas id="meqsedMonthChart" aria-label="Aylıq müraciət axını"></canvas></div>'
            : '<p class="meqsed-ld-chart-empty">Aylıq məlumat yoxdur.</p>')
        + (monthNote ? '<p class="meqsed-ov-note">' + escapeHtml(monthNote) + '</p>' : '')
        + '</section>'
        + '<section class="meqsed-ov-card">'
        + '<h4>Ən çox müraciət edən qurumlar</h4>'
        + meqsedTopQurumHtml(stats)
        + '</section>'
        + '</div></div>';
}

function meqsedListDashHtml(stats) {
    return ldHead('meqsed', 'Məqsədəuyğunluq nəticələri') + meqsedOverviewBodyHtml(stats);
}

export function meqsedOverviewHtml(stats, filter) {
    var prev = meqsedOvActiveFilter;
    meqsedOvActiveFilter = filter == null ? '' : String(filter);
    try {
        return meqsedOverviewBodyHtml(stats);
    } finally {
        meqsedOvActiveFilter = prev;
    }
}

export function drawMeqsedOverviewCharts(stats) {
    drawMeqsedMonthChart(stats);
}

export function destroyMeqsedOverviewCharts() {
    destroyAssessChart('meqsedMonthChart', 'meqsedMonthChart');
}

var STATUS_CHART_COLORS = {
    done: '#059669',
    progress: '#2563eb',
    planned: '#ea580c',
    paused: '#d97706',
    review: '#0891b2',
    esd: '#4f46e5',
    blocked: '#dc2626',
    rejected: '#e11d48',
    other: '#64748b'
};

function destroyAssessListDonut() {
    destroyAssessChart('assessListDonutChart', 'assessListDonut');
    destroyAssessChart('exqStatusChart', 'exqStatusChart');
    destroyAssessChart('meqsedOpinionDonutChart', 'meqsedOpinionDonut');
}

function destroyExqStatusChart() { destroyAssessListDonut(); }
function destroyMeqsedOpinionCharts() {
    destroyAssessListDonut();
    destroyAssessChart('meqsedOpinionBarChart', 'meqsedOpinionBar');
    destroyAssessChart('meqsedMonthChart', 'meqsedMonthChart');
    destroyAssessChart('assessScoreBandChart', 'assessScoreBandChart');
    destroyAssessChart('assessDiagRadarChart', 'assessDiagRadarChart');
    destroyAssessChart('exqQurumSvcChart', 'exqQurumSvcChart');
}

function drawAssessListDonut(items, qurumN, centerLabel, opts) {
    if (typeof Chart === 'undefined') return;
    destroyAssessListDonut();
    var canvas = document.getElementById('assessListDonut');
    if (!canvas || !items || !items.length) return;
    opts = opts || {};
    var total = items.reduce(function(s, item) { return s + item.n; }, 0);
    var solidColors = items.map(function(item) { return item.color; });
    var centerText = centerLabel || 'Qurum';
    var centerValue = qurumN != null ? qurumN : total;
    var compact = !!opts.compact;
    var showLegend = opts.hideLegend ? false : true;
    var centerPlugin = {
        id: 'assessListDonutCenter',
        afterDraw: function(chart) {
            var area = chart.chartArea;
            var c = chart.ctx;
            var cx = area.left + area.width / 2;
            var cy = area.top + area.height / 2;
            c.save();
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = compact ? '800 18px Inter, system-ui, sans-serif' : '800 22px Inter, system-ui, sans-serif';
            c.fillStyle = '#0f172a';
            c.fillText(String(centerValue), cx, cy - (compact ? 6 : 8));
            c.font = compact ? '600 10px Inter, system-ui, sans-serif' : '600 11px Inter, system-ui, sans-serif';
            c.fillStyle = '#64748b';
            c.fillText(centerText, cx, cy + (compact ? 9 : 11));
            c.restore();
        }
    };
    var legendBottom = typeof window !== 'undefined' && window.innerWidth < 640;
    state.assessListDonutChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: items.map(function(item) { return item.label; }),
            datasets: [{
                data: items.map(function(item) { return item.n; }),
                backgroundColor: solidColors.slice(),
                borderWidth: 3,
                borderColor: '#fff',
                hoverOffset: compact ? 3 : 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: compact ? '70%' : '66%',
            layout: { padding: { top: 2, bottom: 2, left: 2, right: showLegend ? 4 : 2 } },
            plugins: {
                legend: {
                    display: showLegend,
                    position: legendBottom ? 'bottom' : 'right',
                    labels: {
                        boxWidth: 9,
                        boxHeight: 9,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: legendBottom ? 10 : 12,
                        font: { size: 11, weight: '600' },
                        color: '#475569',
                        generateLabels: function(chart) {
                            var ds = chart.data.datasets[0];
                            return (chart.data.labels || []).map(function(label, i) {
                                var n = ds.data[i] || 0;
                                var pct = total ? Math.round((n / total) * 100) : 0;
                                return {
                                    text: label + '  ' + n + ' · ' + pct + '%',
                                    fillStyle: solidColors[i],
                                    strokeStyle: solidColors[i],
                                    index: i,
                                    hidden: false
                                };
                            });
                        }
                    },
                    onClick: function(e, item) {
                        var row = items[item.index];
                        if (!row || typeof window.setAssessListFilter !== 'function') return;
                        window.setAssessListFilter(row.filter);
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            var n = Number(ctx.raw) || 0;
                            var pct = total ? Math.round((n / total) * 100) : 0;
                            return ' ' + ctx.label + ': ' + n + ' (' + pct + '%)';
                        }
                    }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var item = items[els[0].index];
                if (!item || typeof window.setAssessListFilter !== 'function') return;
                window.setAssessListFilter(item.filter);
            },
            onHover: function(evt, els) {
                var target = (evt && evt.native && evt.native.target)
                    || (evt && evt.chart && evt.chart.canvas);
                if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            }
        },
        plugins: [centerPlugin]
    });
}

function drawExqStatusChart(stats) {
    if (!stats) return;
    drawExqQurumSvcChart(exqQurumsOnDash(stats.byQurum));
}

function truncateChartLabel(s, max) {
    var t = String(s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, Math.max(0, max - 1)) + '…';
}

function drawExqQurumSvcChart(items) {
    if (typeof Chart === 'undefined') return;
    destroyAssessChart('exqQurumSvcChart', 'exqQurumSvcChart');
    var canvas = document.getElementById('exqQurumSvcChart');
    var rows = (items || []).slice();
    if (!canvas || !rows.length) return;
    var maxName = 42;
    var scores = rows.map(function(q) {
        return q.score != null && isFinite(q.score) ? Number(q.score) : 0;
    });
    var xMax = 100;
    state.exqQurumSvcChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map(function(q) { return truncateChartLabel(q.name, maxName); }),
            datasets: [{
                label: 'Bal',
                data: scores,
                backgroundColor: rows.map(function(q) {
                    return q.score != null && isFinite(q.score) ? '#6366f1' : '#cbd5e1';
                }),
                borderRadius: 5,
                borderSkipped: false,
                barPercentage: 0.78,
                categoryPercentage: 0.86,
                maxBarThickness: 26,
                clip: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { right: 44, top: 4, bottom: 4 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: function(ctx) {
                            var i = ctx && ctx[0] ? ctx[0].dataIndex : -1;
                            return rows[i] ? rows[i].name : '';
                        },
                        label: function(ctx) {
                            var row = rows[ctx.dataIndex];
                            var n = row ? (row.svc || 0) : 0;
                            if (!n) return ' Qiymətləndirilmiş xidmət yoxdur';
                            return ' ' + n + ' xidmət qiymətləndirilib';
                        },
                        afterLabel: function(ctx) {
                            var row = rows[ctx.dataIndex];
                            var bal = row && row.score != null ? formatAvg(row.score) : '—';
                            return ' Bal: ' + bal;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: xMax,
                    ticks: { precision: 0, font: { size: 11 }, color: '#64748b' },
                    grid: { color: 'rgba(148, 163, 184, 0.18)' },
                    border: { display: false },
                    title: { display: true, text: 'Bal', color: '#64748b', font: { size: 11, weight: '600' } }
                },
                y: {
                    ticks: {
                        autoSkip: false,
                        font: { size: 11, weight: '600' },
                        color: '#334155'
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var row = rows[els[0].index];
                if (!row || typeof window.setAssessmentSearch !== 'function') return;
                window.setAssessmentSearch('exq', row.name);
                if (typeof window.showAssessFullList === 'function') window.showAssessFullList();
            },
            onHover: chartPointerCursor
        },
        plugins: [{
            id: 'exqQurumSvcValues',
            afterDatasetsDraw: function(chart) {
                var meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data) return;
                var c = chart.ctx;
                c.save();
                c.font = '700 11px Inter, system-ui, sans-serif';
                c.fillStyle = '#334155';
                c.textAlign = 'left';
                c.textBaseline = 'middle';
                meta.data.forEach(function(bar, i) {
                    var row = rows[i];
                    var label = row && row.score != null && isFinite(row.score)
                        ? formatAvg(row.score)
                        : '—';
                    c.fillText(String(label), bar.x + 6, bar.y);
                });
                c.restore();
            }
        }]
    });
}

function drawMeqsedLifeChart(stats) {
    if (!stats || typeof Chart === 'undefined') return;
    destroyAssessChart('meqsedOpinionBarChart', 'meqsedOpinionBar');
    var barCanvas = document.getElementById('meqsedOpinionBar');
    if (!barCanvas) return;
    var life = stats.byLifeUnit || { yeni: emptyLifeUnit(), movcud: emptyLifeUnit() };
    var unitOpinionDefs = [
        { unit: 'sistem', op: 'pos', label: 'Sistem — müsbət', color: MEQSED_RESULT_COLORS.pos, filterSuffix: 'pos' },
        { unit: 'xidmet', op: 'pos', label: 'Xidmət — müsbət', color: MEQSED_RESULT_COLORS.posAlt, filterSuffix: 'pos' },
        { unit: 'sistem', op: 'neg', label: 'Sistem — mənfi', color: '#b91c1c', filterSuffix: 'neg' },
        { unit: 'xidmet', op: 'neg', label: 'Xidmət — mənfi', color: '#f87171', filterSuffix: 'neg' },
        { unit: 'sistem', op: 'revision', label: 'Sistem — düzəliş', color: '#d97706', filterSuffix: 'revision' },
        { unit: 'xidmet', op: 'revision', label: 'Xidmət — düzəliş', color: '#fbbf24', filterSuffix: 'revision' }
    ];
    var lifeKeys = ['yeni', 'movcud'];
    var lifeLabels = ['Yeni yaradılan', 'Mövcudda dəyişiklik'];
    var barDatasets = unitOpinionDefs.map(function(def) {
        return {
            label: def.label,
            data: lifeKeys.map(function(k) {
                var row = life[k] && life[k][def.unit];
                return (row && row[def.op]) || 0;
            }),
            backgroundColor: def.color,
            stack: 'life',
            borderRadius: 4,
            barPercentage: 0.78,
            categoryPercentage: 0.72,
            _filterSuffix: def.filterSuffix,
            _unit: def.unit,
            _op: def.op
        };
    }).filter(function(ds) {
        return ds.data.some(function(n) { return n > 0; });
    });
    if (!barDatasets.length) return;
    var lifeTotals = lifeKeys.map(function(k) {
        var row = life[k] || emptyLifeUnit();
        var sum = 0;
        ['sistem', 'xidmet'].forEach(function(u) {
            var b = row[u] || emptyUnitOpinions();
            sum += (b.pos || 0) + (b.neg || 0) + (b.revision || 0);
        });
        return sum;
    });
    state.meqsedOpinionBarChart = new Chart(barCanvas.getContext('2d'), {
        type: 'bar',
        data: { labels: lifeLabels, datasets: barDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            interaction: { mode: 'nearest', axis: 'y', intersect: true },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        padding: 8,
                        font: { size: 10, weight: '600' },
                        color: '#475569'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            var n = Number(ctx.raw) || 0;
                            var tot = lifeTotals[ctx.dataIndex] || 0;
                            var pct = tot ? Math.round((n / tot) * 100) : 0;
                            var ds = ctx.dataset || {};
                            var unitName = ds._unit === 'xidmet' ? 'Xidmət' : 'Sistem';
                            var opName = ds._op === 'neg' ? 'mənfi' : (ds._op === 'revision' ? 'düzəliş' : 'müsbət');
                            return ' ' + unitName + ' — ' + opName + ': ' + n + ' (' + pct + '%)';
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { precision: 0, font: { size: 11 }, color: '#64748b' },
                    grid: { color: 'rgba(148, 163, 184, 0.18)' },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    ticks: { font: { size: 12, weight: '700' }, color: '#334155' },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var el = els[0];
                var lifeKey = lifeKeys[el.index];
                var ds = barDatasets[el.datasetIndex];
                if (!lifeKey || !ds || !ds._filterSuffix) return;
                if (typeof window.setAssessListFilter === 'function') {
                    window.setAssessListFilter(lifeKey + '_' + ds._filterSuffix);
                }
            },
            onHover: function(evt, els) {
                var target = (evt && evt.native && evt.native.target)
                    || (evt && evt.chart && evt.chart.canvas);
                if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            }
        }
    });
}

function chartPointerCursor(evt, els) {
    var target = (evt && evt.native && evt.native.target)
        || (evt && evt.chart && evt.chart.canvas);
    if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
}

function drawScoreBandChart(byBand, hideNone) {
    if (typeof Chart === 'undefined') return;
    destroyAssessChart('assessScoreBandChart', 'assessScoreBandChart');
    var canvas = document.getElementById('assessScoreBandChart');
    var items = scoreBandItems(byBand, hideNone);
    if (!canvas || !hasScoreBandData(byBand, hideNone)) return;
    var total = items.reduce(function(s, item) { return s + item.n; }, 0);
    var barValuesPlugin = {
        id: 'assessScoreBandValues',
        afterDatasetsDraw: function(chart) {
            var meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data) return;
            var c = chart.ctx;
            var ds = chart.data.datasets[0];
            c.save();
            c.font = '700 11px Inter, system-ui, sans-serif';
            c.fillStyle = '#334155';
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            meta.data.forEach(function(bar, i) {
                var n = ds.data[i];
                if (!n) return;
                c.fillText(String(n), bar.x + 6, bar.y);
            });
            c.restore();
        }
    };
    state.assessScoreBandChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: items.map(function(item) { return item.label; }),
            datasets: [{
                data: items.map(function(item) { return item.n; }),
                backgroundColor: items.map(function(item) { return item.color; }),
                borderRadius: 6,
                borderSkipped: false,
                barPercentage: 0.72,
                categoryPercentage: 0.82,
                maxBarThickness: 22
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { right: 28 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            var n = Number(ctx.raw) || 0;
                            var pct = total ? Math.round((n / total) * 100) : 0;
                            return ' ' + ctx.label + ': ' + n + ' (' + pct + '%)';
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0, font: { size: 11 }, color: '#64748b' },
                    grid: { color: 'rgba(148, 163, 184, 0.18)' },
                    border: { display: false }
                },
                y: {
                    ticks: { font: { size: 11, weight: '700' }, color: '#334155' },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var item = items[els[0].index];
                if (!item || typeof window.setAssessListFilter !== 'function') return;
                window.setAssessListFilter(item.filter);
            },
            onHover: chartPointerCursor
        },
        plugins: [barValuesPlugin]
    });
}

function drawMeqsedMonthChart(stats) {
    if (typeof Chart === 'undefined' || !stats) return;
    destroyAssessChart('meqsedMonthChart', 'meqsedMonthChart');
    var canvas = document.getElementById('meqsedMonthChart');
    if (!canvas) return;
    var months = stats.byMonth || [];
    var series = meqsedResultItems(stats);
    var has = months.some(function(m) { return m && m.total > 0; });
    if (!has) return;
    state.meqsedMonthChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: MEQSED_MONTH_SHORT,
            datasets: series.map(function(it) {
                return {
                    label: it.label,
                    data: months.map(function(m) { return (m && m[it.key]) || 0; }),
                    backgroundColor: it.color,
                    borderRadius: 3,
                    borderSkipped: false,
                    barPercentage: 0.72,
                    categoryPercentage: 0.86,
                    _filter: it.filter
                };
            })
        },
        options: {
            animation: false,
            animations: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            return ' ' + ctx.dataset.label + ': ' + (ctx.raw || 0);
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11, weight: '600' } },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { precision: 0, color: '#94a3b8', font: { size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.18)' },
                    border: { display: false }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var ds = this.data.datasets[els[0].datasetIndex];
                if (ds && ds._filter && typeof window.setAssessListFilter === 'function') {
                    window.setAssessListFilter(ds._filter);
                }
            },
            onHover: function(evt, els) {
                var target = (evt && evt.native && evt.native.target)
                    || (evt && evt.chart && evt.chart.canvas);
                if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            }
        }
    });
}

function drawMeqsedOpinionCharts(stats) {
    if (!stats) return;
    drawMeqsedMonthChart(stats);
}

function drawDiagRadarChart(stats) {
    if (typeof Chart === 'undefined' || !stats) return;
    destroyAssessChart('assessDiagRadarChart', 'assessDiagRadarChart');
    var canvas = document.getElementById('assessDiagRadarChart');
    var dirs = (stats.dirRadar || []).filter(function(d) { return d && d.avg != null && isFinite(d.avg); });
    if (!canvas || !dirs.length) return;
    var labels = dirs.map(function(d) { return d.short || d.title; });
    state.assessDiagRadarChart = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Mövcud vəziyyət',
                    data: dirs.map(function(d) { return d.avg; }),
                    backgroundColor: 'rgba(124, 58, 237, 0.22)',
                    borderColor: '#7c3aed',
                    borderWidth: 2.2,
                    pointBackgroundColor: '#7c3aed',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 5
                },
                {
                    label: 'Hədəf olunan',
                    data: dirs.map(function(d) {
                        var goal = d.target != null ? d.target : diagMaturityTarget(d.avg);
                        return goal != null ? goal : 0;
                    }),
                    backgroundColor: 'rgba(196, 181, 253, 0.22)',
                    borderColor: '#c4b5fd',
                    borderWidth: 2.2,
                    pointBackgroundColor: '#c4b5fd',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            var row = dirs[ctx.dataIndex];
                            var qn = row ? (row.qurumN || 0) : 0;
                            var val = ctx.parsed && ctx.parsed.r != null ? formatAvg(ctx.parsed.r) : '—';
                            if (ctx.datasetIndex === 0) {
                                return ' Mövcud: ' + val + '  ·  ' + qn + ' qurum';
                            }
                            return ' Hədəf: ' + val;
                        }
                    }
                }
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    beginAtZero: true,
                    ticks: {
                        stepSize: 20,
                        showLabelBackdrop: false,
                        color: '#94a3b8',
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.28)' },
                    angleLines: { color: 'rgba(148, 163, 184, 0.28)' },
                    pointLabels: {
                        color: '#334155',
                        font: { size: 11, weight: '700' }
                    }
                }
            }
        }
    });
}

function drawDiagStatusChart(stats) {
    if (!stats) return;
    drawAssessListDonut(statusDonutItems(stats.byStatus || {}), stats.qurum || 0, 'Qurum');
    drawDiagRadarChart(stats);
}

function drawIsqStatusChart(stats) {
    if (!stats) return;
    drawAssessListDonut(statusDonutItems(stats.byStatus || {}), stats.qurum || 0, 'Qurum');
    drawScoreBandChart(stats.byBand, true);
}

function listDashHtmlForSection(section, rows) {
    if (section === 'diag') return diagListDashHtml(collectDiagListStats(rows));
    if (section === 'isq') return isqListDashHtml(collectIsqListStats(rows));
    if (section === 'exq') return exqListDashHtml(collectExqListStats(rows));
    if (section === 'meqsed') return meqsedListDashHtml(collectMeqsedListStats(rows));
    return '';
}

function renderAssessListDash(section, rows) {
    var el = document.getElementById('assessListDash') || document.getElementById('meqsedListDash');
    if (!el) return;
    if (!LIST_DASH_SECTIONS[section]) {
        destroyMeqsedOpinionCharts();
        el.classList.add('hidden');
        el.setAttribute('hidden', '');
        el.innerHTML = '';
        el.removeAttribute('data-section');
        return;
    }
    el.classList.remove('hidden');
    el.removeAttribute('hidden');
    el.setAttribute('data-section', section);
    destroyMeqsedOpinionCharts();
    var listRows = rows || [];
    var stats = null;
    if (section === 'diag') stats = collectDiagListStats(listRows);
    else if (section === 'isq') stats = collectIsqListStats(listRows);
    else if (section === 'exq') stats = collectExqListStats(listRows);
    else if (section === 'meqsed') stats = collectMeqsedListStats(listRows);
    el.innerHTML = listDashHtmlForSection(section, listRows);
    requestAnimationFrame(function() {
        if (section === 'diag') drawDiagStatusChart(stats);
        else if (section === 'isq') drawIsqStatusChart(stats);
        else if (section === 'exq') drawExqStatusChart(stats);
        else if (section === 'meqsed') drawMeqsedOpinionCharts(stats);
    });
}

function renderMeqsed(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var info = getMeqsedInfo(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Müraciətin növü', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.novu) + '</span>' },
            { label: 'Məqsədəuyğunluq Rəyi Nəticə', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.netice) + '</span>' },
            { label: 'Göndərilmə tarixi', cls: 'assess-hub-cell--date', html: sendDateHtml(t) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(t.key) }
        ], '');
    }).join('');
    return hubTable('meqsed', ['Qurum adı', 'Müraciətin növü', 'Məqsədəuyğunluq Rəyi Nəticə', 'Göndərilmə tarixi', ''], body);
}

function isJiraTableHeaderDump(text) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return false;
    var f = t.toLowerCase()
        .replace(/ı/g, 'i').replace(/ə/g, 'e').replace(/ö/g, 'o')
        .replace(/ü/g, 'u').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, ' ').trim();
    if (!f) return false;
    var leftover = f.replace(/\b(qiymetlendirme istiqameti|qiymetlendirme|istiqametler|istiqameti|istiqamet|umumi|yekun|neticesi|neticeleri|neticeler|netice|diaqnostika|bal|ball|score|result|ad|name|title|basliq)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
    return !leftover;
}

function directionCard(d, overallText) {
    var title = d && d.title ? String(d.title).trim() : '';
    if (!title || isJiraTableHeaderDump(title) || isDiagOverallLabel(title)) return '';
    var score = d.score && d.score !== '—' ? scoreBadge(d.score) : '<span class="assess-score-badge is-empty">—</span>';
    var text = d.text ? String(d.text).trim() : '';
    if (isJiraTableHeaderDump(text)) text = '';
    if (overallText && text && text.replace(/\s+/g, ' ') === String(overallText).replace(/\s+/g, ' ')) text = '';
    return '<article class="assess-dir-card' + (text ? '' : ' is-score-only') + '">'
        + '<div class="assess-dir-card-head"><h4>' + escapeHtml(title) + '</h4>' + score + '</div>'
        + (text ? '<p class="assess-dir-card-text">' + escapeHtml(text) + '</p>' : '')
        + '</article>';
}

function dashOr(value) {
    if (value == null || value === '') return '—';
    return String(value);
}

function modalFieldBlocks(items) {
    return '<div class="assess-modal-fields">' + (items || []).map(function(item) {
        var val = dashOr(item.value);
        var inner = item.html != null ? item.html : escapeHtml(val);
        return '<div class="assess-modal-field">'
            + '<div class="assess-modal-field-label">' + escapeHtml(item.label || '') + '</div>'
            + '<div class="assess-modal-field-value">' + inner + '</div>'
            + '</div>';
    }).join('') + '</div>';
}

var AZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

function formatDueMonthYear(d) {
    if (!d || isNaN(d.getTime())) return '';
    return AZ_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function fillModalChrome(r, kicker, showDueDate) {
    var t = (r && r.task) || {};
    var titleEl = document.getElementById('assessDiagModalTitle');
    var subEl = document.getElementById('assessDiagModalSub');
    var keyEl = document.getElementById('assessDiagModalKey');
    var dateEl = document.getElementById('assessDiagModalDate');
    var yearLabel = r && r.year ? String(r.year) : '';
    var qurum = (r && r.qurum) || '—';
    if (titleEl) titleEl.textContent = yearLabel ? (qurum + ' · ' + yearLabel) : qurum;
    if (subEl) subEl.textContent = kicker || 'Ətraflı baxış';
    if (keyEl) {
        var base = (state.currentBaseUrl || '').replace(/\/+$/, '');
        keyEl.textContent = t.key || '';
        keyEl.href = base && t.key ? (base + '/browse/' + encodeURIComponent(t.key)) : '#';
        keyEl.classList.toggle('hidden', !t.key);
    }
    if (dateEl) {
        if (showDueDate) {
            var due = getTaskDueDate(t);
            dateEl.innerHTML = '<span class="assess-modal-date-label">Göndərilmə tarixi</span>'
                + '<span class="assess-modal-date-value">' + escapeHtml(due ? formatDueMonthYear(due) : '—') + '</span>';
            dateEl.classList.remove('hidden');
        } else {
            dateEl.textContent = '';
            dateEl.classList.add('hidden');
        }
    }
}

function diagModalBodyHtml(r) {
    var t = r.task;
    var parsed = parseDiagUmumiNetice(t.fields && t.fields.customfield_17319);
    var parts = [];
    var overallScore = parsed.overall.score && parsed.overall.score !== '—' && !isJiraTableHeaderDump(parsed.overall.score)
        ? parsed.overall.score : '';
    var overallText = parsed.overall.text || '';
    if (isJiraTableHeaderDump(overallText)) overallText = '';
    var extras = (parsed.extras || []).filter(function(e) {
        return e && e.title && !isJiraTableHeaderDump(e.title) && !isJiraTableHeaderDump(e.score)
            && !isDiagOverallLabel(e.title);
    });
    if (overallScore || overallText) {
        parts.push('<div class="assess-modal-overall">'
            + '<div class="assess-modal-overall-label">Ümumi nəticə</div>'
            + (overallScore ? '<div class="assess-modal-overall-score">' + scoreBadge(overallScore) + '</div>' : '')
            + (overallText ? '<p class="assess-modal-overall-text">' + escapeHtml(overallText) + '</p>' : '')
            + '</div>');
    }
    var dirHtml = parsed.directions.map(function(d) { return directionCard(d, overallText); }).join('')
        + extras.map(function(e) { return directionCard(e, overallText); }).join('');
    if (dirHtml) {
        parts.push('<h4 class="assess-modal-section-title">Qiymətləndirmə istiqamətləri</h4>');
        parts.push('<div class="assess-dir-grid">' + dirHtml + '</div>');
    }
    var hasAny = overallScore || overallText
        || parsed.directions.some(function(d) { return (d.score && d.score !== '—') || d.text; })
        || extras.length;
    if (!hasAny) {
        return '<p class="assess-modal-empty">Ümumi nəticə qeyd edilməyib.</p>';
    }
    return parts.join('');
}

function meqsedModalBodyHtml(t) {
    var info = getMeqsedInfo(t);
    var vis = meqsedModalVisibility(info.novuKind);
    var items = [];
    if (vis.sistemAdi) items.push({ label: 'Sistemin adı', value: info.sistemAdi });
    if (vis.xidmetSayi) items.push({ label: 'Xidmət sayı', value: info.xidmetSayi });
    items.push({ label: 'Məqsədəuyğunluq Rəyi Nəticə', value: info.netice });
    items.push({ label: 'Məqsədəuyğunluq üzrə müraciətin növü', value: info.novu });
    if (vis.xidmetMelumat) items.push({ label: 'Xidmət(lər) barədə məlumat', value: info.xidmetMelumat });
    return modalFieldBlocks(items);
}

function neticeRowHasContent(d) {
    if (!d || !d.title) return false;
    if (isJiraTableHeaderDump(d.title) || isDiagOverallLabel(d.title)) return false;
    var score = d.score && d.score !== '—' && !isJiraTableHeaderDump(d.score) ? d.score : '';
    var text = d.text ? String(d.text).trim() : '';
    if (isJiraTableHeaderDump(text)) text = '';
    return !!(score || text);
}

function selfModalBodyHtml(t) {
    var info = getSelfAssessInfo(t);
    var overallScore = info && info.score && info.score !== '—' && !isJiraTableHeaderDump(info.score)
        ? info.score : '';
    var overallText = (info && info.overall && info.overall.text) || '';
    if (isJiraTableHeaderDump(overallText)) overallText = '';
    var dirs = (info && info.directions) || [];
    var parts = [];
    if (overallScore || overallText) {
        parts.push('<div class="assess-modal-overall">'
            + '<div class="assess-modal-overall-label">Ümumi nəticə</div>'
            + (overallScore ? '<div class="assess-modal-overall-score">' + scoreBadge(overallScore) + '</div>' : '')
            + (overallText ? '<p class="assess-modal-overall-text">' + escapeHtml(overallText) + '</p>' : '')
            + '</div>');
    }
    var dirHtml = dirs.map(function(d) { return directionCard(d, overallText); }).join('');
    if (dirHtml) {
        parts.push('<h4 class="assess-modal-section-title">Qiymətləndirmə istiqamətləri</h4>');
        parts.push('<div class="assess-dir-grid">' + dirHtml + '</div>');
    }
    var hasAny = overallScore || overallText
        || dirs.some(function(d) { return (d.score && d.score !== '—') || d.text; });
    if (!hasAny) {
        return '<p class="assess-modal-empty">Ümumi nəticə qeyd edilməyib.</p>';
    }
    return parts.join('');
}

function exqModalBodyHtml(t) {
    var count = getExqServiceCount(t);
    var bal = getExqScore(t);
    var netice = formatAssessmentFieldText(t && t.fields && t.fields.customfield_17317);
    var items = [
        { label: 'Qiymətləndirilmiş xidmət', value: count != null && isFinite(Number(count)) ? String(count) : '—' },
        { label: 'Bal', value: bal && bal !== '—' ? String(bal) : '—' },
        { label: 'EXQ Nəticəsi', value: netice }
    ];
    return modalFieldBlocks(items);
}

function hasDetailModal(cat) {
    return cat === 'diag' || cat === 'self' || cat === 'meqsed' || cat === 'exq';
}

function fillDiagModal(r) {
    var t = r && r.task;
    var cat = (t && classifyAssessmentCategory(t)) || activeTab;
    if (!hasDetailModal(cat)) {
        closeDiagModal();
        return;
    }
    var overlay = document.getElementById(DIAG_MODAL_ID);
    var panel = overlay && overlay.querySelector('.assess-modal-panel');
    if (panel) panel.classList.toggle('assess-modal-panel--compact', cat === 'meqsed');
    fillModalChrome(r, SECTION_LABELS[cat] || 'Ətraflı baxış', cat === 'diag' || cat === 'meqsed');
    var bodyEl = document.getElementById('assessDiagModalBody');
    if (!bodyEl) return;
    if (cat === 'meqsed') bodyEl.innerHTML = meqsedModalBodyHtml(t);
    else if (cat === 'self') bodyEl.innerHTML = selfModalBodyHtml(t);
    else if (cat === 'exq') bodyEl.innerHTML = exqModalBodyHtml(t);
    else bodyEl.innerHTML = diagModalBodyHtml(r);
}

function syncOpenHubModal() {
    if (!openDiagKey) return;
    if (hubRowByKey[openDiagKey]) fillDiagModal(hubRowByKey[openDiagKey]);
    else closeDiagModal();
}

function bindModalEsc() {
    if (modalEscBound) return;
    modalEscBound = true;
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') closeDiagModal();
    });
}

export function openDiagModal(key, btn) {
    if (!key) return;
    if (openDiagKey === key) {
        closeDiagModal();
        return;
    }
    var r = hubRowByKey[key];
    if (!r) {
        var found = (state.issueIndex && state.issueIndex[key])
            || (state.allTasks || []).filter(function(t) { return t.key === key; })[0];
        if (!found) return;
        var y = getAssessmentYear(found);
        r = { task: found, qurum: getAssessmentQurumLabel(found), year: y, years: y != null ? [y] : [] };
        hubRowByKey[key] = r;
    }
    var cat = classifyAssessmentCategory(r.task) || activeTab;
    if (!hasDetailModal(cat)) return;
    openDiagKey = key;
    lastEyeBtn = btn || null;
    fillDiagModal(r);
    var overlay = document.getElementById(DIAG_MODAL_ID);
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('assess-modal-open');
    bindModalEsc();
    var closeBtn = overlay && overlay.querySelector('.assess-modal-close');
    if (closeBtn) closeBtn.focus();
    document.querySelectorAll('.assess-eye-btn').forEach(function(el) {
        el.classList.toggle('is-open', el.getAttribute('data-diag-key') === key);
    });
}

export function closeDiagModal() {
    if (!openDiagKey) {
        var overlayEarly = document.getElementById(DIAG_MODAL_ID);
        if (overlayEarly && overlayEarly.classList.contains('hidden')) return;
    }
    openDiagKey = null;
    var overlay = document.getElementById(DIAG_MODAL_ID);
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('assess-modal-open');
    document.querySelectorAll('.assess-eye-btn.is-open').forEach(function(el) {
        el.classList.remove('is-open');
    });
    if (lastEyeBtn && typeof lastEyeBtn.focus === 'function') {
        try { lastEyeBtn.focus(); } catch (e) {}
    }
    lastEyeBtn = null;
}

export function onDiagModalOverlayClick(ev) {
    if (ev && ev.target && ev.target.id === DIAG_MODAL_ID) closeDiagModal();
}

function getSectionView(section) {
    var hasIssues = Object.keys(state.issueIndex || {}).length > 0;
    if (!hasIssues) {
        return {
            empty: true,
            year: selectedYear,
            yearRows: [],
            filtered: [],
            searchActive: false,
            showDetail: false,
            dashFiltered: false
        };
    }
    var year = resolveSelectedYear(section, collectGlobalYears());
    selectedYear = year;
    var includeUndated = isAllYears(year) && !hasActivePeriod();
    var allRows = collectCategoryTasks(section);
    var searchActive = !!(searchState[section] || '').trim();
    var yearRows = pickSectionRows(section, allRows, year, includeUndated);
    var filtered;
    if (section === 'meqsed' && searchActive) {
        filtered = pickSectionRows(section, filterBySearch(allRows, section), year, includeUndated);
    } else {
        filtered = filterBySearch(yearRows, section);
    }
    filtered = filterRowsByListDash(section, filtered);
    filtered = applyListSort(section, filtered);
    var dashFilter = listDashFilter(section);
    var dashFiltered = !!(dashFilter && dashFilter !== 'all');
    return {
        empty: false,
        year: year,
        yearRows: yearRows,
        filtered: filtered,
        searchActive: searchActive,
        showDetail: hubListDetailActive(section, searchActive),
        dashFiltered: dashFiltered
    };
}

function paintHubBody(section, view) {
    var bodyEl = document.getElementById(HUB_BODY_ID);
    if (!bodyEl) return;
    if (view.empty) {
        if (section === activeTab) updateHubMeta(0, false, view.year);
        rememberHubRows([]);
        bodyEl.innerHTML = emptyHtml();
        if (openDiagKey) closeDiagModal();
        return;
    }
    if (section === activeTab) {
        updateHubMeta(view.showDetail ? view.filtered.length : view.yearRows.length, view.searchActive || view.dashFiltered, view.year);
    }
    var shell = document.querySelector('.assess-table-shell');
    if (shell) shell.classList.toggle('is-open', view.showDetail);
    if (!view.showDetail) {
        rememberHubRows([]);
        bodyEl.innerHTML = '';
        if (openDiagKey) closeDiagModal();
        return;
    }
    if (!view.filtered.length) {
        rememberHubRows([]);
        bodyEl.innerHTML = ((view.searchActive || view.dashFiltered) && view.yearRows.length)
            ? searchEmptyHtml()
            : emptyHtml();
        if (openDiagKey) closeDiagModal();
        return;
    }
    var page = paginateRows(view.filtered, section);
    rememberHubRows(page.slice);
    var html = '';
    if (section === 'diag') html = renderDiag(page.slice);
    else if (section === 'isq') html = renderIsq(page.slice);
    else if (section === 'self') html = renderSelf(page.slice);
    else if (section === 'exq') html = renderExq(page.slice);
    else html = renderMeqsed(page.slice);
    bodyEl.innerHTML = html + page.html;
    syncOpenHubModal();
}

function syncListDashFilterUi(section) {
    var wrap = document.getElementById('assessListDash');
    if (!wrap || wrap.getAttribute('data-section') !== section) return false;
    var cur = listDashFilter(section);
    var buttons = wrap.querySelectorAll('button');
    var i;
    for (i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var onclick = btn.getAttribute('onclick') || '';
        if (onclick.indexOf('showAssessFullList') !== -1) {
            var allOn = cur === 'all';
            btn.classList.toggle('is-active', allOn);
            btn.setAttribute('aria-pressed', allOn ? 'true' : 'false');
            continue;
        }
        var m = onclick.match(/setAssessListFilter\('([^']*)'\)/);
        if (!m) continue;
        var key = m[1];
        if (key === '') continue;
        var on = listDashFilterOn(section, key);
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    var right = wrap.querySelector('.meqsed-ld-head-right');
    if (right) {
        var existing = right.querySelector('.meqsed-ld-clear');
        var label = listDashFilterLabel(section, cur);
        if (label) {
            if (!existing) {
                existing = document.createElement('button');
                existing.type = 'button';
                existing.className = 'meqsed-ld-clear';
                existing.setAttribute('title', 'Filtri sıfırla');
                existing.setAttribute('onclick', "event.stopPropagation(); setAssessListFilter('')");
                right.appendChild(existing);
            }
            existing.textContent = 'Filtr: ' + label + ' ×';
        } else if (existing) {
            existing.remove();
        }
    }
    return true;
}

function setListDashBusy(on) {
    var el = document.getElementById('assessListDashBusy');
    if (!el) return;
    if (on) {
        el.classList.remove('hidden');
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
    } else {
        el.classList.add('hidden');
        el.setAttribute('hidden', '');
        el.setAttribute('aria-hidden', 'true');
    }
}

function withListDashBusy(fn) {
    setListDashBusy(true);
    try {
        fn();
    } finally {
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { setListDashBusy(false); });
        });
    }
}

function renderOne(section, opts) {
    opts = opts || {};
    var bodyEl = document.getElementById(HUB_BODY_ID);
    if (!bodyEl) return;
    var view = getSectionView(section);
    if (view.empty) {
        if (!yearTouched) selectedYear = 'all';
        if (!opts.skipYearSelect) fillYearSelect(listedYears(), selectedYear);
        if (!opts.skipHubDash) renderAssessDash();
        if (!opts.skipListDash) renderAssessListDash(section, []);
        paintHubBody(section, view);
        fillAssessListFilterPopover();
        return;
    }
    if (!opts.skipYearSelect) fillYearSelect(collectGlobalYears(), view.year);
    if (!opts.skipHubDash) renderAssessDash();
    if (!opts.skipListDash) renderAssessListDash(section, view.yearRows);
    else if (!syncListDashFilterUi(section)) renderAssessListDash(section, view.yearRows);
    paintHubBody(section, view);
    fillAssessListFilterPopover();
}

export function renderAssessmentSections() {
    bindAssessListFilterOutside();
    syncTabPanels();
    syncSearchInput();
    renderOne(activeTab);
    scheduleTabCounts();
}

export function setAssessmentTab(tab) {
    if (SECTIONS.indexOf(tab) === -1) return;
    if (tab !== activeTab) {
        activeTab = tab;
        pageState[tab] = pageState[tab] || 1;
    }
    syncTabPanels();
    syncSearchInput();
    withListDashBusy(function() {
        renderOne(activeTab, { skipHubDash: true, skipYearSelect: true });
    });
}

function openAssessmentQurumList(scrollTo) {
    var panel = document.getElementById('assessmentHubContent');
    if (panel && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        panel.classList.add('slide-down');
        var toggleBtn = document.getElementById('assessListToggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        var icon = document.getElementById('icon-assessmentHubContent');
        if (icon) icon.style.transform = 'rotate(180deg)';
    }
    if (!scrollTo) return;
    requestAnimationFrame(function() {
        var target = document.getElementById('assessListToggle')
            || document.getElementById('assessmentHubContent')
            || document.getElementById('assessListDash');
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

export function focusAssessmentSection(tab) {
    if (LIST_DASH_SECTIONS[tab]) {
        listDashFilterByTab[tab] = 'all';
        pageState[tab] = pageState[tab] || 1;
    }
    setAssessmentTab(tab);
    openAssessmentQurumList(true);
}

/** Always reveal the full qurum list for the active list-dash section (no toggle-off). */
export function showAssessFullList() {
    if (document.body.classList.contains('nk303-hub-open') && typeof window.nk303MeqsedFilter === 'function') {
        window.nk303MeqsedFilter('all');
        return;
    }
    var section = activeTab;
    if (!LIST_DASH_SECTIONS[section]) {
        if (SECTIONS.indexOf(section) === -1) return;
        openAssessmentQurumList(true);
        renderOne(section, { skipHubDash: true, skipYearSelect: true });
        return;
    }
    listDashFilterByTab[section] = 'all';
    pageState[section] = 1;
    openAssessmentQurumList(true);
    withListDashBusy(function() {
        renderOne(section, { skipHubDash: true, skipYearSelect: true, skipListDash: true });
    });
    requestAnimationFrame(function() {
        var bodyEl = document.getElementById(HUB_BODY_ID);
        var target = bodyEl || document.getElementById('assessListToggle')
            || document.getElementById('assessmentHubContent');
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

export function setAssessmentSearch(section, query) {
    if (section === 'meqsed' && document.body.classList.contains('nk303-hub-open') && typeof window.nk303MeqsedSearch === 'function') {
        window.nk303MeqsedSearch(query);
        return;
    }
    if (SECTIONS.indexOf(section) === -1) return;
    searchState[section] = query || '';
    pageState[section] = 1;
    if (section === activeTab) {
        syncSearchInput();
        renderOne(section, { skipHubDash: true, skipYearSelect: true, skipListDash: true });
    }
}

export function onAssessmentSearchInput(value) {
    var clearBtn = document.getElementById('assessSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !value);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function() {
        setAssessmentSearch(activeTab, value);
    }, 200);
}

export function clearAssessmentSearch() {
    searchState[activeTab] = '';
    var input = document.getElementById('assessSearchInput');
    if (input) input.value = '';
    var clearBtn = document.getElementById('assessSearchClear');
    if (clearBtn) clearBtn.classList.add('hidden');
    pageState[activeTab] = 1;
    renderOne(activeTab, { skipHubDash: true, skipYearSelect: true, skipListDash: true });
}

export function setAssessmentYear(section, year) {
    setAssessmentYearForActiveTab(year);
}

function resetAssessmentPages() {
    SECTIONS.forEach(function(s) {
        pageState[s] = 1;
        listDashFilterByTab[s] = '';
    });
}

function setPeriodState(startIso, endIso, yearKey) {
    rangeStartIso = startIso || '';
    rangeEndIso = endIso || '';
    selectedYear = yearKey;
    yearTouched = true;
    syncPeriodInputs();
    fillYearSelect(listedYears(), selectedYear);
}

async function loadCurrentPeriod() {
    if (!rangeStartIso || !rangeEndIso) return true;
    var key = rangeStartIso + '|' + rangeEndIso;
    if (key === lastLoadedPeriodKey) return true;
    if (periodLoadBusy) {
        showToast('Dövr hələ yüklənir...', 'info');
        return false;
    }
    if (typeof window.loadAssessmentCreatedRange !== 'function') return true;
    periodLoadBusy = true;
    try {
        var ok = await window.loadAssessmentCreatedRange(rangeStartIso, rangeEndIso);
        if (ok) lastLoadedPeriodKey = key;
        return ok;
    } finally {
        periodLoadBusy = false;
    }
}

export function onAssessMonthChange() {
    /* Ay sahəsi çıxarıldı; geriyə uyğunluq üçün saxlanılır. */
}

export function onAssessDatesChange() {
}

export async function applyAssessmentPeriod() {
    var dates = readPeriodInputs();
    if (!dates.start || !dates.end) {
        showToast('Başlanğıc və son tarixi seçin.', 'error');
        return;
    }
    if (dates.start > dates.end) {
        showToast('Başlanğıc tarixi sondan böyük ola bilməz.', 'error');
        return;
    }
    setPeriodState(dates.start, dates.end, inferYearKey(dates.start, dates.end));
    resetAssessmentPages();
    await loadCurrentPeriod();
    withListDashBusy(function() {
        renderOne(activeTab);
        scheduleTabCounts();
    });
}

export async function setAssessmentYearForActiveTab(year) {
    if (year === 'all' || year === '' || year == null) {
        setPeriodState('', '', 'all');
        lastLoadedPeriodKey = '';
        resetAssessmentPages();
        withListDashBusy(function() {
            renderOne(activeTab);
            scheduleTabCounts();
        });
        return;
    }
    var y = parseInt(year, 10);
    if (!isFinite(y)) return;
    var start = y + '-01-01';
    var end = lastDayOfYearIso(y);
    if (rangeStartIso === start && rangeEndIso === end && Number(selectedYear) === y) {
        renderOne(activeTab);
        scheduleTabCounts();
        return;
    }
    setPeriodState(start, end, y);
    resetAssessmentPages();
    await loadCurrentPeriod();
    withListDashBusy(function() {
        renderOne(activeTab);
        scheduleTabCounts();
    });
}

export function setAssessListFilter(key) {
    if (document.body.classList.contains('nk303-hub-open') && typeof window.nk303MeqsedFilter === 'function') {
        window.nk303MeqsedFilter(key);
        return;
    }
    var section = activeTab;
    if (SECTIONS.indexOf(section) === -1) return;
    var next = String(key == null ? '' : key).trim();
    if (next === 'all') next = '';
    var cur = listDashFilterByTab[section] || '';
    if (cur === 'all') cur = '';
    if (next === '' || next === cur) listDashFilterByTab[section] = '';
    else listDashFilterByTab[section] = next;
    pageState[section] = 1;
    var panel = document.getElementById('assessmentHubContent');
    if (panel && panel.classList.contains('hidden') && listDashFilterByTab[section]) {
        panel.classList.remove('hidden');
        var toggleBtn = document.getElementById('assessListToggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        var icon = document.getElementById('icon-assessmentHubContent');
        if (icon) icon.style.transform = 'rotate(180deg)';
    }
    var pop = document.getElementById('assessListFilterPop');
    var popOpen = pop && !pop.classList.contains('hidden');
    withListDashBusy(function() {
        renderOne(section, { skipHubDash: true, skipYearSelect: true, skipListDash: true });
    });
    if (popOpen) {
        var keep = document.getElementById('assessListFilterPop');
        if (keep) keep.classList.remove('hidden');
        syncAssessListFilterBtn();
    }
    if (listDashFilterByTab[section] && !popOpen) {
        requestAnimationFrame(function() {
            var bodyEl = document.getElementById(HUB_BODY_ID);
            if (bodyEl && typeof bodyEl.scrollIntoView === 'function') {
                bodyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
}

export function setMeqsedDashFilter(key) {
    setAssessListFilter(key);
}

export function setAssessmentPage(section, page) {
    if (SECTIONS.indexOf(section) === -1) return;
    var n = parseInt(page, 10);
    if (!isFinite(n) || n < 1) return;
    pageState[section] = n;
    if (section === activeTab) renderOne(section, { skipHubDash: true, skipYearSelect: true, skipListDash: true });
}

export function toggleAssessmentDetail(section, key) {
    if (!key) return;
    openDiagModal(key);
}

export function getActiveAssessmentTab() {
    return activeTab;
}
