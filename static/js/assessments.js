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
    getDiagScore,
    getExqServiceCount,
    getPhaseFieldText,
    PHASE_FIELDS,
    getMeqsedInfo,
    meqsedModalVisibility,
    MEQSED_NOVU_LABELS,
    qurumMatchKey,
    canonicalQurumName,
    getQurumName,
    sameQurum,
    getSelfAssessInfo,
    getStatusGroup,
    hasAssessmentResult,
    belongsToDept,
    isTaskOrSubtaskType,
    isDiagOverallLabel,
    parseDiagUmumiNetice,
    parseTaskUmumiNetice
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
    other: 'Digər'
};
var STATUS_GROUP_ORDER = ['done', 'progress', 'planned', 'paused', 'review', 'esd', 'blocked', 'rejected', 'other'];
var LIST_DASH_SECTIONS = { diag: true, isq: true, exq: true, meqsed: true };
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
    meqsed: '#db2777'
};
var lastDashSig = '';
var YEAR_SELECT_ID = 'assessmentYearSelect';
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

function createdDayIso(t) {
    var d = getTaskCreatedDate(t);
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
        var day = createdDayIso(r && r.task);
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

function sortDiagRows(rows) {
    return (rows || []).slice().sort(function(a, b) {
        var sa = diagNumericScore(a);
        var sb = diagNumericScore(b);
        if (sa == null && sb == null) {
            return String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
        }
        if (sa == null) return 1;
        if (sb == null) return -1;
        if (sb !== sa) return sb - sa;
        return String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
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

function pagerHtml(section, page, pages, total) {
    if (total <= PAGE_SIZE) return '';
    var prev = page > 1
        ? '<button type="button" class="tl-page-btn" onclick="event.stopPropagation(); setAssessmentPage(\'' + section + '\',' + (page - 1) + ')">Əvvəlki</button>'
        : '';
    var next = page < pages
        ? '<button type="button" class="tl-page-btn" onclick="event.stopPropagation(); setAssessmentPage(\'' + section + '\',' + (page + 1) + ')">Növbəti</button>'
        : '';
    return '<div class="tl-pagination assess-pager">' + prev
        + '<span class="tl-page-label">' + page + ' / ' + pages + ' · ' + total + ' qurum</span>'
        + next + '</div>';
}

function paginateRows(rows, section) {
    var total = rows.length;
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
        html: pagerHtml(section, page, pages, total)
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
            var created = getTaskCreatedDate(r && r.task);
            var y = created ? created.getFullYear() : (r.year != null ? Number(r.year) : null);
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
            + '<strong class="assess-cat-leg-n">' + c.n + '</strong>'
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
    if (titleEl) titleEl.textContent = 'Bölmələr üzrə';
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

function renderDiag(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var key = t.key;
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var headline = getDiagHeadline(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Status', html: statusPill(status, t) },
            { label: 'Ümumi nəticə', html: headlineCell(headline) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(key) }
        ], '');
    }).join('');
    return hubTable('diag', ['Qurum adı', 'Status', 'Ümumi nəticə', ''], body);
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
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var info = getSelfAssessInfo(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Bal', html: scoreBadge(info.score) },
            { label: 'Status', html: statusPill(status, t) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(t.key) }
        ], '');
    }).join('');
    return hubTable('self', ['Qurum adı', 'Bal', 'Status', ''], body);
}

