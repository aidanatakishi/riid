import { state } from './state.js';
import { animateValue, getChangeFieldMeta, getInitials, getStatusColor, normalizeStr, truncateChangeValue } from './utils.js';
import { belongsToDept, collectDueThisWeekDoneTasks, collectDueThisWeekTasks, countableWorkUnits, formatDateObj, getDateStatus, getDifficultyField, getHistoricalStatus, getParentIssue, getSprintDateRange, getSprintNames, getStatusGroup, hasValidDifficulty, isDueInSelectedWeek, isDueInSprint, isDueThisWeek, isSubtaskType, isTaskOrSubtaskType, isTaskType, sortSprintNames, wasCompletedInSprint } from './model.js';
import { filterSprintComparison } from './filters.js';
import { duePeriodLabel } from './report.js';

export function renderStats(tasks) {
    var validTasks = countableWorkUnits(tasks);
    var total = validTasks.length;
    var rejected = (tasks || []).filter(function(t) {
        return isTaskType(t) && getStatusGroup(t.fields.status.name || '') === 'rejected';
    }).length;

    var kpiMs = state.isInitialLoad ? 200 : 0;
    animateValue('totalTasks', 0, total, kpiMs);

    var done = validTasks.filter(function(t) { return getStatusGroup(t.fields.status.name || '') === 'done'; }).length;
    var completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    var openTasks = total - done;
    if (openTasks < 0) openTasks = 0;

    var compRateEl = document.getElementById('completionRate');
    var openTasksEl = document.getElementById('openTasks');
    if (compRateEl) compRateEl.innerText = completionRate + '%';
    if (openTasksEl) openTasksEl.innerText = openTasks;

    function hasDiff(t) {
        var g = getStatusGroup(t.fields.status.name || '');
        var diff = hasValidDifficulty(t);
        return diff && g !== 'done' && g !== 'rejected';
    }

    var blocked = validTasks.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name || '');
        return g === 'blocked' || hasDiff(t);
    }).length;
    
    var sprintT = validTasks.filter(function(t) { return getStatusGroup(t.fields.status.name || '') === 'progress' && !hasDiff(t); }).length;
    
    var dueWeekPool = collectDueThisWeekTasks();
    var sprintDueWeek = dueWeekPool.length;
    var sprintDueWeekDone = collectDueThisWeekDoneTasks().length;
    
    var planned = validTasks.filter(function(t) { return getStatusGroup(t.fields.status.name || '') === 'planned' && !hasDiff(t); }).length;
    var other = validTasks.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name || '');
        return g === 'other' && !hasDiff(t);
    }).length;

    var lateTasks = validTasks.filter(function(t) { return getDateStatus(t) === 'late'; }).length;

    var totalCompletionRateVal = total > 0 ? Math.round((done / total) * 100) : 0;
    var totalProgressBarEl = document.getElementById('totalProgressBar');
    var totalCompletionRateEl = document.getElementById('totalCompletionRate');
    if (totalProgressBarEl) totalProgressBarEl.style.width = totalCompletionRateVal + '%';
    if (totalCompletionRateEl) totalCompletionRateEl.innerText = totalCompletionRateVal + '%';

    animateValue('doneTasks', 0, done, kpiMs);
    animateValue('plannedTasks', 0, planned, kpiMs);
    animateValue('sprintTasks', 0, sprintT, kpiMs);
    animateValue('blockedTasks', 0, blocked, kpiMs);
    animateValue('rejectedTasks', 0, rejected, kpiMs);
    animateValue('otherTasks', 0, other, kpiMs);
    animateValue('lateTasks', 0, lateTasks, kpiMs);
    state.isInitialLoad = false;
    
    var dueWeekEl = document.getElementById('sprintTasksDueWeek');
    if (dueWeekEl) dueWeekEl.innerText = sprintDueWeek;
    var dueWeekDoneEl = document.getElementById('sprintTasksDueWeekDone');
    if (dueWeekDoneEl) dueWeekDoneEl.innerText = sprintDueWeekDone;
    var dueLabelEl = document.getElementById('duePeriodLabel');
    if (dueLabelEl) dueLabelEl.textContent = duePeriodLabel();

    var blockedCard = document.getElementById('blockedCard');
    if (blocked > 0 || rejected > 0) blockedCard.classList.add('pulse-danger');
    else blockedCard.classList.remove('pulse-danger');

    var otherCard = document.getElementById('otherCard');
    if (other > 0) {
        otherCard.classList.remove('hidden');
        document.getElementById('statsGrid').classList.remove('lg:grid-cols-4');
        document.getElementById('statsGrid').classList.add('lg:grid-cols-5');
    } else {
        otherCard.classList.add('hidden');
        document.getElementById('statsGrid').classList.remove('lg:grid-cols-5');
        document.getElementById('statsGrid').classList.add('lg:grid-cols-4');
    }
}

export function renderDifficulties(tasks) {
    var listDiv = document.getElementById('komplaynsList');
    listDiv.innerHTML = '';
    var blockedOrDiffTasks = countableWorkUnits(tasks).filter(function(t) {
        var g = getStatusGroup(t.fields.status.name);
        return (g === 'blocked' || hasValidDifficulty(t)) && g !== 'done' && g !== 'rejected';
    });
    var html = '';
    if (blockedOrDiffTasks.length > 0) {
        html += '<div class="mb-6"><div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
        blockedOrDiffTasks.forEach(function(t) { html += getDifficultyCardHtml(t, 'diff'); });
        html += '</div></div>';
    }
    if (html === '') html = '<p class="text-slate-400 text-sm col-span-2 text-center py-4">Çətinlik və ya bloklanma olunmuş tapşırıq yoxdur.</p>';
    listDiv.innerHTML = html;
}

