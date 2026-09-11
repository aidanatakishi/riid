import { state } from './state.js';
import { normalizeStr, showToast } from './utils.js';
import { collectBacklogDashboardUnits, collectDueThisWeekDoneTasks, collectDueThisWeekOpenTasks, collectDueThisWeekTasks, collectOtherDashboardUnits, countableWorkUnits, jiraBoardWorkUnits, currentSprintName, formatDateObj, getDateStatus, getHistoricalStatus, getQurumName, canonicalQurumName, sameQurum, getSprintDateRange, getSprintNames, issueBelongsToSprint, getStatusGroup, getTaskStartDate, hasBitmeDate, hasValidDifficulty, isActiveExecutionGroup, isDueInSelectedWeek, isDueInSprint, isDueThisWeek, isNextWeekBoxTask, isTaskOrSubtaskType, isTaskType, resolveDirection, sortSprintNames, taskBelongsToDateRange, wasCompletedInSprint } from './model.js';
import { renderAssigneeChart, renderDailyProgress, renderEpicChart, renderLabelChart, renderQurumChart, renderStatusChart } from './charts.js';
import { openTaskListSection, renderDifficulties, renderPausedTasks, renderSprintComparison, renderStats, renderTaskList, renderWeeklyTasks, restoreNestedPanels, showUserActivity } from './render.js';
import { updateReportButtonLabel, duePeriodLabel } from './report.js';
import { renderAssessmentSections } from './assessments.js?v=idda26';

var userChoseSprint = false;
var filterPaintRaf = 0;
var AZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
var dateDraft = { start: '', end: '', viewYear: 0, viewMonth: 0 };

function todayParts() {
    var now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function toIsoDate(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function isoToDate(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    if (p.length < 3) return null;
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(dt.getTime()) ? null : dt;
}

function formatChipDate(iso) {
    var dt = isoToDate(iso);
    return dt ? formatDateObj(dt) : '—';
}

function formatTriggerLabel(startIso, endIso) {
    if (!startIso && !endIso) return 'Tarix';
    var a = startIso ? formatChipDate(startIso).slice(0, 5) : '';
    var b = endIso ? formatChipDate(endIso).slice(0, 5) : '';
    if (startIso && endIso) return a + ' – ' + b;
    if (startIso) return a + '-dən';
    return b + '-dək';
}

function syncDateDraftFromInputs() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    dateDraft.start = startEl ? startEl.value : '';
    dateDraft.end = endEl ? endEl.value : '';
    var anchor = isoToDate(dateDraft.start || dateDraft.end);
    if (!anchor) {
        var t = todayParts();
        dateDraft.viewYear = t.y;
        dateDraft.viewMonth = t.m;
        return;
    }
    dateDraft.viewYear = anchor.getFullYear();
    dateDraft.viewMonth = anchor.getMonth();
}

function updateDateDraftChips() {
    var startChip = document.getElementById('dateDraftStart');
    var endChip = document.getElementById('dateDraftEnd');
    if (startChip) startChip.textContent = formatChipDate(dateDraft.start);
    if (endChip) endChip.textContent = formatChipDate(dateDraft.end);
}

export function updateDateTriggerLabel() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    var startIso = startEl ? startEl.value : '';
    var endIso = endEl ? endEl.value : '';
    var label = document.getElementById('dateFilterLabel');
    var btn = document.getElementById('dateFilterBtn');
    if (label) label.textContent = formatTriggerLabel(startIso, endIso);
    if (btn) {
        if (startIso || endIso) btn.classList.add('is-active');
        else btn.classList.remove('is-active');
    }
    updateReportButtonLabel();
}

function renderDateCalendar() {
    var title = document.getElementById('dateCalTitle');
    var grid = document.getElementById('dateCalGrid');
    if (!grid) return;
    if (title) title.textContent = AZ_MONTHS[dateDraft.viewMonth] + ' ' + dateDraft.viewYear;
    var first = new Date(dateDraft.viewYear, dateDraft.viewMonth, 1);
    var startOffset = (first.getDay() + 6) % 7;
    var cursor = new Date(dateDraft.viewYear, dateDraft.viewMonth, 1 - startOffset);
    var today = todayParts();
    var todayIso = toIsoDate(today.y, today.m, today.d);
    var startMs = isoToDate(dateDraft.start);
    var endMs = isoToDate(dateDraft.end);
    if (startMs) startMs.setHours(0, 0, 0, 0);
    if (endMs) endMs.setHours(0, 0, 0, 0);
    grid.innerHTML = '';
    var i;
    for (i = 0; i < 42; i++) {
        var y = cursor.getFullYear();
        var m = cursor.getMonth();
        var d = cursor.getDate();
        var iso = toIsoDate(y, m, d);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'date-cal-day';
        btn.textContent = String(d);
        btn.setAttribute('data-iso', iso);
        if (m !== dateDraft.viewMonth) btn.classList.add('is-muted');
        if (iso === todayIso) btn.classList.add('is-today');
        var cell = new Date(y, m, d);
        cell.setHours(0, 0, 0, 0);
        if (startMs && iso === dateDraft.start) btn.classList.add('is-start');
        if (endMs && iso === dateDraft.end) btn.classList.add('is-end');
        if (startMs && endMs && cell > startMs && cell < endMs) btn.classList.add('in-range');
        grid.appendChild(btn);
        cursor.setDate(cursor.getDate() + 1);
    }
}

export function selectViewedMonth() {
    var last = new Date(dateDraft.viewYear, dateDraft.viewMonth + 1, 0).getDate();
    dateDraft.start = toIsoDate(dateDraft.viewYear, dateDraft.viewMonth, 1);
    dateDraft.end = toIsoDate(dateDraft.viewYear, dateDraft.viewMonth, last);
    updateDateDraftChips();
    renderDateCalendar();
    applyCommittedDateFilter();
}

