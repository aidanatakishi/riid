import { state } from './state.js';
import { normalizeStr, showToast, toggleDropdown } from './utils.js';
import { getDateStatus, getHistoricalStatus, getQurumName, getSprintNames, getStatusGroup, hasValidDifficulty, isDueThisWeek, isLeafWorkUnit, resolveDirection } from './model.js';
import { renderAssigneeChart, renderDailyProgress, renderEpicChart, renderLabelChart, renderQurumChart, renderStatusChart } from './charts.js';
import { renderDifficulties, renderPausedTasks, renderSprintComparison, renderStats, renderTaskList, renderWeeklyTasks, showUserActivity } from './render.js';

var historicalChangelogLoading = false;
var defaultSprintApplied = false;

function latestSprintValue(sprintSelect) {
    if (!sprintSelect || sprintSelect.options.length < 2) return '';
    return sprintSelect.options[1].value;
}

function selectSprintByOffset(offset) {
    var sprintSelect = document.getElementById('sprintFilter');
    clearDateRangeInputs();
    if (!sprintSelect || sprintSelect.options.length < 2 + offset) return false;
    sprintSelect.selectedIndex = 1 + offset;
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
    var sortedSprints = Array.from(sprintSet).sort(function(a, b) {
        var numA = parseInt((a.match(/\d+/) || [0])[0]);
        var numB = parseInt((b.match(/\d+/) || [0])[0]);
        return numB - numA;
    });
    sortedSprints.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s; opt.innerText = s;
        sprintSelect.appendChild(opt);
    });

    if (usingDates) {
        updateSprintFilterState();
        return;
    }

    var optionExists = Array.from(sprintSelect.options).some(function(opt) { return opt.value === previousVal; });
    if (!defaultSprintApplied || !previousVal || previousVal === 'all' || !optionExists) {
        sprintSelect.value = latestSprintValue(sprintSelect) || 'all';
        defaultSprintApplied = true;
    } else {
        sprintSelect.value = previousVal;
    }
    updateSprintFilterState();
}

export function clearDateRangeInputs() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    updateSprintFilterState();
}

export function updateSprintFilterState() {
    var startStr = document.getElementById('startDate').value;
    var endStr = document.getElementById('endDate').value;
    var sprintSelect = document.getElementById('sprintFilter');
    if (!sprintSelect) return;
    if (startStr || endStr) {
        sprintSelect.disabled = false;
        sprintSelect.classList.add('opacity-50');
        sprintSelect.title = 'Tarix aralığı aktivdir. Sprint seçsəniz, yalnız sprintə görə filter olunacaq.';
    } else {
        sprintSelect.classList.remove('opacity-50', 'cursor-not-allowed');
        sprintSelect.title = '';
    }
}

export function selectLatestSprint() {
    if (selectSprintByOffset(0)) applyFilters();
}

export function selectPreviousSprint() {
    if (selectSprintByOffset(1)) applyFilters();
    else showToast('Əvvəlki həftə tapılmadı!', 'error');
}

export function onDateRangeChange() {
    updateSprintFilterState();
    applyFilters();
}

export function onSprintDropdownChange() {
    clearDateRangeInputs();
    applyFilters();
}

