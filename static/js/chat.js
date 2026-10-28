import { state } from './state.js';
import { normalizeStr } from './utils.js?v=idda7';
import {
    isTaskType,
    isTaskOrSubtaskType,
    getStatusGroup,
    resolveDirection,
    getSprintNames,
    issueBelongsToSprint,
    sortSprintNames,
    getSprintDateRange,
    getSelectedSprintName,
    formatDateObj,
    classifyAssessmentCategory,
    getExqResult,
    getDiagScore,
    getIsqScore,
    getSelfAssessInfo,
    getAssessmentQurumLabel,
    getAssessmentYear,
    hasAssessmentResult,
    getMeqsedInfo,
    getHistoricalStatus,
    currentSprintName,
    isDueInSprint,
    getQurumName,
    canonicalQurumName,
    jiraBoardWorkUnits,
    collectDueThisWeekTasks,
    collectDueThisWeekDoneTasks,
    collectDueThisWeekOpenTasks,
    collectBacklogDashboardUnits,
    collectOtherDashboardUnits,
    isNextWeekBoxTask,
    getDateStatus,
    hasValidDifficulty,
    isActiveExecutionGroup,
    getBlockReason,
    getTaskDueDate,
    countableWorkUnits,
    getTaskPriorityName
} from './model.js?v=idda26';
import { exportTasksToWord } from './report.js?v=idda49';
import { mountDoneBot, getDoneBot } from './done_bot.js?v=idda8';

var STATUS_ORDER = ['done', 'progress', 'review', 'esd', 'planned', 'blocked', 'paused', 'rejected', 'other'];
var STATUS_LABELS = {
    done: 'Yekunlaşıb',
    progress: 'İcradadır',
    review: 'Rəydə',
    esd: 'ESD',
    planned: 'Planlaşdırılıb',
    blocked: 'Bloklanıb',
    paused: 'Dayandırılıb',
    rejected: 'İmtina',
    other: 'İcraya başlanmayıb'
};
var ASSESS_DEFS = [
    { id: 'exq', label: 'Elektron xidmətlərin qiymətləndirilməsi', aliases: ['exq', 'elektron xidmet', 'elektron xidmetlerin qiymetlendirilmesi'] },
    { id: 'diag', label: 'Rəqəmsallaşma diaqnostikası', aliases: ['diaqnostika', 'reqemsallasma', 'reqemsal yetkinlik'] },
    { id: 'isq', label: 'İnformasiya ehtiyat və sistemlərinin qiymətləndirilməsi', aliases: ['isq', 'informasiya ehtiyat', 'sistemlerin qiymetlendirilmesi'] },
    { id: 'self', label: 'Özünüqiymətləndirmə', aliases: ['ozunuqiymetlendirme', 'self assess'] },
    { id: 'meqsed', label: 'Məqsədəuyğunluq rəyi', aliases: ['meqseduygun', 'meqsed'] }
];
var SUGGESTIONS = [
    'Mənim işlərim necə gedir?',
    'Cari həftə üzrə risklər'
];
var BOT_NAME = 'AI Done';
var greetTick = 0;
var lastReportPreview = '';
var lastReportTitle = 'Hesabat';
var KPI_FOCUS = [
    { id: 'blocked', label: 'Bloklanan', re: /blok|cetinlik/ },
    { id: 'late', label: 'Gecikən', re: /gecik/ },
    { id: 'backlog', label: 'Backlog', re: /backlog/ },
    { id: 'rejected', label: 'İmtina', re: /imtina/ },
    { id: 'due', label: 'Bu həftə bitməli', re: /bitmeli|hefte erzinde|bu hefte bit/ },
    { id: 'planned', label: 'Növbəti həftə', re: /novbeti hefte|planlasdir/ },
    { id: 'done', label: 'Tamamlanan', re: /tamamlan|yekunlas/ },
    { id: 'progress', label: 'İcradakı', re: /icradaki|icrada olan|esd|reyde/ },
    { id: 'open', label: 'Açıq tapşırıq', re: /aciq tapsiriq|aciq task/ },
    { id: 'total', label: 'Ümumi tapşırıq', re: /umumi tapsiriq|nece tapsiriq/ }
];

var chatLlm = false;
var chatLlmHint = '';
var chatLlmWarned = false;
var chatOpen = false;
var chatBusy = false;
var chatAbort = null;
var chatEpoch = 0;
var chatHistory = [];
var CHAT_THREAD_KEY = 'aiDoneThread';
var SOFT_FAIL = 'Cavab alına bilmədi, yenidən cəhd edin';
var SOFT_FAIL_HINT = 'Bu arada «Mənim işlərim» və ya «Cari həftə risklər» kimi suallara panel məlumatı ilə cavab verə bilərəm.';
var MAX_SNAPSHOT_TASKS = 280;
var MAX_SNAPSHOT_ASSESS = 350;
var MAX_SNAPSHOT_CHARS = 72000;
var CHAT_FETCH_TIMEOUT_MS = 90000;
var _snapCache = { hash: '', at: 0, snap: null };
var SNAP_CACHE_MS = 20000;

function chatLog() {
    try {
        if (typeof console !== 'undefined' && console.log) {
            console.log.apply(console, ['[AI Done]'].concat([].slice.call(arguments)));
        }
    } catch (e) {}
}

function chatWarn() {
    try {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn.apply(console, ['[AI Done]'].concat([].slice.call(arguments)));
        }
    } catch (e2) {}
}

