import { state } from './state.js';
import { normalizeStr } from './utils.js';
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
    getHistoricalStatus,
    currentSprintName,
    isDueInSprint,
    getQurumName,
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
    getTaskDueDate
} from './model.js';

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
    'Bu həftəni nə saxlayır?',
    'Kimdə iş çoxdur və kim gecikir?',
    'Bloklanan işlər hansılardır?',
    'Bu sprint əvvəlki ilə necə müqayisə olunur?'
];
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
var chatOpen = false;
var chatBusy = false;
var chatHistory = [];

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
    var qurum = findQurum(qFold);
    var focus = findKpiFocus(qFold);
    var issueKey = findIssueKey(raw);

    if (wantsHelp(qFold)) {
        return { kind: 'help', names: names, current: current };
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
    if (who) {
        return { kind: 'person', person: who, sprint: allScope ? '' : current, names: names };
    }
    if (/kimde|icraci|is yuku|en cox tapsiriq|kim daha/.test(qFold)) {
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
    return /panel|dashboard|tapsiriq|sprint|status|istiqamet|qurum|qiymet|blok|gecik|backlog|icra|filter|hesabat|gecik/.test(qFold);
}

function isRiskQuestion(qFold) {
    return /niye|sebeb|problem|risk|engel|saxlayir|zeif|asagi qal|pisdir|diqqet|kritik|nesaxla|ne saxla/.test(qFold);
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
        people: peopleRank(kpis.view.people, 8),
        dirs: dirRank(kpis.view.dirs, 8),
        qurums: topEntries(kpis.view.qurum, 8),
        late: late.slice(0, 8),
        blocked: blocked.slice(0, 8),
        dueOpen: dueOpen.slice(0, 8),
        dueDone: dueDone.slice(0, 6)
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

function formatAbout() {
    return '<p class="dash-chat-kicker">Cavab</p>'
        + '<h4>Bu panel nə göstərir</h4>'
        + pLead('Rəqəmsal İdarəetmə Paneli DGD-nin Jira tapşırıqlarını, sprintini və qiymətləndirmələrini eyni kəsikdə toplayır. Yuxarıdakı sprint, tarix, istiqamət və ya qurum dəyişəndə kartlar, qrafiklər və bu köməkçi eyni rəqəmlərə keçir.')
        + pRead('«Bütün sprintlər» ümumi fondur. Seçilmiş sprint həftəlik icradır. Kartdakı tamamlanma faizi əsasən bu həftə bitməli işlər üzrədir, bütün lövhənin yekun payı deyil. Hesabat düyməsi eyni filteri Word-ə çıxarır.');
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

function formatPeople(kpis, person, ev) {
    ev = ev || collectEvidence();
    if (person) {
        var d = (kpis.view.people || {})[person] || { total: 0, done: 0, blocked: 0, late: 0, progress: 0 };
        var mine = [].concat(ev.late, ev.blocked, ev.dueOpen).filter(function(it) { return it.who === person; });
        var seen = {};
        mine = mine.filter(function(it) {
            if (seen[it.key]) return false;
            seen[it.key] = true;
            return true;
        });
        var html = '<p class="dash-chat-kicker">Cavab</p><h4>' + esc(person) + '</h4>'
            + pLead(d.total
                ? (person + ' bu kəsikdə ' + d.total + ' iş daşıyır — ümumi həcmin ' + pct(d.total, kpis.view.total) + '%-i. Yekunlaşma ' + pct(d.done, d.total) + '%-dir, aktiv icrada ' + d.progress + ' iş var.'
                    + (d.late || d.blocked ? ' Risk: ' + (d.late ? d.late + ' gecikir' : '') + (d.late && d.blocked ? ', ' : '') + (d.blocked ? d.blocked + ' blokdadır' : '') + '.' : ''))
                : (person + ' bu filterdə tapşırıqda görünmür. Sprint və ya istiqamət filterini yoxlayın.'));
        if (mine.length) html += '<p class="dash-chat-sub">Onun açıq/riskli işləri</p>' + itemList(mine.slice(0, 6));
        html += pAttn(d.late || d.blocked ? 'Bu icraçı üzrə açıq risk var; siyahını icraçı filteri ilə aça bilərsiniz.' : '');
        return html;
    }
    var people = ev.people.length ? ev.people : peopleRank(kpis.view.people, 8);
    if (!people.length) return '<p>Bu görünüşdə icraçı adı tapılmadı.</p>';
    var topShare = pct(people[0].total, kpis.view.total);
    var lateWho = ownersFromItems(ev.late);
    var html2 = '<p class="dash-chat-kicker">Cavab</p><h4>Kimdə iş çoxdur</h4>'
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
    return '<p class="dash-chat-kicker">Kömək</p>'
        + '<h4>Nəyi təhlil edə bilərəm</h4>'
        + pLead('Sualı paneldəki kəsiyə bağlayıram, rəqəmləri izah edirəm və riski qeyd edirəm. Uydurma rəqəm yazmıram.')
        + '<ul class="dash-chat-help">'
        + '<li>Paneldə indi vəziyyət necədir?</li>'
        + '<li>Neçə tapşırıq bloklanıb və gecikib?</li>'
        + '<li>Kimdə daha çox tapşırıq var?</li>'
        + '<li>Bu səhifə nə göstərir?</li>'
        + '<li>EXQ necədir? / inteqrasiya ilə EXQ-ni müqayisə et</li>'
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
    var html = '<p class="dash-chat-kicker">Cavab</p><h4>Nə saxlayır</h4>'
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
    if (parsed.kind === 'about') {
        html = formatAbout();
        text = stripHtml(html);
        facts = { kind: 'about' };
        return { html: html, text: text, facts: facts };
    }
    if (parsed.kind === 'help') {
        html = helpHtml(parsed);
        text = stripHtml(html);
        facts = { kind: 'help', current: parsed.current };
        return { html: html, text: text, facts: facts };
    }
    if (!hasData()) {
        return {
            html: '<p>Panel məlumatı hələ yüklənməyib. Tokeni yazıb <strong>Yenilə</strong> düyməsinə basın, sonra soruşun.</p>',
            text: 'Panel məlumatı yüklənməyib.',
            facts: { kind: 'empty' }
        };
    }
    var ev = collectEvidence();
    var kpis = ev.kpis;
    if (parsed.kind === 'issue') {
        html = formatIssue(parsed.key, ev);
        text = stripHtml(html);
        facts = { kind: 'issue', key: parsed.key, kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'risk') {
        html = formatRisk(kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'risk', kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'overview') {
        html = formatOverview(kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'overview', kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'kpi') {
        html = formatKpi(kpis, parsed.focus, ev);
        text = stripHtml(html);
        facts = { kind: 'kpi', focus: parsed.focus.id, kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'people' || parsed.kind === 'person') {
        html = formatPeople(kpis, parsed.person, ev);
        text = stripHtml(html);
        facts = { kind: parsed.kind, person: parsed.person || '', kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'qurum') {
        html = formatQurum(kpis, parsed.qurum, ev);
        text = stripHtml(html);
        facts = { kind: 'qurum', qurum: parsed.qurum, kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'assess') {
        html = formatAssess(kpis);
        text = stripHtml(html);
        facts = { kind: 'assess', assess: kpis.assess };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
    }
    if (parsed.kind === 'directions') {
        html = formatDirections(kpis, ev);
        text = stripHtml(html);
        facts = { kind: 'directions', kpis: compactKpis(kpis) };
        return { html: html, text: text, facts: facts, evidence: ev, question: raw };
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
    return { html: html, text: text, facts: facts, evidence: ev, question: raw };
}

function packChatFacts(local) {
    var ev = local.evidence;
    var names = [];
    try { names = sprintList().slice(0, 12); } catch (e) { names = []; }
    return {
        kind: (local.facts && local.facts.kind) || 'open',
        question: local.question || '',
        scope: ev && ev.kpis ? scopeNote(ev.kpis) : '',
        numbers: ev && ev.kpis ? compactKpis(ev.kpis) : ((local.facts && local.facts.kpis) || {}),
        people: ev ? ev.people : [],
        directions: ev ? ev.dirs : [],
        qurums: ev ? ev.qurums : [],
        late: ev ? ev.late : [],
        blocked: ev ? ev.blocked : [],
        dueOpen: ev ? ev.dueOpen : [],
        compare: local.facts && local.facts.a ? { a: local.facts.a, b: local.facts.b, meta: local.facts.meta || {} } : null,
        sprints: names,
        localKind: (local.facts && local.facts.kind) || 'open'
    };
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
    if (document.getElementById('dashChatRoot')) return;
    var root = el(
        '<div id="dashChatRoot" class="dash-chat">'
        + '<button type="button" id="dashChatFab" class="dash-chat-fab" aria-controls="dashChatPanel" aria-expanded="false" title="Panel köməkçisi">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>'
        + '<span>Soruş</span></button>'
        + '<section id="dashChatPanel" class="dash-chat-panel hidden" hidden role="dialog" aria-labelledby="dashChatTitle">'
        + '<header class="dash-chat-head">'
        + '<div><p class="dash-chat-brand">Panel köməkçisi</p><h2 id="dashChatTitle">Dashboard haqqında soruşun</h2></div>'
        + '<div class="dash-chat-head-actions">'
        + '<button type="button" id="dashChatClear" class="dash-chat-iconbtn" title="Söhbəti təmizlə" aria-label="Söhbəti təmizlə">↻</button>'
        + '<button type="button" id="dashChatClose" class="dash-chat-iconbtn" title="Bağla" aria-label="Bağla">✕</button>'
        + '</div></header>'
        + '<div id="dashChatLog" class="dash-chat-log" role="log" aria-live="polite"></div>'
        + '<div id="dashChatHints" class="dash-chat-hints"></div>'
        + '<form id="dashChatForm" class="dash-chat-form">'
        + '<label class="sr-only" for="dashChatInput">Sual</label>'
        + '<textarea id="dashChatInput" rows="2" placeholder="Sualınızı yazın"></textarea>'
        + '<button type="submit" id="dashChatSend" class="dash-chat-send">Göndər</button>'
        + '</form></section></div>'
    );
    document.body.appendChild(root);
    document.getElementById('dashChatFab').addEventListener('click', toggleChat);
    document.getElementById('dashChatClose').addEventListener('click', closeChat);
    document.getElementById('dashChatClear').addEventListener('click', resetChat);
    document.getElementById('dashChatForm').addEventListener('submit', onSubmit);
    document.getElementById('dashChatInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('dashChatForm').requestSubmit();
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && chatOpen) closeChat();
    });
    renderHints();
    addBot(welcomeHtml(), false);
}

function welcomeHtml() {
    return '<p>Sualınızı oxuyub paneldəki rəqəmlərlə təhlil edirəm. İstədiyiniz kimi yazın.</p>';
}

function renderHints() {
    var box = document.getElementById('dashChatHints');
    if (!box) return;
    box.innerHTML = SUGGESTIONS.map(function(s) {
        return '<button type="button" class="dash-chat-hint" data-q="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
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
    var fab = document.getElementById('dashChatFab');
    panel.classList.remove('hidden');
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    document.getElementById('dashChatRoot').classList.add('is-open');
    setTimeout(function() {
        var input = document.getElementById('dashChatInput');
        if (input) input.focus();
    }, 50);
}

function closeChat() {
    chatOpen = false;
    var panel = document.getElementById('dashChatPanel');
    var fab = document.getElementById('dashChatFab');
    panel.classList.add('hidden');
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    document.getElementById('dashChatRoot').classList.remove('is-open');
}

function resetChat() {
    chatHistory = [];
    var log = document.getElementById('dashChatLog');
    if (log) log.innerHTML = '';
    addBot(welcomeHtml(), false);
}

function readChatKey() {
    var el = document.getElementById('chatApiKey');
    return el ? String(el.value || '').trim() : '';
}

function llmEnabled() {
    return chatLlm || !!readChatKey();
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
    row.innerHTML = '<div class="dash-chat-bubble">' + html + '</div>';
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
}

function onSubmit(e) {
    e.preventDefault();
    if (chatBusy) return;
    var input = document.getElementById('dashChatInput');
    var q = String(input.value || '').trim();
    if (!q) return;
    input.value = '';
    addUser(q);
    reply(q);
}

async function reply(question) {
    chatBusy = true;
    chatHistory.push({ role: 'user', content: question });
    var pending = addBot('<p class="dash-chat-wait">Təhlil edirəm…</p>', true);
    var local = answerQuestion(question);
    var html = local.html;
    var used = local.text || '';
    if (llmEnabled() && local.facts && local.facts.kind !== 'empty') {
        try {
            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: question,
                    facts: packChatFacts(local),
                    history: chatHistory.slice(0, -1).slice(-8),
                    llmKey: readChatKey()
                })
            });
            if (res.ok) {
                var data = await res.json();
                if (data && data.answer && data.source === 'llm') {
                    html = renderMarkdownish(data.answer);
                    used = data.answer;
                }
            }
        } catch (err) {
            html = local.html;
        }
    }
    chatHistory.push({ role: 'assistant', content: String(used).slice(0, 2000) });
    if (chatHistory.length > 16) chatHistory = chatHistory.slice(-16);
    pending.classList.remove('is-pending');
    pending.querySelector('.dash-chat-bubble').innerHTML = html;
    document.getElementById('dashChatLog').scrollTop = document.getElementById('dashChatLog').scrollHeight;
    chatBusy = false;
}

export function initChat(opts) {
    chatLlm = !!(opts && opts.hasChatLlm);
    ensureUi();
}

export function openDashChat() {
    ensureUi();
    openChat();
}