export function resetAllFilters() {
    selectSprintByOffset(0);
    var qurumSearch = document.getElementById('qurumSearch');
    if (qurumSearch) qurumSearch.value = '';
    state.currentAssigneeFilter = null;
    state.currentDirectionFilter = null;
    state.currentQurumFilter = null;
    state.activeLabelFilter = null;
    state.currentPage = 1;
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
    state.currentPage = 1;
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
            var sprints = getSprintNames(t);
            if (!sprints.includes(sprintVal)) return false;
        }
        if (useDateFilter) {
            var taskDateRaw = t.fields['customfield_10808'];
            if (!taskDateRaw) return false; 
            var dStr = String(taskDateRaw).split('T')[0];
            var dParts = dStr.split('-');
            if (dParts.length < 3) return false;
            var d = new Date(dParts[0], dParts[1] - 1, dParts[2]);
            d.setHours(12, 0, 0, 0); 
            if (startDateObj && d < startDateObj) return false;
            if (endDateObj && d > endDateObj) return false;
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
            if (q !== state.currentQurumFilter) return false;
        }
        if (state.currentAssigneeFilter) {
            if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false;
        }
        var st = normalizeStr(t.fields.status.name);
        if (st.includes('başlanmamış') || st.includes('baslanmamis')) return false;
        if (st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti')) return false;
        return true;
    });

    var sprintSelect = document.getElementById('sprintFilter');
    var nextSprint = null;
    if (sprintVal && sprintVal !== 'all') {
        var selIdx = -1;
        for (var i = 1; i < sprintSelect.options.length; i++) {
            if (sprintSelect.options[i].value === sprintVal) { selIdx = i; break; }
        }
        if (selIdx > 1) nextSprint = sprintSelect.options[selIdx - 1].value;
    }
    var isHistorical = nextSprint !== null && !useDateFilter;

    if (isHistorical) {
        state.filteredTasks = state.filteredTasks.map(function(t) {
            var histStatus = getHistoricalStatus(t, nextSprint);
            if (histStatus !== t.fields.status.name) {
                var newT = Object.assign({}, t);
                newT.fields = Object.assign({}, t.fields);
                newT.fields.status = Object.assign({}, t.fields.status, { name: histStatus });
                return newT;
            }
            return t;
        });
        if (!historicalChangelogLoading && state.ensureChangelogs) {
            var missingLog = state.filteredTasks.some(function(t) { return t && !t.changelog; });
            if (missingLog) {
                historicalChangelogLoading = true;
                Promise.resolve(state.ensureChangelogs(state.filteredTasks)).then(function() {
                    historicalChangelogLoading = false;
                    applyFilters();
                }).catch(function() { historicalChangelogLoading = false; });
            }
        }
    }

    state.epicChartTasks = state.sprintDateFiltered.filter(function(t) {
        if (state.currentQurumFilter) { var q = getQurumName(t) || 'Təyin edilməyib'; if (q !== state.currentQurumFilter) return false; }
        if (state.currentAssigneeFilter) { if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false; }
        return true;
    });
    state.qurumChartTasks = state.sprintDateFiltered.filter(function(t) {
        if (state.currentDirectionFilter) { var dir = resolveDirection(t); if (!dir || dir.key !== state.currentDirectionFilter) return false; }
        if (state.currentAssigneeFilter) { if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false; }
        return true;
    });

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

    renderStats(state.sprintDateFiltered);
    renderStatusChart(state.filteredTasks);
    renderAssigneeChart(state.filteredTasks);
    renderEpicChart(state.epicChartTasks);
    updateCollapsedCounts();
    state.deferredDirty = true;
    renderVisibleLazySections();
    saveFiltersToStorage();
}

function isSectionOpen(id) {
    var el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
}

function updateCollapsedCounts() {
    var planned = state.allTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; });
    var weeklyDiff = document.getElementById('weeklyDiff');
    if (weeklyDiff) weeklyDiff.innerText = 'Cəmi ' + planned.length + ' tapşırıq';
    var pausedTasks = state.allTasks.filter(function(t) {
        var statusNorm = normalizeStr(t.fields.status.name);
        return statusNorm.includes('dayandır') || statusNorm.includes('dayandir') || statusNorm.includes('müvəqqəti') || statusNorm.includes('muveqqeti') || statusNorm.includes('paused');
    });
    var pausedCount = document.getElementById('pausedCount');
    if (pausedCount) pausedCount.innerText = pausedTasks.length + ' tapşırıq';
}