function fold(str) {
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

function viewerUser() {
    return state.currentUser || null;
}

function firstNameOf(name) {
    var parts = String(name || '').trim().split(/\s+/);
    return parts[0] || '';
}

function isLoginLikeName(name) {
    var raw = String(name || '').trim();
    if (!raw || /\s/.test(raw)) return false;
    var low = raw.toLowerCase();
    if (low.indexOf('@') !== -1) return true;
    return (low.indexOf('.') !== -1 || low.indexOf('_') !== -1) && raw === low;
}

function viewerFirstName() {
    var u = viewerUser();
    if (!u) return '';
    if (u.firstName && !isLoginLikeName(u.firstName)) return u.firstName;
    var full = u.greetingName || u.displayName || u.jiraDisplayName || '';
    if (full && !isLoginLikeName(full)) return firstNameOf(full);
    return '';
}

function viewerGreetingName() {
    var u = viewerUser();
    if (!u) return '';
    if (u.greetingName && !isLoginLikeName(u.greetingName)) return u.greetingName;
    var full = u.displayName || '';
    if (full && !isLoginLikeName(full) && full !== u.username) return full;
    var given = u.givenName || u.firstName || '';
    var sur = u.surname || '';
    var composed = [given, sur].filter(Boolean).join(' ').trim();
    if (composed) return composed;
    if (u.jiraDisplayName && !isLoginLikeName(u.jiraDisplayName)) return u.jiraDisplayName;
    return viewerFirstName();
}

function samePerson(a, b) {
    var fa = fold(a);
    var fb = fold(b);
    return !!(fa && fb && fa === fb);
}

function viewerAssigneeName() {
    var u = viewerUser();
    if (!u) return '';
    var account = String(u.jiraAccountId || '').trim();
    var labels = [u.jiraDisplayName, u.displayName].filter(Boolean);
    var matched = '';
    (state.allTasks || []).forEach(function(t) {
        var asg = t && t.fields ? t.fields.assignee : null;
        if (!asg) return;
        var name = asg.displayName || '';
        var aid = String(asg.accountId || asg.key || asg.name || '').trim();
        if (account && aid && account === aid) matched = name || matched;
        else if (!matched && name && labels.some(function(label) { return samePerson(label, name); })) {
            matched = name;
        }
    });
    return matched || u.jiraDisplayName || '';
}

function isViewerPerson(name) {
    if (!name) return false;
    var self = viewerAssigneeName();
    var u = viewerUser();
    if (self && samePerson(name, self)) return true;
    return !!(u && (samePerson(name, u.jiraDisplayName) || samePerson(name, u.displayName)));
}

function isFirstPerson(qFold) {
    return /(?:^| )(menim|mene|menimki|oz islerim|menim is|menim tapsiriq|menim veziyyet|menim sprint|menim gecik|menim blok)(?: |$)/.test(qFold)
        || /^(menim|mene|ozum)\b/.test(qFold)
        || /\b(taskim|tasklarim|tapsiriqim|tapsiriqlarim|islerim|isim|islerimi|taskimi)\b/.test(qFold)
        || /\b(mende|uzerimde|uzərimdə)\b/.test(qFold);
}

function wantsThisMonth(qFold) {
    return /\b(bu ay|cari ay|bu ayin|bu ayda|ayliq|bu ay ucun)\b/.test(qFold || '');
}

function dateInCurrentMonth(d) {
    if (!d || isNaN(d.getTime())) return false;
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function taskInCurrentMonth(t) {
    if (!t) return false;
    try {
        var due = getTaskDueDate(t);
        if (due && dateInCurrentMonth(due)) return true;
    } catch (e) {}
    var f = t.fields || {};
    var created = f.created ? new Date(f.created) : null;
    if (created && dateInCurrentMonth(created)) return true;
    var updated = f.updated ? new Date(f.updated) : null;
    if (updated && dateInCurrentMonth(updated)) return true;
    try {
        var names = getSprintNames(t) || [];
        var i;
        for (i = 0; i < names.length; i++) {
            var range = getSprintDateRange(names[i]);
            if (!range || !range.start) continue;
            var start = range.start instanceof Date ? range.start : new Date(range.start);
            var end = range.end instanceof Date ? range.end : (range.end ? new Date(range.end) : start);
            if (dateInCurrentMonth(start) || dateInCurrentMonth(end)) return true;
            var now = new Date();
            if (start <= now && end >= now && now.getMonth() === start.getMonth()) return true;
        }
    } catch (e2) {}
    return false;
}

function countMyTasksThisMonth(personName) {
    var name = personName || viewerAssigneeName() || '';
    if (!name) return { total: 0, done: 0, open: 0, items: [] };
    var source = state.allTasks || [];
    var items = [];
    var done = 0;
    var i;
    for (i = 0; i < source.length; i++) {
        var t = source[i];
        if (!t || !t.key) continue;
        try {
            if (!isTaskOrSubtaskType(t) && !isTaskType(t)) continue;
        } catch (e) { continue; }
        var asg = t.fields && t.fields.assignee ? t.fields.assignee.displayName : '';
        if (!samePerson(asg, name)) continue;
        if (!taskInCurrentMonth(t)) continue;
        var brief = taskBrief(t);
        if (brief.group === 'done') done += 1;
        items.push(brief);
    }
    return { total: items.length, done: done, open: items.length - done, items: items };
}

function viewerFact() {
    var u = viewerUser();
    if (!u) return null;
    var jiraName = viewerAssigneeName() || u.jiraDisplayName || '';
    return {
        id: u.id,
        username: u.username,
        displayName: u.displayName || u.username,
        givenName: u.givenName || '',
        surname: u.surname || '',
        firstName: viewerFirstName(),
        greetingName: viewerGreetingName(),
        role: u.role,
        jiraAccountId: u.jiraAccountId || '',
        jiraDisplayName: jiraName,
        linked: !!(u.jiraAccountId || jiraName)
    };
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function pct(n, d) {
    if (!d) return 0;
    var p = Math.round((n / d) * 100);
    if (p < 0) return 0;
    if (p > 100) return 100;
    return p;
}

function signed(n) {
    if (n > 0) return '+' + n;
    return String(n);
}

function clip(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!n || s.length <= n) return s;
    return s.slice(0, n - 1) + '…';
}

function taskBrief(t) {
    var f = t && t.fields ? t.fields : {};
    var statusName = (f.status && f.status.name) || '';
    var dir = resolveDirection(t);
    var due = null;
    var reason = '';
    try { due = getTaskDueDate(t); } catch (e) { due = null; }
    try { reason = getBlockReason(t) || ''; } catch (e) { reason = ''; }
    return {
        key: (t && t.key) || '',
        title: clip(f.summary || 'Başlıqsız', 88),
        who: f.assignee && f.assignee.displayName ? f.assignee.displayName : 'Təyinatsız',
        status: statusName,
        group: getStatusGroup(statusName) || 'other',
        qurum: getQurumName(t) || '',
        dir: dir && dir.fields ? (dir.fields.summary || '') : '',
        due: due ? formatDateObj(due) : '',
        reason: clip(reason, 90)
    };
}

function isBlockedUnit(t) {
    var g = getStatusGroup((t.fields && t.fields.status && t.fields.status.name) || '');
    if (g === 'done' || g === 'rejected') return false;
    return g === 'blocked' || hasValidDifficulty(t);
}

function hasData() {
    return !!(state.allTasks && state.allTasks.length);
}

function sprintList() {
    var set = {};
    (state.allTasks || []).forEach(function(t) {
        getSprintNames(t).forEach(function(n) { if (n) set[n] = true; });
    });
    return sortSprintNames(Object.keys(set));
}

function resolveCurrentSprint(names) {
    return getSelectedSprintName() || currentSprintName(names) || names[0] || '';
}

function isSprintWork(t, statusName) {
    if (!isTaskType(t)) return false;
    var g = getStatusGroup(statusName);
    if (g === 'rejected' || g === 'paused') return false;
    var st = normalizeStr(statusName);
    if (st.indexOf('baslanmamis') !== -1 || st.indexOf('baslanmayib') !== -1) return false;
    return true;
}

function emptyBucket() {
    return {
        total: 0, done: 0, carry: 0, due: 0, dueDone: 0, late: 0, blocked: 0,
        groups: {}, dirs: {}, qurum: {}, assignees: {}, scores: [], people: {}, qurumDetail: {},
        lateItems: [], blockedItems: [], openItems: []
    };
}

function bump(map, key) {
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
}

function ensureDetail(map, key) {
    if (!key) return null;
    if (!map[key]) map[key] = { total: 0, done: 0, blocked: 0, late: 0, progress: 0 };
    return map[key];
}

function addDetail(map, key, g, t) {
    var d = ensureDetail(map, key);
    if (!d) return;
    d.total += 1;
    if (g === 'done') d.done += 1;
    if (g === 'blocked') d.blocked += 1;
    if (isActiveExecutionGroup(g)) d.progress += 1;
    if (getDateStatus(t) === 'late') d.late += 1;
}

function addTaskToBucket(bucket, t, statusName, sprintName) {
    var g = getStatusGroup(statusName) || 'other';
    bucket.total += 1;
    bucket.groups[g] = (bucket.groups[g] || 0) + 1;
    if (g === 'done') bucket.done += 1;
    else bucket.carry += 1;
    if (g === 'blocked') bucket.blocked += 1;
    if (getDateStatus(t) === 'late') bucket.late += 1;
    if (sprintName && isDueInSprint(t, sprintName)) {
        bucket.due += 1;
        if (g === 'done') bucket.dueDone += 1;
    }
    var dir = resolveDirection(t);
    var dirName = dir && dir.fields ? dir.fields.summary : 'İstiqamətsiz';
    if (!bucket.dirs[dirName]) bucket.dirs[dirName] = { total: 0, done: 0 };
    bucket.dirs[dirName].total += 1;
    if (g === 'done') bucket.dirs[dirName].done += 1;
    var who = t.fields && t.fields.assignee ? t.fields.assignee.displayName : '';
    if (who) bump(bucket.assignees, who);
    addDetail(bucket.people, who, g, t);
    var q = getQurumName(t);
    if (q) bump(bucket.qurum, q);
    addDetail(bucket.qurumDetail, q, g, t);
    var brief = taskBrief(t);
    if (getDateStatus(t) === 'late' && bucket.lateItems && bucket.lateItems.length < 8) {
        bucket.lateItems.push(brief);
    }
    if (isBlockedUnit(t) && bucket.blockedItems && bucket.blockedItems.length < 8) {
        bucket.blockedItems.push(brief);
    }
    if (g !== 'done' && bucket.openItems && bucket.openItems.length < 8) {
        bucket.openItems.push(brief);
    }
}

function sprintBucket(sprintName, isPrev, currentName) {
    var bucket = emptyBucket();
    bucket.name = sprintName;
    bucket.label = sprintName;
    var range = getSprintDateRange(sprintName);
    if (range && range.start && range.end) {
        bucket.dates = formatDateObj(range.start) + ' – ' + formatDateObj(range.end);
    }
    (state.allTasks || []).forEach(function(t) {
        if (getSprintNames(t).indexOf(sprintName) === -1) return;
        var status = isPrev
            ? getHistoricalStatus(t, currentName, sprintName)
            : ((t.fields && t.fields.status && t.fields.status.name) || '');
        if (!isSprintWork(t, status)) return;
        addTaskToBucket(bucket, t, status, sprintName);
    });
    return bucket;
}

function tasksForScope(sprintName) {
    var list = (state.allTasks || []).filter(function(t) {
        return isTaskOrSubtaskType(t);
    });
    if (!sprintName) return list;
    return list.filter(function(t) { return issueBelongsToSprint(t, sprintName); });
}

function entityBucket(entity, sprintName) {
    var bucket = emptyBucket();
    bucket.id = entity.id;
    bucket.kind = entity.kind;
    bucket.label = entity.label;
    var tasks = tasksForScope(sprintName);
    tasks.forEach(function(t) {
        if (!matchEntity(entity, t)) return;
        var status = (t.fields && t.fields.status && t.fields.status.name) || '';
        addTaskToBucket(bucket, t, status, sprintName);
        if (entity.id === 'exq') {
            var exq = getExqResult(t);
            if (exq && exq.percent != null && isFinite(exq.percent)) bucket.scores.push(Number(exq.percent));
        } else if (entity.id === 'diag') {
            var ds = parseFloat(String(getDiagScore(t)).replace(',', '.'));
            if (isFinite(ds)) bucket.scores.push(ds);
        }
    });
    if (bucket.scores.length) {
        var sum = bucket.scores.reduce(function(a, b) { return a + b; }, 0);
        bucket.avgScore = Math.round((sum / bucket.scores.length) * 10) / 10;
    }
    return bucket;
}

function matchEntity(entity, t) {
    if (entity.kind === 'assess') return classifyAssessmentCategory(t) === entity.id;
    if (entity.kind === 'direction') {
        var dir = resolveDirection(t);
        return !!(dir && dir.key === entity.key);
    }
    return false;
}

function directionEntities() {
    return (state.allDirections || []).map(function(d) {
        var name = (d.fields && d.fields.summary) || d.key;
        return {
            kind: 'direction',
            id: 'dir:' + d.key,
            key: d.key,
            label: name,
            fold: fold(name),
            aliases: directionAliases(name)
        };
    });
}

function directionAliases(name) {
    var f = fold(name);
    var extra = [];
    if (f.indexOf('inteqras') !== -1 || f.indexOf('melumat hedd') !== -1 || f.indexOf('digital') !== -1) {
        extra.push('inteqrasiya', 'inteqrasiyalar', 'digital bridge');
    }
    if (f.indexOf('elektron xidmet') !== -1) extra.push('exq', 'elektron xidmetler');
    if (f.indexOf('diaqnostika') !== -1 || f.indexOf('reqemsallasma') !== -1) extra.push('diaqnostika');
    if (f.indexOf('reyestr') !== -1) extra.push('reyestr');
    if (f.indexOf('meqsed') !== -1) extra.push('meqseduygunluq');
    return extra;
}

function assessEntities() {
    return ASSESS_DEFS.map(function(d) {
        return {
            kind: 'assess',
            id: d.id,
            label: d.label,
            fold: fold(d.label),
            aliases: d.aliases
        };
    });
}

function entityScore(qFold, entity) {
    var names = [entity.fold].concat(entity.aliases || []).map(fold).filter(Boolean);
    var best = 0;
    names.forEach(function(n) {
        if (!n) return;
        if (qFold.indexOf(n) !== -1) best = Math.max(best, 80 + Math.min(20, n.length));
        else if (n.indexOf(qFold) !== -1 && qFold.length >= 6) best = Math.max(best, 60);
        else {
            var hits = 0;
            var words = n.split(' ').filter(function(w) { return w.length > 3; });
            words.forEach(function(w) { if (qFold.indexOf(w) !== -1) hits += 1; });
            if (words.length && hits >= Math.min(2, words.length)) best = Math.max(best, 50 + hits * 5);
        }
    });
    return best;
}

function findEntities(qFold) {
    var pool = assessEntities().concat(directionEntities());
    var scored = pool.map(function(e) {
        return { entity: e, score: entityScore(qFold, e) };
    }).filter(function(x) { return x.score >= 50; });
    function mentionAt(entity) {
        var names = [entity.fold].concat(entity.aliases || []).map(fold).filter(Boolean);
        var at = 9999;
        names.forEach(function(n) {
            var i = qFold.indexOf(n);
            if (i !== -1 && i < at) at = i;
        });
        return at;
    }
    scored.sort(function(a, b) {
        var da = mentionAt(a.entity) - mentionAt(b.entity);
        if (da) return da;
        return b.score - a.score;
    });
    var out = [];
    var seen = {};
    scored.forEach(function(x) {
        if (seen[x.entity.id]) return;
        if (x.entity.kind === 'direction' && x.entity.fold.indexOf('elektron xidmet') !== -1 && qFold.indexOf('qiymet') !== -1) {
            return;
        }
        seen[x.entity.id] = true;
        out.push(x.entity);
    });
    return out;
}

function parseSprintOffset(qFold) {
    var m = qFold.match(/(\d+)\s*sprint.{0,24}(once|evvel|qabaq|oncen)/);
    if (m) return parseInt(m[1], 10);
    m = qFold.match(/(once|evvel|qabaq|oncen).{0,12}(\d+)\s*sprint/);
    if (m) return parseInt(m[2], 10);
    return 0;
}

function namedSprint(qFold, names) {
    var m = qFold.match(/sprint\s+(\d+)/);
    if (!m) return '';
    var num = m[1];
    for (var i = 0; i < names.length; i++) {
        if (String(names[i]).match(new RegExp('(?:^|\\D)' + num + '(?:\\D|$)'))) return names[i];
    }
    return '';
}

function parseQuestion(raw) {
    var qFold = fold(raw);
    var names = sprintList();
    var current = resolveCurrentSprint(names);
    var wantsCompare = /muqayis|qarsi|(?:^| )vs(?: |$)/.test(qFold);
    var wantsSummary = /xulase|icmal|veziyyet|nece gedir|hazirki|indi ne|panelde ne var/.test(qFold);
    var offset = parseSprintOffset(qFold);
    var hasCurrent = /bu sprint|cari sprint|secilmis sprint|aktiv sprint/.test(qFold);
    var hasPrev = /evvelki sprint|kecen sprint|sonuncu sprintden evvel/.test(qFold);
    var allScope = /butun sprint|butun dovr|umumi panel|butun tapsiriq/.test(qFold);
    var named = namedSprint(qFold, names);
    var entities = findEntities(qFold);
    var who = findPerson(qFold);
    if (isFirstPerson(qFold)) {
        var selfName = viewerAssigneeName() || (viewerUser() && (viewerUser().jiraDisplayName || viewerUser().displayName)) || '';
        if (selfName && (!who || isViewerPerson(who))) who = selfName;
    }
    var qurum = findQurum(qFold);
    var focus = findKpiFocus(qFold);
    var issueKey = findIssueKey(raw);
    var greet = hasGreeting(qFold);

    if (isGreetingOnly(qFold)) {
        return { kind: 'greet', names: names, current: current, greeting: true };
    }
    if (isThanks(qFold)) {
        return { kind: 'thanks', names: names, current: current };
    }
    if (isIdentity(qFold)) {
        return { kind: 'identity', names: names, current: current };
    }
    if (wantsReport(qFold)) {
        return { kind: 'report', names: names, current: current, greeting: greet };
    }
    if (wantsHelp(qFold)) {
        return { kind: 'help', names: names, current: current, greeting: greet };
    }
    if (issueKey) {
        return { kind: 'issue', key: issueKey, names: names, current: current };
    }
    if (isAboutDash(qFold)) {
        return { kind: 'about', names: names, current: current };
    }
    if (isRiskQuestion(qFold) && !entities.length && !who && !qurum) {
        return { kind: 'risk', names: names, current: current, raw: raw };
    }
    if ((hasCurrent || wantsCompare || offset) && (offset || hasPrev) && !entities.length) {
        return { kind: 'sprintCompare', current: current, offset: offset || 1, names: names };
    }
    if (named && (hasCurrent || wantsCompare) && current) {
        return { kind: 'sprintPair', a: current, b: named, names: names };
    }
    if (entities.length >= 2) {
        return {
            kind: 'entityCompare',
            left: entities[0],
            right: entities[1],
            sprint: allScope ? '' : current,
            names: names
        };
    }
    if (who || isFirstPerson(qFold)) {
        var askedSelf = isFirstPerson(qFold);
        var selfPerson = who
            || viewerAssigneeName()
            || (viewerUser() && (viewerUser().jiraDisplayName || viewerUser().displayName))
            || viewerFirstName()
            || (askedSelf ? 'Siz' : '');
        return {
            kind: 'person',
            person: selfPerson,
            sprint: allScope ? '' : current,
            names: names,
            monthScope: wantsThisMonth(qFold),
            selfAsked: askedSelf
        };
    }
    if (/is yuk|workload|en yuklu|en mesgul|kimde cox|hansi emekdas|en cox tapsiriq|kim daha|yuk ve gecik|icraci rein|icraci reyting/.test(qFold)) {
        return { kind: 'people', sprint: allScope ? '' : current, names: names };
    }
    if (/kimde|icraci|is yuku/.test(qFold)) {
        return { kind: 'people', sprint: allScope ? '' : current, names: names };
    }
    if (qurum) {
        return { kind: 'qurum', qurum: qurum, sprint: allScope ? '' : current, names: names };
    }
    if (focus) {
        return { kind: 'kpi', focus: focus, names: names, current: current };
    }
    if (entities.length === 1) {
        return { kind: 'entity', entity: entities[0], sprint: allScope ? '' : current, names: names };
    }
    if (/qiymetlendir|diaqnostika ve|qiymet netice/.test(qFold)) {
        return { kind: 'assess', sprint: allScope ? '' : current, names: names };
    }
    if (/istiqametler|hansi istiqamet/.test(qFold)) {
        return { kind: 'directions', sprint: allScope ? '' : current, names: names };
    }
    if (hasCurrent || named || (qFold.indexOf('sprint') !== -1 && !wantsSummary)) {
        return { kind: 'sprint', sprint: named || current, offset: offset, names: names };
    }
    if (wantsSummary || isOverview(qFold) || looksLikeDashQuestion(qFold)) {
        return { kind: 'overview', names: names, current: current };
    }
    return { kind: 'open', names: names, current: current, raw: raw };
}

function wantsHelp(qFold) {
    return /(?:^| )(komek|help)(?: |$)|numune|nece sorus|ne sorusa|neleri sorus|ne yaza|ne yazim|istifade qayda/.test(qFold);
}

function isAboutDash(qFold) {
    var aboutWord = /nedir|ne goster|ne ucun|bolmeler|nece isley|nece istifade|hansi filter|filter nec|token|hesabat yukle/.test(qFold);
    var place = /panel|dashboard|sehife|sayt|bolme/.test(qFold);
    return (aboutWord && place) || /bu panel|bu dashboard|bu sehife nedir|panel barede/.test(qFold);
}

function isOverview(qFold) {
    return /veziyyet|xulase|icmal|nece gedir|indi ne|hazirki|panelde ne|dashboardda|umumi veziyyet|bu hefte nece/.test(qFold);
}

function looksLikeDashQuestion(qFold) {
    return /panel|dashboard|tapsiriq|sprint|status|istiqamet|qurum|qiymet|blok|gecik|backlog|icra|filter|gecik/.test(qFold);
}

function hasGreeting(qFold) {
    return /^(salam aleykum|salamun aleykum|salam|hello|hey|hi|necesiz|necesen|sabahiniz xeyir|axsaminiz xeyir|gunortaniz xeyir)\b/.test(qFold);
}

function stripGreeting(qFold) {
    return qFold
        .replace(/^(salam aleykum|salamun aleykum|salam|hello|hey|hi|sabahiniz xeyir|axsaminiz xeyir|gunortaniz xeyir)\s*/g, '')
        .replace(/\b(necesiz|necesen|ne var|ne xeber)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isGreetingOnly(qFold) {
    var rest = stripGreeting(qFold);
    return hasGreeting(qFold) && (!rest || /^(necesiz|necesen|ne var|ne xeber|yaxsi|sagol)$/.test(rest));
}

function isThanks(qFold) {
    return /tesekkur|sagolun|sag olun|tesekkurler|sagol$/.test(qFold) && qFold.split(' ').length <= 8 && !looksLikeDashQuestion(qFold);
}

function isFarewell(qFold) {
    if (looksLikeDashQuestion(qFold)) return false;
    if (qFold.split(' ').length > 8) return false;
    return /^(sagol|sag olun|sagolun|bye|goodbye|goruserik|gorusenek|xudahafiz|hosh|hos|elvida)\b/.test(qFold)
        || /(?:^| )(goruserik|gorusenek|xudahafiz|bye)(?: |$)/.test(qFold);
}

function formatFarewell() {
    var opts = [
        'Görüşənədək! Lazım olanda buradayam.',
        'Sağ olun. Uğurlar — panelə qayıdanda yazın.',
        'Xudahafiz. Yenə yazsanız, kömək edərəm.'
    ];
    greetTick += 1;
    return '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p>' + pLead(opts[greetTick % opts.length]);
}

function isIdentity(qFold) {
    if (/sen kimsen|adin nedir|ozunu tanit|ozun haqda|sen nesen/.test(qFold)) return true;
    return /^(ai done|kimsen)$/.test(qFold);
}

function wantsReport(qFold) {
    return /hesabat|word hesab|docx|\breport\b|yukle.*hesabat|hesabat.*yukle|hesabat hazirla|hesabat goster|hesabat gonder/.test(qFold);
}

function dayWish() {
    var h = new Date().getHours();
    if (h < 12) return 'sabahınız xeyir';
    if (h < 18) return 'gününüz xoş keçsin';
    return 'axşamınız xeyir';
}

function greetingLine() {
    var wish = dayWish();
    var name = viewerGreetingName() || viewerFirstName();
    var named = name ? (name + ', ') : '';
    var opts = [
        'Salam, ' + named + wish + ', sizə necə kömək edə bilərəm?',
        'Salam, ' + named + wish.charAt(0).toUpperCase() + wish.slice(1) + '. Sizə necə kömək edə bilərəm?',
        'Salam' + (name ? (', ' + name) : '') + ', ' + wish + '. Panel üzrə nəyə baxaq?'
    ];
    greetTick += 1;
    return opts[(greetTick + wish.length) % opts.length];
}

function withGreeting(html, raw) {
    if (!hasGreeting(fold(raw))) return html;
    return pLead(greetingLine()) + html;
}

function isRiskQuestion(qFold) {
    return /niye|sebeb|problem|risk|engel|saxlayir|zeif|asagi qal|pisdir|diqqet|kritik|nesaxla|ne saxla|lengid|amill/.test(qFold);
}

function findIssueKey(raw) {
    var m = String(raw || '').match(/\b([A-Za-z][A-Za-z0-9]+-\d+)\b/);
    return m ? m[1].toUpperCase() : '';
}

function findTaskByKey(key) {
    if (!key) return null;
    var up = String(key).toUpperCase();
    var list = state.allTasks || [];
    var i;
    for (i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].key || '').toUpperCase() === up) return list[i];
    }
    return null;
}

function findKpiFocus(qFold) {
    var i;
    for (i = 0; i < KPI_FOCUS.length; i++) {
        if (KPI_FOCUS[i].re.test(qFold)) return KPI_FOCUS[i];
    }
    return null;
}

function findPerson(qFold) {
    var seen = {};
    var best = null;
    var bestScore = 0;
    (state.allTasks || []).forEach(function(t) {
        var name = t.fields && t.fields.assignee ? t.fields.assignee.displayName : '';
        if (!name || seen[name]) return;
        seen[name] = true;
        var f = fold(name);
        if (f.length < 4) return;
        var parts = f.split(' ').filter(function(w) { return w.length > 3; });
        var hit = qFold.indexOf(f) !== -1;
        if (!hit) {
            hit = parts.some(function(w) { return qFold.indexOf(w) !== -1; });
        }
        if (!hit) return;
        var score = f.length;
        if (score > bestScore) {
            bestScore = score;
            best = name;
        }
    });
    return best;
}

function findQurum(qFold) {
    var seen = {};
    var best = null;
    var bestScore = 0;
    (state.allTasks || []).forEach(function(t) {
        var name = getQurumName(t);
        if (!name || seen[name]) return;
        seen[name] = true;
        var f = fold(name);
        if (f.length < 4) return;
        var hit = qFold.indexOf(f) !== -1;
        if (!hit) {
            var parts = f.split(' ').filter(function(w) { return w.length > 3; });
            hit = parts.filter(function(w) { return qFold.indexOf(w) !== -1; }).length >= Math.min(2, parts.length);
        }
        if (!hit) return;
        if (f.length > bestScore) {
            bestScore = f.length;
            best = name;
        }
    });
    return best;
}

function topEntries(map, n) {
    return Object.keys(map || []).map(function(k) {
        return { name: k, n: map[k] };
    }).sort(function(a, b) { return b.n - a.n; }).slice(0, n || 4);
}

function statusLines(bucket) {
    return STATUS_ORDER.filter(function(g) {
        return bucket.groups[g];
    }).map(function(g) {
        return '<li><span>' + STATUS_LABELS[g] + '</span><strong>' + bucket.groups[g] + '</strong> <em>' + pct(bucket.groups[g], bucket.total) + '%</em></li>';
    }).join('');
}

function dirLines(bucket) {
    var rows = Object.keys(bucket.dirs || {}).map(function(name) {
        return { name: name, total: bucket.dirs[name].total, done: bucket.dirs[name].done };
    }).sort(function(a, b) { return b.total - a.total; }).slice(0, 6);
    if (!rows.length) return '';
    return '<ul class="dash-chat-dirs">' + rows.map(function(r) {
        return '<li><span>' + esc(r.name) + '</span><strong>' + r.done + '/' + r.total + ' · ' + pct(r.done, r.total) + '%</strong></li>';
    }).join('') + '</ul>';
}

function itemList(items) {
    if (!items || !items.length) return '';
    return '<ul class="dash-chat-items">' + items.map(function(it) {
        var meta = [it.who, it.status || '', it.due ? ('bitmə: ' + it.due) : ''].filter(Boolean).join(' · ');
        return '<li><strong>' + esc(it.key) + '</strong><span>' + esc(it.title) + '</span>'
            + (meta ? '<em>' + esc(meta) + '</em>' : '')
            + (it.reason ? '<em>' + esc(it.reason) + '</em>' : '')
            + '</li>';
    }).join('') + '</ul>';
}

function peopleRank(map, n) {
    return Object.keys(map || {}).map(function(name) {
        var d = map[name] || {};
        return {
            name: name,
            total: d.total || 0,
            done: d.done || 0,
            blocked: d.blocked || 0,
            late: d.late || 0,
            progress: d.progress || 0,
            rate: pct(d.done || 0, d.total || 0)
        };
    }).filter(function(p) { return p.total; }).sort(function(a, b) { return b.total - a.total; }).slice(0, n || 6);
}

function dirRank(dirs, n) {
    return Object.keys(dirs || {}).map(function(name) {
        var d = dirs[name] || {};
        return { name: name, total: d.total || 0, done: d.done || 0, rate: pct(d.done || 0, d.total || 0) };
    }).sort(function(a, b) { return b.total - a.total; }).slice(0, n || 6);
}

function collectEvidence() {
    var kpis = liveKpis();
    var tasks = state.filteredTasks && state.filteredTasks.length ? state.filteredTasks : (state.allTasks || []);
    var valid = jiraBoardWorkUnits(tasks);
    var late = [];
    var blocked = [];
    valid.forEach(function(t) {
        if (getDateStatus(t) === 'late') late.push(taskBrief(t));
        if (isBlockedUnit(t)) blocked.push(taskBrief(t));
    });
    var dueOpen = [];
    var dueDone = [];
    try { dueOpen = collectDueThisWeekOpenTasks().map(taskBrief); } catch (e) { dueOpen = []; }
    try { dueDone = collectDueThisWeekDoneTasks().map(taskBrief); } catch (e) { dueDone = []; }
    return {
        kpis: kpis,
        people: peopleRank(kpis.view.people, 10),
        dirs: dirRank(kpis.view.dirs, 10),
        qurums: topEntries(kpis.view.qurum, 8),
        late: late.slice(0, 12),
        blocked: blocked.slice(0, 12),
        dueOpen: dueOpen.slice(0, 10),
        dueDone: dueDone.slice(0, 8)
    };
}

function pLead(text) {
    return '<p class="dash-chat-lead">' + esc(text) + '</p>';
}

function pRead(text) {
    return '<p class="dash-chat-read">' + esc(text) + '</p>';
}

function pAttn(text) {
    if (!text) return '';
    return '<p class="dash-chat-attn">' + esc(text) + '</p>';
}

function topDirName(bucket) {
    var rows = Object.keys(bucket.dirs || {}).map(function(name) {
        return { name: name, total: bucket.dirs[name].total };
    }).sort(function(a, b) { return b.total - a.total; });
    return rows[0] || null;
}

function writeSprintRead(cur, prev, offset) {
    if (!cur.total && !prev.total) return 'Hər iki sprintdə sayılan tapşırıq yoxdur; müqayisə üçün məlumat kifayət etmir.';
    var parts = [];
    var when = offset === 1 ? 'əvvəlki sprint' : (offset + ' sprint öncə');
    var vol = cur.total - prev.total;
    var cr = pct(cur.done, cur.total);
    var pr = pct(prev.done, prev.total);
    parts.push(escPlain(cur.name) + ' indi ' + cur.total + ' işdir, ' + when + ' (' + escPlain(prev.name) + ') isə ' + prev.total + ' idi.');
    if (vol > 0) parts.push('Həcm ' + vol + ' iş artıb.');
    else if (vol < 0) parts.push('Həcm ' + (-vol) + ' iş azalıb.');
    if (cur.total && prev.total) {
        if (cr > pr) parts.push('Yekunlaşma ' + pr + '%-dən ' + cr + '%-ə qalxıb.');
        else if (cr < pr) parts.push('Yekunlaşma ' + pr + '%-dən ' + cr + '%-ə düşüb' + (vol > 0 ? ' — həcm artıb, amma bitmə eyni tempdə getməyib.' : '.'));
        else parts.push('Yekunlaşma payı ' + cr + '%-də qalıb.');
    }
    var growName = '';
    var growN = 0;
    Object.keys(cur.dirs || {}).forEach(function(name) {
        var d = (cur.dirs[name].total || 0) - ((prev.dirs[name] && prev.dirs[name].total) || 0);
        if (d > growN) {
            growN = d;
            growName = name;
        }
    });
    var curDirs = dirRank(cur.dirs, 1);
    if (curDirs[0]) parts.push('İndi ən böyük istiqamət ' + curDirs[0].name + 'dir (' + curDirs[0].total + ' iş, ' + curDirs[0].rate + '% yekun).');
    if (growName && growN) parts.push(growName + ' üzrə həcm ' + growN + ' iş artıb.');
    var people = peopleRank(cur.people, 2);
    if (people[0]) {
        parts.push('Cari sprintdə yük ' + people[0].name + ' üzərindədir (' + people[0].total + ' iş' + (people[0].late ? ', ' + people[0].late + ' gecikir' : '') + ').');
        if (people[1]) parts.push('İkinci ' + people[1].name + ' (' + people[1].total + ').');
    }
    if (cur.due || prev.due) {
        parts.push('Həftə öhdəliyi ' + (prev.dueDone || 0) + '/' + (prev.due || 0) + '-dən ' + (cur.dueDone || 0) + '/' + (cur.due || 0) + '-ə keçib.');
    }
    if (cur.lateItems && cur.lateItems[0]) {
        parts.push('Gecikən nümunə: ' + cur.lateItems[0].key + ' — ' + cur.lateItems[0].title + '.');
    }
    return parts.join(' ');
}

function writeSprintAttn(cur, prev) {
    var notes = [];
    if (cur.total > prev.total && pct(cur.done, cur.total) < pct(prev.done, prev.total)) {
        notes.push('Həcm artıb, yekunlaşma isə geriləyib.');
    }
    if (cur.due && pct(cur.dueDone, cur.due) < 50) {
        notes.push('Həftə öhdəliyinin yarısından azı bitib.');
    }
    if ((cur.blocked || 0) > (prev.blocked || 0)) {
        notes.push('Bloklanan iş sayı artıb (' + prev.blocked + ' → ' + cur.blocked + ').');
    }
    if ((cur.late || 0) > (prev.late || 0)) {
        notes.push('Gecikən iş artıb (' + prev.late + ' → ' + cur.late + ').');
    }
    return notes.join(' ');
}

function formatSprintCompare(cur, prev, offset) {
    var html = '<p class="dash-chat-kicker">Cavab</p>'
        + '<h4>' + esc(cur.name) + ' <span>↔</span> ' + esc(prev.name) + '</h4>';
    if (cur.dates || prev.dates) {
        html += '<p class="dash-chat-dates">' + esc(cur.dates || 'tarix yoxdur') + ' · ' + esc(prev.dates || 'tarix yoxdur') + '</p>';
    }
    html += pLead(writeSprintRead(cur, prev, offset));
    html += compareTable(cur, prev);
    var samples = (cur.lateItems || []).concat(cur.blockedItems || []).slice(0, 4);
    if (samples.length) {
        html += '<p class="dash-chat-sub">Cari sprintdə diqqət</p>' + itemList(samples);
    }
    html += pAttn(writeSprintAttn(cur, prev));
    html += '<p class="dash-chat-sub">İstiqamət üzrə (yekunlaşıb / ümumi)</p>';
    html += sideBySideDirs(cur, prev);
    return html;
}

function escPlain(s) {
    return String(s == null ? '' : s);
}

function compareTable(a, b) {
    var rows = [
        ['Ümumi tapşırıq', a.total, b.total, false],
        ['Yekunlaşıb', a.done, b.done, true],
        ['Yekunlaşma', pct(a.done, a.total) + '%', pct(b.done, b.total) + '%', true],
        ['İcrası davam edən', a.carry, b.carry, false],
        ['Həftə ərzində bitməli', a.due, b.due, false],
        ['Həftə ərzində yekunlaşıb', a.dueDone, b.dueDone, true]
    ];
    var body = rows.map(function(r) {
        var av = r[1];
        var bv = r[2];
        var d = (typeof av === 'number' && typeof bv === 'number') ? signed(av - bv) : '—';
        var tone = '';
        if (typeof av === 'number' && typeof bv === 'number' && av !== bv) {
            tone = (r[3] ? (av > bv) : (av < bv)) ? ' is-good' : (av === bv ? '' : ' is-bad');
            if (!r[3] && r[0].indexOf('Ümumi') === 0) tone = ' is-flat';
        }
        return '<tr><th>' + r[0] + '</th><td>' + av + '</td><td>' + bv + '</td><td class="dash-chat-delta' + tone + '">' + d + '</td></tr>';
    }).join('');
    return '<table class="dash-chat-table"><thead><tr><th></th><th>' + esc(a.label || a.name) + '</th><th>' + esc(b.label || b.name) + '</th><th>Fərq</th></tr></thead><tbody>' + body + '</tbody></table>';
}

function sideBySideDirs(a, b) {
    var keys = {};
    Object.keys(a.dirs || {}).forEach(function(k) { keys[k] = true; });
    Object.keys(b.dirs || {}).forEach(function(k) { keys[k] = true; });
    var rows = Object.keys(keys).map(function(k) {
        var left = a.dirs[k] || { total: 0, done: 0 };
        var right = b.dirs[k] || { total: 0, done: 0 };
        return { name: k, lt: left.total, ld: left.done, rt: right.total, rd: right.done };
    }).sort(function(x, y) { return (y.lt + y.rt) - (x.lt + x.rt); }).slice(0, 7);
    if (!rows.length) return '<p class="dash-chat-empty">İstiqamət kəsiyi yoxdur.</p>';
    return '<table class="dash-chat-table dash-chat-table--tight"><thead><tr><th>İstiqamət</th><th>' + esc(a.label || a.name) + '</th><th>' + esc(b.label || b.name) + '</th></tr></thead><tbody>'
        + rows.map(function(r) {
            return '<tr><th>' + esc(r.name) + '</th><td>' + r.ld + '/' + r.lt + '</td><td>' + r.rd + '/' + r.rt + '</td></tr>';
        }).join('') + '</tbody></table>';
}

function formatEntityCompare(left, right, sprintName) {
    var scope = sprintName ? ('Kəsik: ' + sprintName) : 'Bütün yüklənmiş tapşırıqlar';
    var html = '<p class="dash-chat-kicker">Cavab</p>'
        + '<h4>' + esc(left.label) + ' <span>↔</span> ' + esc(right.label) + '</h4>'
        + pLead(insightEntities(left, right, scope));
    html += compareTable(left, right);
    if (left.avgScore != null || right.avgScore != null) {
        html += '<p class="dash-chat-note">Orta bal: '
            + esc(left.label) + ' — ' + (left.avgScore != null ? left.avgScore : '—')
            + ' · ' + esc(right.label) + ' — ' + (right.avgScore != null ? right.avgScore : '—')
            + '</p>';
    }
    var samples = (left.lateItems || []).concat(left.blockedItems || []).concat(right.lateItems || []).concat(right.blockedItems || []).slice(0, 5);
    if (samples.length) {
        html += '<p class="dash-chat-sub">Nümunələr</p>' + itemList(samples);
    }
    html += pAttn(entityAttn(left, right));
    return html;
}

function insightEntities(a, b, scope) {
    if (!a.total && !b.total) return 'Bu kəsikdə tapşırıq tapılmadı. Sprint filterini və ya adları dəqiqləşdirin.';
    var ar = pct(a.done, a.total);
    var br = pct(b.done, b.total);
    var parts = [];
    if (scope) parts.push(scope + '.');
    parts.push(a.label + ': ' + a.total + ' iş, ' + ar + '% yekun. ' + b.label + ': ' + b.total + ' iş, ' + br + '% yekun.');
    if (a.total && b.total) {
        if (a.total !== b.total) {
            var heavier = a.total > b.total ? a : b;
            var lighter = a.total > b.total ? b : a;
            parts.push(heavier.label + ' ' + (heavier.total - lighter.total) + ' iş daha çoxdur.');
        }
        if (ar !== br) {
            var faster = ar > br ? a : b;
            parts.push('Yekunlaşma ' + faster.label + ' tərəfində daha yüksəkdir (' + Math.abs(ar - br) + ' faiz bəndi).');
        }
    }
    var aPeople = peopleRank(a.people, 1);
    var bPeople = peopleRank(b.people, 1);
    if (aPeople[0]) parts.push(a.label + ' üzrə yük ' + aPeople[0].name + '-dadır (' + aPeople[0].total + ').');
    if (bPeople[0]) parts.push(b.label + ' üzrə ' + bPeople[0].name + ' (' + bPeople[0].total + ').');
    if (a.late || b.late) parts.push('Gecikən: ' + a.label + ' ' + (a.late || 0) + ', ' + b.label + ' ' + (b.late || 0) + '.');
    if ((a.blocked || 0) || (b.blocked || 0)) parts.push('Bloklanan: ' + (a.blocked || 0) + ' / ' + (b.blocked || 0) + '.');
    if (a.lateItems && a.lateItems[0]) parts.push('Nümunə: ' + a.lateItems[0].key + ' — ' + a.lateItems[0].title + '.');
    return parts.join(' ');
}

function entityAttn(a, b) {
    var notes = [];
    var weaker = null;
    if (a.total && b.total && pct(a.done, a.total) + 15 < pct(b.done, b.total)) weaker = a;
    if (a.total && b.total && pct(b.done, b.total) + 15 < pct(a.done, a.total)) weaker = b;
    if (weaker) notes.push(weaker.label + ' üzrə yekunlaşma nəzərəçarpacaq dərəcədə geri qalır.');
    if ((a.blocked || 0) + (b.blocked || 0) >= 3) notes.push('Bloklanan işlər ayrıca açılıb izlənməlidir.');
    return notes.join(' ');
}

function twoStatus(a, b) {
    return '<div class="dash-chat-split">'
        + '<div><p class="dash-chat-sub">' + esc(a.label) + '</p><ul class="dash-chat-status">' + statusLines(a) + '</ul></div>'
        + '<div><p class="dash-chat-sub">' + esc(b.label) + '</p><ul class="dash-chat-status">' + statusLines(b) + '</ul></div>'
        + '</div>';
}

function formatBucket(title, kicker, bucket, extra) {
    if (!bucket.total) {
        return '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(title) + '</h4>' + pLead('Bu kəsikdə sayılan tapşırıq yoxdur.');
    }
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(title) + '</h4>';
    if (bucket.dates) html += '<p class="dash-chat-dates">' + esc(bucket.dates) + '</p>';
    html += pLead(writeBucketRead(title, bucket, extra));
    var samples = (bucket.lateItems || []).concat(bucket.blockedItems || []);
    if (!samples.length) samples = bucket.openItems || [];
    if (samples.length) {
        html += '<p class="dash-chat-sub">Konkret işlər</p>' + itemList(samples.slice(0, 5));
    }
    html += pAttn(writeBucketAttn(bucket));
    var people = peopleRank(bucket.people, 4);
    if (people.length) {
        html += '<p class="dash-chat-sub">İcraçılar</p><ul class="dash-chat-dirs">' + people.map(function(p) {
            return '<li><span>' + esc(p.name) + '</span><strong>' + p.total + (p.late ? ' · ' + p.late + ' gecikir' : '') + '</strong></li>';
        }).join('') + '</ul>';
    }
    return html;
}

function writeBucketRead(title, bucket, extra) {
    var rate = pct(bucket.done, bucket.total);
    var parts = [];
    if (extra) parts.push(String(extra).replace(/<[^>]+>/g, ''));
    parts.push(title + ' üzrə ' + bucket.total + ' iş var; ' + bucket.done + '-i yekunlaşıb (' + rate + '%), ' + bucket.carry + '-i açıqdır.');
    var top = topDirName(bucket);
    if (top && top.name !== title) parts.push('Ən böyük həcm ' + top.name + 'dır (' + top.total + ').');
    var people = peopleRank(bucket.people, 1);
    if (people[0]) parts.push('Ən yüklü icraçı ' + people[0].name + ' (' + people[0].total + ' iş).');
    if (bucket.avgScore != null) parts.push('Orta bal ' + bucket.avgScore + '-dir.');
    if (bucket.due) parts.push('Həftə ərzində bitməli ' + bucket.due + ' işdən ' + bucket.dueDone + '-i bitib.');
    if (bucket.lateItems && bucket.lateItems[0]) parts.push('Gecikən nümunə: ' + bucket.lateItems[0].key + ' — ' + bucket.lateItems[0].title + '.');
    return parts.join(' ');
}

function writeBucketAttn(bucket) {
    var notes = [];
    if (bucket.late) notes.push(bucket.late + ' iş gecikir.');
    if (bucket.blocked) notes.push(bucket.blocked + ' iş blokdadır.');
    if (bucket.due && pct(bucket.dueDone, bucket.due) < 50) notes.push('Həftə öhdəliyinin yarısından azı yerinə yetirilib.');
    return notes.join(' ');
}

function kpi(label, value) {
    return '<div class="dash-chat-kpi"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
}

function liveKpis() {
    var tasks = state.filteredTasks && state.filteredTasks.length ? state.filteredTasks : (state.allTasks || []);
    var valid = jiraBoardWorkUnits(tasks);
    var total = valid.length;
    var done = valid.filter(function(t) { return getStatusGroup(t.fields.status.name || '') === 'done'; }).length;
    function hasDiff(t) {
        var g = getStatusGroup(t.fields.status.name || '');
        return hasValidDifficulty(t) && g !== 'done' && g !== 'rejected';
    }
    var blocked = valid.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name || '');
        return g === 'blocked' || hasDiff(t);
    }).length;
    var progress = valid.filter(function(t) {
        return isActiveExecutionGroup(getStatusGroup(t.fields.status.name || '')) && !hasDiff(t);
    }).length;
    var planned = valid.filter(isNextWeekBoxTask).length;
    var late = valid.filter(function(t) { return getDateStatus(t) === 'late'; }).length;
    var rejected = (tasks || []).filter(function(t) {
        return isTaskType(t) && getStatusGroup(t.fields.status.name || '') === 'rejected';
    }).length;
    var duePool = collectDueThisWeekTasks();
    var dueDone = collectDueThisWeekDoneTasks().length;
    var view = emptyBucket();
    view.label = 'Cari görünüş';
    var sprint = getSelectedSprintName();
    (tasks || []).forEach(function(t) {
        if (!isTaskOrSubtaskType(t)) return;
        addTaskToBucket(view, t, (t.fields && t.fields.status && t.fields.status.name) || '', sprint);
    });
    var assess = { diag: 0, isq: 0, self: 0, exq: 0, meqsed: 0 };
    (state.allTasks || []).forEach(function(t) {
        var cat = classifyAssessmentCategory(t);
        if (cat && assess[cat] != null) assess[cat] += 1;
    });
    return {
        sprint: resolveCurrentSprint(sprintList()) || 'Bütün sprintlər',
        direction: currentDirectionLabel(),
        qurum: state.currentQurumFilter || '',
        assignee: state.currentAssigneeFilter || '',
        total: total,
        done: done,
        open: Math.max(0, total - done),
        blocked: blocked,
        progress: progress,
        planned: planned,
        late: late,
        rejected: rejected,
        backlog: collectBacklogDashboardUnits().length,
        other: collectOtherDashboardUnits().length,
        due: duePool.length,
        dueDone: dueDone,
        rate: pct(dueDone, duePool.length),
        view: view,
        assess: assess
    };
}

