import { state } from './state.js';
import { normalizeStr } from './utils.js';

function getIssueTypeName(t) {
    if (!t || !t.fields || !t.fields.issuetype) return '';
    return t.fields.issuetype.name || '';
}

function compactIssueTypeName(n) {
    return normalizeStr(n)
        .replace(/ı/g, 'i')
        .replace(/ə/g, 'e')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ğ/g, 'g')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/[\s\-_]+/g, '');
}

export function isStructureTypeName(n) {
    var c = compactIssueTypeName(n);
    if (!c) return false;
    var types = state.STRUCTURE_TYPES || [];
    for (var i = 0; i < types.length; i++) {
        var s = compactIssueTypeName(types[i]);
        if (s && c.indexOf(s) !== -1) return true;
    }
    return false;
}

export function isSubtaskTypeName(n) {
    n = n || '';
    if (!n || isStructureTypeName(n)) return false;
    var c = compactIssueTypeName(n);
    return c.indexOf('alttapsiriq') !== -1 || c.indexOf('subtask') !== -1;
}

export function isSubtaskType(t) {
    var n = getIssueTypeName(t);
    if (isSubtaskTypeName(n)) return true;
    if (t && t.fields && t.fields.issuetype && t.fields.issuetype.subtask === true && !isStructureTypeName(n)) return true;
    return false;
}

export function isTaskType(t) {
    if (isSubtaskType(t)) return false;
    var n = getIssueTypeName(t);
    if (!n || isStructureTypeName(n)) return false;
    var c = compactIssueTypeName(n);
    return c === 'task' || c.indexOf('tapsiriq') !== -1;
}

export function isTaskOrSubtaskType(t) {
    return isTaskType(t) || isSubtaskType(t);
}

export function isExcludedFromDashboardTotal(t) {
    if (!t || !t.fields || !t.fields.status) return true;
    var st = normalizeStr(t.fields.status.name || '');
    if (getStatusGroup(st) === 'rejected') return true;
    if (st.includes('başlanmamış') || st.includes('baslanmamis')) return true;
    if (st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti')) return true;
    return false;
}

export function countableWorkUnits(tasks) {
    return (tasks || []).filter(function(t) {
        return isTaskType(t) && !isExcludedFromDashboardTotal(t);
    });
}

export function getParentIssue(t) {
    if (!t) return null;
    if (t.key && state.parentCache.hasOwnProperty(t.key)) return state.parentCache[t.key];
    var parent = null;
    var f = t.fields || {};
    if (f.parent && f.parent.key) {
        if (state.issueIndex[f.parent.key]) {
            parent = state.issueIndex[f.parent.key];
        } else {
            var found = state.allTasks.find(function(at) { return at.key === f.parent.key; });
            if (found) {
                parent = found;
                state.issueIndex[found.key] = found;
            } else {
                parent = f.parent;
            }
        }
    }
    if (!parent) {
        for (var key in f) {
            if (!key.startsWith('customfield_')) continue;
            var v = f[key];
            if (!v) continue;
            if (typeof v === 'string' && /^[A-Z][A-Z0-9]*-\d+$/.test(v.trim())) {
                var pKey = v.trim();
                if (state.issueIndex[pKey]) parent = state.issueIndex[pKey];
                else {
                    var found2 = state.allTasks.find(function(at) { return at.key === pKey; });
                    if (found2) { parent = found2; state.issueIndex[found2.key] = found2; }
                }
                if (parent) break;
            }
            if (typeof v === 'object' && !Array.isArray(v)) {
                var cand = v.key || (v.data && v.data.key);
                if (cand) {
                    if (state.issueIndex[cand]) parent = state.issueIndex[cand];
                    else {
                        var found3 = state.allTasks.find(function(at) { return at.key === cand; });
                        if (found3) { parent = found3; state.issueIndex[found3.key] = found3; }
                    }
                    if (parent) break;
                }
            }
        }
    }
    if (!parent) {
        if (isSubtaskType(t) && f.issuelinks && f.issuelinks.length > 0) {
            for (var li = 0; li < f.issuelinks.length; li++) {
                var linked = f.issuelinks[li].outwardIssue || f.issuelinks[li].inwardIssue;
                if (!linked) continue;
                if (isSubtaskType(linked)) continue;
                if (state.issueIndex[linked.key]) { parent = state.issueIndex[linked.key]; }
                else {
                    var found4 = state.allTasks.find(function(at) { return at.key === linked.key; });
                    if (found4) { parent = found4; state.issueIndex[found4.key] = found4; }
                }
                if (parent) break;
            }
        }
    }
    if (t.key) state.parentCache[t.key] = parent;
    return parent;
}

export function resolveDirection(t) {
    var cur = t, depth = 0;
    while (cur && depth < 10) {
        var typeName = cur.fields.issuetype ? normalizeStr(cur.fields.issuetype.name) : '';
        if (!typeName.includes('alt') && (typeName.includes('istiqamət') || typeName.includes('istiqamet') || typeName.includes('epic') || typeName.includes('tədbir') || typeName.includes('tedbir'))) return cur;
        cur = getParentIssue(cur);
        depth++;
    }
    return null;
}

export function isKomplaynsName(raw) {
    var n = normalizeStr(raw);
    if (!n) return false;
    return n.indexOf('komplanys') !== -1 || n.indexOf('komplayn') !== -1 || n.indexOf('komplain') !== -1 || n.indexOf('compliance') !== -1;
}

export function hasKomplaynsComponent(t) {
    if (!t || !t.fields) return false;
    var comps = t.fields.components;
    if (!comps) return false;
    if (!Array.isArray(comps)) comps = [comps];
    for (var i = 0; i < comps.length; i++) {
        var c = comps[i];
        var raw = '';
        if (typeof c === 'string') raw = c;
        else if (c && typeof c === 'object') raw = c.name || c.value || '';
        if (isKomplaynsName(raw)) return true;
    }
    return false;
}

export function belongsToDept(t) {
    var cur = t, depth = 0;
    while (cur && depth < 10) {
        if (hasKomplaynsComponent(cur)) return true;
        cur = getParentIssue(cur);
        depth++;
    }
    return false;
}

export function getStatusGroup(statusName) {
    if (!statusName) return 'other';
    var n = normalizeStr(statusName);
    if (n.includes('başlanmamış') || n.includes('baslanmamis')) return 'progress';
    if (n.includes('dayandır') || n.includes('dayandir') || n.includes('müvəqqəti') || n.includes('muveqqeti')) return 'paused';
    if (n.includes('icra edil') || n.includes('həll') || n.includes('hel') || n.includes('bağlı') || n.includes('bagli') || n.includes('tamamla') || n === 'done' || n === 'closed' || n === 'resolved') return 'done';
    if (n.includes('planlaşdır') || n.includes('planlasdir') || n === 'planned' || n === 'to do') return 'planned';
    if (n.includes('esd')) return 'esd';
    if (n.includes('rəy') || n.includes('rey') || n.includes('review')) return 'review';
    if (n.includes('icradadır') || n.includes('icradadir') || n === 'in progress') return 'progress';
    if (n.includes('blok')) return 'blocked';
    if (n.includes('imtina')) return 'rejected';
    return 'other';
}

export function isActiveExecutionGroup(g) {
    return g === 'progress' || g === 'esd' || g === 'review';
}

export function getBakuWeekRange(weekOffset) {
    var offset = weekOffset || 0;
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    var bakuNow = new Date(utc + (4 * 3600000));
    bakuNow.setHours(0, 0, 0, 0);
    var dayOfWeek = bakuNow.getDay();
    var diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var monday = new Date(bakuNow.getFullYear(), bakuNow.getMonth(), bakuNow.getDate() + diffToMonday + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
}

export function isDueThisWeek(t) {
    if (!t.fields) return false;
    var due = getTaskDueDate(t);
    if (!due) return false;
    var week = getBakuWeekRange(0);
    return due >= week.start && due <= week.end;
}

export function getTaskStartDate(t) {
    if (!t || !t.fields) return null;
    var candidates = [];
    for (var key in state.jiraFieldNames) {
        var fieldName = normalizeStr(state.jiraFieldNames[key]);
        if (!fieldName) continue;
        if (fieldName.includes('bitmə') || fieldName.includes('bitme') || fieldName.includes('due') || fieldName.includes('son tarix') || fieldName.includes('bitiş') || fieldName.includes('bitis')) continue;
        if (fieldName.includes('end') && !fieldName.includes('start')) continue;
        if (fieldName.includes('başlama') || fieldName.includes('baslama') || fieldName.includes('start') || fieldName.includes('hədəf başla') || fieldName.includes('hedef basla')) {
            candidates.push(key);
        }
    }
    var i;
    for (i = 0; i < candidates.length; i++) {
        var namedDate = parsePhaseDate(t.fields[candidates[i]]);
        if (namedDate) return namedDate;
    }
    return parsePhaseDate(t.fields['customfield_10015'])
        || parsePhaseDate(t.fields['customfield_10808']);
}

export function getTaskDueDate(t) {
    if (!t || !t.fields) return null;
    var dueDateRaw = t.fields['customfield_10807'] || t.fields['duedate'];
    if (!dueDateRaw) return null;
    try {
        var dueStr = String(dueDateRaw).split('T')[0];
        var parts = dueStr.split('-');
        if (parts.length < 3) return null;
        var dueDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        dueDate.setHours(0, 0, 0, 0);
        return isNaN(dueDate.getTime()) ? null : dueDate;
    } catch (e) {
        return null;
    }
}

export function isDueInDateRange(t, start, end) {
    var due = getTaskDueDate(t);
    if (!due) return false;
    if (!start && !end) return false;
    if (start) {
        var s = parseLocalDay(start);
        if (s && due < s) return false;
    }
    if (end) {
        var e = parseLocalDay(end);
        if (e) {
            e.setHours(23, 59, 59, 999);
            if (due > e) return false;
        }
    }
    return true;
}

export function getTaskCreatedDate(t) {
    if (!t || !t.fields) return null;
    return parseLocalDay(t.fields.created);
}

export function taskBelongsToDateRange(t, start, end) {
    if (!t) return false;
    var startBound = parseLocalDay(start);
    var endBound = parseLocalDay(end);
    if (endBound) endBound.setHours(23, 59, 59, 999);
    if (!startBound && !endBound) return false;
    if (dayInBounds(getTaskStartDate(t), startBound, endBound)) return true;
    if (dayInBounds(getTaskCreatedDate(t), startBound, endBound)) return true;
    if (dayInBounds(getTaskDueDate(t), startBound, endBound)) return true;
    if (taskHasSprintOverlappingRange(t, startBound, endBound)) return true;
    return false;
}

function dayInBounds(d, startBound, endBound) {
    if (!d) return false;
    var day = parseLocalDay(d);
    if (!day) return false;
    if (startBound && day < startBound) return false;
    if (endBound && day > endBound) return false;
    return true;
}

function parseLocalDay(raw) {
    if (!raw) return null;
    if (raw instanceof Date) {
        if (isNaN(raw.getTime())) return null;
        var fromDate = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
        fromDate.setHours(0, 0, 0, 0);
        return fromDate;
    }
    var str = String(raw).split('T')[0].trim();
    var p = str.split('-');
    if (p.length < 3) return null;
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    dt.setHours(0, 0, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
}

export function isDueInSprint(t, sprintName) {
    if (!sprintName || sprintName === 'all') return false;
    if (!getTaskDueDate(t)) return false;
    if (getSprintNames(t).indexOf(sprintName) === -1) return false;
    var range = getSprintDateRange(sprintName);
    if (!range || !range.start || !range.end) return false;
    return isDueInDateRange(t, range.start, range.end);
}

export function wasCompletedInSprint(t, sprintName, statusName) {
    var status = statusName || (t && t.fields && t.fields.status && t.fields.status.name) || '';
    if (getStatusGroup(status) !== 'done') return false;
    var range = getSprintDateRange(sprintName);
    if (!range || !range.end) return true;
    var resolved = parsePhaseDate(t && t.fields && t.fields.resolutiondate);
    if (!resolved) return true;
    return dateKey(resolved) <= dateKey(range.end);
}

export function getSelectedSprintName() {
    var el = document.getElementById('sprintFilter');
    var val = el && el.value;
    if (!val || val === 'all') return null;
    return val;
}

function getSelectedDueWindow() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    var start = startEl && startEl.value;
    var end = endEl && endEl.value;
    if (start || end) return { start: start, end: end };
    var sprintName = getSelectedSprintName();
    if (!sprintName) return null;
    var range = getSprintDateRange(sprintName);
    if (!range || !range.start || !range.end) return null;
    return { start: range.start, end: range.end };
}

export function isDueInSelectedWeek(t) {
    var win = getSelectedDueWindow();
    if (win) return isDueInDateRange(t, win.start, win.end);
    return isDueThisWeek(t);
}

function dueInRangePool() {
    var win = getSelectedDueWindow();
    var source = win ? (state.allTasks || []) : (state.filteredTasks || []);
    return source.filter(function(t) {
        if (!t || !t.fields) return false;
        if (!isTaskType(t)) return false;
        var st = normalizeStr(t.fields.status.name || '');
        var g = getStatusGroup(st);
        if (g === 'rejected') return false;
        if (st.includes('başlanmamış') || st.includes('baslanmamis')) return false;
        if (st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti')) return false;
        if (win) {
            if (state.currentDirectionFilter) {
                var dir = resolveDirection(t);
                if (!dir || dir.key !== state.currentDirectionFilter) return false;
            }
            if (state.currentQurumFilter) {
                var q = getQurumName(t) || QURUM_UNASSIGNED;
                if (!sameQurum(q, state.currentQurumFilter)) return false;
            }
            if (state.currentAssigneeFilter) {
                if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false;
            }
            return isDueInDateRange(t, win.start, win.end);
        }
        return isDueThisWeek(t);
    });
}

export function collectDueThisWeekPool() {
    return dueInRangePool();
}

export function collectDueThisWeekTasks() {
    return collectDueThisWeekPool();
}

export function collectDueThisWeekDoneTasks() {
    return collectDueThisWeekPool().filter(function(t) {
        return getStatusGroup(t.fields.status.name || '') === 'done';
    });
}

export function getHistoricalStatus(t, latestSprint, thisSprint) {
    var current = (t.fields && t.fields.status && t.fields.status.name) || '';
    var histories = (t.changelog && t.changelog.histories) ? t.changelog.histories.slice() : [];
    histories.sort(function(a, b) { return new Date(a.created) - new Date(b.created); });

    var sprintChangeDate = findSprintBoundaryDate(histories, latestSprint, thisSprint);
    if (!sprintChangeDate && thisSprint) {
        var range = getSprintDateRange(thisSprint);
        if (range && range.end) sprintChangeDate = range.end;
    }
    if (!sprintChangeDate) return current;

    var lastBeforeTo = null;
    var firstAfterFrom = null;
    histories.forEach(function(h) {
        var d = new Date(h.created);
        if (!h.items) return;
        h.items.forEach(function(item) {
            if (!item.field || item.field.toLowerCase() !== 'status') return;
            if (d <= sprintChangeDate) {
                if (item.toString) lastBeforeTo = item.toString;
            } else if (!firstAfterFrom && item.fromString) {
                firstAfterFrom = item.fromString;
            }
        });
    });
    return lastBeforeTo || firstAfterFrom || current;
}

function findSprintBoundaryDate(histories, latestSprint, thisSprint) {
    var addedToLatest = null;
    var leftThis = null;
    (histories || []).forEach(function(h) {
        if (!h.items) return;
        var d = new Date(h.created);
        if (isNaN(d.getTime())) return;
        h.items.forEach(function(item) {
            if (!item.field || item.field.toLowerCase().indexOf('sprint') === -1) return;
            var toHasLatest = sprintChangeContains(item.toString, latestSprint);
            var fromHasLatest = sprintChangeContains(item.fromString, latestSprint);
            if (toHasLatest && !fromHasLatest) {
                if (!addedToLatest || d > addedToLatest) addedToLatest = d;
            }
            if (!thisSprint) return;
            var fromHasThis = sprintChangeContains(item.fromString, thisSprint);
            var toHasThis = sprintChangeContains(item.toString, thisSprint);
            if (fromHasThis && !toHasThis) {
                if (!leftThis || d > leftThis) leftThis = d;
            }
        });
    });
    return addedToLatest || leftThis || null;
}

function sprintChangeContains(raw, sprintName) {
    if (!raw || !sprintName) return false;
    return sprintNamesFromChange(raw).indexOf(sprintName) !== -1;
}

function sprintNamesFromChange(raw) {
    var str = String(raw || '');
    var names = [];
    var re = /name=([^,\]]+)/g;
    var m;
    while ((m = re.exec(str))) names.push(m[1].trim());
    if (names.length) return names;
    var jsonRe = /"name"\s*:\s*"([^"]+)"/g;
    while ((m = jsonRe.exec(str))) names.push(m[1].trim());
    if (names.length) return names;
    return str.split(/\s*,\s*/).map(function(part) { return part.trim(); }).filter(Boolean);
}

