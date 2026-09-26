import { state } from './state.js';
import { getInitials, normalizeStr, showToast } from './utils.js';
import { collectOtherDashboardUnits, countableWorkUnits, currentSprintName, canonicalQurumName, comparePriorityNames, getEsdInnerStatus, ESD_INNER_STAGES, getReviewParty, REVIEW_PARTY_OPTIONS, getPriorityColor, getQurumName, getTaskPriorityName, isOtherDashboardUnit, qurumMatchKey, sameQurum, getSprintDateRange, getStatusGroup, hasValidDifficulty, isActiveExecutionGroup, resolveDirection } from './model.js?v=idda9';
import { applyFilters, filterQurumByStatus, filterQurumList, onEsdStatusClicked, onReviewStatusClicked, rememberListAction, selectDailyUser, setQurumFilter, showDifficulties } from './filters.js?v=idda36';
import { openTaskListSection, renderTaskList, showUserActivity } from './render.js?v=idda9';
import { STATUS, catColorByKey, seriesColor } from './palette.js?v=idda3';

var chartRebuildRaf = {};
var chartRebuildFn = {};
function debounceChartRebuild(name, fn) {
    chartRebuildFn[name] = fn;
    if (chartRebuildRaf[name]) return;
    chartRebuildRaf[name] = requestAnimationFrame(function() {
        chartRebuildRaf[name] = 0;
        var run = chartRebuildFn[name];
        chartRebuildFn[name] = null;
        if (run) run();
    });
}

function taskLabelNames(t) {
    var raw = (t && t.fields && t.fields.labels) ? t.fields.labels : [];
    return raw.map(function(lbl) {
        if (lbl && typeof lbl === 'object') return String(lbl.name || lbl.value || '').trim();
        return String(lbl || '').trim();
    }).filter(Boolean);
}

function taskMatchesChartLabel(t, selectedLabel) {
    var labels = taskLabelNames(t);
    if (selectedLabel === 'Etiketsiz') return labels.length === 0;
    return labels.indexOf(selectedLabel) !== -1;
}

function uniqueTasksByKey(tasks) {
    var seen = {};
    return (tasks || []).filter(function(t) {
        if (!t || !t.key || seen[t.key]) return false;
        seen[t.key] = true;
        return true;
    });
}

function directionLabelTasks(dirKey) {
    var source = state.labelChartTasks || state.filteredTasks;
    return uniqueTasksByKey(countableWorkUnits(source).filter(function(t) {
        var dir = resolveDirection(t);
        return dir && dir.key === dirKey;
    }));
}

function etiketsizTasks(directionTasks) {
    return uniqueTasksByKey((directionTasks || []).filter(function(t) {
        return taskMatchesChartLabel(t, 'Etiketsiz');
    }));
}

function tasksForChartLabel(directionTasks, selectedLabel) {
    if (selectedLabel === 'Etiketsiz') return etiketsizTasks(directionTasks);
    return uniqueTasksByKey((directionTasks || []).filter(function(t) {
        return taskMatchesChartLabel(t, selectedLabel);
    }));
}

export function renderStatusChart(tasks) {
    debounceChartRebuild('statusChart', function() { drawStatusChart(tasks); });
}

function esdInnerStageMeta(id) {
    var i;
    for (i = 0; i < (ESD_INNER_STAGES || []).length; i++) {
        if (ESD_INNER_STAGES[i].id === id) return ESD_INNER_STAGES[i];
    }
    return null;
}

function reviewPartyMeta(id) {
    var i;
    for (i = 0; i < (REVIEW_PARTY_OPTIONS || []).length; i++) {
        if (REVIEW_PARTY_OPTIONS[i].id === id) return REVIEW_PARTY_OPTIONS[i];
    }
    return null;
}

function escapeEsdChip(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

var STATUS_GROUP_NAMES = { 'done': 'İcra edilib', 'progress': 'İcradadır', 'review': 'Rəy gözlənilir', 'esd': 'ESD', 'planned': 'Planlaşdırılıb', 'blocked': 'Bloklanıb', 'rejected': 'İmtina', 'other': 'Digər' };
var STATUS_CHART_ORDER = ['done', 'progress', 'review', 'esd', 'planned', 'blocked', 'rejected', 'other'];
var STATUS_GROUP_COLORS = STATUS;

var esdPopupOpen = false;
var esdPopupBound = false;
var esdIgnoreUntil = 0;
var reviewPopupOpen = false;
var reviewPopupWanted = false;
var reviewPopupBound = false;
var reviewIgnoreUntil = 0;

function syncEsdLegendOpen() {
    var el = document.getElementById('statusChartLegend');
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('.icra-legend-row'), function(btn) {
        var key = btn.getAttribute('data-status');
        btn.classList.toggle('is-active', key === state.currentStatusFilter);
        btn.classList.toggle('is-esd-open', esdPopupOpen && key === 'esd');
        btn.classList.toggle('is-review-open', reviewPopupOpen && key === 'review');
    });
}

export function closeEsdStagePopup() {
    esdPopupOpen = false;
    var panel = document.getElementById('esdStatusPanel');
    if (panel) {
        panel.classList.add('hidden');
        panel.setAttribute('hidden', '');
        panel.setAttribute('aria-hidden', 'true');
    }
    syncEsdLegendOpen();
}

function openEsdStagePopup() {
    var panel = document.getElementById('esdStatusPanel');
    var chips = document.getElementById('esdStatusChips');
    if (!panel || !chips || !chips.innerHTML) return;
    esdPopupOpen = true;
    esdIgnoreUntil = Date.now() + 350;
    panel.classList.remove('hidden');
    panel.removeAttribute('hidden');
    panel.setAttribute('aria-hidden', 'false');
    syncEsdLegendOpen();
    bindEsdPopupDismiss();
}

function toggleEsdStagePopup() {
    if (esdPopupOpen) closeEsdStagePopup();
    else {
        closeReviewPartyPopup();
        openEsdStagePopup();
    }
}

export function closeReviewPartyPopup() {
    reviewPopupOpen = false;
    reviewPopupWanted = false;
    var panel = document.getElementById('reviewPartyPanel');
    if (panel) {
        panel.classList.add('hidden');
        panel.setAttribute('hidden', '');
        panel.setAttribute('aria-hidden', 'true');
    }
    syncEsdLegendOpen();
}