function currentDirectionLabel() {
    if (!state.currentDirectionFilter) return '';
    var list = state.allDirections || [];
    var i;
    for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].key === state.currentDirectionFilter) {
            return (list[i].fields && list[i].fields.summary) || list[i].key;
        }
    }
    return state.currentDirectionFilter;
}

function scopeNote(kpis) {
    var bits = ['Görünüş: ' + (kpis.sprint || 'bütün sprintlər')];
    if (kpis.direction) bits.push('istiqamət: ' + kpis.direction);
    if (kpis.qurum) bits.push('qurum: ' + kpis.qurum);
    if (kpis.assignee) bits.push('icraçı: ' + kpis.assignee);
    return bits.join(' · ');
}

function readElValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
}

function boardContext() {
    var sprint = '';
    try { sprint = getSelectedSprintName() || currentSprintName() || ''; } catch (e) { sprint = ''; }
    return {
        sprint: sprint || 'bütün sprintlər',
        startDate: readElValue('startDate'),
        endDate: readElValue('endDate'),
        assignee: state.currentAssigneeFilter || null,
        priority: state.currentPriorityFilter || null,
        direction: state.currentDirectionFilter || null,
        qurum: state.currentQurumFilter || null,
        status: state.currentStatusFilter || null,
        label: state.activeLabelFilter || null,
        visibleTasks: (state.filteredTasks || []).length,
        totalLoaded: (state.allTasks || []).length
    };
}

function rankCountMap(map, limit) {
    return Object.keys(map || {}).map(function(name) {
        return { name: name, total: map[name] || 0 };
    }).sort(function(a, b) {
        return (b.total - a.total) || String(a.name).localeCompare(String(b.name), 'az');
    }).slice(0, limit || 12);
}

/** Panel kartları ilə eyni məntiq: iş yükü = assigneeChart (ekrandakı eyni pool) */
function buildDashboardPanels() {
    // İş yükü chart-ı assigneeChartTasks istifadə edir (assignee/priority filter tətbiq olunmur)
    var source = state.assigneeChartTasks;
    if (!source || !source.length) {
        source = (state.filteredTasks && state.filteredTasks.length)
            ? state.filteredTasks
            : (state.allTasks || []);
    }
    var units = [];
    try {
        units = countableWorkUnits(source) || [];
    } catch (e0) {
        units = (source || []).filter(function(t) {
            try { return isTaskOrSubtaskType(t); } catch (e1) { return !!(t && t.key); }
        });
    }
    var workload = {};
    var byPri = {};
    var byStatus = {};
    var byDir = {};
    var byQurum = {};
    var lateN = 0;
    var blockedN = 0;
    var openN = 0;
    var doneN = 0;
    var i;
    for (i = 0; i < units.length; i++) {
        var t = units[i];
        if (!t || !t.fields) continue;
        var person = t.fields.assignee ? (t.fields.assignee.displayName || '') : '';
        var pri = '—';
        try { pri = getTaskPriorityName(t) || '—'; } catch (e2) {
            pri = (t.fields.priority && t.fields.priority.name) || '—';
        }
        var stName = (t.fields.status && t.fields.status.name) || '—';
        var sg = getStatusGroup(stName) || 'other';
        var stLabel = STATUS_LABELS[sg] || sg;
        var dirName = 'İstiqamətsiz';
        try {
            var dObj = resolveDirection(t);
            if (dObj && dObj.fields && dObj.fields.summary) dirName = dObj.fields.summary;
            else if (dObj && dObj.key) dirName = dObj.key;
        } catch (e3) {}
        var qName = '';
        try { qName = getQurumName(t) || ''; } catch (e4) { qName = ''; }

        if (person) {
            if (!workload[person]) workload[person] = { total: 0, byPriority: {}, open: 0, done: 0, late: 0, blocked: 0 };
            workload[person].total += 1;
            workload[person].byPriority[pri] = (workload[person].byPriority[pri] || 0) + 1;
            if (sg === 'done') workload[person].done += 1;
            else workload[person].open += 1;
        }
        byPri[pri] = (byPri[pri] || 0) + 1;
        byStatus[stLabel] = (byStatus[stLabel] || 0) + 1;
        byDir[dirName] = (byDir[dirName] || 0) + 1;
        if (qName) byQurum[qName] = (byQurum[qName] || 0) + 1;

        if (sg === 'done') doneN += 1;
        else openN += 1;
        try {
            if (getDateStatus(t) === 'late') {
                lateN += 1;
                if (person && workload[person]) workload[person].late += 1;
            }
        } catch (e5) {}
        try {
            if (isBlockedUnit(t)) {
                blockedN += 1;
                if (person && workload[person]) workload[person].blocked += 1;
            }
        } catch (e6) {}
    }
    var people = Object.keys(workload).map(function(name) {
        var row = workload[name];
        return {
            name: name,
            total: row.total,
            open: row.open,
            done: row.done,
            late: row.late,
            blocked: row.blocked,
            byPriority: row.byPriority
        };
    }).sort(function(a, b) {
        return (b.total - a.total) || String(a.name).localeCompare(String(b.name), 'az');
    });
    var scope = boardContext();
    return {
        scope: scope,
        totalUnits: units.length,
        open: openN,
        done: doneN,
        late: lateN,
        blocked: blockedN,
        workload: {
            people: people.slice(0, 25),
            heaviest: people[0] || null,
            lightest: people.length ? people[people.length - 1] : null
        },
        status: rankCountMap(byStatus, 12),
        priority: rankCountMap(byPri, 10),
        directions: rankCountMap(byDir, 15),
        qurums: rankCountMap(byQurum, 15)
    };
}

function formatAbout() {
    return '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p>'
        + '<h4>Bu panel nə göstərir</h4>'
        + pLead('Rəqəmsal İdarəetmə Paneli DGD-nin Jira tapşırıqlarını, sprintini və qiymətləndirmələrini eyni kəsikdə toplayır. Yuxarıdakı sprint, tarix, istiqamət və ya qurum dəyişəndə kartlar, qrafiklər və mən eyni rəqəmlərə baxıram.')
        + pRead('«Bütün sprintlər» ümumi fondur. Seçilmiş sprint həftəlik icradır. Kartdakı tamamlanma faizi əsasən bu həftə bitməli işlər üzrədir. Hesabat istəsəniz, göstərə və Word kimi yükləyə bilərəm.');
}

function formatGreeting() {
    return '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p>'
        + pLead(greetingLine());
}

function formatThanks() {
    var opts = [
        'Zəhmət olmasa. Başqa nəyə baxım?',
        'Rica edirəm. Başqa sualınız olsa, buradayam.',
        'Xoş oldu. Panel üzrə daha nəyi açım?'
    ];
    greetTick += 1;
    return '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p>' + pLead(opts[greetTick % opts.length]);
}

function formatIdentity() {
    var name = viewerGreetingName() || viewerFirstName();
    var jira = viewerAssigneeName() || (viewerUser() && viewerUser().jiraDisplayName) || '';
    var lead = name
        ? ('Gününüz xoş keçsin, ' + name + '! Mən süni intellekt köməkçiniz AI Done-am.')
        : 'Gününüz xoş keçsin! Mən süni intellekt köməkçiniz AI Done-am.';
    if (name && jira) {
        lead += ' Sizi Jira-da «' + jira + '» kimi tanıyıram — «mənim işlərim» deyəndə sizin tapşırıqlarınıza baxıram.';
    } else if (name) {
        lead += ' Admin sizi Jira şəxsi ilə bağlayanda mənim işlərinizə də baxa bilərəm.';
    } else {
        lead += ' Sizə necə kömək edə bilərəm? Tapşırıq, sprint, icraçı və qiymətləndirmə rəqəmlərini oxuyub izah edirəm.';
    }
    return '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p>' + pLead(lead);
}

function formatReport(kpis, ev) {
    ev = ev || (hasData() ? collectEvidence() : null);
    lastReportTitle = (kpis && kpis.sprint) ? ('Hesabat — ' + kpis.sprint) : 'Hesabat';
    lastReportPreview = ev ? buildReportPreviewHtml(kpis, ev) : '<p>Panel məlumatı yüklənməyib. Tokeni yazıb Yenilə düyməsinə basın, sonra yenidən soruşun.</p>';
    var lead = ev
        ? ('Hesabatı cari kəsik üzrə hazırladım. Əvvəl göstərə, sonra Word kimi yükləyə bilərsiniz. ' + scopeNote(kpis) + '.')
        : 'Hələ panel məlumatı yoxdur. Yenilə-dən sonra hesabatı göstərib yükləyə bilərəm.';
    var html = '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p><h4>' + esc(lastReportTitle) + '</h4>'
        + pLead(lead);
    if (ev && kpis) {
        html += '<p class="dash-chat-report-sum">'
            + esc('Lövhə: ' + kpis.total + ' iş, yekun ' + kpis.done + ' · həftə ' + kpis.dueDone + '/' + kpis.due
                + ' · gecikən ' + kpis.late + ' · blok ' + kpis.blocked + '.')
            + '</p>';
    }
    html += '<div class="dash-chat-report-actions">'
        + '<button type="button" class="dash-chat-report-btn" data-chat-report="show">Göstər</button>'
        + '<button type="button" class="dash-chat-report-btn is-primary" data-chat-report="download"' + (ev ? '' : ' disabled') + '>Yüklə</button>'
        + '</div>';
    return html;
}

