import { state } from './state.js';
import { getInitials, normalizeStr, toggleDropdown } from './utils.js';
import { getQurumName, getSprintDateRange, getStatusGroup, hasValidDifficulty, resolveDirection } from './model.js';
import { applyFilters, filterQurumByStatus, selectDailyUser, setQurumFilter } from './filters.js';
import { renderTaskList, showUserActivity } from './render.js';

export function renderStatusChart(tasks) {
    var gN = { 'progress': 'İcradakı (ESD & Rəy)', 'blocked': 'Bloklanıb', 'rejected': 'İmtina', 'done': 'Tamamlanmış', 'planned': 'Planlaşdırılıb', 'paused': 'Dayandırılıb', 'other': 'Digər' };
    var gC = { 'progress': '#3b82f6', 'blocked': '#ef4444', 'rejected': '#e11d48', 'done': '#10b981', 'planned': '#f59e0b', 'paused': '#f59e0b', 'other': '#cbd5e1' };
    var counts = {};
    tasks.forEach(function(t) { var n = gN[getStatusGroup(t.fields.status.name)]; if (n) counts[n] = (counts[n] || 0) + 1; });
    var labels = Object.keys(counts), data = Object.values(counts);
    var colors = labels.map(function(l) { return gC[Object.keys(gN).find(function(k) { return gN[k] === l; })] || '#94a3b8'; });
    drawChart('statusChart', 'doughnut', labels, data, colors, function(e, c) {
        if (c.length > 0) {
            var k = Object.keys(gN).find(function(kk) { return gN[kk] === labels[c[0].index]; });
            if (k) {
                renderTaskList(state.filteredTasks.filter(function(t) { return getStatusGroup(t.fields.status.name) === k; }), labels[c[0].index] + ' - Tapşırıqları');
                toggleDropdown('taskListContent');
                document.getElementById('taskListContent').scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
}

export function renderAssigneeChart(tasks) {
    var counts = {};
    tasks.forEach(function(t) { if (t.fields.assignee && t.fields.assignee.displayName) { var n = t.fields.assignee.displayName; counts[n] = (counts[n] || 0) + 1; } });
    var labels = Object.keys(counts), data = Object.values(counts);
    var PALETTE = ['#4c1d95', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2'];
    var colors = labels.map(function(_, i) { return PALETTE[i % PALETTE.length]; });
    var click = function(e, c) { if (c.length > 0) { state.currentAssigneeFilter = labels[c[0].index]; applyFilters(); toggleDropdown('taskListContent'); } };
    drawChart('assigneeChart', 'bar', labels, data, colors, click, click);
}

export function renderEpicChart(tasks) {
    var counts = {}, dirKeysMap = {}, tasksByDir = {};
    var exc = ['tədbirlərin statistikası', 'tədbirin statistikasi', 'statistika'];
    tasks.forEach(function(t) {
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
    var labels = Object.keys(counts), data = Object.values(counts);
    var PALETTE = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#c026d3', '#65a30d', '#e11d48', '#4f46e5', '#0d9488', '#b45309'];
    var colors = labels.map(function(label, i) {
        var dirObj = state.allDirections.find(function(d) { return d.fields.summary === label; });
        if (dirObj && dirObj.key === state.currentDirectionFilter) return '#f59e0b';
        return PALETTE[i % PALETTE.length];
    });
    drawChart('epicChart', 'bar', labels, data, colors, function(e, c) {
        if (c.length > 0) {
            var n = labels[c[0].index];
            var newDir = dirKeysMap[n];
            if (newDir === state.currentDirectionFilter) { state.currentDirectionFilter = null; } else { state.currentDirectionFilter = newDir; }
            applyFilters();
        }
    }, null, true);
}

export function renderQurumChart(tasks) {
    var qurumData = {};
    tasks.forEach(function(t) {
        var qName = getQurumName(t) || 'Təyin edilməyib';
        if (!qurumData[qName]) qurumData[qName] = { total: 0, done: 0, inProgress: 0, planned: 0, blocked: 0 };
        qurumData[qName].total++;
        var g = getStatusGroup(t.fields.status.name);
        if (g === 'done') qurumData[qName].done++;
        else if (g === 'progress' || g === 'esd' || g === 'review') qurumData[qName].inProgress++;
        else if (g === 'planned') qurumData[qName].planned++;
        else if (g === 'blocked' || hasValidDifficulty(t)) qurumData[qName].blocked++;
    });
    var sortedQurums = Object.keys(qurumData).sort(function(a, b) { return qurumData[b].total - qurumData[a].total; });
    var tbody = document.getElementById('qurumTableBody');
    tbody.innerHTML = '';
    var PALETTE = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7', '#0d9488', '#b45309'];
    var colors = sortedQurums.map(function(qName, i) { if (qName === state.currentQurumFilter) return '#f59e0b'; return PALETTE[i % PALETTE.length]; });
    if (sortedQurums.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">Məlumat yoxdur.</td></tr>';
    } else {
        sortedQurums.forEach(function(qName, index) {
            var d = qurumData[qName];
            var donePercent = d.total > 0 ? Math.round((d.done / d.total) * 100) : 0;
            var color = colors[index];
            var safeName = qName.replace(/'/g, "\\'");
            var isActive = qName === state.currentQurumFilter;
            var tr = document.createElement('tr');
            tr.className = 'transition ' + (isActive ? 'bg-amber-50 ring-2 ring-amber-300' : 'hover:bg-indigo-50/50');
            tr.innerHTML = '<td class="py-3 px-4 font-medium text-slate-700 cursor-pointer hover:bg-indigo-100/50 rounded-l-lg transition ' + (isActive ? 'text-amber-700' : '') + '" onclick="setQurumFilter(\'' + safeName + '\')"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background-color: ' + color + '"></span>' + qName + (isActive ? '<span class="text-[9px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full ml-1">AKTİV</span>' : '') + '</div></td><td class="py-3 px-2 text-center font-bold text-slate-800 cursor-pointer hover:bg-indigo-100/50 transition" onclick="filterQurumByStatus(\'' + safeName + '\', \'all\')">' + d.total + '</td><td class="py-3 px-2 text-center text-orange-600 font-medium cursor-pointer hover:bg-indigo-100/50 transition" onclick="filterQurumByStatus(\'' + safeName + '\', \'planned\')">' + d.planned + '</td><td class="py-3 px-2 text-center text-blue-600 font-medium cursor-pointer hover:bg-indigo-100/50 transition" onclick="filterQurumByStatus(\'' + safeName + '\', \'progress\')">' + d.inProgress + '</td><td class="py-3 px-2 text-center cursor-pointer hover:bg-indigo-100/50 rounded-r-lg transition" onclick="filterQurumByStatus(\'' + safeName + '\', \'done\')"><div class="flex items-center justify-center gap-2"><span class="text-emerald-600 font-medium">' + d.done + '</span><div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden md:block"><div class="h-full bg-emerald-500 rounded-full" style="width: ' + donePercent + '%"></div></div></div></td>';
            tbody.appendChild(tr);
        });
    }
    var thead = tbody.previousElementSibling ? tbody.previousElementSibling.querySelector('tr') : null;
    if (thead) {
        thead.innerHTML = '<th class="py-3 px-4 text-left font-semibold">Qurumun adı</th><th class="py-3 px-2 text-center font-semibold">Ümumi</th><th class="py-3 px-2 text-center font-semibold">Plan.</th><th class="py-3 px-2 text-center font-semibold">İcradakı</th><th class="py-3 px-2 text-center font-semibold">Tamamlanıb</th>';
    }
    var canvas = document.getElementById('qurumChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    var labels = sortedQurums;
    var data = labels.map(function(q) { return qurumData[q].total; });
    var centerTextPlugin = {
        id: 'centerText',
        afterDraw: function(chart) {
            var ctx2 = chart.ctx;
            var area = chart.chartArea;
            ctx2.save();
            var total = data.reduce(function(a, b) { return a + b; }, 0);
            ctx2.font = 'bold 24px Inter';
            ctx2.fillStyle = '#1e293b';
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'middle';
            ctx2.fillText(total, area.left + area.width / 2, area.top + area.height / 2 - 10);
            ctx2.font = '500 10px Inter';
            ctx2.fillStyle = '#64748b';
            ctx2.fillText('Toplam Task', area.left + area.width / 2, area.top + area.height / 2 + 10);
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
            onClick: function(e, c) { if (c.length > 0) { var clicked = labels[c[0].index]; if (clicked === state.currentQurumFilter) { state.currentQurumFilter = null; } else { state.currentQurumFilter = clicked; } applyFilters(); } }
        },
        plugins: [centerTextPlugin]
    });
}

export function renderLabelChart() {
    var exc = ['tədbirlərin statistikası', 'tədbirin statistikasi', 'statistika'];
    var directionLabels = [];
    var allLabelsSet = new Set();
    var dataMatrix = {};
    state.allDirections.forEach(function(d) {
        var name = d.fields.summary;
        if (exc.some(function(kw) { return normalizeStr(name).includes(kw); })) return;
        var dirTasks = state.filteredTasks.filter(function(t) { var dir = resolveDirection(t); return dir && dir.key === d.key; });
        if (dirTasks.length > 0) {
            directionLabels.push(name);
            dataMatrix[name] = {};
            dirTasks.forEach(function(t) {
                var labels = t.fields.labels || [];
                if (labels.length === 0) { allLabelsSet.add('Etiketsiz'); dataMatrix[name]['Etiketsiz'] = (dataMatrix[name]['Etiketsiz'] || 0) + 1; }
                else { labels.forEach(function(lbl) { var l = lbl.trim(); if (l) { allLabelsSet.add(l); dataMatrix[name][l] = (dataMatrix[name][l] || 0) + 1; } }); }
            });
        }
    });
    var uniqueLabels = Array.from(allLabelsSet);
    var PALETTE = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7'];
    var datasets = uniqueLabels.map(function(lbl, i) {
        return { label: lbl, data: directionLabels.map(function(dirName) { return dataMatrix[dirName][lbl] || 0; }), backgroundColor: PALETTE[i % PALETTE.length], borderWidth: 0, hoverOffset: 4, borderRadius: 4 };
    });
    var onClickCB = function(e, elements) {
        if (elements.length > 0) {
            var index = elements[0].index;
            var datasetIndex = elements[0].datasetIndex;
            var selectedDir = directionLabels[index];
            var selectedLabel = datasets[datasetIndex].label;
            var dirObj = state.allDirections.find(function(d) { return d.fields.summary === selectedDir; });
            if (dirObj) {
                var fTasks = state.filteredTasks.filter(function(t) { var tDir = resolveDirection(t); return tDir && tDir.key === dirObj.key && (t.fields.labels || []).includes(selectedLabel); });
                renderTaskList(fTasks, selectedDir + ' - Etiket: ' + selectedLabel);
                toggleDropdown('taskListContent');
                document.getElementById('taskListContent').scrollIntoView({ behavior: 'smooth' });
            }
        }
    };
    var legendCB = function(e, item, legend) {
        var index = item.datasetIndex;
        var ci = legend.chart;
        var clickedLabel = ci.data.datasets[index].label;
        if (state.activeLabelFilter === clickedLabel) { state.activeLabelFilter = null; ci.data.datasets.forEach(function(ds, i) { ci.setDatasetVisibility(i, true); }); }
        else { state.activeLabelFilter = clickedLabel; ci.data.datasets.forEach(function(ds, i) { ci.setDatasetVisibility(i, ds.label === clickedLabel); }); }
        ci.update();
    };
    drawStackedChart('labelChart', 'bar', directionLabels, datasets, onClickCB, true, legendCB);
}

export function drawChart(id, type, labels, data, colors, onClickCB, legendCB, isHorizontal) {
    onClickCB = onClickCB || null; legendCB = legendCB || null; isHorizontal = isHorizontal || false;
    var ctx = document.getElementById(id).getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [{ label: 'Tapşırıq Sayı', data: data, backgroundColor: colors, borderWidth: 0, hoverOffset: 12, borderRadius: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: isHorizontal ? 'y' : 'x',
            onClick: onClickCB, onHover: function(e, el) { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: !isHorizontal, position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { family: 'Inter', size: 11 }, boxWidth: 8 }, onClick: legendCB },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleFont: { family: 'Inter', size: 12, weight: 'bold' }, bodyFont: { family: 'Inter', size: 11 }, padding: 12, cornerRadius: 8, displayColors: true, boxPadding: 4 }
            },
            scales: isHorizontal ? {
                x: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter' }, color: '#64748b' } },
                y: { grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } }
            } : {
                x: { grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } },
                y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } }
            }
        }
    });
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
            if (total > 0 && meta.data[i]) { var yPos = meta.data[i].y; ctx.fillText(total, maxX + 8, yPos + 4); }
        });
        ctx.restore();
    }
};