function openReviewPartyPopup() {
    var panel = document.getElementById('reviewPartyPanel');
    var chips = document.getElementById('reviewPartyChips');
    if (!panel || !chips) return false;
    if (!chips.innerHTML && !openReviewPartyPopup._filling) {
        openReviewPartyPopup._filling = true;
        try { renderReviewPartyBreakdown(state.statusChartTasks || state.filteredTasks, true); }
        finally { openReviewPartyPopup._filling = false; }
    }
    if (!chips.innerHTML) return false;
    reviewPopupOpen = true;
    reviewPopupWanted = true;
    reviewIgnoreUntil = Date.now() + 350;
    panel.classList.remove('hidden');
    panel.removeAttribute('hidden');
    panel.setAttribute('aria-hidden', 'false');
    syncEsdLegendOpen();
    bindReviewPopupDismiss();
    return true;
}

function showReviewTasksAndPopup() {
    closeEsdStagePopup();
    var secondClick = state.currentStatusFilter === 'review';
    reviewPopupWanted = true;
    onReviewStatusClicked();
    renderReviewPartyBreakdown(state.statusChartTasks || state.filteredTasks, true);
    openReviewPartyPopup();
    if (!secondClick) return;
    var list = countableWorkUnits(state.filteredTasks);
    rememberListAction({ kind: 'reviewParty', partyId: state.currentReviewPartyFilter || 'all' });
    renderTaskList(list, 'Rəy gözlənilir - Tapşırıqları', { keepNested: true });
    openTaskListSection();
}

function bindReviewPopupDismiss() {
    if (reviewPopupBound) return;
    reviewPopupBound = true;
    document.addEventListener('click', function(ev) {
        if (!reviewPopupOpen) return;
        if (Date.now() < reviewIgnoreUntil) return;
        var panel = document.getElementById('reviewPartyPanel');
        var t = ev && ev.target;
        if (panel && panel.contains(t)) return;
        if (t && t.closest && t.closest('.icra-legend-row[data-status="review"]')) return;
        closeReviewPartyPopup();
    });
    document.addEventListener('keydown', function(ev) {
        if ((ev.key === 'Escape' || ev.key === 'Esc') && reviewPopupOpen) closeReviewPartyPopup();
    });
}

function bindEsdPopupDismiss() {
    if (esdPopupBound) return;
    esdPopupBound = true;
    document.addEventListener('click', function(ev) {
        if (!esdPopupOpen) return;
        if (Date.now() < esdIgnoreUntil) return;
        var panel = document.getElementById('esdStatusPanel');
        var t = ev && ev.target;
        if (panel && panel.contains(t)) return;
        if (t && t.closest && t.closest('.icra-legend-row[data-status="esd"]')) return;
        closeEsdStagePopup();
    });
    document.addEventListener('keydown', function(ev) {
        if ((ev.key === 'Escape' || ev.key === 'Esc') && esdPopupOpen) closeEsdStagePopup();
    });
}

function openStatusGroup(k, ev) {
    if (!k) return;
    if (k === 'esd') {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        closeReviewPartyPopup();
        onEsdStatusClicked();
        toggleEsdStagePopup();
        return;
    }
    if (k === 'review') {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        showReviewTasksAndPopup();
        return;
    }
    closeEsdStagePopup();
    closeReviewPartyPopup();
    if (state.currentStatusFilter === 'esd' || state.currentStatusFilter === 'review') {
        state.currentStatusFilter = null;
        state.currentEsdInnerFilter = null;
        state.currentReviewPartyFilter = null;
        applyFilters();
    }
    if (k === 'blocked') {
        rememberListAction({ kind: 'difficulties' });
        showDifficulties();
        return;
    }
    var pool = state.statusChartTasks || state.filteredTasks;
    var list = k === 'other'
        ? collectOtherDashboardUnits()
        : countableWorkUnits(pool).filter(function(t) { return getStatusGroup(t.fields.status.name) === k; });
    rememberListAction({ kind: 'chartStatus', group: k });
    renderTaskList(list, (STATUS_GROUP_NAMES[k] || k) + ' - Tapşırıqları', { keepNested: true });
    openTaskListSection();
}

function renderStatusLegend(keys, data, colors, total) {
    var el = document.getElementById('statusChartLegend');
    if (!el) return;
    el.innerHTML = keys.map(function(k, i) {
        var n = data[i] || 0;
        var pct = total ? Math.round((n / total) * 100) : 0;
        return '<button type="button" class="icra-legend-row' + (k === state.currentStatusFilter ? ' is-active' : '') + '" data-status="' + k + '">'
            + '<span class="icra-legend-dot" style="background:' + colors[i] + '"></span>'
            + '<span class="icra-legend-name">' + escapeEsdChip(STATUS_GROUP_NAMES[k] || k) + '</span>'
            + '<span class="icra-legend-meta"><b>' + n + '</b><em>' + pct + '%</em></span>'
            + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.icra-legend-row'), function(btn) {
        btn.addEventListener('click', function(ev) { openStatusGroup(btn.getAttribute('data-status'), ev); });
    });
    syncEsdLegendOpen();
}

export function renderEsdStatusBreakdown(tasks) {
    var panel = document.getElementById('esdStatusPanel');
    var chips = document.getElementById('esdStatusChips');
    if (!panel || !chips) return;
    var esdTasks = countableWorkUnits(tasks).filter(function(t) {
        return getStatusGroup(t.fields.status.name) === 'esd';
    });
    if (!esdTasks.length) {
        chips.innerHTML = '';
        closeEsdStagePopup();
        return;
    }
    var counts = {};
    (ESD_INNER_STAGES || []).forEach(function(stage) {
        counts[stage.id] = { id: stage.id, label: stage.label, n: 0 };
    });
    esdTasks.forEach(function(t) {
        var inner = getEsdInnerStatus(t) || { id: 'none', label: 'Seçilməyib' };
        if (!counts[inner.id]) counts[inner.id] = { id: inner.id, label: inner.label, n: 0 };
        counts[inner.id].n += 1;
        if (inner.label) counts[inner.id].label = inner.label;
    });
    var order = (ESD_INNER_STAGES || []).map(function(s) { return s.id; });
    var extras = Object.keys(counts).filter(function(id) { return order.indexOf(id) === -1; }).sort();
    var ids = order.concat(extras);
    var selectedInner = state.currentStatusFilter === 'esd' ? (state.currentEsdInnerFilter || 'all') : '';
    var html = '<button type="button" class="esd-status-row is-all' + (selectedInner === 'all' ? ' is-selected' : '') + '" onclick="filterEsdInnerStatus(\'all\')" title="Bütün ESD tapşırıqları">'
        + '<span class="esd-status-dot"></span><span>Hamısı</span><b>' + esdTasks.length + '</b></button>';
    html += ids.map(function(id) {
        var row = counts[id];
        var meta = esdInnerStageMeta(id);
        var label = (meta && meta.label) || row.label || id;
        var arg = String(id).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
        var slug = escapeEsdChip(String(id).replace(/[^a-z0-9]+/gi, '-'));
        var isSel = selectedInner === id;
        return '<button type="button" class="esd-status-row is-' + slug + (isSel ? ' is-selected' : '') + '"'
            + ' onclick="filterEsdInnerStatus(\'' + arg + '\')"'
            + ' title="ESD Statusu: ' + escapeEsdChip(label) + '">'
            + '<span class="esd-status-dot"></span>'
            + '<span>' + escapeEsdChip(label) + '</span><b>' + row.n + '</b></button>';
    }).join('');
    chips.innerHTML = html;
    if (!panel._esdStopBound) {
        panel._esdStopBound = true;
        panel.addEventListener('click', function(ev) { ev.stopPropagation(); });
    }
    if (esdPopupOpen) openEsdStagePopup();
    else closeEsdStagePopup();
}