function buildReportPreviewHtml(kpis, ev) {
    var html = '<h4>' + esc(lastReportTitle) + '</h4>'
        + pLead(scopeNote(kpis) + '.')
        + pRead(overviewLead(kpis, ev) + ' ' + overviewBody(kpis, ev));
    if (ev.dueOpen.length) {
        html += '<p class="dash-chat-sub">Həftə ərzində açıq</p>' + itemList(ev.dueOpen.slice(0, 8));
    }
    if (ev.late.length) {
        html += '<p class="dash-chat-sub">Gecikənlər</p>' + itemList(ev.late.slice(0, 8));
    }
    if (ev.blocked.length) {
        html += '<p class="dash-chat-sub">Bloklananlar</p>' + itemList(ev.blocked.slice(0, 8));
    }
    if (ev.people.length) {
        html += '<p class="dash-chat-sub">İş yükü</p><ul class="dash-chat-dirs">' + ev.people.slice(0, 6).map(function(p) {
            return '<li><span>' + esc(p.name) + '</span><strong>' + p.total + ' · ' + p.rate + '%</strong></li>';
        }).join('') + '</ul>';
    }
    if (ev.dirs.length) {
        html += '<p class="dash-chat-sub">İstiqamət</p><ul class="dash-chat-dirs">' + ev.dirs.slice(0, 6).map(function(d) {
            return '<li><span>' + esc(d.name) + '</span><strong>' + d.done + '/' + d.total + '</strong></li>';
        }).join('') + '</ul>';
    }
    if (overviewAttn(kpis, ev)) html += pAttn(overviewAttn(kpis, ev));
    return html;
}

function formatOverview(kpis, ev) {
    ev = ev || collectEvidence();
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(kpis.sprint || 'Cari kəsik') + '</h4>'
        + pLead(overviewLead(kpis, ev))
        + pRead(overviewBody(kpis, ev));
    if (ev.dueOpen.length) {
        html += '<p class="dash-chat-sub">Həftə ərzində açıq qalanlar</p>' + itemList(ev.dueOpen.slice(0, 5));
    } else if (ev.late.length) {
        html += '<p class="dash-chat-sub">Gecikən işlər</p>' + itemList(ev.late.slice(0, 5));
    }
    html += pAttn(overviewAttn(kpis, ev));
    return html;
}

function overviewLead(kpis, ev) {
    if (!kpis.total) return 'Bu filterdə lövhə tapşırığı yoxdur. Sprint və ya tarixi dəyişəndə rəqəmlər çıxacaq.';
    var boardRate = pct(kpis.done, kpis.total);
    if (kpis.due && kpis.rate < 40) {
        return scopeNote(kpis) + '. Həftə öhdəliyi zəifdir: ' + kpis.dueDone + '/' + kpis.due + ' iş bitib (' + kpis.rate + '%). Lövhənin ümumi yekunlaşması ' + boardRate + '%-dir.';
    }
    if (kpis.due && kpis.rate >= 70 && kpis.late < 3) {
        return scopeNote(kpis) + '. Həftə öhdəliyi əsasən yerinə yetirilib (' + kpis.dueDone + '/' + kpis.due + '). Lövhədə ' + kpis.total + ' işdən ' + kpis.done + '-i yekunlaşıb.';
    }
    return scopeNote(kpis) + '. Lövhədə ' + kpis.total + ' iş var, ' + kpis.done + '-i yekunlaşıb (' + boardRate + '%). Həftə öhdəliyi ' + (kpis.due ? (kpis.dueDone + '/' + kpis.due + ', ' + kpis.rate + '%') : 'bu kəsikdə düşmür') + '.';
}

function overviewBody(kpis, ev) {
    if (!kpis.total) return '';
    var parts = [];
    if (ev.dirs[0]) {
        parts.push('Həcm ' + ev.dirs[0].name + ' üzrə cəmlənib: ' + ev.dirs[0].total + ' iş, yekunlaşma ' + ev.dirs[0].rate + '%.');
        if (ev.dirs[1]) parts.push('Ardınca ' + ev.dirs[1].name + ' (' + ev.dirs[1].total + ').');
    }
    if (ev.people[0]) {
        var p0 = ev.people[0];
        var risk = [p0.late ? p0.late + ' gecikən' : '', p0.blocked ? p0.blocked + ' blok' : ''].filter(Boolean).join(', ');
        parts.push('Ən yüklü icraçı ' + p0.name + 'dir — ' + p0.total + ' iş' + (risk ? ' (' + risk + ')' : '') + '.');
        if (ev.people[1]) parts.push('İkinci ' + ev.people[1].name + ' (' + ev.people[1].total + ').');
    }
    if (kpis.progress) parts.push('Aktiv icrada ' + kpis.progress + ' iş qalır.');
    if (!kpis.due) parts.push('Bu kəsikdə həftə ərzində bitmə tarixi düşən iş yoxdur, ona görə kartın tamamlanma faizi 0 görünə bilər.');
    return parts.join(' ');
}

function overviewAttn(kpis, ev) {
    var notes = [];
    if (kpis.late) notes.push(kpis.late + ' iş gecikir' + (ev && ev.late[0] ? ' (məs. ' + ev.late[0].key + ')' : ''));
    if (kpis.blocked) notes.push(kpis.blocked + ' iş blokdadır' + (ev && ev.blocked[0] ? ' (məs. ' + ev.blocked[0].key + ')' : ''));
    if (kpis.due && kpis.rate < 50) notes.push('həftə öhdəliyinin yarısından azı bitib');
    if (kpis.backlog && kpis.backlog > kpis.progress) notes.push('backlog aktiv icradan böyükdür');
    if (!notes.length) return '';
    return 'Diqqət: ' + notes.join('; ') + '.';
}

function formatKpi(kpis, focus, ev) {
    ev = ev || collectEvidence();
    var map = {
        blocked: kpis.blocked,
        late: kpis.late,
        backlog: kpis.backlog,
        rejected: kpis.rejected,
        due: kpis.due,
        planned: kpis.planned,
        done: kpis.done,
        progress: kpis.progress,
        open: kpis.open,
        total: kpis.total
    };
    var n = map[focus.id];
    if (n == null) n = 0;
    var samples = kpiSamples(focus.id, ev);
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(focus.label) + ': ' + n + '</h4>'
        + pLead(writeKpiRead(kpis, focus, n, ev));
    if (samples.length) {
        html += '<p class="dash-chat-sub">Hansı işlər</p>' + itemList(samples.slice(0, 6));
    }
    html += pAttn(writeKpiAttn(kpis, focus, n, ev));
    return html;
}

function kpiSamples(id, ev) {
    if (id === 'blocked') return ev.blocked || [];
    if (id === 'late') return ev.late || [];
    if (id === 'due' || id === 'open') return ev.dueOpen || [];
    if (id === 'done') return ev.dueDone || [];
    return [];
}

function writeKpiRead(kpis, focus, n, ev) {
    var share = kpis.total ? pct(n, kpis.total) : 0;
    var who = '';
    if (focus.id === 'blocked') {
        who = ownersFromItems(ev.blocked);
        return n
            ? ('Bloklanan və ya çətinlik qeydli iş ' + n + ' ədəddir — lövhənin ' + share + '%-i.' + (who ? ' Əsasən: ' + who + '.' : '') + (ev.blocked[0] ? ' Birinci nümunə ' + ev.blocked[0].key + ' — ' + ev.blocked[0].title + '.' : ''))
            : 'Bu görünüşdə bloklanan iş yoxdur. İndi risk daha çox gecikmə (' + kpis.late + ') və ya həftə öhdəliyindən (' + kpis.rate + '%) gəlir.';
    }
    if (focus.id === 'late') {
        who = ownersFromItems(ev.late);
        return n
            ? ('Gecikən iş ' + n + '-dir (' + share + '%). Bitmə tarixi keçib, status hələ yekun deyil.' + (who ? ' İcraçılar: ' + who + '.' : '') + (ev.late[0] ? ' Məsələn ' + ev.late[0].key + ' — ' + ev.late[0].title + '.' : ''))
            : 'Gecikən tapşırıq görünmür. Filter dəyişəndə bu rəqəm dəyişə bilər.';
    }
    if (focus.id === 'due') {
        return 'Həftə ərzində bitməli ' + kpis.due + ' iş var; ' + kpis.dueDone + '-i yekunlaşıb (' + kpis.rate + '%). Açıq qalan ' + Math.max(0, kpis.due - kpis.dueDone) + ' iş həftəni bağlamaq üçün qalıb.'
            + (ev.dueOpen[0] ? ' Açıqlardan biri: ' + ev.dueOpen[0].key + ' — ' + ev.dueOpen[0].title + '.' : '');
    }
    if (focus.id === 'done') {
        return 'Tamamlanan iş ' + n + '-dir, lövhənin ' + pct(n, kpis.total) + '%-i. Kartdakı tamamlanma faizi isə həftə ərzində bitməli işlər üzrə ' + kpis.rate + '% göstərilir — bu iki rəqəm eyni şey deyil.';
    }
    if (focus.id === 'progress') {
        return 'Aktiv icrada (ESD və rəy daxil) ' + n + ' iş var. Açıq işlərin ' + (kpis.open ? pct(n, kpis.open) : 0) + '%-i hərəkətdədir, ' + kpis.blocked + '-i isə blokdadır.';
    }
    if (focus.id === 'backlog') {
        return n
            ? ('Backlog-da ' + n + ' iş var — icraya başlanmayıb və aktiv/gələcək sprintə düşməyib. Növbəti planlaşdırmada bu fond nəzərə alınmalıdır.')
            : 'Backlog boşdur; yeni işlər birbaşa sprintə düşür və ya hələ yüklənməyib.';
    }
    if (focus.id === 'planned') {
        return 'Növbəti həftəyə planlaşdırılan iş ' + n + '-dir. Cari həftə öhdəliyi ' + kpis.due + ' işdir — növbəti həftə ' + (n > kpis.due ? 'daha sıx görünür' : 'daha yüngül və ya bərabərdir') + '.';
    }
    if (focus.id === 'rejected') {
        return n ? ('İmtina edilən tapşırıq: ' + n + '. Bu qrup ümumi lövhə sayına daxil edilmir.') : 'İmtina edilən tapşırıq yoxdur.';
    }
    if (focus.id === 'open') {
        return 'Açıq iş ' + n + '-dir. Bunun ' + kpis.progress + '-i aktiv icradadır, ' + kpis.blocked + '-i blokdadır, ' + kpis.late + '-i gecikir.';
    }
    return 'Ümumi lövhə işi ' + n + '-dir. Tamamlanan ' + kpis.done + ', açıq ' + kpis.open + '.';
}

function ownersFromItems(items) {
    var map = {};
    (items || []).forEach(function(it) {
        if (it.who && it.who !== 'Təyinatsız') map[it.who] = (map[it.who] || 0) + 1;
    });
    return Object.keys(map).sort(function(a, b) { return map[b] - map[a]; }).slice(0, 3).map(function(n) {
        return n + ' (' + map[n] + ')';
    }).join(', ');
}

function writeKpiAttn(kpis, focus, n, ev) {
    if (focus.id === 'late' && n) return 'Gecikənləri kartın «Gecikən» sətrindən aça bilərsiniz.';
    if (focus.id === 'blocked' && n) return 'Blok sayına çətinlik qeydi olan açıq işlər də daxildir.';
    if (focus.id === 'due' && kpis.due && kpis.rate < 50) return 'Həftə öhdəliyi 50%-dən aşağıdır.';
    if (focus.id === 'backlog' && n > 20) return 'Backlog böyükdür; növbəti sprintə keçəcək işlər prioritetlənməlidir.';
    return '';
}

function formatPeople(kpis, person, ev, opts) {
    ev = ev || collectEvidence();
    opts = opts || {};
    if (person) {
        var canon = person;
        (ev.people || []).forEach(function(p) {
            if (samePerson(p.name, person)) canon = p.name;
        });
        var d = (kpis.view.people || {})[canon] || (kpis.view.people || {})[person] || { total: 0, done: 0, blocked: 0, late: 0, progress: 0 };
        if (!d.total && kpis.view.people) {
            Object.keys(kpis.view.people).forEach(function(key) {
                if (samePerson(key, person)) {
                    d = kpis.view.people[key];
                    canon = key;
                }
            });
        }
        var self = isViewerPerson(canon) || !!opts.selfAsked || canon === 'Siz';
        var month = null;
        if (opts.monthScope) {
            month = countMyTasksThisMonth(canon === 'Siz' ? (viewerAssigneeName() || '') : canon);
        }
        var mine = [].concat(ev.late, ev.blocked, ev.dueOpen).filter(function(it) { return samePerson(it.who, canon); });
        var seen = {};
        mine = mine.filter(function(it) {
            if (seen[it.key]) return false;
            seen[it.key] = true;
            return true;
        });
        if (month && month.items && month.items.length) {
            mine = month.items.slice(0, 8);
        }
        var title = self ? (opts.monthScope ? 'Bu ay sizin işləriniz' : 'Sizin işləriniz') : canon;
        var lead;
        if (month) {
            if (month.total) {
                lead = self
                    ? ('Bu ay üzərinizdə ' + month.total + ' tapşırıq var — ' + month.done + ' yekunlaşıb, ' + month.open + ' açıq qalıb.')
                    : (canon + ' bu ay ' + month.total + ' tapşırıq daşıyır — ' + month.done + ' yekunlaşıb, ' + month.open + ' açıqdır.');
            } else if (self && !(viewerAssigneeName() || (viewerUser() && viewerUser().jiraDisplayName))) {
                lead = 'Sizi panel hesabı kimi tanıyıram, amma Jira şəxsi hələ bağlanmayıb. Admin İstifadəçilər səhifəsindən sizi Jira-dakı adınızla bağlasın — sonra «mənim işlərim»ə baxa bilərəm.';
            } else {
                lead = self
                    ? 'Bu ay üzərinizdə bitmə tarixi, yaradılma və ya sprinti cari aya düşən tapşırıq tapılmadı.'
                    : (canon + ' üçün bu ay uyğun tapşırıq tapılmadı.');
            }
        } else if (d.total) {
            lead = self
                ? ('Bu kəsikdə sizin üzərinizdə ' + d.total + ' iş var — ümumi həcmin ' + pct(d.total, kpis.view.total) + '%-i. Yekunlaşma ' + pct(d.done, d.total) + '%-dir, aktiv icrada ' + d.progress + ' işiniz qalır.'
                    + (d.late || d.blocked ? ' Risk: ' + (d.late ? d.late + ' işiniz gecikir' : '') + (d.late && d.blocked ? ', ' : '') + (d.blocked ? d.blocked + ' blokdadır' : '') + '.' : ''))
                : (canon + ' bu kəsikdə ' + d.total + ' iş daşıyır — ümumi həcmin ' + pct(d.total, kpis.view.total) + '%-i. Yekunlaşma ' + pct(d.done, d.total) + '%-dir, aktiv icrada ' + d.progress + ' iş var.'
                    + (d.late || d.blocked ? ' Risk: ' + (d.late ? d.late + ' gecikir' : '') + (d.late && d.blocked ? ', ' : '') + (d.blocked ? d.blocked + ' blokdadır' : '') + '.' : ''));
        } else if (self && !(viewerAssigneeName() || (viewerUser() && viewerUser().jiraDisplayName))) {
            lead = 'Sizi panel hesabı kimi tanıyıram, amma Jira şəxsi hələ bağlanmayıb. Admin İstifadəçilər səhifəsindən sizi Jira-dakı adınızla bağlasın — sonra «mənim işlərim»ə baxa bilərəm.';
        } else {
            lead = (self ? 'Bu filterdə sizin tapşırığınız görünmür.' : (canon + ' bu filterdə tapşırıqda görünmür.'))
                + ' Sprint və ya istiqamət filterini yoxlayın.';
        }
        var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(title) + '</h4>' + pLead(lead);
        if (mine.length) {
            html += '<p class="dash-chat-sub">'
                + (opts.monthScope
                    ? (self ? 'Bu ayın tapşırıqları' : 'Bu ayın tapşırıqları')
                    : (self ? 'Açıq/riskli işləriniz' : 'Onun açıq/riskli işləri'))
                + '</p>' + itemList(mine.slice(0, 6));
        }
        html += pAttn(!opts.monthScope && (d.late || d.blocked) ? (self ? 'Sizin üzərinizdə açıq risk var; siyahını icraçı filteri ilə aça bilərsiniz.' : 'Bu icraçı üzrə açıq risk var; siyahını icraçı filteri ilə aça bilərsiniz.') : '');
        return html;
    }
    var people = ev.people.length ? ev.people : peopleRank(kpis.view.people, 8);
    if (!people.length) return '<p>Bu görünüşdə icraçı adı tapılmadı.</p>';
    var topShare = pct(people[0].total, kpis.view.total);
    var lateWho = ownersFromItems(ev.late);
    var html2 = '<p class="dash-chat-kicker">Cavab</p><h4>İcraçılar üzrə iş yükü</h4>'
        + pLead(people[0].name + ' ən yüklüdür: ' + people[0].total + ' iş (' + topShare + '%), yekunlaşma ' + people[0].rate + '%.'
            + (people[1] ? ' İkinci ' + people[1].name + ' — ' + people[1].total + ' iş.' : '')
            + (lateWho ? ' Gecikənlər əsasən ' + lateWho + ' üzərindədir.' : ''));
    html2 += '<ul class="dash-chat-dirs">' + people.slice(0, 8).map(function(p) {
        var extra = [p.late ? p.late + ' gecikir' : '', p.blocked ? p.blocked + ' blok' : ''].filter(Boolean).join(', ');
        return '<li><span>' + esc(p.name) + '</span><strong>' + p.total + ' · ' + p.rate + '%' + (extra ? ' · ' + extra : '') + '</strong></li>';
    }).join('') + '</ul>';
    html2 += pAttn(topShare >= 40 ? 'İş yükü bir nəfərdə cəmlənib.' : '');
    return html2;
}

function formatQurum(kpis, name, ev) {
    ev = ev || collectEvidence();
    if (name) {
        var d = (kpis.view.qurumDetail || {})[name] || { total: 0, done: 0, blocked: 0, late: 0, progress: 0 };
        var mine = [].concat(ev.late, ev.blocked, ev.dueOpen).filter(function(it) { return it.qurum === name; });
        var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(name) + '</h4>'
            + pLead(d.total
                ? (name + ' üzrə ' + d.total + ' iş var; yekunlaşma ' + pct(d.done, d.total) + '%, aktiv icrada ' + d.progress + '.'
                    + (d.late ? ' ' + d.late + ' iş gecikir.' : ''))
                : 'Bu qurum cari filterdə görünmür.');
        if (mine.length) html += itemList(mine.slice(0, 5));
        return html;
    }
    var rows = ev.qurums.length ? ev.qurums : topEntries(kpis.view.qurum, 8);
    if (!rows.length) return '<p>Qurum kəsiyi yoxdur.</p>';
    return '<p class="dash-chat-kicker">Cavab</p><h4>Qurumlar</h4>'
        + pLead('Ən çox iş ' + rows[0].name + ' üzrədir (' + rows[0].n + ', ' + pct(rows[0].n, kpis.view.total) + '%). ' + scopeNote(kpis) + '.')
        + '<ul class="dash-chat-dirs">' + rows.map(function(p) {
            return '<li><span>' + esc(p.name) + '</span><strong>' + p.n + '</strong></li>';
        }).join('') + '</ul>';
}

function formatAssess(kpis) {
    var labels = { diag: 'Diaqnostika', isq: 'İSQ', self: 'Özünüqiymətləndirmə', exq: 'EXQ', meqsed: 'Məqsədəuyğunluq' };
    var ids = Object.keys(labels);
    var total = 0;
    var maxId = ids[0];
    ids.forEach(function(id) {
        total += kpis.assess[id] || 0;
        if ((kpis.assess[id] || 0) > (kpis.assess[maxId] || 0)) maxId = id;
    });
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>Qiymətləndirmə bölmələri</h4>'
        + pLead(total
            ? ('Qiymətləndirmə tapşırıqlarının cəmi ' + total + '-dir. Ən böyük bölmə ' + labels[maxId] + ' (' + (kpis.assess[maxId] || 0) + ' iş).')
            : 'Qiymətləndirmə kateqoriyasına düşən tapşırıq tapılmadı.')
        + '<ul class="dash-chat-dirs">';
    ids.forEach(function(id) {
        html += '<li><span>' + labels[id] + '</span><strong>' + (kpis.assess[id] || 0) + (total ? ' · ' + pct(kpis.assess[id] || 0, total) + '%' : '') + '</strong></li>';
    });
    html += '</ul>';
    html += pRead('Boş və ya kiçik bölmə o demək deyil ki, iş yoxdur — filter və il seçimi də təsir edir.');
    return html;
}