export function getDifficultyCardHtml(t, type) {
    type = type || 'diff';
    var assignee = t.fields.assignee;
    var assigneeName = assignee ? assignee.displayName : 'Təyin edilməyib';
    var initials = getInitials(assigneeName);
    var avatarColor = assignee ? '#5b21b6' : '#94a3b8';
    var statusGroup = getStatusGroup(t.fields.status.name);
    var difficultyName = getDifficultyField(t);
    var statusBadgeHtml = '';
    if (type === 'reject' || statusGroup === 'rejected') {
        statusBadgeHtml = '<span class="font-mono text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 px-2 py-1 rounded">Status: İmtina</span>';
    } else if (statusGroup === 'blocked') {
        statusBadgeHtml = '<span class="font-mono text-xs font-bold bg-red-50 text-red-600 border border-red-100 px-2 py-1 rounded">Status: Bloklanıb</span>';
    }
    var diffHtml = '';
    if (difficultyName) {
        var normD = normalizeStr(difficultyName);
        var displayD = (normD !== 'none' && normD !== 'qeyd edilməyib' && normD !== 'qeyd edilmeyib' && normD !== 'null') ? difficultyName : null;
        if (displayD) diffHtml = '<div class="mt-2 bg-orange-50 border border-orange-100 rounded-lg p-2"><span class="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Çətinlik:</span><p class="text-xs text-orange-800 mt-0.5 break-words">' + displayD + '</p></div>';
    }
    return '<div onclick="window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')" class="task-item p-4 rounded-xl border border-slate-200 cursor-pointer fade-in"><div class="flex justify-between items-center mb-2"><div class="flex items-center gap-2 flex-wrap"><span class="font-mono text-xs font-bold text-[#5b21b6] bg-purple-50 px-2 py-1 rounded">' + t.key + '</span>' + statusBadgeHtml + '</div><span class="text-xs font-medium ' + getStatusColor(t.fields.status.name) + ' text-white px-2 py-1 rounded-full">' + t.fields.status.name + '</span></div><p class="text-sm text-slate-700 line-clamp-2 mb-2">' + t.fields.summary + '</p>' + diffHtml + '<div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100"><div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style="background-color: ' + avatarColor + ';">' + initials + '</div><span class="text-xs text-slate-500">' + assigneeName + '</span></div></div>';
}

function escapeTaskListHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setTaskListTabActive(view) {
    var tabs = [
        { id: 'taskListTabMixed', kind: 'mixed' },
        { id: 'taskListTabTasks', kind: 'tasks' },
        { id: 'taskListTabSubtasks', kind: 'subtasks' }
    ];
    tabs.forEach(function(tab) {
        var el = document.getElementById(tab.id);
        if (!el) return;
        var on = view === tab.kind;
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

function taskMatchesListSearch(t, query) {
    var q = normalizeStr(query || '');
    if (!q) return true;
    if (!t || !t.fields) return false;
    var hay = [
        t.key,
        t.fields.summary,
        t.fields.status && t.fields.status.name,
        t.fields.assignee && t.fields.assignee.displayName,
        t.fields.issuetype && t.fields.issuetype.name
    ].map(function(v) { return normalizeStr(v || ''); }).join(' ');
    return hay.indexOf(q) !== -1;
}

function taskListStatusClass(name) {
    return 'assess-status assess-status--' + getStatusGroup(name || '');
}

function syncTaskListSearchUi() {
    var input = document.getElementById('taskListSearchInput');
    var clearBtn = document.getElementById('taskListSearchClear');
    var q = state.taskListSearch || '';
    if (input && input.value !== q) input.value = q;
    if (clearBtn) clearBtn.classList.toggle('hidden', !q);
}

function resolveTaskListIssue(issue) {
    if (!issue) return null;
    if (issue.key && state.issueIndex && state.issueIndex[issue.key]) return state.issueIndex[issue.key];
    return issue;
}

function flattenTaskListSubtasks(source) {
    var seen = {};
    var subs = [];
    function addSub(issue) {
        var full = resolveTaskListIssue(issue);
        if (!full || !full.key || seen[full.key]) return;
        seen[full.key] = true;
        subs.push(full);
    }
    (source || []).forEach(function(t) {
        if (!t) return;
        if (isSubtaskType(t)) addSub(t);
        var nested = (t.fields && t.fields.subtasks) || [];
        nested.forEach(function(sub) {
            if (sub) addSub(sub);
        });
    });
    return subs;
}

function uniqueTaskListCounts(source, flattenedSubs) {
    var seen = {};
    var taskCount = 0;
    (source || []).forEach(function(t) {
        if (!t || !t.key || seen[t.key]) return;
        seen[t.key] = true;
        if (isTaskType(t)) taskCount++;
    });
    var subCount = (flattenedSubs || flattenTaskListSubtasks(source)).length;
    return { tasks: taskCount, subtasks: subCount };
}

function hideNestedSubtasks(sourceTasks) {
    var listKeySet = {};
    var nestedUnderShownParent = {};
    sourceTasks.forEach(function(t) {
        if (!t || !t.key) return;
        listKeySet[t.key] = true;
        if (isSubtaskType(t) || !t.fields) return;
        (t.fields.subtasks || []).forEach(function(sub) {
            if (sub && sub.key) nestedUnderShownParent[sub.key] = true;
        });
        (t.fields.issuelinks || []).forEach(function(link) {
            var linked = link.outwardIssue || link.inwardIssue;
            if (linked && linked.key) nestedUnderShownParent[linked.key] = true;
        });
    });
    return sourceTasks.filter(function(t) {
        if (!isSubtaskType(t)) return true;
        var parent = getParentIssue(t);
        if (parent && parent.key && listKeySet[parent.key]) return false;
        if (nestedUnderShownParent[t.key]) return false;
        return true;
    });
}

export function renderTaskList(tasks, title, opts) {
    opts = opts || {};
    if (!opts.keepView) {
        state.taskListSource = (tasks || []).slice();
        state.taskListTitle = title || 'Tapşırıqların Siyahısı';
        state.taskListView = 'mixed';
        state.taskListSearch = '';
        state.taskListKeepNested = !!opts.keepNested;
        state.currentPage = 1;
    }
    var sourceTasks = (state.taskListSource || []).filter(isTaskOrSubtaskType);
    var displayTitle = state.taskListTitle || title || 'Tapşırıqların Siyahısı';
    var flattenedSubs = flattenTaskListSubtasks(sourceTasks);
    var counts = uniqueTaskListCounts(sourceTasks, flattenedSubs);
    var allCount = counts.tasks + counts.subtasks;
    var taskCountEl = document.getElementById('taskListTaskCount');
    var subCountEl = document.getElementById('taskListSubtaskCount');
    var allCountEl = document.getElementById('taskListAllCount');
    var headerCountEl = document.getElementById('taskListHeaderCount');
    if (taskCountEl) taskCountEl.innerText = counts.tasks;
    if (subCountEl) subCountEl.innerText = counts.subtasks;
    if (allCountEl) allCountEl.innerText = allCount;
    if (headerCountEl) headerCountEl.innerText = allCount;
    setTaskListTabActive(state.taskListView || 'mixed');
    syncTaskListSearchUi();

    var listTasks;
    if (state.taskListView === 'tasks') {
        listTasks = sourceTasks.filter(isTaskType);
    } else if (state.taskListView === 'subtasks') {
        listTasks = flattenedSubs;
    } else if (state.taskListKeepNested) {
        listTasks = sourceTasks;
    } else {
        listTasks = hideNestedSubtasks(sourceTasks);
    }
    var searchQ = state.taskListSearch || '';
    if (searchQ) listTasks = listTasks.filter(function(t) { return taskMatchesListSearch(t, searchQ); });
    state.currentDisplayTasks = listTasks;

    var titleEl = document.getElementById('taskListTitle');
    if (titleEl) titleEl.innerText = displayTitle;
    var metaEl = document.getElementById('taskListMeta');
    if (metaEl) {
        if (searchQ) {
            metaEl.textContent = listTasks.length + ' nəticə tapıldı';
            metaEl.classList.add('is-search');
        } else {
            var viewLabel = state.taskListView === 'subtasks' ? 'alt-tapşırıq' : (state.taskListView === 'tasks' ? 'tapşırıq' : 'qeyd');
            metaEl.textContent = listTasks.length + ' ' + viewLabel;
            metaEl.classList.remove('is-search');
        }
    }
    var listDiv = document.getElementById('taskList');
    var pagDiv = document.getElementById('taskPagination');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    if (pagDiv) pagDiv.innerHTML = '';
    if (listTasks.length === 0) {
        var emptyMsg = searchQ
            ? 'Axtarışa uyğun qeyd tapılmadı.'
            : (state.taskListView === 'subtasks'
                ? 'Bu filtrə uyğun alt-tapşırıq tapılmadı.'
                : 'Bu filtrə uyğun tapşırıq tapılmadı.');
        listDiv.innerHTML = '<div class="assess-hub-empty"><p>' + emptyMsg + '</p></div>';
        return;
    }
    var totalPages = Math.ceil(listTasks.length / state.tasksPerPage);
    if (state.currentPage > totalPages) state.currentPage = 1;
    if (state.currentPage < 1) state.currentPage = 1;
    var start = (state.currentPage - 1) * state.tasksPerPage;
    var end = start + state.tasksPerPage;
    var paginatedTasks = listTasks.slice(start, end);

    function fmtDate(dateStr) {
        if (!dateStr) return '—';
        try {
            var d = new Date(dateStr);
            return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (e) { return '—'; }
    }

    var rows = paginatedTasks.map(function(t) {
        var fields = t.fields || {};
        var assignee = fields.assignee;
        var assigneeName = assignee ? assignee.displayName : 'Təyin edilməyib';
        var initials = getInitials(assigneeName);
        var avatarColor = assignee ? '#5b21b6' : '#94a3b8';
        var hasSubtasks = fields.subtasks && fields.subtasks.length > 0;
        var hasIssueLinks = fields.issuelinks && fields.issuelinks.length > 0;
        var issueTypeName = fields.issuetype ? fields.issuetype.name : '';
        var isSubtask = isSubtaskType(t);
        var statusName = fields.status && fields.status.name ? fields.status.name : 'Naməlum';
        var browseUrl = state.currentBaseUrl + '/browse/' + t.key;
        var toggleButtonsHtml = '';
        var nestedHtml = '';

        var mainRowClick = 'window.open(\'' + browseUrl + '\', \'_blank\')';
        if (!isSubtask && hasSubtasks) mainRowClick = 'toggleSubtasks(\'' + t.key + '\')';
        else if (!isSubtask && hasIssueLinks) mainRowClick = 'toggleRelated(\'' + t.key + '\')';

        if (hasSubtasks && !isSubtask) {
            toggleButtonsHtml += '<button type="button" class="tl-chip" onclick="event.stopPropagation(); toggleSubtasks(\'' + t.key + '\')">Alt · ' + fields.subtasks.length + '</button>';
            nestedHtml += '<div id="subtasks-' + t.key + '" class="tl-nested hidden">';
            nestedHtml += '<div class="tl-nested-label">Alt-tapşırıqlar</div>';
            nestedHtml += fields.subtasks.map(function(sub) {
                var subStatusName = sub.fields && sub.fields.status ? sub.fields.status.name : 'Naməlum';
                return '<a class="tl-nested-item" href="' + state.currentBaseUrl + '/browse/' + escapeTaskListHtml(sub.key) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">'
                    + '<span class="tl-key">' + escapeTaskListHtml(sub.key) + '</span>'
                    + '<span class="' + taskListStatusClass(subStatusName) + '">' + escapeTaskListHtml(subStatusName) + '</span>'
                    + '<span class="tl-nested-summary">' + escapeTaskListHtml(sub.fields && sub.fields.summary ? sub.fields.summary : '') + '</span>'
                    + '</a>';
            }).join('');
            nestedHtml += '</div>';
        }
        if (hasIssueLinks && !isSubtask) {
            toggleButtonsHtml += '<button type="button" class="tl-chip tl-chip--link" onclick="event.stopPropagation(); toggleRelated(\'' + t.key + '\')">Əlaqəli · ' + fields.issuelinks.length + '</button>';
            nestedHtml += '<div id="related-' + t.key + '" class="tl-nested hidden">';
            nestedHtml += '<div class="tl-nested-label">Əlaqəli tapşırıqlar</div>';
            nestedHtml += fields.issuelinks.map(function(link) {
                var linkedIssue = link.outwardIssue || link.inwardIssue;
                if (!linkedIssue) return '';
                var linkStatus = linkedIssue.fields && linkedIssue.fields.status ? linkedIssue.fields.status.name : 'Naməlum';
                var linkSummary = linkedIssue.fields && linkedIssue.fields.summary ? linkedIssue.fields.summary : '';
                var linkType = link.type ? (link.outwardIssue ? link.type.outward : link.type.inward) : 'əlaqəli';
                return '<a class="tl-nested-item" href="' + state.currentBaseUrl + '/browse/' + escapeTaskListHtml(linkedIssue.key) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">'
                    + '<span class="tl-key">' + escapeTaskListHtml(linkedIssue.key) + '</span>'
                    + '<span class="' + taskListStatusClass(linkStatus) + '">' + escapeTaskListHtml(linkStatus) + '</span>'
                    + '<span class="tl-nested-summary">' + escapeTaskListHtml(linkSummary) + '</span>'
                    + '<span class="tl-nested-rel">' + escapeTaskListHtml(linkType) + '</span>'
                    + '</a>';
            }).join('');
            nestedHtml += '</div>';
        }

        var dueDateRaw = fields['customfield_10807'] || fields['duedate'];
        var resolvedDateRaw = fields['resolutiondate'];
        var statusGroup = getStatusGroup(statusName);
        var isDone = statusGroup === 'done';
        var dateStatus = getDateStatus(t);
        var dateBits = '<div class="tl-dates">';
        dateBits += '<span>Bitmə <b>' + fmtDate(dueDateRaw) + '</b></span>';
        if (isDone) dateBits += '<span class="tl-date-done">Tamamlandı <b>' + fmtDate(resolvedDateRaw) + '</b></span>';
        else if (dateStatus === 'late') dateBits += '<span class="tl-date-late">Gecikib</span>';
        else if (dateStatus === 'early') dateBits += '<span class="tl-date-early">Öncə bitə bilər</span>';
        dateBits += '</div>';

        return '<div class="tl-row">'
            + '<div class="tl-row-main" onclick="' + mainRowClick + '">'
            + '<div class="tl-avatar" style="background-color:' + avatarColor + '">' + escapeTaskListHtml(initials) + '</div>'
            + '<div class="tl-main">'
            + '<div class="tl-topline"><span class="tl-key">' + escapeTaskListHtml(t.key) + '</span>'
            + '<span class="' + taskListStatusClass(statusName) + '">' + escapeTaskListHtml(statusName) + '</span>'
            + (issueTypeName ? '<span class="tl-type">' + escapeTaskListHtml(issueTypeName) + '</span>' : '')
            + '</div>'
            + '<p class="tl-summary">' + escapeTaskListHtml(fields.summary || '') + '</p>'
            + '<p class="tl-assignee">' + escapeTaskListHtml(assigneeName) + '</p>'
            + '</div>'
            + '<div class="tl-side">' + toggleButtonsHtml + dateBits + '</div>'
            + '<a class="tl-open" href="' + browseUrl + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" aria-label="Jira-da aç">'
            + '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>'
            + '</a>'
            + '</div>'
            + nestedHtml
            + '</div>';
    });
    listDiv.innerHTML = rows.join('');

    if (pagDiv && totalPages > 1) {
        var html = '';
        if (state.currentPage > 1) html += '<button type="button" class="tl-page-btn" onclick="changePage(' + (state.currentPage - 1) + ')">Əvvəlki</button>';
        html += '<span class="tl-page-label">Səhifə ' + state.currentPage + ' / ' + totalPages + '</span>';
        if (state.currentPage < totalPages) html += '<button type="button" class="tl-page-btn" onclick="changePage(' + (state.currentPage + 1) + ')">Növbəti</button>';
        pagDiv.innerHTML = html;
    }
}

export function toggleSubtasks(key) {
    var el = document.getElementById('subtasks-' + key);
    if (el) el.classList.toggle('hidden');
}

export function toggleRelated(key) {
    var el = document.getElementById('related-' + key);
    if (el) el.classList.toggle('hidden');
}

export function changePage(page) {
    state.currentPage = page;
    renderTaskList(state.taskListSource, state.taskListTitle, { keepView: true });
}

export function openTaskListSection() {
    var listEl = document.getElementById('taskListContent');
    if (!listEl) return;
    listEl.classList.remove('hidden');
    listEl.classList.add('slide-down');
    var icon = document.getElementById('icon-taskListContent');
    if (icon) icon.style.transform = 'rotate(180deg)';
    listEl.scrollIntoView({ behavior: 'smooth' });
}

export function showTaskListKind(kind) {
    if (typeof event !== 'undefined' && event && event.stopPropagation) event.stopPropagation();
    state.taskListView = kind || 'mixed';
    state.currentPage = 1;
    if (!state.taskListSource.length && state.filteredTasks && state.filteredTasks.length) {
        state.taskListSource = state.filteredTasks.slice();
    }
    renderTaskList(state.taskListSource, state.taskListTitle, { keepView: true });
    openTaskListSection();
}

export function onTaskListSearchInput(value) {
    state.taskListSearch = value || '';
    state.currentPage = 1;
    renderTaskList(state.taskListSource, state.taskListTitle, { keepView: true });
}

export function clearTaskListSearch() {
    state.taskListSearch = '';
    state.currentPage = 1;
    renderTaskList(state.taskListSource, state.taskListTitle, { keepView: true });
}

export function resetTaskListFilter() {
    state.taskListSearch = '';
    state.taskListView = 'mixed';
    state.currentPage = 1;
    renderTaskList(state.filteredTasks, 'Tapşırıqların Siyahısı');
}

export function renderWeeklyTasks() {
    var source = countableWorkUnits(state.filteredTasks);
    var planned = source.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; });
    var list = document.getElementById('weeklyTaskList'); 
    if (!list) return;
    list.innerHTML = '';
    if (planned.length === 0) { list.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Statusu "Planlaşdırılıb" olan tapşırıq yoxdur.</p>'; }
    else {
        var weeklyHtml = '';
        planned.forEach(function(t) {
            weeklyHtml += '<div onclick="window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')" class="task-item p-3 rounded-xl border border-slate-200 cursor-pointer flex items-center justify-between fade-in"><div class="mr-2 min-w-0"><span class="font-mono text-xs font-bold text-[#5b21b6]">' + t.key + '</span><p class="text-sm text-slate-600 mt-1 truncate">' + t.fields.summary + '</p></div><span class="text-xs ' + getStatusColor(t.fields.status.name) + ' text-white px-2 py-1 rounded-full whitespace-nowrap">' + t.fields.status.name + '</span></div>';
        });
        list.innerHTML = weeklyHtml;
    }
    document.getElementById('weeklyDiff').innerText = 'Cəmi ' + planned.length + ' tapşırıq';
}

export function renderPausedTasks() {
    var pausedTasks = (state.sprintDateFiltered || []).filter(function(t) {
        if (!isTaskType(t)) return false;
        var statusNorm = normalizeStr(t.fields.status.name);
        var isPaused = statusNorm.includes('dayandır') || statusNorm.includes('dayandir') || statusNorm.includes('müvəqqəti') || statusNorm.includes('muveqqeti') || statusNorm.includes('paused');
        return isPaused && belongsToDept(t);
    });
    var list = document.getElementById('pausedTaskList'); 
    list.innerHTML = '';
    document.getElementById('pausedCount').innerText = pausedTasks.length + ' tapşırıq';
    
    if (pausedTasks.length === 0) { 
        list.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Müvəqqəti dayandırılmış tapşırıq yoxdur.</p>'; 
    } else {
        var pausedHtml = '';
        pausedTasks.forEach(function(t) {
            pausedHtml += '<div onclick="window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')" class="task-item p-3 rounded-xl border border-slate-200 cursor-pointer flex items-center justify-between fade-in"><div class="mr-2 min-w-0"><span class="font-mono text-xs font-bold text-[#5b21b6]">' + t.key + '</span><p class="text-sm text-slate-600 mt-1 truncate">' + t.fields.summary + '</p></div><span class="text-xs ' + getStatusColor(t.fields.status.name) + ' text-white px-2 py-1 rounded-full whitespace-nowrap">' + t.fields.status.name + '</span></div>';
        });
        list.innerHTML = pausedHtml;
    }
}

export function renderSprintComparison() {
    var root = document.getElementById('sprintComparison');
    if (!root) return;

    if (state.sprintCompareChart) {
        state.sprintCompareChart.destroy();
        state.sprintCompareChart = null;
    }
    var oldCanvas = document.getElementById('sprintCompareChart');
    if (oldCanvas && typeof Chart !== 'undefined') {
        var existingChart = Chart.getChart(oldCanvas);
        if (existingChart) existingChart.destroy();
    }

    var map = {};
    state.allTasks.forEach(function(t) { getSprintNames(t).forEach(function(n) { if (!map[n]) map[n] = []; if (!map[n].includes(t)) map[n].push(t); }); });
    var names = sortSprintNames(Object.keys(map));
    if (names.length === 0) {
        root.innerHTML = '<p class="sc-empty">Sprint məlumatı yoxdur.</p>';
        return;
    }

    var sprintSelectEl = document.getElementById('sprintFilter');
    var sprintVal = sprintSelectEl ? sprintSelectEl.value : 'all';
    var curName, prevName;

    if (sprintVal && sprintVal !== 'all') {
        var selIdx = names.indexOf(sprintVal);
        if (selIdx !== -1) {
            curName = names[selIdx];
            prevName = (selIdx + 1 < names.length) ? names[selIdx + 1] : null;
        } else {
            curName = names[0];
            prevName = names[1] || null;
        }
    } else {
        curName = names[0];
        prevName = names[1] || null;
    }

    state.sprintDisplayMap = {};
    if (curName) state.sprintDisplayMap[curName] = 'Seçilmiş sprint';
    if (prevName) state.sprintDisplayMap[prevName] = 'Əvvəlki sprint';

    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    var useDateFilter = !!((startEl && startEl.value) || (endEl && endEl.value));
    var curTasks;
    if (useDateFilter || (sprintVal && sprintVal !== 'all' && curName === sprintVal)) {
        curTasks = (state.sprintDateFiltered || []).slice();
    } else {
        curTasks = map[curName] || [];
    }
    var prevTasks = prevName ? (map[prevName] || []) : [];

    function weekDueFn(jName, isPrev) {
        if (getSprintDateRange(jName)) return function(t) { return isDueInSprint(t, jName); };
        if (isPrev) return function() { return false; };
        return isDueInSelectedWeek;
    }

    function scEscape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sprintRangeLabel(jName) {
        var range = jName ? getSprintDateRange(jName) : null;
        if (!range || !range.start || !range.end) return '';
        return formatDateObj(range.start) + ' – ' + formatDateObj(range.end);
    }

    function pctOf(n, d) {
        if (!d) return 0;
        var p = Math.round((n / d) * 100);
        if (p < 0) return 0;
        if (p > 100) return 100;
        return p;
    }

    function computeStats(jName, tasks, isPrev) {
        if (!jName || !tasks || tasks.length === 0) {
            return { jName: jName, isPrev: isPrev, empty: true, total: 0, done: 0, co: 0, dueCount: 0, dueDone: 0 };
        }
        function statusForCard(t) {
            return isPrev ? getHistoricalStatus(t, curName, jName) : t.fields.status.name;
        }
        var validTasks = tasks.filter(isTaskType).filter(function(t) {
            var st = normalizeStr(statusForCard(t));
            var isRejected = getStatusGroup(st) === 'rejected';
            var isBacklog = st.includes('başlanmamış') || st.includes('baslanmamis');
            var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
            return !isRejected && !isBacklog && !isPaused;
        });

        var total = validTasks.length;
        var done = validTasks.filter(function(t) {
            return getStatusGroup(statusForCard(t)) === 'done';
        }).length;
        var co = total - done;
        var isDue = weekDueFn(jName, isPrev);
        var dueCount = validTasks.filter(function(t) {
            return isDue(t) && getStatusGroup(statusForCard(t)) !== 'rejected';
        }).length;
        var dueDone = validTasks.filter(function(t) {
            return isDue(t) && getStatusGroup(statusForCard(t)) === 'done';
        }).length;
        return { jName: jName, isPrev: isPrev, empty: false, total: total, done: done, co: co, dueCount: dueCount, dueDone: dueDone };
    }

    function deltaHtml(curVal, prevVal, tone) {
        if (prevVal == null) return '';
        var d = curVal - prevVal;
        var cls = 'is-flat';
        var sign = d > 0 ? '+' : '';
        if (d !== 0) {
            if (tone === 'good-up') cls = d > 0 ? 'is-good' : 'is-bad';
            else if (tone === 'good-down') cls = d < 0 ? 'is-good' : 'is-bad';
            else cls = d > 0 ? 'is-up' : 'is-down';
        }
        return '<span class="sc-delta ' + cls + '">' + sign + d + '</span>';
    }

    function metricRow(stats, type, label, value, barPct, tone, tip, extra, delta) {
        var aria = (stats.isPrev ? 'Əvvəlki sprint' : 'Seçilmiş sprint') + ', ' + label + ': ' + value + '. Siyahıda aç';
        return '<button type="button" class="sc-metric sc-metric--' + type + '" data-sprint="' + scEscape(stats.jName) + '" data-sc-type="' + type + '" data-tip="' + scEscape(tip) + '" aria-label="' + scEscape(aria) + '">'
            + '<span class="sc-metric-top">'
            + '<span class="sc-metric-label">' + scEscape(label) + '</span>'
            + '<span class="sc-metric-nums">'
            + (delta || '')
            + '<span class="sc-metric-value">' + value + '</span>'
            + '</span>'
            + '</span>'
            + '<span class="sc-track" aria-hidden="true"><span class="sc-bar" style="width:' + barPct + '%"></span></span>'
            + (extra ? '<span class="sc-metric-extra">' + extra + '</span>' : '')
            + '</button>';
    }

    function weekCard(stats, dName, coTitle, compare) {
        if (!stats || !stats.jName || stats.empty) {
            return '<article class="sc-week sc-week--empty">'
                + '<div class="sc-week-head"><span class="sc-week-badge">' + scEscape(dName) + '</span></div>'
                + '<p class="sc-empty">Məlumat yoxdur.</p>'
                + '</article>';
        }
        var showDelta = compare && !compare.empty;
        var rate = pctOf(stats.done, stats.total);
        var dueRate = pctOf(stats.dueDone, stats.dueCount);
        var range = sprintRangeLabel(stats.jName);
        var selectedCls = stats.isPrev ? '' : ' is-selected';
        return '<article class="sc-week' + selectedCls + '">'
            + '<div class="sc-week-head">'
            + '<div class="sc-week-copy">'
            + '<span class="sc-week-badge">' + scEscape(dName) + '</span>'
            + '<h3 class="sc-week-title">' + scEscape(stats.jName) + '</h3>'
            + (range ? '<p class="sc-week-dates">' + scEscape(range) + '</p>' : '')
            + '</div>'
            + '<button type="button" class="sc-ring" data-sprint="' + scEscape(stats.jName) + '" data-sc-type="done" style="--p:' + rate + '" aria-label="' + scEscape(dName + ', tamamlanma ' + rate + '%. Tamamlanmış tapşırıqları aç') + '" data-tip="Tamamlanma: ' + rate + '% — klikləyib tamamlanmışları açın">'
            + '<span class="sc-ring-inner"><span class="sc-ring-value">' + rate + '%</span><span class="sc-ring-label">tamamlanıb</span></span>'
            + '</button>'
            + '</div>'
            + '<div class="sc-metrics">'
            + metricRow(stats, 'all', 'Ümumi Tapşırıq', stats.total, 100, 'neutral', 'Sprintə daxil olan iş vahidləri. Klikləyib siyahını açın.', '', showDelta ? deltaHtml(stats.total, compare.total, 'neutral') : '')
            + metricRow(stats, 'done', 'Tamamlanmış', stats.done, pctOf(stats.done, stats.total), 'good', 'Tamamlanmış tapşırıqlar. Klikləyib siyahını açın.', (stats.total ? rate + '% ümumi' : ''), showDelta ? deltaHtml(stats.done, compare.done, 'good-up') : '')
            + metricRow(stats, 'due', 'Həftə ərzində bitməli olan', stats.dueCount, pctOf(stats.dueCount, stats.total), 'due', 'Bu həftə/sprint müddətində bitməli olanlar. Klikləyib siyahını açın.', '', showDelta ? deltaHtml(stats.dueCount, compare.dueCount, 'neutral') : '')
            + metricRow(stats, 'dueDone', 'Edildi', stats.dueDone, stats.dueCount ? dueRate : 0, 'good', 'Bitməli olanlardan tamamlananlar. Klikləyib siyahını açın.', (stats.dueCount ? stats.dueDone + ' / ' + stats.dueCount + ' bitməli' : 'Bitməli tapşırıq yoxdur'), showDelta ? deltaHtml(stats.dueDone, compare.dueDone, 'good-up') : '')
            + metricRow(stats, 'carryover', coTitle, stats.co, pctOf(stats.co, stats.total), 'warn', coTitle + '. Klikləyib siyahını açın.', '', showDelta ? deltaHtml(stats.co, compare.co, 'good-down') : '')
            + '</div>'
            + '</article>';
    }

    var prevStats = computeStats(prevName, prevTasks, true);
    var curStats = computeStats(curName, curTasks, false);

    var html = '<p class="sc-hint">Rəqəmə, çubuğa və ya həftə kartına klikləyin — tapşırıqlar <strong>Tapşırıqların Siyahısı</strong>nda açılır.</p>'
        + '<div class="sc-weeks">'
        + weekCard(prevStats, 'Əvvəlki sprint', 'Növbəti sprintə keçən', null)
        + '<div class="sc-vs" aria-hidden="true"><span>qarşı</span></div>'
        + weekCard(curStats, 'Seçilmiş sprint', 'İcrası davam edən', prevStats.empty ? null : prevStats)
        + '</div>';

    var chartSprints = [];
    if (!prevStats.empty) chartSprints.push({ stats: prevStats, label: 'Əvvəlki sprint', color: '#c4b5fd' });
    if (!curStats.empty) chartSprints.push({ stats: curStats, label: 'Seçilmiş sprint', color: '#5b21b6' });
    if (chartSprints.length) {
        html += '<div class="sc-chart-panel">'
            + '<div class="sc-chart-head"><h4>Göstəricilərin müqayisəsi</h4><p>Çubuğa klikləyib həmin həftənin tapşırıqlarını açın</p></div>'
            + '<div class="sc-chart-scroll"><div class="sc-chart-box"><canvas id="sprintCompareChart"></canvas></div></div>'
            + '</div>';
    }

    root.innerHTML = html;
    root.onclick = function(e) {
        var btn = e.target.closest('[data-sc-type]');
        if (!btn || !root.contains(btn)) return;
        var name = btn.getAttribute('data-sprint');
        var type = btn.getAttribute('data-sc-type');
        if (name && type) filterSprintComparison(name, type);
    };

    if (!chartSprints.length || typeof Chart === 'undefined') return;

    var canvas = document.getElementById('sprintCompareChart');
    if (!canvas) return;
    var metricKeys = ['total', 'done', 'dueCount', 'dueDone', 'co'];
    var metricTypes = ['all', 'done', 'due', 'dueDone', 'carryover'];
    var metricLabels = ['Ümumi', 'Tamamlanmış', 'Bitməli', 'Edildi', 'Davam edən'];
    var datasets = chartSprints.map(function(item) {
        return {
            label: item.label,
            data: metricKeys.map(function(k) { return item.stats[k]; }),
            backgroundColor: item.color,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 28,
            categoryPercentage: 0.72,
            barPercentage: 0.86,
            sprintName: item.stats.jName
        };
    });
    var barValuesPlugin = {
        id: 'sprintCompareBarValues',
        afterDatasetsDraw: function(chart) {
            var c = chart.ctx;
            c.save();
            c.font = '600 11px Inter';
            c.fillStyle = '#475569';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            chart.data.datasets.forEach(function(ds, di) {
                var meta = chart.getDatasetMeta(di);
                if (!meta || !meta.data) return;
                meta.data.forEach(function(bar, i) {
                    var n = ds.data[i];
                    if (n == null) return;
                    c.fillText(String(n), bar.x, bar.y - 3);
                });
            });
            c.restore();
        }
    };
    state.sprintCompareChart = new Chart(canvas, {
        type: 'bar',
        data: { labels: metricLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 18, right: 8, left: 4, bottom: 0 } },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: { usePointStyle: true, pointStyle: 'rectRounded', padding: 14, boxWidth: 10, font: { family: 'Inter', size: 12, weight: '600' }, color: '#475569' }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    padding: 10,
                    cornerRadius: 8,
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
                    callbacks: {
                        title: function(items) {
                            return items && items[0] ? items[0].label : '';
                        },
                        label: function(ctx) {
                            return ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y || 0);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 11, weight: '600' }, color: '#64748b' }
                },
                y: {
                    beginAtZero: true,
                    grace: '12%',
                    ticks: { precision: 0, font: { family: 'Inter', size: 11 }, color: '#94a3b8' },
                    grid: { color: 'rgba(226, 232, 240, 0.9)', drawBorder: false }
                }
            },
            onHover: function(e, el) { if (e.native && e.native.target) e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            onClick: function(e, els) {
                if (!els.length) return;
                var hit = els[0];
                var ds = datasets[hit.datasetIndex];
                var type = metricTypes[hit.index];
                if (ds && ds.sprintName && type) filterSprintComparison(ds.sprintName, type);
            }
        },
        plugins: [barValuesPlugin]
    });
    requestAnimationFrame(function() {
        if (state.sprintCompareChart) state.sprintCompareChart.resize();
    });
}