export function renderReviewPartyBreakdown(tasks, keepOpen) {
    var panel = document.getElementById('reviewPartyPanel');
    var chips = document.getElementById('reviewPartyChips');
    if (!panel || !chips) return;
    var reviewTasks = countableWorkUnits(tasks).filter(function(t) {
        return getStatusGroup(t.fields.status.name) === 'review';
    });
    if (!reviewTasks.length) {
        chips.innerHTML = '';
        closeReviewPartyPopup();
        return;
    }
    var counts = {};
    (REVIEW_PARTY_OPTIONS || []).forEach(function(opt) {
        counts[opt.id] = { id: opt.id, label: opt.label, n: 0 };
    });
    reviewTasks.forEach(function(t) {
        var party = getReviewParty(t) || { id: 'none', label: 'Məlumat mövcud deyil', roleLabel: 'Məlumat mövcud deyil' };
        var chipLabel = party.roleLabel || party.label;
        if (!counts[party.id]) counts[party.id] = { id: party.id, label: chipLabel, n: 0 };
        counts[party.id].n += 1;
        if (chipLabel) counts[party.id].label = chipLabel;
    });
    var order = (REVIEW_PARTY_OPTIONS || []).map(function(s) { return s.id; });
    var extras = Object.keys(counts).filter(function(id) { return order.indexOf(id) === -1; }).sort();
    var ids = order.concat(extras);
    var selectedParty = state.currentStatusFilter === 'review' ? (state.currentReviewPartyFilter || 'all') : '';
    var html = '<button type="button" class="esd-status-row is-all' + (selectedParty === 'all' ? ' is-selected' : '') + '" onclick="filterReviewParty(\'all\')" title="Bütün rəy gözlənilən tapşırıqlar">'
        + '<span class="esd-status-dot"></span><span>Hamısı</span><b>' + reviewTasks.length + '</b></button>';
    html += ids.map(function(id) {
        var row = counts[id];
        var meta = reviewPartyMeta(id);
        var label = (meta && meta.label) || row.label || id;
        var arg = String(id).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
        var slug = escapeEsdChip(String(id).replace(/[^a-z0-9]+/gi, '-'));
        var isSel = selectedParty === id;
        return '<button type="button" class="esd-status-row is-' + slug + (isSel ? ' is-selected' : '') + '"'
            + ' onclick="filterReviewParty(\'' + arg + '\')"'
            + ' title="Rəy verən tərəf: ' + escapeEsdChip(label) + '">'
            + '<span class="esd-status-dot"></span>'
            + '<span>' + escapeEsdChip(label) + '</span><b>' + row.n + '</b></button>';
    }).join('');
    chips.innerHTML = html;
    if (!panel._reviewStopBound) {
        panel._reviewStopBound = true;
        panel.addEventListener('click', function(ev) { ev.stopPropagation(); });
    }
    if (keepOpen || reviewPopupWanted || reviewPopupOpen) openReviewPartyPopup();
    else closeReviewPartyPopup();
}

function drawStatusChart(tasks) {
    var gN = STATUS_GROUP_NAMES;
    var gC = STATUS_GROUP_COLORS;
    var order = STATUS_CHART_ORDER;
    var counts = {};
    var units = countableWorkUnits(tasks).filter(function(t) {
        return getStatusGroup(t.fields && t.fields.status && t.fields.status.name) !== 'paused';
    });
    units.forEach(function(t) {
        var k = getStatusGroup(t.fields.status.name);
        if (!gN[k] || k === 'paused') return;
        if (k === 'other' && !isOtherDashboardUnit(t)) return;
        counts[k] = (counts[k] || 0) + 1;
    });
    var keys = order.filter(function(k) { return counts[k] > 0; });
    var labels = keys.map(function(k) { return gN[k]; });
    var data = keys.map(function(k) { return counts[k]; });
    var colors = keys.map(function(k) { return gC[k]; });
    var canvas = document.getElementById('statusChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    var total = data.reduce(function(a, b) { return a + b; }, 0);
    renderStatusLegend(keys, data, colors, total);
    var centerTextPlugin = {
        id: 'statusCenterText',
        afterDraw: function(chart) {
            var area = chart.chartArea;
            var c = chart.ctx;
            c.save();
            c.font = '700 22px Inter';
            c.fillStyle = '#1e293b';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(String(total), area.left + area.width / 2, area.top + area.height / 2 - 8);
            c.font = '500 12px Inter';
            c.fillStyle = '#64748b';
            c.fillText('tapşırıq', area.left + area.width / 2, area.top + area.height / 2 + 10);
            c.restore();
        }
    };
    state.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 3, borderColor: '#ffffff', hoverOffset: 4 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            layout: { padding: 2 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
                    callbacks: {
                        label: function(ctx2) {
                            var n = ctx2.parsed || 0;
                            var pct = total ? Math.round((n / total) * 100) : 0;
                            return ' ' + n + ' tapşırıq (' + pct + '%)';
                        }
                    }
                }
            },
            onHover: function(e, el) { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            onClick: function(e, c) {
                if (!c.length) return;
                var native = e && e.native;
                if (native && native.stopPropagation) native.stopPropagation();
                openStatusGroup(keys[c[0].index], native);
            }
        },
        plugins: [centerTextPlugin]
    });
    scheduleChartFill(state.statusChart);
}