function formatDirections(kpis, ev) {
    ev = ev || collectEvidence();
    if (!ev.dirs.length) return '<p>Bu görünüşdə istiqamət tapılmadı.</p>';
    var top = ev.dirs[0];
    var weak = ev.dirs.filter(function(d) { return d.total >= 3 && d.rate < 40; })[0];
    return '<p class="dash-chat-kicker">Cavab</p><h4>İstiqamətlər</h4>'
        + pLead('Ən yüklü istiqamət ' + top.name + 'dir: ' + top.total + ' iş, yekunlaşma ' + top.rate + '%.'
            + (ev.dirs[1] ? ' Ardınca ' + ev.dirs[1].name + ' (' + ev.dirs[1].total + ', ' + ev.dirs[1].rate + '%).' : '')
            + (weak && weak.name !== top.name ? ' Yekunlaşma ' + weak.name + ' üzrə zəifdir (' + weak.rate + '%).' : ''))
        + '<ul class="dash-chat-dirs">' + ev.dirs.map(function(d) {
            return '<li><span>' + esc(d.name) + '</span><strong>' + d.done + '/' + d.total + ' · ' + d.rate + '%</strong></li>';
        }).join('') + '</ul>';
}

function helpHtml(parsed) {
    return '<p class="dash-chat-kicker">' + esc(BOT_NAME) + '</p>'
        + '<h4>Necə kömək edə bilərəm</h4>'
        + pLead('Mən AI Done-am. Sualı oxuyuram, idarəetmə panelindəki rəqəmlərlə düşünürəm və aydın cavab verirəm. Uydurma rəqəm yazmıram.')
        + '<ul class="dash-chat-help">'
        + (viewerAssigneeName() ? '<li>Mənim işlərim necə gedir?</li>' : '')
        + '<li>Cari həftə üzrə icra vəziyyəti necədir?</li>'
        + '<li>Bloklanan və gecikən tapşırıqların sayı nə qədərdir?</li>'
        + '<li>İcraçılar üzrə iş yükü necə bölünüb?</li>'
        + '<li>Hesabatı göstərin və yükləyin</li>'
        + '<li>EXQ necədir? / İnteqrasiya ilə EXQ-ni müqayisə edin</li>'
        + '</ul>'
        + (parsed.current ? '<p class="dash-chat-note">Cari sprint: <strong>' + esc(parsed.current) + '</strong></p>' : '');
}

function formatIssue(key, ev) {
    ev = ev || collectEvidence();
    var t = findTaskByKey(key);
    if (!t) {
        return '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(key) + '</h4>'
            + pLead('Bu açar yüklənmiş panel məlumatında tapılmadı. Tokeni yeniləyin və ya açarı yoxlayın.');
    }
    var b = taskBrief(t);
    var dateSt = getDateStatus(t);
    var parts = [b.key + ' — «' + b.title + '». Status: ' + b.status + ', icraçı: ' + b.who + '.'];
    if (b.dir) parts.push('İstiqamət: ' + b.dir + '.');
    if (b.qurum) parts.push('Qurum: ' + b.qurum + '.');
    if (b.due) parts.push('Bitmə tarixi ' + b.due + (dateSt === 'late' ? ' — gecikir' : '') + '.');
    if (b.reason) parts.push('Qeyd: ' + b.reason + '.');
    var ctx = [];
    if (dateSt === 'late') ctx.push('Bu iş gecikən qrupdadır; paneldə ümumilikdə ' + ev.kpis.late + ' gecikən iş var.');
    if (isBlockedUnit(t)) ctx.push('Blok/çətinlik qeydi var; ümumilikdə ' + ev.kpis.blocked + ' belə iş sayılır.');
    var person = ev.people.filter(function(p) { return p.name === b.who; })[0];
    if (person) ctx.push(b.who + ' bu kəsikdə cəmi ' + person.total + ' iş daşıyır.');
    return '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(b.key) + '</h4>'
        + pLead(parts.join(' '))
        + (ctx.length ? pRead(ctx.join(' ')) : '');
}

function formatRisk(kpis, ev) {
    ev = ev || collectEvidence();
    var parts = [];
    if (kpis.due) parts.push('Həftə öhdəliyi ' + kpis.dueDone + '/' + kpis.due + ' (' + kpis.rate + '%).');
    else parts.push('Bu kəsikdə həftə ərzində bitmə tarixi düşən iş yoxdur.');
    if (kpis.late) parts.push(kpis.late + ' iş gecikir.');
    if (kpis.blocked) parts.push(kpis.blocked + ' iş blokdadır və ya çətinlik qeydi var.');
    if (ev.people[0] && (ev.people[0].late || ev.people[0].blocked)) {
        parts.push('Yük və risk ' + ev.people[0].name + ' üzərində cəmlənib (' + ev.people[0].total + ' iş).');
    }
    if (ev.dirs[0] && ev.dirs[0].rate < 50 && ev.dirs[0].total >= 3) {
        parts.push(ev.dirs[0].name + ' həm böyükdür, həm də yekunlaşma ' + ev.dirs[0].rate + '%-dir.');
    }
    var samples = (ev.late || []).concat(ev.blocked || []).slice(0, 6);
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>Cari həftənin icra riskləri</h4>'
        + pLead(parts.join(' ') || 'Açıq kritik risk görünmür.')
        + (samples.length ? '<p class="dash-chat-sub">Əvvəl bunlara baxın</p>' + itemList(samples) : '')
        + pAttn(kpis.due && kpis.rate < 50 ? 'Həftəni bağlamaq üçün əvvəl gecikən və bloklanan işlər açılmalıdır.' : '');
    return html;
}

function formatOpenAnalysis(raw, kpis, ev) {
    ev = ev || collectEvidence();
    var qFold = fold(raw);
    if (isRiskQuestion(qFold) || /hesabat|yukle|export/.test(qFold)) {
        return formatRisk(kpis, ev);
    }
    var titled = findTasksByWords(qFold);
    if (titled.length) {
        return '<p class="dash-chat-kicker">Cavab</p><h4>Sualınıza düşən işlər</h4>'
            + pLead('Sualdakı sözlər ' + titled.length + ' tapşırıqla üst-üstə düşür. Cari kəsik: ' + scopeNote(kpis) + '.')
            + itemList(titled.slice(0, 6))
            + pRead(overviewBody(kpis, ev));
    }
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(kpis.sprint || 'Cari kəsik') + '</h4>'
        + pLead(overviewLead(kpis, ev))
        + pRead(overviewBody(kpis, ev));
    var samples = ev.dueOpen.length ? ev.dueOpen : ev.late;
    if (samples.length) {
        html += '<p class="dash-chat-sub">Əlaqəli işlər</p>' + itemList(samples.slice(0, 5));
    }
    html += pAttn(overviewAttn(kpis, ev));
    return html;
}

function findTasksByWords(qFold) {
    var out = [];
    var stop = { tapsiriq: 1, sprint: 1, panel: 1, nece: 1, necedir: 1, hansi: 1, bu: 1, ve: 1, ile: 1, ucun: 1, dashboard: 1 };
    var qWords = qFold.split(' ').filter(function(w) { return w.length >= 5 && !stop[w]; });
    if (!qWords.length) return out;
    (state.allTasks || []).forEach(function(t) {
        var title = fold((t.fields && t.fields.summary) || '');
        if (title.length < 8) return;
        var hits = qWords.filter(function(w) { return title.indexOf(w) !== -1; });
        if (hits.length >= Math.min(2, qWords.length) || (hits.length && title.indexOf(qFold) !== -1)) {
            out.push(taskBrief(t));
        }
    });
    return out.slice(0, 6);
}

function factsFromBuckets(kind, a, b, meta) {
    return {
        kind: kind,
        meta: meta || {},
        a: compactBucket(a),
        b: b ? compactBucket(b) : null
    };
}

function compactBucket(b) {
    if (!b) return null;
    return {
        label: b.label || b.name,
        name: b.name,
        dates: b.dates || '',
        total: b.total,
        done: b.done,
        carry: b.carry,
        due: b.due,
        dueDone: b.dueDone,
        avgScore: b.avgScore,
        groups: b.groups,
        dirs: b.dirs,
        people: peopleRank(b.people, 5),
        lateItems: (b.lateItems || []).slice(0, 5),
        blockedItems: (b.blockedItems || []).slice(0, 5)
    };
}

function answerQuestion(raw) {
    var parsed = parseQuestion(raw);
    var html;
    var text;
    var facts;
    if (parsed.kind === 'greet') {
        html = formatGreeting();
        text = stripHtml(html);
        facts = { kind: 'greet' };
        return { html: html, text: text, facts: facts, question: raw };
    }
    if (parsed.kind === 'thanks') {
        html = formatThanks();
        text = stripHtml(html);
        facts = { kind: 'thanks' };
        return { html: html, text: text, facts: facts, question: raw };
    }
    if (parsed.kind === 'identity') {
        html = formatIdentity();
        text = stripHtml(html);
        facts = { kind: 'identity' };
        return { html: html, text: text, facts: facts, question: raw };
    }
    if (parsed.kind === 'report') {
        var reportEv = hasData() ? collectEvidence() : null;
        html = withGreeting(formatReport(reportEv ? reportEv.kpis : null, reportEv), raw);
        text = stripHtml(html);
        facts = { kind: 'report', kpis: reportEv ? compactKpis(reportEv.kpis) : {} };
        return { html: html, text: text, facts: facts, evidence: reportEv, question: raw, keepHtml: true };
    }
    if (parsed.kind === 'about') {
        html = withGreeting(formatAbout(), raw);
        text = stripHtml(html);
        facts = { kind: 'about' };
        return { html: html, text: text, facts: facts, question: raw };
    }
    if (parsed.kind === 'help') {
        html = withGreeting(helpHtml(parsed), raw);
        text = stripHtml(html);
        facts = { kind: 'help', current: parsed.current };
        return { html: html, text: text, facts: facts, question: raw };
    }
    if (!hasData()) {
        return {
            html: withGreeting('<p>Panel məlumatı hələ yüklənməyib. Tokeni yazıb <strong>Yenilə</strong> düyməsinə basın, sonra mən dəqiq rəqəmlərlə danışaram.</p>', raw),
            text: 'Panel məlumatı yüklənməyib.',
            facts: { kind: 'empty' },
            question: raw
        };
    }
    var ev = collectEvidence();
    var kpis = ev.kpis;
    if (parsed.kind === 'issue') {
        html = formatIssue(parsed.key, ev);
        text = stripHtml(html);
        facts = { kind: 'issue', key: parsed.key, kpis: compactKpis(kpis) };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'risk') {
        html = formatRisk(kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'risk', kpis: compactKpis(kpis) };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'overview') {
        html = formatOverview(kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'overview', kpis: compactKpis(kpis) };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'kpi') {
        html = formatKpi(kpis, parsed.focus, ev);
        text = stripHtml(html);
        facts = { kind: 'kpi', focus: parsed.focus.id, kpis: compactKpis(kpis) };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'people' || parsed.kind === 'person') {
        html = formatPeople(kpis, parsed.person, ev, {
            monthScope: !!parsed.monthScope,
            selfAsked: !!parsed.selfAsked
        });
        text = stripHtml(html);
        facts = {
            kind: parsed.kind,
            person: parsed.person || '',
            monthScope: !!parsed.monthScope,
            kpis: compactKpis(kpis)
        };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'qurum') {
        html = formatQurum(kpis, parsed.qurum, ev);
        text = stripHtml(html);
        facts = { kind: 'qurum', qurum: parsed.qurum, kpis: compactKpis(kpis) };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'assess') {
        html = formatAssess(kpis);
        text = stripHtml(html);
        facts = { kind: 'assess', assess: kpis.assess };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'directions') {
        html = formatDirections(kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'directions', kpis: compactKpis(kpis) };
        html = withGreeting(html, raw);
        return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'sprintCompare') {
        var names = parsed.names;
        var curName = parsed.current;
        var idx = names.indexOf(curName);
        if (idx < 0) idx = 0;
        var prevName = names[idx + parsed.offset];
        if (!curName) {
            html = '<p>Sprint siyahısı boşdur.</p>';
            text = 'Sprint yoxdur.';
            facts = { kind: 'empty' };
        } else if (!prevName) {
            html = '<p><strong>' + esc(curName) + '</strong> üçün ' + parsed.offset + ' sprint öncə tapılmadı. Yüklənmiş sprint sayı: ' + names.length + '.</p>';
            text = 'Kifayət qədər keçmiş sprint yoxdur.';
            facts = { kind: 'missingSprint', current: curName, offset: parsed.offset, count: names.length };
        } else {
            var cur = sprintBucket(curName, false, curName);
            var prev = sprintBucket(prevName, true, curName);
            cur.label = curName;
            prev.label = prevName;
            html = formatSprintCompare(cur, prev, parsed.offset);
            text = stripHtml(html);
            facts = factsFromBuckets('sprintCompare', cur, prev, { offset: parsed.offset });
        }
    } else if (parsed.kind === 'sprintPair') {
        var a = sprintBucket(parsed.a, false, parsed.a);
        var b = sprintBucket(parsed.b, true, parsed.a);
        html = formatSprintCompare(a, b, 0);
        text = stripHtml(html);
        facts = factsFromBuckets('sprintPair', a, b, {});
    } else if (parsed.kind === 'entityCompare') {
        var left = entityBucket(parsed.left, parsed.sprint);
        var right = entityBucket(parsed.right, parsed.sprint);
        html = formatEntityCompare(left, right, parsed.sprint);
        text = stripHtml(html);
        facts = factsFromBuckets('entityCompare', left, right, { sprint: parsed.sprint || 'all' });
    } else if (parsed.kind === 'entity') {
        var one = entityBucket(parsed.entity, parsed.sprint);
        html = formatBucket(parsed.entity.label, parsed.entity.kind === 'assess' ? 'Qiymətləndirmə' : 'İstiqamət', one, parsed.sprint ? 'Sprint: ' + esc(parsed.sprint) : 'Bütün tapşırıqlar');
        text = stripHtml(html);
        facts = factsFromBuckets('entity', one, null, { sprint: parsed.sprint || 'all' });
    } else if (parsed.kind === 'sprint') {
        var sprintName = parsed.sprint;
        if (parsed.offset && parsed.names) {
            var si = parsed.names.indexOf(resolveCurrentSprint(parsed.names));
            sprintName = parsed.names[Math.max(0, si) + parsed.offset] || sprintName;
        }
        var sb = sprintBucket(sprintName, false, sprintName);
        html = formatBucket(sprintName || 'Sprint', 'Sprint icmalı', sb, 'Seçilmiş/cari sprint üzrə tapşırıq kartı metodikası.');
        text = stripHtml(html);
        facts = factsFromBuckets('sprint', sb, null, {});
    } else {
        html = formatOpenAnalysis(raw, kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'open', question: raw, kpis: compactKpis(kpis) };
    }
    html = withGreeting(html, raw);
    return { html: html, text: stripHtml(html), facts: facts, evidence: ev, question: raw };
}

function detectChatIntent(question, kind) {
    var q = fold(question || '');
    var k = String(kind || '');
    // Explicit kinds win; map person→people for routing
    if (k === 'person') return 'people';
    if (k === 'risk') return /blok|cetinlik/.test(q) ? 'blocked' : 'late';
    if (k && k !== 'open') return k;
    if (/salam|hello|necesen|sabahiniz|axsaminiz/.test(q)) return 'greet';
    if (/tesekkur|sagol|sag olun/.test(q)) return 'thanks';
    if (/sen kimsen|kimsen|ai done|ne ede bilersen|komek/.test(q)) return /komek|ne ede/.test(q) ? 'help' : 'identity';
    if (/menim|oz islerim|oz tapsiriq|menim islerim|taskim|tapsiriqim|tapsiriqlarim|islerim\b/.test(q)) return 'mine';
    if (/gecik/.test(q)) return 'late';
    if (/blok|cetinlik/.test(q)) return 'blocked';
    if (/is yuku|icraci|kimde|kim ustunde/.test(q)) return 'people';
    if (/qurum/.test(q)) return 'qurum';
    if (/istiqamet/.test(q)) return 'directions';
    if (/sprint/.test(q)) return 'sprint';
    if (/qiymetlendir|diaqnostika|exq|isq|meqsed/.test(q)) return 'assess';
    if (/veziyyet|xulase|icmal|nece gedir|cari hefte/.test(q)) return 'overview';
    if (/dgd-\d+/i.test(question || '')) return 'issue';
    return 'open';
}

function packChatFacts(local) {
    var ev = local.evidence;
    if (!ev) {
        try { if (hasData()) ev = collectEvidence(); } catch (e) { ev = null; }
    }
    var names = [];
    try { names = sprintList().slice(0, 8); } catch (e) { names = []; }
    var viewer = viewerFact();
    var kind = (local.facts && local.facts.kind) || 'open';
    var intent = detectChatIntent(local.question || '', kind);
    var mine = null;
    if (viewer && ev) {
        var selfName = viewer.jiraDisplayName || viewerAssigneeName();
        mine = {
            name: selfName,
            stats: (ev.people || []).filter(function(p) { return samePerson(p.name, selfName); })[0] || null,
            late: (ev.late || []).filter(function(it) { return samePerson(it.who, selfName); }).slice(0, 6),
            blocked: (ev.blocked || []).filter(function(it) { return samePerson(it.who, selfName); }).slice(0, 6),
            dueOpen: (ev.dueOpen || []).filter(function(it) { return samePerson(it.who, selfName); }).slice(0, 6)
        };
    }
    var board = boardContext();
    var matched = [];
    try { matched = findTasksByWords(fold(local.question || '')).slice(0, 10); } catch (e2) { matched = []; }

    // Suala görə yalnız lazımi kəsikləri göndər — open-da ümumi KPI tökülməsin
    var isOpen = intent === 'open';
    var wantPeople = /people|person|mine|late|blocked|overview|risk|kpi/.test(intent);
    var wantDirs = /directions|entity|overview|risk/.test(intent);
    var wantQurums = /qurum|overview/.test(intent);
    var wantLate = /late|risk|overview|mine|person|kpi/.test(intent);
    var wantBlocked = /blocked|risk|overview|mine|person|kpi/.test(intent);
    var wantDue = /overview|risk|sprint|mine|kpi|due/.test(intent);
    var qFoldOpen = fold(local.question || '');
    var wantNumbers = !isOpen && (intent !== 'issue' || !matched.length);
    if (isOpen) {
        // Açıq sualda yalnız sual rəqəm/vəziyyət istəyəndə yüngül KPI
        wantNumbers = /nece|say|veziyyet|xulase|icmal|faiz|%/.test(qFoldOpen);
        if (/gecik/.test(qFoldOpen)) wantLate = true;
        if (/blok|cetinlik/.test(qFoldOpen)) wantBlocked = true;
        if (/icraci|is yuku|kimde/.test(qFoldOpen)) wantPeople = true;
    }

    var packed = {
        kind: kind,
        intent: intent,
        question: local.question || '',
        viewer: viewer,
        board: board,
        scope: ev && ev.kpis ? scopeNote(ev.kpis) : scopeNote({
            sprint: board.sprint,
            direction: board.direction,
            qurum: board.qurum,
            assignee: board.assignee
        }),
        matchedTasks: matched,
        localKind: kind,
        guidance: 'Yalnız suala aid sahələrdən istifadə et. Soruşulmayan KPI xülasəsi yazma.'
    };
    if (mine && (intent === 'mine' || intent === 'person' || /menim/.test(fold(local.question || '')))) {
        packed.mine = mine;
    } else if (mine && wantPeople) {
        packed.mine = { name: mine.name, stats: mine.stats };
    }
    if (wantNumbers) {
        packed.numbers = ev && ev.kpis ? compactKpis(ev.kpis) : ((local.facts && local.facts.kpis) || {});
    }
    if (wantPeople) packed.people = ev ? (ev.people || []).slice(0, 12) : [];
    if (wantDirs) packed.directions = ev ? (ev.dirs || []).slice(0, 10) : [];
    if (wantQurums) packed.qurums = ev ? (ev.qurums || []).slice(0, 10) : [];
    if (wantLate) packed.late = ev ? (ev.late || []).slice(0, 8) : [];
    if (wantBlocked) packed.blocked = ev ? (ev.blocked || []).slice(0, 8) : [];
    if (wantDue) {
        packed.dueOpen = ev ? (ev.dueOpen || []).slice(0, 8) : [];
        packed.dueDone = ev ? (ev.dueDone || []).slice(0, 6) : [];
    }
    if (local.facts && local.facts.a) {
        packed.compare = { a: local.facts.a, b: local.facts.b, meta: local.facts.meta || {} };
    }
    if (local.facts && local.facts.focus) packed.focus = local.facts.focus;
    if (local.facts && local.facts.person) packed.person = local.facts.person;
    if (local.facts && local.facts.qurum) packed.qurum = local.facts.qurum;
    if (local.facts && local.facts.key) packed.key = local.facts.key;
    if (/sprint|overview|open/.test(intent)) packed.sprints = names;
    return packed;
}

