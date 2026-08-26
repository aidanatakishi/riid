import { state } from './state.js';
import { normalizeStr } from './utils.js';

export function getParentIssue(t) {
    if (!t) return null;
    if (state.parentCache.hasOwnProperty(t.key)) return state.parentCache[t.key];
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
        var typeNameSub = f.issuetype ? normalizeStr(f.issuetype.name) : '';
        var isSubtaskType = typeNameSub.includes('alt') || typeNameSub.includes('sub');
        if (isSubtaskType && f.issuelinks && f.issuelinks.length > 0) {
            for (var li = 0; li < f.issuelinks.length; li++) {
                var linked = f.issuelinks[li].outwardIssue || f.issuelinks[li].inwardIssue;
                if (!linked) continue;
                var linkedType = linked.fields && linked.fields.issuetype ? normalizeStr(linked.fields.issuetype.name) : '';
                if (linkedType.includes('alt') || linkedType.includes('sub')) continue;
                if (state.issueIndex[linked.key]) { parent = state.issueIndex[linked.key]; }
                else {
                    var found4 = state.allTasks.find(function(at) { return at.key === linked.key; });
                    if (found4) { parent = found4; state.issueIndex[found4.key] = found4; }
                }
                if (parent) break;
            }
        }
    }
    state.parentCache[t.key] = parent;
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
    if (n.includes('həll') || n.includes('hel') || n.includes('bağlı') || n.includes('bagli') || n.includes('tamamla') || n === 'done' || n === 'closed' || n === 'resolved') return 'done';
    if (n.includes('planlaşdır') || n.includes('planlasdir') || n === 'planned' || n === 'to do') return 'planned';
    if (n.includes('icradadır') || n.includes('icradadir') || n === 'in progress' || n.includes('esd') || n.includes('rəy') || n.includes('rey') || n.includes('review')) return 'progress';
    if (n.includes('blok')) return 'blocked';
    if (n.includes('imtina')) return 'rejected';
    return 'other';
}

export function isDueThisWeek(t) {
    if (!t.fields) return false;
    var dueDateRaw = t.fields['customfield_10807'] || t.fields['duedate'];
    if (!dueDateRaw) return false;
    try {
        var dueStr = String(dueDateRaw).split('T')[0];
        var parts = dueStr.split('-');
        if (parts.length < 3) return false;
        var dueYear = parseInt(parts[0], 10);
        var dueMonth = parseInt(parts[1], 10) - 1; 
        var dueDay = parseInt(parts[2], 10);
        var dueDate = new Date(dueYear, dueMonth, dueDay);
        dueDate.setHours(0, 0, 0, 0);
        var now = new Date();
        var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        var bakuNow = new Date(utc + (4 * 3600000));
        bakuNow.setHours(0, 0, 0, 0);
        var dayOfWeek = bakuNow.getDay(); 
        var diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        var monday = new Date(bakuNow);
        monday.setDate(bakuNow.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);
        var sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return dueDate >= monday && dueDate <= sunday;
    } catch(e) { 
        return false; 
    }
}