export function shiftDateCalendar(delta) {
    dateDraft.viewMonth += delta;
    if (dateDraft.viewMonth < 0) {
        dateDraft.viewMonth = 11;
        dateDraft.viewYear -= 1;
    } else if (dateDraft.viewMonth > 11) {
        dateDraft.viewMonth = 0;
        dateDraft.viewYear += 1;
    }
    renderDateCalendar();
}

export function pickPopoverDate(iso) {
    if (!iso) return;
    if (!dateDraft.start || (dateDraft.start && dateDraft.end && dateDraft.start !== dateDraft.end)) {
        dateDraft.start = iso;
        dateDraft.end = '';
    } else if (iso < dateDraft.start) {
        dateDraft.end = dateDraft.start;
        dateDraft.start = iso;
    } else {
        dateDraft.end = iso;
    }
    updateDateDraftChips();
    renderDateCalendar();
}

export function toggleDatePopover(ev) {
    if (ev) ev.stopPropagation();
    var pop = document.getElementById('datePopover');
    if (pop && !pop.classList.contains('hidden')) {
        closeDatePopover();
        return;
    }
    openDatePopover();
}

export function openDatePopover() {
    syncDateDraftFromInputs();
    updateDateDraftChips();
    renderDateCalendar();
    var pop = document.getElementById('datePopover');
    var overlay = document.getElementById('datePopoverOverlay');
    var btn = document.getElementById('dateFilterBtn');
    var wrap = document.querySelector('.date-filter-wrap');
    if (pop) pop.classList.remove('hidden');
    if (overlay) overlay.classList.remove('hidden');
    if (btn) btn.classList.add('is-open');
    if (wrap) wrap.classList.add('is-open');
}

export function closeDatePopover() {
    var pop = document.getElementById('datePopover');
    var overlay = document.getElementById('datePopoverOverlay');
    var btn = document.getElementById('dateFilterBtn');
    var wrap = document.querySelector('.date-filter-wrap');
    if (pop) pop.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    if (btn) btn.classList.remove('is-open');
    if (wrap) wrap.classList.remove('is-open');
}

function commitDateDraft() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    if (!startEl || !endEl) return;
    var start = dateDraft.start || dateDraft.end || '';
    var end = dateDraft.end || dateDraft.start || '';
    dateDraft.start = start;
    dateDraft.end = end;
    startEl.value = start;
    endEl.value = end;
}

function applyCommittedDateFilter() {
    userChoseSprint = false;
    var sprintSelect = document.getElementById('sprintFilter');
    if (sprintSelect) sprintSelect.value = 'all';
    commitDateDraft();
    closeDatePopover();
    updateDateTriggerLabel();
    updateSprintFilterState();
    applyFilters();
}

export function applyDatePopover() {
    if (!dateDraft.start && !dateDraft.end) {
        closeDatePopover();
        return;
    }
    applyCommittedDateFilter();
}

export function onDateOverlayClick() {
    if (dateDraft.start || dateDraft.end) applyDatePopover();
    else closeDatePopover();
}

export function clearDatePopover() {
    dateDraft.start = '';
    dateDraft.end = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    updateDateDraftChips();
    renderDateCalendar();
    closeDatePopover();
    updateDateTriggerLabel();
    var sprintSelect = document.getElementById('sprintFilter');
    var names = sprintSelect ? Array.from(sprintSelect.options).slice(1).map(function(o) { return o.value; }) : [];
    var latest = latestSprintValue(sprintSelect, names);
    if (latest) selectSprintByName(latest);
    else updateSprintFilterState();
    applyFilters();
}