function compactKpis(kpis) {
    return {
        sprint: kpis.sprint,
        total: kpis.total,
        done: kpis.done,
        open: kpis.open,
        blocked: kpis.blocked,
        progress: kpis.progress,
        planned: kpis.planned,
        late: kpis.late,
        rejected: kpis.rejected,
        backlog: kpis.backlog,
        due: kpis.due,
        dueDone: kpis.dueDone,
        rate: kpis.rate,
        assess: kpis.assess
    };
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|h4|tr|li|div)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function renderMarkdownish(text) {
    var lines = String(text || '').split(/\n/);
    var out = [];
    var list = [];
    function flushList() {
        if (!list.length) return;
        out.push('<ul class="dash-chat-help">' + list.join('') + '</ul>');
        list = [];
    }
    function inline(s) {
        return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }
    var i;
    for (i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/\s+$/, '');
        if (!line.trim()) {
            flushList();
            continue;
        }
        var h = line.match(/^#{1,3}\s+(.+)/);
        if (h) {
            flushList();
            out.push('<h4>' + inline(h[1]) + '</h4>');
            continue;
        }
        var li = line.match(/^[-*•]\s+(.+)/);
        if (li) {
            list.push('<li>' + inline(li[1]) + '</li>');
            continue;
        }
        flushList();
        out.push('<p class="dash-chat-lead">' + inline(line) + '</p>');
    }
    flushList();
    return out.join('') || '<p></p>';
}

function el(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
}

function ensureUi() {
    if (document.getElementById('dashChatRoot')) {
        mountDoneBotWidget();
        return;
    }
    var root = el(
        '<div id="dashChatRoot" class="dash-chat">'
        + '<section id="dashChatPanel" class="dash-chat-panel hidden" hidden role="dialog" aria-labelledby="dashChatTitle">'
        + '<header class="dash-chat-head">'
        + '<div class="dash-chat-head-id">'
        + '<span class="dash-chat-mark" aria-hidden="true">AI</span>'
        + '<div><p class="dash-chat-brand">Süni intellekt köməkçiniz</p><h2 id="dashChatTitle">AI Done xidmətinizdədir!</h2></div>'
        + '</div>'
        + '<div class="dash-chat-head-actions">'
        + '<button type="button" id="dashChatClear" class="dash-chat-iconbtn" title="Söhbəti təmizlə" aria-label="Söhbəti təmizlə">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button>'
        + '<button type="button" id="dashChatClose" class="dash-chat-iconbtn" title="Bağla" aria-label="Bağla">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
        + '</div></header>'
        + '<div class="dash-chat-body">'
        + '<div id="dashChatLog" class="dash-chat-log" role="log" aria-live="polite"></div>'
        + '<div id="dashChatShow" class="dash-chat-show hidden" hidden>'
        + '<div class="dash-chat-show-bar">'
        + '<strong>Hesabat</strong>'
        + '<div class="dash-chat-show-bar-actions">'
        + '<button type="button" id="dashChatShowDl" class="dash-chat-report-btn is-primary">Yüklə</button>'
        + '<button type="button" id="dashChatShowClose" class="dash-chat-iconbtn is-light" title="Bağla" aria-label="Önizləməni bağla">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
        + '</div></div>'
        + '<div id="dashChatShowBody" class="dash-chat-show-body"></div>'
        + '</div></div>'
        + '<div id="dashChatHints" class="dash-chat-hints"></div>'
        + '<form id="dashChatForm" class="dash-chat-form">'
        + '<label class="sr-only" for="dashChatInput">Sual</label>'
        + '<textarea id="dashChatInput" rows="2" placeholder="Sualınızı yazın"></textarea>'
        + '<button type="submit" id="dashChatSend" class="dash-chat-send" title="Göndər" aria-label="Göndər">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>'
        + '</button></form></section></div>'
    );
    document.body.appendChild(root);
    document.getElementById('dashChatClose').addEventListener('click', closeChat);
    document.getElementById('dashChatClear').addEventListener('click', resetChat);
    document.getElementById('dashChatForm').addEventListener('submit', onSubmit);
    document.getElementById('dashChatLog').addEventListener('click', onChatAction);
    document.getElementById('dashChatShowClose').addEventListener('click', closeReportPreview);
    document.getElementById('dashChatShowDl').addEventListener('click', downloadChatReport);
    document.getElementById('dashChatInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('dashChatForm').requestSubmit();
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && chatOpen) closeChat();
    });
    mountDoneBotWidget();
    syncAiBotNotifyFromState();
    if (!restoreThread()) addBot(welcomeHtml(), false);
    renderHints();
}

function mountDoneBotWidget() {
    mountDoneBot({
        userName: viewerFirstName() || '',
        onOpen: function() {
            openChat();
        },
        onClose: function() {
            if (chatOpen) closeChat();
        }
    });
    var api = getDoneBot();
    if (api && typeof api.setUserName === 'function') {
        api.setUserName(viewerFirstName() || '');
    }
}

export function syncAiBotNotifyFromState() {
    var n = (state.todayTasks && state.todayTasks.length) || 0;
    var api = getDoneBot() || window.DoneBot;
    if (api && typeof api.setAlert === 'function') {
        api.setAlert(n > 0 && !chatOpen);
    }
}
state.syncAiBotNotify = syncAiBotNotifyFromState;

function welcomeHtml() {
    var name = viewerGreetingName() || viewerFirstName();
    var jira = viewerAssigneeName() || (viewerUser() && viewerUser().jiraDisplayName) || '';
    var hello = name ? ('Gününüz xoş keçsin, ' + esc(name) + '!') : 'Gününüz xoş keçsin!';
    var extra = jira
        ? ' Sizi Jira-da «' + esc(jira) + '» kimi tanıyıram. «Mənim işlərim» yazın — sizin tapşırıqlarınıza baxaram.'
        : ' Sizə necə kömək edə bilərəm? Tapşırıq, sprint, icraçı və qiymətləndirmə rəqəmlərini oxuyub izah edirəm.';
    return '<p>' + hello + ' Mən süni intellekt köməkçiniz <strong>AI Done</strong>-am.' + extra + '</p>';
}

function onChatAction(e) {
    var showBtn = e.target.closest('[data-chat-report="show"]');
    var dlBtn = e.target.closest('[data-chat-report="download"]');
    var retryBtn = e.target.closest('[data-retry-q]');
    if (showBtn) {
        e.preventDefault();
        openReportPreview();
    }
    if (dlBtn && !dlBtn.disabled) {
        e.preventDefault();
        downloadChatReport();
    }
    if (retryBtn && !chatBusy) {
        e.preventDefault();
        var rq = retryBtn.getAttribute('data-retry-q');
        if (!rq) return;
        document.getElementById('dashChatInput').value = rq;
        document.getElementById('dashChatForm').requestSubmit();
    }
}

function openReportPreview() {
    var box = document.getElementById('dashChatShow');
    var body = document.getElementById('dashChatShowBody');
    if (!box || !body) return;
    body.innerHTML = lastReportPreview || '<p>Hələ göstəriləcək hesabat yoxdur. «Hesabatı göstərin və yükləyin» yazın.</p>';
    box.classList.remove('hidden');
    box.hidden = false;
}

function closeReportPreview() {
    var box = document.getElementById('dashChatShow');
    if (!box) return;
    box.classList.add('hidden');
    box.hidden = true;
}

async function downloadChatReport() {
    try {
        await exportTasksToWord(lastReportTitle || 'Hesabat');
    } catch (err) {
        var body = document.getElementById('dashChatShowBody');
        if (body && !lastReportPreview) body.innerHTML = '<p>Hesabat yüklənmədi. Məlumatı yeniləyib yenidən cəhd edin.</p>';
    }
}

function renderHints() {
    var box = document.getElementById('dashChatHints');
    if (!box) return;
    // İlk mesajdan sonra sürətli keçidləri gizlət — səs-küy azalır
    if (chatHistory.length > 0) {
        box.innerHTML = '';
        box.classList.add('is-empty');
        return;
    }
    var hints = SUGGESTIONS.slice(0, 2);
    box.classList.remove('is-empty');
    box.innerHTML = '<p class="dash-chat-hints-label">Nümunə</p>'
        + '<div class="dash-chat-hints-grid">'
        + hints.map(function(s) {
            return '<button type="button" class="dash-chat-hint" data-q="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('')
        + '</div>';
    box.onclick = function(e) {
        var btn = e.target.closest('[data-q]');
        if (!btn) return;
        document.getElementById('dashChatInput').value = btn.getAttribute('data-q');
        document.getElementById('dashChatForm').requestSubmit();
    };
}

function toggleChat() {
    if (chatOpen) closeChat();
    else openChat();
}

function openChat() {
    chatOpen = true;
    var panel = document.getElementById('dashChatPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.hidden = false;
    document.getElementById('dashChatRoot').classList.add('is-open');
    var api = getDoneBot() || window.DoneBot;
    if (api && typeof api.setAlert === 'function') api.setAlert(false);
    syncAiBotNotifyFromState();
    setTimeout(function() {
        var input = document.getElementById('dashChatInput');
        if (input) input.focus();
    }, 50);
}

function closeChat() {
    chatOpen = false;
    var panel = document.getElementById('dashChatPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.hidden = true;
    document.getElementById('dashChatRoot').classList.remove('is-open');
    syncAiBotNotifyFromState();
}

function resetChat() {
    chatEpoch += 1;
    if (chatAbort) chatAbort.abort();
    chatHistory = [];
    try { sessionStorage.removeItem(CHAT_THREAD_KEY); } catch (e) {}
    lastReportPreview = '';
    closeReportPreview();
    var log = document.getElementById('dashChatLog');
    if (log) log.innerHTML = '';
    addBot(welcomeHtml(), false);
    renderHints();
}

function remember(role, content) {
    chatHistory.push({ role: role, content: String(content || '').slice(0, 2000) });
    if (chatHistory.length > 24) chatHistory = chatHistory.slice(-24);
    try { sessionStorage.setItem(CHAT_THREAD_KEY, JSON.stringify(chatHistory)); } catch (e) {}
}

function syncLogMode() {
    var log = document.getElementById('dashChatLog');
    if (!log) return;
    log.classList.toggle('is-fresh', !log.querySelector('.dash-chat-msg.is-user'));
}

function scrollLog(force) {
    var log = document.getElementById('dashChatLog');
    if (!log) return;
    var near = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    if (force || near) log.scrollTop = log.scrollHeight;
}

function autosizeChatInput() {
    var input = document.getElementById('dashChatInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(Math.max(input.scrollHeight, 24), 160) + 'px';
    var send = document.getElementById('dashChatSend');
    if (send) send.classList.toggle('is-idle', !String(input.value || '').trim());
}

function setComposerBusy(busy) {
    var input = document.getElementById('dashChatInput');
    var send = document.getElementById('dashChatSend');
    if (input) input.disabled = !!busy;
    if (send) {
        send.disabled = !!busy;
        send.classList.toggle('is-busy', !!busy);
    }
}

function thinkingHtml() {
    return '<div class="dash-chat-thinking" aria-label="Düşünürəm"><span></span><span></span><span></span></div>';
}

function wait(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function restoreThread() {
    var raw = '';
    try { raw = sessionStorage.getItem(CHAT_THREAD_KEY) || ''; } catch (e) { return false; }
    if (!raw) return false;
    var items;
    try { items = JSON.parse(raw); } catch (e2) { return false; }
    if (!Array.isArray(items) || !items.length) return false;
    var clean = [];
    var i;
    for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || (it.role !== 'user' && it.role !== 'assistant')) continue;
        var content = String(it.content || '').trim();
        if (!content) continue;
        clean.push({ role: it.role, content: content.slice(0, 2000) });
    }
    if (!clean.length) return false;
    chatHistory = clean.slice(-24);
    var log = document.getElementById('dashChatLog');
    if (log) log.innerHTML = '';
    for (i = 0; i < chatHistory.length; i++) {
        if (chatHistory[i].role === 'user') addUser(chatHistory[i].content);
        else addBot('<div class="dash-chat-md">' + renderMarkdownSafe(chatHistory[i].content) + '</div>', false);
    }
    scrollLog(true);
    return true;
}

function llmEnabled() {
    return chatLlm;
}

function addUser(text) {
    var log = document.getElementById('dashChatLog');
    var row = document.createElement('div');
    row.className = 'dash-chat-msg is-user';
    row.innerHTML = '<div class="dash-chat-bubble"></div>';
    row.querySelector('.dash-chat-bubble').textContent = text;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
}

function addBot(html, pending) {
    var log = document.getElementById('dashChatLog');
    var row = document.createElement('div');
    row.className = 'dash-chat-msg is-bot' + (pending ? ' is-pending' : '');
    row.innerHTML = '<div class="dash-chat-who">' + esc(BOT_NAME) + '</div>'
        + '<div class="dash-chat-bubble">' + html + '</div>'
        + '<div class="dash-chat-feedback hidden" hidden></div>';
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
}

function showTools(row) {
    if (!row || row.querySelector('.dash-chat-tool')) return;
    var tools = row.querySelector('.dash-chat-tools');
    if (!tools) return;
    tools.hidden = false;
    tools.innerHTML = '<button type="button" class="dash-chat-tool" data-act="copy" title="Kopyala" aria-label="Kopyala">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
        + '</button>';
    tools.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-act="copy"]');
        if (!btn) return;
        var bubble = row.querySelector('.dash-chat-bubble');
        var text = bubble ? String(bubble.innerText || '').trim() : '';
        if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
        navigator.clipboard.writeText(text).then(function() {
            btn.classList.add('is-on');
            btn.setAttribute('title', 'Kopyalandı');
            setTimeout(function() {
                btn.classList.remove('is-on');
                btn.setAttribute('title', 'Kopyala');
            }, 1400);
        }).catch(function() {});
    });
}

function markFeedbackSent(box, vote, taught) {
    if (!box) return;
    box.classList.add('is-sent');
    Array.prototype.forEach.call(box.querySelectorAll('.dash-chat-fb'), function(b) {
        b.disabled = true;
        b.classList.toggle('is-on', b.getAttribute('data-vote') === vote);
    });
    var reasons = box.querySelector('.dash-chat-fb-reasons');
    if (reasons) reasons.remove();
    var teach = box.querySelector('.dash-chat-fb-teach');
    if (teach) teach.remove();
    var label = box.querySelector('.dash-chat-feedback-label');
    if (label) {
        if (taught) label.textContent = 'Öyrədildi — növbəti oxşar sualda istifadə olunacaq';
        else if (vote === 'up') label.textContent = 'Təşəkkürlər';
        else label.textContent = 'Qeyd olundu';
    }
}

function sendChatFeedback(chatId, vote, reason, box, correctAnswer) {
    if (!box) return;
    var taught = !!(correctAnswer && String(correctAnswer).trim());
    markFeedbackSent(box, vote, taught);
    fetch('/api/chat/feedback', {
        credentials: 'same-origin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chatId: chatId,
            vote: vote,
            reason: reason || '',
            correctAnswer: taught ? String(correctAnswer).trim() : ''
        })
    }).then(function(res) {
        return res.json().catch(function() { return {}; }).then(function(data) {
            if (!res.ok) {
                if (box) {
                    var label = box.querySelector('.dash-chat-feedback-label');
                    if (label) label.textContent = (data && data.error) || 'Saxlanmadı';
                }
                return;
            }
            if (data && data.taught) markFeedbackSent(box, vote, true);
        });
    }).catch(function() {});
}

function showTeachPanel(box, chatId, reason) {
    if (!box || box.querySelector('.dash-chat-fb-teach')) return;
    var teach = document.createElement('div');
    teach.className = 'dash-chat-fb-teach';
    teach.innerHTML =
        '<label class="dash-chat-fb-teach-label">Düzgün cavabı yaz — bot öyrənsin</label>'
        + '<textarea class="dash-chat-fb-teach-input" rows="3" maxlength="1200" placeholder="Bu suala düzgün cavab nə olmalıdır?"></textarea>'
        + '<div class="dash-chat-fb-teach-actions">'
        + '<button type="button" class="dash-chat-fb-teach-save">Öyrət</button>'
        + '<button type="button" class="dash-chat-fb-teach-skip">Yalnız qeyd et</button>'
        + '</div>';
    box.appendChild(teach);
    var input = teach.querySelector('.dash-chat-fb-teach-input');
    teach.querySelector('.dash-chat-fb-teach-save').onclick = function() {
        var text = String((input && input.value) || '').trim();
        if (!text) {
            if (input) input.focus();
            return;
        }
        sendChatFeedback(chatId, 'down', reason || '', box, text);
    };
    teach.querySelector('.dash-chat-fb-teach-skip').onclick = function() {
        sendChatFeedback(chatId, 'down', reason || '', box, '');
    };
    if (input) setTimeout(function() { try { input.focus(); } catch (e) {} }, 0);
}

function attachFeedback(row, chatId) {
    if (!row || !chatId) return;
    var box = row.querySelector('.dash-chat-feedback');
    if (!box) return;
    box.hidden = false;
    box.classList.remove('hidden');
    box.innerHTML = '<span class="dash-chat-feedback-label">Cavab faydalı oldu?</span>'
        + '<button type="button" class="dash-chat-fb" data-vote="up" title="Yaxşı" aria-label="Yaxşı">👍</button>'
        + '<button type="button" class="dash-chat-fb" data-vote="down" title="Səhv — düzəlt" aria-label="Səhv">👎</button>';
    box.onclick = function(e) {
        if (box.classList.contains('is-sent')) return;
        if (e.target.closest('.dash-chat-fb-teach')) return;
        var reasonBtn = e.target.closest('[data-reason]');
        if (reasonBtn) {
            var reason = reasonBtn.getAttribute('data-reason') || '';
            var reasons = box.querySelector('.dash-chat-fb-reasons');
            if (reasons) reasons.remove();
            showTeachPanel(box, chatId, reason);
            return;
        }
        var btn = e.target.closest('[data-vote]');
        if (!btn) return;
        var vote = btn.getAttribute('data-vote');
        if (vote === 'up') {
            sendChatFeedback(chatId, 'up', '', box, '');
            return;
        }
        // 👎: səbəb + düzgün cavab paneli
        if (box.querySelector('.dash-chat-fb-reasons') || box.querySelector('.dash-chat-fb-teach')) return;
        Array.prototype.forEach.call(box.querySelectorAll('.dash-chat-fb'), function(b) {
            b.classList.toggle('is-on', b.getAttribute('data-vote') === 'down');
        });
        var reasonsEl = document.createElement('div');
        reasonsEl.className = 'dash-chat-fb-reasons';
        reasonsEl.innerHTML =
            '<button type="button" class="dash-chat-fb-reason" data-reason="sualı başa düşmədi">Başa düşmədi</button>'
            + '<button type="button" class="dash-chat-fb-reason" data-reason="yanlış rəqəm">Yanlış rəqəm</button>'
            + '<button type="button" class="dash-chat-fb-reason" data-reason="ümumi danışdı">Ümumi danışdı</button>'
            + '<button type="button" class="dash-chat-fb-reason" data-reason="başqa">Başqa</button>';
        box.appendChild(reasonsEl);
    };
}

function paintYield() {
    return new Promise(function(resolve) {
        requestAnimationFrame(function() {
            requestAnimationFrame(function() { resolve(); });
        });
    });
}

function onSubmit(e) {
    e.preventDefault();
    if (chatBusy) {
        chatWarn('göndərmə gözlənilir — əvvəlki cavab hələ gəlir');
        return;
    }
    var input = document.getElementById('dashChatInput');
    var q = String(input.value || '').trim();
    if (!q) return;
    input.value = '';
    try { autosizeChatInput(); } catch (e0) {}
    addUser(q);
    chatLog('istifadəçi mesajı', q.slice(0, 80));
    // Əvvəl mesajı ekranda göstər, sonra ağır snapshot/LLM işinə keç
    var log = document.getElementById('dashChatLog');
    if (log) {
        try { void log.offsetHeight; } catch (e1) {}
        log.scrollTop = log.scrollHeight;
    }
    setTimeout(function() { reply(q); }, 0);
}

function softFailHtml(question, detail) {
    var note = SOFT_FAIL_HINT;
    var d = String(detail || '').trim();
    if (d) {
        if (/açar|key|401|yoxdur/i.test(d)) {
            note = 'Serverdə LLM açarı yoxdur: deploy serverində .env faylına OPENAI_API_KEY yazıb prosesi yenidən başladın.';
        } else if (/timeout|vaxt/i.test(d)) {
            note = 'Cavab vaxtı bitdi. Bir az sonra yenidən yoxlayın.';
        } else if (/429|limit|quota/i.test(d)) {
            note = 'LLM limiti dolub (429). Bir az sonra yenidən yoxlayın.';
        } else {
            note = d.slice(0, 220);
        }
    }
    return '<p class="dash-chat-lead">' + esc(SOFT_FAIL) + '</p>'
        + '<p class="dash-chat-note">' + esc(note) + '</p>'
        + '<button type="button" class="dash-chat-retry" data-retry-q="' + esc(question) + '">Yenidən cəhd et</button>';
}

function renderMarkdownSafe(text) {
    var raw = String(text || '');
    try {
        if (typeof marked !== 'undefined' && marked && typeof marked.parse === 'function') {
            raw = marked.parse(raw, { breaks: true, gfm: true });
        } else {
            raw = renderMarkdownish(text);
        }
    } catch (e) {
        raw = renderMarkdownish(text);
    }
    try {
        if (typeof DOMPurify !== 'undefined' && DOMPurify && typeof DOMPurify.sanitize === 'function') {
            return DOMPurify.sanitize(raw, {
                USE_PROFILES: { html: true },
                ADD_ATTR: ['class']
            });
        }
    } catch (e2) {}
    return renderMarkdownish(text);
}