export function getDifficultyField(t) {
    if (!t.fields) return null;
    if (t.fields['customfield_12703']) {
        var val = t.fields['customfield_12703'];
        if (typeof val === 'object' && val.value) return val.value;
        if (typeof val === 'string' && val.trim() !== '') return val;
    }
    var diffFieldKey = null;
    for (var key in state.jiraFieldNames) {
        var fieldName = normalizeStr(state.jiraFieldNames[key]);
        if (fieldName === 'çətinlik' || fieldName.includes('çətin') || fieldName.includes('cetin') || fieldName.includes('difficult') || fieldName.includes('severity')) { diffFieldKey = key; break; }
    }
    if (diffFieldKey && t.fields[diffFieldKey]) {
        var val2 = t.fields[diffFieldKey];
        if (typeof val2 === 'object' && val2.value) return val2.value;
        if (typeof val2 === 'string' && val2.trim() !== '') return val2;
    }
    for (var key2 in t.fields) {
        var lowerKey = key2.toLowerCase();
        if (lowerKey.includes('çətin') || lowerKey.includes('cetin') || lowerKey.includes('difficult') || lowerKey.includes('severity')) {
            var val3 = t.fields[key2];
            if (val3 && typeof val3 === 'object' && val3.value) return val3.value;
            if (val3 && typeof val3 === 'string' && val3.trim() !== '') return val3;
        }
    }
    return null;
}

export function hasValidDifficulty(t) {
    var diff = getDifficultyField(t);
    if (!diff) return false;
    var normDiff = normalizeStr(diff);
    return normDiff !== 'none' && normDiff !== 'qeyd edilməyib' && normDiff !== 'qeyd edilmeyib' && normDiff !== 'null' && normDiff !== '';
}

function fieldValueText(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'string') return val.trim() || null;
    if (Array.isArray(val)) {
        var parts = val.map(fieldValueText).filter(Boolean);
        return parts.length ? parts.join(', ') : null;
    }
    if (typeof val === 'object') {
        if (val.value) return fieldValueText(val.value);
        if (val.name) return String(val.name).trim() || null;
        if (val.comment) return String(val.comment).trim() || null;
        if (val.body) return String(val.body).trim() || null;
    }
    return null;
}

export function getBlockReason(t) {
    if (!t || !t.fields) return null;
    var namedKey = null;
    for (var key in state.jiraFieldNames) {
        var fieldName = normalizeStr(state.jiraFieldNames[key]);
        if (fieldName.includes('bloklanma səbəb') || fieldName.includes('bloklanma sebeb') || fieldName.includes('block reason') || fieldName.includes('blocked reason')) {
            namedKey = key;
            break;
        }
        if (!namedKey && (fieldName.includes('bloklanma') || fieldName === 'blok' || fieldName.includes('block'))) {
            namedKey = key;
        }
    }
    if (namedKey) {
        var namedVal = fieldValueText(t.fields[namedKey]);
        if (namedVal) return namedVal;
    }
    for (var key2 in t.fields) {
        var lowerKey = key2.toLowerCase();
        if (lowerKey.includes('blok') || lowerKey.includes('blockreason') || lowerKey.includes('block_reason')) {
            var keyVal = fieldValueText(t.fields[key2]);
            if (keyVal) return keyVal;
        }
    }
    if (hasValidDifficulty(t)) return getDifficultyField(t);
    return null;
}

export const PHASE_FIELDS = [
    { date: 'customfield_15611', text: 'customfield_15612' },
    { date: 'customfield_15613', text: 'customfield_15614' },
    { date: 'customfield_15615', text: 'customfield_15616' },
    { date: 'customfield_15617', text: 'customfield_15618' },
    { date: 'customfield_15619', text: 'customfield_15620' }
];

export function parsePhaseDate(raw) {
    if (raw == null || raw === '') return null;
    try {
        if (typeof raw === 'number' && isFinite(raw)) {
            var dn = new Date(raw > 1e12 ? raw : raw * 1000);
            if (isNaN(dn.getTime())) return null;
            dn.setHours(12, 0, 0, 0);
            return dn;
        }
        if (typeof raw === 'object') {
            return parsePhaseDate(raw.value || raw.date || raw.formatted || raw.iso || raw.start || null);
        }
        var rawStr = String(raw).trim();
        if (!rawStr) return null;

        var iso = rawStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            var dIso = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
            dIso.setHours(12, 0, 0, 0);
            return dIso;
        }

        var dmy = rawStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
        if (dmy && parseInt(dmy[2], 10) >= 1 && parseInt(dmy[2], 10) <= 12) {
            var yearDmy = parseInt(dmy[3], 10);
            if (yearDmy < 100) yearDmy += 2000;
            var dDmy = new Date(yearDmy, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
            dDmy.setHours(12, 0, 0, 0);
            return dDmy;
        }

        var dmon = rawStr.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})/);
        if (dmon) {
            var monthsArr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var monName = dmon[2].charAt(0).toUpperCase() + dmon[2].slice(1).toLowerCase();
            var monthIdx = monthsArr.indexOf(monName);
            if (monthIdx >= 0) {
                var yearMon = parseInt(dmon[3], 10);
                if (yearMon < 100) yearMon += 2000;
                var dMon = new Date(yearMon, monthIdx, parseInt(dmon[1], 10));
                dMon.setHours(12, 0, 0, 0);
                return dMon;
            }
        }

        var parsed = new Date(rawStr);
        if (isNaN(parsed.getTime())) return null;
        parsed.setHours(12, 0, 0, 0);
        return parsed;
    } catch (e) {
        return null;
    }
}

export function getIssueFallbackDate(t) {
    if (!t || !t.fields) return null;
    var f = t.fields;
    return parsePhaseDate(f.resolutiondate)
        || parsePhaseDate(f['customfield_10808'])
        || parsePhaseDate(f.updated)
        || parsePhaseDate(f.created)
        || null;
}

export function formatDateObj(d) {
    if (!d) return '';
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '.' + mm + '.' + yyyy;
}

export function getPhaseFieldText(t, fieldKey) {
    if (!t.fields) return '';
    return extractPhaseText(t.fields[fieldKey]);
}

function extractPhaseText(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) {
        return val.map(extractPhaseText).filter(Boolean).join('. ');
    }
    if (typeof val === 'object') {
        if (val.value) return extractPhaseText(val.value);
        if (val.text) return String(val.text).trim();
        if (val.name) return String(val.name).trim();
        if (val.content) return extractPhaseText(val.content);
    }
    return '';
}

export function hasPhaseText(t) {
    if (!t || !t.fields) return false;
    for (var i = 0; i < PHASE_FIELDS.length; i++) {
        if (getPhaseFieldText(t, PHASE_FIELDS[i].text)) return true;
    }
    return false;
}

function isUsableDate(d) {
    return d instanceof Date && !isNaN(d.getTime());
}

function dateKey(d) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function isDateInReportPeriod(dateObj, periodStart, periodEnd) {
    if (!isUsableDate(dateObj)) return false;
    var n = dateKey(dateObj);
    var hasBound = false;
    if (isUsableDate(periodStart)) {
        hasBound = true;
        if (n < dateKey(periodStart)) return false;
    }
    if (isUsableDate(periodEnd)) {
        hasBound = true;
        if (n > dateKey(periodEnd)) return false;
    }
    if (!hasBound) return false;
    return true;
}

function isDateBeforeReportPeriod(dateObj, periodStart) {
    if (!isUsableDate(dateObj) || !isUsableDate(periodStart)) return false;
    return dateKey(dateObj) < dateKey(periodStart);
}

export function getRawPhaseEntries(t, periodStart, periodEnd) {
    if (!t || !t.fields) return [];
    var hasPeriod = !!(periodStart || periodEnd);
    var fallback = hasPeriod ? null : getIssueFallbackDate(t);
    var entries = [];
    PHASE_FIELDS.forEach(function(pf, idx) {
        var textStr = getPhaseFieldText(t, pf.text);
        if (!textStr) return;
        var ownDate = parsePhaseDate(t.fields[pf.date]);
        if (hasPeriod) {
            if (!isDateInReportPeriod(ownDate, periodStart, periodEnd)) return;
            entries.push({ date: ownDate, text: textStr, fieldIndex: idx });
            return;
        }
        entries.push({ date: ownDate || fallback, text: textStr, fieldIndex: idx });
    });
    entries.sort(function(a, b) {
        var ta = a.date ? a.date.getTime() : 0;
        var tb = b.date ? b.date.getTime() : 0;
        return ta - tb;
    });
    return entries;
}

export function parsePhaseEntriesFromText(text, fallbackDate) {
    var raw = String(text || '').trim();
    if (!raw) return [];
    var re = /(\d{1,2}[./]\d{1,2}[./]\d{4})(?:\s*tarixində)?/gi;
    var hits = [];
    var m;
    while ((m = re.exec(raw)) !== null) {
        var d = parsePhaseDate(m[1]);
        if (!d) continue;
        hits.push({ index: m.index, end: m.index + m[0].length, date: d });
    }
    if (hits.length === 0) {
        if (!isUsableDate(fallbackDate)) return [];
        return [{ date: fallbackDate, text: raw }];
    }
    var preamble = raw.slice(0, hits[0].index).trim();
    var entries = [];
    for (var i = 0; i < hits.length; i++) {
        var from = hits[i].end;
        var to = i + 1 < hits.length ? hits[i + 1].index : raw.length;
        var chunk = raw.slice(from, to).replace(/^[\s,;:\-–—]+/, '').replace(/[\s,;:\-–—]+$/, '').trim();
        if (i === 0 && preamble) chunk = (chunk ? preamble + ' ' + chunk : preamble).trim();
        if (!chunk) continue;
        entries.push({ date: hits[i].date, text: chunk });
    }
    if (entries.length === 0 && isUsableDate(fallbackDate)) {
        return [{ date: fallbackDate, text: raw }];
    }
    return entries;
}

export function getDatedPhaseEntries(t) {
    if (!t || !t.fields) return [];
    var entries = [];
    PHASE_FIELDS.forEach(function(pf, idx) {
        var textStr = getPhaseFieldText(t, pf.text);
        if (!textStr) return;
        var fieldDate = parsePhaseDate(t.fields[pf.date]);
        if (isUsableDate(fieldDate)) {
            entries.push({
                date: fieldDate,
                text: textStr.replace(/^\d{1,2}[./]\d{1,2}[./]\d{4}(?:\s*tarixində)?\s*/i, '').trim() || textStr,
                fieldIndex: idx
            });
            return;
        }
        var parts = parsePhaseEntriesFromText(textStr, null);
        for (var i = 0; i < parts.length; i++) {
            parts[i].fieldIndex = idx;
            entries.push(parts[i]);
        }
    });
    return entries;
}

export function selectPhasesForReport(entries, periodStart, periodEnd) {
    var dated = [];
    (entries || []).forEach(function(e) {
        if (!e || !e.text || !isUsableDate(e.date)) return;
        dated.push(e);
    });
    if (dated.length === 0) return [];
    dated.sort(function(a, b) { return a.date - b.date; });

    var startOk = isUsableDate(periodStart);
    var endOk = isUsableDate(periodEnd);
    if (!startOk && !endOk) {
        return [dated[dated.length - 1]];
    }

    var inPeriod = [];
    var previous = [];
    dated.forEach(function(e) {
        if (isDateInReportPeriod(e.date, periodStart, periodEnd)) {
            inPeriod.push(e);
            return;
        }
        if (!startOk || isDateBeforeReportPeriod(e.date, periodStart)) previous.push(e);
    });
    if (inPeriod.length > 0) return inPeriod;
    if (previous.length === 0) return [];
    return [previous[previous.length - 1]];
}