function tasksWithoutStartDate() {
    var sprintVal = document.getElementById('sprintFilter') && document.getElementById('sprintFilter').value;
    var useDateFilter = !!(document.getElementById('startDate').value || document.getElementById('endDate').value);
    return state.allTasks.filter(function(t) {
        if (!useDateFilter && sprintVal && sprintVal !== 'all') {
            if (!issueBelongsToSprint(t, sprintVal)) return false;
        }
        if (getTaskStartDate(t)) return false;
        if (!isTaskType(t)) return false;
        if (state.currentDirectionFilter) {
            var dir = resolveDirection(t);
            if (!dir || dir.key !== state.currentDirectionFilter) return false;
        }
        if (state.currentQurumFilter) {
            var q = getQurumName(t) || 'Təyin edilməyib';
            if (!sameQurum(q, state.currentQurumFilter)) return false;
        }
        if (state.currentAssigneeFilter) {
            if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false;
        }
        var st = normalizeStr(t.fields.status.name);
        if (st.includes('başlanmamış') || st.includes('baslanmamis')) return false;
        if (st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti')) return false;
        return true;
    });
}

export function showNoStartDateTasks() {
    closeDatePopover();
    filterTasks('noStart');
}

function tasksWithoutDueDate() {
    var sprintVal = document.getElementById('sprintFilter') && document.getElementById('sprintFilter').value;
    var useDateFilter = !!(document.getElementById('startDate').value || document.getElementById('endDate').value);
    return (state.allTasks || []).filter(function(t) {
        if (!t || !t.fields) return false;
        if (!isTaskOrSubtaskType(t)) return false;
        if (hasBitmeDate(t)) return false;
        if (!useDateFilter && sprintVal && sprintVal !== 'all') {
            if (!issueBelongsToSprint(t, sprintVal)) return false;
        }
        if (state.currentDirectionFilter) {
            var dir = resolveDirection(t);
            if (!dir || dir.key !== state.currentDirectionFilter) return false;
        }
        if (state.currentQurumFilter) {
            var q = getQurumName(t) || 'Təyin edilməyib';
            if (!sameQurum(q, state.currentQurumFilter)) return false;
        }
        if (state.currentAssigneeFilter) {
            if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false;
        }
        return true;
    });
}

export function showNoDueDateTasks() {
    closeDatePopover();
    filterTasks('noDue');
}

function latestSprintValue(sprintSelect, sortedSprints) {
    var current = currentSprintName(sortedSprints);
    if (current && sprintSelect) {
        for (var i = 0; i < sprintSelect.options.length; i++) {
            if (sprintSelect.options[i].value === current) return current;
        }
    }
    if (!sprintSelect || sprintSelect.options.length < 2) return '';
    return sprintSelect.options[1].value;
}

function selectSprintByName(name) {
    var sprintSelect = document.getElementById('sprintFilter');
    clearDateRangeInputs();
    if (!sprintSelect || !name) return false;
    var found = Array.from(sprintSelect.options).some(function(opt) { return opt.value === name; });
    if (!found) return false;
    sprintSelect.value = name;
    updateSprintFilterState();
    return true;
}

export function populateSprintFilter() {
    var sprintSet = new Set();
    state.allTasks.forEach(function(t) { getSprintNames(t).forEach(function(n) { sprintSet.add(n); }); });
    var sprintSelect = document.getElementById('sprintFilter');
    var previousVal = sprintSelect.value;
    var startStr = document.getElementById('startDate') && document.getElementById('startDate').value;
    var endStr = document.getElementById('endDate') && document.getElementById('endDate').value;
    var usingDates = !!(startStr || endStr);

    sprintSelect.innerHTML = '<option value="all">Bütün Sprintlər</option>';
    var sortedSprints = sortSprintNames(Array.from(sprintSet));
    sortedSprints.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s; opt.innerText = s;
        sprintSelect.appendChild(opt);
    });

    // Page open: always the active/latest sprint, never a stored older sprint or leftover dates.
    if (!state.hasLoadedDashboard) {
        var startEl = document.getElementById('startDate');
        var endEl = document.getElementById('endDate');
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';
        dateDraft.start = '';
        dateDraft.end = '';
        userChoseSprint = false;
        sprintSelect.value = latestSprintValue(sprintSelect, sortedSprints) || 'all';
        updateSprintFilterState();
        return;
    }

    var optionExists = Array.from(sprintSelect.options).some(function(opt) { return opt.value === previousVal; });
    if (usingDates) {
        if (previousVal && optionExists) sprintSelect.value = previousVal;
        updateSprintFilterState();
        return;
    }
    if (previousVal && optionExists) {
        sprintSelect.value = previousVal;
        userChoseSprint = previousVal !== 'all';
    } else if (userChoseSprint && previousVal && previousVal !== 'all' && optionExists) {
        sprintSelect.value = previousVal;
    } else {
        sprintSelect.value = latestSprintValue(sprintSelect, sortedSprints) || 'all';
    }
    updateSprintFilterState();
}

export function clearDateRangeInputs() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    dateDraft.start = '';
    dateDraft.end = '';
    updateSprintFilterState();
    updateDateTriggerLabel();
}

export function updateSprintFilterState() {
    var startStr = document.getElementById('startDate').value;
    var endStr = document.getElementById('endDate').value;
    var sprintSelect = document.getElementById('sprintFilter');
    if (!sprintSelect) return;
    if (startStr || endStr) {
        sprintSelect.disabled = false;
        sprintSelect.classList.add('opacity-50');
        sprintSelect.title = 'Tarix aralığı aktivdir. Sprint seçsəniz, tarix filteri silinəcək.';
    } else {
        sprintSelect.classList.remove('opacity-50', 'cursor-not-allowed');
        sprintSelect.title = '';
    }
    updateDateTriggerLabel();
}

function previousSprintValue(sprintSelect, names) {
    var list = names || [];
    var selected = sprintSelect && sprintSelect.value;
    var from = (selected && selected !== 'all') ? selected : latestSprintValue(sprintSelect, list);
    var idx = list.indexOf(from);
    if (idx >= 0 && idx + 1 < list.length) return list[idx + 1];
    return '';
}

export function selectLatestSprint() {
    userChoseSprint = false;
    var sprintSelect = document.getElementById('sprintFilter');
    var sorted = Array.from(sprintSelect.options).slice(1).map(function(o) { return o.value; });
    if (selectSprintByName(latestSprintValue(sprintSelect, sorted))) applyFilters();
}

export function selectPreviousSprint() {
    var sprintSelect = document.getElementById('sprintFilter');
    var names = Array.from(sprintSelect.options).slice(1).map(function(o) { return o.value; });
    var prev = previousSprintValue(sprintSelect, names);
    if (selectSprintByName(prev)) {
        userChoseSprint = true;
        applyFilters();
    } else showToast('Əvvəlki həftə tapılmadı!', 'error');
}

export function onDateRangeChange() {
    updateSprintFilterState();
    applyFilters();
}

export function onSprintDropdownChange() {
    userChoseSprint = document.getElementById('sprintFilter').value !== 'all';
    clearDateRangeInputs();
    applyFilters();
}

export function resetAllFilters() {
    userChoseSprint = false;
    var sprintSelect = document.getElementById('sprintFilter');
    var sorted = sprintSelect ? Array.from(sprintSelect.options).slice(1).map(function(o) { return o.value; }) : [];
    selectSprintByName(latestSprintValue(sprintSelect, sorted));
    var qurumSearch = document.getElementById('qurumSearch');
    if (qurumSearch) qurumSearch.value = '';
    state.currentAssigneeFilter = null;
    state.currentDirectionFilter = null;
    state.currentQurumFilter = null;
    state.activeLabelFilter = null;
    state.currentPage = 1;
    rememberListAction(null);
    localStorage.removeItem('dgd_filter_sprint');
    localStorage.removeItem('dgd_filter_startDate');
    localStorage.removeItem('dgd_filter_endDate');
    localStorage.removeItem('dgd_filter_assignee');
    localStorage.removeItem('dgd_filter_direction');
    localStorage.removeItem('dgd_filter_qurum');
    var badges = ['userFilterBadge', 'directionFilterBadge', 'qurumFilterBadge'];
    badges.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    applyFilters();
    showToast('Bütün filtrlər sıfırlandı!', 'info');
}