export function drawStackedChart(id, type, labels, datasets, onClickCB, isHorizontal, legendCB) {
    onClickCB = onClickCB || null; isHorizontal = isHorizontal || false; legendCB = legendCB || null;
    var ctx = document.getElementById(id).getContext('2d');
    var ex = Chart.getChart(ctx); if (ex) ex.destroy();
    new Chart(ctx, {
        type: type, data: { labels: labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: isHorizontal ? 'y' : 'x',
            onClick: onClickCB, onHover: function(e, el) { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { family: 'Inter', size: 11 }, boxWidth: 8, color: '#475569' }, onClick: legendCB },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleFont: { family: 'Inter', size: 12, weight: 'bold' }, bodyFont: { family: 'Inter', size: 11 }, padding: 12, cornerRadius: 8, boxPadding: 4 }
            },
            scales: isHorizontal ? {
                x: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } },
                y: { stacked: true, grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } }
            } : {
                x: { stacked: true, grid: { display: false, drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } },
                y: { stacked: true, beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' } }
            }
        },
        plugins: [totalLabelsPlugin]
    });
}

export function renderDailyProgress() {
    var usersListDiv = document.getElementById('dailyUsersList');
    var userActivityDiv = document.getElementById('dailyUserActivity');
    var countDiv = document.getElementById('dailyUpdatedCount');
    if (!usersListDiv || !userActivityDiv || !countDiv) return;

    var sprintVal = document.getElementById('sprintFilter').value;
    var sprintSelect = document.getElementById('sprintFilter');
    var latestSprint = (sprintSelect.options.length > 1) ? sprintSelect.options[1].value : null;
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