export function getReportPhaseEntries(t, periodStart, periodEnd) {
    return selectPhasesForReport(getDatedPhaseEntries(t), periodStart, periodEnd);
}

var PHASE_PROPER_NOUNS = {
    'azərbaycan': 1, 'bakı': 1, 'gəncə': 1, 'sumqayıt': 1, 'naxçıvan': 1,
    'təbib': 1, 'medo': 1, 'idda': 1, 'iida': 1, 'dgd': 1, 'jira': 1
};

function azLowerChar(ch) {
    var map = {
        'A': 'a', 'B': 'b', 'C': 'c', 'Ç': 'ç', 'D': 'd', 'E': 'e', 'Ə': 'ə',
        'F': 'f', 'G': 'g', 'Ğ': 'ğ', 'H': 'h', 'X': 'x', 'I': 'ı', 'İ': 'i',
        'J': 'j', 'K': 'k', 'Q': 'q', 'L': 'l', 'M': 'm', 'N': 'n', 'O': 'o',
        'Ö': 'ö', 'P': 'p', 'R': 'r', 'S': 's', 'Ş': 'ş', 'T': 't', 'U': 'u',
        'Ü': 'ü', 'V': 'v', 'Y': 'y', 'Z': 'z'
    };
    return map[ch] != null ? map[ch] : ch.toLowerCase();
}

function azFold(s) {
    return String(s || '').split('').map(azLowerChar).join('');
}

function isAzLetter(ch) {
    return /[A-Za-zÇçƏəĞğIıİiÖöŞşÜü]/.test(ch);
}

function isAzUpperChar(ch) {
    return isAzLetter(ch) && ch !== azLowerChar(ch);
}

function isAllCapsWord(word) {
    var letters = '';
    var i;
    for (i = 0; i < word.length; i++) {
        if (isAzLetter(word.charAt(i))) letters += word.charAt(i);
    }
    if (letters.length < 2) return false;
    for (i = 0; i < letters.length; i++) {
        if (!isAzUpperChar(letters.charAt(i))) return false;
    }
    return true;
}

function firstPhaseWord(text) {
    var s = String(text || '');
    var i = 0;
    while (i < s.length && !isAzLetter(s.charAt(i)) && !/[0-9]/.test(s.charAt(i))) i++;
    if (i >= s.length) return { start: i, word: '' };
    var j = i;
    while (j < s.length) {
        var ch = s.charAt(j);
        if (isAzLetter(ch) || /[0-9]/.test(ch)) { j++; continue; }
        if ((ch === '-' || ch === '–' || ch === '—') && j + 1 < s.length && isAzLetter(s.charAt(j + 1))) {
            j++;
            continue;
        }
        break;
    }
    return { start: i, word: s.slice(i, j) };
}

function isPhaseProperNoun(word) {
    if (!word) return false;
    var stem = word.split(/[-–—]/)[0];
    if (isAllCapsWord(stem) || isAllCapsWord(word)) return true;
    return !!PHASE_PROPER_NOUNS[azFold(stem)];
}

export function lowercasePhaseTextAfterDate(text) {
    var s = String(text || '').trim();
    if (!s) return s;
    if (/^["«“„‟‹']/.test(s)) return s;
    var first = firstPhaseWord(s);
    if (!first.word || isPhaseProperNoun(first.word)) return s;
    var i = first.start;
    return s.slice(0, i) + azLowerChar(s.charAt(i)) + s.slice(i + 1);
}

export function formatPhaseEntriesText(entries) {
    return entries.map(function(e) {
        var body = lowercasePhaseTextAfterDate(e.text);
        if (e.date) return formatDateObj(e.date) + ' tarixində ' + body;
        return body;
    }).join(' ');
}

var QURUM_UNASSIGNED = 'Təyin edilməyib';
var qurumCanonCache = { fp: '', map: {} };

function cleanQurumDisplay(raw) {
    var s = decodeHtmlEntities(String(raw == null ? '' : raw));
    s = s.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
    s = s.replace(/[«»„“”‟‹›]/g, '"').replace(/[‘’‛]/g, "'");
    s = s.replace(/["']+/g, '');
    s = s.replace(/[–—−]/g, '-');
    s = s.replace(/\s*([,;|/])\s*/g, '$1 ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^[-,;.|/]+|[-,;.|/]+$/g, '').trim();
    return s;
}

function qurumStemKey(folded) {
    var s = String(folded || '')
        .replace(/\brespublikasinin\b/g, 'respublikasi')
        .replace(/\brespublikasina\b/g, 'respublikasi')
        .replace(/\brespublikasinda\b/g, 'respublikasi')
        .replace(/\brespublikasindan\b/g, 'respublikasi');
    var stripped = s.replace(/^(azerbaycan\s+respublikasi)\s+/, '').trim();
    if (stripped) s = stripped;
    return s
        .replace(/\bnazirliyi\b/g, 'nazirlik')
        .replace(/\bagentliyi\b/g, 'agentlik')
        .replace(/\bkomitesi\b/g, 'komite')
        .replace(/\bidareetmesi\b/g, 'idareetme')
        .replace(/\bidarasi\b/g, 'idare')
        .replace(/\bxidmeti\b/g, 'xidmet')
        .replace(/\baciq\s+sehmdar\s+cemiyyeti?\b/g, ' ')
        .replace(/\bqapali\s+sehmdar\s+cemiyyeti?\b/g, ' ')
        .replace(/\bmehdud\s+mesuliyyetli\s+cemiyyeti?\b/g, ' ')
        .replace(/\bsehmdar\s+cemiyyeti?\b/g, ' ')
        .replace(/\b(mmc|qsc|asc|llc|ltd|ojsc)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasOfficialQurumPrefix(lab) {
    return /azerbaycan\s+respublikasi/.test(foldAz(lab));
}

function qurumLabelScore(lab, count) {
    var f = foldAz(lab);
    var score = 0;
    if (hasOfficialQurumPrefix(lab)) score += 10000;
    if (/\brespublikasinin\b/.test(f)) score -= 200;
    if (/\baciq\s+sehmdar\s+cemiyyet/.test(f) || /\bqapali\s+sehmdar\s+cemiyyet/.test(f)
        || /\bmehdud\s+mesuliyyetli\s+cemiyyet/.test(f)) score += 800;
    score += String(lab || '').length;
    score += (count || 0) / 100;
    return score;
}

export function qurumMatchKey(raw) {
    var s = cleanQurumDisplay(raw);
    if (!s) return '';
    var parts = s.split(/\s*,\s*/).map(function(part) {
        return qurumStemKey(foldAz(part));
    }).filter(Boolean).sort();
    return parts.join('|');
}

function collectQurumFieldParts(val, out) {
    if (val == null || val === '') return;
    if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) collectQurumFieldParts(val[i], out);
        return;
    }
    if (typeof val === 'object') {
        collectQurumFieldParts(val.value || val.name || '', out);
        return;
    }
    if (typeof val === 'string' || typeof val === 'number') {
        var chunks = String(val).split(/\s*;\s*|\s*\|\s*/);
        for (var j = 0; j < chunks.length; j++) {
            var p = cleanQurumDisplay(chunks[j]);
            if (p) out.push(p);
        }
    }
}

function extractQurumParts(t) {
    if (!t || !t.fields) return [];
    var parts = [];
    collectQurumFieldParts(t.fields['customfield_13608'], parts);
    if (!parts.length) collectQurumFieldParts(t.fields['customfield_12424'], parts);
    var seen = {};
    var uniq = [];
    for (var i = 0; i < parts.length; i++) {
        var key = qurumMatchKey(parts[i]);
        if (!key || seen[key]) continue;
        seen[key] = true;
        uniq.push(parts[i]);
    }
    return uniq;
}

function qurumCanonFingerprint() {
    var tasks = state.allTasks || [];
    var idx = state.issueIndex || {};
    var keys = Object.keys(idx);
    return tasks.length + ':' + keys.length + ':'
        + ((tasks[0] && tasks[0].key) || '') + ':'
        + ((tasks[tasks.length - 1] && tasks[tasks.length - 1].key) || '');
}

function preferredQurumLabel(variants) {
    var best = '';
    var bestScore = -Infinity;
    Object.keys(variants).forEach(function(lab) {
        var score = qurumLabelScore(lab, variants[lab]);
        if (score > bestScore || (score === bestScore && lab.localeCompare(best, 'az') < 0)) {
            best = lab;
            bestScore = score;
        }
    });
    return best;
}

function qurumCanonMap() {
    var fp = qurumCanonFingerprint();
    if (qurumCanonCache.fp === fp) return qurumCanonCache.map;
    var counts = {};
    function addIssue(t) {
        var parts = extractQurumParts(t);
        for (var i = 0; i < parts.length; i++) {
            var key = qurumMatchKey(parts[i]);
            if (!key) continue;
            if (!counts[key]) counts[key] = {};
            counts[key][parts[i]] = (counts[key][parts[i]] || 0) + 1;
        }
    }
    var tasks = state.allTasks || [];
    for (var i = 0; i < tasks.length; i++) addIssue(tasks[i]);
    var idx = state.issueIndex || {};
    Object.keys(idx).forEach(function(k) { addIssue(idx[k]); });
    var map = {};
    Object.keys(counts).forEach(function(key) {
        map[key] = preferredQurumLabel(counts[key]);
    });
    qurumCanonCache = { fp: fp, map: map };
    return map;
}

export function canonicalQurumName(name) {
    if (name == null) return name;
    var cleaned = cleanQurumDisplay(name);
    if (!cleaned) return '';
    if (qurumMatchKey(cleaned) === qurumMatchKey(QURUM_UNASSIGNED)) return QURUM_UNASSIGNED;
    var key = qurumMatchKey(cleaned);
    if (!key) return cleaned;
    return qurumCanonMap()[key] || cleaned;
}

export function sameQurum(a, b) {
    var ka = qurumMatchKey(a || '');
    var kb = qurumMatchKey(b || '');
    if (!ka && !kb) return true;
    return ka === kb;
}

export function getQurumName(t) {
    var parts = extractQurumParts(t);
    if (!parts.length) return null;
    var seen = {};
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var label = canonicalQurumName(parts[i]);
        var key = qurumMatchKey(label);
        if (!key || seen[key]) continue;
        seen[key] = true;
        out.push(label);
    }
    if (!out.length) return null;
    if (out.length === 1) return out[0];
    out.sort(function(a, b) { return a.localeCompare(b, 'az'); });
    return out.join(', ');
}

function getStatusAsOfDate() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var win = getSelectedDueWindow();
    if (!win || !win.end) return today;
    var end = parseLocalDay(win.end);
    if (!end) return today;
    end.setHours(0, 0, 0, 0);
    if (end < today) {
        end.setDate(end.getDate() + 1);
        return end;
    }
    return today;
}

export function getDateStatus(t) {
    var dueDay = parseLocalDay(getTaskDueDate(t));
    if (!dueDay) return 'nodate';
    var statusGroup = getStatusGroup(t.fields && t.fields.status ? t.fields.status.name : '');
    if (statusGroup === 'done') {
        var resolved = parsePhaseDate(t.fields && (t.fields.resolutiondate || t.fields.updated));
        var resDay = parseLocalDay(resolved);
        if (!resDay) return 'ontime';
        if (resDay < dueDay) return 'early';
        if (resDay.getTime() === dueDay.getTime()) return 'ontime';
        return 'late';
    }
    var asOf = getStatusAsOfDate();
    if (dueDay < asOf) return 'late';
    return 'upcoming';
}

function parseSprintItem(item) {
    if (!item) return null;
    if (typeof item === 'object' && !Array.isArray(item) && item.name) {
        var objStart = item.startDate && String(item.startDate) !== '<null>' ? new Date(item.startDate) : null;
        var objEnd = item.endDate && String(item.endDate) !== '<null>' ? new Date(item.endDate) : null;
        return {
            name: item.name,
            start: objStart && !isNaN(objStart.getTime()) ? objStart : null,
            end: objEnd && !isNaN(objEnd.getTime()) ? objEnd : null,
            state: item.state || null,
            id: item.id != null ? Number(item.id) : 0
        };
    }
    var s = typeof item === 'string' ? item : JSON.stringify(item);
    var nameMatch = s.match(/name=([^,\]]+)/) || s.match(/"name"\s*:\s*"([^"]+)"/);
    if (!nameMatch) return null;
    var startMatch = s.match(/startDate=([^,\]]+)/) || s.match(/"startDate"\s*:\s*"([^"]+)"/);
    var endMatch = s.match(/endDate=([^,\]]+)/) || s.match(/"endDate"\s*:\s*"([^"]+)"/);
    var stateMatch = s.match(/state=([^,\]]+)/) || s.match(/"state"\s*:\s*"([^"]+)"/);
    var idMatch = s.match(/(?:^|[,\[{])id=(\d+)/) || s.match(/"id"\s*:\s*(\d+)/);
    var startRaw = startMatch && startMatch[1] !== '<null>' ? startMatch[1] : null;
    var endRaw = endMatch && endMatch[1] !== '<null>' ? endMatch[1] : null;
    var start = startRaw ? new Date(startRaw) : null;
    var end = endRaw ? new Date(endRaw) : null;
    return {
        name: nameMatch[1],
        start: start && !isNaN(start.getTime()) ? start : null,
        end: end && !isNaN(end.getTime()) ? end : null,
        state: stateMatch ? stateMatch[1] : null,
        id: idMatch ? parseInt(idMatch[1], 10) : 0
    };
}

function getSprintItemsOnIssue(t) {
    if (!t) return [];
    if (t._sprintItems) return t._sprintItems;
    var f = t.fields && t.fields.customfield_10101;
    if (!f) {
        t._sprintItems = [];
        return t._sprintItems;
    }
    var list = Array.isArray(f) ? f : [f];
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var parsed = parseSprintItem(list[i]);
        if (parsed) out.push(parsed);
    }
    t._sprintItems = out;
    return out;
}

