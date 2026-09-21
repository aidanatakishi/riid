import { state } from './state.js';
import { showToast, animateValue, normalizeStr, toggleSettings, hideSettings, showSettings, onSettingsOverlayClick, getInitials, getIssueTypeIcon, getStatusColor, truncateChangeValue, getChangeFieldMeta, toggleDropdown } from './utils.js?v=idda5';
import { getParentIssue, resolveDirection, isKomplaynsName, hasKomplaynsComponent, belongsToDept, getStatusGroup, isActiveExecutionGroup, isDueThisWeek, isDueInSelectedWeek, getHistoricalStatus, getDifficultyField, hasValidDifficulty, parsePhaseDate, formatDateObj, getPhaseFieldText, getRawPhaseEntries, formatPhaseEntriesText, getQurumName, getDateStatus, getSprintDateRange, getSprintNames } from './model.js?v=idda5';
import { fetchJQL, fetchTodayChanges, fetchDashboardData, loadServerConfig, loadAssessmentCreatedRange, applyTeamScope } from './api.js?v=idda13';
import { populateSprintFilter, clearDateRangeInputs, updateSprintFilterState, selectLatestSprint, selectPreviousSprint, onSprintDropdownChange, onDateRangeChange, resetAllFilters, applyFilters, saveFiltersToStorage, loadFiltersFromStorage, persistViewState, clearUserFilter, clearPriorityFilter, clearDirectionFilter, clearQurumFilter, clearStatusFilter, clearLabelFilter, setQurumFilter, filterQurumByStatus, filterTasksByDateStatus, filterQurumList, clearQurumSearch, filterSprintComparison, selectDailyUser, showDifficulties, showDueThisWeekTasks, showDueThisWeekDoneTasks, showDueThisWeekOpenTasks, filterTasks, filterEsdInnerStatus, renderLazySection, toggleDatePopover, closeDatePopover, applyDatePopover, clearDatePopover, shiftDateCalendar, showNoStartDateTasks, showNoDueDateTasks, onDateOverlayClick, selectViewedMonth } from './filters.js?v=idda30';
import { renderStatusChart, renderAssigneeChart, renderEpicChart, renderQurumChart, renderLabelChart, drawChart, drawStackedChart, renderDailyProgress } from './charts.js?v=idda35';
import { renderStats, renderDifficulties, getDifficultyCardHtml, renderTaskList, toggleTaskChildren, toggleSubtasks, toggleRelated, changePage, showTaskListKind, onTaskListSearchInput, clearTaskListSearch, resetTaskListFilter, renderWeeklyTasks, renderPausedTasks, renderSprintComparison, showUserActivity } from './render.js?v=idda6';
import { loadDocxLib, exportTasksToWord } from './report.js?v=idda7';
import { renderAssessmentSections, setAssessmentYear, setAssessmentYearForActiveTab, setAssessmentTab, focusAssessmentSection, showAssessFullList, setAssessmentSearch, onAssessmentSearchInput, clearAssessmentSearch, setAssessmentPage, toggleAssessmentDetail, getActiveAssessmentTab, openDiagModal, closeDiagModal, onDiagModalOverlayClick, onAssessMonthChange, onAssessDatesChange, applyAssessmentPeriod, setMeqsedDashFilter, setAssessListFilter, cycleAssessListSort, setAssessListSort, toggleAssessListFilterMenu, closeAssessListFilterMenu } from './assessments.js?v=idda41';
import { openNk303, closeNk303, onNk303OverlayClick, nk303Call, syncNk303Route, nk303MeqsedFilter, nk303MeqsedSearch } from './nk303.js?v=idda99';
import { initChat } from './chat.js?v=idda21';
import { applySessionChrome, logoutApp, rememberCurrentProject, requireSession } from './session.js?v=idda12';

state.onSectionOpen = function(id) { renderLazySection(id, true); };
state.onViewChange = persistViewState;
window.addEventListener('pagehide', persistViewState);