export function renderAssigneeChart(tasks) {
    debounceChartRebuild('assigneeChart', function() { drawAssigneeChart(tasks); });
}

function drawAssigneeChart(tasks) {
    var units = countableWorkUnits(tasks);
    var peopleCounts = {};
    var byPersonPri = {};
    var priSet = {};
    units.forEach(function(t) {
        var person = t.fields.assignee && t.fields.assignee.displayName;
        if (!person) return;
        var pri = getTaskPriorityName(t);
        peopleCounts[person] = (peopleCounts[person] || 0) + 1;
        priSet[pri] = true;
        if (!byPersonPri[person]) byPersonPri[person] = {};
        byPersonPri[person][pri] = (byPersonPri[person][pri] || 0) + 1;
    });
    var labels = Object.keys(peopleCounts).sort(function(a, b) { return peopleCounts[b] - peopleCounts[a]; });
    var priorities = Object.keys(priSet).sort(comparePriorityNames);
    var canvas = document.getElementById('assigneeChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    if (!labels.length) {
        fitChartHeight('assigneeChart', 0, false);
        state.assigneeChart = null;
        return;
    }
    var datasets = priorities.map(function(pri) {
        return {
            label: pri,
            data: labels.map(function(person) { return (byPersonPri[person] && byPersonPri[person][pri]) || 0; }),
            backgroundColor: getPriorityColor(pri),
            borderWidth: 0,
            borderSkipped: false,
            barPercentage: 0.86,
            categoryPercentage: 0.9
        };
    }).filter(function(ds) {
        return ds.data.some(function(n) { return n > 0; });
    });
    fitChartHeight('assigneeChart', labels.length + 2, true);
    function applyAssigneePriority(person, pri) {
        state.currentAssigneeFilter = person || null;
        state.currentPriorityFilter = pri || null;
        rememberListAction({ kind: 'assigneePriority', person: person || '', priority: pri || '' });
        applyFilters();
        var list = countableWorkUnits(state.filteredTasks);
        var title = 'İş yükü';
        if (person && pri) title = person + ' · ' + pri;
        else if (person) title = person;
        else if (pri) title = 'Prioritet: ' + pri;
        renderTaskList(list, title + ' (' + list.length + ')', { keepNested: true });
        openTaskListSection();
    }
    state.assigneeChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { top: 4, right: 22, bottom: 4, left: 0 } },
            onHover: function(e, el) { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            onClick: function(e, c) {
                if (!c.length) return;
                var native = e && e.native;
                if (native && native.stopPropagation) native.stopPropagation();
                var hit = c[0];
                var person = labels[hit.index];
                var ds = datasets[hit.datasetIndex];
                var pri = ds && ds.label;
                applyAssigneePriority(person, pri);
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: window.innerWidth < 640 ? 10 : 14,
                        font: { family: 'Inter', size: window.innerWidth < 640 ? 10 : 11 },
                        boxWidth: 8,
                        color: '#475569'
                    },
                    onClick: function(evt, item) {
                        if (evt && evt.native && evt.native.stopPropagation) evt.native.stopPropagation();
                        var pri = item && item.text;
                        if (!pri) return;
                        var nextPri = state.currentPriorityFilter === pri ? null : pri;
                        applyAssigneePriority(state.currentAssigneeFilter, nextPri);
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
                    filter: function(item) {
                        return (item.parsed && item.parsed.x) > 0;
                    },
                    callbacks: {
                        label: function(ctx2) {
                            return ' ' + ctx2.dataset.label + ': ' + (ctx2.parsed.x || 0);
                        },
                        footer: function(items) {
                            var idx = items && items[0] ? items[0].dataIndex : -1;
                            if (idx < 0) return '';
                            return 'Cəmi ' + (peopleCounts[labels[idx]] || 0) + ' tapşırıq';
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    grace: '12%',
                    grid: { display: false, drawBorder: false },
                    ticks: { display: false }
                },
                y: {
                    stacked: true,
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        font: { family: 'Inter', size: 12 },
                        color: '#475569',
                        autoSkip: false,
                        padding: 8,
                        callback: categoryTickCallback(true)
                    },
                    afterFit: yAxisAfterFit
                }
            }
        },
        plugins: [totalLabelsPlugin]
    });
    scheduleChartFill(state.assigneeChart);
}

var DIRECTION_CARD_TITLE = 'İstiqamətlər';

function syncDirectionCardTitle() {
    var el = document.getElementById('epicChartTitle');
    var list = document.getElementById('epicChartList');
    if (!el && list && list.parentElement) {
        el = list.parentElement.querySelector('h2');
    }
    if (!el && list && list.previousElementSibling && list.previousElementSibling.tagName === 'H2') {
        el = list.previousElementSibling;
    }
    if (el) el.textContent = DIRECTION_CARD_TITLE;
}

export function renderEpicChart(tasks) {
    syncDirectionCardTitle();
    var counts = {}, dirKeysMap = {}, tasksByDir = {};
    var exc = ['tədbirlərin statistikası', 'tədbirin statistikasi', 'statistika'];
    countableWorkUnits(tasks).forEach(function(t) {
        var dir = resolveDirection(t);
        if (dir) { if (!tasksByDir[dir.key]) tasksByDir[dir.key] = []; tasksByDir[dir.key].push(t); }
    });
    state.allDirections.forEach(function(d) {
        var name = d.fields.summary, key = d.key;
        if (exc.some(function(kw) { return normalizeStr(name).includes(kw); })) return;
        dirKeysMap[name] = key;
        var total = (tasksByDir[key] || []).length;
        if (total > 0) counts[name] = total;
    });
    var labels = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    var list = document.getElementById('epicChartList');
    if (!list) return;
    var oldCanvas = document.getElementById('epicChart');
    if (oldCanvas && typeof Chart !== 'undefined') {
        var existing = Chart.getChart(oldCanvas);
        if (existing) existing.destroy();
    }
    if (labels.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">Bu dövr üçün istiqamət məlumatı yoxdur.</p>';
        return;
    }
    var max = 1;
    labels.forEach(function(name) { if (counts[name] > max) max = counts[name]; });
    list.innerHTML = '';
    labels.forEach(function(name, i) {
        var key = dirKeysMap[name];
        var isActive = key === state.currentDirectionFilter;
        var color = catColorByKey(name);
        var pct = Math.max(8, Math.round((counts[name] / max) * 100));
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'direction-row' + (isActive ? ' is-active' : '');
        btn.innerHTML = '<span class="direction-dot" style="background-color:' + color + '"></span>'
            + '<span class="direction-name"></span>'
            + '<span class="direction-track"><span class="direction-bar" style="width:' + pct + '%;background-color:' + color + '"></span></span>'
            + '<span class="direction-count">' + counts[name] + '</span>';
        btn.querySelector('.direction-name').textContent = name;
        btn.addEventListener('click', function() {
            if (key === state.currentDirectionFilter) state.currentDirectionFilter = null;
            else state.currentDirectionFilter = key;
            applyFilters();
        });
        list.appendChild(btn);
    });
}