export function renderVisibleLazySections() {
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
        Promise.resolve(state.ensureChangelogs && state.ensureChangelogs(state.allTasks)).then(function() {
            renderSprintComparison();
        });
        return;
    }
    if (id === 'weeklyContent') { renderWeeklyTasks(); return; }
    if (id === 'pausedContent') { renderPausedTasks(); return; }
    if (id === 'cetinliklerContent') { renderDifficulties(state.filteredTasks); return; }
    if (id === 'taskListContent') {
        if (!force) {
            var listDiv = document.getElementById('taskList');
            if (listDiv && listDiv.innerHTML) return;
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
    state.currentQurumFilter = localStorage.getItem('dgd_filter_qurum') || null;
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
    if (state.currentQurumFilter === qName) { state.currentQurumFilter = null; } else { state.currentQurumFilter = qName; }
    applyFilters();
}

export function filterQurumByStatus(qName, statusType) {
    var fTasks = state.qurumChartTasks.filter(function(t) {
        var q = getQurumName(t) || 'Təyin edilməyib';
        if (q !== qName) return false;
        if (statusType === 'all') return true;
        if (statusType === 'done') return getStatusGroup(t.fields.status.name) === 'done';
        if (statusType === 'planned') return getStatusGroup(t.fields.status.name) === 'planned';
        if (statusType === 'progress') {
            var g = getStatusGroup(t.fields.status.name);
            return g === 'progress' || g === 'esd' || g === 'review';
        }
        return false;
    });
    var title = qName + ' - ';
    if (statusType === 'done') title += 'Tamamlanmış';
    else if (statusType === 'planned') title += 'Planlaşdırılmış';
    else if (statusType === 'progress') title += 'İcradakı';
    else title += 'Ümumi';
    title += ' Tapşırıqlar';
    renderTaskList(fTasks, title);
    var listEl = document.getElementById('taskListContent');
    listEl.classList.remove('hidden'); listEl.classList.add('slide-down');
    listEl.scrollIntoView({ behavior: 'smooth' });
}

export function filterTasksByDateStatus(type) {
    var f = state.filteredTasks.filter(function(t) { return getDateStatus(t) === type; });
    var title = type === 'early' ? 'Vaxtından Öncə Bitən Tapşırıqlar' : type === 'ontime' ? 'Zamanında Bitən Tapşırıqlar' : 'Gecikən / Vaxtı Keçmiş Tapşırıqlar';
    renderTaskList(f, title);
    var listEl = document.getElementById('taskListContent');
    listEl.classList.remove('hidden');
    listEl.classList.add('slide-down');
    listEl.scrollIntoView({ behavior: 'smooth' });
}

export function filterQurumList() {
    var searchStr = document.getElementById('qurumSearch').value.toLowerCase();
    var rows = document.querySelectorAll('#qurumTableBody tr');
    rows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        if (text.includes(searchStr)) row.classList.remove('hidden');
        else row.classList.add('hidden');
    });
}

export function filterSprintComparison(sprintName, type) {
    var useDateFilter = !!(document.getElementById('startDate').value || document.getElementById('endDate').value);
    var sprintVal = document.getElementById('sprintFilter').value;
    var isSelectedSprint = state.sprintDisplayMap[sprintName] === 'Seçilmiş sprint' || state.sprintDisplayMap[sprintName] === 'Cari həftə';
    var sTasks;
    if (isSelectedSprint && (useDateFilter || (sprintVal && sprintVal !== 'all' && sprintVal === sprintName))) {
        sTasks = (state.sprintDateFiltered || []).filter(isLeafWorkUnit);
    } else {
        sTasks = state.allTasks.filter(function(t) { return isLeafWorkUnit(t) && getSprintNames(t).includes(sprintName); });
    }
    var validSTasks = sTasks.filter(function(t) {
        var st = normalizeStr(t.fields.status.name);
        var isRejected = getStatusGroup(st) === 'rejected';
        var isBacklog = st.includes('başlanmamış') || st.includes('baslanmamis');
        var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
        return !isRejected && !isBacklog && !isPaused;
    });

    var f = [];
    var title = (state.sprintDisplayMap[sprintName] || sprintName) + ' - Tapşırıqları';

    var curSprint = null, prevSprint = null;
    for (var key in state.sprintDisplayMap) {
        if (state.sprintDisplayMap[key] === 'Seçilmiş sprint' || state.sprintDisplayMap[key] === 'Cari həftə') curSprint = key;
        if (state.sprintDisplayMap[key] === 'Əvvəlki sprint' || state.sprintDisplayMap[key] === 'Əvvəlki həftə') prevSprint = key;
    }

    if (type === 'done') {
        if (sprintName === prevSprint && curSprint) {
            f = validSTasks.filter(function(t) {
                return getStatusGroup(getHistoricalStatus(t, curSprint)) === 'done';
            });
        } else {
            f = validSTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'done'; });
        }
        title += ' - Tamamlanmış';
    }
    else if (type === 'carryover') {
        if (sprintName === prevSprint && curSprint) {
            f = validSTasks.filter(function(t) {
                return getStatusGroup(getHistoricalStatus(t, curSprint)) !== 'done';
            });
            title += ' - Növbəti sprintə keçən';
        } else {
            f = validSTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) !== 'done'; });
            title += ' - Davam edən';
        }
    }
    else { f = validSTasks; }

    renderTaskList(f, title);
    toggleDropdown('taskListContent');
    document.getElementById('taskListContent').scrollIntoView({ behavior: 'smooth' });
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
}