function parseAssessScoreNum(raw) {
    if (raw == null || raw === '' || raw === '—') return null;
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    var n = parseFloat(String(raw).replace(',', '.').replace('%', '').trim());
    return isFinite(n) ? n : null;
}

function assessmentScoreForCat(cat, t) {
    try {
        if (cat === 'diag') return parseAssessScoreNum(getDiagScore(t));
        if (cat === 'exq') {
            var exq = getExqResult(t);
            return exq && exq.percent != null ? parseAssessScoreNum(exq.percent) : null;
        }
        if (cat === 'isq') return parseAssessScoreNum(getIsqScore(t));
        if (cat === 'self') {
            var info = getSelfAssessInfo(t);
            return parseAssessScoreNum(info && info.score);
        }
    } catch (e) {}
    return null;
}

function buildAssessmentSnapshotRows() {
    var collected = [];
    var source = state.allTasks || [];
    var i;
    for (i = 0; i < source.length; i++) {
        var t = source[i];
        if (!t || !t.key) continue;
        var cat = '';
        try { cat = classifyAssessmentCategory(t) || ''; } catch (e0) { cat = ''; }
        // meqsed rəyləri ayrıca (buildMeqsedOpinionRows) — burada qurum+bal collapse etmə
        if (!cat || (cat !== 'diag' && cat !== 'exq' && cat !== 'isq' && cat !== 'self')) {
            continue;
        }
        var score = assessmentScoreForCat(cat, t);
        var hasRes = false;
        try { hasRes = !!hasAssessmentResult(cat, t); } catch (e1) { hasRes = score != null; }
        // Ballı və ya nəticəsi olanları göndər — «ən yüksək bal» üçün score lazımdır
        if (score == null && !hasRes) continue;
        var qurum = '';
        try { qurum = getAssessmentQurumLabel(t) || getQurumName(t) || ''; } catch (e2) {
            try { qurum = getQurumName(t) || ''; } catch (e3) { qurum = ''; }
        }
        var year = '';
        var yearN = null;
        try {
            var y = getAssessmentYear(t);
            if (y != null && isFinite(y)) {
                yearN = Number(y);
                year = String(y);
            }
        } catch (e4) {}
        collected.push({
            cat: cat,
            qurum: String(qurum || '').replace(/\|/g, '/').slice(0, 120),
            score: score,
            year: year,
            yearN: yearN,
            key: String(t.key)
        });
    }
    // Hər cat+qurum üçün bir sətir: balı olan / daha yeni il üstün
    var best = {};
    collected.forEach(function(row) {
        var qk = fold(row.qurum || '') || row.key;
        var id = row.cat + '::' + qk;
        var prev = best[id];
        if (!prev) {
            best[id] = row;
            return;
        }
        var ps = prev.score != null ? 1 : 0;
        var rs = row.score != null ? 1 : 0;
        if (rs !== ps) {
            if (rs > ps) best[id] = row;
            return;
        }
        if (row.score != null && prev.score != null && row.score !== prev.score) {
            if (row.score > prev.score) best[id] = row;
            return;
        }
        var py = prev.yearN || 0;
        var ry = row.yearN || 0;
        if (ry > py) best[id] = row;
    });
    var rows = Object.keys(best).map(function(id) {
        var row = best[id];
        return [
            row.cat,
            row.qurum,
            row.score != null ? String(Math.round(row.score * 10) / 10) : '',
            row.year,
            row.key
        ].join('|');
    });
    // Balı olan diaq/exq/isq əvvəl — truncate olanda itməsin
    rows.sort(function(a, b) {
        var pa = a.split('|');
        var pb = b.split('|');
        var sa = pa[2] ? 1 : 0;
        var sb = pb[2] ? 1 : 0;
        if (sa !== sb) return sb - sa;
        var ca = pa[0] === 'diag' ? 0 : 1;
        var cb = pb[0] === 'diag' ? 0 : 1;
        if (ca !== cb) return ca - cb;
        var na = parseFloat(pa[2] || '0') || 0;
        var nb = parseFloat(pb[2] || '0') || 0;
        return nb - na;
    });
    if (rows.length > MAX_SNAPSHOT_ASSESS) rows = rows.slice(0, MAX_SNAPSHOT_ASSESS);
    return rows;
}

function buildMeqsedOpinionRows() {
    var rows = [];
    var source = state.allTasks || [];
    var i;
    for (i = 0; i < source.length; i++) {
        var t = source[i];
        if (!t || !t.key) continue;
        var cat = '';
        try { cat = classifyAssessmentCategory(t) || ''; } catch (e0) { cat = ''; }
        if (cat !== 'meqsed') continue;
        var op = '';
        try {
            var info = getMeqsedInfo(t);
            op = (info && info.opinionKind) || '';
        } catch (e1) { op = ''; }
        if (!op) continue;
        var qurum = '';
        try { qurum = getAssessmentQurumLabel(t) || getQurumName(t) || ''; } catch (e2) {
            try { qurum = getQurumName(t) || ''; } catch (e3) { qurum = ''; }
        }
        var year = '';
        try {
            var y = getAssessmentYear(t);
            if (y != null && isFinite(y)) year = String(y);
        } catch (e4) {}
        rows.push([
            'meqsed',
            String(qurum || '').replace(/\|/g, '/').slice(0, 120),
            String(op),
            year,
            String(t.key)
        ].join('|'));
    }
    // Müsbət/mənfi əvvəl — truncate olanda say itməsin
    rows.sort(function(a, b) {
        var oa = a.split('|')[2] || '';
        var ob = b.split('|')[2] || '';
        var ra = oa === 'pos' ? 0 : (oa === 'neg' ? 1 : 2);
        var rb = ob === 'pos' ? 0 : (ob === 'neg' ? 1 : 2);
        return ra - rb;
    });
    if (rows.length > MAX_SNAPSHOT_ASSESS) rows = rows.slice(0, MAX_SNAPSHOT_ASSESS);
    return rows;
}

function deriveQurumAliases(name) {
    var raw = String(name || '').trim();
    if (!raw) return [];
    var out = [];
    var re = /\(\s*([A-Za-zÇçƏəĞğIıİiÖöŞşÜü0-9]{2,14})\s*\)/g;
    var m;
    while ((m = re.exec(raw))) {
        if (m[1]) out.push(m[1].trim());
    }
    var full = raw.replace(/\(\s*[A-Za-zÇçƏəĞğIıİiÖöŞşÜü0-9]{2,14}\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (full && full !== raw) out.push(full);
    var folded = fold(full || raw);
    var words = folded.split(' ').filter(function(w) {
        return w.length >= 4
            && !/^(dovlet|azerbaycan|respublikasi|ve|ile|nazirlik|agentlik|xidmet|komite|idare|birlik)$/.test(w);
    });
    words.forEach(function(w) {
        if (w.length >= 5) out.push(w);
    });
    if (words.length >= 2) out.push(words.slice(0, 2).join(' '));
    // initials
    var initials = (full || raw).split(/[\s\-–,;/]+/).map(function(tok) {
        tok = String(tok || '').trim();
        if (!tok || tok.charAt(0) === '(') return '';
        var ft = fold(tok);
        if (!ft || ft.length < 2 || /^(ve|ile|ve)$/.test(ft)) return '';
        return tok.charAt(0);
    }).filter(Boolean);
    if (initials.length >= 2 && initials.length <= 6) {
        out.push(initials.join(''));
        out.push(initials.join('').toUpperCase());
    }
    var seen = {};
    return out.filter(function(a) {
        var k = fold(a);
        if (!k || k === folded || seen[k]) return false;
        seen[k] = true;
        return true;
    }).slice(0, 10);
}

function buildQurumCatalog() {
    var map = {};
    function add(raw) {
        var cleaned = String(raw || '').trim();
        if (!cleaned || cleaned === 'Təyin edilməyib') return;
        var parts = cleaned.split(/\s*,\s*/);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part) continue;
            var name = part;
            try { name = canonicalQurumName(part) || part; } catch (e) { name = part; }
            name = String(name || part).trim();
            if (!name) continue;
            var key = fold(name);
            if (!key) continue;
            if (!map[key]) {
                map[key] = { name: name, aliases: {}, n: 0 };
            }
            map[key].n += 1;
            if (name.length > String(map[key].name || '').length) map[key].name = name;
            deriveQurumAliases(name).concat(deriveQurumAliases(part)).forEach(function(a) {
                var ak = fold(a);
                if (ak) map[key].aliases[a] = true;
            });
            // raw short form if different
            if (fold(part) !== key) map[key].aliases[part] = true;
        }
    }
    (state.allTasks || []).forEach(function(t) {
        try { add(getQurumName(t)); } catch (e1) {}
        try { add(getAssessmentQurumLabel(t)); } catch (e2) {}
    });
    try {
        var idx = state.issueIndex || {};
        Object.keys(idx).forEach(function(k) {
            try { add(getQurumName(idx[k])); } catch (e3) {}
        });
    } catch (e4) {}
    return Object.keys(map).map(function(k) {
        var row = map[k];
        return {
            name: String(row.name || '').slice(0, 120),
            aliases: Object.keys(row.aliases || {}).slice(0, 12)
        };
    }).sort(function(a, b) {
        return String(a.name).localeCompare(String(b.name), 'az');
    }).slice(0, 200);
}

export function persistQurumCatalog() {
    var names = [];
    try {
        var cat = buildQurumCatalog();
        names = (cat || []).map(function(r) { return (r && r.name) || ''; }).filter(Boolean);
        var payload = JSON.stringify(names.slice(0, 200));
        localStorage.setItem('aiDoneQurums', payload);
        sessionStorage.setItem('aiDoneQurums', payload);
        localStorage.setItem('aiDoneQurumCatalog', JSON.stringify((cat || []).slice(0, 200)));
        window.__AI_DONE_QURUMS__ = names;
    } catch (e) {}
    return names;
}

function snapshotCacheHash() {
    var n = (state.allTasks && state.allTasks.length) || 0;
    var filt = (state.filteredTasks && state.filteredTasks.length) || 0;
    var aw = (state.assigneeChartTasks && state.assigneeChartTasks.length) || 0;
    var sp = '';
    try { sp = getSelectedSprintName() || ''; } catch (e) {}
    return [
        n,
        filt,
        aw,
        sp,
        state.currentDirectionFilter || '',
        state.currentQurumFilter || '',
        state.currentAssigneeFilter || '',
        state.currentStatusFilter || '',
        state.currentPriorityFilter || ''
    ].join('|');
}

function jiraValueText(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        return String(val).trim();
    }
    if (Array.isArray(val)) {
        return val.map(jiraValueText).filter(Boolean).join(', ');
    }
    if (typeof val === 'object') {
        if (val.displayName) return String(val.displayName);
        if (val.name) return String(val.name);
        if (val.value) return String(val.value);
        if (val.label) return String(val.label);
        if (val.key) return String(val.key);
        if (val.filename) return String(val.filename);
    }
    return '';
}

function buildTaskDetail(t) {
    if (!t || !t.key) return null;
    var f = t.fields || {};
    var fields = {};
    function put(label, value) {
        var v = String(value || '').trim();
        if (!v || v === '—') return;
        fields[label] = v.slice(0, 400);
    }
    put('Status', f.status && f.status.name);
    put('İcraçı', f.assignee && f.assignee.displayName);
    put('Prioritet', f.priority && f.priority.name);
    put('Tip', f.issuetype && f.issuetype.name);
    try { put('Qurum', getQurumName(t)); } catch (e0) {}
    try {
        var dd = getTaskDueDate(t);
        if (dd) put('Bitmə tarixi', formatDateObj(dd));
    } catch (e1) {}
    try {
        var dObj = resolveDirection(t);
        if (dObj && dObj.fields) put('İstiqamət', dObj.fields.summary || dObj.key);
        else if (dObj) put('İstiqamət', dObj);
    } catch (e2) {}
    try {
        var sn = getSprintNames(t);
        if (sn && sn[0]) put('Sprint', sn[0]);
    } catch (e3) {}
    try {
        var br = getBlockReason(t);
        if (br) put('Blok səbəbi', br);
    } catch (e4) {}
    try {
        var labs = (f.labels || []).map(function(lbl) {
            return typeof lbl === 'object' ? (lbl.name || lbl.value || '') : String(lbl || '');
        }).filter(Boolean);
        if (labs.length) put('Etiketlər', labs.join(', '));
    } catch (e5) {}
    if (f.parent && (f.parent.key || (f.parent.fields && f.parent.fields.summary))) {
        put('Parent', (f.parent.key || '') + (f.parent.fields && f.parent.fields.summary ? ' — ' + f.parent.fields.summary : ''));
    }
    // Jira custom field adları (paneldə görünən field-lər)
    var names = state.jiraFieldNames || {};
    var added = 0;
    var id;
    for (id in names) {
        if (!Object.prototype.hasOwnProperty.call(names, id)) continue;
        if (added >= 35) break;
        if (!Object.prototype.hasOwnProperty.call(f, id)) continue;
        var label = String(names[id] || '').trim();
        if (!label || label.length < 2) continue;
        var low = fold(label);
        if (/description|şərh|sherh|comment|attachment|əlavə|elave/.test(low)) continue;
        var text = jiraValueText(f[id]);
        if (!text || text === '—' || text.length > 500) continue;
        if (fields[label]) continue;
        put(label, text);
        added += 1;
    }
    var summary = String(f.summary || t.summary || '').slice(0, 200);
    return {
        key: String(t.key),
        summary: summary,
        status: (f.status && f.status.name) || '',
        assignee: (f.assignee && f.assignee.displayName) || '',
        qurum: fields['Qurum'] || '',
        fields: fields
    };
}

function collectFocusTaskDetails(question, hotTasks) {
    var out = {};
    var keys = String(question || '').match(/DGD-\d+/gi) || [];
    var i;
    for (i = 0; i < keys.length; i++) {
        var t = findTaskByKey(keys[i]);
        var d = buildTaskDetail(t);
        if (d) out[d.key] = d;
    }
    var hot = hotTasks || [];
    for (i = 0; i < hot.length && Object.keys(out).length < 25; i++) {
        if (!hot[i] || !hot[i].key || out[hot[i].key]) continue;
        var det = buildTaskDetail(hot[i]);
        if (det) out[det.key] = det;
    }
    return out;
}

function buildSnapshot(question) {
    var truncated = false;
    var sprint = '';
    try { sprint = getSelectedSprintName() || currentSprintName() || ''; } catch (e) { sprint = ''; }
    var week = '';
    var prevWeek = '';
    try {
        var names = sprintList();
        var cur = resolveCurrentSprint(names);
        week = cur || sprint || '';
        var idx = names.indexOf(cur);
        if (idx >= 0 && names[idx + 1]) prevWeek = names[idx + 1];
    } catch (e2) {}
    var overview = {};
    try {
        if (hasData()) {
            var k = liveKpis();
            overview = {
                total: k.total,
                done: k.done,
                open: k.open,
                blocked: k.blocked,
                progress: k.progress,
                planned: k.planned,
                late: k.late,
                rejected: k.rejected,
                backlog: k.backlog,
                due: k.due,
                dueDone: k.dueDone,
                rate: k.rate,
                completionPct: pct(k.done, k.total),
                sprint: k.sprint,
                direction: k.direction || '',
                qurum: k.qurum || '',
                assignee: k.assignee || ''
            };
        }
    } catch (e3) { overview = {}; }

    var tasks = [];
    var hotTasks = [];
    var source = state.allTasks || [];
    // Prioritet: gecikən/blok → açıq → qalan (field sualları üçün də hot detail)
    var ranked = [];
    var i;
    for (i = 0; i < source.length; i++) {
        var t0 = source[i];
        if (!t0 || !t0.key) continue;
        try {
            if (!isTaskOrSubtaskType(t0) && !isTaskType(t0)) continue;
        } catch (e4) { continue; }
        var rank = 2;
        try {
            if (getDateStatus(t0) === 'late') rank = 0;
            else if (isBlockedUnit(t0)) rank = 0;
            else {
                var stName = (t0.fields && t0.fields.status && t0.fields.status.name) || '';
                if (getStatusGroup(stName) !== 'done') rank = 1;
            }
        } catch (eR) {}
        ranked.push({ t: t0, rank: rank });
    }
    ranked.sort(function(a, b) { return a.rank - b.rank; });

    for (i = 0; i < ranked.length; i++) {
        var t = ranked[i].t;
        var f = t.fields || {};
        var statusName = (f.status && f.status.name) || '';
        var asg = f.assignee ? (f.assignee.displayName || '') : '';
        var pri = f.priority ? (f.priority.name || '') : '';
        var due = '';
        try {
            var dd = getTaskDueDate(t);
            if (dd) due = formatDateObj(dd) || '';
        } catch (e5) { due = ''; }
        var dir = '';
        try {
            var dObj = resolveDirection(t);
            if (dObj && typeof dObj === 'object') {
                dir = (dObj.fields && dObj.fields.summary) || dObj.key || '';
            } else if (dObj) {
                dir = String(dObj);
            }
        } catch (e6) { dir = ''; }
        var sp = '';
        try {
            var sn = getSprintNames(t);
            sp = (sn && sn[0]) || '';
        } catch (e7) { sp = ''; }
        var blocked = 0;
        var overdue = 0;
        try { if (isBlockedUnit(t)) blocked = 1; } catch (e8) {}
        try { if (getDateStatus(t) === 'late') overdue = 1; } catch (e9) {}
        var summary = '';
        try { summary = String((f.summary || t.summary || '')).replace(/\|/g, '/').slice(0, 90); } catch (eSum) { summary = ''; }
        var qurum = '';
        try { qurum = String(getQurumName(t) || '').replace(/\|/g, '/').slice(0, 80); } catch (eQur) { qurum = ''; }
        var row = [
            String(t.key),
            statusName.replace(/\|/g, '/'),
            asg.replace(/\|/g, '/'),
            pri.replace(/\|/g, '/'),
            due.replace(/\|/g, '/'),
            String(dir || '').replace(/\|/g, '/'),
            String(sp || '').replace(/\|/g, '/'),
            String(blocked),
            String(overdue),
            summary,
            qurum
        ].join('|');
        tasks.push(row);
        if (hotTasks.length < 20 && (blocked || overdue || ranked[i].rank <= 1)) {
            hotTasks.push(t);
        }
        if (tasks.length >= MAX_SNAPSHOT_TASKS) {
            truncated = true;
            break;
        }
    }

    var assessments = [];
    try {
        assessments = buildAssessmentSnapshotRows().concat(buildMeqsedOpinionRows());
        if (assessments.length > MAX_SNAPSHOT_ASSESS) {
            assessments = assessments.slice(0, MAX_SNAPSHOT_ASSESS);
        }
    } catch (eAssess) { assessments = []; }

    var qurums = [];
    try { qurums = buildQurumCatalog(); } catch (eQurCat) { qurums = []; }

    var taskDetails = {};
    try { taskDetails = collectFocusTaskDetails(question || '', hotTasks); } catch (eDet) { taskDetails = {}; }

    var dashboards = null;
    try { dashboards = buildDashboardPanels(); } catch (eDash) { dashboards = null; }

    var snap = {
        meta: {
            user: viewerAssigneeName() || viewerFirstName() || '',
            today: formatDateObj(new Date()) || '',
            sprint: sprint || week || '',
            week: week || '',
            prevWeek: prevWeek || ''
        },
        overview: overview,
        tasks: tasks,
        assessments: assessments,
        qurums: qurums,
        taskDetails: taskDetails,
        dashboards: dashboards,
        truncated: truncated
    };
    try {
        var blob = JSON.stringify(snap);
        while (blob.length > MAX_SNAPSHOT_CHARS && snap.tasks.length > 40) {
            snap.tasks = snap.tasks.slice(0, Math.floor(snap.tasks.length * 0.7));
            snap.truncated = true;
            blob = JSON.stringify(snap);
        }
        while (blob.length > MAX_SNAPSHOT_CHARS && snap.assessments.length > 40) {
            snap.assessments = snap.assessments.slice(0, Math.floor(snap.assessments.length * 0.7));
            snap.truncated = true;
            blob = JSON.stringify(snap);
        }
    } catch (e10) {}
    return snap;
}

function getCachedSnapshot(question, forceRebuild) {
    var hash = snapshotCacheHash();
    var qKeys = String(question || '').match(/DGD-\d+/gi) || [];
    var needFresh = forceRebuild || qKeys.length > 0;
    if (
        !needFresh
        && _snapCache.snap
        && _snapCache.hash === hash
        && (Date.now() - _snapCache.at) < SNAP_CACHE_MS
    ) {
        // Cache hit olsa belə iş yükü rəqəmlərini paneldən yenilə (14≠4)
        try {
            _snapCache.snap.dashboards = buildDashboardPanels();
        } catch (eDash) {}
        try { window.__AI_DONE_SNAPSHOT__ = _snapCache.snap; } catch (e0) {}
        return _snapCache.snap;
    }
    var snap = buildSnapshot(question || '');
    // Sualda DGD varsa detail əlavə olunub — cache-ə əsas snap (detailsiz) saxlama
    if (!qKeys.length) {
        _snapCache = { hash: hash, at: Date.now(), snap: snap };
    }
    try { window.__AI_DONE_SNAPSHOT__ = snap; } catch (e) {}
    return snap;
}