export function applyFilters() {
    if (state.currentQurumFilter) {
        state.currentQurumFilter = canonicalQurumName(state.currentQurumFilter) || state.currentQurumFilter;
    }
    if (!state.restoreQuiet) state.currentPage = 1;
    var sprintSelectEl = document.getElementById('sprintFilter');
    var sprintVal = sprintSelectEl.value;
    var startStr = document.getElementById('startDate').value;
    var endStr = document.getElementById('endDate').value;
    var useDateFilter = startStr || endStr;

    updateSprintFilterState();

    var startDateObj = null, endDateObj = null;
    if (useDateFilter) {
        if (startStr) {
            var sParts = startStr.split('-');
            startDateObj = new Date(sParts[0], sParts[1] - 1, sParts[2]);
            startDateObj.setHours(0, 0, 0, 0);
        }
        if (endStr) {
            var eParts = endStr.split('-');
            endDateObj = new Date(eParts[0], eParts[1] - 1, eParts[2]);
            endDateObj.setHours(23, 59, 59, 999);
        }
    }

    state.sprintDateFiltered = state.allTasks.filter(function(t) {
        if (!useDateFilter && sprintVal && sprintVal !== 'all') {
            if (!issueBelongsToSprint(t, sprintVal)) return false;
        }
        if (useDateFilter) {
            if (!taskBelongsToDateRange(t, startDateObj, endDateObj)) return false;
        }
        return true;
    });

    state.filteredTasks = state.sprintDateFiltered.filter(function(t) {
        if (state.currentDirectionFilter) {
            var dir = resolveDirection(t);
            if (!dir || dir.key !== state.currentDirectionFilter) return false;
        }
        if (state.currentQurumFilter) {
            var q = getQurumName(t) || 'Təyin edilməyib';
            if (!sameQurum(q, state.currentQurumFilter)) return false;
        }
        if (state.currentAssigneeFilter) {
            if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false;
        }
        return true;
    });

    var sprintSelect = document.getElementById('sprintFilter');
    var sprintNames = sprintSelect ? Array.from(sprintSelect.options).slice(1).map(function(o) { return o.value; }) : [];
    var currentSprint = currentSprintName(sprintNames);
    var selIdx = sprintNames.indexOf(sprintVal);
    var nextSprint = (selIdx > 0) ? sprintNames[selIdx - 1] : null;
    var isHistorical = !useDateFilter && sprintVal && sprintVal !== 'all' && currentSprint && sprintVal !== currentSprint;

    if (isHistorical) {
        state.filteredTasks = state.filteredTasks.map(function(t) {
            var histStatus = getHistoricalStatus(t, nextSprint, sprintVal);
            if (histStatus !== t.fields.status.name) {
                var newT = Object.assign({}, t);
                newT.fields = Object.assign({}, t.fields);
                newT.fields.status = Object.assign({}, t.fields.status, { name: histStatus });
                return newT;
            }
            return t;
        });
    }

    state.epicChartTasks = countableWorkUnits(state.sprintDateFiltered.filter(function(t) {
        if (state.currentQurumFilter) { var q = getQurumName(t) || 'Təyin edilməyib'; if (!sameQurum(q, state.currentQurumFilter)) return false; }
        if (state.currentAssigneeFilter) { if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false; }
        return true;
    }));
    state.qurumChartTasks = countableWorkUnits(state.sprintDateFiltered.filter(function(t) {
        if (state.currentDirectionFilter) { var dir = resolveDirection(t); if (!dir || dir.key !== state.currentDirectionFilter) return false; }
        if (state.currentAssigneeFilter) { if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false; }
        return true;
    }));

    if (state.currentDirectionFilter) {
        var b = document.getElementById('directionFilterBadge');
        b.classList.remove('hidden'); b.classList.add('flex');
        var dirObj = state.allDirections.find(function(d) { return d.key === state.currentDirectionFilter; });
        document.getElementById('directionFilterName').innerText = 'İstiqamət: ' + (dirObj ? dirObj.fields.summary : '');
    } else {
        var b2 = document.getElementById('directionFilterBadge');
        b2.classList.add('hidden'); b2.classList.remove('flex');
    }
    if (state.currentQurumFilter) {
        var qb = document.getElementById('qurumFilterBadge');
        qb.classList.remove('hidden'); qb.classList.add('flex');
        document.getElementById('qurumFilterName').innerText = 'Qurum: ' + state.currentQurumFilter;
    } else {
        var qb2 = document.getElementById('qurumFilterBadge');
        qb2.classList.add('hidden'); qb2.classList.remove('flex');
    }
    if (state.currentAssigneeFilter) {
        document.getElementById('userFilterBadge').classList.remove('hidden');
        document.getElementById('userFilterBadge').classList.add('flex');
        document.getElementById('userFilterName').innerText = 'İstifadəçi: ' + state.currentAssigneeFilter;
    } else {
        document.getElementById('userFilterBadge').classList.add('hidden');
        document.getElementById('userFilterBadge').classList.remove('flex');
    }

    renderStats(state.filteredTasks);
    updateCollapsedCounts();
    state.deferredGen = (state.deferredGen || 0) + 1;
    state.deferredDirty = true;
    saveFiltersToStorage();
    scheduleFilterPaint();
}

var paintWaiters = [];
var VIEW_SECTION_IDS = [
    'dailyActivityContent', 'labelChartContent', 'qurumStatContent', 'sprintComparisonContent',
    'weeklyContent', 'pausedContent', 'cetinliklerContent', 'taskListContent', 'assessmentHubContent'
];
var VIEW_STORAGE_KEY = 'dgd_view';
var CHART_STATUS_NAMES = {
    done: 'İcra edilib', progress: 'İcradadır', review: 'Rəy gözlənilir', esd: 'ESD',
    planned: 'Planlaşdırılıb', blocked: 'Bloklanıb', rejected: 'İmtina', paused: 'Dayandırılıb', other: 'Digər'
};