window.showToast = showToast;
window.animateValue = animateValue;
window.normalizeStr = normalizeStr;
window.toggleSettings = toggleSettings;
window.hideSettings = hideSettings;
window.showSettings = showSettings;
window.onSettingsOverlayClick = onSettingsOverlayClick;
window.getInitials = getInitials;
window.getIssueTypeIcon = getIssueTypeIcon;
window.getStatusColor = getStatusColor;
window.truncateChangeValue = truncateChangeValue;
window.getChangeFieldMeta = getChangeFieldMeta;
window.toggleDropdown = toggleDropdown;
window.getParentIssue = getParentIssue;
window.resolveDirection = resolveDirection;
window.isKomplaynsName = isKomplaynsName;
window.hasKomplaynsComponent = hasKomplaynsComponent;
window.belongsToDept = belongsToDept;
window.getStatusGroup = getStatusGroup;
window.isActiveExecutionGroup = isActiveExecutionGroup;
window.isDueThisWeek = isDueThisWeek;
window.isDueInSelectedWeek = isDueInSelectedWeek;
window.getHistoricalStatus = getHistoricalStatus;
window.getDifficultyField = getDifficultyField;
window.hasValidDifficulty = hasValidDifficulty;
window.parsePhaseDate = parsePhaseDate;
window.formatDateObj = formatDateObj;
window.getPhaseFieldText = getPhaseFieldText;
window.getRawPhaseEntries = getRawPhaseEntries;
window.formatPhaseEntriesText = formatPhaseEntriesText;
window.getQurumName = getQurumName;
window.getDateStatus = getDateStatus;
window.getSprintDateRange = getSprintDateRange;
window.getSprintNames = getSprintNames;
window.fetchJQL = fetchJQL;
window.fetchTodayChanges = fetchTodayChanges;
window.fetchDashboardData = fetchDashboardData;
window.populateSprintFilter = populateSprintFilter;
window.clearDateRangeInputs = clearDateRangeInputs;
window.updateSprintFilterState = updateSprintFilterState;
window.selectLatestSprint = selectLatestSprint;
window.selectPreviousSprint = selectPreviousSprint;
window.onSprintDropdownChange = onSprintDropdownChange;
window.onDateRangeChange = onDateRangeChange;
window.resetAllFilters = resetAllFilters;
window.applyFilters = applyFilters;
window.saveFiltersToStorage = saveFiltersToStorage;
window.loadFiltersFromStorage = loadFiltersFromStorage;
window.clearUserFilter = clearUserFilter;
window.clearPriorityFilter = clearPriorityFilter;
window.clearDirectionFilter = clearDirectionFilter;
window.clearQurumFilter = clearQurumFilter;
window.clearStatusFilter = clearStatusFilter;
window.clearLabelFilter = clearLabelFilter;
window.setQurumFilter = setQurumFilter;
window.filterQurumByStatus = filterQurumByStatus;
window.filterTasksByDateStatus = filterTasksByDateStatus;
window.filterQurumList = filterQurumList;
window.clearQurumSearch = clearQurumSearch;
window.filterSprintComparison = filterSprintComparison;
window.selectDailyUser = selectDailyUser;
window.showDifficulties = showDifficulties;
window.showDueThisWeekTasks = showDueThisWeekTasks;
window.showDueThisWeekDoneTasks = showDueThisWeekDoneTasks;
window.showDueThisWeekOpenTasks = showDueThisWeekOpenTasks;
window.filterTasks = filterTasks;
window.filterEsdInnerStatus = filterEsdInnerStatus;
window.toggleDatePopover = toggleDatePopover;
window.closeDatePopover = closeDatePopover;
window.applyDatePopover = applyDatePopover;
window.onDateOverlayClick = onDateOverlayClick;
window.clearDatePopover = clearDatePopover;
window.selectViewedMonth = selectViewedMonth;
window.shiftDateCalendar = shiftDateCalendar;
window.showNoStartDateTasks = showNoStartDateTasks;
window.showNoDueDateTasks = showNoDueDateTasks;
window.renderStatusChart = renderStatusChart;
window.renderAssigneeChart = renderAssigneeChart;
window.renderEpicChart = renderEpicChart;
window.renderQurumChart = renderQurumChart;
window.renderLabelChart = renderLabelChart;
window.drawChart = drawChart;
window.drawStackedChart = drawStackedChart;
window.renderDailyProgress = renderDailyProgress;
window.renderStats = renderStats;
window.renderDifficulties = renderDifficulties;
window.getDifficultyCardHtml = getDifficultyCardHtml;
window.renderTaskList = renderTaskList;
window.toggleTaskChildren = toggleTaskChildren;
window.toggleSubtasks = toggleSubtasks;
window.toggleRelated = toggleRelated;
window.changePage = changePage;
window.showTaskListKind = showTaskListKind;
window.onTaskListSearchInput = onTaskListSearchInput;
window.clearTaskListSearch = clearTaskListSearch;
window.resetTaskListFilter = resetTaskListFilter;
window.renderWeeklyTasks = renderWeeklyTasks;
window.renderPausedTasks = renderPausedTasks;
window.renderSprintComparison = renderSprintComparison;
window.showUserActivity = showUserActivity;
window.loadDocxLib = loadDocxLib;
window.exportTasksToWord = exportTasksToWord;
window.renderAssessmentSections = renderAssessmentSections;
window.setAssessmentYear = setAssessmentYear;
window.setAssessmentYearForActiveTab = setAssessmentYearForActiveTab;
window.setAssessmentTab = setAssessmentTab;
window.focusAssessmentSection = focusAssessmentSection;
window.showAssessFullList = showAssessFullList;
window.setAssessmentSearch = setAssessmentSearch;
window.onAssessmentSearchInput = onAssessmentSearchInput;
window.clearAssessmentSearch = clearAssessmentSearch;
window.setAssessmentPage = setAssessmentPage;
window.toggleAssessmentDetail = toggleAssessmentDetail;
window.getActiveAssessmentTab = getActiveAssessmentTab;
window.openNk303 = openNk303;
window.closeNk303 = closeNk303;
window.onNk303OverlayClick = onNk303OverlayClick;
window.nk303Call = nk303Call;
window.syncNk303Route = syncNk303Route;
window.nk303MeqsedFilter = nk303MeqsedFilter;
window.nk303MeqsedSearch = nk303MeqsedSearch;
window.openDiagModal = openDiagModal;
window.closeDiagModal = closeDiagModal;
window.onDiagModalOverlayClick = onDiagModalOverlayClick;
window.onAssessMonthChange = onAssessMonthChange;
window.onAssessDatesChange = onAssessDatesChange;
window.applyAssessmentPeriod = applyAssessmentPeriod;
window.setMeqsedDashFilter = setMeqsedDashFilter;
window.setAssessListFilter = setAssessListFilter;
window.cycleAssessListSort = cycleAssessListSort;
window.setAssessListSort = setAssessListSort;
window.toggleAssessListFilterMenu = toggleAssessListFilterMenu;
window.closeAssessListFilterMenu = closeAssessListFilterMenu;
window.loadAssessmentCreatedRange = loadAssessmentCreatedRange;
window.logoutApp = logoutApp;
window.rememberCurrentProject = rememberCurrentProject;
window.onTeamChange = onTeamChange;