export function renderQurumChart(tasks) {
    debounceChartRebuild('qurumChart', function() { drawQurumChart(tasks); });
}

function qurumSliceColor(d) {
    var best = { n: 0, color: STATUS.other };
    var opts = [
        { n: d.inProgress || 0, color: STATUS.progress },
        { n: d.done || 0, color: STATUS.done },
        { n: d.planned || 0, color: STATUS.paused },
        { n: d.blocked || 0, color: STATUS.blocked }
    ];
    opts.forEach(function(o) {
        if (o.n > best.n) best = o;
    });
    return best.n > 0 ? best.color : STATUS.other;
}

function drawQurumChart(tasks) {
    var qurumData = {};
    countableWorkUnits(tasks).forEach(function(t) {
        var rawName = getQurumName(t) || 'Təyin edilməyib';
        var qName = canonicalQurumName(rawName) || rawName;
        var qKey = qurumMatchKey(qName) || qName;
        if (!qurumData[qKey]) qurumData[qKey] = { name: qName, total: 0, done: 0, inProgress: 0, planned: 0, blocked: 0 };
        var bucket = qurumData[qKey];
        if (qName && qName !== 'Təyin edilməyib') bucket.name = qName;
        bucket.total++;
        var g = getStatusGroup(t.fields.status.name);
        if (g === 'done') bucket.done++;
        else if (isActiveExecutionGroup(g)) bucket.inProgress++;
        else if (g === 'planned') bucket.planned++;
        else if (g === 'blocked' || hasValidDifficulty(t)) bucket.blocked++;
    });
    var sortedKeys = Object.keys(qurumData).sort(function(a, b) { return qurumData[b].total - qurumData[a].total; });
    var sortedQurums = sortedKeys.map(function(k) { return qurumData[k].name; });
    var tbody = document.getElementById('qurumTableBody');
    tbody.innerHTML = '';
    var colors = sortedKeys.map(function(k) { return qurumSliceColor(qurumData[k]); });
    if (sortedQurums.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">Məlumat yoxdur.</td></tr>';
    } else {
        sortedKeys.forEach(function(qKey, index) {
            var d = qurumData[qKey];
            var qName = d.name;
            var donePercent = d.total > 0 ? Math.round((d.done / d.total) * 100) : 0;
            var color = colors[index];
            var safeName = qName.replace(/'/g, "\\'");
            var isActive = sameQurum(qName, state.currentQurumFilter);
            var tr = document.createElement('tr');
            tr.className = 'transition ' + (isActive ? 'bg-violet-50 ring-2 ring-violet-200' : 'hover:bg-indigo-50/50');
            tr.innerHTML = '<td class="py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-indigo-100/50 rounded-l-lg transition ' + (isActive ? 'text-violet-800' : '') + '" onclick="setQurumFilter(\'' + safeName + '\')"><div class="flex items-center gap-2 min-w-0"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ' + color + '"></span><span class="break-words">' + qName + '</span>' + (isActive ? '<span class="text-[9px] bg-violet-700 text-white px-1.5 py-0.5 rounded-full ml-1 shrink-0">AKTİV</span>' : '') + '</div></td><td class="py-3 px-2 text-center font-bold text-slate-800 cursor-pointer hover:bg-indigo-100/50 transition" onclick="filterQurumByStatus(\'' + safeName + '\', \'all\')">' + d.total + '</td><td class="py-3 px-2 text-center font-medium cursor-pointer hover:bg-indigo-100/50 transition" style="color:' + STATUS.paused + '" onclick="filterQurumByStatus(\'' + safeName + '\', \'planned\')">' + d.planned + '</td><td class="py-3 px-2 text-center font-medium cursor-pointer hover:bg-indigo-100/50 transition" style="color:' + STATUS.progress + '" onclick="filterQurumByStatus(\'' + safeName + '\', \'progress\')">' + d.inProgress + '</td><td class="py-3 px-2 text-center cursor-pointer hover:bg-indigo-100/50 rounded-r-lg transition" onclick="filterQurumByStatus(\'' + safeName + '\', \'done\')"><div class="flex items-center justify-center gap-2"><span class="font-medium" style="color:' + STATUS.done + '">' + d.done + '</span><div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden md:block"><div class="h-full rounded-full" style="width: ' + donePercent + '%;background:' + STATUS.done + '"></div></div></div></td>';
            tbody.appendChild(tr);
        });
    }
    filterQurumList();
    var thead = tbody.previousElementSibling ? tbody.previousElementSibling.querySelector('tr') : null;
    if (thead) {
        thead.innerHTML = '<th class="py-3 px-4 text-left font-semibold">Qurumun adı</th><th class="py-3 px-2 text-center font-semibold">Ümumi</th><th class="py-3 px-2 text-center font-semibold">Plan.</th><th class="py-3 px-2 text-center font-semibold">İcradakı</th><th class="py-3 px-2 text-center font-semibold">Tamamlanıb</th>';
    }
    var canvas = document.getElementById('qurumChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    var labels = sortedQurums;
    var data = sortedKeys.map(function(k) { return qurumData[k].total; });
    var centerTextPlugin = {
        id: 'centerText',
        afterDraw: function(chart) {
            var ctx2 = chart.ctx;
            var area = chart.chartArea;
            ctx2.save();
            var total = sortedKeys.length;
            ctx2.font = 'bold 24px Inter';
            ctx2.fillStyle = '#1e293b';
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'middle';
            ctx2.fillText(total, area.left + area.width / 2, area.top + area.height / 2 - 10);
            ctx2.font = '500 10px Inter';
            ctx2.fillStyle = '#64748b';
            ctx2.fillText('Qurum', area.left + area.width / 2, area.top + area.height / 2 + 10);
            ctx2.restore();
        }
    };
    state.qurumChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: '#f8fafc', hoverOffset: 12 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: 12, cornerRadius: 8, titleFont: { family: 'Inter', size: 12, weight: 'bold' }, bodyFont: { family: 'Inter', size: 11 },
                    callbacks: { label: function(context) { var label = context.label || ''; if (label) label += ': '; if (context.parsed !== null) label += context.parsed + ' task'; return label; } } }
            },
            onClick: function(e, c) { if (c.length > 0) { var clicked = labels[c[0].index]; if (sameQurum(clicked, state.currentQurumFilter)) { state.currentQurumFilter = null; } else { state.currentQurumFilter = clicked; } applyFilters(); } }
        },
        plugins: [centerTextPlugin]
    });
}

