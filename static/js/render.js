import { state } from './state.js';
import { animateValue, getChangeFieldMeta, getInitials, getIssueTypeIcon, getStatusColor, normalizeStr, truncateChangeValue } from './utils.js';
import { belongsToDept, getDateStatus, getDifficultyField, getHistoricalStatus, getSprintNames, getStatusGroup, hasValidDifficulty, isDueThisWeek } from './model.js';
import { filterSprintComparison } from './filters.js';

export function renderStats(tasks) {
    // Alt tapşırığı olan (istər subtasks, istər issuelinks vasitəsilə) ana tapşırıqları siyahıdan çıxardırıq!
    var units = tasks.filter(function(t) {
        if (!t || !t.fields) return false;
        
        var subtasks = t.fields.subtasks || [];
        if (subtasks.length > 0) return false;
        
        if (t.fields.issuelinks && t.fields.issuelinks.length > 0) {
            for (var i = 0; i < t.fields.issuelinks.length; i++) {
                var link = t.fields.issuelinks[i];
                var linkedIssue = link.outwardIssue || link.inwardIssue;
                if (!linkedIssue) continue;
                if (linkedIssue.fields && linkedIssue.fields.issuetype) {
                    var linkedType = normalizeStr(linkedIssue.fields.issuetype.name);
                    if (linkedType.includes('alt') || linkedType.includes('sub')) {
                        return false;
                    }
                }
            }
        }
        return true;
    });

    var backlogTasks = units.filter(function(t) { 
        var st = normalizeStr(t.fields.status.name || '');
        return st.includes('başlanmamış') || st.includes('baslanmamis');
    }).length;

    var pausedTasks = units.filter(function(t) {
        var st = normalizeStr(t.fields.status.name || '');
        return st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
    }).length;

    var rejected = units.filter(function(t) { return getStatusGroup(t.fields.status.name || '') === 'rejected'; }).length;

    var total = units.length - backlogTasks - pausedTasks - rejected;
    if (total < 0) total = 0;

    animateValue('totalTasks', 0, total, 800);

    var validTasks = units.filter(function(t) {
        var st = normalizeStr(t.fields.status.name || '');
        var isRejected = getStatusGroup(st) === 'rejected';
        var isBacklog = st.includes('başlanmamış') || st.includes('baslanmamis');
        var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
        return !isRejected && !isBacklog && !isPaused;
    });

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
    
    var sprintDueWeek = validTasks.filter(function(t) { 
        var g = getStatusGroup(t.fields.status.name || '');
        return g !== 'done' && g !== 'rejected' && !hasDiff(t) && isDueThisWeek(t); 
    }).length;
    
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

    animateValue('doneTasks', 0, done, 800);
    animateValue('plannedTasks', 0, planned, 800);
    animateValue('sprintTasks', 0, sprintT, 800);
    animateValue('blockedTasks', 0, blocked, 800);
    animateValue('rejectedTasks', 0, rejected, 800);
    animateValue('otherTasks', 0, other, 800);
    animateValue('lateTasks', 0, lateTasks, 800);
    
    var dueWeekEl = document.getElementById('sprintTasksDueWeek');
    if (dueWeekEl) dueWeekEl.innerText = sprintDueWeek;

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
    var blockedOrDiffTasks = tasks.filter(function(t) {
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

export function renderTaskList(tasks, title) {
    title = title || 'Tapşırıqların Siyahısı';
    state.currentDisplayTasks = tasks;
    document.getElementById('taskListTitle').innerText = title;
    var listDiv = document.getElementById('taskList');
    var pagDiv = document.getElementById('taskPagination');
    listDiv.innerHTML = '';
    if (pagDiv) pagDiv.innerHTML = '';
    if (tasks.length === 0) { listDiv.innerHTML += '<p class="text-slate-400 text-sm p-4 text-center">Bu filtrə uyğun tapşırıq tapılmadı.</p>'; return; }
    var totalPages = Math.ceil(tasks.length / state.tasksPerPage);
    if (state.currentPage > totalPages) state.currentPage = 1;
    if (state.currentPage < 1) state.currentPage = 1;
    var start = (state.currentPage - 1) * state.tasksPerPage;
    var end = start + state.tasksPerPage;
    var paginatedTasks = tasks.slice(start, end);
    
    function fmtDate(dateStr) {
        if (!dateStr) return '-';
        try {
            var d = new Date(dateStr);
            return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch(e) { return '-'; }
    }

    paginatedTasks.forEach(function(t) {
        var assignee = t.fields.assignee;
        var assigneeName = assignee ? assignee.displayName : 'Təyin edilməyib';
        var initials = getInitials(assigneeName);
        var avatarColor = assignee ? '#5b21b6' : '#94a3b8';
        var hasSubtasks = t.fields.subtasks && t.fields.subtasks.length > 0;
        var hasIssueLinks = t.fields.issuelinks && t.fields.issuelinks.length > 0;
        var issueTypeName = t.fields.issuetype ? t.fields.issuetype.name : '';
        var issueTypeIcon = getIssueTypeIcon(issueTypeName);
        var isSubtask = normalizeStr(issueTypeName).includes('alt') || normalizeStr(issueTypeName).includes('sub');

        var toggleButtonsHtml = '';
        var subtaskHtml = '';
        var relatedHtml = '';
        
        var mainRowClick = 'window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')';
        if (!isSubtask && hasSubtasks) {
            mainRowClick = 'toggleSubtasks(\'' + t.key + '\')';
        } else if (!isSubtask && hasIssueLinks) {
            mainRowClick = 'toggleRelated(\'' + t.key + '\')';
        }

        if (hasSubtasks && !isSubtask) {
            toggleButtonsHtml += '<span onclick="event.stopPropagation(); toggleSubtasks(\'' + t.key + '\')" class="text-[10px] text-blue-600 mr-2 bg-blue-100 px-2 py-1 rounded cursor-pointer hover:bg-blue-200 transition">Alt (' + t.fields.subtasks.length + ')</span>';
            subtaskHtml = '<div id="subtasks-' + t.key + '" class="hidden bg-slate-50 border-t border-slate-100">';
            subtaskHtml += '<div class="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">Alt Tapşırıqlar (' + t.fields.subtasks.length + ')</div>';
            subtaskHtml += t.fields.subtasks.map(function(sub) {
                var subStatusName = sub.fields && sub.fields.status ? sub.fields.status.name : 'Naməlum';
                return '<div onclick="event.stopPropagation(); window.open(\'' + state.currentBaseUrl + '/browse/' + sub.key + '\', \'_blank\')" class="flex flex-col gap-1 text-xs text-slate-600 p-2 mx-2 rounded-lg hover:bg-white cursor-pointer border border-slate-100 mb-1 transition"><div class="flex items-center gap-2"><span class="font-mono text-[10px] text-slate-400 w-16">' + sub.key + '</span><span class="px-1.5 py-0.5 text-[9px] rounded-full text-white ' + getStatusColor(subStatusName) + '">' + subStatusName + '</span></div><div class="truncate font-medium pl-1">' + (sub.fields.summary || '') + '</div></div>';
            }).join('');
            subtaskHtml += '</div>';
        }
        if (hasIssueLinks && !isSubtask) {
            toggleButtonsHtml += '<span onclick="event.stopPropagation(); toggleRelated(\'' + t.key + '\')" class="text-[10px] text-indigo-600 mr-2 bg-indigo-100 px-2 py-1 rounded cursor-pointer hover:bg-indigo-200 transition">Əlaqəli (' + t.fields.issuelinks.length + ')</span>';
            relatedHtml = '<div id="related-' + t.key + '" class="hidden bg-slate-50 border-t border-slate-100">';
            relatedHtml += '<div class="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>Əlaqəli Tapşırıqlar (' + t.fields.issuelinks.length + ')</div>';
            relatedHtml += t.fields.issuelinks.map(function(link) {
                var linkedIssue = link.outwardIssue || link.inwardIssue;
                if (!linkedIssue) return '';
                var linkStatus = linkedIssue.fields && linkedIssue.fields.status ? linkedIssue.fields.status.name : 'Naməlum';
                var linkSummary = linkedIssue.fields && linkedIssue.fields.summary ? linkedIssue.fields.summary : '';
                var linkPriority = linkedIssue.fields && linkedIssue.fields.priority ? linkedIssue.fields.priority.name : '';
                var linkType = link.type ? (link.outwardIssue ? link.type.outward : link.type.inward) : 'əlaqəli';
                return '<div onclick="event.stopPropagation(); window.open(\'' + state.currentBaseUrl + '/browse/' + linkedIssue.key + '\', \'_blank\')" class="flex flex-col gap-1 text-xs text-slate-600 p-2 mx-2 rounded-lg hover:bg-white cursor-pointer border border-slate-100 mb-1 transition"><div class="flex items-center gap-2"><span class="font-mono text-[10px] text-slate-400 w-16">' + linkedIssue.key + '</span><span class="px-1.5 py-0.5 text-[9px] rounded-full text-white ' + getStatusColor(linkStatus) + '">' + linkStatus + '</span><span class="text-[9px] text-indigo-400 italic ml-auto">' + linkType + '</span></div><div class="truncate font-medium pl-1">' + linkSummary + '</div>' + (linkPriority ? '<div class="text-[9px] text-slate-400 pl-1">Prioritet: ' + linkPriority + '</div>' : '') + '</div>';
            }).join('');
            relatedHtml += '</div>';
        }

        var dueDateRaw = t.fields['customfield_10807'] || t.fields['duedate'];
        var resolvedDateRaw = t.fields['resolutiondate'];
        var statusGroup = getStatusGroup(t.fields.status.name);
        var isDone = (statusGroup === 'done');
        var dateStatus = getDateStatus(t);

        var dateInfoHtml = '<div class="flex flex-col items-end text-[10px] text-slate-400 ml-3 shrink-0 hidden md:flex">';
        dateInfoHtml += '<div class="flex items-center gap-1 mb-0.5"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span>Bitmə: <b class="text-slate-600">' + fmtDate(dueDateRaw) + '</b></span></div>';
        
        if (isDone) {
            dateInfoHtml += '<div class="flex items-center gap-1 text-emerald-600"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>Tamamlandı: <b>' + fmtDate(resolvedDateRaw) + '</b></span></div>';
        } else {
            if (dateStatus === 'late') dateInfoHtml += '<span class="text-red-500 font-bold mt-0.5">(Gecikib)</span>';
            else if (dateStatus === 'early') dateInfoHtml += '<span class="text-teal-500 font-bold mt-0.5">(Öncə bitə bilər)</span>';
        }
        dateInfoHtml += '</div>';

        listDiv.innerHTML += '<div class="fade-in border border-slate-200 rounded-xl overflow-hidden mb-2"><div class="task-item p-3 md:p-4 cursor-pointer flex items-center gap-3 md:gap-4" onclick="' + mainRowClick + '"><div class="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white text-xs md:text-sm font-bold" style="background-color: ' + avatarColor + ';">' + initials + '</div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1">' + issueTypeIcon + '<span class="font-mono text-xs md:text-sm font-bold text-[#5b21b6]">' + t.key + '</span><span class="px-2 py-0.5 text-[10px] md:text-xs rounded-full text-white ' + getStatusColor(t.fields.status.name) + '">' + t.fields.status.name + '</span>' + (issueTypeName ? '<span class="hidden md:inline-block px-1.5 py-0.5 text-[9px] rounded bg-slate-100 text-slate-500 font-medium">' + issueTypeName + '</span>' : '') + '</div><p class="text-xs md:text-sm text-slate-600 truncate">' + t.fields.summary + '</p></div>' + toggleButtonsHtml + dateInfoHtml + '<a href="' + state.currentBaseUrl + '/browse/' + t.key + '" target="_blank" onclick="event.stopPropagation()" class="text-slate-300 hover:text-[#5b21b6] transition z-10 ml-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a></div>' + subtaskHtml + relatedHtml + '</div>';
    });
    if (pagDiv && totalPages > 1) {
        var html = '';
        if (state.currentPage > 1) html += '<button onclick="changePage(' + (state.currentPage - 1) + ')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition">Əvvəlki</button>';
        html += '<span class="text-sm text-slate-600 font-medium">Səhifə ' + state.currentPage + ' / ' + totalPages + '</span>';
        if (state.currentPage < totalPages) html += '<button onclick="changePage(' + (state.currentPage + 1) + ')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition">Növbəti</button>';
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
    renderTaskList(state.currentDisplayTasks, document.getElementById('taskListTitle').innerText);
}

export function renderWeeklyTasks() {
    var planned = state.allTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; });
    var list = document.getElementById('weeklyTaskList'); 
    if (!list) return;
    list.innerHTML = '';
    if (planned.length === 0) { list.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Statusu "Planlaşdırılıb" olan tapşırıq yoxdur.</p>'; }
    else { planned.forEach(function(t) { list.innerHTML += '<div onclick="window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')" class="task-item p-3 rounded-xl border border-slate-200 cursor-pointer flex items-center justify-between fade-in"><div class="mr-2 min-w-0"><span class="font-mono text-xs font-bold text-[#5b21b6]">' + t.key + '</span><p class="text-sm text-slate-600 mt-1 truncate">' + t.fields.summary + '</p></div><span class="text-xs ' + getStatusColor(t.fields.status.name) + ' text-white px-2 py-1 rounded-full whitespace-nowrap">' + t.fields.status.name + '</span></div>'; }); }
    document.getElementById('weeklyDiff').innerText = 'Cəmi ' + planned.length + ' tapşırıq';
}

export function renderPausedTasks() {
    var pausedTasks = state.allTasks.filter(function(t) {
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
        pausedTasks.forEach(function(t) { 
            list.innerHTML += '<div onclick="window.open(\'' + state.currentBaseUrl + '/browse/' + t.key + '\', \'_blank\')" class="task-item p-3 rounded-xl border border-slate-200 cursor-pointer flex items-center justify-between fade-in"><div class="mr-2 min-w-0"><span class="font-mono text-xs font-bold text-[#5b21b6]">' + t.key + '</span><p class="text-sm text-slate-600 mt-1 truncate">' + t.fields.summary + '</p></div><span class="text-xs ' + getStatusColor(t.fields.status.name) + ' text-white px-2 py-1 rounded-full whitespace-nowrap">' + t.fields.status.name + '</span></div>'; 
        }); 
    }
}

export function renderSprintComparison() {
    var map = {};
    state.allTasks.forEach(function(t) { getSprintNames(t).forEach(function(n) { if (!map[n]) map[n] = []; if (!map[n].includes(t)) map[n].push(t); }); });
    var names = Object.keys(map).sort(function(a, b) { return (parseInt((b.match(/\d+/) || [0])[0])) - (parseInt((a.match(/\d+/) || [0])[0])); });
    if (names.length === 0) { document.getElementById('sprintComparison').innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Sprint məlumatı yoxdur.</p>'; return; }

    var sprintVal = document.getElementById('sprintFilter').value;
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

    var curTasks = map[curName] || [], prevTasks = prevName ? map[prevName] : [];

    function card(jName, dName, tasks, coTitle, isPrev) {
        if (!jName || tasks.length === 0) return '<div class="text-slate-400 text-sm p-4 text-center">Məlumat yoxdur.</div>';
        var validTasks = tasks.filter(function(t) {
            var st = normalizeStr(t.fields.status.name);
            var isRejected = getStatusGroup(st) === 'rejected';
            var isBacklog = st.includes('başlanmamış') || st.includes('baslanmamis');
            var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
            return !isRejected && !isBacklog && !isPaused;
        });

        var total = validTasks.length;
        var done = validTasks.filter(function(t) {
            var status = isPrev ? getHistoricalStatus(t, curName) : t.fields.status.name;
            return getStatusGroup(status) === 'done';
        }).length;
        var co = total - done;
        
        return '<div class="bg-slate-50 p-4 rounded-xl border border-slate-100 transition hover:shadow-md"><h3 class="font-bold text-md text-slate-800 mb-3">' + dName + '</h3><div class="space-y-3"><div onclick="filterSprintComparison(\'' + jName + '\',\'all\')" class="cursor-pointer hover:bg-white p-2 rounded-lg transition active:scale-95 border border-transparent hover:border-slate-200"><div class="flex justify-between items-center text-sm"><span class="text-slate-600">Ümumi Tapşırıq</span><span class="font-bold text-slate-800">' + total + '</span></div></div><div onclick="filterSprintComparison(\'' + jName + '\',\'done\')" class="cursor-pointer hover:bg-white p-2 rounded-lg transition active:scale-95 border border-transparent hover:border-slate-200"><div class="flex justify-between items-center text-sm"><span class="text-emerald-600">Tamamlanmış</span><span class="font-bold text-emerald-600">' + done + '</span></div></div><div onclick="filterSprintComparison(\'' + jName + '\',\'carryover\')" class="cursor-pointer hover:bg-white p-2 rounded-lg transition active:scale-95 border border-transparent hover:border-slate-200"><div class="flex justify-between items-center text-sm"><span class="text-slate-600">' + coTitle + '</span><span class="font-bold text-slate-800">' + co + '</span></div></div></div></div>';
    }

    document.getElementById('sprintComparison').innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'
        + card(prevName, 'Əvvəlki sprint', prevTasks, 'Növbəti sprintə keçən', true)
        + card(curName, 'Seçilmiş sprint', curTasks, 'İcrası davam edən', false)
        + '</div>';
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