function placeNk303LaunchInHeader() {
    var tools = document.querySelector('.app-head-tools');
    if (!tools) return;
    var launches = document.querySelectorAll('.nk303-launch, #analyticsLaunchBtn');
    var i;
    for (i = 0; i < launches.length; i++) launches[i].remove();
    var link = document.createElement('a');
    link.href = '/diaqnostika';
    link.id = 'analyticsLaunchBtn';
    link.className = 'app-head-tool is-accent nk303-launch';
    link.title = 'Qiymətləndirmə analitikası';
    link.addEventListener('click', function(ev) {
        ev.preventDefault();
        if (typeof window.openNk303 === 'function') window.openNk303();
    });
    link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 19V5m0 14h16M8 15v4m5-8v8m5-11v11"/></svg><span>Qiymətləndirmə analitikası</span>';
    tools.insertBefore(link, tools.firstChild);
}

placeNk303LaunchInHeader();

async function onTeamChange() {
    await rememberCurrentProject();
    applyTeamScope();
}

Object.defineProperty(window, 'filteredTasks', {
    get: function() { return state.filteredTasks; },
    set: function(v) { state.filteredTasks = v; }
});

window.onload = async function() {
    var authed = await requireSession();
    if (!authed) return;
    var u = localStorage.getItem('jiraBaseUrl');
    var baseEl = document.getElementById('baseUrl');
    if (u && baseEl) baseEl.value = u;
    try { localStorage.removeItem('jiraPat'); } catch (e) {}
    try { localStorage.removeItem('jiraChatApiKey'); } catch (e2) {}
    var patEl = document.getElementById('pat');
    if (patEl) patEl.value = '';
    var serverCfg = {};
    try {
        serverCfg = await loadServerConfig() || {};
    } catch (e) {
        console.error('Server konfiqi yüklənmədi:', e);
    }
    try { applySessionChrome(serverCfg); } catch (e) { console.error(e); }
    try { initChat({ hasChatLlm: !!serverCfg.hasChatLlm }); } catch (e) { console.error(e); }
    var projectEl = document.getElementById('projectKey');
    var baseElNow = document.getElementById('baseUrl');
    if (projectEl) {
        projectEl.addEventListener('change', function() { rememberCurrentProject(); });
        projectEl.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                fetchDashboardData();
            }
        });
    }
    var baseUrl = baseElNow ? baseElNow.value : '';
    var projectKey = projectEl ? projectEl.value : '';
    if ((baseUrl || serverCfg.baseUrl) && (projectKey || serverCfg.projectKey) && (serverCfg.hasToken || state.hasServerToken)) {
        fetchDashboardData().catch(function (err) { console.error(err); });
    }
    try { renderAssessmentSections(); } catch (e) {}
    try { syncNk303Route(); } catch (e) {}
};