export function renderLabelChart() {
    debounceChartRebuild('labelChart', drawLabelChart);
}

function drawLabelChart() {
    var exc = ['tədbirlərin statistikası', 'tədbirin statistikasi', 'statistika'];
    var directionLabels = [];
    var allLabelsSet = new Set();
    var dataMatrix = {};
    state.allDirections.forEach(function(d) {
        var name = d.fields.summary;
        if (exc.some(function(kw) { return normalizeStr(name).includes(kw); })) return;
        var dirTasks = directionLabelTasks(d.key);
        if (dirTasks.length > 0) {
            directionLabels.push(name);
            dataMatrix[name] = {};
            var unlabeled = etiketsizTasks(dirTasks);
            if (unlabeled.length) {
                allLabelsSet.add('Etiketsiz');
                dataMatrix[name]['Etiketsiz'] = unlabeled.length;
            }
            dirTasks.forEach(function(t) {
                taskLabelNames(t).forEach(function(l) {
                    allLabelsSet.add(l);
                    dataMatrix[name][l] = (dataMatrix[name][l] || 0) + 1;
                });
            });
        }
    });
    var uniqueLabels = Array.from(allLabelsSet);
    var datasets = uniqueLabels.map(function(lbl, i) {
        return { label: lbl, data: directionLabels.map(function(dirName) { return dataMatrix[dirName][lbl] || 0; }), backgroundColor: seriesColor(lbl), borderWidth: 0, hoverOffset: 4, borderRadius: 4 };
    });
    function isEsdSeriesLabel(name) {
        return normalizeStr(name) === 'esd';
    }
    var onClickCB = function(e, elements) {
        if (elements.length > 0) {
            var index = elements[0].index;
            var datasetIndex = elements[0].datasetIndex;
            var selectedDir = directionLabels[index];
            var selectedLabel = datasets[datasetIndex].label;
            var dirObj = state.allDirections.find(function(d) { return d.fields.summary === selectedDir; });
            if (dirObj) {
                var fTasks = isEsdSeriesLabel(selectedLabel)
                    ? uniqueTasksByKey(countableWorkUnits(state.filteredTasks).filter(function(t) {
                        var dir = resolveDirection(t);
                        if (!dir || dir.key !== dirObj.key) return false;
                        return getStatusGroup(t.fields.status.name) === 'esd';
                    }))
                    : tasksForChartLabel(directionLabelTasks(dirObj.key), selectedLabel);
                rememberListAction({ kind: 'label', dirKey: dirObj.key, dirName: selectedDir, label: selectedLabel });
                renderTaskList(fTasks, selectedDir + ' - Etiket: ' + selectedLabel, { keepNested: true });
                if (fTasks.length === 0) showToast('Bu istiqamət və etiket üçün tapşırıq tapılmadı.', 'info');
                openTaskListSection();
            }
        }
    };
    var legendCB = function(e, item, legend) {
        var index = item.datasetIndex;
        var ci = legend.chart;
        var clickedLabel = ci.data.datasets[index].label;
        var onlyThis = ci.data.datasets.every(function(ds, i) {
            return i === index || ci.getDatasetMeta(i).hidden;
        }) && !ci.getDatasetMeta(index).hidden;
        if (onlyThis) {
            ci.data.datasets.forEach(function(ds, i) { ci.setDatasetVisibility(i, true); });
        } else {
            ci.data.datasets.forEach(function(ds, i) { ci.setDatasetVisibility(i, ds.label === clickedLabel); });
        }
        ci.update();
    };
    drawStackedChart('labelChart', 'bar', directionLabels, datasets, onClickCB, true, legendCB);
}

function wrapChartLabel(label, maxLen) {
    var text = String(label || '').trim();
    if (!text) return text;
    if (text.length <= maxLen) return text;
    var words = text.split(/\s+/);
    var lines = [];
    var current = '';
    words.forEach(function(w) {
        if (w.length > maxLen) {
            if (current) { lines.push(current); current = ''; }
            while (w.length > maxLen) {
                lines.push(w.slice(0, maxLen));
                w = w.slice(maxLen);
            }
            current = w;
            return;
        }
        var next = current ? (current + ' ' + w) : w;
        if (next.length > maxLen && current) {
            lines.push(current);
            current = w;
        } else {
            current = next;
        }
    });
    if (current) lines.push(current);
    if (lines.length > 4) {
        var rest = lines.slice(3).join(' ');
        lines = [lines[0], lines[1], lines[2], rest.length > maxLen ? rest.slice(0, maxLen - 1) + '…' : rest];
    }
    return lines;
}

function chartYLabelChars() {
    var w = window.innerWidth;
    if (w < 640) return 16;
    if (w < 1280) return 22;
    return 18;
}

function chartXLabelChars() {
    var w = window.innerWidth;
    if (w < 640) return 8;
    if (w < 1024) return 12;
    return 16;
}

function yAxisMaxWidth() {
    var w = window.innerWidth;
    if (w < 640) return 148;
    if (w < 1280) return 168;
    return 150;
}

export function fitChartHeight(canvasId, barCount, horizontal) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    var box = canvas.parentElement;
    if (box.closest && box.closest('.dash-charts-row')) {
        box.style.height = '';
        box.style.minHeight = '';
        return;
    }
    if (!horizontal || !barCount) {
        box.style.height = '';
        box.style.minHeight = '';
        return;
    }
    var row = 42;
    var frame = box.parentElement;
    var minH = frame && frame.clientHeight ? frame.clientHeight : 280;
    var needed = Math.max(minH, barCount * row + 28);
    box.style.height = needed + 'px';
    box.style.minHeight = needed + 'px';
}