export function showUserActivity(userName, tasks) {
    sessionStorage.setItem('selectedDailyUser', userName);
    document.querySelectorAll('.daily-user-card').forEach(function(el) {
        if (el.dataset.user === userName) { el.classList.add('bg-white', 'border-slate-200', 'shadow-sm'); el.classList.remove('border-transparent'); }
        else { el.classList.remove('bg-white', 'border-slate-200', 'shadow-sm'); el.classList.add('border-transparent'); }
    });

    if (!state.dailyDateRange) return;
    var rangeStart = state.dailyDateRange.start;
    var rangeEnd = state.dailyDateRange.end;
    var rangeLabel = state.dailyDateRange.label;

    var userActivityDiv = document.getElementById('dailyUserActivity');
    var activityHtml = '<div class="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100"><p class="text-sm font-bold text-slate-700">' + userName + '</p><span class="text-xs text-slate-500"> - ' + tasks.length + ' taskda dəyişiklik</span></div>';

    if (tasks.length === 0) {
        activityHtml += '<p class="text-xs text-slate-400 text-center py-4">' + rangeLabel + ' üçün dəyişiklik yoxdur.</p>';
        userActivityDiv.innerHTML = activityHtml;
        return;
    }

    var EXCLUDED_FIELDS = ['rank', 'flagged', 'aggregated'];

    function inRange(dateStr) {
        var d = new Date(dateStr);
        return d >= rangeStart && d <= rangeEnd;
    }

    var taskWithChanges = tasks.map(function(t) {
        var periodChanges = [];
        var createdDate = new Date(t.fields.created);
        var isCreatedInPeriod = createdDate >= rangeStart && createdDate <= rangeEnd;
        var latestTime = t.fields.updated;

        if (t.changelog && t.changelog.histories) {
            t.changelog.histories.forEach(function(change) {
                if (!inRange(change.created)) return;
                if (new Date(change.created) > new Date(latestTime)) latestTime = change.created;
                if (change.items && change.items.length > 0) {
                    var meaningfulItems = change.items.filter(function(item) {
                        var fieldName = (item.field || '').toLowerCase();
                        return !EXCLUDED_FIELDS.some(function(ex) { return fieldName.indexOf(ex) !== -1; });
                    });
                    if (meaningfulItems.length > 0) periodChanges.push({ created: change.created, items: meaningfulItems });
                }
            });
        }

        if (isCreatedInPeriod && new Date(t.fields.created) > new Date(latestTime)) latestTime = t.fields.created;
        return { task: t, changes: periodChanges, isCreatedInPeriod: isCreatedInPeriod, latestTime: latestTime };
    });

    taskWithChanges.sort(function(a, b) { return new Date(b.latestTime) - new Date(a.latestTime); });

    activityHtml += '<div class="relative space-y-3">';
    taskWithChanges.forEach(function(item, index) {
        var t = item.task;
        var changes = item.changes;
        var isCreatedInPeriod = item.isCreatedInPeriod;
        var realTime = new Date(item.latestTime).toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        var changeBadges = [];
        var dotColor = 'bg-indigo-500';

        if (isCreatedInPeriod) {
            var createdTime = new Date(t.fields.created).toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            changeBadges.push('<div class="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-md px-2 py-1 text-purple-700"><svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg><span class="text-[9px] font-bold">Yeni task yaratdı</span><span class="text-[9px] opacity-50 ml-1">' + createdTime + '</span></div>');
            dotColor = 'bg-purple-500';
        }

        if (changes.length > 0) {
            changes.forEach(function(change) {
                if (!change.items || change.items.length === 0) return;
                var entryTime = new Date(change.created).toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                change.items.forEach(function(chItem) {
                    var meta = getChangeFieldMeta(chItem);
                    if (!isCreatedInPeriod) dotColor = meta.dot;
                    var isLongText = (chItem.field || '').toLowerCase() === 'description';
                    if (isLongText) {
                        changeBadges.push('<div class="flex items-center gap-1 ' + meta.badge + ' border rounded-md px-2 py-1"><span class="text-[9px] font-bold">' + meta.label + ' yeniləndi</span><span class="text-[9px] opacity-50 ml-1">' + entryTime + '</span></div>');
                    } else {
                        var fromStr = truncateChangeValue(chItem.fromString);
                        var toStr = truncateChangeValue(chItem.toString);
                        changeBadges.push('<div class="flex items-center gap-1 ' + meta.badge + ' border rounded-md px-2 py-1"><span class="text-[9px] font-bold">' + meta.label + ':</span><span class="text-[9px] line-through opacity-60">' + fromStr + '</span><svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg><span class="text-[9px] font-bold">' + toStr + '</span><span class="text-[9px] opacity-50 ml-1">' + entryTime + '</span></div>');
                    }
                });
            });
        }

        if (changeBadges.length === 0) {
            var statusName = t.fields.status ? t.fields.status.name : 'Naməlum';
            changeBadges.push('<div class="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700"><span class="text-[9px] font-bold">Şərh / Status: ' + statusName + '</span></div>');
        }

        var lineHtml = index < taskWithChanges.length - 1 ? '<div class="w-px flex-1 bg-slate-200 min-h-[20px]"></div>' : '';
        activityHtml += '<div class="flex gap-3"><div class="flex flex-col items-center"><div class="w-3 h-3 rounded-full ' + dotColor + ' border-2 border-white shadow-sm mt-1"></div>' + lineHtml + '</div><div onclick="window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')" class="flex-1 pb-2 cursor-pointer group"><div class="flex items-center justify-between mb-1.5"><div class="flex items-center gap-2"><span class="font-mono text-[10px] font-bold text-[#5b21b6] bg-purple-50 px-1.5 py-0.5 rounded">' + t.key + '</span><span class="text-xs text-slate-700 truncate">' + t.fields.summary + '</span></div><span class="text-[9px] text-slate-400 font-medium shrink-0 ml-2">' + realTime + '</span></div><div class="flex flex-wrap gap-1.5 pl-1">' + changeBadges.join('') + '</div></div></div>';
    });
    activityHtml += '</div>';
    userActivityDiv.innerHTML = activityHtml;
}