export function getHistoricalStatus(t, latestSprint) {
    var taskSprints = getSprintNames(t);
    if (taskSprints.length <= 1) return t.fields.status.name;
    if (!latestSprint) return t.fields.status.name;
    if (t.changelog && t.changelog.histories) {
        var sprintChangeDate = null;
        t.changelog.histories.forEach(function(h) {
            if (h.items) {
                h.items.forEach(function(item) {
                    if (item.field && item.field.toLowerCase().indexOf('sprint') !== -1) {
                        var toString = item.toString || '';
                        if (toString.indexOf(latestSprint) !== -1) {
                            var d = new Date(h.created);
                            if (!sprintChangeDate || d > sprintChangeDate) sprintChangeDate = d;
                        }
                    }
                });
            }
        });
        if (sprintChangeDate) {
            var lastStatus = t.fields.status.name;
            t.changelog.histories.forEach(function(h) {
                var d = new Date(h.created);
                if (d <= sprintChangeDate) {
                    if (h.items) {
                        h.items.forEach(function(item) {
                            if (item.field && item.field.toLowerCase() === 'status') {
                                lastStatus = item.toString;
                            }
                        });
                    }
                }
            });
            return lastStatus;
        }
    }
    return t.fields.status.name;
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

const PHASE_FIELDS = [
    { date: 'customfield_15611', text: 'customfield_15612' }, 
    { date: 'customfield_15613', text: 'customfield_15614' }, 
    { date: 'customfield_15615', text: 'customfield_15616' }, 
    { date: 'customfield_15617', text: 'customfield_15618' }, 
    { date: 'customfield_15619', text: 'customfield_15620' }  
];

// Tarixi müqayisə/sıralama üçün Date obyektinə çevirir (həm YYYY-MM-DD, həm də DD/Mon/YYYY formatlarını dəstəkləyir)
export function parsePhaseDate(raw) {
    if (!raw) return null;
    try {
        var rawStr = String(raw);
        if (typeof raw === 'object' && raw.value) rawStr = String(raw.value);
        var datePart = rawStr.split('T')[0].trim();
        
        // Format 1: YYYY-MM-DD (məsələn, 2026-08-24)
        if (datePart.indexOf('-') !== -1) {
            var p = datePart.split('-');
            if (p.length !== 3) return null;
            var year = parseInt(p[0], 10), month = parseInt(p[1], 10), day = parseInt(p[2], 10);
            if (!year || !month || !day || month < 1 || month > 12) return null;
            var d = new Date(year, month - 1, day);
            d.setHours(12, 0, 0, 0);
            return d;
        }
        
        // Format 2: DD/Mon/YYYY (məsələn, 24/Aug/2026)
        if (datePart.indexOf('/') !== -1) {
            var p2 = datePart.split('/');
            if (p2.length !== 3) return null;
            var day2 = parseInt(p2[0], 10);
            var year2 = parseInt(p2[2], 10);
            var monthsArr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var month2 = monthsArr.indexOf(p2[1]) + 1;
            if (!year2 || !month2 || !day2) return null;
            var d2 = new Date(year2, month2 - 1, day2);
            d2.setHours(12, 0, 0, 0);
            return d2;
        }
        
        return null;
    } catch(e) { return null; }
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
    var val = t.fields[fieldKey];
    if (!val) return '';
    if (typeof val === 'object' && val.value) return String(val.value).trim();
    if (typeof val === 'string') return val.trim();
    return String(val).trim();
}

export function getRawPhaseEntries(t, periodStart, periodEnd) {
    if (!t || !t.fields) return [];
    var entries = [];
    PHASE_FIELDS.forEach(function(pf) {
        var dateObj = parsePhaseDate(t.fields[pf.date]);
        var textStr = getPhaseFieldText(t, pf.text);
        if (!dateObj || !textStr) return;
        if (periodStart && dateObj < periodStart) return;
        if (periodEnd && dateObj > periodEnd) return;
        entries.push({ date: dateObj, text: textStr });
    });
    entries.sort(function(a, b) { return a.date - b.date; });
    return entries;
}

export function formatPhaseEntriesText(entries) {
    return entries.map(function(e) {
        return formatDateObj(e.date) + ' tarixində ' + e.text;
    }).join(' ');
}

export function getQurumName(t) {
    if (!t.fields) return null;
    var val1 = t.fields['customfield_13608'];
    if (val1) {
        if (Array.isArray(val1)) { var names = val1.map(function(v) { return v.name || v.value || (typeof v === 'string' ? v : ''); }).filter(Boolean); if (names.length > 0) return names.join(', '); }
        if (typeof val1 === 'object' && (val1.value || val1.name)) return val1.value || val1.name;
        if (typeof val1 === 'string' && val1.trim() !== '') return val1;
    }
    var val2 = t.fields['customfield_12424'];
    if (val2) {
        if (Array.isArray(val2)) { var names2 = val2.map(function(v) { return v.name || v.value || (typeof v === 'string' ? v : ''); }).filter(Boolean); if (names2.length > 0) return names2.join(', '); }
        if (typeof val2 === 'object' && (val2.value || val2.name)) return val2.value || val2.name;
        if (typeof val2 === 'string' && val2.trim() !== '') return val2;
    }
    return null;
}

export function getDateStatus(t) {
    var dueDateRaw = t.fields['customfield_10807'] || t.fields['duedate'];
    if (!dueDateRaw) return 'nodate';
    try {
        var dueStr = String(dueDateRaw).split('T')[0];
        var parts = dueStr.split('-');
        if (parts.length < 3) return 'nodate';
        var dueDate = new Date(parts[0], parts[1] - 1, parts[2]);
        dueDate.setHours(23, 59, 59, 999); 
        var statusGroup = getStatusGroup(t.fields.status.name);
        var isDone = (statusGroup === 'done');
        var today = new Date(); today.setHours(0,0,0,0);
        if (isDone) {
            var resolvedRaw = t.fields['resolutiondate'] || t.fields['updated'];
            if (!resolvedRaw) return 'ontime';
            var resStr = String(resolvedRaw).split('T')[0];
            var resParts = resStr.split('-');
            if (resParts.length < 3) return 'ontime';
            var resDate = new Date(resParts[0], resParts[1] - 1, resParts[2]);
            resDate.setHours(12, 0, 0, 0);
            if (resDate < dueDate) return 'early';
            if (resDate.getTime() === dueDate.setHours(12,0,0,0)) return 'ontime';
            return 'late';
        } else {
            if (dueDate < today) return 'late';
            return 'upcoming';
        }
    } catch(e) { 
        return 'nodate'; 
    }
}

export function getSprintDateRange(sprintName) {
    if (!sprintName || sprintName === 'all') return null;
    for (var i = 0; i < state.allTasks.length; i++) {
        var t = state.allTasks[i];
        var f = t.fields.customfield_10101;
        if (!f) continue;
        var sprints = Array.isArray(f) ? f : [f];
        for (var j = 0; j < sprints.length; j++) {
            var s = typeof sprints[j] === 'string' ? sprints[j] : JSON.stringify(sprints[j]);
            if (s.indexOf(sprintName) !== -1) {
                var startMatch = s.match(/startDate=([^,]+)/);
                var endMatch = s.match(/endDate=([^,]+)/);
                if (startMatch && endMatch) {
                    return {
                        start: new Date(startMatch[1]),
                        end: new Date(endMatch[1])
                    };
                }
            }
        }
    }
    return null;
}

export function getSprintNames(t) {
    var f = t.fields.customfield_10101;
    if (!f) return [];
    return (Array.isArray(f) ? f : [f]).map(function(s) {
        var m = (typeof s === 'string' ? s : JSON.stringify(s)).match(/name=([^,]+)/);
        return m ? m[1] : null;
    }).filter(Boolean);
}