export function rememberListAction(action) {
    state.listViewAction = action || null;
    if (!state.restoreQuiet) persistViewState();
}

export function captureViewState() {
    var qurumSearch = document.getElementById('qurumSearch');
    var nested = [];
    document.querySelectorAll('.tl-nested:not(.hidden)').forEach(function(el) {
        if (el.id) nested.push(el.id);
    });
    return {
        openSections: VIEW_SECTION_IDS.filter(function(id) { return isSectionOpen(id); }),
        scrollY: window.scrollY || 0,
        listViewAction: state.listViewAction,
        taskListView: state.taskListView,
        taskListSearch: state.taskListSearch,
        currentPage: state.currentPage,
        qurumSearch: qurumSearch ? qurumSearch.value : '',
        nestedOpen: nested,
        dailyUser: sessionStorage.getItem('selectedDailyUser') || ''
    };
}

export function persistViewState() {
    try {
        sessionStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(captureViewState()));
    } catch (e) {}
}

function openSectionQuiet(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('slide-down');
    var icon = document.getElementById('icon-' + id);
    if (icon) icon.style.transform = 'rotate(180deg)';
    var toggleBtn = document.querySelector('[aria-controls="' + id + '"]');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
}

export function restoreOpenSections(snap) {
    if (!snap) return;
    (snap.openSections || []).forEach(openSectionQuiet);
    if (snap.dailyUser) {
        try { sessionStorage.setItem('selectedDailyUser', snap.dailyUser); } catch (e) {}
    }
}

function taskLabelNamesLocal(t) {
    var raw = (t && t.fields && t.fields.labels) ? t.fields.labels : [];
    return raw.map(function(lbl) {
        if (lbl && typeof lbl === 'object') return String(lbl.name || lbl.value || '').trim();
        return String(lbl || '').trim();
    }).filter(Boolean);
}

function replayListViewAction(action) {
    if (!action || !action.kind) return false;
    var prev = state._replayingList;
    state._replayingList = true;
    try {
        if (action.kind === 'filter') { filterTasks(action.type); return true; }
        if (action.kind === 'default') {
            renderTaskList(state.filteredTasks, 'Tapşırıqların Siyahısı');
            openTaskListSection();
            return true;
        }
        if (action.kind === 'dueWeek') {
            if (action.mode === 'done') showDueThisWeekDoneTasks();
            else if (action.mode === 'open') showDueThisWeekOpenTasks();
            else showDueThisWeekTasks();
            return true;
        }
        if (action.kind === 'qurumStatus') { filterQurumByStatus(action.qName, action.statusType); return true; }
        if (action.kind === 'dateStatus') { filterTasksByDateStatus(action.type); return true; }
        if (action.kind === 'sprintCompare') { filterSprintComparison(action.sprintName, action.type); return true; }
        if (action.kind === 'difficulties') { showDifficulties(); return true; }
        if (action.kind === 'dailyUser') { selectDailyUser(action.userName); return true; }
        if (action.kind === 'chartStatus') {
            var k = action.group;
            if (k === 'blocked') { showDifficulties(); return true; }
            var list = k === 'other'
                ? collectOtherDashboardUnits()
                : countableWorkUnits(state.filteredTasks).filter(function(t) { return getStatusGroup(t.fields.status.name) === k; });
            renderTaskList(list, (CHART_STATUS_NAMES[k] || k) + ' - Tapşırıqları', { keepNested: true });
            openTaskListSection();
            return true;
        }
        if (action.kind === 'label') {
            var dirObj = (state.allDirections || []).find(function(d) {
                return d && (d.key === action.dirKey || (d.fields && d.fields.summary === action.dirName));
            });
            if (!dirObj) return false;
            var fTasks = countableWorkUnits(state.filteredTasks).filter(function(t) {
                var dir = resolveDirection(t);
                if (!dir || dir.key !== dirObj.key) return false;
                var labels = taskLabelNamesLocal(t);
                if (action.label === 'Etiketsiz') return labels.length === 0;
                return labels.indexOf(action.label) !== -1;
            });
            renderTaskList(fTasks, (action.dirName || '') + ' - Etiket: ' + action.label, { keepNested: true });
            openTaskListSection();
            return true;
        }
        if (action.kind === 'keys') {
            var keySet = {};
            (action.keys || []).forEach(function(key) { keySet[key] = true; });
            var byKey = {};
            (state.allTasks || []).forEach(function(t) { if (t && keySet[t.key]) byKey[t.key] = t; });
            var tasks = (action.keys || []).map(function(key) { return byKey[key]; }).filter(Boolean);
            renderTaskList(tasks, action.title || 'Tapşırıqların Siyahısı', { keepNested: !!action.keepNested });
            openTaskListSection();
            return true;
        }
    } finally {
        state._replayingList = prev;
    }
    return false;
}

export function restoreViewChrome(snap) {
    if (!snap) return;
    if (snap.taskListView) state.taskListView = snap.taskListView;
    if (typeof snap.taskListSearch === 'string') state.taskListSearch = snap.taskListSearch;
    if (snap.currentPage) state.currentPage = snap.currentPage;
    if (isSectionOpen('taskListContent') && state.taskListSource && state.taskListSource.length) {
        renderTaskList(state.taskListSource, state.taskListTitle, { keepView: true });
    }
    restoreNestedPanels(snap.nestedOpen);
    if (typeof snap.qurumSearch === 'string') {
        var q = document.getElementById('qurumSearch');
        if (q) q.value = snap.qurumSearch;
        filterQurumList();
    }
    var y = snap.scrollY || 0;
    window.scrollTo(0, y);
}

export function afterFilterPaint(fn) {
    if (typeof fn === 'function') paintWaiters.push(fn);
}