export function showDifficulties() {
    var el = document.getElementById('cetinliklerContent');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('slide-down');
    var icon = document.getElementById('icon-cetinliklerContent');
    if (icon) icon.style.transform = 'rotate(180deg)';
    renderLazySection('cetinliklerContent');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function showDueThisWeekTasks() {
    var dueTasks = [];
    state.filteredTasks.forEach(function(t) {
        if (isDueThisWeek(t)) {
            var g = getStatusGroup(t.fields.status.name);
            if (g !== 'done' && g !== 'rejected') {
                dueTasks.push(t);
            }
        }
    });
    if (dueTasks.length === 0) {
        showToast('Bu həftə bitməli olan task tapılmadı! (Tarix fields-i yoxlayın)', 'info');
    }
    renderTaskList(dueTasks, 'Bu həftə bitməli olan Tapşırıqlar');
    var listEl = document.getElementById('taskListContent');
    listEl.classList.remove('hidden');
    listEl.classList.add('slide-down');
    listEl.scrollIntoView({ behavior: 'smooth' });
}

export function filterTasks(type) {
    state.currentPage = 1;
    var f = state.filteredTasks, title = 'Ümumi Tapşırıqların Siyahısı';
    
    if (type === 'all') { 
        f = state.filteredTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) !== 'rejected'; }); 
    }
    if (type === 'planned') { f = state.filteredTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; }); title = 'Növbəti həftə iş yükü (Planlaşdırılıb)'; }
    else if (type === 'sprint') { f = state.filteredTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'progress'; }); title = 'İcradakı (İcradadır, ESD & Rəy) Tapşırıqlar'; }
    else if(type==='done') { 
        f = state.filteredTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'done'; }); 
        title = "Tamamlanmış (Həll edilib) Tapşırıqlar"; 
    }
    else if (type === 'blocked') { 
        f = state.filteredTasks.filter(function(t) { 
            var g = getStatusGroup(t.fields.status.name); 
            return (g === 'blocked' || hasValidDifficulty(t)) && g !== 'rejected'; 
        }); 
        title = 'Çətinliklər'; 
    }
    else if (type === 'rejected') { f = state.filteredTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'rejected'; }); title = 'İmtina Edilmiş Tapşırıqlar'; }
    else if (type === 'other') { f = state.filteredTasks.filter(function(t) { var g = getStatusGroup(t.fields.status.name); return g === 'other' && !hasValidDifficulty(t); }); title = 'Digər Statusda Olan Tapşırıqlar'; }
    
    renderTaskList(f, title);
    renderQurumChart(f);
    
    var listEl = document.getElementById('taskListContent');
    listEl.classList.remove('hidden');
    listEl.classList.add('slide-down');
    listEl.scrollIntoView({ behavior: 'smooth' });
}