function scheduleChartFill(chart) {
    if (!chart) return;
    requestAnimationFrame(function() {
        try { chart.resize(); } catch (e) {}
    });
}

function rememberChart(id, chart) {
    if (id === 'statusChart') state.statusChart = chart;
    else if (id === 'assigneeChart') state.assigneeChart = chart;
    else if (id === 'epicChart') state.epicChart = chart;
    else if (id === 'labelChart') state.labelChart = chart;
    else if (id === 'qurumChart') state.qurumChart = chart;
}

function categoryTickCallback(isHorizontal) {
    return function(value) {
        var label = this.getLabelForValue(value);
        var s = String(label || '').replace(/\s+/g, ' ').trim();
        var max = isHorizontal ? chartYLabelChars() : chartXLabelChars();
        return s.length > max ? s.slice(0, max) + '…' : s;
    };
}

function yAxisAfterFit(scale) {
    var cap = yAxisMaxWidth();
    if (scale.width > cap) scale.width = cap;
}

export function drawChart(id, type, labels, data, colors, onClickCB, legendCB, isHorizontal) {
    onClickCB = onClickCB || null; legendCB = legendCB || null; isHorizontal = isHorizontal || false;
    var canvas = document.getElementById(id);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    if (isHorizontal) fitChartHeight(id, (labels || []).length, true);
    else fitChartHeight(id, 0, false);
    var chart = new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [{ label: 'Tapşırıq Sayı', data: data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6, borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.7 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 80,
            indexAxis: isHorizontal ? 'y' : 'x',
            layout: { padding: { top: 2, right: 4, bottom: 2, left: 2 } },
            onClick: onClickCB, onHover: function(e, el) { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            plugins: {
                legend: {
                    display: type === 'doughnut' || type === 'pie',
                    position: window.innerWidth < 640 ? 'bottom' : 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 8,
                        font: { family: 'Inter', size: 10 },
                        boxWidth: 6,
                        color: '#475569'
                    },
                    onClick: legendCB
                },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleFont: { family: 'Inter', size: 12, weight: 'bold' }, bodyFont: { family: 'Inter', size: 11 }, padding: 12, cornerRadius: 8, displayColors: true, boxPadding: 4 }
            },
            scales: type === 'doughnut' || type === 'pie' ? {} : (isHorizontal ? {
                x: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748b' } },
                y: {
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#475569',
                        autoSkip: false,
                        padding: 8,
                        callback: categoryTickCallback(true)
                    },
                    afterFit: yAxisAfterFit
                }
            } : {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { font: { family: 'Inter', size: 12 }, color: '#64748b', maxRotation: 30, minRotation: 0, autoSkip: true, callback: categoryTickCallback(false) }
                },
                y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 12 }, color: '#64748b' } }
            })
        }
    });
    rememberChart(id, chart);
    return chart;
}

const totalLabelsPlugin = {
    id: 'totalLabels',
    afterDatasetsDraw: function(chart) {
        var ctx = chart.ctx;
        var data = chart.data;
        var meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = 'bold 11px Inter';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        data.labels.forEach(function(label, i) {
            var total = 0;
            var maxX = 0;
            chart.data.datasets.forEach(function(dataset, di) {
                var dMeta = chart.getDatasetMeta(di);
                if (dMeta.data[i] && !dMeta.hidden && dataset.data[i] > 0) { total += dataset.data[i]; if (dMeta.data[i].x > maxX) maxX = dMeta.data[i].x; }
            });
            if (total > 0 && meta.data[i]) {
                var yPos = meta.data[i].y;
                var xPos = maxX + 8;
                if (xPos > chart.chartArea.right - 16) xPos = chart.chartArea.right - 16;
                ctx.fillText(total, xPos, yPos + 4);
            }
        });
        ctx.restore();
    }
};

export function drawStackedChart(id, type, labels, datasets, onClickCB, isHorizontal, legendCB) {
    onClickCB = onClickCB || null; isHorizontal = isHorizontal || false; legendCB = legendCB || null;
    var canvas = document.getElementById(id);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    if (isHorizontal) fitChartHeight(id, (labels || []).length, true);
    else fitChartHeight(id, 0, false);
    var chart = new Chart(ctx, {
        type: type, data: { labels: labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, resizeDelay: 80, indexAxis: isHorizontal ? 'y' : 'x',
            layout: { padding: { top: 4, right: 16, bottom: 4, left: 4 } },
            onClick: onClickCB, onHover: function(e, el) { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: window.innerWidth < 640 ? 10 : 15, font: { family: 'Inter', size: window.innerWidth < 640 ? 10 : 11 }, boxWidth: 8, color: '#475569' }, onClick: legendCB },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleFont: { family: 'Inter', size: 12, weight: 'bold' }, bodyFont: { family: 'Inter', size: 11 }, padding: 12, cornerRadius: 8, boxPadding: 4 }
            },
            scales: isHorizontal ? {
                x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748b' } },
                y: {
                    stacked: true,
                    grid: { display: false, drawBorder: false },
                    ticks: { font: { family: 'Inter', size: 11 }, color: '#475569', autoSkip: false, padding: 8, callback: categoryTickCallback(true) },
                    afterFit: yAxisAfterFit
                }
            } : {
                x: { stacked: true, grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b', maxRotation: 40, minRotation: 0, autoSkip: true } },
                y: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } }
            }
        },
        plugins: [totalLabelsPlugin]
    });
    rememberChart(id, chart);
    return chart;
}