function sprintOverlapsDateRange(sprint, startBound, endBound) {
    if (!sprint) return false;
    var sprintStart = sprint.start;
    var sprintEnd = sprint.end;
    if ((!sprintStart || !sprintEnd) && sprint.name) {
        var named = getSprintDateRange(sprint.name);
        if (named) {
            if (!sprintStart) sprintStart = named.start;
            if (!sprintEnd) sprintEnd = named.end;
        }
    }
    var a0 = sprintStart ? parseLocalDay(sprintStart) : null;
    var a1 = sprintEnd ? parseLocalDay(sprintEnd) : null;
    if (a1) a1.setHours(23, 59, 59, 999);
    if (!a0 && !a1) return false;
    if (startBound && a1 && a1 < startBound) return false;
    if (endBound && a0 && a0 > endBound) return false;
    return true;
}

function taskHasSprintOverlappingRange(t, startBound, endBound) {
    var items = getSprintItemsOnIssue(t);
    for (var i = 0; i < items.length; i++) {
        if (sprintOverlapsDateRange(items[i], startBound, endBound)) return true;
    }
    return false;
}

var sprintMetaCache = null;
var sprintMetaCacheRef = null;

function mergeSprintMeta(best, parsed) {
    if (!best) {
        return {
            name: parsed.name,
            start: parsed.start,
            end: parsed.end,
            state: parsed.state,
            id: parsed.id
        };
    }
    if (!best.start && parsed.start) best.start = parsed.start;
    if (!best.end && parsed.end) best.end = parsed.end;
    if (parsed.id && parsed.id > (best.id || 0)) best.id = parsed.id;
    if (parsed.state && (!best.state || String(parsed.state).toUpperCase() === 'ACTIVE')) best.state = parsed.state;
    return best;
}

function ensureSprintMetaCache() {
    var tasks = state.allTasks || [];
    if (sprintMetaCache && sprintMetaCacheRef === tasks) return sprintMetaCache;
    var map = {};
    for (var i = 0; i < tasks.length; i++) {
        var items = getSprintItemsOnIssue(tasks[i]);
        for (var j = 0; j < items.length; j++) {
            var parsed = items[j];
            if (!parsed || !parsed.name) continue;
            map[parsed.name] = mergeSprintMeta(map[parsed.name], parsed);
        }
    }
    sprintMetaCache = map;
    sprintMetaCacheRef = tasks;
    return map;
}

export function getSprintMeta(sprintName) {
    if (!sprintName || sprintName === 'all') return null;
    return ensureSprintMetaCache()[sprintName] || null;
}

export function getSprintDateRange(sprintName) {
    var meta = getSprintMeta(sprintName);
    if (!meta || !meta.start || !meta.end) return null;
    return { start: meta.start, end: meta.end };
}

export function getSprintNames(t) {
    return getSprintItemsOnIssue(t).map(function(s) { return s.name; }).filter(Boolean);
}

export function sprintSequenceNumber(name) {
    var m = String(name || '').match(/(\d+)\s*$/);
    if (!m) m = String(name || '').match(/\d+/);
    return m ? parseInt(m[1], 10) : 0;
}

export function sortSprintNames(names) {
    var metas = {};
    (names || []).forEach(function(n) { metas[n] = getSprintMeta(n); });
    return (names || []).slice().sort(function(a, b) {
        var numA = sprintSequenceNumber(a);
        var numB = sprintSequenceNumber(b);
        if (numA !== numB) return numB - numA;
        var ea = metas[a] && metas[a].end;
        var eb = metas[b] && metas[b].end;
        if (ea && eb) return eb.getTime() - ea.getTime();
        var idA = (metas[a] && metas[a].id) || 0;
        var idB = (metas[b] && metas[b].id) || 0;
        if (idA !== idB) return idB - idA;
        return String(b).localeCompare(String(a));
    });
}

export function currentSprintName(names) {
    var list = (names && names.length) ? names : sortSprintNames(collectAllSprintNames());
    var i;
    for (i = 0; i < list.length; i++) {
        var meta = getSprintMeta(list[i]);
        if (meta && String(meta.state || '').toUpperCase() === 'ACTIVE') return list[i];
    }
    return list[0] || '';
}

function collectAllSprintNames() {
    var set = {};
    (state.allTasks || []).forEach(function(t) {
        getSprintNames(t).forEach(function(n) { set[n] = true; });
    });
    return Object.keys(set);
}

var DIAG_NETICE_HEADINGS = [
    'Strategiya üzrə nəticə',
    'Texniki-texnoloji infrastruktur üzrə nəticə',
    'Xidmətlər üzrə nəticə',
    'Əməliyyat modelləri üzrə nəticə'
];

var ASSESS_NEARBY_IDS = ['customfield_17315', 'customfield_17318', 'customfield_17320'];
var ASSESS_RESERVED_IDS = {
    customfield_17316: true,
    customfield_17317: true,
    customfield_17319: true
};

function foldAz(str) {
    return normalizeStr(str)
        .replace(/ı/g, 'i')
        .replace(/ə/g, 'e')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ğ/g, 'g')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hayHasPhrase(hay, phrase) {
    var p = foldAz(phrase);
    if (!hay || !p) return false;
    if (hay.indexOf(p) !== -1) return true;
    return hay.replace(/ /g, '').indexOf(p.replace(/ /g, '')) !== -1;
}

function hayHasWord(hay, word) {
    var w = foldAz(word);
    if (!hay || !w) return false;
    return new RegExp('(?:^| )' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: |$)').test(hay);
}

function issueLabelTexts(t) {
    var labels = (t && t.fields && t.fields.labels) || [];
    var out = [];
    for (var i = 0; i < labels.length; i++) {
        var l = labels[i];
        if (typeof l === 'string') out.push(l);
        else if (l && typeof l === 'object') out.push(l.name || l.value || '');
    }
    return out;
}

function hasSelfLabel(t) {
    var labs = issueLabelTexts(t);
    for (var i = 0; i < labs.length; i++) {
        if (normalizeStr(labs[i]) === 'self') return true;
    }
    return false;
}

function looksLikeActivityDirectionName(name) {
    var folded = foldAz(name);
    if (!folded) return false;
    if (folded.indexOf('activity direction') !== -1) return true;
    return folded.indexOf('fealiyyet') !== -1 && folded.indexOf('istiqamet') !== -1;
}

var activityDirectionFieldId = null;
var ACTIVITY_DIR_CANDIDATE_IDS = [
    'customfield_17315', 'customfield_17318', 'customfield_17320'
];

export function collectActivityDirectionFieldIds() {
    var ids = [];
    var seen = {};
    function add(id) {
        if (!id || seen[id]) return;
        seen[id] = true;
        ids.push(id);
    }
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) continue;
        if (looksLikeActivityDirectionName(names[key])) add(key);
    }
    if (activityDirectionFieldId) add(activityDirectionFieldId);
    for (var i = 0; i < ACTIVITY_DIR_CANDIDATE_IDS.length; i++) add(ACTIVITY_DIR_CANDIDATE_IDS[i]);
    if (ids[0] && looksLikeActivityDirectionName(names[ids[0]] || '')) {
        activityDirectionFieldId = ids[0];
    }
    return ids;
}

function collectJiraOptionTexts(val, out) {
    if (val == null || val === '') return;
    if (typeof val === 'string' || typeof val === 'number') {
        out.push(String(val));
        return;
    }
    if (Array.isArray(val)) {
        for (var i = 0; i < val.length; i++) collectJiraOptionTexts(val[i], out);
        return;
    }
    if (typeof val === 'object') {
        if (val.value != null) collectJiraOptionTexts(val.value, out);
        else if (val.name != null) collectJiraOptionTexts(val.name, out);
        if (val.child) collectJiraOptionTexts(val.child, out);
    }
}

function mapActivityDirectionToCategory(val) {
    var texts = [];
    collectJiraOptionTexts(val, texts);
    var i;
    for (i = 0; i < texts.length; i++) {
        var hay = foldAz(texts[i]);
        if (!hay) continue;
        if (matchesMaqsadHay(hay)) return 'meqsed';
        if (hayHasWord(hay, 'isq')) return 'isq';
        if (hayHasWord(hay, 'exq')) return 'exq';
        if (hayHasPhrase(hay, 'diaqnostika')) return 'diag';
    }
    return null;
}

function readActivityDirectionValue(t) {
    var fields = (t && t.fields) || {};
    var ids = collectActivityDirectionFieldIds();
    var i;
    for (i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (!Object.prototype.hasOwnProperty.call(fields, id)) continue;
        var val = fields[id];
        if (val == null || val === '') continue;
        var names = state.jiraFieldNames || {};
        if (names[id]) {
            if (looksLikeActivityDirectionName(names[id])) return val;
            continue;
        }
        if (mapActivityDirectionToCategory(val) != null) return val;
        var texts = [];
        collectJiraOptionTexts(val, texts);
        var recognized = false;
        for (var ti = 0; ti < texts.length; ti++) {
            if (matchesMaqsadHay(foldAz(texts[ti]))) { recognized = true; break; }
        }
        if (recognized) return val;
    }
    for (var key in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        if (looksLikeActivityDirectionName((state.jiraFieldNames || {})[key])) {
            if (fields[key] != null && fields[key] !== '') return fields[key];
        }
    }
    return null;
}

function isMeqsedNovuFieldName(folded) {
    if (!folded) return false;
    if (folded.indexOf('muracietin novu') !== -1) return true;
    if (folded.indexOf('muraciet') !== -1 && folded.indexOf('nov') !== -1) return true;
    return folded.indexOf('meqseduygun') !== -1 && folded.indexOf('nov') !== -1;
}

function isMeqsedNeticeFieldName(folded) {
    if (!folded) return false;
    if (folded.indexOf('reyi netice') !== -1) return true;
    return folded.indexOf('meqseduygun') !== -1 && folded.indexOf('reyi') !== -1 && folded.indexOf('netice') !== -1;
}

function isMeqsedXidmetSayiFieldName(folded) {
    if (!folded) return false;
    if (folded.indexOf('exq') !== -1) return false;
    if (folded.indexOf('xidmet') === -1) return false;
    return folded.indexOf('say') !== -1 || folded.indexOf('count') !== -1 || folded.indexOf('eded') !== -1;
}

function isMeqsedXidmetMelumatFieldName(folded) {
    if (!folded) return false;
    if (folded.indexOf('exq') !== -1) return false;
    if (folded.indexOf('xidmet') === -1) return false;
    return folded.indexOf('melumat') !== -1 || folded.indexOf('barede') !== -1 || folded.indexOf('haqqinda') !== -1;
}

function isMeqsedDisplayFieldName(folded) {
    return isMeqsedNovuFieldName(folded)
        || isMeqsedNeticeFieldName(folded)
        || isMeqsedXidmetSayiFieldName(folded)
        || isMeqsedXidmetMelumatFieldName(folded);
}

export function collectMeqsedDisplayFieldIds() {
    var ids = [];
    var seen = {};
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) continue;
        if (ASSESS_RESERVED_IDS[key]) continue;
        var folded = foldAz(names[key]);
        if (isMeqsedDisplayFieldName(folded)) {
            if (!seen[key]) {
                seen[key] = true;
                ids.push(key);
            }
        }
    }
    return ids;
}

function formatJiraOptionText(val) {
    if (isEmptyJiraValue(val)) return '—';
    var texts = [];
    collectJiraOptionTexts(val, texts);
    var s = texts.map(function(t) { return String(t).trim(); }).filter(Boolean).join(', ');
    if (s) return s;
    return formatAssessmentFieldText(val);
}

function readFirstMatchingNamedField(t, pred) {
    var fields = (t && t.fields) || {};
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) continue;
        if (ASSESS_RESERVED_IDS[key]) continue;
        if (!pred(foldAz(names[key]))) continue;
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        if (!isEmptyJiraValue(fields[key])) return fields[key];
    }
    for (key in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        if (ASSESS_RESERVED_IDS[key]) continue;
        if (!pred(foldAz(names[key] || ''))) continue;
        if (!isEmptyJiraValue(fields[key])) return fields[key];
    }
    return null;
}

function formatMeqsedSayi(val) {
    if (isEmptyJiraValue(val)) return '—';
    var n = coerceScoreNumber(val);
    if (n != null) {
        if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
        return String(n);
    }
    var text = formatJiraOptionText(val);
    return text && text !== '—' ? text : '—';
}

export function getMeqsedInfo(t) {
    var novu = readFirstMatchingNamedField(t, isMeqsedNovuFieldName);
    var netice = readFirstMatchingNamedField(t, isMeqsedNeticeFieldName);
    var xidmetSayi = readFirstMatchingNamedField(t, isMeqsedXidmetSayiFieldName);
    var xidmetMelumat = readFirstMatchingNamedField(t, isMeqsedXidmetMelumatFieldName);
    return {
        novu: formatJiraOptionText(novu),
        netice: formatJiraOptionText(netice),
        xidmetSayi: formatMeqsedSayi(xidmetSayi),
        xidmetMelumat: formatJiraOptionText(xidmetMelumat)
    };
}

export function collectAssessmentHaystack(t) {
    var parts = [];
    var seen = {};
    var cur = t;
    var depth = 0;
    while (cur && depth < 10) {
        if (cur.key) {
            if (seen[cur.key]) break;
            seen[cur.key] = true;
        }
        var f = cur.fields || {};
        if (f.summary) parts.push(f.summary);
        if (f.issuetype && f.issuetype.name) parts.push(f.issuetype.name);
        var labs = issueLabelTexts(cur);
        for (var i = 0; i < labs.length; i++) parts.push(labs[i]);
        cur = getParentIssue(cur);
        depth++;
    }
    var dir = resolveDirection(t);
    if (dir && dir.fields && dir.fields.summary && (!dir.key || !seen[dir.key])) {
        parts.push(dir.fields.summary);
    }
    return foldAz(parts.filter(Boolean).join(' | '));
}