function flushPaintWaiters() {
    var waiters = paintWaiters.splice(0);
    waiters.forEach(function(fn) {
        try { fn(); } catch (err) { console.error(err); }
    });
}

function scheduleFilterPaint() {
    if (filterPaintRaf) cancelAnimationFrame(filterPaintRaf);
    filterPaintRaf = requestAnimationFrame(function() {
        filterPaintRaf = 0;
        renderStatusChart(state.filteredTasks);
        renderAssigneeChart(state.filteredTasks);
        renderEpicChart(state.epicChartTasks);
        var runLazy = function() {
            renderVisibleLazySections();
            flushPaintWaiters();
            state.deferredDirty = false;
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(runLazy, { timeout: 180 });
        else requestAnimationFrame(runLazy);
    });
}

function isSectionOpen(id) {
    var el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
}

function updateCollapsedCounts() {
    var source = countableWorkUnits(state.filteredTasks);
    var planned = source.filter(function(t) { return isNextWeekBoxTask(t); });
    var weeklyDiff = document.getElementById('weeklyDiff');
    if (weeklyDiff) weeklyDiff.innerText = 'Cəmi ' + planned.length + ' tapşırıq';
    var pausedSource = state.sprintDateFiltered || [];
    var pausedTasks = pausedSource.filter(function(t) {
        if (!isTaskType(t)) return false;
        var statusNorm = normalizeStr(t.fields.status.name);
        return statusNorm.includes('dayandır') || statusNorm.includes('dayandir') || statusNorm.includes('müvəqqəti') || statusNorm.includes('muveqqeti') || statusNorm.includes('paused');
    });
    var pausedCount = document.getElementById('pausedCount');
    if (pausedCount) pausedCount.innerText = pausedTasks.length + ' tapşırıq';
}

var lastHubQurumFilter = undefined;
var lastHubTasks = undefined;

function assessmentHubNeedsRender() {
    var qf = state.currentQurumFilter || '';
    var tasks = state.allTasks || [];
    if (lastHubQurumFilter === qf && lastHubTasks === tasks) return false;
    lastHubQurumFilter = qf;
    lastHubTasks = tasks;
    return true;
}

function maybeRenderAssessmentHub() {
    if (!assessmentHubNeedsRender()) return;
    try { renderAssessmentSections(); } catch (err) { console.error(err); }
}

export function renderVisibleLazySections() {
    maybeRenderAssessmentHub();
    ['dailyActivityContent', 'labelChartContent', 'qurumStatContent', 'sprintComparisonContent',
     'weeklyContent', 'pausedContent', 'cetinliklerContent', 'taskListContent'].forEach(function(id) {
        if (isSectionOpen(id)) renderLazySection(id, true);
    });
}

export function renderLazySection(id, force) {
    if (id === 'dailyActivityContent') {
        var tasks = state.filteredTasks.concat(state.todayTasks || []);
        Promise.resolve(state.ensureChangelogs && state.ensureChangelogs(tasks)).then(function() {
            renderDailyProgress();
        });
        return;
    }
    if (id === 'labelChartContent') { renderLabelChart(); return; }
    if (id === 'qurumStatContent') { renderQurumChart(state.qurumChartTasks); return; }
    if (id === 'sprintComparisonContent') {
        try { renderSprintComparison(); } catch (err) { console.error(err); }
        return;
    }
    if (id === 'weeklyContent') { renderWeeklyTasks(); return; }
    if (id === 'pausedContent') { renderPausedTasks(); return; }
    if (id === 'cetinliklerContent') { renderDifficulties(state.filteredTasks); return; }
    if (id === 'assessmentHubContent') {
        var dash = document.getElementById('assessListDash');
        if (dash && dash.getAttribute('data-section')) return;
        lastHubQurumFilter = state.currentQurumFilter || '';
        lastHubTasks = state.allTasks || [];
        try { renderAssessmentSections(); } catch (err) { console.error(err); }
        return;
    }
    if (id === 'taskListContent') {
        if (state.listViewAction && state.listViewAction.kind !== 'difficulties' && !state._replayingList) {
            replayListViewAction(state.listViewAction);
            return;
        }
        renderTaskList(state.filteredTasks);
    }
}

export function saveFiltersToStorage() {
    try {
        localStorage.setItem('dgd_filter_sprint', document.getElementById('sprintFilter').value);
        localStorage.setItem('dgd_filter_startDate', document.getElementById('startDate').value);
        localStorage.setItem('dgd_filter_endDate', document.getElementById('endDate').value);
        localStorage.setItem('dgd_filter_assignee', state.currentAssigneeFilter || '');
        localStorage.setItem('dgd_filter_direction', state.currentDirectionFilter || '');
        localStorage.setItem('dgd_filter_qurum', state.currentQurumFilter || '');
    } catch(e) {}
}

export function loadFiltersFromStorage() {
    state.currentAssigneeFilter = localStorage.getItem('dgd_filter_assignee') || null;
    state.currentDirectionFilter = localStorage.getItem('dgd_filter_direction') || null;
    var storedQurum = localStorage.getItem('dgd_filter_qurum') || null;
    state.currentQurumFilter = storedQurum ? (canonicalQurumName(storedQurum) || storedQurum) : null;
    updateSprintFilterState();
}

export function clearUserFilter() { 
    state.currentAssigneeFilter = null; 
    localStorage.removeItem('dgd_filter_assignee');
    applyFilters(); 
}

export function clearDirectionFilter() { 
    state.currentDirectionFilter = null; 
    localStorage.removeItem('dgd_filter_direction');
    applyFilters(); 
}

export function clearQurumFilter() { 
    state.currentQurumFilter = null; 
    localStorage.removeItem('dgd_filter_qurum');
    applyFilters(); 
}

export function setQurumFilter(qName) {
    var name = canonicalQurumName(qName) || qName;
    if (sameQurum(state.currentQurumFilter, name)) { state.currentQurumFilter = null; } else { state.currentQurumFilter = name; }
    applyFilters();
}

export function filterQurumByStatus(qName, statusType) {
    var fTasks = state.qurumChartTasks.filter(function(t) {
        var q = getQurumName(t) || 'Təyin edilməyib';
        if (!sameQurum(q, qName)) return false;
        if (statusType === 'all') return true;
        if (statusType === 'done') return getStatusGroup(t.fields.status.name) === 'done';
        if (statusType === 'planned') return getStatusGroup(t.fields.status.name) === 'planned';
        if (statusType === 'progress') {
            return isActiveExecutionGroup(getStatusGroup(t.fields.status.name));
        }
        return false;
    });
    var title = qName + ' - ';
    if (statusType === 'done') title += 'Tamamlanmış';
    else if (statusType === 'planned') title += 'Planlaşdırılmış';
    else if (statusType === 'progress') title += 'İcradakı';
    else title += 'Ümumi';
    title += ' Tapşırıqlar';
    rememberListAction({ kind: 'qurumStatus', qName: qName, statusType: statusType });
    renderTaskList(fTasks, title);
    openTaskListSection();
}

export function filterTasksByDateStatus(type) {
    var f = countableWorkUnits(state.filteredTasks).filter(function(t) { return getDateStatus(t) === type; });
    var title = type === 'early' ? 'Vaxtından Öncə Bitən Tapşırıqlar' : type === 'ontime' ? 'Zamanında Bitən Tapşırıqlar' : 'Gecikən / Vaxtı Keçmiş Tapşırıqlar';
    rememberListAction({ kind: 'dateStatus', type: type });
    renderTaskList(f, title);
    openTaskListSection();
}

export function filterQurumList() {
    var input = document.getElementById('qurumSearch');
    var searchStr = normalizeStr(input ? input.value : '');
    var clearBtn = document.getElementById('qurumSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !searchStr);
    var rows = document.querySelectorAll('#qurumTableBody tr');
    rows.forEach(function(row) {
        var nameCell = row.querySelector('td');
        var text = normalizeStr(nameCell ? nameCell.textContent : row.textContent);
        if (!searchStr || text.indexOf(searchStr) !== -1) row.classList.remove('hidden');
        else row.classList.add('hidden');
    });
}

export function clearQurumSearch() {
    var input = document.getElementById('qurumSearch');
    if (input) input.value = '';
    filterQurumList();
}

export function filterSprintComparison(sprintName, type) {
    var useDateFilter = !!(document.getElementById('startDate').value || document.getElementById('endDate').value);
    var sprintVal = document.getElementById('sprintFilter').value;
    var isSelectedSprint = state.sprintDisplayMap[sprintName] === 'Seçilmiş sprint' || state.sprintDisplayMap[sprintName] === 'Cari həftə';
    var sTasks;
    if (isSelectedSprint && (useDateFilter || (sprintVal && sprintVal !== 'all' && sprintVal === sprintName))) {
        sTasks = (state.sprintDateFiltered || []).filter(isTaskType);
    } else {
        sTasks = state.allTasks.filter(function(t) { return isTaskType(t) && getSprintNames(t).includes(sprintName); });
    }
    var curSprint = null, prevSprint = null;
    for (var key in state.sprintDisplayMap) {
        if (state.sprintDisplayMap[key] === 'Seçilmiş sprint' || state.sprintDisplayMap[key] === 'Cari həftə') curSprint = key;
        if (state.sprintDisplayMap[key] === 'Əvvəlki sprint' || state.sprintDisplayMap[key] === 'Əvvəlki həftə') prevSprint = key;
    }

    function statusForCompare(t) {
        if (sprintName === prevSprint && curSprint) return getHistoricalStatus(t, curSprint, prevSprint);
        return t.fields.status.name;
    }

    var validSTasks = sTasks.filter(function(t) {
        var st = normalizeStr(statusForCompare(t));
        var isRejected = getStatusGroup(st) === 'rejected';
        var isBacklog = st.includes('başlanmamış') || st.includes('baslanmamis');
        var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
        return !isRejected && !isBacklog && !isPaused;
    });

    var f = [];
    var title = (state.sprintDisplayMap[sprintName] || sprintName) + ' - Tapşırıqları';

    function dueInComparedWeek(t) {
        if (getSprintDateRange(sprintName)) return isDueInSprint(t, sprintName);
        if (sprintName === prevSprint) return false;
        return isDueInSelectedWeek(t);
    }

    if (type === 'done') {
        f = validSTasks.filter(function(t) { return getStatusGroup(statusForCompare(t)) === 'done'; });
        title += ' - Yekunlaşıb';
    }
    else if (type === 'due') {
        f = validSTasks.filter(function(t) {
            return dueInComparedWeek(t) && getStatusGroup(statusForCompare(t)) !== 'rejected';
        });
        title += ' - Həftə ərzində bitməli olan';
    }
    else if (type === 'dueDone') {
        f = validSTasks.filter(function(t) {
            return dueInComparedWeek(t) && getStatusGroup(statusForCompare(t)) === 'done';
        });
        title += ' - Yekunlaşıb';
    }
    else if (type === 'carryover') {
        if (sprintName === prevSprint && curSprint) {
            f = validSTasks.filter(function(t) {
                return getStatusGroup(statusForCompare(t)) !== 'done';
            });
            title += ' - Növbəti sprintə keçən';
        } else {
            f = validSTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) !== 'done'; });
            title += ' - Davam edən';
        }
    }
    else { f = validSTasks; }

    rememberListAction({ kind: 'sprintCompare', sprintName: sprintName, type: type });
    renderTaskList(f, title, { keepNested: true });
    openTaskListSection();

    document.querySelectorAll('#sprintComparison [data-sc-type]').forEach(function(el) {
        var on = el.getAttribute('data-sprint') === sprintName && el.getAttribute('data-sc-type') === type;
        el.classList.toggle('is-active', on);
        if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

export function selectDailyUser(userName) {
    if (!state.dailyDateRange) return;
    var rangeStart = state.dailyDateRange.start;
    var rangeEnd = state.dailyDateRange.end;
    var EXCLUDED_FIELDS = ['rank', 'flagged', 'aggregated'];
    var SYSTEM_AUTHORS = ['jira', 'system', 'automation', 'bot'];

    function inRange(dateStr) {
        var d = new Date(dateStr);
        return d >= rangeStart && d <= rangeEnd;
    }

    var userTasks = state.filteredTasks.filter(function(t) {
        var name = t.fields.assignee ? t.fields.assignee.displayName : 'Təyin edilməyib';
        if (name !== userName) return false;
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

    showUserActivity(userName, userTasks);
    rememberListAction({ kind: 'dailyUser', userName: userName });
}

export function showDifficulties() {
    var el = document.getElementById('cetinliklerContent');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('slide-down');
    var icon = document.getElementById('icon-cetinliklerContent');
    if (icon) icon.style.transform = 'rotate(180deg)';
    renderLazySection('cetinliklerContent');
    rememberListAction({ kind: 'difficulties' });
    if (!state.restoreQuiet) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function showDueThisWeekDoneTasks() {
    var dueTasks = collectDueThisWeekDoneTasks();
    var label = duePeriodLabel();
    if (dueTasks.length === 0) {
        showToast(label + ' olan tamamlanan tapşırıq tapılmadı.', 'info');
    }
    rememberListAction({ kind: 'dueWeek', mode: 'done' });
    renderTaskList(dueTasks, label + ' — tamamlananlar (' + dueTasks.length + ')', { keepNested: true });
    openTaskListSection();
}

export function showDueThisWeekOpenTasks() {
    var dueTasks = collectDueThisWeekOpenTasks();
    var label = duePeriodLabel();
    if (dueTasks.length === 0) {
        showToast(label + ' olan tamamlanmayan tapşırıq tapılmadı.', 'info');
    }
    rememberListAction({ kind: 'dueWeek', mode: 'open' });
    renderTaskList(dueTasks, label + ' — tamamlanmayanlar (' + dueTasks.length + ')', { keepNested: true });
    openTaskListSection();
}

export function showDueThisWeekTasks() {
    var dueTasks = collectDueThisWeekTasks();
    var label = duePeriodLabel();
    if (dueTasks.length === 0) {
        showToast(label + ' olan tapşırıq tapılmadı! (Tarix fields-i yoxlayın)', 'info');
    }
    rememberListAction({ kind: 'dueWeek', mode: 'all' });
    renderTaskList(dueTasks, label + ' — bütün tapşırıqlar (' + dueTasks.length + ')', { keepNested: true });
    openTaskListSection();
}

export function filterTasks(type) {
    if (!state.restoreQuiet) state.currentPage = 1;
    if (type === 'blocked') {
        rememberListAction({ kind: 'difficulties' });
        showDifficulties();
        return;
    }
    rememberListAction({ kind: 'filter', type: type });
    var units = countableWorkUnits(state.filteredTasks);
    var f = units, title = 'Ümumi Tapşırıqların Siyahısı';
    
    if (type === 'all') { 
        f = jiraBoardWorkUnits(state.filteredTasks);
        title = 'Ümumi Tapşırıqların Siyahısı';
        renderTaskList(f, title, { keepNested: true });
        if (isSectionOpen('qurumStatContent')) renderQurumChart(f);
        openTaskListSection();
        return;
    }
    if (type === 'planned') {
        f = units.filter(function(t) { return isNextWeekBoxTask(t); });
        title = 'Növbəti həftə (Planlaşdırılıb ∪ bitmə növbəti həftə)';
    }
    else if (type === 'sprint') {
        f = units.filter(function(t) { return isActiveExecutionGroup(getStatusGroup(t.fields.status.name)); });
        title = 'İcradakı (İcradadır, ESD & Rəy) Tapşırıqlar';
    }
    else if(type==='done') { 
        f = units.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'done'; }); 
        title = 'Tamamlanmış (İcra edilib) Tapşırıqlar'; 
    }
    else if (type === 'rejected') { f = (state.filteredTasks || []).filter(function(t) { return isTaskType(t) && getStatusGroup(t.fields.status.name) === 'rejected'; }); title = 'İmtina Edilmiş Tapşırıqlar'; }
    else if (type === 'other') {
        f = collectOtherDashboardUnits();
        title = 'İcraya başlanmayıb (seçilmiş sprint)';
    }
    else if (type === 'backlog') {
        f = collectBacklogDashboardUnits();
        title = 'Backlog — İcraya başlanmayıb';
        renderTaskList(f, title);
        if (isSectionOpen('qurumStatContent')) renderQurumChart(f);
        openTaskListSection();
        return;
    }
    else if (type === 'noStart') {
        f = tasksWithoutStartDate();
        title = 'Başlama tarixi boş olan tapşırıqlar';
        if (f.length === 0) showToast('Başlama tarixi boş olan tapşırıq tapılmadı.', 'info');
    }
    else if (type === 'noDue') {
        f = tasksWithoutDueDate();
        title = 'Bitmə tarixi boş olan tapşırıqlar';
        if (f.length === 0) showToast('Bitmə tarixi boş olan tapşırıq tapılmadı.', 'info');
        renderTaskList(f, title, { keepNested: true });
        if (isSectionOpen('qurumStatContent')) renderQurumChart(f);
        openTaskListSection();
        return;
    }
    
    renderTaskList(f, title);
    if (isSectionOpen('qurumStatContent')) renderQurumChart(f);
    openTaskListSection();
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDatePopover();
});

(function bindDateCalendar() {
    var grid = document.getElementById('dateCalGrid');
    if (grid) {
        grid.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-iso]');
            if (btn) pickPopoverDate(btn.getAttribute('data-iso'));
        });
    }
    updateDateTriggerLabel();
})();
