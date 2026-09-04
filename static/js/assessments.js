import { state } from './state.js';
import { normalizeStr } from './utils.js';
import {
    classifyAssessmentCategory,
    formatAssessmentFieldText,
    getAssessmentQurumLabel,
    getAssessmentTaskTime,
    getAssessmentYear,
    getDiagHeadline,
    getTaskDueDate,
    getDiagScore,
    getExqServiceCount,
    getPhaseFieldText,
    PHASE_FIELDS,
    getMeqsedInfo,
    qurumMatchKey,
    canonicalQurumName,
    getQurumName,
    sameQurum,
    getSelfAssessInfo,
    getStatusGroup,
    hasAssessmentResult,
    isTaskType,
    isDiagOverallLabel,
    parseDiagUmumiNetice,
    parseTaskUmumiNetice
} from './model.js';

var SECTIONS = ['diag', 'isq', 'self', 'exq', 'meqsed'];
var searchState = { diag: '', isq: '', self: '', exq: '', meqsed: '' };
var activeTab = 'diag';
var selectedYear = 'all';
var yearTouched = false;
var searchDebounceTimer = null;
var pageState = { diag: 1, isq: 1, self: 1, exq: 1, meqsed: 1 };
var PAGE_SIZE = 10;
var SECTION_LABELS = {
    diag: 'Diaqnostika',
    isq: 'İSQ',
    self: 'Özünüqiymətləndirmə',
    exq: 'Elektron xidmət',
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

function getRowCache() {
    var tasks = state.allTasks || [];
    var qf = state.currentQurumFilter || '';
    if (rowCache && rowCache.tasks === tasks && rowCache.qurum === qf && rowCache.len === tasks.length) {
        return rowCache;
    }
    var byCat = { diag: [], isq: [], self: [], exq: [], meqsed: [] };
    var years = {};
    for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (!t || !isTaskType(t)) continue;
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
        tasks: tasks,
        qurum: qf,
        len: tasks.length,
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

function rowMatchesYear(r, year, includeUndated) {
    if (isAllYears(year)) return true;
    if (r.year != null && Number(r.year) === Number(year)) return true;
    if (includeUndated && (r.year == null || r.year === '')) return true;
    return false;
}

function resolveSelectedYear(section, globalYears) {
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
        if (!rowMatchesYear(r, year, includeUndated)) return;
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
    var opts = (years || []).map(Number).filter(function(y) { return isFinite(y); });
    if (!allOn) {
        var selectedNum = Number(selected);
        if (isFinite(selectedNum) && opts.indexOf(selectedNum) === -1) opts.push(selectedNum);
    }
    opts.sort(function(a, b) { return b - a; });

    var el = document.getElementById(YEAR_SELECT_ID);
    if (el) {
        el.innerHTML = '<option value="all"' + (allOn ? ' selected' : '') + '>Hamısı</option>'
            + opts.map(function(y) {
                return '<option value="' + y + '"' + (!allOn && y === Number(selected) ? ' selected' : '') + '>' + y + '</option>';
            }).join('');
        el.value = allOn ? 'all' : String(selected);
    }

    var pills = document.getElementById('assessmentYearPills');
    if (pills) {
        var hamisi = '<button type="button" class="assess-year-pill' + (allOn ? ' is-active' : '') + '"'
            + ' aria-pressed="' + (allOn ? 'true' : 'false') + '"'
            + ' onclick="event.stopPropagation(); setAssessmentYearForActiveTab(\'all\')">Hamısı</button>';
        if (!opts.length) {
            pills.innerHTML = hamisi + '<span class="assess-year-empty">İl yoxdur</span>';
        } else {
            pills.innerHTML = hamisi + opts.map(function(y) {
                var on = !allOn && y === Number(selected);
                return '<button type="button" class="assess-year-pill' + (on ? ' is-active' : '') + '"'
                    + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
                    + ' onclick="event.stopPropagation(); setAssessmentYearForActiveTab(' + y + ')">'
                    + y + '</button>';
            }).join('');
        }
    }
}

function updateHubMeta(count, searchActive, year) {
    var meta = document.getElementById('assessHubMeta');
    if (!meta) return;
    var yearBit = isAllYears(year) ? 'Bütün illər' : String(year);
    if (searchActive) {
        meta.textContent = yearBit + ' · ' + (count === 1 ? '1 nəticə tapıldı' : count + ' nəticə tapıldı');
        meta.classList.add('is-search');
    } else if (count > 0) {
        meta.textContent = yearBit + ' · ' + (count === 1 ? '1 qurum' : count + ' qurum');
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
    var includeUndated = isAllYears(year);
    var searchActive = !!(searchState[section] || '').trim();
    var pool = (section === 'meqsed' && searchActive) ? filterBySearch(allRows, section) : allRows;
    var rows = pickBestPerQurumYear(pool, year, includeUndated);
    return { allRows: allRows, years: globalYears, year: year, rows: rows, searchApplied: section === 'meqsed' && searchActive };
}

function updateTabCounts() {
    SECTIONS.forEach(function(section) {
        var btn = document.querySelector('.assess-tab[data-tab="' + section + '"]');
        if (!btn) return;
        var data = getSectionRows(section);
        var count = data.searchApplied ? data.rows.length : filterBySearch(data.rows, section).length;
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
    var msg = isAllYears(selectedYear) ? 'Qeyd tapılmadı.' : 'Bu ildə qeyd tapılmadı.';
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
    var years = collectGlobalYears();
    if (!isAllYears(selectedYear)) {
        var yNum = Number(selectedYear);
        years = isFinite(yNum) ? [yNum] : [];
    }
    var yearCounts = years.map(function(y) {
        var total = 0;
        var parts = SECTIONS.map(function(s) {
            var n = pickBestPerQurumYear(collectCategoryTasks(s), y, false).length;
            total += n;
            return { s: s, n: n };
        });
        return { y: y, total: total, parts: parts };
    }).filter(function(row) { return row.total > 0; });
    yearCounts.sort(function(a, b) { return a.y - b.y; });
    var catCounts = SECTIONS.map(function(s) {
        var n = pickBestPerQurumYear(collectCategoryTasks(s), selectedYear, isAllYears(selectedYear)).length;
        return { s: s, n: n };
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
    var selectedOn = !isAllYears(selectedYear);
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
    var colors = catCounts.map(function(c) { return CAT_COLORS[c.s]; });
    var total = data.reduce(function(a, b) { return a + b; }, 0);
    var centerPlugin = {
        id: 'assessCatCenter',
        afterDraw: function(chart) {
            var area = chart.chartArea;
            var c = chart.ctx;
            c.save();
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = '700 22px Inter, sans-serif';
            c.fillStyle = '#1e293b';
            c.fillText(String(total), area.left + area.width / 2, area.top + area.height / 2 - 8);
            c.font = '500 11px Inter, sans-serif';
            c.fillStyle = '#64748b';
            c.fillText('qurum', area.left + area.width / 2, area.top + area.height / 2 + 10);
            c.restore();
        }
    };
    var ctx = canvas.getContext('2d');
    state.assessCatChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: catCounts.map(function(c) { return c.s === activeTab ? 3 : 2; }),
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            layout: { padding: { top: 4, bottom: 4, left: 2, right: 8 } },
            plugins: {
                legend: {
                    position: (typeof window !== 'undefined' && window.innerWidth < 768) ? 'bottom' : 'right',
                    labels: { usePointStyle: true, padding: 10, font: { family: 'Inter', size: 11 }, boxWidth: 8, color: '#475569' },
                    onClick: function(e, item) {
                        var s = catCounts[item.index] && catCounts[item.index].s;
                        if (s) setAssessmentTab(s);
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
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
                var s = catCounts[els[0].index] && catCounts[els[0].index].s;
                if (s) setAssessmentTab(s);
            }
        },
        plugins: [centerPlugin]
    });
}

function renderAssessDash() {
    var el = document.getElementById('assessDash');
    if (!el) return;
    var kpis = document.getElementById('assessDashKpis');
    if (!(state.allTasks || []).length) {
        lastDashSig = '';
        destroyAssessChart('assessYearChart', 'assessYearChart');
        destroyAssessChart('assessCatChart', 'assessCatChart');
        if (kpis) kpis.innerHTML = '';
        setAssessChartVisible('assessYearChartWrap', 'assessYearEmpty', false);
        setAssessChartVisible('assessCatChartWrap', 'assessCatEmpty', false);
        return;
    }
    var model = collectDashModel();
    var yearCounts = model.yearCounts;
    var catCounts = model.catCounts;
    if (kpis) {
        kpis.innerHTML = catCounts.map(function(c) {
            var on = c.s === activeTab ? ' is-active' : '';
            return '<button type="button" class="assess-kpi' + on + '" onclick="event.stopPropagation(); setAssessmentTab(\'' + c.s + '\')">'
                + '<span class="assess-kpi-label">' + escapeHtml(SECTION_LABELS[c.s]) + '</span>'
                + '<strong class="assess-kpi-value">' + c.n + '</strong></button>';
        }).join('');
    }
    var sig = yearCounts.map(function(r) { return r.y + ':' + r.total; }).join(',')
        + '|' + String(selectedYear) + '|' + activeTab + '|'
        + catCounts.map(function(c) { return c.s + ':' + c.n; }).join(',');
    var yearOk = yearCounts.length > 0;
    var catOk = catCounts.some(function(c) { return c.n > 0; });
    setAssessChartVisible('assessYearChartWrap', 'assessYearEmpty', yearOk);
    setAssessChartVisible('assessCatChartWrap', 'assessCatEmpty', catOk);
    if (sig === lastDashSig) {
        var yearReady = !yearOk || state.assessYearChart;
        var catReady = !catOk || state.assessCatChart;
        if (yearReady && catReady) return;
    }
    lastDashSig = sig;
    if (yearOk) drawAssessYearChart(yearCounts);
    else destroyAssessChart('assessYearChart', 'assessYearChart');
    if (catOk) drawAssessCatChart(catCounts);
    else destroyAssessChart('assessCatChart', 'assessCatChart');
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

function renderMeqsed(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var info = getMeqsedInfo(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Müraciətin növü', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.novu) + '</span>' },
            { label: 'Məqsədəuyğunluq Rəyi Nəticə', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.netice) + '</span>' },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(t.key) }
        ], '');
    }).join('');
    return hubTable('meqsed', ['Qurum adı', 'Müraciətin növü', 'Məqsədəuyğunluq Rəyi Nəticə', ''], body);
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
    return modalFieldBlocks([
        { label: 'Sistemin adı', value: info.sistemAdi },
        { label: 'Xidmət sayı', value: info.xidmetSayi },
        { label: 'Məqsədəuyğunluq Rəyi Nəticə', value: info.netice },
        { label: 'Məqsədəuyğunluq üzrə müraciətin növü', value: info.novu },
        { label: 'Xidmət(lər) barədə məlumat', value: info.xidmetMelumat }
    ]);
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
        var found = (state.allTasks || []).filter(isTaskType).filter(function(t) { return t.key === key; })[0];
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
    if (!(state.allTasks || []).length) {
        if (!yearTouched) selectedYear = 'all';
        fillYearSelect([], selectedYear);
        renderAssessDash();
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
    var includeUndated = isAllYears(year);
    var allRows = collectCategoryTasks(section);
    var searchActive = !!(searchState[section] || '').trim();
    var yearRows = pickBestPerQurumYear(allRows, year, includeUndated);
    var filtered;
    if (section === 'meqsed' && searchActive) {
        filtered = pickBestPerQurumYear(filterBySearch(allRows, section), year, includeUndated);
    } else {
        filtered = filterBySearch(yearRows, section);
    }
    if (section === 'diag') filtered = sortDiagRows(filtered);
    renderAssessDash();

    if (section === activeTab) {
        updateHubMeta(filtered.length, searchActive, year);
    }

    if (!filtered.length) {
        rememberHubRows([]);
        bodyEl.innerHTML = (searchActive && yearRows.length) ? searchEmptyHtml() : emptyHtml();
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

export function setAssessmentYearForActiveTab(year) {
    if (year === 'all' || year === '' || year == null) {
        selectedYear = 'all';
    } else {
        var y = parseInt(year, 10);
        if (!isFinite(y)) return;
        selectedYear = y;
    }
    yearTouched = true;
    SECTIONS.forEach(function(s) { pageState[s] = 1; });
    renderOne(activeTab);
    scheduleTabCounts();
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