function matchesSelfAssessHay(hay) {
    return hayHasPhrase(hay, 'özünüqiymətləndirmə')
        || hayHasPhrase(hay, 'ozunuqiymetlendirme')
        || hayHasPhrase(hay, 'self assess')
        || hayHasPhrase(hay, 'self-assess')
        || hayHasPhrase(hay, 'selfassessment');
}

function matchesExqHay(hay) {
    return hayHasPhrase(hay, 'elektron xidmət')
        || hayHasPhrase(hay, 'elektron xidmet')
        || hayHasWord(hay, 'exq');
}

function matchesMaqsadHay(hay) {
    return hayHasPhrase(hay, 'məqsədəuyğun')
        || hayHasPhrase(hay, 'meqseduygun')
        || hayHasPhrase(hay, 'məqsədəuyğunluq');
}

function matchesDiagHay(hay) {
    return hayHasPhrase(hay, 'diaqnostika')
        || hayHasPhrase(hay, 'rəqəmsallaşma')
        || hayHasPhrase(hay, 'reqemsallasma');
}

function matchesIsqDirectionHay(hay) {
    if (!hay) return false;
    if (matchesMaqsadHay(hay) || matchesSelfAssessHay(hay) || matchesExqHay(hay) || matchesDiagHay(hay)) return false;
    if (hayHasWord(hay, 'isq')) return true;
    return hayHasPhrase(hay, 'informasiya') && hayHasPhrase(hay, 'sistem') && hayHasPhrase(hay, 'qiymət');
}

function directionSummaryHay(dir) {
    if (!dir || !dir.fields) return '';
    return foldAz(dir.fields.summary || '');
}

function categoryFromDirectionHay(hay) {
    if (!hay) return null;
    if (matchesMaqsadHay(hay)) return null;
    if (matchesSelfAssessHay(hay)) return 'self';
    if (matchesExqHay(hay)) return 'exq';
    if (matchesDiagHay(hay)) return 'diag';
    if (matchesIsqDirectionHay(hay)) return 'isq';
    return null;
}

function listedDirectionByKey(key) {
    if (!key) return null;
    var list = state.allDirections || [];
    for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].key === key) return list[i];
    }
    return null;
}

export function classifyAssessmentNode(node) {
    if (hasSelfLabel(node)) return 'self';
    return mapActivityDirectionToCategory(readActivityDirectionValue(node));
}

var assessChildIndex = null;
var assessChildIndexRef = null;

function getAssessChildIndex() {
    if (assessChildIndex && assessChildIndexRef === state.issueIndex) return assessChildIndex;
    var map = {};
    var idx = state.issueIndex || {};
    Object.keys(idx).forEach(function(k) {
        var issue = idx[k];
        var pk = issue && issue.fields && issue.fields.parent && issue.fields.parent.key;
        if (!pk) return;
        if (!map[pk]) map[pk] = [];
        map[pk].push(issue);
    });
    assessChildIndex = map;
    assessChildIndexRef = state.issueIndex;
    return map;
}

function qurumFromDescendants(t) {
    var childMap = getAssessChildIndex();
    var queue = [t];
    var seen = {};
    var qi = 0;
    while (qi < queue.length && qi < 80) {
        var node = queue[qi++];
        if (!node) continue;
        if (node !== t) {
            var q = getQurumName(node);
            if (q && String(q).trim()) return String(q).trim();
        }
        var key = node.key;
        if (key) {
            if (seen[key]) continue;
            seen[key] = true;
        }
        var stubs = (node.fields && node.fields.subtasks) || [];
        for (var i = 0; i < stubs.length; i++) {
            var st = stubs[i];
            queue.push((st && st.key && state.issueIndex[st.key]) ? state.issueIndex[st.key] : st);
        }
        var indexed = (key && childMap[key]) ? childMap[key] : [];
        for (var j = 0; j < indexed.length; j++) queue.push(indexed[j]);
    }
    return null;
}

export function classifyAssessmentCategory(t) {
    if (!t || !isTaskOrSubtaskType(t)) return null;
    if (hasSelfLabel(t)) return 'self';
    return mapActivityDirectionToCategory(readActivityDirectionValue(t));
}

var ASSESS_YEAR_RE = /\b(20(?:1[5-9]|2[0-9]|3[0-5]))\b/g;

function yearsFromText(s) {
    var out = [];
    var m;
    var re = new RegExp(ASSESS_YEAR_RE.source, 'g');
    var str = String(s || '');
    while ((m = re.exec(str))) {
        var y = Number(m[1]);
        if (y >= 2015 && y <= 2035) out.push(y);
    }
    return out;
}

function pushUniqueYear(list, y) {
    var n = Number(y);
    if (!isFinite(n) || n < 2015 || n > 2035) return;
    if (list.indexOf(n) === -1) list.push(n);
}

function pushYearFromDate(list, d) {
    if (d && typeof d.getFullYear === 'function' && !isNaN(d.getTime())) pushUniqueYear(list, d.getFullYear());
}

export function listAssessmentYears(t) {
    var years = [];
    if (!t) return years;
    var f = t.fields || {};
    yearsFromText(f.summary).forEach(function(y) { pushUniqueYear(years, y); });
    issueLabelTexts(t).forEach(function(lab) {
        yearsFromText(lab).forEach(function(y) { pushUniqueYear(years, y); });
    });
    var parent = getParentIssue(t);
    if (parent && parent.fields) {
        yearsFromText(parent.fields.summary).forEach(function(y) { pushUniqueYear(years, y); });
    }
    getSprintNames(t).forEach(function(n) {
        yearsFromText(n).forEach(function(y) { pushUniqueYear(years, y); });
    });
    pushYearFromDate(years, getTaskStartDate(t));
    pushYearFromDate(years, getTaskDueDate(t));
    PHASE_FIELDS.forEach(function(pf) {
        pushYearFromDate(years, parsePhaseDate(f[pf.date]));
    });
    pushYearFromDate(years, parsePhaseDate(f.resolutiondate));
    // Created is fallback only — never dual-match a 2025 assessment created in 2026.
    if (!years.length) {
        pushYearFromDate(years, getTaskCreatedDate(t));
    }
    return years;
}

export function getAssessmentYear(t) {
    var years = listAssessmentYears(t);
    return years.length ? years[0] : null;
}

export function getAssessmentTaskTime(t) {
    var d = getTaskStartDate(t) || getTaskCreatedDate(t);
    if (!d && t && t.fields) {
        d = parsePhaseDate(t.fields.resolutiondate) || parsePhaseDate(t.fields.updated);
    }
    return d ? d.getTime() : 0;
}

function shortenLabel(s, max) {
    var t = String(s || '').trim();
    var lim = max || 72;
    if (t.length > lim) return t.slice(0, lim - 1) + '…';
    return t;
}

export function getAssessmentQurumLabel(t) {
    var cur = t;
    var depth = 0;
    while (cur && depth < 10) {
        var q = getQurumName(cur);
        if (q && String(q).trim()) return String(q).trim();
        cur = getParentIssue(cur);
        depth++;
    }
    var dir = resolveDirection(t);
    if (dir && dir.fields && dir.fields.summary) {
        var ds = shortenLabel(dir.fields.summary);
        if (ds) return ds;
    }
    var parent = getParentIssue(t);
    if (parent && parent.fields && parent.fields.summary) {
        var ps = shortenLabel(parent.fields.summary);
        if (ps) return ps;
    }
    return (t && t.key) || '—';
}

function decodeHtmlEntities(s) {
    return String(s || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, function(_, n) {
            return String.fromCharCode(parseInt(n, 10));
        });
}

function stripMarkupToText(raw) {
    var s = String(raw || '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<h[1-6][^>]*>/gi, '\n§ ');
    s = s.replace(/<\/(h[1-6]|p|div|li|tr|table|ul|ol|blockquote)>/gi, '\n');
    s = s.replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, '\t');
    s = s.replace(/<[^>]+>/g, ' ');
    s = decodeHtmlEntities(s);
    s = s.replace(/^\s*h[1-6]\.\s+/gim, '§ ');
    s = s.replace(/^\s*#{1,6}\s+/gm, '§ ');
    s = s.replace(/\{color:[^}]*\}/gi, '');
    s = s.replace(/\{color\}/gi, '');
    s = s.replace(/\{\{|\}\}/g, '');
    s = s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$1');
    s = s.replace(/\[([^\]|]+)\]/g, '$1');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return s.trim();
}

function isAdfDoc(val) {
    return !!(val && typeof val === 'object' && !Array.isArray(val)
        && (val.type === 'doc' || (Array.isArray(val.content) && (val.type || val.version))));
}

function adfNodeText(node) {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(adfNodeText).join('');
    if (typeof node !== 'object') return '';
    if (node.type === 'hardBreak' || node.type === 'rule') return '\n';
    if (typeof node.text === 'string') return node.text;
    return adfNodeText(node.content);
}

function adfToMarkedText(node) {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) {
        return node.map(adfToMarkedText).join('');
    }
    if (typeof node !== 'object') return '';
    if (node.type === 'heading') return '\n§ ' + adfNodeText(node).trim() + '\n';
    if (node.type === 'hardBreak' || node.type === 'rule') return '\n';
    if (node.type === 'tableCell' || node.type === 'tableHeader') {
        return adfToMarkedText(node.content).replace(/\s+/g, ' ').trim() + '\t';
    }
    if (node.type === 'tableRow') {
        return adfToMarkedText(node.content).replace(/\t+$/, '') + '\n';
    }
    if (node.type === 'paragraph' || node.type === 'listItem' || node.type === 'blockquote') {
        return adfNodeText(node) + '\n';
    }
    if (typeof node.text === 'string') return node.text;
    return adfToMarkedText(node.content);
}

function canonicalNeticeLabel(raw) {
    var f = foldAz(raw);
    if (!f) return String(raw || '').trim();
    if (f.indexOf('strategiya') !== -1) return DIAG_NETICE_HEADINGS[0];
    if (f.indexOf('texniki') !== -1 || f.indexOf('infrastruktur') !== -1 || f.indexOf('texnoloj') !== -1) return DIAG_NETICE_HEADINGS[1];
    if (f.indexOf('xidmet') !== -1 && f.indexOf('say') === -1) return DIAG_NETICE_HEADINGS[2];
    if (f.indexOf('emeliyyat') !== -1) return DIAG_NETICE_HEADINGS[3];
    if (f.indexOf('diaqnostika') === -1 && f.indexOf('model') !== -1 && f.indexOf('netice') !== -1) {
        return DIAG_NETICE_HEADINGS[3];
    }
    return String(raw || '').replace(/^§\s*/, '').replace(/:\s*$/, '').trim();
}

function matchHeadingLine(line) {
    var t = String(line || '').trim();
    if (!t) return null;
    var marked = t.charAt(0) === '§';
    var s = t.replace(/^§\s*/, '').replace(/^h[1-6]\.\s*/i, '').replace(/^#{1,6}\s*/, '');
    var fs = foldAz(s);
    var i;
    for (i = 0; i < DIAG_NETICE_HEADINGS.length; i++) {
        var known = DIAG_NETICE_HEADINGS[i];
        var fk = foldAz(known);
        if (fs === fk || fs.indexOf(fk + ' ') === 0) {
            var rest = '';
            var colon = s.indexOf(':');
            if (colon !== -1) rest = s.slice(colon + 1).trim();
            return { label: known, rest: rest };
        }
    }
    var m = s.match(/^(.{3,90}üzrə\s+n[əe]tic[əe])\s*:?\s*(.*)$/i)
        || s.match(/^(.{3,90}uzre\s+netice)\s*:?\s*(.*)$/i);
    if (m && s.length < 140) return { label: canonicalNeticeLabel(m[1]), rest: m[2] || '' };
    if (marked) return { label: canonicalNeticeLabel(s.replace(/:\s*$/, '')), rest: '' };
    return null;
}

function splitNeticeText(text) {
    var s = stripMarkupToText(text);
    if (!s) return [];
    var lines = s.split(/\n/);
    var blocks = [];
    var curLabel = '';
    var curLines = [];
    function flush() {
        var value = curLines.join('\n').replace(/^\s+|\s+$/g, '');
        if (curLabel || value) blocks.push({ label: curLabel, value: value });
        curLabel = '';
        curLines = [];
    }
    var headingCount = 0;
    for (var i = 0; i < lines.length; i++) {
        var hit = matchHeadingLine(lines[i]);
        if (hit) {
            headingCount++;
            flush();
            curLabel = hit.label;
            if (hit.rest) curLines.push(hit.rest);
        } else {
            curLines.push(lines[i]);
        }
    }
    flush();
    if (headingCount === 0) {
        var inline = splitInlineNeticeHeadings(s);
        if (inline && inline.length) return inline;
        return [{ label: 'Ümumi nəticə', value: s }];
    }
    if (blocks.length === 1 && !blocks[0].label) {
        var inline2 = splitInlineNeticeHeadings(s);
        if (inline2 && inline2.length > 1) return inline2;
    }
    return blocks;
}

function splitInlineNeticeHeadings(text) {
    var re = /(Strategiya üzrə n[əe]tic[əe]|Texniki[- ]texnoloji(?:\s+infrastruktur)? üzrə n[əe]tic[əe]|Xidm[əe]tl[əe]r üzrə n[əe]tic[əe]|[ƏEEe]m[əe]liyyat modell[əe]ri üzrə n[əe]tic[əe])\s*:?\s*/gi;
    var matches = [];
    var m;
    while ((m = re.exec(text)) !== null) {
        matches.push({ index: m.index, end: m.index + m[0].length, label: canonicalNeticeLabel(m[1]) });
    }
    if (!matches.length) return null;
    var blocks = [];
    var preamble = text.slice(0, matches[0].index).trim();
    if (preamble && matches[0].index > 8) blocks.push({ label: 'Ümumi nəticə', value: preamble });
    for (var i = 0; i < matches.length; i++) {
        var from = matches[i].end;
        var to = i + 1 < matches.length ? matches[i + 1].index : text.length;
        blocks.push({ label: matches[i].label, value: text.slice(from, to).trim() });
    }
    return blocks;
}

function blocksFromNameValueList(arr) {
    var blocks = [];
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (item == null || item === '') continue;
        if (typeof item === 'string' || typeof item === 'number') {
            var asHeading = matchHeadingLine(String(item));
            if (asHeading) blocks.push({ label: asHeading.label, value: asHeading.rest || '' });
            else blocks.push({ label: '', value: String(item) });
            continue;
        }
        if (typeof item !== 'object') continue;
        var label = item.name || item.label || item.title || item.key || item.field || '';
        var value = item.value != null ? item.value
            : (item.content != null ? item.content
            : (item.text != null ? item.text
            : (item.body != null ? item.body
            : (item.result != null ? item.result : ''))));
        if (label || (value !== '' && value != null)) {
            blocks.push({
                label: canonicalNeticeLabel(label) || String(label || ''),
                value: typeof value === 'object' ? jiraValuePlainText(value) : String(value == null ? '' : value).trim()
            });
        }
    }
    return blocks;
}