function warmSnapshotCache() {
    try {
        if (!hasData()) return;
        getCachedSnapshot('', true);
    } catch (e) {}
}

function detectHint(question) {
    var q = fold(question || '');
    if (/gecik/.test(q)) return 'late';
    if (/blok|cetinlik/.test(q)) return 'blocked';
    // Qiymətləndirmə/diaqnostika — people fuzzy-dən ƏVVƏL (hansi/qurum «people»ə düşməsin)
    if (/diaqnostika|qiymetlendir|exq|isq|meqsed|ozunuqiymet|reqemsal yetkin|en yuksek bal|en asagi bal|bal alan|qurum.*bal|bal.*qurum/.test(q)) {
        return 'assess';
    }
    // Qurum / nazirlik / xidmət — şəxs workload-dan ƏVVƏL
    if (/qurum|nazirlik|agentlik|xidmet|komite|miqrasiya|gomruk|dmx|dgk|rinn?\b/.test(q)
        || findQurum(q)) {
        return 'qurum';
    }
    // «mənim işlərim» — self; adlı şəxs sorğusu people (get_my_tasks-ə düşməsin)
    if (/menim|oz islerim|taskim|tapsiriqim|tapsiriqlarim|islerim\b/.test(q)
        && !/\b[a-z]{3,}\s+[a-z]{3,}\b/.test(q.replace(/\b(menim|oz|islerim|tapsiriqlarim|taskim)\b/g, ''))) {
        return 'mine';
    }
    // İş yükü / panel kartları reytinqi — konkret addan əvvəl
    if (/is yuk|workload|en yuklu|en mesgul|kimde cox|hansi emekdas|prioritet pay|status pay|istiqamet pay/.test(q)) {
        return 'dashboard';
    }
    if (/is yuku|icraci|kimde|ustunde|baxir|baxir\?|nin is|nin tapsiriq|nin yuku/.test(q)) return 'people';
    if (/\b[a-z]{3,}\s+[a-z]{4,}\b/.test(q) && /is|task|tapsiriq|yuk|nece|hansi/.test(q)) return 'people';
    if (/risk/.test(q)) return 'risk';
    if (/kpi|faiz|tamamlan/.test(q)) return 'kpi';
    if (/dgd-\d+/i.test(question || '')) return 'issue';
    if (/veziyyet|icmal|xulase/.test(q)) return 'overview';
    if (/sprint|hefte/.test(q)) return 'sprint';
    return 'open';
}

function routeLocal(question) {
    var qFold = fold(question);
    // Yalnız salam/təşəkkür/vidalaşma lokal — digər suallar LLM + tools (server açarı)
    if (isGreetingOnly(qFold)) {
        return { kind: 'greet', html: formatGreeting(), text: stripHtml(formatGreeting()) };
    }
    if (isThanks(qFold)) {
        return { kind: 'thanks', html: formatThanks(), text: stripHtml(formatThanks()) };
    }
    if (isFarewell(qFold)) {
        return { kind: 'farewell', html: formatFarewell(), text: stripHtml(formatFarewell()) };
    }
    return null;
}

/** LLM uğursuz olanda panel datası ilə cavab (intent yalnız ehtiyat). */
function localPlatformFallback(question) {
    try {
        if (!hasData()) return null;
        var local = answerQuestion(question);
        if (!local || !local.html) return null;
        var kind = (local.facts && local.facts.kind) || '';
        if (!kind || kind === 'open' || kind === 'empty' || kind === 'about' || kind === 'identity' || kind === 'help') {
            return null;
        }
        return {
            kind: kind,
            html: local.html,
            text: local.text || stripHtml(local.html)
        };
    } catch (e) {
        return null;
    }
}

function isSoftFailText(text) {
    var t = String(text || '');
    if (!t) return true;
    return t === SOFT_FAIL
        || /cavab alına bilmədi|ağıllı cavabı tam formalaşdıra|süni intellekt xidməti müvəqqəti|tam cavablandıra bilmədim/i.test(t);
}

function setStatusLine(row, label) {
    if (!row) return;
    var bubble = row.querySelector('.dash-chat-bubble');
    if (!bubble) return;
    var status = bubble.querySelector('.dash-chat-wait');
    if (!status) {
        status = document.createElement('p');
        status.className = 'dash-chat-wait';
        bubble.insertBefore(status, bubble.firstChild);
    }
    status.textContent = label || 'Düşünürəm…';
}

function clearStatusLine(row) {
    if (!row) return;
    var status = row.querySelector('.dash-chat-wait, .dash-chat-thinking');
    if (status) status.remove();
}

function attachSuggestions(row, items) {
    if (!row || !items || !items.length) return;
    var log = document.getElementById('dashChatLog');
    if (log) {
        Array.prototype.forEach.call(log.querySelectorAll('.dash-chat-suggest'), function(el) {
            if (!row.contains(el)) el.remove();
        });
    }
    var old = row.querySelector('.dash-chat-suggest');
    if (old) old.remove();
    var box = document.createElement('div');
    box.className = 'dash-chat-suggest';
    box.innerHTML = items.slice(0, 3).map(function(s) {
        return '<button type="button" class="dash-chat-hint" data-q="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
    box.onclick = function(e) {
        var btn = e.target.closest('[data-q]');
        if (!btn || chatBusy) return;
        var q = btn.getAttribute('data-q');
        if (!q) return;
        document.getElementById('dashChatInput').value = q;
        document.getElementById('dashChatForm').requestSubmit();
    };
    var col = row.querySelector('.dash-chat-msg-col') || row;
    col.appendChild(box);
}

async function askServer(question, pending, signal) {
    await paintYield();
    var hint = detectHint(question);
    var snapshot = getCachedSnapshot(question, false);
    try {
        // Qurum kataloqu hər mesajda localStorage yazmasın — Enter gecikməsin
        if (!_snapCache.at || (Date.now() - _snapCache.at) < 500) {
            setTimeout(function() { try { persistQurumCatalog(); } catch (eP) {} }, 50);
        }
    } catch (eSnap) {}
    var body = {
        question: question,
        draft: '',
        facts: { hint: hint, intent: hint, viewer: viewerFact() },
        snapshot: snapshot,
        history: chatHistory.slice(0, -1).slice(-8),
        stream: 1
    };
    chatLog('sorğu göndərilir', {
        endpoint: '/api/chat',
        hint: hint,
        qLen: String(question || '').length,
        history: body.history.length,
        snapTasks: (snapshot && snapshot.tasks && snapshot.tasks.length) || 0
    });

    var timedOut = false;
    var timeoutId = setTimeout(function() {
        timedOut = true;
        chatWarn('sorğu timeout', CHAT_FETCH_TIMEOUT_MS + 'ms');
        try {
            if (chatAbort) chatAbort.abort();
        } catch (e1) {}
    }, CHAT_FETCH_TIMEOUT_MS);

    function clearChatTimeout() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    var res;
    try {
        res = await fetch('/api/chat', {
            credentials: 'same-origin',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
            signal: signal,
            body: JSON.stringify(body)
        });
    } catch (fetchErr) {
        clearChatTimeout();
        if (fetchErr && fetchErr.name === 'AbortError') {
            if (timedOut) {
                var tErr = new Error('timeout');
                tErr.code = 'timeout';
                throw tErr;
            }
            throw fetchErr;
        }
        chatWarn('fetch xətası', fetchErr && fetchErr.message);
        var netErr = new Error('network');
        netErr.code = 'network';
        throw netErr;
    }

    chatLog('cavab header', res.status, res.headers.get('content-type') || '');
    if (!res.ok) {
        clearChatTimeout();
        var httpErr = new Error('HTTP ' + res.status);
        httpErr.code = 'http';
        httpErr.status = res.status;
        throw httpErr;
    }
    var ctype = String(res.headers.get('content-type') || '');
    if (ctype.indexOf('text/event-stream') === -1) {
        clearChatTimeout();
        var data = await res.json();
        chatLog('JSON cavab', {
            source: data && data.source,
            answerLen: data && data.answer ? String(data.answer).length : 0,
            error: data && data.error
        });
        var ans = (data && data.answer) || (data && data.soft_fail) || SOFT_FAIL;
        return {
            answer: ans,
            chatId: (data && data.chatId) || '',
            suggestions: [],
            error: data && data.source === 'error' ? (data.error || SOFT_FAIL) : ''
        };
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
        clearChatTimeout();
        chatWarn('stream body yoxdur');
        var noBody = new Error('stream');
        noBody.code = 'stream';
        throw noBody;
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var answer = '';
    var chatId = '';
    var suggestions = [];
    var streamError = '';
    var bubble = pending ? pending.querySelector('.dash-chat-bubble') : null;
    var mdTarget = document.createElement('div');
    mdTarget.className = 'dash-chat-md';
    var caret = document.createElement('span');
    caret.className = 'dash-chat-caret';
    caret.setAttribute('aria-hidden', 'true');
    var pump = { queued: '', done: false, aborted: false, started: false, tokens: 0 };

    function paint() {
        if (!bubble) return;
        mdTarget.innerHTML = renderMarkdownSafe(answer);
        if (!mdTarget.parentNode) bubble.appendChild(mdTarget);
        if (!caret.parentNode) bubble.appendChild(caret);
        scrollLog(false);
    }

    var pumpTask = (async function() {
        while (!pump.done || pump.queued) {
            if (pump.aborted && !pump.queued) return;
            if (!pump.queued) {
                await wait(20);
                continue;
            }
            if (!pump.started) {
                pump.started = true;
                clearStatusLine(pending);
                if (bubble) bubble.appendChild(mdTarget);
            }
            var n = pump.queued.length > 120 ? 48 : (pump.queued.length > 40 ? 24 : 12);
            answer += pump.queued.slice(0, n);
            pump.queued = pump.queued.slice(n);
            paint();
            await wait(8);
        }
    })();

    try {
        while (true) {
            if (signal && signal.aborted) {
                pump.aborted = true;
                break;
            }
            var chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            var parts = buffer.split('\n\n');
            buffer = parts.pop() || '';
            var pi;
            for (pi = 0; pi < parts.length; pi++) {
                var block = parts[pi].trim();
                if (!block) continue;
                var lines = block.split('\n');
                var dataLine = '';
                var li;
                for (li = 0; li < lines.length; li++) {
                    if (lines[li].indexOf('data:') === 0) dataLine += lines[li].slice(5).trim();
                }
                if (!dataLine) continue;
                var ev;
                try { ev = JSON.parse(dataLine); } catch (parseErr) {
                    chatWarn('SSE parse xətası', dataLine.slice(0, 120));
                    continue;
                }
                if (!ev || !ev.type) continue;
                if (ev.type === 'status') {
                    setStatusLine(pending, ev.label || '');
                    chatLog('status', ev.label || ev.tool || '');
                } else if (ev.type === 'token') {
                    pump.tokens += 1;
                    pump.queued += String(ev.text || '');
                } else if (ev.type === 'suggestions') {
                    suggestions = ev.items || [];
                } else if (ev.type === 'done') {
                    chatId = ev.id || chatId;
                    if (ev.answer) {
                        var finalAns = String(ev.answer);
                        var streamedSoFar = answer + pump.queued;
                        if (!streamedSoFar) {
                            pump.queued = finalAns;
                        } else if (streamedSoFar !== finalAns) {
                            // Server düzəldibsə (məs. səhv bal) — stream əvəzinə final cavab
                            pump.queued = '';
                            answer = finalAns;
                            paint();
                            chatLog('done grounded', { id: chatId });
                        }
                    }
                    chatLog('done', { id: chatId, model: ev.model, tokens: pump.tokens, ms: ev.duration_ms });
                } else if (ev.type === 'error') {
                    streamError = String(ev.error || '');
                    chatWarn('stream error', streamError);
                    if (!answer && !pump.queued) pump.queued += String(ev.soft_fail || SOFT_FAIL);
                }
            }
        }
    } catch (err) {
        clearChatTimeout();
        if (err && err.name === 'AbortError') {
            pump.aborted = true;
            pump.queued = '';
            pump.done = true;
            await pumpTask;
            if (timedOut) {
                var toErr = new Error('timeout');
                toErr.code = 'timeout';
                throw toErr;
            }
            return { answer: answer, chatId: chatId, suggestions: suggestions, aborted: true };
        }
        pump.aborted = true;
        pump.queued = '';
        pump.done = true;
        await pumpTask;
        chatWarn('stream oxuma xətası', err && err.message);
        throw err;
    }
    clearChatTimeout();
    pump.done = true;
    await pumpTask;
    if (caret.parentNode) caret.remove();
    clearStatusLine(pending);
    if ((!answer || isSoftFailText(answer)) && !pump.aborted) {
        // Proxy SSE-ni kəsirsə — bir dəfə JSON (stream=0) cəhd et
        chatWarn('SSE boş/soft — JSON fallback');
        try {
            var plain = await fetch('/api/chat?stream=0', {
                credentials: 'same-origin',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                signal: signal,
                body: JSON.stringify({
                    question: question,
                    draft: '',
                    facts: body.facts,
                    snapshot: snapshot,
                    history: body.history,
                    stream: 0
                })
            });
            if (plain.ok) {
                var pdata = await plain.json();
                chatLog('JSON fallback', {
                    source: pdata && pdata.source,
                    len: pdata && pdata.answer ? String(pdata.answer).length : 0,
                    error: pdata && pdata.error
                });
                if (pdata && pdata.answer && !isSoftFailText(pdata.answer)) {
                    return {
                        answer: pdata.answer,
                        chatId: pdata.chatId || '',
                        suggestions: [],
                        aborted: false,
                        error: ''
                    };
                }
                if (pdata && pdata.error) streamError = String(pdata.error);
            }
        } catch (fbErr) {
            chatWarn('JSON fallback xətası', fbErr && fbErr.message);
        }
        if (!answer) {
            answer = SOFT_FAIL;
            if (bubble) {
                bubble.appendChild(mdTarget);
                paint();
            }
            if (caret.parentNode) caret.remove();
        }
        chatWarn('boş cavab — soft_fail göstərilir', streamError || '');
    } else {
        chatLog('cavab hazır', { len: answer.length, chatId: chatId, tokens: pump.tokens });
    }
    return {
        answer: answer,
        chatId: chatId,
        suggestions: suggestions,
        aborted: pump.aborted,
        error: streamError
    };
}

function paintSoftFail(pending, question, detail) {
    /* 1) salam/təşəkkür 2) panel platforma ehtiyatı 3) soft_fail + Yenidən cəhd et */
    var local = routeLocal(question);
    if (local && local.html) {
        pending.classList.remove('is-pending');
        pending.querySelector('.dash-chat-bubble').innerHTML = local.html;
        return local.text || stripHtml(local.html);
    }
    var plat = localPlatformFallback(question);
    if (plat && plat.html) {
        pending.classList.remove('is-pending');
        clearStatusLine(pending);
        pending.querySelector('.dash-chat-bubble').innerHTML = plat.html
            + '<p class="dash-chat-note">Ağıllı cavab müvəqqəti alınmadı — panel rəqəmləri ilə cavab verirəm.</p>';
        attachSuggestions(pending, ['Cari həftə risklər', 'Gecikən tapşırıqlar', 'Ümumi vəziyyət']);
        return plat.text || stripHtml(plat.html);
    }
    pending.classList.remove('is-pending');
    clearStatusLine(pending);
    pending.querySelector('.dash-chat-bubble').innerHTML = softFailHtml(question, detail);
    attachSuggestions(pending, ['Mənim işlərim', 'Cari həftə risklər', 'Gecikən tapşırıqlar']);
    return SOFT_FAIL;
}

function paintMarkdownAnswer(pending, text) {
    pending.classList.remove('is-pending');
    clearStatusLine(pending);
    var bubble = pending.querySelector('.dash-chat-bubble');
    if (bubble) bubble.innerHTML = '<div class="dash-chat-md">' + renderMarkdownSafe(text) + '</div>';
    showTools(pending);
    scrollLog(false);
}

async function reply(question) {
    chatBusy = true;
    chatAbort = new AbortController();
    setComposerBusy(true);
    var thinkingApi = getDoneBot() || window.DoneBot;
    if (thinkingApi && typeof thinkingApi.setThinking === 'function') thinkingApi.setThinking(true);
    remember('user', question);
    renderHints();
    await paintYield();
    var local = routeLocal(question);
    var pending = addBot(local ? local.html : '<p class="dash-chat-wait">Düşünürəm…</p>', !local);
    await paintYield();
    var used = local ? local.text : '';
    var chatId = '';
    chatLog('reply start', { local: !!(local && local.kind), q: String(question || '').slice(0, 80) });
    try {
        if (local) {
            pending.classList.remove('is-pending');
            showTools(pending);
            remember('assistant', used);
            renderHints();
            chatLog('lokal cavab', local.kind);
            return;
        }
        // Bayraq köhnə ola bilər — hər dəfə config yoxla; yenə də serverə cəhd et
        if (!chatLlm) {
            try {
                var cfgRes = await fetch('/api/config', { credentials: 'same-origin' });
                if (cfgRes.ok) {
                    var cfg = await cfgRes.json();
                    if (cfg && cfg.hasChatLlm) chatLlm = true;
                    chatLog('config hasChatLlm', !!chatLlm);
                }
            } catch (cfgErr) {
                chatWarn('config oxunmadı', cfgErr && cfgErr.message);
            }
        }
        var result = await askServer(question, pending, chatAbort.signal);
        if (result.aborted) {
            used = result.answer || '';
            if (used) {
                paintMarkdownAnswer(pending, used);
                remember('assistant', used);
            } else if (pending && pending.parentNode) {
                pending.remove();
            }
            chatLog('reply aborted');
            return;
        }
        used = result.answer || '';
        chatId = result.chatId || '';
        if (!used || isSoftFailText(used) || result.error) {
            chatWarn('soft_fail UI', { error: result.error || '', usedLen: used.length });
            used = paintSoftFail(pending, question, result.error || chatLlmHint || '');
            showTools(pending);
            if (typeof window.showToast === 'function') {
                window.showToast(SOFT_FAIL, 'info');
            }
        } else {
            paintMarkdownAnswer(pending, used);
            if (result.suggestions && result.suggestions.length) attachSuggestions(pending, result.suggestions);
            if (chatId) attachFeedback(pending, chatId);
            chatLog('UI-da göstərildi', { len: used.length, chatId: chatId });
        }
        remember('assistant', used);
        renderHints();
    } catch (err) {
        if (err && err.name === 'AbortError') {
            if (pending && pending.parentNode) pending.remove();
            chatLog('reply abortError');
            return;
        }
        chatWarn('reply xətası', err && (err.code || err.message));
        var errDetail = '';
        if (err && err.code === 'timeout') errDetail = 'timeout';
        else if (err && err.code === 'network') errDetail = 'network';
        else if (err && err.status === 401) errDetail = '401';
        else if (err && err.message) errDetail = String(err.message);
        used = paintSoftFail(pending, question, errDetail || chatLlmHint || '');
        showTools(pending);
        remember('assistant', used);
        if (typeof window.showToast === 'function') {
            var toastMsg = SOFT_FAIL;
            if (err && err.code === 'timeout') toastMsg = 'Cavab vaxtı bitdi, yenidən cəhd edin';
            else if (err && err.code === 'network') toastMsg = 'Serverə qoşulmaq mümkün olmadı, yenidən cəhd edin';
            else if (err && err.status === 401) toastMsg = 'Giriş sessiyası bitib — yenidən daxil olun';
            else if (chatLlmHint) toastMsg = chatLlmHint;
            window.showToast(toastMsg, 'info');
        }
    } finally {
        // Epoch dəyişsə belə busy sıfırlanmalıdır — əks halda növbəti mesajlar susur
        chatBusy = false;
        chatAbort = null;
        setComposerBusy(false);
        var doneApi = getDoneBot() || window.DoneBot;
        if (doneApi && typeof doneApi.setThinking === 'function') doneApi.setThinking(false);
        var input = document.getElementById('dashChatInput');
        if (input && chatOpen) input.focus();
    }
}

export function initChat(opts) {
    chatLlm = !!(opts && opts.hasChatLlm);
    chatLlmHint = String((opts && opts.chatLlmHint) || '').trim();
    ensureUi();
    try { window.persistAiDoneQurums = persistQurumCatalog; } catch (e0) {}
    try { persistQurumCatalog(); } catch (e1) {}
    try {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(function() { warmSnapshotCache(); }, { timeout: 2500 });
        } else {
            setTimeout(warmSnapshotCache, 1200);
        }
    } catch (eWarm) {}
    if (!chatLlm && chatLlmHint && !chatLlmWarned) {
        chatLlmWarned = true;
        chatWarn(chatLlmHint);
        if (typeof window.showToast === 'function') {
            window.showToast(chatLlmHint, 'info');
        }
    }
}

export function openDashChat() {
    ensureUi();
    openChat();
}