export function renderDailyProgress() {
    var usersListDiv = document.getElementById('dailyUsersList');
    var userActivityDiv = document.getElementById('dailyUserActivity');
    var countDiv = document.getElementById('dailyUpdatedCount');
    if (!usersListDiv || !userActivityDiv || !countDiv) return;

    var sprintVal = document.getElementById('sprintFilter').value;
    var sprintSelect = document.getElementById('sprintFilter');
    var sprintNames = sprintSelect ? Array.from(sprintSelect.options).slice(1).map(function(o) { return o.value; }) : [];
    var latestSprint = currentSprintName(sprintNames);
    var isHistorical = sprintVal && sprintVal !== 'all' && latestSprint && sprintVal !== latestSprint;

    var rangeStart, rangeEnd, rangeLabel;
    if (isHistorical) {
        var range = getSprintDateRange(sprintVal);
        if (range) {
            rangeStart = range.start;
            rangeEnd = range.end;
            rangeLabel = sprintVal;
        } else {
            rangeStart = new Date(); rangeStart.setHours(0,0,0,0);
            rangeEnd = new Date(); rangeEnd.setHours(23,59,59,999);
            rangeLabel = 'Bugün';
        }
    } else {
        rangeStart = new Date(); rangeStart.setHours(0,0,0,0);
        rangeEnd = new Date(); rangeEnd.setHours(23,59,59,999);
        rangeLabel = 'Bugün';
    }

    state.dailyDateRange = { start: rangeStart, end: rangeEnd, label: rangeLabel };

    var EXCLUDED_FIELDS = ['rank', 'flagged', 'aggregated'];
    var SYSTEM_AUTHORS = ['jira', 'system', 'automation', 'bot'];

    function inRange(dateStr) {
        var d = new Date(dateStr);
        return d >= rangeStart && d <= rangeEnd;
    }

    var dailyUpdated = state.filteredTasks.filter(function(t) {
        if (!inRange(t.fields.updated)) return false;
        var createdDate = new Date(t.fields.created);
        if (createdDate >= rangeStart && createdDate <= rangeEnd) return true;
        if (t.changelog && t.changelog.histories && t.changelog.histories.length > 0) {
            return t.changelog.histories.some(function(h) {
                if (!inRange(h.created)) return false;
                var author = h.author ? normalizeStr(h.author.displayName || h.author.name || '') : '';
                if (SYSTEM_AUTHORS.some(function(sys) { return author.indexOf(sys) !== -1; })) return false;
                if (h.items && h.items.length > 0) {
                    return h.items.some(function(item) {
                        var fieldName = (item.field || '').toLowerCase();
                        return !EXCLUDED_FIELDS.some(function(ex) { return fieldName.indexOf(ex) !== -1; });
                    });
                }
                return false;
            });
        }
        return false;
    });

    var count = 0;
    state.filteredTasks.forEach(function(t) {
        if (!inRange(t.fields.updated)) return;
        var createdDate = new Date(t.fields.created);
        if (createdDate >= rangeStart && createdDate <= rangeEnd) count++;
        if (t.changelog && t.changelog.histories) {
            t.changelog.histories.forEach(function(h) {
                if (!inRange(h.created)) return;
                var author = h.author ? normalizeStr(h.author.displayName || h.author.name || '') : '';
                if (SYSTEM_AUTHORS.some(function(sys) { return author.indexOf(sys) !== -1; })) return;
                if (h.items && h.items.length > 0) {
                    var meaningful = h.items.filter(function(item) {
                        var fieldName = (item.field || '').toLowerCase();
                        return !EXCLUDED_FIELDS.some(function(ex) { return fieldName.indexOf(ex) !== -1; });
                    });
                    if (meaningful.length > 0) count++;
                }
            });
        }
    });

    countDiv.innerText = count;

    if (dailyUpdated.length === 0) {
        usersListDiv.innerHTML = '';
        userActivityDiv.innerHTML = '<div class="text-center py-6 flex flex-col items-center justify-center text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><p class="text-xs font-medium">' + rangeLabel + ' üçün dəyişiklik yoxdur.</p><p class="text-[10px] text-slate-300 mt-1">' + rangeStart.toLocaleDateString('az-AZ') + ' - ' + rangeEnd.toLocaleDateString('az-AZ') + '</p></div>';
        return;
    }

    var userGroups = {};
    dailyUpdated.forEach(function(t) {
        var name = t.fields.assignee ? t.fields.assignee.displayName : 'Təyin edilməyib';
        if (!userGroups[name]) userGroups[name] = [];
        userGroups[name].push(t);
    });

    var sortedUsers = Object.keys(userGroups).sort(function(a, b) { return userGroups[b].length - userGroups[a].length; });

    var usersHtml = '';
    sortedUsers.forEach(function(userName) {
        var tasks = userGroups[userName];
        var initials = getInitials(userName);
        var avatarColor = userName !== 'Təyin edilməyib' ? '#4f46e5' : '#94a3b8';
        var safeName = userName.replace(/'/g, "\\'");
        usersHtml += '<div onclick="selectDailyUser(\'' + safeName + '\')" class="daily-user-card flex flex-col items-center justify-center gap-1 p-2 rounded-xl cursor-pointer transition-all border border-transparent hover:bg-slate-50 shrink-0 w-20 text-center" data-user="' + userName + '"><div class="relative"><div class="w-10 h-10 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0" style="background-color: ' + avatarColor + ';">' + initials + '</div><span class="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">' + tasks.length + '</span></div><p class="text-[10px] font-medium text-slate-600 leading-tight truncate w-full">' + userName.split(' ')[0] + '</p></div>';
    });
    usersListDiv.innerHTML = usersHtml;

    var selectedUser = sessionStorage.getItem('selectedDailyUser') || sortedUsers[0];
    if (userGroups[selectedUser]) { showUserActivity(selectedUser, userGroups[selectedUser]); }
    else if (sortedUsers.length > 0) { showUserActivity(sortedUsers[0], userGroups[sortedUsers[0]]); }
}

var lastNarrowLayout = window.innerWidth < 768;
var chartResizeTimer = null;

export function resizeDashboardCharts() {
    var narrow = window.innerWidth < 768;
    if (narrow !== lastNarrowLayout) {
        lastNarrowLayout = narrow;
        if (state.filteredTasks && state.filteredTasks.length) {
            renderStatusChart(state.statusChartTasks || state.filteredTasks);
            renderAssigneeChart(state.assigneeChartTasks || state.filteredTasks);
        }
        if (state.epicChartTasks) renderEpicChart(state.epicChartTasks);
        if (state.qurumChartTasks) renderQurumChart(state.qurumChartTasks);
        var labelEl = document.getElementById('labelChartContent');
        if (labelEl && !labelEl.classList.contains('hidden')) renderLabelChart();
        return;
    }
    ['statusChart', 'assigneeChart', 'epicChart', 'labelChart', 'qurumChart'].forEach(function(id) {
        var ch = typeof Chart !== 'undefined' ? Chart.getChart(id) : null;
        if (!ch) return;
        var horizontal = ch.options && ch.options.indexAxis === 'y';
        var n = (ch.data.labels || []).length;
        if (horizontal) fitChartHeight(id, n, true);
        ch.resize();
    });
}

window.addEventListener('resize', function() {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(resizeDashboardCharts, 180);
});

syncDirectionCardTitle();