function jiraValuePlainText(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'number' && isFinite(val)) return String(val);
    if (typeof val === 'boolean') return val ? 'bəli' : 'xeyr';
    if (typeof val === 'string') return stripMarkupToText(val);
    if (Array.isArray(val)) return val.map(jiraValuePlainText).filter(Boolean).join('\n');
    if (typeof val === 'object') {
        if (isAdfDoc(val)) return stripMarkupToText(adfToMarkedText(val));
        if (val.value != null && typeof val.value !== 'object') return String(val.value).trim();
        if (val.name && val.value == null && !val.content) return String(val.name).trim();
        if (val.text) return String(val.text).trim();
        if (val.body && typeof val.body === 'string') return stripMarkupToText(val.body);
        if (val.content) return jiraValuePlainText(val.content);
    }
    return '';
}

export function isEmptyJiraValue(val) {
    if (val == null || val === '') return true;
    if (typeof val === 'string' && !val.trim()) return true;
    if (typeof val === 'number') return false;
    if (Array.isArray(val) && !val.length) return true;
    if (typeof val === 'object') {
        if (isAdfDoc(val) && (!val.content || !val.content.length)) return true;
        if (!isAdfDoc(val) && !Array.isArray(val) && !Object.keys(val).length) return true;
    }
    var text = jiraValuePlainText(val);
    return !text.trim();
}

export function parseAssessmentNetice(raw) {
    if (raw == null || raw === '') return [];
    if (typeof raw === 'number' && isFinite(raw)) return [{ label: 'Ümumi nəticə', value: String(raw) }];
    if (typeof raw === 'boolean') return [{ label: 'Ümumi nəticə', value: raw ? 'bəli' : 'xeyr' }];
    if (typeof raw === 'string') {
        var trimmed = raw.trim();
        if (!trimmed) return [];
        if ((trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') && trimmed.length > 2) {
            try {
                var parsed = JSON.parse(trimmed);
                var nested = parseAssessmentNetice(parsed);
                if (nested.length) return nested;
            } catch (e) {}
        }
        return splitNeticeText(trimmed);
    }
    if (Array.isArray(raw)) {
        var fromArr = blocksFromNameValueList(raw);
        if (fromArr.length === 1 && !fromArr[0].label) return splitNeticeText(fromArr[0].value);
        return fromArr;
    }
    if (typeof raw === 'object') {
        if (isAdfDoc(raw)) return splitNeticeText(adfToMarkedText(raw));
        if (raw.value != null && (typeof raw.value === 'string' || typeof raw.value === 'number' || isAdfDoc(raw.value) || Array.isArray(raw.value))) {
            if (raw.name && typeof raw.value !== 'object') {
                return [{ label: canonicalNeticeLabel(raw.name) || raw.name, value: String(raw.value) }];
            }
            return parseAssessmentNetice(raw.value);
        }
        if (raw.content && (Array.isArray(raw.content) || isAdfDoc(raw))) return parseAssessmentNetice(raw.content);
        var keys = Object.keys(raw).filter(function(k) {
            return k !== 'self' && k !== 'id' && k !== 'type' && k !== 'version' && k !== 'schema';
        });
        if (!keys.length) return [];
        if (keys.length <= 3 && (raw.value != null || raw.name) && !raw.content) {
            var single = raw.value != null ? raw.value : raw.name;
            return parseAssessmentNetice(single);
        }
        var mapBlocks = [];
        for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki];
            var v = raw[key];
            if (typeof v === 'function') continue;
            mapBlocks.push({
                label: canonicalNeticeLabel(key) || key,
                value: typeof v === 'object' ? jiraValuePlainText(v) : String(v == null ? '' : v).trim()
            });
        }
        return mapBlocks.filter(function(b) { return b.label || b.value; });
    }
    return [];
}

function pickScoreField(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var keys = ['bal', 'score', 'ball', 'qiymet', 'qiymət', 'rating', 'mark', 'umumi_bal', 'overallScore'];
    var i;
    for (i = 0; i < keys.length; i++) {
        if (obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
    }
    var k;
    for (k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var fk = foldAz(k);
        if (fk === 'bal' || fk === 'score' || (fk.indexOf('bal') !== -1 && fk.indexOf('netice') === -1)) {
            var n = coerceScoreNumber(obj[k]);
            if (n != null) return obj[k];
        }
    }
    return null;
}

function pickTextField(obj) {
    if (!obj || typeof obj !== 'object') return '';
    var keys = ['netice', 'nəticə', 'result', 'text', 'description', 'comment', 'body', 'umumi_netice', 'ümumi nəticə', 'value'];
    var i;
    for (i = 0; i < keys.length; i++) {
        var v = obj[keys[i]];
        if (v == null || v === '' || typeof v === 'function') continue;
        if (keys[i] === 'value' && (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(v.trim())))) continue;
        if (typeof v === 'object') return jiraValuePlainText(v);
        return String(v).trim();
    }
    var k;
    for (k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var fk = foldAz(k);
        if (fk.indexOf('netice') === -1 && fk.indexOf('result') === -1 && fk.indexOf('tesvir') === -1) continue;
        if (fk.indexOf('istiqamet') !== -1) continue;
        var nv = obj[k];
        if (nv == null || nv === '' || typeof nv === 'function') continue;
        if (typeof nv === 'number' || (typeof nv === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(String(nv).trim()))) continue;
        return typeof nv === 'object' ? jiraValuePlainText(nv) : String(nv).trim();
    }
    return '';
}

function pickTitleField(obj) {
    if (!obj || typeof obj !== 'object') return '';
    var k;
    for (k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var fk = foldAz(k);
        if (fk.indexOf('istiqamet') === -1 && fk !== 'title' && fk !== 'ad' && fk !== 'name' && fk.indexOf('basliq') === -1) continue;
        var v = obj[k];
        if (v == null || v === '' || typeof v === 'function') continue;
        return typeof v === 'object' ? jiraValuePlainText(v) : String(v).trim();
    }
    return '';
}

function splitScoreAndResult(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return { score: null, text: '' };
    var score = null;
    var reBal = /(?:^|\n)\s*(?:bal|score|qiym[əe]t(?:l[əe]ndirm[əe])?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(?:\n|$)/i;
    var m = text.match(reBal);
    if (!m) m = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:\/\s*\d+(?:[.,]\d+)?)?\s*bal\b/i);
    if (m) {
        score = formatAssessmentScore(m[1]);
        text = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, '\n\n').trim();
    } else {
        var lines = text.split(/\n/);
        var first = lines[0].trim();
        var compactFirst = first.replace(/\s+/g, '');
        var n = coerceScoreNumber(first);
        if (n != null && /^[-–—]?\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?$/.test(compactFirst)) {
            score = formatAssessmentScore(n);
            text = lines.slice(1).join('\n').trim();
        }
    }
    return { score: score, text: text };
}

function isOverallNeticeLabel(label) {
    var lf = foldAz(label);
    if (!lf) return true;
    if (lf.length > 90) return false;
    if (lf.indexOf('strategiya') !== -1 || lf.indexOf('texniki') !== -1 || lf.indexOf('infrastruktur') !== -1) return false;
    if (lf.indexOf('xidmet') !== -1 || lf.indexOf('emeliyyat') !== -1) return false;
    if (lf.indexOf('umumi') !== -1 || lf.indexOf('yekun') !== -1 || lf === 'cem' || lf.indexOf('overall') !== -1 || lf.indexOf('total') !== -1) {
        return true;
    }
    return lf.indexOf('diaqnostika') !== -1 && lf.indexOf('netice') !== -1;
}

export function isDiagOverallLabel(label) {
    return isOverallNeticeLabel(label);
}

function knownDirectionTitle(label) {
    if (!label) return null;
    if (isOverallNeticeLabel(label)) return null;
    var canon = canonicalNeticeLabel(label);
    var i;
    for (i = 0; i < DIAG_NETICE_HEADINGS.length; i++) {
        if (canon === DIAG_NETICE_HEADINGS[i]) return DIAG_NETICE_HEADINGS[i];
        if (foldAz(canon) === foldAz(DIAG_NETICE_HEADINGS[i])) return DIAG_NETICE_HEADINGS[i];
    }
    return null;
}

function mergeDirSlot(prev, score, text) {
    var slot = prev || { score: '—', text: '' };
    if (score && score !== '—' && (slot.score === '—' || slot.score === '')) slot.score = score;
    if (text) {
        if (!slot.text) slot.text = text;
        else if (text !== slot.text && slot.text.indexOf(text) === -1) slot.text = slot.text + '\n' + text;
    }
    return slot;
}

function adfCollectTables(node, tables) {
    if (node == null) return;
    if (Array.isArray(node)) {
        node.forEach(function(n) { adfCollectTables(n, tables); });
        return;
    }
    if (typeof node !== 'object') return;
    if (node.type === 'table') {
        var rows = [];
        (node.content || []).forEach(function(row) {
            if (!row || row.type !== 'tableRow') return;
            var cells = (row.content || []).map(function(c) {
                return adfNodeText(c).replace(/\s+/g, ' ').trim();
            });
            if (cells.some(Boolean)) rows.push(cells);
        });
        if (rows.length) tables.push(rows);
    }
    if (node.content) adfCollectTables(node.content, tables);
}

var TABLE_HEADER_PHRASES = [
    'qiymetlendirme istiqameti',
    'umumi netice',
    'qiymetlendirme',
    'istiqametler',
    'istiqameti',
    'istiqamet',
    'sutun',
    'column',
    'basliq',
    'title',
    'result',
    'score',
    'netice',
    'umumi',
    'yekun',
    'ball',
    'bal',
    'name',
    'ad'
];

var OVERALL_TITLE_PHRASES = TABLE_HEADER_PHRASES.concat([
    'diaqnostika umumi neticesi',
    'diaqnostika umumi netice',
    'diaqnostika',
    'neticesi',
    'neticeleri',
    'neticeler'
]);

function stripPhrases(text, phrases) {
    var f = foldAz(text);
    if (!f) return '';
    var rest = ' ' + f + ' ';
    var i;
    for (i = 0; i < phrases.length; i++) {
        rest = rest.split(' ' + phrases[i] + ' ').join(' ');
        rest = ' ' + rest.replace(/\s+/g, ' ').trim() + ' ';
    }
    return foldAz(rest);
}

function stripTableHeaderPhrases(text) {
    return stripPhrases(text, TABLE_HEADER_PHRASES);
}

function isHeaderOnlyText(text) {
    var f = foldAz(text);
    if (!f) return false;
    return !stripTableHeaderPhrases(text);
}

function isOverallTitleDump(text) {
    var f = foldAz(text);
    if (!f) return false;
    var stripped = stripPhrases(text, OVERALL_TITLE_PHRASES);
    if (!stripped) return true;
    return !stripped.replace(/-?\d+(?:[.,]\d+)?/g, ' ').replace(/\s+/g, ' ').trim();
}

function isColumnHeaderToken(text) {
    return isHeaderOnlyText(text);
}

function isTableHeaderRow(cells) {
    if (!cells || !cells.length) return false;
    var nonempty = [];
    var i;
    for (i = 0; i < cells.length; i++) {
        var c = String(cells[i] == null ? '' : cells[i]).replace(/\s+/g, ' ').trim();
        if (c) nonempty.push(c);
    }
    if (!nonempty.length) return false;
    for (i = 0; i < nonempty.length; i++) {
        if (!isColumnHeaderToken(nonempty[i])) return isHeaderOnlyText(nonempty.join(' '));
    }
    return true;
}

function looksLikeFlattenedTable(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return false;
    var lines = raw.split(/\n/);
    var first = lines[0].replace(/\s+/g, ' ').trim();
    if (/^\|{1,2}.+\|/.test(first) && isHeaderOnlyText(first.replace(/\|/g, ' '))) return true;
    if (isHeaderOnlyText(first) || isTableHeaderRow(first.split(/\t/))) return true;
    if (raw.indexOf('\t') !== -1 && lines.length >= 2 && isTableHeaderRow(lines[0].split('\t'))) return true;
    var f = foldAz(raw);
    var hits = 0;
    var i;
    for (i = 0; i < DIAG_NETICE_HEADINGS.length; i++) {
        if (f.indexOf(foldAz(DIAG_NETICE_HEADINGS[i])) !== -1) hits++;
    }
    return hits >= 2 && (f.indexOf('bal') !== -1 || f.indexOf('istiqamet') !== -1);
}

function dropHeaderLines(text) {
    var lines = String(text == null ? '' : text).split(/\n/);
    var kept = [];
    var i;
    for (i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        if (isHeaderOnlyText(line) || isOverallTitleDump(line) || isTableHeaderRow(line.split(/\t/))) continue;
        kept.push(lines[i].replace(/\s+$/g, ''));
    }
    return kept.join('\n').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
}

function isDiagHeaderNoise(label, value, scoreHint) {
    if (knownDirectionTitle(label)) return false;
    var scoreNum = coerceScoreNumber(scoreHint);
    var val = String(value == null ? '' : value).trim();
    if (isOverallNeticeLabel(label) && (scoreNum != null || (val && !isHeaderOnlyText(val) && !looksLikeFlattenedTable(val)))) {
        return false;
    }
    if (isTableHeaderRow([label, value, scoreHint])) return true;
    if (isHeaderOnlyText(label) && (isHeaderOnlyText(val) || !val) && scoreNum == null) return true;
    if ((!label || isOverallNeticeLabel(label)) && (isHeaderOnlyText(val) || looksLikeFlattenedTable(val))) return true;
    if (isHeaderOnlyText(label) && scoreNum == null) return true;
    return false;
}

