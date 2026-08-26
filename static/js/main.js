import { state } from './state.js';
import { showToast, animateValue, normalizeStr, toggleSettings, getInitials, getIssueTypeIcon, getStatusColor, truncateChangeValue, getChangeFieldMeta, toggleDropdown } from './utils.js';
import { getParentIssue, resolveDirection, isKomplaynsName, hasKomplaynsComponent, belongsToDept, getStatusGroup, isDueThisWeek, getHistoricalStatus, getDifficultyField, hasValidDifficulty, parsePhaseDate, formatDateObj, getPhaseFieldText, getRawPhaseEntries, formatPhaseEntriesText, getQurumName, getDateStatus, getSprintDateRange, getSprintNames } from './model.js';
import { fetchJQL, fetchTodayChanges, fetchDashboardData, loadServerConfig } from './api.js';
import { populateSprintFilter, clearDateRangeInputs, updateSprintFilterState, selectLatestSprint, selectPreviousSprint, onSprintDropdownChange, resetAllFilters, applyFilters, saveFiltersToStorage, loadFiltersFromStorage, clearUserFilter, clearDirectionFilter, clearQurumFilter, setQurumFilter, filterQurumByStatus, filterTasksByDateStatus, filterQurumList, filterSprintComparison, selectDailyUser, showDifficulties, showDueThisWeekTasks, filterTasks, renderLazySection } from './filters.js';
import { renderStatusChart, renderAssigneeChart, renderEpicChart, renderQurumChart, renderLabelChart, drawChart, drawStackedChart, renderDailyProgress } from './charts.js';
import { renderStats, renderDifficulties, getDifficultyCardHtml, renderTaskList, toggleSubtasks, toggleRelated, changePage, renderWeeklyTasks, renderPausedTasks, renderSprintComparison, showUserActivity } from './render.js';
import { loadDocxLib, exportTasksToWord } from './report.js';

state.onSectionOpen = function(id) { renderLazySection(id, false); };

window.showToast = showToast;
window.animateValue = animateValue;
window.normalizeStr = normalizeStr;
window.toggleSettings = toggleSettings;
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
window.isDueThisWeek = isDueThisWeek;
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
window.resetAllFilters = resetAllFilters;
window.applyFilters = applyFilters;
window.saveFiltersToStorage = saveFiltersToStorage;
window.loadFiltersFromStorage = loadFiltersFromStorage;
window.clearUserFilter = clearUserFilter;
window.clearDirectionFilter = clearDirectionFilter;
window.clearQurumFilter = clearQurumFilter;
window.setQurumFilter = setQurumFilter;
window.filterQurumByStatus = filterQurumByStatus;
window.filterTasksByDateStatus = filterTasksByDateStatus;
window.filterQurumList = filterQurumList;
window.filterSprintComparison = filterSprintComparison;
window.selectDailyUser = selectDailyUser;
window.showDifficulties = showDifficulties;
window.showDueThisWeekTasks = showDueThisWeekTasks;
window.filterTasks = filterTasks;
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
window.toggleSubtasks = toggleSubtasks;
window.toggleRelated = toggleRelated;
window.changePage = changePage;
window.renderWeeklyTasks = renderWeeklyTasks;
window.renderPausedTasks = renderPausedTasks;
window.renderSprintComparison = renderSprintComparison;
window.showUserActivity = showUserActivity;
window.loadDocxLib = loadDocxLib;
window.exportTasksToWord = exportTasksToWord;

Object.defineProperty(window, 'filteredTasks', {
    get: function() { return state.filteredTasks; },
    set: function(v) { state.filteredTasks = v; }
});

window.onload = async function() {
    var u = localStorage.getItem('jiraBaseUrl'), p = localStorage.getItem('jiraPat'), k = localStorage.getItem('jiraProjectKey');
    if (u) document.getElementById('baseUrl').value = u;
    if (p) document.getElementById('pat').value = p;
    if (k) document.getElementById('projectKey').value = k;
    var cfg = { hasToken: false };
    try {
        cfg = await loadServerConfig();
    } catch (e) {
        console.error('Server konfiqi yüklənmədi:', e);
    }
    var baseUrl = document.getElementById('baseUrl').value;
    var pat = document.getElementById('pat').value;
    var projectKey = document.getElementById('projectKey').value;
    if (baseUrl && projectKey && (pat || cfg.hasToken)) fetchDashboardData();
    else toggleSettings();
};