function renderExq(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var count = getExqServiceCount(t);
        var countLabel = count == null ? '—' : String(count);
        var netice = formatAssessmentFieldText(t.fields && t.fields.customfield_17317);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Status', html: statusPill(status, t) },
            { label: 'Xidmət sayı', html: scoreBadge(countLabel) },
            { label: 'EXQ Nəticəsi', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(netice) + '</span>' }
        ], '');
    }).join('');
    return hubTable('exq', ['Qurum adı', 'Status', 'Xidmət sayı', 'EXQ Nəticəsi'], body);
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
        byKind: { new_system: 0, exist_system: 0, new_service: 0, exist_service: 0, other: 0 },
        byLifecycle: { yeni: emptyOpinionBucket(), movcud: emptyOpinionBucket() },
        sistemPos: 0,
        sistemNeg: 0,
        sistemPartial: 0,
        sistemRevision: 0,
        xidmetPos: 0,
        xidmetNeg: 0,
        xidmetUnitsPos: 0,
        xidmetUnitsNeg: 0,
        xidmetUnitsPartial: 0,
        xidmetUnitsRevision: 0
    };
    var qset = {};
    (rows || []).forEach(function(r) {
        var info = getMeqsedInfo(r && r.task);
        var units = meqsedRowUnits(info);
        var opinion = (info && info.opinionKind) || '';
        stats.total += 1;
        var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || '';
        if (qk) qset[qk] = true;
        var kind = units.kind || 'other';
        if (!Object.prototype.hasOwnProperty.call(stats.byKind, kind)) kind = 'other';
        stats.byKind[kind] += 1;
        if (units.isNew) stats.yeni += 1;
        if (units.isExist) stats.movcud += 1;
        if (units.isSystem) stats.sistem += 1;
        if (units.isService) stats.xidmet += 1;
        stats.xidmetUnits += units.xidmet;
        var lifeKey = units.isNew ? 'yeni' : (units.isExist ? 'movcud' : '');
        function bumpLife(op) {
            if (lifeKey && Object.prototype.hasOwnProperty.call(stats.byLifecycle[lifeKey], op)) {
                stats.byLifecycle[lifeKey][op] += 1;
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
    });
    stats.qurum = Object.keys(qset).length;
    return stats;
}

var MEQSED_DASH_FILTER_LABELS = {
    pos: 'Müsbət rəy',
    neg: 'Mənfi rəy',
    partial: 'Qismən',
    revision: 'Düzəlişə göndərildi',
    yeni: 'Yeni yaradılan',
    movcud: 'Mövcudda dəyişiklik',
    sistem: 'Sistem',
    xidmet: 'Xidmət',
    new_system: MEQSED_NOVU_LABELS.new_system,
    exist_system: MEQSED_NOVU_LABELS.exist_system,
    new_service: MEQSED_NOVU_LABELS.new_service,
    exist_service: MEQSED_NOVU_LABELS.exist_service,
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
    (rows || []).forEach(function(r) {
        var qk = qurumMatchKey(r && r.qurum) || (r && r.qurum) || (r && r.task && r.task.key) || '';
        if (qk) qset[qk] = true;
    });
    return Object.keys(qset).length;
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

function meqsedRowMatchesDashFilter(r, filter) {
    if (!filter) return true;
    var info = getMeqsedInfo(r && r.task);
    var units = meqsedRowUnits(info);
    var opinion = (info && info.opinionKind) || '';
    var kind = units.kind || 'other';
    if (filter === 'pos') return opinion === 'pos';
    if (filter === 'neg') return opinion === 'neg';
    if (filter === 'partial') return opinion === 'partial';
    if (filter === 'revision') return opinion === 'revision';
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
    if (filter === 'new_system' || filter === 'exist_system' || filter === 'new_service' || filter === 'exist_service' || filter === 'other') {
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
    var has = hasTextResult(r && r.task && r.task.fields && r.task.fields.customfield_17316);
    if (filter === 'has_result') return has;
    if (filter === 'no_result') return !has;
    return true;
}

function exqRowMatchesDashFilter(r, filter) {
    if (!filter) return true;
    if (filter.indexOf('st_') === 0) return rowStatusGroup(r) === filter.slice(3);
    var t = r && r.task;
    var count = getExqServiceCount(t);
    var has = hasTextResult(t && t.fields && t.fields.customfield_17317);
    if (filter === 'has_result') return has;
    if (filter === 'no_result') return !has;
    if (filter === 'svc_sum') return count != null && count > 0;
    if (filter === 'svc_none' || filter === 'svc_1_5' || filter === 'svc_6_20' || filter === 'svc_21') {
        return exqSvcBandKey(count) === filter;
    }
    return true;
}

function rowMatchesListDashFilter(section, r, filter) {
    if (!filter || filter === 'all') return true;
    if (section === 'meqsed') return meqsedRowMatchesDashFilter(r, filter);
    if (section === 'diag') return diagRowMatchesDashFilter(r, filter);
    if (section === 'isq') return isqRowMatchesDashFilter(r, filter);
    if (section === 'exq') return exqRowMatchesDashFilter(r, filter);
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
        scores: []
    };
    (rows || []).forEach(function(r) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var score = diagNumericScore(r);
        var band = scoreBandKey(score);
        stats.byBand[band] += 1;
        if (score != null) {
            stats.hasResult += 1;
            stats.scores.push(score);
        } else {
            stats.noResult += 1;
        }
    });
    stats.qurum = countQurums(rows);
    stats.avg = avgOf(stats.scores);
    return stats;
}

function isqNumericScore(r) {
    var raw = r && r.task && r.task.fields ? r.task.fields.customfield_17316 : null;
    var text = formatAssessmentFieldText(raw);
    var n = parseScoreForSort(text);
    if (n != null) return n;
    return parseScoreForSort(raw);
}

function collectIsqListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        hasResult: 0,
        noResult: 0,
        byStatus: emptyStatusCounts(),
        avg: null
    };
    var byQurumScores = {};
    (rows || []).forEach(function(r) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var has = hasTextResult(r && r.task && r.task.fields && r.task.fields.customfield_17316);
        if (has) stats.hasResult += 1;
        else stats.noResult += 1;
        var score = isqNumericScore(r);
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

function collectExqListStats(rows) {
    var stats = {
        total: 0,
        qurum: 0,
        hasResult: 0,
        noResult: 0,
        svcSum: 0,
        withSvc: 0,
        byStatus: emptyStatusCounts(),
        bySvc: { svc_none: 0, svc_1_5: 0, svc_6_20: 0, svc_21: 0 }
    };
    (rows || []).forEach(function(r) {
        stats.total += 1;
        var g = rowStatusGroup(r);
        if (!Object.prototype.hasOwnProperty.call(stats.byStatus, g)) g = 'other';
        stats.byStatus[g] += 1;
        var t = r && r.task;
        var count = getExqServiceCount(t);
        var band = exqSvcBandKey(count);
        stats.bySvc[band] += 1;
        if (count != null && count > 0) {
            stats.svcSum += count;
            stats.withSvc += 1;
        }
        if (hasTextResult(t && t.fields && t.fields.customfield_17317)) stats.hasResult += 1;
        else stats.noResult += 1;
    });
    stats.qurum = countQurums(rows);
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

function ldComboCard(title, leftHtml, chartLabel, hasChart, ariaLabel) {
    var section = currentAssessSection();
    return ldHead(section, title)
        + '<div class="meqsed-ld-card assess-ld-panel exq-ld-combo assess-ld-combo">'
        + '<div class="exq-ld-combo-body assess-ld-panel-grid assess-ld-panel-grid--exq">'
        + '<div class="exq-ld-side assess-ld-block">' + leftHtml + '</div>'
        + '<div class="exq-ld-chart-pane assess-ld-block">'
        + '<p class="assess-ld-block-label">' + escapeHtml(chartLabel) + '</p>'
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
        { key: 'pos', label: 'Müsbət', n: stats.pos || 0, color: '#059669', filter: 'pos' },
        { key: 'neg', label: 'Mənfi', n: stats.neg || 0, color: '#dc2626', filter: 'neg' },
        { key: 'revision', label: 'Düzəliş', n: stats.other || 0, color: '#2563eb', filter: 'revision' },
        { key: 'partial', label: 'Qismən', n: stats.partial || 0, color: '#d97706', filter: 'partial' }
    ].filter(function(item) { return item.n > 0; });
}

function diagListDashHtml(stats) {
    var section = 'diag';
    var left = '<div class="exq-ld-side-head">'
        + '<p class="assess-ld-block-label">Bal diapazonu</p>'
        + ldSideMeta('Orta', formatAvg(stats.avg), '')
        + '</div>'
        + '<div class="meqsed-ld-split assess-ld-chips exq-ld-svc-grid">'
        + ldSplitChip(section, '≥ 70', stats.byBand.score_high, 'score_high')
        + ldSplitChip(section, '40–69', stats.byBand.score_mid, 'score_mid')
        + ldSplitChip(section, '< 40', stats.byBand.score_low, 'score_low')
        + ldSplitChip(section, 'Balsız', stats.byBand.score_none, 'score_none')
        + '</div>'
        + '<div class="meqsed-ld-split assess-ld-chips exq-ld-svc-grid assess-ld-chips--secondary">'
        + ldSplitChip(section, 'Nəticəli', stats.hasResult, 'has_result')
        + ldSplitChip(section, 'Nəticəsiz', stats.noResult, 'no_result')
        + '</div>';
    return ldComboCard(
        'Diaqnostika nəticələri',
        left,
        'Status',
        hasStatusSlices(stats.byStatus),
        'Diaqnostika status və qurum'
    );
}

function isqListDashHtml(stats) {
    var section = 'isq';
    var left = '<div class="exq-ld-side-head">'
        + '<p class="assess-ld-block-label">Nəticə vəziyyəti</p>'
        + ldSideMeta('Orta', formatAvg(stats.avg), '')
        + '</div>'
        + '<div class="meqsed-ld-split assess-ld-chips exq-ld-svc-grid">'
        + ldSplitChip(section, 'Nəticəli', stats.hasResult, 'has_result')
        + ldSplitChip(section, 'Nəticəsiz', stats.noResult, 'no_result')
        + '</div>';
    return ldComboCard(
        'İSQ nəticələri',
        left,
        'Status',
        hasStatusSlices(stats.byStatus),
        'İSQ status və qurum'
    );
}

function exqListDashHtml(stats) {
    var section = 'exq';
    var left = '<div class="exq-ld-side-head">'
        + '<p class="assess-ld-block-label">Xidmət sayı</p>'
        + ldSideMeta('Cəmi', stats.svcSum || 0, 'svc_sum')
        + '</div>'
        + '<div class="meqsed-ld-split assess-ld-chips exq-ld-svc-grid">'
        + ldSplitChip(section, 'Yox', stats.bySvc.svc_none, 'svc_none')
        + ldSplitChip(section, '1–5', stats.bySvc.svc_1_5, 'svc_1_5')
        + ldSplitChip(section, '6–20', stats.bySvc.svc_6_20, 'svc_6_20')
        + ldSplitChip(section, '21+', stats.bySvc.svc_21, 'svc_21')
        + '</div>';
    return ldComboCard(
        'Elektron xidmət qiymətləndirmə nəticələri',
        left,
        'Status',
        hasStatusSlices(stats.byStatus),
        'EXQ status və qurum'
    );
}

function meqsedListDashHtml(stats) {
    var section = 'meqsed';
    var items = opinionDonutItems(stats);
    var left = '<div class="exq-ld-side-head">'
        + '<p class="assess-ld-block-label">Rəy</p>'
        + ldSideMeta('Cəmi', items.reduce(function(s, i) { return s + i.n; }, 0), '')
        + '</div>'
        + '<div class="meqsed-ld-split assess-ld-chips exq-ld-svc-grid">'
        + ldSplitChip(section, 'Müsbət', stats.pos || 0, 'pos')
        + ldSplitChip(section, 'Mənfi', stats.neg || 0, 'neg')
        + ldSplitChip(section, 'Düzəliş', stats.other || 0, 'revision')
        + ldSplitChip(section, 'Qismən', stats.partial || 0, 'partial')
        + '</div>';
    return ldComboCard(
        'Məqsədəuyğunluq nəticələri',
        left,
        'Rəy',
        items.length > 0,
        'Məqsədəuyğunluq rəy və qurum'
    );
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
    destroyAssessChart('meqsedOpinionBarChart', 'meqsedOpinionBar');
}

function destroyExqStatusChart() { destroyAssessListDonut(); }
function destroyMeqsedOpinionCharts() { destroyAssessListDonut(); }

function drawAssessListDonut(items, qurumN, centerLabel) {
    if (typeof Chart === 'undefined') return;
    destroyAssessListDonut();
    var canvas = document.getElementById('assessListDonut');
    if (!canvas || !items || !items.length) return;
    var total = items.reduce(function(s, item) { return s + item.n; }, 0);
    var solidColors = items.map(function(item) { return item.color; });
    var centerText = centerLabel || 'Qurum';
    var centerValue = qurumN != null ? qurumN : total;
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
            c.font = '800 22px Inter, system-ui, sans-serif';
            c.fillStyle = '#0f172a';
            c.fillText(String(centerValue), cx, cy - 8);
            c.font = '600 11px Inter, system-ui, sans-serif';
            c.fillStyle = '#64748b';
            c.fillText(centerText, cx, cy + 11);
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
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '66%',
            layout: { padding: { top: 2, bottom: 2, left: 2, right: 4 } },
            plugins: {
                legend: {
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
    drawAssessListDonut(statusDonutItems(stats.byStatus || {}), stats.qurum || 0, 'Qurum');
}

function drawMeqsedOpinionCharts(stats) {
    if (!stats) return;
    drawAssessListDonut(opinionDonutItems(stats), stats.qurum || 0, 'Qurum');
}

function drawDiagStatusChart(stats) {
    if (!stats) return;
    drawAssessListDonut(statusDonutItems(stats.byStatus || {}), stats.qurum || 0, 'Qurum');
}

function drawIsqStatusChart(stats) {
    if (!stats) return;
    drawAssessListDonut(statusDonutItems(stats.byStatus || {}), stats.qurum || 0, 'Qurum');
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
        destroyAssessListDonut();
        el.classList.add('hidden');
        el.setAttribute('hidden', '');
        el.innerHTML = '';
        el.removeAttribute('data-section');
        return;
    }
    el.classList.remove('hidden');
    el.removeAttribute('hidden');
    el.setAttribute('data-section', section);
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
        var due = getTaskDueDate(t);
        var gonderilme = due ? formatDueMonthYear(due) : '—';
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Müraciətin növü', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.novu) + '</span>' },
            { label: 'Məqsədəuyğunluq Rəyi Nəticə', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.netice) + '</span>' },
            { label: 'Göndərilmə tarixi', cls: 'assess-hub-cell--date', html: '<span class="assess-text-value assess-date-value">' + escapeHtml(gonderilme) + '</span>' },
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
    var parsed = parseTaskUmumiNetice(t);
    var extras = (parsed.extras || []).filter(function(e) {
        return e && e.title && !isJiraTableHeaderDump(e.title) && !isJiraTableHeaderDump(e.score)
            && !isDiagOverallLabel(e.title);
    });
    var rows = (parsed.directions || []).filter(neticeRowHasContent).concat(extras);
    var overallScore = parsed.overall && parsed.overall.score && parsed.overall.score !== '—'
        && !isJiraTableHeaderDump(parsed.overall.score) ? parsed.overall.score : '';
    var overallText = (parsed.overall && parsed.overall.text) || '';
    if (isJiraTableHeaderDump(overallText)) overallText = '';
    var parts = [];
    if (overallScore || overallText) {
        parts.push('<div class="assess-modal-overall">'
            + '<div class="assess-modal-overall-label">Ümumi nəticə</div>'
            + (overallScore ? '<div class="assess-modal-overall-score">' + scoreBadge(overallScore) + '</div>' : '')
            + (overallText ? '<p class="assess-modal-overall-text">' + escapeHtml(overallText) + '</p>' : '')
            + '</div>');
    }
    var dirHtml = rows.map(function(d) { return directionCard(d, overallText); }).join('');
    if (dirHtml) {
        parts.push('<div class="assess-dir-grid">' + dirHtml + '</div>');
    }
    if (parts.length) return parts.join('');
    var info = getSelfAssessInfo(t);
    if (info.blocks && info.blocks.length) return renderBlocks(info.blocks);
    return '<p class="assess-modal-empty">Ümumi nəticə qeyd edilməyib.</p>';
}

function hasDetailModal(cat) {
    return cat === 'diag' || cat === 'self' || cat === 'meqsed';
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

function renderOne(section) {
    var bodyEl = document.getElementById(HUB_BODY_ID);
    if (!bodyEl) return;
    var hasIssues = Object.keys(state.issueIndex || {}).length > 0;
    if (!hasIssues) {
        if (!yearTouched) selectedYear = 'all';
        fillYearSelect(listedYears(), selectedYear);
        renderAssessDash();
        renderAssessListDash(section, []);
        if (section === activeTab) updateHubMeta(0, false, selectedYear);
        rememberHubRows([]);
        bodyEl.innerHTML = emptyHtml();
        if (openDiagKey) closeDiagModal();
        return;
    }
    var globalYears = collectGlobalYears();
    var year = resolveSelectedYear(section, globalYears);
    selectedYear = year;
    fillYearSelect(globalYears, year);
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
    if (LIST_DASH_SECTIONS[section]) filtered = filterRowsByListDash(section, filtered);
    if (section === 'diag') filtered = sortDiagRows(filtered);
    renderAssessDash();
    renderAssessListDash(section, yearRows);

    var dashFiltered = !!(LIST_DASH_SECTIONS[section] && listDashFilter(section));
    var showDetail = hubListDetailActive(section, searchActive);
    if (section === activeTab) {
        updateHubMeta(showDetail ? filtered.length : yearRows.length, searchActive || dashFiltered, year);
    }

    var shell = document.querySelector('.assess-table-shell');
    if (shell) shell.classList.toggle('is-open', showDetail);

    if (!showDetail) {
        rememberHubRows([]);
        bodyEl.innerHTML = '';
        if (openDiagKey) closeDiagModal();
        return;
    }

    if (!filtered.length) {
        rememberHubRows([]);
        bodyEl.innerHTML = ((searchActive || dashFiltered) && yearRows.length)
            ? searchEmptyHtml()
            : emptyHtml();
        if (openDiagKey) closeDiagModal();
        return;
    }
    var page = paginateRows(filtered, section);
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

export function renderAssessmentSections() {
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
    renderOne(activeTab);
    scheduleTabCounts();
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
    var section = activeTab;
    if (!LIST_DASH_SECTIONS[section]) {
        if (SECTIONS.indexOf(section) === -1) return;
        openAssessmentQurumList(true);
        renderOne(section);
        scheduleTabCounts();
        return;
    }
    listDashFilterByTab[section] = 'all';
    pageState[section] = 1;
    openAssessmentQurumList(false);
    renderOne(section);
    scheduleTabCounts();
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
    if (SECTIONS.indexOf(section) === -1) return;
    searchState[section] = query || '';
    pageState[section] = 1;
    if (section === activeTab) renderOne(section);
    scheduleTabCounts();
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
    renderOne(activeTab);
    scheduleTabCounts();
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
    renderOne(activeTab);
    scheduleTabCounts();
}

export async function setAssessmentYearForActiveTab(year) {
    if (year === 'all' || year === '' || year == null) {
        setPeriodState('', '', 'all');
        lastLoadedPeriodKey = '';
        resetAssessmentPages();
        renderOne(activeTab);
        scheduleTabCounts();
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
    renderOne(activeTab);
    scheduleTabCounts();
}

export function setAssessListFilter(key) {
    var section = activeTab;
    if (!LIST_DASH_SECTIONS[section]) {
        if (SECTIONS.indexOf('meqsed') !== -1) {
            activeTab = 'meqsed';
            section = 'meqsed';
            syncTabPanels();
            syncSearchInput();
        } else {
            return;
        }
    }
    var next = String(key == null ? '' : key).trim();
    var cur = listDashFilterByTab[section] || '';
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
    renderOne(section);
    scheduleTabCounts();
    if (listDashFilterByTab[section]) {
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
    if (section === activeTab) renderOne(section);
}

export function toggleAssessmentDetail(section, key) {
    if (!key) return;
    openDiagModal(key);
}

export function getActiveAssessmentTab() {
    return activeTab;
}