function classifyTableColumns(header) {
    var idx = { title: 0, score: -1, text: -1 };
    var i;
    for (i = 0; i < header.length; i++) {
        var f = foldAz(header[i]);
        if (!f) continue;
        if (f.indexOf('istiqamet') !== -1 || f.indexOf('ad') === 0 || f.indexOf('yon') !== -1 || f === 'name' || f.indexOf('basliq') !== -1) idx.title = i;
        else if (f.indexOf('bal') !== -1 || f.indexOf('score') !== -1 || (f.indexOf('qiymet') !== -1 && f.indexOf('istiqamet') === -1)) idx.score = i;
        else if (f.indexOf('netice') !== -1 || f.indexOf('result') !== -1 || f.indexOf('tesvir') !== -1) idx.text = i;
    }
    if (idx.score < 0 && header.length > 1 && idx.text !== 1) idx.score = 1;
    if (idx.text < 0 && header.length > 2 && idx.score !== 2) idx.text = 2;
    return idx;
}

function ingestDiagTable(rows, sink) {
    if (!rows || !rows.length) return false;
    var start = 0;
    var cols = { title: 0, score: 1, text: 2 };
    if (isTableHeaderRow(rows[0])) {
        cols = classifyTableColumns(rows[0]);
        start = 1;
    } else if (rows.length > 1 && !knownDirectionTitle(rows[0][0])) {
        var headerFold = foldAz(rows[0].join(' '));
        if (headerFold.indexOf('istiqamet') !== -1
            || (headerFold.indexOf('bal') !== -1 && headerFold.indexOf('netice') !== -1)) {
            cols = classifyTableColumns(rows[0]);
            start = 1;
        }
    }
    var sample = rows[start] || rows[0] || [];
    if (cols.score < 0 && sample.length > 1) cols.score = 1;
    if (cols.text < 0 && sample.length > 2) cols.text = 2;
    var any = false;
    var r;
    for (r = start; r < rows.length; r++) {
        var cells = rows[r];
        if (!cells || isTableHeaderRow(cells)) continue;
        var label = cells[cols.title] || cells[0] || '';
        var scoreRaw = cols.score >= 0 ? cells[cols.score] : '';
        var textRaw = cols.text >= 0 ? cells[cols.text] : '';
        if (!textRaw && cells.length === 2 && coerceScoreNumber(cells[1]) == null) textRaw = cells[1];
        if (!String(label || '').trim() && !String(textRaw || '').trim() && coerceScoreNumber(scoreRaw) == null) continue;
        sink(label, textRaw, scoreRaw);
        any = true;
    }
    return any;
}

function ingestHtmlTables(html, sink) {
    if (typeof html !== 'string' || !/<table[\s>]/i.test(html)) return false;
    var any = false;
    html.replace(/<table\b[\s\S]*?<\/table>/gi, function(tableHtml) {
        var rows = [];
        tableHtml.replace(/<tr\b[\s\S]*?<\/tr>/gi, function(tr) {
            var cells = [];
            tr.replace(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi, function(cell) {
                cells.push(stripMarkupToText(cell).replace(/\s+/g, ' ').trim());
                return '';
            });
            if (cells.some(Boolean)) rows.push(cells);
            return '';
        });
        if (rows.length && ingestDiagTable(rows, sink)) any = true;
        return '';
    });
    return any;
}

function ingestStructuredNetice(raw, sink) {
    if (raw == null || raw === '') return false;
    if (typeof raw === 'string') {
        var trimmed = raw.trim();
        if ((trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') && trimmed.length > 2) {
            try { return ingestStructuredNetice(JSON.parse(trimmed), sink); } catch (e) {}
        }
        return ingestHtmlTables(trimmed, sink);
    }
    if (Array.isArray(raw)) {
        var anyArr = false;
        var rowArrays = [];
        var onlyArrays = raw.length > 0;
        raw.forEach(function(item) {
            if (!Array.isArray(item)) onlyArrays = false;
        });
        if (onlyArrays) return ingestDiagTable(raw, sink);
        raw.forEach(function(item) {
            if (item && typeof item === 'object' && !isAdfDoc(item) && !Array.isArray(item)) {
                var label = item.name || item.label || item.title || item.key || item.field || item.istiqamet || pickTitleField(item) || '';
                var score = pickScoreField(item);
                var text = pickTextField(item);
                if (!text && item.value != null && typeof item.value !== 'object') text = String(item.value);
                if (label || score != null || text) {
                    sink(label, text, score);
                    anyArr = true;
                }
            } else if (Array.isArray(item)) {
                rowArrays.push(item);
            } else if (item && isAdfDoc(item)) {
                if (ingestStructuredNetice(item, sink)) anyArr = true;
            }
        });
        if (rowArrays.length && ingestDiagTable(rowArrays, sink)) anyArr = true;
        return anyArr;
    }
    if (typeof raw !== 'object') return false;
    if (isAdfDoc(raw)) {
        var tables = [];
        adfCollectTables(raw, tables);
        if (!tables.length) return false;
        tables.forEach(function(rows) { ingestDiagTable(rows, sink); });
        return true;
    }
    if (raw.value != null && typeof raw.value === 'object') return ingestStructuredNetice(raw.value, sink);
    if (raw.content && (Array.isArray(raw.content) || isAdfDoc(raw.content))) {
        var fromContent = ingestStructuredNetice(raw.content, sink);
        if (fromContent) return true;
    }
    var keys = Object.keys(raw).filter(function(k) {
        return k !== 'self' && k !== 'id' && k !== 'type' && k !== 'version' && k !== 'schema';
    });
    if (!keys.length) return false;
    var headerKeyCount = 0;
    var hk;
    for (hk = 0; hk < keys.length; hk++) {
        if (isColumnHeaderToken(keys[hk])) headerKeyCount++;
    }
    if (headerKeyCount >= 2) {
        sink(pickTitleField(raw), pickTextField(raw), pickScoreField(raw));
        return true;
    }
    var anyObj = false;
    var ki;
    for (ki = 0; ki < keys.length; ki++) {
        var key = keys[ki];
        var v = raw[key];
        if (typeof v === 'function' || v == null) continue;
        if (v && typeof v === 'object' && !isAdfDoc(v) && !Array.isArray(v)) {
            sink(key, pickTextField(v) || jiraValuePlainText(v), pickScoreField(v));
            anyObj = true;
        } else if (typeof v === 'number' || typeof v === 'string') {
            sink(key, typeof v === 'string' ? v : '', typeof v === 'number' ? v : null);
            anyObj = true;
        }
    }
    return anyObj;
}

function ingestTabAndWikiTables(text, sink) {
    var any = false;
    var lines = String(text || '').split(/\n/);
    var tabRows = [];
    var wikiRows = [];
    function flushWiki() {
        if (wikiRows.length >= 2) {
            if (ingestDiagTable(wikiRows, sink)) any = true;
        }
        wikiRows = [];
    }
    var i;
    for (i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('\t') !== -1) {
            tabRows.push(line.split('\t').map(function(c) { return c.trim(); }));
        }
        var t = line.trim();
        if (/^\|{1,2}.+\|{1,2}$/.test(t) || /^\|{1,2}.+\|/.test(t)) {
            var cells = t.replace(/^\|{1,2}\s*/, '').replace(/\s*\|{1,2}$/, '').split(/\|{1,2}/).map(function(c) { return c.trim(); });
            if (cells.length) wikiRows.push(cells);
        } else {
            flushWiki();
        }
    }
    flushWiki();
    if (tabRows.length >= 2 && ingestDiagTable(tabRows, sink)) any = true;
    return any;
}

export function parseDiagUmumiNetice(raw) {
    var dirMap = {};
    var extras = [];
    var overallScore = null;
    var overallText = '';
    var unmapped = [];

    function sink(label, value, scoreHint) {
        var split = splitScoreAndResult(value);
        var score = null;
        var hintNum = coerceScoreNumber(scoreHint);
        if (hintNum != null) {
            score = formatAssessmentScore(hintNum);
        } else if (scoreHint != null && scoreHint !== '' && !isColumnHeaderToken(scoreHint)) {
            var hs = formatAssessmentScore(scoreHint);
            if (hs !== '—' && !isHeaderOnlyText(hs)) score = hs;
        }
        if (!score) score = split.score;
        if (score && isHeaderOnlyText(score)) score = null;
        var text = split.text;
        if (isDiagHeaderNoise(label, text, scoreHint)) return;
        var title = knownDirectionTitle(label);
        if (title) {
            dirMap[title] = mergeDirSlot(dirMap[title], score, text);
            return;
        }
        if (isOverallNeticeLabel(label)) {
            if (score && score !== '—' && !overallScore) overallScore = score;
            if (text && !isHeaderOnlyText(text) && !isOverallTitleDump(text) && !looksLikeFlattenedTable(text)
                && (!overallText || overallText.indexOf(text) === -1)) {
                overallText = overallText ? overallText + '\n' + text : text;
            }
            return;
        }
        var extraTitle = canonicalNeticeLabel(label) || String(label || 'Digər');
        if (isHeaderOnlyText(extraTitle) || isColumnHeaderToken(extraTitle) || isOverallNeticeLabel(extraTitle)) {
            if (isOverallNeticeLabel(extraTitle) || isOverallNeticeLabel(label)) {
                if (score && score !== '—' && !overallScore) overallScore = score;
                if (text && !isHeaderOnlyText(text) && !isOverallTitleDump(text) && !looksLikeFlattenedTable(text)
                    && (!overallText || overallText.indexOf(text) === -1)) {
                    overallText = overallText ? overallText + '\n' + text : text;
                }
            }
            return;
        }
        var ei;
        for (ei = 0; ei < extras.length; ei++) {
            if (extras[ei].title === extraTitle && extras[ei].text === (text || '')) return;
        }
        extras.push({ title: extraTitle, score: score || '—', text: text || '' });
        unmapped.push(extraTitle);
    }

    ingestStructuredNetice(raw, sink);
    if (typeof raw === 'string') ingestHtmlTables(raw, sink);
    ingestTabAndWikiTables(typeof raw === 'string' ? stripMarkupToText(raw) : jiraValuePlainText(raw), sink);
    if (raw && typeof raw === 'object' && isAdfDoc(raw)) {
        ingestTabAndWikiTables(adfToMarkedText(raw), sink);
    }
    var blocks = parseAssessmentNetice(raw);
    var bi;
    for (bi = 0; bi < blocks.length; bi++) {
        var blk = blocks[bi];
        var blob = [blk.label, blk.value].filter(Boolean).join('\n');
        if (looksLikeFlattenedTable(blk.value) || looksLikeFlattenedTable(blob) || isHeaderOnlyText(blk.value)) {
            ingestHtmlTables(blk.value, sink);
            ingestTabAndWikiTables(blk.value, sink);
            if (isHeaderOnlyText(blk.value) || looksLikeFlattenedTable(blk.value) || isHeaderOnlyText(blob)) continue;
        }
        if (isHeaderOnlyText(blk.label) && !String(blk.value || '').trim()) continue;
        sink(blk.label, blk.value, null);
    }

    overallText = dropHeaderLines(overallText);
    if (overallText && looksLikeFlattenedTable(overallText)) {
        ingestTabAndWikiTables(overallText, sink);
        overallText = dropHeaderLines(overallText);
        if (isHeaderOnlyText(overallText) || looksLikeFlattenedTable(overallText) || isOverallTitleDump(overallText)) {
            overallText = '';
        }
    }
    if (overallText && (isHeaderOnlyText(overallText) || isOverallTitleDump(overallText))) overallText = '';
    extras = extras.filter(function(e) {
        return e && !isHeaderOnlyText(e.title) && !isColumnHeaderToken(e.title) && !isOverallNeticeLabel(e.title);
    });
    unmapped = unmapped.filter(function(t) {
        return t && !isHeaderOnlyText(t) && !isColumnHeaderToken(t) && !isOverallNeticeLabel(t);
    });

    if (!overallText && !overallScore && blocks.length === 1 && !blocks[0].label) {
        var onlyVal = dropHeaderLines(blocks[0].value);
        if (onlyVal && !looksLikeFlattenedTable(onlyVal) && !isHeaderOnlyText(onlyVal)) {
            var only = splitScoreAndResult(onlyVal);
            overallScore = only.score || overallScore;
            overallText = only.text || overallText;
        }
    }

    return {
        overall: { score: overallScore || '—', text: overallText || '' },
        directions: DIAG_NETICE_HEADINGS.map(function(title) {
            var d = dirMap[title] || { score: '—', text: '' };
            var text = d.text || '';
            if (isHeaderOnlyText(text) || isOverallTitleDump(text)) text = '';
            return { title: title, score: d.score || '—', text: text };
        }),
        extras: extras,
        unmapped: unmapped
    };
}

export function getDiagHeadline(t) {
    var parsed = parseDiagUmumiNetice(t && t.fields ? t.fields.customfield_17319 : null);
    if (parsed.overall.score && parsed.overall.score !== '—') return parsed.overall.score;
    var nearby = getDiagScore(t);
    if (nearby && nearby !== '—') return nearby;
    if (parsed.overall.text) {
        var ot = parsed.overall.text.replace(/\s+/g, ' ').trim();
        if (ot && !isHeaderOnlyText(ot) && !looksLikeFlattenedTable(ot)) {
            return shortenLabel(ot, 80);
        }
    }
    var i;
    for (i = 0; i < parsed.directions.length; i++) {
        if (parsed.directions[i].score && parsed.directions[i].score !== '—') {
            return parsed.directions[i].score;
        }
    }
    return '—';
}

export function findJiraFieldsByNeedles(needles) {
    var hits = [];
    var seen = {};
    var names = state.jiraFieldNames || {};
    var foldedNeedles = (needles || []).map(foldAz).filter(Boolean);
    var key;
    for (key in names) {
        if (!Object.prototype.hasOwnProperty.call(names, key)) continue;
        var folded = foldAz(names[key]);
        var ok = false;
        for (var i = 0; i < foldedNeedles.length; i++) {
            if (folded.indexOf(foldedNeedles[i]) !== -1) { ok = true; break; }
        }
        if (ok && !seen[key]) {
            seen[key] = true;
            hits.push({ id: key, name: names[key] });
        }
    }
    return hits;
}

function coerceScoreNumber(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number' && isFinite(val)) return val;
    if (typeof val === 'boolean') return null;
    if (Array.isArray(val)) {
        if (val.length === 1) return coerceScoreNumber(val[0]);
        return null;
    }
    if (typeof val === 'object') {
        if (isAdfDoc(val)) return coerceScoreNumber(jiraValuePlainText(val));
        return coerceScoreNumber(val.value != null ? val.value : (val.number != null ? val.number : val.amount));
    }
    var s = String(val).trim().replace(',', '.');
    if (!s) return null;
    var m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    var compact = s.replace(/\s+/g, '');
    if (compact.length > m[0].length + 6 && !/^\d/.test(compact)) return null;
    var n = parseFloat(m[0]);
    return isFinite(n) ? n : null;
}

export function formatAssessmentScore(val) {
    if (val == null || val === '') return '—';
    var n = coerceScoreNumber(val);
    if (n != null) {
        if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
        return String(Math.round(n * 10) / 10);
    }
    if (typeof val === 'string') {
        var t = stripMarkupToText(val);
        return t || '—';
    }
    var text = jiraValuePlainText(val);
    return text || '—';
}

export function formatAssessmentFieldText(val) {
    if (isEmptyJiraValue(val)) return '—';
    var blocks = parseAssessmentNetice(val);
    if (!blocks.length) return formatAssessmentScore(val);
    if (blocks.length === 1) {
        var only = blocks[0];
        if (!only.label || foldAz(only.label).indexOf('umumi') !== -1) return only.value || '—';
        return (only.label + ': ' + (only.value || '—')).trim();
    }
    return blocks.map(function(b) {
        if (b.label && b.value) return b.label + ': ' + b.value;
        return b.value || b.label || '';
    }).filter(Boolean).join(' · ') || '—';
}

function fieldNameFold(id) {
    return foldAz((state.jiraFieldNames && state.jiraFieldNames[id]) || '');
}

function readIssueField(t, id) {
    if (!t || !t.fields || !id) return null;
    if (!Object.prototype.hasOwnProperty.call(t.fields, id)) return null;
    return t.fields[id];
}

export function getDiagScore(t) {
    var named = findJiraFieldsByNeedles(['diaqnostika bal', 'diaqnostika balı', 'rəqəmsallaşma bal']);
    var i;
    for (i = 0; i < named.length; i++) {
        if (ASSESS_RESERVED_IDS[named[i].id]) continue;
        var nv = readIssueField(t, named[i].id);
        if (!isEmptyJiraValue(nv)) {
            var ns = formatAssessmentScore(nv);
            if (ns !== '—') return ns;
        }
    }
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (ASSESS_RESERVED_IDS[key]) continue;
        var fn = foldAz(names[key]);
        if (fn.indexOf('diaqnostika') !== -1 && (fn.indexOf('bal') !== -1 || fn.indexOf('score') !== -1)) {
            var dv = readIssueField(t, key);
            if (!isEmptyJiraValue(dv)) {
                var ds = formatAssessmentScore(dv);
                if (ds !== '—') return ds;
            }
        }
    }
    for (i = 0; i < ASSESS_NEARBY_IDS.length; i++) {
        var nid = ASSESS_NEARBY_IDS[i];
        var nn = fieldNameFold(nid);
        if (nn && (nn.indexOf('isq') !== -1 || nn.indexOf('exq') !== -1 || nn.indexOf('ozunuqiymetlendirme') !== -1 || nn.indexOf('elektron') !== -1)) continue;
        if (nn && nn.indexOf('xidmet') !== -1 && nn.indexOf('say') !== -1) continue;
        var nearbyVal = readIssueField(t, nid);
        var nearbyNum = coerceScoreNumber(nearbyVal);
        if (nearbyNum != null && (nn.indexOf('bal') !== -1 || nn.indexOf('diaqnostika') !== -1 || nn.indexOf('netice') !== -1 || !nn)) {
            if (nn.indexOf('ozunu') !== -1) continue;
            return formatAssessmentScore(nearbyVal);
        }
    }
    var raw19 = readIssueField(t, 'customfield_17319');
    var simple19 = coerceScoreNumber(raw19);
    var blocks = parseAssessmentNetice(raw19);
    if (simple19 != null && blocks.length <= 1) return formatAssessmentScore(raw19);
    for (i = 0; i < blocks.length; i++) {
        var lf = foldAz(blocks[i].label);
        if (lf.indexOf('umumi') !== -1 || lf.indexOf('yekun') !== -1 || lf.indexOf('cem') !== -1 || lf.indexOf('total') !== -1 || lf.indexOf('bal') !== -1) {
            var bn = coerceScoreNumber(blocks[i].value);
            if (bn != null) return formatAssessmentScore(blocks[i].value);
        }
    }
    return '—';
}

function isSelfAssessFieldName(folded) {
    return folded.indexOf('ozunuqiymetlendirme') !== -1
        || folded.indexOf('self assess') !== -1
        || folded.indexOf('selfassess') !== -1;
}

function isUmumiNeticeFieldName(folded) {
    if (!folded) return false;
    if (folded.indexOf('isq') !== -1 || folded.indexOf('exq') !== -1) return false;
    return folded.indexOf('umumi') !== -1 && folded.indexOf('netice') !== -1;
}

export function readUmumiNeticeRaw(t) {
    var raw = readIssueField(t, 'customfield_17319');
    if (!isEmptyJiraValue(raw)) return raw;
    var named = findJiraFieldsByNeedles(['ümumi nəticə', 'umumi netice', 'ümumi nəticəsi']);
    var i;
    for (i = 0; i < named.length; i++) {
        if (named[i].id === 'customfield_17316' || named[i].id === 'customfield_17317') continue;
        var nv = readIssueField(t, named[i].id);
        if (!isEmptyJiraValue(nv)) return nv;
    }
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (key === 'customfield_17316' || key === 'customfield_17317') continue;
        if (!isUmumiNeticeFieldName(foldAz(names[key]))) continue;
        var namedVal = readIssueField(t, key);
        if (!isEmptyJiraValue(namedVal)) return namedVal;
    }
    for (i = 0; i < ASSESS_NEARBY_IDS.length; i++) {
        var id = ASSESS_NEARBY_IDS[i];
        if (!isUmumiNeticeFieldName(fieldNameFold(id))) continue;
        var nearby = readIssueField(t, id);
        if (!isEmptyJiraValue(nearby)) return nearby;
    }
    return raw;
}

export function parseTaskUmumiNetice(t) {
    return parseDiagUmumiNetice(readUmumiNeticeRaw(t));
}

export function getSelfAssessInfo(t) {
    var fields = findJiraFieldsByNeedles([
        'özünüqiymətləndirmə', 'ozunuqiymetlendirme', 'self-assess', 'self assess', 'selfassess'
    ]);
    var seen = {};
    var list = [];
    var i;
    for (i = 0; i < fields.length; i++) {
        if (ASSESS_RESERVED_IDS[fields[i].id]) continue;
        seen[fields[i].id] = true;
        list.push(fields[i]);
    }
    for (i = 0; i < ASSESS_NEARBY_IDS.length; i++) {
        var id = ASSESS_NEARBY_IDS[i];
        if (seen[id] || ASSESS_RESERVED_IDS[id]) continue;
        var nm = (state.jiraFieldNames && state.jiraFieldNames[id]) || '';
        var fn = foldAz(nm);
        if (fn && (fn.indexOf('isq') !== -1 || fn.indexOf('exq') !== -1 || fn.indexOf('diaqnostika') !== -1 || fn.indexOf('elektron xidmet') !== -1)) continue;
        seen[id] = true;
        list.push({ id: id, name: nm });
    }
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (seen[key] || ASSESS_RESERVED_IDS[key]) continue;
        if (isSelfAssessFieldName(foldAz(names[key]))) {
            seen[key] = true;
            list.push({ id: key, name: names[key] });
        }
    }
    var score = null;
    var detailRaw = null;
    var detailName = '';
    var usedIds = [];
    for (i = 0; i < list.length; i++) {
        var f = list[i];
        var val = readIssueField(t, f.id);
        if (isEmptyJiraValue(val)) continue;
        usedIds.push(f.id);
        var fname = foldAz(f.name);
        var blocks = parseAssessmentNetice(val);
        var num = coerceScoreNumber(val);
        var multi = blocks.length > 1 || (blocks.length === 1 && blocks[0].label && foldAz(blocks[0].label).indexOf('umumi') === -1);
        var nameLooksDetail = fname.indexOf('netice') !== -1 || fname.indexOf('etrafli') !== -1 || fname.indexOf('tesvir') !== -1;
        var nameLooksScore = fname.indexOf('bal') !== -1 || fname.indexOf('score') !== -1;
        if (multi || nameLooksDetail) {
            if (detailRaw == null) {
                detailRaw = val;
                detailName = f.name || f.id;
            }
            if (num != null && score == null) score = num;
        } else if (num != null || nameLooksScore) {
            if (score == null) score = num != null ? num : val;
            if (detailRaw == null && typeof val === 'string' && stripMarkupToText(val).length > 12 && num == null) {
                detailRaw = val;
                detailName = f.name || f.id;
            }
        } else if (detailRaw == null) {
            detailRaw = val;
            detailName = f.name || f.id;
            if (num != null && score == null) score = num;
        }
    }
    var umumiRaw = readUmumiNeticeRaw(t);
    if (detailRaw == null && !isEmptyJiraValue(umumiRaw)) {
        detailRaw = umumiRaw;
        detailName = 'Ümumi Nəticə';
        if (usedIds.indexOf('customfield_17319') === -1) usedIds.push('customfield_17319');
    }
    if (detailRaw == null && t && t.fields && !isEmptyJiraValue(t.fields.description)) {
        detailRaw = t.fields.description;
        detailName = 'Təsvir';
    }
    var parsedUmumi = parseDiagUmumiNetice(umumiRaw);
    if (score == null && parsedUmumi.overall && parsedUmumi.overall.score && parsedUmumi.overall.score !== '—') {
        score = parsedUmumi.overall.score;
    }
    var detailBlocks = parseAssessmentNetice(detailRaw);
    if (!detailBlocks.length && detailRaw != null && !isEmptyJiraValue(detailRaw)) {
        var plain = jiraValuePlainText(detailRaw);
        if (plain) detailBlocks = [{ label: detailName || 'Ətraflı', value: plain }];
    }
    return {
        score: score != null ? formatAssessmentScore(score) : '—',
        blocks: detailBlocks,
        detailName: detailName,
        fieldIds: usedIds,
        parsedUmumi: parsedUmumi
    };
}

export function getExqServiceCount(t) {
    var named = findJiraFieldsByNeedles(['xidmət sayı', 'xidmet sayi', 'xidmət say', 'neçə xidmət', 'nece xidmet']);
    var i;
    for (i = 0; i < named.length; i++) {
        if (ASSESS_RESERVED_IDS[named[i].id]) continue;
        var nv = coerceScoreNumber(readIssueField(t, named[i].id));
        if (nv != null) return nv;
    }
    var names = state.jiraFieldNames || {};
    var key;
    for (key in names) {
        if (ASSESS_RESERVED_IDS[key]) continue;
        var fn = foldAz(names[key]);
        var hasX = fn.indexOf('xidmet') !== -1;
        var hasC = fn.indexOf('say') !== -1 || fn.indexOf('count') !== -1 || fn.indexOf('eded') !== -1 || fn.indexOf('number') !== -1;
        if (hasX && hasC) {
            var cv = coerceScoreNumber(readIssueField(t, key));
            if (cv != null) return cv;
        }
    }
    var childCount = 0;
    var seen = {};
    function considerChild(issue) {
        if (!issue || !issue.key || seen[issue.key] || issue.key === t.key) return;
        seen[issue.key] = true;
        childCount++;
    }
    (state.allTasks || []).forEach(function(at) {
        if (!at || at.key === t.key || !isTaskOrSubtaskType(at)) return;
        var p = at.fields && at.fields.parent;
        if (p && p.key === t.key) considerChild(at);
    });
    if (childCount > 0) return childCount;
    var stubs = (t.fields && t.fields.subtasks) || [];
    if (stubs.length) {
        var relevant = 0;
        for (i = 0; i < stubs.length; i++) {
            var st = stubs[i];
            var sum = foldAz(st && st.fields && st.fields.summary);
            if (!sum || sum.indexOf('xidmet') !== -1 || sum.indexOf('exq') !== -1 || sum.indexOf('service') !== -1) relevant++;
        }
        return relevant || stubs.length;
    }
    return null;
}

export function hasAssessmentResult(category, t) {
    var f = t && t.fields ? t.fields : {};
    if (category === 'diag') return !isEmptyJiraValue(f.customfield_17319) || getDiagScore(t) !== '—';
    if (category === 'isq') return !isEmptyJiraValue(f.customfield_17316);
    if (category === 'self') {
        var info = getSelfAssessInfo(t);
        if (info.score !== '—' || (info.blocks && info.blocks.length > 0)) return true;
        var p = info.parsedUmumi;
        if (!p) return false;
        if (p.overall && ((p.overall.score && p.overall.score !== '—') || p.overall.text)) return true;
        if ((p.extras || []).length) return true;
        return (p.directions || []).some(function(d) {
            return d && ((d.score && d.score !== '—') || d.text);
        });
    }
    if (category === 'exq') return !isEmptyJiraValue(f.customfield_17317) || getExqServiceCount(t) != null;
    if (category === 'meqsed') {
        var m = getMeqsedInfo(t);
        return (m.novu && m.novu !== '—')
            || (m.netice && m.netice !== '—')
            || (m.xidmetSayi && m.xidmetSayi !== '—')
            || (m.xidmetMelumat && m.xidmetMelumat !== '—');
    }
    return false;
}
