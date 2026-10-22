import { getDiagPeriodRows, getAssessmentPeriodState, getAssessmentPeriodLabel, getAssessmentHubView, getAssessmentHubNav, getAssessmentHubYears, setAssessmentYearForActiveTab, drawMeqsedOverviewCharts, destroyMeqsedOverviewCharts } from './assessments.js?v=idda68';
import {
    parseDiagUmumiNetice,
    getDiagInfo,
    getDiagHeadline,
    getDiagScore,
    DIAG_CRITERIA_DEFS,
    matchDiagCriterion,
    getStatusGroup,
    qurumMatchKey,
    getRawPhaseEntries,
    getTaskStartDate,
    getPhaseFieldText,
    PHASE_FIELDS,
    getEsdSentLetterInfo,
    isSubtaskType,
    getParentIssue,
    getIsqInfo,
    MEQSED_NOVU_KINDS,
    MEQSED_NOVU_LABELS,
    classifyMeqsedNovu,
    EXQ_STAR_BANDS,
    EXQ_LAW_URL,
    exqStarFromPercent,
    exqStarTarget,
    exqStarColor,
    exqStarLabel,
    EXQ_DIGIT_STAGES
} from './model.js?v=idda24';
import { KIND, MATURITY, STATUS, VIS, OPINION } from './palette.js?v=idda4';
import { normalizeStr, showToast } from './utils.js?v=idda7';
import { state } from './state.js';
import { apiFetch, canSeeDiagnostics } from './session.js?v=idda16';
import { serviceDigitizationHtml, exqOrgStagesPanelHtml } from './service_digitization.js?v=idda18';

var PAGE_ID = 'nk303Page';
var MAIN_ID = 'appMain';
var ROOT_ID = 'nk303Root';
var PAGE_SIZE = 20;
var HUB_PAGE_SIZE = 20;
var NA = 'Məlumat mövcud deyil';
var nkCharts = {};
var nkHubCharts = {};
var histBound = false;
var excelStore = { files: [], orgs: [], loaded: false };
var reportStore = { files: [], reports: [], loaded: false };
var adminState = { isAdmin: false, bound: false };
var HUB_TABS = [
    { id: 'diag', label: 'Diaqnostika', color: KIND.diag },
    { id: 'isq', label: 'İSQ', color: KIND.isq },
    { id: 'self', label: 'Özünüqiymətləndirmə', color: KIND.self },
    { id: 'exq', label: 'EXQ', color: KIND.exq },
    { id: 'meqsed', label: 'Məqsədəuyğunluq', color: KIND.meqsed }
];
var PAGE_HEADS = {
    diag: {
        title: 'Ölkə üzrə Rəqəmsallaşma Diaqnostikası',
        sub: 'Qurumların rəqəmsal yetkinlik səviyyəsinin qiymətləndirilməsi'
    },
    isq: {
        title: 'İnformasiya sistemlərinin qiymətləndirilməsi',
        sub: 'Qurumların informasiya sistemləri üzrə qiymətləndirmə nəticələri'
    },
    exq: {
        title: 'Elektron xidmətlərin qiymətləndirilməsi',
        sub: 'Qurumların elektron xidmətləri üzrə qiymətləndirmə nəticələri'
    },
    self: {
        title: 'Özünüqiymətləndirmə',
        sub: 'Qurumların özünüqiymətləndirmə nəticələri'
    },
    meqsed: {
        title: 'Məqsədəuyğunluq',
        sub: 'Məqsədəuyğunluq rəyləri və müraciətlər'
    }
};
var HUB_STATUS_COLORS = STATUS;
var HUB_STATUS_LABELS = {
    done: 'Tamamlanıb',
    progress: 'İcradadır',
    planned: 'Planlaşdırılıb',
    paused: 'Dayandırılıb',
    review: 'Rəydə',
    esd: 'ESD',
    blocked: 'Bloklanıb',
    rejected: 'İmtina',
    other: 'İcraya başlanmayıb'
};

var DIRS = [
    { id: 'strategiya', name: 'Strategiya', needles: ['strategiya'] },
    { id: 'xidmetler', name: 'Xidmətlər', needles: ['xidmet'] },
    { id: 'texniki', name: 'Texniki-texnoloji infrastruktur', needles: ['texniki', 'infrastruktur', 'texnoloj'] },
    { id: 'emeliyyat', name: 'Əməliyyat modelləri', needles: ['emeliyyat', 'meliyyat'] }
];
var REPORT_KINDS = [
    { id: 'diag', label: 'Diaqnostika', color: KIND.diag },
    { id: 'isq', label: 'İSQ', color: KIND.isq },
    { id: 'exq', label: 'EXQ', color: KIND.exq }
];
var ISQ_PILLARS = [
    { id: 'strategy', name: 'Strateji və idarəçilik sənədləri', short: 'Strateji' },
    { id: 'procedure', name: 'Prosedurlar və təlimatlar', short: 'Prosedur' },
    { id: 'ops', name: 'Əməliyyatlar', short: 'Əməliyyat' },
    { id: 'lifecycle', name: 'Proqram təminatının həyat dövrü', short: 'Həyat dövrü' },
    { id: 'quality', name: 'Proqram təminatının keyfiyyətinə nəzarət', short: 'Keyfiyyət' },
    { id: 'integ', name: 'İnteqrasiya', short: 'İnteqrasiya' },
    { id: 'info', name: 'İnformasiya ehtiyatı sistemi', short: 'Ehtiyat' },
    { id: 'network', name: 'Şəbəkə', short: 'Şəbəkə' },
    { id: 'data', name: 'Məlumatların idarəedilməsi', short: 'Məlumat' },
    { id: 'infra', name: 'Fiziki və virtual infrastruktur', short: 'İnfrastruktur' }
];

var MATS = [
    { id: 'ilkin', label: 'İlkin', lo: 0, hi: 24, color: MATURITY.ilkin },
    { id: 'idare', label: 'İdarə olunan', lo: 25, hi: 49, color: MATURITY.idare },
    { id: 'mueyyen', label: 'Müəyyən edilmiş', lo: 50, hi: 74, color: MATURITY.mueyyen },
    { id: 'opt', label: 'Optimallaşdırılan', lo: 75, hi: 100, color: MATURITY.opt }
];

var VIS_STATUS = [
    { id: 'done', label: 'Tamamlanıb', groups: { done: true } },
    { id: 'in_progress', label: 'İcradadır', groups: { planned: true, progress: true, paused: true, blocked: true, rejected: true } },
    { id: 'review', label: 'Rəydə', groups: { review: true, esd: true } },
    { id: 'not_started', label: 'İcraya başlanmayıb', groups: { other: true } }
];
var VIS_COLORS = VIS;

var DIR_ACTIONS = {
    strategiya: {
        ilkin: 'Rəqəmsallaşma üzrə strateji baxış, uzunmüddətli hədəflər və dəqiq icra mexanizmi olan plan hazırlanıb təsdiq edilsin.',
        idare: 'Təsdiq olunmuş strateji sənəd dövlət proqramları ilə uyğunlaşdırılsın və icrası digər qurumlarla əlaqələndirilsin.',
        mueyyen: 'KPI-lər vahid mərkəzdən izlənsin; rəhbərlik səviyyəsində mütəmadi hesabat və təqdimatlar təşkil edilsin.',
        opt: 'Strateji sənədin icrası davam etdirilsin, nəticələr ölçülərək təkmilləşdirilsin.'
    },
    xidmetler: {
        ilkin: 'Xidmət prosesləri kağız və e-poçt asılılığından çıxarılsın, iş axını rəqəmsal alətlərlə izlənsin və nəzarətə alınsın.',
        idare: 'Rəqəmsal xidmətlər istifadəçi rəyi və normativ tələblər əsasında təkmilləşdirilsin, müasir layihə idarəetməsi tətbiq edilsin.',
        mueyyen: 'Xidmətlər istifadəyə verilməzdən əvvəl sınaq metodologiyası və ehtiyat plan tətbiq edilsin; çatışmazlıqlar real vaxtda izlənsin.',
        opt: 'Xidmət keyfiyyəti və istifadəçi məmnuniyyəti mütəmadi ölçülərək təkmilləşdirilsin.'
    },
    texniki: {
        ilkin: 'Texniki-texnoloji infrastruktur inventarlaşdırılsın, standartlar və informasiya təhlükəsizliyi tələbləri müəyyən edilsin.',
        idare: 'İnfrastruktur vahid standartlar əsasında idarə olunsun; ehtiyat nüsxələmə və fasiləsizlik təminatı qurulsun.',
        mueyyen: 'Monitorinq, tutum planlaması və təhlükəsizlik nəzarəti mərkəzləşdirilmiş qaydada aparılsın.',
        opt: 'İnfrastrukturun tutum və təhlükəsizlik göstəriciləri real vaxtda izlənsin və davamlı təkmilləşdirilsin.'
    },
    emeliyyat: {
        ilkin: 'Əməliyyat modelləri sənədləşdirilsin, əsas proseslər rəqəmsallaşdırılsın və məsuliyyətlər bölüşdürülsün.',
        idare: 'Proseslər vahid əməliyyat modeli üzrə avtomatlaşdırılsın, nəticələr ölçüləbilən göstəricilərlə izlənsin.',
        mueyyen: 'Əməliyyat modelləri digər qurumlarla inteqrasiya olunsun, KPI-lər rəhbərlik səviyyəsində nəzərdən keçirilsin.',
        opt: 'Əməliyyat modelləri davamlı təkmilləşdirilsin və ən yaxşı təcrübələr tətbiq edilsin.'
    }
};

var PROCESS = [
    'Özünüqiymətləndirmə ilkin görüşlər',
    'Yerində baxışların keçirilməsi',
    'Sənədlərin toplanılması',
    'Təhlil mərhələsi',
    'Hesabat fəaliyyəti',
    'Nəticənin quruma təqdim edilməsi'
];

var NAV = [
    { id: 'overview', label: 'Ümumi nəticələr' },
    { id: 'orgs', label: 'Qurumlar' },
    { id: 'dirs', label: 'İstiqamətlər' },
    { id: 'gaps', label: 'Boşluq analizi' },
    { id: 'compare', label: 'Müqayisə' },
    { id: 'reports', label: 'Hesabatlar' }
];

var ui = {
    open: false,
    mode: 'country',
    nav: 'overview',
    year: 'all',
    orgKey: '',
    status: '',
    maturity: '',
    dirId: '',
    search: '',
    sort: 'score',
    page: 1,
    expandDir: '',
    expandCrit: '',
    compare: {},
    escBound: false,
    hub: '',
    hubSearch: '',
    hubPage: 1,
    hubFilter: '',
    hubSort: 'desc',
    hubDetailKey: '',
    reportId: '',
    reportKind: '',
    reportPickKind: false,
    reportUploadKind: '',
    reportFocus: '',
    reportPin: false
};

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function qarg(s) {
    return encodeURIComponent(String(s == null ? '' : s));
}

function darg(s) {
    try { return decodeURIComponent(String(s == null ? '' : s)); } catch (e) { return String(s || ''); }
}

function fold(s) {
    return normalizeStr(s)
        .replace(/ı/g, 'i')
        .replace(/ə/g, 'e')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ğ/g, 'g')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c');
}

function num(value) {
    if (value == null || value === '' || value === '—') return null;
    var s = String(value).trim().replace(',', '.');
    var m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return isFinite(n) ? n : null;
}

function avg(arr) {
    var list = (arr || []).filter(function(n) { return n != null && isFinite(n); });
    if (!list.length) return null;
    return list.reduce(function(a, b) { return a + b; }, 0) / list.length;
}

function fmt(n, digits) {
    if (n == null || !isFinite(n)) return '—';
    var d = digits == null ? (Math.round(n) === n ? 0 : 1) : digits;
    return d ? String(Math.round(n * 10) / 10) : String(Math.round(n));
}

function fmt1(n) {
    if (n == null || !isFinite(n)) return '—';
    return (Math.round(n * 10) / 10).toFixed(1);
}

function dirShort(d) {
    if (!d) return '';
    if (d.id === 'texniki') return 'Texniki-texnoloji';
    if (d.id === 'emeliyyat') return 'Əməliyyat';
    return d.name;
}

function weakestDirOf(org) {
    var ranked = DIRS.map(function(d) {
        return { id: d.id, name: d.name, short: dirShort(d), sc: org && org.dirs ? org.dirs[d.id] : null };
    }).filter(function(x) { return x.sc != null; }).sort(function(a, b) { return a.sc - b.sc; });
    return ranked[0] || null;
}

function pct(n, total) {
    if (!total) return 0;
    return Math.round((n / total) * 100);
}

function pad2(n) {
    return (n < 10 ? '0' : '') + String(n);
}

function fmtDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
}

function fmtScore(n) {
    if (n == null || !isFinite(n)) return '—';
    var r = Math.round(n * 10) / 10;
    return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function maturityTarget(score) {
    if (score == null || !isFinite(score)) return null;
    var mat = maturityOf(score);
    if (!mat) return null;
    var i = MATS.indexOf(mat);
    if (i < 0) return null;
    var next = MATS[i + 1];
    if (!next) return 100;
    return next.hi;
}

function maturityOf(score) {
    if (score == null || !isFinite(score)) return null;
    var i, next;
    for (i = 0; i < MATS.length; i++) {
        next = MATS[i + 1];
        if (!next || score < next.lo) return MATS[i];
    }
    return MATS[MATS.length - 1];
}

function scalePos(score) {
    if (score == null || !isFinite(score)) return 0;
    var s = Math.max(0, Math.min(100, score));
    var n = MATS.length;
    var i, m, next, hi, t, span;
    for (i = 0; i < n; i++) {
        m = MATS[i];
        next = MATS[i + 1];
        hi = next ? next.lo : 100;
        if (s < hi || !next) {
            span = hi - m.lo;
            t = span ? (s - m.lo) / span : 1;
            return Math.max(0, Math.min(100, (i + t) * (100 / n)));
        }
    }
    return 100;
}

function visStatusOf(group) {
    var i;
    for (i = 0; i < VIS_STATUS.length; i++) {
        if (VIS_STATUS[i].groups[group]) return VIS_STATUS[i];
    }
    return VIS_STATUS.filter(function(s) { return s.id === 'not_started'; })[0] || VIS_STATUS[0];
}

function issueSummaryText(t) {
    return String((t && t.fields && t.fields.summary) || '').trim();
}

function isIssueDoneStatus(t) {
    if (!t || !t.fields || !t.fields.status) return false;
    return getStatusGroup(t.fields.status.name) === 'done';
}

/** «Hesabatın hazırlanması» alt-tapşırığı — yerində baxış şərtindən istisna. */
function isDiagReportPrepSubtask(t) {
    var s = fold(issueSummaryText(t));
    if (!s || s.indexOf('hesabat') === -1) return false;
    return s.indexOf('hazirla') !== -1;
}

function collectDiagChildIssues(parent) {
    var children = [];
    var seen = {};
    function addChild(issue) {
        if (!issue || !issue.key || seen[issue.key] || (parent && issue.key === parent.key)) return;
        var full = (state.issueIndex && state.issueIndex[issue.key]) || issue;
        seen[issue.key] = true;
        children.push(full);
    }
    if (!parent || !parent.fields) return children;
    (parent.fields.subtasks || []).forEach(addChild);
    (parent.fields.issuelinks || []).forEach(function(link) {
        var linked = link.outwardIssue || link.inwardIssue;
        if (linked && isSubtaskType(linked)) addChild(linked);
    });
    (state.allTasks || []).forEach(function(issue) {
        if (!isSubtaskType(issue)) return;
        var p = getParentIssue(issue);
        if (p && p.key === parent.key) addChild(issue);
    });
    return children;
}

function diagPhaseBlob(t, kids) {
    var parts = [];
    function pushText(raw) {
        var s = String(raw || '').trim();
        if (s) parts.push(s);
    }
    pushText(issueSummaryText(t));
    (getRawPhaseEntries(t) || []).forEach(function(p) { pushText(p && p.text); });
    PHASE_FIELDS.forEach(function(pf) { pushText(getPhaseFieldText(t, pf.text)); });
    (kids || []).forEach(function(child) {
        pushText(issueSummaryText(child));
        (getRawPhaseEntries(child) || []).forEach(function(p) { pushText(p && p.text); });
    });
    return fold(parts.join(' | '));
}

/**
 * Cari mərhələ indeksi (0…5).
 * Yerində baxış: hesabat hazırlanması istisna olmaqla bütün alt görüşlər Done olanda tamamlanır.
 */
function processIndex(t, group, hasResult) {
    var kids = collectDiagChildIssues(t);
    var meetings = kids.filter(function(c) { return !isDiagReportPrepSubtask(c); });
    var reports = kids.filter(isDiagReportPrepSubtask);
    var meetingsAllDone = meetings.length > 0 && meetings.every(isIssueDoneStatus);
    var meetingsSomeDone = meetings.some(isIssueDoneStatus);
    var reportDone = reports.some(isIssueDoneStatus);
    var reportOpen = reports.some(function(c) { return !isIssueDoneStatus(c); });
    var letter = getEsdSentLetterInfo(t) || {};
    var hasLetter = !!(letter.date || letter.number || letter.raw);
    var blob = diagPhaseBlob(t, kids);

    // 5 — Nəticənin quruma təqdim edilməsi
    if (hasLetter) return 5;
    if (group === 'done' && (hasResult || reportDone)) return 5;
    if (reportDone && (hasResult || group === 'review' || group === 'esd')) return 5;
    if (/netice.*qurum|quruma.*teqdim|teqdim edil/.test(blob) && (reportDone || group === 'done')) return 5;

    // 4 — Hesabat fəaliyyəti
    if (reportDone || (meetingsAllDone && reports.length && reportOpen)) return 4;
    if (meetingsAllDone && /hesabat/.test(blob)) return 4;
    if (group === 'done') return 4;

    // 3 — Təhlil mərhələsi
    if (meetingsAllDone && (/tehlil|yoxlama/.test(blob) || group === 'review' || group === 'esd')) return 3;

    // 2 — Sənədlərin toplanılması (yerində baxış tamamlanıb → növbəti)
    if (meetingsAllDone) return 2;
    if (meetingsSomeDone && (/sened|toplan/.test(blob))) return 2;

    // 1 — Yerində baxışların keçirilməsi (görüşlər gedir / bir qismi Done)
    if (meetingsSomeDone || (meetings.length && (group === 'progress' || group === 'paused' || group === 'blocked'))) {
        return 1;
    }
    if (group === 'progress' && !meetings.length) return 1;

    // 0 — Özünüqiymətləndirmə ilkin görüşlər
    if (group === 'rejected') return 0;
    if (hasResult) return 4;
    return 0;
}

function dirIdFromTitle(title) {
    var f = fold(title);
    var i, d, n;
    for (i = 0; i < DIRS.length; i++) {
        d = DIRS[i];
        for (n = 0; n < d.needles.length; n++) {
            if (f.indexOf(d.needles[n]) !== -1) {
                if (d.id === 'xidmetler' && f.indexOf('say') !== -1) continue;
                return d.id;
            }
        }
    }
    return '';
}

function officialState(score) {
    if (score === 0 || score === 50 || score === 75 || score === 100) return String(score);
    return '';
}

function looksLikeFinding(text) {
    var f = fold(text);
    return f.indexOf('catismaz') !== -1
        || f.indexOf('zeif') !== -1
        || f.indexOf('tespit') !== -1
        || f.indexOf('proble') !== -1;
}

function isClosedGap(text) {
    var f = fold(text);
    return f.indexOf('askar edilmeyib') !== -1 || f.indexOf('ashkar edilmeyib') !== -1;
}

function looksLikeAction(text) {
    var f = fold(text);
    return f.indexOf('fealiyyet') !== -1
        || f.indexOf('tovsiye') !== -1
        || f.indexOf('tedbir') !== -1
        || f.indexOf('plan') !== -1;
}

function scoreIndicator(score, extraClass) {
    var mat = maturityOf(score);
    var cls = 'nk303-score' + (extraClass ? ' ' + extraClass : '');
    if (score == null) {
        return '<div class="' + cls + '"><strong>—</strong>'
            + '<span class="nk303-mat is-none">' + esc(NA) + '</span></div>';
    }
    return '<div class="' + cls + '">'
        + '<strong>' + esc(fmt(score)) + '</strong>'
        + (mat
            ? '<span class="nk303-mat is-' + mat.id + '">' + esc(mat.label) + '</span>'
                + '<span class="nk303-range">' + esc(mat.lo + '–' + mat.hi) + '</span>'
            : '')
        + '</div>';
}

function matBadge(score) {
    var mat = maturityOf(score);
    if (!mat) return '<span class="nk303-mat is-none">' + esc(NA) + '</span>';
    return '<span class="nk303-mat is-' + mat.id + '">' + esc(mat.label) + '</span>';
}

function visPill(org) {
    var id = (org && org.visId) || 'not_started';
    var label = (org && org.visLabel) || NA;
    return '<span class="st"><span class="nk303-dot is-' + id + '"></span>' + esc(label) + '</span>';
}

function gaugeHtml(score) {
    var mat = maturityOf(score);
    var pos = scalePos(score);
    return '<div class="nk303-gauge">'
        + '<div class="nk303-gauge-box"><canvas id="nkGaugeChart"></canvas></div>'
        + (mat ? '<div class="nk303-mat is-' + mat.id + '">' + esc(mat.label) + '</div>'
            : '<div class="nk303-mat is-none">' + esc(NA) + '</div>')
        + '<div class="nk303-scale-col">'
        + (score == null ? '' : '<div class="nk303-scale-pointer" style="left:' + pos + '%" aria-hidden="true">▼</div>')
        + '<div class="nk303-scalebar">'
        + MATS.map(function(m) {
            return '<i class="is-' + m.id + (mat && mat.id === m.id ? ' is-on' : '') + '"></i>';
        }).join('')
        + '</div>'
        + '<div class="nk303-scalecaps">'
        + MATS.map(function(m) {
            return '<span class="' + (mat && mat.id === m.id ? 'is-on' : '') + '">'
                + esc(m.lo + '–' + m.hi) + '<br>' + esc(m.label) + '</span>';
        }).join('')
        + '</div></div>'
        + '<p class="nk303-hint nk303-hint--law">Qərar 303, bənd 4.10 · '
        + '<a href="https://e-qanun.az/framework/60692" target="_blank" rel="noopener noreferrer">e-qanun.az/framework/60692</a></p>'
        + '</div>';
}

function barColor(score) {
    var mat = maturityOf(score);
    return (mat && mat.color) || '#94a3b8';
}

function hexToRgba(hex, a) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return 'rgba(148,163,184,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function compareLegendHtml(nowHex, goalHex) {
    return '<ul class="nk303-compare-legend" aria-hidden="false">'
        + '<li class="is-now" style="--nk-now:' + (nowHex || '#f59e0b') + '">Mövcud vəziyyət</li>'
        + '<li class="is-goal" style="--nk-goal:' + (goalHex || '#3b82f6') + '">Hədəf olunan</li>'
        + '</ul>';
}

function radarPairDatasets(nowVals, goalVals, nowHex, goalHex) {
    var nowCol = nowHex || '#f59e0b';
    var goalCol = goalHex || '#3b82f6';
    return [
        {
            label: 'Mövcud vəziyyət',
            data: nowVals,
            fill: true,
            backgroundColor: hexToRgba(nowCol, 0.22),
            borderColor: nowCol,
            borderWidth: 2.2,
            pointBackgroundColor: nowCol,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHitRadius: 16
        },
        {
            label: 'Hədəf olunan',
            data: goalVals,
            fill: true,
            backgroundColor: hexToRgba(goalCol, 0.16),
            borderColor: goalCol,
            borderWidth: 2.2,
            borderDash: [5, 4],
            pointBackgroundColor: goalCol,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHitRadius: 16
        }
    ];
}

function exqBarColor(score) {
    return exqStarColor(score) || '#94a3b8';
}

var ISQ_RADAR_NOW = '#d97706';
var ISQ_RADAR_GOAL = '#0e7490';

function exqStarsHtml(star) {
    var i;
    var html = '<span class="nk303-stars" aria-hidden="true">';
    for (i = 1; i <= 5; i++) {
        html += '<i class="' + (star && i <= star ? 'is-on' : '') + '">★</i>';
    }
    return html + '</span>';
}

function exqStarOfRow(r) {
    if (r && r.star != null && isFinite(Number(r.star))) return Number(r.star);
    return exqStarFromPercent(r && r.score);
}

function orgKey(row, i) {
    return qurumMatchKey(row && row.qurum) || (row && row.qurum) || (row && row.task && row.task.key) || ('row_' + i);
}

function orgSortTime(o) {
    if (o && o.start instanceof Date && !isNaN(o.start.getTime())) return o.start.getTime();
    if (o && o.updated instanceof Date && !isNaN(o.updated.getTime())) return o.updated.getTime();
    return Number(o && o.time) || 0;
}

function extraFromParsed(e, crit) {
    var sc = num(e && e.score);
    var title = (crit && crit.title) || (e && e.title) || 'Meyar';
    return {
        title: title,
        score: sc,
        scoreRaw: e && e.score && e.score !== '—' ? String(e.score) : '',
        text: String((e && e.text) || '').trim(),
        current: '',
        deficiency: '',
        criterion: title,
        sub: '',
        dirId: (crit && crit.dirId) || (e && e.dirId) || dirIdFromTitle(title),
        critId: (crit && crit.id) || (e && e.critId) || ''
    };
}

function parseRow(row, index) {
    var t = row && row.task;
    var info = getDiagInfo(t);
    var parsed = info || parseDiagUmumiNetice(t && t.fields && t.fields.customfield_17319);
    var headline = num(getDiagHeadline(t));
    if (headline == null) headline = num(getDiagScore(t));
    var dirScores = {};
    var dirTexts = {};
    DIRS.forEach(function(d) {
        dirScores[d.id] = null;
        dirTexts[d.id] = '';
    });
    ((parsed && parsed.directions) || []).forEach(function(d) {
        var id = dirIdFromTitle(d.title);
        if (!id) return;
        var sc = num(d.score);
        if (sc != null) dirScores[id] = sc;
        if (d.text) dirTexts[id] = d.text;
    });
    var dirVals = DIRS.map(function(d) { return dirScores[d.id]; }).filter(function(n) { return n != null; });
    var qrsg = headline;
    var qrsgOfficial = headline != null;
    if (qrsg == null && dirVals.length === 4) {
        qrsg = avg(dirVals);
        qrsgOfficial = true;
    }
    var extras = ((parsed && parsed.criteria) || []).map(function(e) {
        return extraFromParsed(e, e.id ? e : matchDiagCriterion(e.title));
    });
    ((parsed && parsed.extras) || []).forEach(function(e) {
        if (!e || !e.title || !String(e.title).trim()) return;
        extras.push(extraFromParsed(e, matchDiagCriterion(e.title)));
    });
    var statusName = (t && t.fields && t.fields.status && t.fields.status.name) || '—';
    var group = getStatusGroup(statusName) || 'other';
    var vis = visStatusOf(group);
    var hasResult = qrsg != null || dirVals.length > 0;
    var start = getTaskStartDate(t);
    var updated = t && t.fields && t.fields.updated ? new Date(t.fields.updated) : null;
    var phases = getRawPhaseEntries(t) || [];
    var phaseNotes = [];
    PHASE_FIELDS.forEach(function(pf) {
        var txt = getPhaseFieldText(t, pf.text);
        if (txt) phaseNotes.push(txt);
    });
    return {
        key: orgKey(row, index),
        issueKey: t && t.key,
        name: row.qurum || '—',
        year: row.year,
        time: row.time || 0,
        statusName: statusName,
        statusGroup: group,
        visId: vis.id,
        visLabel: vis.label,
        qrsg: qrsg,
        qrsgOfficial: qrsgOfficial,
        maturity: maturityOf(qrsg),
        dirs: dirScores,
        dirTexts: dirTexts,
        extras: extras,
        overallText: parsed && parsed.overall ? String(parsed.overall.text || '').trim() : '',
        hasResult: hasResult,
        start: start,
        updated: updated && !isNaN(updated.getTime()) ? updated : null,
        processIdx: processIndex(t, group, hasResult),
        phases: phases,
        phaseNotes: phaseNotes,
        dirGaps: {},
        overallCurrent: '',
        overallGaps: '',
        fromExcel: false,
        excelFile: '',
        excelFileId: ''
    };
}

function excelOrgFromUpload(raw, index) {
    var name = String(raw && raw.name || '').trim() || 'Qurum';
    var dirs = {};
    var dirTexts = {};
    var dirGaps = {};
    DIRS.forEach(function(d) {
        dirs[d.id] = num(raw.dirs && raw.dirs[d.id]);
        dirTexts[d.id] = String((raw.dirTexts && raw.dirTexts[d.id]) || '').trim();
        dirGaps[d.id] = String((raw.dirGaps && raw.dirGaps[d.id]) || '').trim();
    });
    var extras = (raw.extras || []).map(function(e) {
        var crit = matchDiagCriterion(e.criterion || e.title);
        return {
            title: (crit && crit.title) || e.title || 'Meyar',
            score: num(e.score),
            scoreRaw: e.score != null && e.score !== '' ? String(e.score) : '',
            text: String(e.text || e.current || e.deficiency || '').trim(),
            current: String(e.current || '').trim(),
            deficiency: String(e.deficiency || '').trim(),
            criterion: (crit && crit.title) || String(e.criterion || '').trim(),
            sub: String(e.sub || '').trim(),
            dirId: e.dirId || (crit && crit.dirId) || dirIdFromTitle(e.title),
            critId: e.critId || (crit && crit.id) || ''
        };
    });
    var qrsg = num(raw.qrsg);
    var dirVals = DIRS.map(function(d) { return dirs[d.id]; }).filter(function(n) { return n != null; });
    if (qrsg == null && dirVals.length === 4) qrsg = avg(dirVals);
    var updated = raw.uploadedAt ? new Date(raw.uploadedAt) : new Date();
    if (isNaN(updated.getTime())) updated = new Date();
    var start = null;
    if (raw.date) {
        start = new Date(raw.date);
        if (isNaN(start.getTime())) start = null;
    }
    var year = raw.year != null && isFinite(Number(raw.year)) ? Number(raw.year) : null;
    if (year == null && start) year = start.getFullYear();
    if (year == null && updated && !isNaN(updated.getTime())) year = updated.getFullYear();
    return {
        key: qurumMatchKey(name) || ('excel_' + index),
        issueKey: '',
        name: name,
        year: year,
        time: updated.getTime(),
        statusName: 'Excel',
        statusGroup: 'done',
        visId: 'done',
        visLabel: 'Tamamlanıb',
        qrsg: qrsg,
        qrsgOfficial: qrsg != null,
        maturity: maturityOf(qrsg),
        dirs: dirs,
        dirTexts: dirTexts,
        dirGaps: dirGaps,
        extras: extras,
        overallText: String(raw.overallText || '').trim(),
        overallCurrent: String(raw.overallCurrent || '').trim(),
        overallGaps: String(raw.overallGaps || '').trim(),
        hasResult: qrsg != null || dirVals.length > 0 || extras.length > 0,
        start: start,
        updated: updated,
        processIdx: 5,
        phases: [],
        phaseNotes: [],
        fromExcel: true,
        excelFile: raw.fileName || '',
        excelFileId: raw.fileId || ''
    };
}

function mergeExcelIntoOrg(org, excel) {
    org.fromExcel = true;
    org.excelFile = excel.excelFile || org.excelFile;
    org.excelFileId = excel.excelFileId || org.excelFileId;
    org.dirGaps = org.dirGaps || {};
    if (excel.qrsg != null) {
        org.qrsg = excel.qrsg;
        org.qrsgOfficial = true;
        org.maturity = maturityOf(org.qrsg);
        org.hasResult = true;
    }
    if (excel.hasResult) org.hasResult = true;
    DIRS.forEach(function(d) {
        if (excel.dirs[d.id] != null) org.dirs[d.id] = excel.dirs[d.id];
        if (excel.dirTexts[d.id]) org.dirTexts[d.id] = excel.dirTexts[d.id];
        if (excel.dirGaps[d.id]) org.dirGaps[d.id] = excel.dirGaps[d.id];
    });
    if (excel.overallCurrent) org.overallCurrent = excel.overallCurrent;
    if (excel.overallGaps) org.overallGaps = excel.overallGaps;
    var byTitle = {};
    org.extras.forEach(function(e) {
        if (e.current == null) e.current = '';
        if (e.deficiency == null) e.deficiency = '';
        if (e.criterion == null) e.criterion = '';
        if (e.sub == null) e.sub = '';
        byTitle[extraKey(e)] = e;
    });
    excel.extras.forEach(function(e) {
        var k = extraKey(e);
        var prev = byTitle[k];
        if (prev) {
            if (e.score != null) prev.score = e.score;
            if (e.current) prev.current = e.current;
            if (e.deficiency) prev.deficiency = e.deficiency;
            if (e.text) prev.text = e.text;
            if (e.criterion) prev.criterion = e.criterion;
            if (e.sub) prev.sub = e.sub;
        } else {
            org.extras.push(e);
            byTitle[k] = e;
        }
    });
    if (excel.start) org.start = excel.start;
    if (excel.year != null) org.year = excel.year;
    return org;
}

function latestByOrg(items) {
    var map = {};
    items.forEach(function(it) {
        var prev = map[it.key];
        if (!prev) {
            map[it.key] = it;
            return;
        }
        var py = prev.year == null ? -1 : Number(prev.year);
        var iy = it.year == null ? -1 : Number(it.year);
        if (iy > py || (iy === py && it.time > prev.time)) map[it.key] = it;
    });
    return Object.keys(map).map(function(k) { return map[k]; });
}

function applyUiFilters(items, opts) {
    opts = opts || {};
    var skipOrg = !!opts.skipOrg;
    var skipYear = !!opts.skipYear || !!(ui.orgKey && !skipOrg);
    return items.filter(function(it) {
        if (!skipYear && ui.year !== 'all' && Number(it.year) !== Number(ui.year)) return false;
        if (!skipOrg && ui.orgKey && it.key !== ui.orgKey) return false;
        if (ui.status && it.visId !== ui.status) return false;
        if (ui.dirId) {
            if (it.dirs[ui.dirId] == null) return false;
        }
        return true;
    });
}

function collectAllOrgs() {
    var rows = getDiagPeriodRows() || [];
    var all = rows.map(parseRow);
    var byKey = {};
    all.forEach(function(it) { byKey[it.key] = it; });
    (excelStore.orgs || []).map(excelOrgFromUpload).forEach(function(ex, i) {
        var prev = byKey[ex.key];
        if (prev) mergeExcelIntoOrg(prev, ex);
        else {
            all.push(ex);
            byKey[ex.key] = ex;
        }
    });
    return all;
}

function yearOfOrgKey(key) {
    if (!key) return null;
    var hits = collectAllOrgs().filter(function(o) { return o.key === key; });
    if (!hits.length) return null;
    hits.sort(function(a, b) {
        var ay = a.year == null ? -1 : Number(a.year);
        var by = b.year == null ? -1 : Number(b.year);
        if (by !== ay) return by - ay;
        return (b.time || 0) - (a.time || 0);
    });
    var y = hits[0].year;
    return y != null && isFinite(Number(y)) ? Number(y) : null;
}

function applyOrgYear(key) {
    var y = yearOfOrgKey(key);
    if (y == null) return false;
    ui.year = String(y);
    return true;
}

function uniqueYearsFromOrgs(orgs) {
    var ys = [];
    (orgs || []).forEach(function(o) {
        var y = o && o.year != null ? Number(o.year) : NaN;
        if (isFinite(y) && ys.indexOf(y) === -1) ys.push(y);
    });
    return ys;
}

function buildModel() {
    var all = collectAllOrgs();
    var years = {};
    all.forEach(function(it) {
        if (it.year != null && isFinite(it.year)) years[Number(it.year)] = true;
    });
    var yearList = Object.keys(years).map(Number).sort(function(a, b) { return b - a; });
    var skipOrg = ui.nav === 'orgs' || ui.nav === 'compare' || ui.mode === 'country';
    var orgOptions = latestByOrg(applyUiFilters(all, { skipOrg: true, skipYear: true }));
    var scoped = applyUiFilters(all, { skipOrg: skipOrg });
    var orgs = latestByOrg(scoped);
    var scored = orgs.filter(function(o) { return o.qrsg != null; });
    var countryAvg = avg(scored.map(function(o) { return o.qrsg; }));
    var byMat = { ilkin: 0, idare: 0, mueyyen: 0, opt: 0, none: 0 };
    orgs.forEach(function(o) {
        if (!o.maturity) byMat.none += 1;
        else byMat[o.maturity.id] += 1;
    });
    var byVis = { not_started: 0, in_progress: 0, review: 0, done: 0 };
    orgs.forEach(function(o) { byVis[o.visId] = (byVis[o.visId] || 0) + 1; });
    var dirAgg = DIRS.map(function(d) {
        var vals = orgs.map(function(o) { return o.dirs[d.id]; }).filter(function(n) { return n != null; });
        var a = avg(vals);
        return {
            id: d.id,
            name: d.name,
            avg: a,
            maturity: maturityOf(a),
            n: vals.length
        };
    });
    var critAgg = (DIAG_CRITERIA_DEFS || []).map(function(c) {
        var vals = orgs.map(function(o) {
            var hit = ((o && o.extras) || []).filter(function(e) {
                return (e.critId && e.critId === c.id)
                    || fold(e.criterion) === fold(c.title)
                    || fold(e.title) === fold(c.title);
            })[0];
            return hit && hit.score != null ? hit.score : null;
        }).filter(function(n) { return n != null; });
        return {
            id: c.id,
            dirId: c.dirId,
            name: c.title,
            short: c.short,
            avg: avg(vals),
            n: vals.length
        };
    });
    var rankedDirs = dirAgg.filter(function(d) { return d.avg != null; }).slice().sort(function(a, b) { return a.avg - b.avg; });
    var rankedOrgs = orgs.slice().sort(function(a, b) {
        var as = a.qrsg == null ? -1 : a.qrsg;
        var bs = b.qrsg == null ? -1 : b.qrsg;
        if (bs !== as) return bs - as;
        return String(a.name).localeCompare(String(b.name), 'az');
    });
    var selected = ui.orgKey
        ? (orgs.filter(function(o) { return o.key === ui.orgKey; })[0]
            || orgOptions.filter(function(o) { return o.key === ui.orgKey; })[0]
            || latestByOrg(all).filter(function(o) { return o.key === ui.orgKey; })[0]
            || null)
        : null;
    var gaps = collectGaps(orgs);
    var actions = collectActions(orgs);
    var trendYears = yearList.slice().sort(function(a, b) { return a - b; });
    var trend = trendYears.map(function(y) {
        var yearRows = all.filter(function(it) {
            return it && !it.fromExcel && Number(it.year) === y;
        });
        var scoredY = latestByOrg(yearRows).filter(function(o) { return o.qrsg != null; });
        return {
            y: y,
            avg: avg(scoredY.map(function(o) { return o.qrsg; })),
            n: yearRows.length
        };
    });
    var delta = null;
    if (ui.year !== 'all') {
        var yi = -1;
        trend.forEach(function(t, i) { if (Number(t.y) === Number(ui.year)) yi = i; });
        if (yi > 0 && trend[yi].avg != null && trend[yi - 1].avg != null) delta = trend[yi].avg - trend[yi - 1].avg;
    } else if (trend.length >= 2) {
        var lastT = trend[trend.length - 1];
        var prevT = trend[trend.length - 2];
        if (lastT.avg != null && prevT.avg != null) delta = lastT.avg - prevT.avg;
    }
    var lastUpdated = null;
    orgs.forEach(function(o) {
        if (o.updated && (!lastUpdated || o.updated > lastUpdated)) lastUpdated = o.updated;
    });
    var scoredTrend = trend.filter(function(t) { return t.avg != null; });
    var spanDelta = null;
    var spanFrom = null;
    var spanTo = null;
    if (scoredTrend.length >= 2) {
        spanDelta = scoredTrend[scoredTrend.length - 1].avg - scoredTrend[0].avg;
        spanFrom = scoredTrend[0].y;
        spanTo = scoredTrend[scoredTrend.length - 1].y;
    }
    var period = getAssessmentPeriodState();
    return {
        all: all,
        orgs: orgs,
        scoredN: scored.length,
        countryAvg: countryAvg,
        byMat: byMat,
        byVis: byVis,
        dirAgg: dirAgg,
        critAgg: critAgg,
        weakestDir: rankedDirs[0] || null,
        strongestDir: rankedDirs.length ? rankedDirs[rankedDirs.length - 1] : null,
        rankedOrgs: rankedOrgs,
        orgOptions: orgOptions,
        selected: selected,
        years: yearList,
        trend: trend,
        delta: delta,
        lastUpdated: lastUpdated,
        spanDelta: spanDelta,
        spanFrom: spanFrom,
        spanTo: spanTo,
        highGaps: highPriorityGaps(gaps).length,
        period: period,
        periodLabel: getAssessmentPeriodLabel(),
        attention: attentionItems(orgs, dirAgg),
        gaps: gaps,
        actions: actions
    };
}

function collectGaps(orgs) {
    var out = [];
    orgs.forEach(function(o) {
        DIRS.forEach(function(d) {
            var sc = o.dirs[d.id];
            var txt = o.dirTexts[d.id];
            var def = (o.dirGaps && o.dirGaps[d.id]) || '';
            if (sc != null && sc < 50) {
                out.push({
                    org: o.name,
                    orgKey: o.key,
                    dirId: d.id,
                    dir: d.name,
                    criterion: '',
                    score: sc,
                    current: txt || '',
                    deficiency: def || (looksLikeFinding(txt) ? txt : (txt || NA)),
                    extraKey: ''
                });
            } else if ((def && !isClosedGap(def)) || (txt && looksLikeFinding(txt))) {
                out.push({
                    org: o.name,
                    orgKey: o.key,
                    dirId: d.id,
                    dir: d.name,
                    criterion: '',
                    score: sc,
                    current: txt || '',
                    deficiency: def || txt,
                    extraKey: ''
                });
            }
        });
        o.extras.forEach(function(e) {
            var weak = e.score != null && e.score < 50;
            if (isClosedGap(e.deficiency) && !weak) return;
            var finding = looksLikeFinding(e.deficiency) || looksLikeFinding(e.text) || looksLikeFinding(e.title);
            if (!weak && !finding && !e.text && !e.current && !e.deficiency) return;
            if (!weak && !finding && !e.deficiency && e.score != null && e.score >= 50) return;
            var dir = DIRS.filter(function(d) { return d.id === e.dirId; })[0];
            out.push({
                org: o.name,
                orgKey: o.key,
                dirId: e.dirId || '',
                dir: dir ? dir.name : '',
                criterion: extraLabel(e, ''),
                score: e.score,
                current: e.current || e.text || '',
                deficiency: e.deficiency || (looksLikeFinding(e.text) ? e.text : (weak ? NA : '')),
                extraKey: extraKey(e)
            });
        });
    });
    return out;
}

function collectActions(orgs) {
    var out = [];
    orgs.forEach(function(o) {
        o.phases.forEach(function(p) {
            if (!p || !p.text) return;
            out.push({
                org: o.name,
                orgKey: o.key,
                dir: '',
                criterion: '',
                deficiency: '',
                action: p.text,
                date: p.date ? fmtDate(p.date) : '',
                status: o.visLabel
            });
        });
        if (o.overallText && looksLikeAction(o.overallText)) {
            out.push({
                org: o.name,
                orgKey: o.key,
                dir: '',
                criterion: '',
                deficiency: '',
                action: o.overallText,
                date: '',
                status: o.visLabel
            });
        }
        o.extras.forEach(function(e) {
            var blob = (e.title || '') + ' ' + (e.text || '');
            if (!looksLikeAction(blob)) return;
            var dir = DIRS.filter(function(d) { return d.id === e.dirId; })[0];
            out.push({
                org: o.name,
                orgKey: o.key,
                dir: dir ? dir.name : '',
                criterion: extraLabel(e, dir ? dir.name : ''),
                deficiency: looksLikeFinding(e.text) ? e.text : '',
                action: e.text || e.title,
                date: '',
                status: o.visLabel
            });
        });
    });
    return out;
}

function attentionItems(orgs, dirAgg) {
    var items = [];
    var incomplete = orgs.filter(function(o) { return o.visId !== 'done'; });
    if (incomplete.length) {
        items.push({ title: 'Tamamlanmamış diaqnostika', detail: incomplete.length + ' qurum' });
    }
    var low = orgs.filter(function(o) { return o.maturity && o.maturity.id === 'ilkin'; });
    if (low.length) {
        items.push({ title: 'İlkin səviyyə', detail: low.length + ' qurum' });
    }
    var weak = dirAgg.filter(function(d) { return d.avg != null; }).slice().sort(function(a, b) { return a.avg - b.avg; })[0];
    if (weak) {
        items.push({ title: 'Ən zəif istiqamət', detail: weak.name + ' · ' + fmt(weak.avg) });
    }
    return items;
}

function optionHtml(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (String(selected) === String(value) ? ' selected' : '') + '>'
        + esc(label) + '</option>';
}

function iconSvg(name) {
    var paths = {
        chart: '<path d="M4 19V6"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="8" rx="0.5"/><rect x="12" y="8" width="3" height="11" rx="0.5"/><rect x="17" y="13" width="3" height="6" rx="0.5"/>',
        building: '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 10h.01"/>',
        check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
        star: '<path d="M12 3.2l2.35 4.76 5.25.76-3.8 3.7.9 5.24L12 15.18l-4.7 2.48.9-5.24-3.8-3.7 5.25-.76L12 3.2z"/>',
        down: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8.5 12.5L12 16l3.5-3.5"/>',
        flag: '<path d="M5 21V4"/><path d="M5 4s1.2 1 4 1 4.8-2 8-2 3 .7 3 .7v9s-1.2-.7-3-.7-5 2-8 2-4-1-4-1"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.2-3.2"/>',
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        refresh: '<path d="M21 12a9 9 0 11-3.2-6.8"/><path d="M21 4v5h-5"/>',
        download: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>',
        upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
        file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
        external: '<path d="M14 5h5v5"/><path d="M20 4l-9 9"/><path d="M9 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-3"/>',
        chevron: '<path d="M15 18l-6-6 6-6"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + (paths[name] || '') + '</svg>';
}

function isOrgDetailView() {
    if (ui.hub && ui.hubDetailKey) return true;
    if (!ui.hub && (ui.mode === 'institution' || ui.orgKey)) return true;
    return false;
}

function backTarget() {
    if (ui.hub && ui.hubDetailKey) {
        var tab = HUB_TABS.filter(function(it) { return it.id === ui.hub; })[0];
        return {
            kicker: 'Geri qayıt',
            name: (tab && tab.label ? tab.label + ' siyahısı' : 'Siyahıya qayıt'),
            step: 'hubList'
        };
    }
    if (!ui.hub && (ui.mode === 'institution' || ui.orgKey)) {
        return { kicker: 'Geri qayıt', name: 'Qiymətləndirmə analitikası', step: 'diagList' };
    }
    if (ui.hub) {
        return { kicker: 'Geri qayıt', name: 'Qiymətləndirmə analitikası', step: 'diagHome' };
    }
    return { kicker: 'Geri qayıt', name: 'İdarəetmə paneli', step: 'panel' };
}

function goBackOneStep() {
    var step = backTarget().step;
    if (step === 'hubList') {
        ui.hubDetailKey = '';
        window.scrollTo(0, 0);
        render();
        return;
    }
    if (step === 'diagList') {
        ui.orgKey = '';
        ui.mode = 'country';
        ui.expandDir = '';
        ui.expandCrit = '';
        ui.nav = 'overview';
        window.scrollTo(0, 0);
        render();
        return;
    }
    if (step === 'diagHome') {
        closeHub();
        window.scrollTo(0, 0);
        render();
        return;
    }
    closeNk303();
}

function pageHeadCopy(model) {
    if (ui.hub && ui.hubDetailKey) {
        var detail = resolveHubDetailRow(currentHubView());
        if (detail) {
            return {
                title: detail.qurum || 'Qurum',
                sub: ui.hub === 'isq' ? 'Qurumun İSQ nəticələri' : 'Qurumun nəticələri'
            };
        }
    }
    if (ui.hub && PAGE_HEADS[ui.hub]) return PAGE_HEADS[ui.hub];
    if (ui.mode === 'institution' && model && model.selected) {
        return { title: model.selected.name, sub: 'Qurumun diaqnostika nəticələri' };
    }
    return PAGE_HEADS.diag;
}

function pageHeadHtml(model) {
    var orgOpts = optionHtml('', 'Bütün qurumlar', ui.orgKey)
        + (model.orgOptions || model.orgs).slice().sort(function(a, b) {
            return String(a.name).localeCompare(String(b.name), 'az');
        }).map(function(o) {
            return optionHtml(o.key, o.name, ui.orgKey);
        }).join('');
    var yearOpts = optionHtml('all', 'Bütün illər', ui.year)
        + model.years.map(function(y) { return optionHtml(String(y), String(y), String(ui.year)); }).join('');
    var copy = pageHeadCopy(model);
    var title = copy.title;
    var sub = copy.sub;
    var onDiag = !ui.hub;
    var inDetail = isOrgDetailView();
    var yearHtml = '';
    if (!(onDiag && ui.orgKey) && !ui.hubDetailKey) {
        if (onDiag) {
            yearHtml = '<label class="nk303-field"><span>İl</span><select onchange="nk303Call(\'year\', this.value)">' + yearOpts + '</select></label>';
        } else {
            yearHtml = hubYearFilterHtml(ui.hub);
        }
    }
    var orgHtml = (onDiag && !inDetail)
        ? '<label class="nk303-field"><span>Qurum</span><select onchange="nk303Call(\'org\', this.value)">' + orgOpts + '</select></label>'
        : '';
    var toolsHtml = (yearHtml || orgHtml)
        ? '<div class="nk303-tools"><div class="nk303-filters">' + yearHtml + orgHtml + '</div></div>'
        : '';
    var back = backTarget();
    return '<div class="nk303-wrap"><div class="nk303-head">'
        + '<div class="nk303-head-left">'
        + '<button type="button" class="nk303-home' + (inDetail || ui.hub ? ' nk303-home--back' : '') + '"'
        + ' onclick="nk303Call(\'back\'); return false;">'
        + '<span class="nk303-home-ic">' + iconSvg('chevron') + '</span>'
        + '<span class="nk303-home-txt"><span class="nk303-home-kicker">' + esc(back.kicker) + '</span>'
        + '<span class="nk303-home-name">' + esc(back.name) + '</span></span></button>'
        + '<p class="nk303-kicker">Qiymətləndirmə analitikası</p>'
        + '<h1 id="nk303Title">' + esc(title) + '</h1>'
        + '<p class="sub">' + esc(sub) + '</p>'
        + '</div>'
        + toolsHtml
        + '</div>'
        + hubNavHtml();
}

function hubYearValue() {
    var period = getAssessmentPeriodState();
    var y = period && period.year;
    if (!y || y === 'custom' || y === 'all') return 'all';
    return String(y);
}

function hubYearFilterHtml(section) {
    var cur = hubYearValue();
    var years = [];
    try { years = getAssessmentHubYears(section || ui.hub || 'diag') || []; } catch (e) {}
    return '<label class="nk303-field nk303-hub-year"><span>İl</span>'
        + '<select aria-label="İl" onchange="nk303Call(\'hubYear\', this.value)">'
        + optionHtml('all', 'Bütün illər', cur)
        + years.map(function(y) { return optionHtml(String(y), String(y), cur); }).join('')
        + '</select></label>';
}

function applyHubYear(year) {
    var y = year || 'all';
    ui.year = y;
    ui.hubPage = 1;
    var hub = ui.hub;
    Promise.resolve(setAssessmentYearForActiveTab(y)).then(function() {
        if (ui.hub !== hub) return;
        render();
    }).catch(function() {
        if (ui.hub === hub) render();
    });
}

function hubSectionOn(id) {
    if (ui.hub) return ui.hub === id;
    return id === 'diag';
}

function hubNavHtml() {
    var items = HUB_TABS.slice();
    try {
        var live = getAssessmentHubNav();
        if (live && live.length) items = live.slice();
    } catch (e) {}
    items = items.filter(function(it) { return it.id !== 'report'; });
    return '<nav class="nk303-sec-nav" aria-label="Qiymətləndirmə bölmələri">'
        + items.map(function(it) {
            return '<button type="button" class="nk303-sec' + (hubSectionOn(it.id) ? ' is-on' : '') + '" data-sec="'
                + esc(it.id) + '" onclick="nk303Call(\'hub\',\'' + esc(it.id) + '\')">'
                + '<i style="background:' + esc(it.color || '#64748b') + '"></i>'
                + '<span>' + esc(it.label) + '</span>'
                + (it.count != null ? '<b>' + esc(String(it.count)) + '</b>' : '')
                + '</button>';
        }).join('')
        + '</nav>';
}

function isAdmin() {
    return !!adminState.isAdmin;
}

function currentHubView() {
    try {
        return getAssessmentHubView(ui.hub);
    } catch (e) {
        var tab = HUB_TABS.filter(function(it) { return it.id === ui.hub; })[0];
        return { section: ui.hub, label: (tab && tab.label) || ui.hub, stats: {}, rows: [], period: '' };
    }
}

function trendChartHtml(model) {
    var pts = (model && model.trend) || [];
    var has = pts.some(function(t) { return t && t.avg != null; });
    var hint = 'İllər üzrə ölkə üzrə ortalama bal (0–100).';
    if (model && model.spanFrom != null && model.spanTo != null && model.spanDelta != null) {
        var sign = model.spanDelta < 0 ? '' : '+';
        hint += ' ' + model.spanFrom + '–' + model.spanTo + ': ' + sign + fmt1(model.spanDelta) + ' bal.';
    }
    var counts = pts.filter(function(t) { return t && t.y != null; }).map(function(t) {
        return '<span><b>' + esc(String(t.y)) + '</b> ' + (Number(t.n) || 0) + ' diaqnostika</span>';
    }).join('');
    return '<section class="nk303-card nk303-card--index">'
        + '<p class="nk303-kicker">Diaqnostika və qiymətləndirmə</p>'
        + '<h3>Rəqəmsallaşma indeksinin dinamikası</h3>'
        + '<p class="nk303-hint">' + esc(hint) + '</p>'
        + (counts ? '<p class="nk303-trend-years">' + counts + '</p>' : '')
        + (has
            ? '<div class="nk303-chart nk303-chart--index"><canvas id="nkTrendChart" aria-label="Rəqəmsallaşma indeksinin dinamikası"></canvas></div>'
            : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section>';
}

function scoredTrendPts(trend) {
    return (trend || []).filter(function(t) {
        return t && t.avg != null && isFinite(Number(t.avg));
    }).slice().sort(function(a, b) { return Number(a.y) - Number(b.y); });
}

function easeInOutQuart(t) {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

function trendAxisBounds(series) {
    var ys = [];
    var i;
    for (i = 0; i < series.length; i++) {
        if (series[i] && series[i].y != null && isFinite(series[i].y)) ys.push(Number(series[i].y));
    }
    if (!ys.length) return { min: 0, max: 100 };
    var lo = Math.min.apply(null, ys);
    var hi = Math.max.apply(null, ys);
    var span = Math.max(hi - lo, 6);
    var pad = Math.max(span * 0.28, 2.5);
    var min = Math.max(0, Math.floor((lo - pad) / 5) * 5);
    var max = Math.min(100, Math.ceil((hi + pad) / 5) * 5);
    if (max - min < 15) {
        var mid = (lo + hi) / 2;
        min = Math.max(0, Math.floor((mid - 10) / 5) * 5);
        max = Math.min(100, Math.ceil((mid + 10) / 5) * 5);
    }
    if (!(max > min)) return { min: 0, max: 100 };
    return { min: min, max: max };
}

function curvedTrendSeries(trend) {
    var src = scoredTrendPts(trend);
    if (!src.length) return [];
    if (src.length === 1) {
        return [{ x: Number(src[0].y), y: src[0].avg, year: src[0].y, n: src[0].n, real: true }];
    }
    var out = [];
    var steps = 14;
    src.forEach(function(p, i) {
        var cur = { x: Number(p.y), y: p.avg, year: p.y, n: p.n, real: true };
        if (i === 0) {
            out.push(cur);
            return;
        }
        var prev = src[i - 1];
        var x0 = Number(prev.y);
        var x1 = Number(p.y);
        var y0 = prev.avg;
        var y1 = p.avg;
        var s;
        for (s = 1; s < steps; s++) {
            var t = s / steps;
            out.push({
                x: x0 + (x1 - x0) * t,
                y: y0 + (y1 - y0) * easeInOutQuart(t),
                real: false
            });
        }
        out.push(cur);
    });
    return out;
}

function resolveHubDetailRow(view) {
    var key = String(ui.hubDetailKey || '').trim();
    if (!key || !view) return null;
    var list = view.rows || [];
    var i;
    var r;
    for (i = 0; i < list.length; i++) {
        r = list[i];
        if (!r) continue;
        if (r.key && String(r.key) === key) return r;
    }
    var folded = fold(key);
    for (i = 0; i < list.length; i++) {
        r = list[i];
        if (!r) continue;
        if (fold(r.qurum || '') === folded) return r;
    }
    return null;
}

function hubIsqPillarCards(task) {
    var info = getIsqInfo(task) || {};
    var byTitle = {};
    (info.directions || []).forEach(function(d) {
        if (!d || !d.title) return;
        byTitle[fold(d.title)] = d;
    });
    var cards = ISQ_PILLARS.map(function(p) {
        var d = byTitle[fold(p.name)] || null;
        var score = d && d.score && d.score !== '—' ? num(d.score) : null;
        var text = d && d.text ? String(d.text).trim() : '';
        if (score == null && text && /^n\/?a$/i.test(text)) {
            text = 'N/A';
        }
        return {
            id: p.id,
            name: p.name,
            short: p.short,
            score: score,
            text: text
        };
    });
    // Sütunlar boşdursa extras-dakı meyarları da göstər
    var hasDir = cards.some(function(c) { return c.score != null || c.text; });
    if (!hasDir && info.extras && info.extras.length) {
        return info.extras.map(function(e, i) {
            return {
                id: 'extra_' + i,
                name: e.title || ('Meyar ' + (i + 1)),
                short: e.title || ('Meyar ' + (i + 1)),
                score: e.score && e.score !== '—' ? num(e.score) : null,
                text: e.text ? String(e.text).trim() : ''
            };
        });
    }
    return cards;
}

function hubOrgDetailHtml(view) {
    var r = resolveHubDetailRow(view);
    if (!r) {
        return '<section class="nk303-card"><p class="nk303-empty">Qurum tapılmadı.</p>'
            + '<button type="button" class="nk303-btn nk303-btn--ghost" onclick="nk303Call(\'back\')">Siyahıya qayıt</button>'
            + '</section>';
    }
    var t = r.task;
    var star = r.star != null ? Number(r.star) : exqStarFromPercent(r.score);
    var start = t ? getTaskStartDate(t) : null;
    var updated = t && t.fields && t.fields.updated ? new Date(t.fields.updated) : null;
    if (updated && isNaN(updated.getTime())) updated = null;
    var statusName = r.status || (t && t.fields && t.fields.status && t.fields.status.name) || '—';
    var group = getStatusGroup(statusName) || 'other';
    var vis = visStatusOf(group);
    var pillars = hubIsqPillarCards(t);
    var pillarHtml = pillars.map(function(p) {
        return '<article class="nk303-dir">'
            + '<div class="nk303-dir-top"><b>' + esc(p.short || p.name) + '</b>'
            + matBadge(p.score) + '</div>'
            + '<div class="nk303-dir-score">' + esc(p.score == null ? '—' : fmt1(p.score) + '%') + '</div>'
            + (p.text ? '<p class="nk303-hint">' + esc(clipText(p.text, 160)) + '</p>' : '')
            + '</article>';
    }).join('');
    return '<section class="nk303-card" style="margin-bottom:0.55rem">'
        + '<div class="nk303-profile">'
        + '<div>'
        + '<p class="nk303-kicker">Qurumun İSQ nəticələri</p>'
        + '<h3 style="margin:0;font-size:1.05rem">' + esc(r.qurum || '—') + '</h3>'
        + '<dl class="nk303-meta">'
        + '<div><dt>İl</dt><dd>' + esc(r.year || '—') + '</dd></div>'
        + '<div><dt>Status</dt><dd>' + esc(vis.label) + ' · ' + esc(statusName) + '</dd></div>'
        + '<div><dt>Başlanğıc</dt><dd>' + esc(start ? fmtDate(start) : NA) + '</dd></div>'
        + '<div><dt>Son yenilənmə</dt><dd>' + esc(updated ? fmtDate(updated) : NA) + '</dd></div>'
        + '<div><dt>Tapşırıq</dt><dd class="nk303-meta-task">' + issueLinkHtml(r.key) + '</dd></div>'
        + '</dl></div>'
        + '<div>'
        + '<p class="nk303-hint">Yekun nəticə</p>'
        + '<div class="nk303-score">'
        + (function() {
            if (r.score != null) {
                return '<strong>' + esc(fmt1(r.score) + '%') + '</strong>'
                    + (star ? '<span class="nk303-mat">' + esc(exqStarLabel(star)) + '</span>'
                        + '<div class="nk303-kpi-stars" style="margin-top:0.35rem">' + exqStarsHtml(star) + '</div>' : '');
            }
            var note = hubTextResultNote(r.result);
            if (note) {
                return '<span class="nk303-score-note nk303-score-note--lg" title="' + esc(note.full) + '">'
                    + esc(note.short) + '</span>';
            }
            return '<strong>—</strong>';
        })()
        + '</div></div></div>'
        + '</section>'
        + '<section class="nk303-card"><h3>İSQ sütunları</h3>'
        + '<p class="nk303-hint">Qurum üzrə 10 qiymətləndirmə meyarı və status.</p>'
        + '<div class="nk303-dirs nk303-dirs--isq">' + pillarHtml + '</div>'
        + '</section>';
}

function hubPageHtml(view) {
    var cls = 'nk303-hub-page' + (view.section === 'meqsed' ? ' is-meqsed' : '');
    if (ui.hubDetailKey) {
        return '<h3 id="nk303HubTitle" class="sr-only">' + esc((view && view.label) || 'İSQ') + ' — qurum</h3>'
            + '<div class="' + cls + '">' + hubOrgDetailHtml(view) + '</div>';
    }
    return '<h3 id="nk303HubTitle" class="sr-only">' + esc(view.label) + ' nəticələri</h3>'
        + '<div class="' + cls + '">' + hubBodyHtml(view) + '</div>';
}

function toggleCountryNav(nav) {
    resetHubState();
    ui.mode = 'country';
    ui.orgKey = '';
    ui.expandDir = '';
    ui.expandCrit = '';
    ui.page = 1;
    ui.nav = ui.nav === nav ? 'overview' : nav;
    window.scrollTo(0, 0);
}

function kpiCardHtml(opts) {
    var inner = '<div class="nk303-kpi-top">'
        + '<span class="ic ' + opts.ic + '">' + iconSvg(opts.icon) + '</span>'
        + '<span class="lb">' + esc(opts.label) + '</span>'
        + '</div>'
        + '<div class="val' + (opts.valClass ? ' ' + opts.valClass : '') + '">' + opts.valueHtml + '</div>'
        + (opts.subHtml || '');
    if (opts.onclick) {
        return '<button type="button" class="nk303-kpi nk303-kpi--btn'
            + (opts.on ? ' is-on' : '')
            + (opts.tone ? ' is-tone-' + opts.tone : '')
            + '" onclick="' + opts.onclick + '"'
            + ' aria-pressed="' + (opts.on ? 'true' : 'false') + '">'
            + inner + '</button>';
    }
    return '<article class="nk303-kpi">' + inner + '</article>';
}

function countryKpis(model) {
    var total = model.orgs.length;
    var done = model.byVis.done || 0;
    var donePct = pct(done, total);
    var delta = model.delta;
    var strong = model.strongestDir;
    var weak = model.weakestDir;
    var indexVal = model.countryAvg == null
        ? '—'
        : esc(fmt1(model.countryAvg)) + ' <small>/ 100</small>';
    var deltaHtml = delta == null
        ? ''
        : '<div class="sub ' + (delta < 0 ? 'is-down' : 'is-up') + '">'
            + (delta < 0 ? '↓ ' : '↑ +') + esc(fmt1(Math.abs(delta))) + ' bal</div>';
    var strongName = strong && strong.avg != null ? esc(dirShort(strong)) : '—';
    var strongSub = strong && strong.avg != null
        ? '<div class="sub is-up">' + esc(fmt1(strong.avg)) + ' bal</div>'
        : '';
    var weakName = weak && weak.avg != null ? esc(dirShort(weak)) : '—';
    var weakSub = weak && weak.avg != null
        ? '<div class="sub is-down">' + esc(fmt1(weak.avg)) + ' bal</div>'
        : '';
    return '<div class="nk303-kpis">'
        + kpiCardHtml({
            ic: 'is-blue', icon: 'chart', label: 'Ölkə üzrə rəqəmsallaşma indeksi',
            valueHtml: indexVal, subHtml: deltaHtml
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'building', label: 'Qiymətləndirilən qurumlar',
            valueHtml: esc(String(total)), subHtml: '<div class="sub">cəmi qurum · kliklə, siyahıya bax</div>',
            onclick: 'nk303Call(\'orgsList\')',
            on: ui.nav === 'orgs'
        })
        + kpiCardHtml({
            ic: 'is-green', icon: 'check', label: 'Tamamlanmış qiymətləndirmələr',
            valueHtml: esc(String(done)) + ' <small>/ ' + esc(String(total)) + '</small>',
            subHtml: '<div class="nk303-mini-bar is-green" aria-hidden="true"><i style="width:' + donePct + '%"></i></div>',
            onclick: 'nk303Call(\'doneList\')',
            on: ui.nav === 'done'
        })
        + kpiCardHtml({
            ic: 'is-green', icon: 'star', label: 'Ən güclü istiqamət',
            valueHtml: strongName, valClass: 'is-name', subHtml: strongSub
        })
        + kpiCardHtml({
            ic: 'is-red', icon: 'down', label: 'Ən zəif istiqamət',
            valueHtml: weakName, valClass: 'is-name', subHtml: weakSub
        })
        + kpiCardHtml({
            ic: 'is-amber', icon: 'flag', label: 'Yüksək prioritetli boşluqlar',
            valueHtml: esc(String(model.highGaps || 0)),
            subHtml: '<div class="sub">sahə · kliklə, siyahıya bax</div>',
            onclick: 'nk303Call(\'highGaps\')',
            on: ui.nav === 'gaps',
            tone: 'amber'
        })
        + '</div>';
}

function kpiCard(label, value, matClass, analytic) {
    return '<div class="nk303-kpi' + (matClass ? ' is-' + matClass : '') + '">'
        + '<b>' + esc(String(value)) + '</b>'
        + '<span>' + esc(label) + '</span>'
        + (analytic ? '<em>Analitik göstərici</em>' : '')
        + '</div>';
}

function dirHasDetail(org, dirId) {
    if (!org || !dirId) return false;
    if (extrasForDir(org, dirId).length) return true;
    if (org.dirTexts && org.dirTexts[dirId]) return true;
    if (org.dirGaps && org.dirGaps[dirId]) return true;
    return false;
}

function dirCardsHtml(dirAgg, clickable, clickAction) {
    var act = clickAction || 'openDir';
    return '<div class="nk303-dirs">'
        + dirAgg.map(function(d) {
            var w = d.avg == null ? 0 : Math.max(0, Math.min(100, d.avg));
            var live = clickable && d.hasDetail !== false;
            var onclick = live ? ' onclick="nk303Call(\'' + act + '\',\'' + d.id + '\')"' : '';
            var tag = live ? 'button type="button"' : 'article';
            var close = live ? 'button' : 'article';
            return '<' + tag + ' class="nk303-dir' + (ui.dirId === d.id || ui.expandDir === d.id ? ' is-on' : '') + '"' + onclick + '>'
                + '<div class="nk303-dir-top">'
                + '<span class="nm">' + esc(d.name) + '</span>'
                + '<span class="sc">' + esc(d.avg == null ? '—' : fmt1(d.avg)) + '</span>'
                + '</div>'
                + (d.maturity || d.avg != null ? matBadge(d.avg) : '<span class="nk303-mat is-none">' + esc(NA) + '</span>')
                + '<span class="nk303-bar" aria-hidden="true"><i style="width:' + w + '%;background:' + barColor(d.avg) + '"></i></span>'
                + '</' + close + '>';
        }).join('')
        + '</div>';
}

function distHtml(byMat, total) {
    return '<div class="nk303-dist">'
        + MATS.map(function(m) {
            var n = byMat[m.id] || 0;
            var p = pct(n, total);
            return '<div class="nk303-dist-row">'
                + '<b>' + esc(m.label) + '</b>'
                + '<span class="nk303-track"><i style="width:' + p + '%;background:' + m.color + '"></i></span>'
                + '<em>' + p + '%</em></div>';
        }).join('')
        + '</div>'
        + '<ul class="nk303-scale">'
        + MATS.map(function(m) {
            return '<li class="is-' + m.id + '">' + esc(m.lo + '–' + m.hi + '  ' + m.label) + '</li>';
        }).join('')
        + '</ul>';
}

function orgTableHtml(model, rows) {
    var list = (rows || []).slice();
    if (ui.search) {
        var q = fold(ui.search);
        list = list.filter(function(o) {
            return fold(o.name).indexOf(q) !== -1 || fold(o.issueKey || '').indexOf(q) !== -1;
        });
    }
    if (ui.maturity) {
        list = list.filter(function(o) {
            if (ui.maturity === 'none') return !o.maturity;
            return o.maturity && o.maturity.id === ui.maturity;
        });
    }
    if (ui.sort === 'date') {
        list.sort(function(a, b) {
            var ta = orgSortTime(a);
            var tb = orgSortTime(b);
            if (tb !== ta) return tb - ta;
            return String(a.name).localeCompare(String(b.name), 'az');
        });
    } else {
        list.sort(function(a, b) {
            var as = a.qrsg == null ? -1 : a.qrsg;
            var bs = b.qrsg == null ? -1 : b.qrsg;
            if (bs !== as) return bs - as;
            var ta = orgSortTime(a);
            var tb = orgSortTime(b);
            if (tb !== ta) return tb - ta;
            return String(a.name).localeCompare(String(b.name), 'az');
        });
    }
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE) || 1);
    if (ui.page > pages) ui.page = pages;
    var slice = list.slice((ui.page - 1) * PAGE_SIZE, ui.page * PAGE_SIZE);
    var body = slice.map(function(o, i) {
        var rank = (ui.page - 1) * PAGE_SIZE + i + 1;
        var on = o.key === ui.orgKey ? ' is-on' : '';
        var w = o.qrsg == null ? 0 : Math.max(0, Math.min(100, o.qrsg));
        var weak = weakestDirOf(o);
        return '<tr class="' + on.trim() + '" onclick="nk303Call(\'openOrg\',\'' + qarg(o.key) + '\')">'
            + '<td class="num">' + rank + '</td>'
            + '<td class="q" title="' + esc(o.name) + '">' + esc(o.name) + '</td>'
            + '<td><div class="nk303-scorecell"><b>' + esc(o.qrsg == null ? '—' : fmt1(o.qrsg)) + '</b>'
            + '<span class="bar"><i style="width:' + w + '%;background:' + barColor(o.qrsg) + '"></i></span></div></td>'
            + '<td>' + matBadge(o.qrsg) + '</td>'
            + '<td>' + visPill(o) + '</td>'
            + '<td>' + esc(weak ? dirShort(weak) : '—') + '</td>'
            + '</tr>';
    }).join('');
    var from = list.length ? (ui.page - 1) * PAGE_SIZE + 1 : 0;
    var to = Math.min(ui.page * PAGE_SIZE, list.length);
    var pager = '';
    if (list.length) {
        var n;
        pager = '<div class="nk303-pager">'
            + '<span class="nk303-pager-meta">'
            + (pages > 1 ? from + '–' + to + ' / ' : '')
            + list.length + ' qurum</span>';
        if (pages > 1) {
            pager += '<button type="button" ' + (ui.page <= 1 ? 'disabled' : '') + ' onclick="nk303Call(\'page\',' + (ui.page - 1) + ')">‹</button>';
            for (n = 1; n <= pages; n++) {
                pager += '<button type="button" class="' + (n === ui.page ? 'is-on' : '') + '" onclick="nk303Call(\'page\',' + n + ')">' + n + '</button>';
            }
            pager += '<button type="button" ' + (ui.page >= pages ? 'disabled' : '') + ' onclick="nk303Call(\'page\',' + (ui.page + 1) + ')">›</button>';
        }
        pager += '</div>';
    }
    return '<div class="nk303-toolbar">'
        + '<div class="nk303-searchwrap">' + iconSvg('search')
        + '<input type="search" class="nk303-search" placeholder="Qurum adı ilə axtar..." value="' + esc(ui.search) + '" oninput="nk303Call(\'search\', this.value)">'
        + '</div>'
        + '<select class="nk303-select" onchange="nk303Call(\'maturity\', this.value)">'
        + optionHtml('', 'Bütün səviyyələr', ui.maturity)
        + MATS.map(function(m) { return optionHtml(m.id, m.label, ui.maturity); }).join('')
        + '</select>'
        + '<select class="nk303-select" onchange="nk303Call(\'sort\', this.value)">'
        + optionHtml('score', 'Bal üzrə sıralama', ui.sort)
        + optionHtml('date', 'Tarixə görə sıralama', ui.sort)
        + '</select></div>'
        + (list.length
            ? '<div class="nk303-table-wrap nk303-table-wrap--fit"><table class="nk303-table nk303-table--fit nk303-table--orgs"><thead><tr>'
                + '<th>#</th><th>Qurum</th><th>Ümumi bal</th><th>Rəqəmsallaşma səviyyəsi</th><th>Status</th><th>Ən zəif istiqamət</th>'
                + '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager
            : '<p class="nk303-empty">Seçilmiş filtrə uyğun qurum yoxdur.</p>');
}

function nextOfficial(score) {
    var target = maturityTarget(score);
    if (target == null) return { target: null, gap: null };
    return { target: target, gap: Math.max(0, target - score) };
}

function isHighPriorityGap(g) {
    if (!g) return false;
    if (g.score != null && g.score < 25) return true;
    return gapPriority(g.score, {}).id === 'high';
}

function highPriorityGaps(gaps) {
    return (gaps || []).filter(isHighPriorityGap).slice().sort(function(a, b) {
        var as = a.score == null ? 101 : a.score;
        var bs = b.score == null ? 101 : b.score;
        if (as !== bs) return as - bs;
        return String(a.org || '').localeCompare(String(b.org || ''), 'az');
    });
}

function gapOpenArg(g) {
    return qarg([g.orgKey || '', g.dirId || '', g.extraKey || ''].join('\t'));
}

function highGapsTableHtml(rows, showAll) {
    var list = showAll ? rows : rows.slice(0, 8);
    if (!list.length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<div class="nk303-table-wrap nk303-table-wrap--fit"><table class="nk303-table nk303-table--fit"><thead><tr>'
        + '<th>Qurum</th><th>İstiqamət / meyar</th><th>Cari bal</th><th>Çatışmazlıq</th><th>Prioritet</th>'
        + '</tr></thead><tbody>'
        + list.map(function(g) {
            var pri = gapPriority(g.score, {});
            var label = [g.dir, g.criterion].filter(Boolean).join(' → ') || 'İstiqamət';
            return '<tr onclick="nk303Call(\'openGap\',\'' + gapOpenArg(g) + '\')">'
                + '<td class="q" title="' + esc(g.org) + '">' + esc(g.org) + '</td>'
                + '<td class="q" title="' + esc(label) + '">' + esc(label) + '</td>'
                + '<td class="num">' + esc(g.score == null ? '—' : fmt1(g.score)) + '</td>'
                + '<td class="act">' + esc(clipText(g.deficiency || NA, 220)) + '</td>'
                + '<td><span class="nk303-pri is-' + pri.id + '">' + esc(pri.label) + '</span></td>'
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
}

function highGapsBody(model) {
    var rows = highPriorityGaps(model.gaps);
    return countryKpis(model)
        + '<section class="nk303-card" id="nkHighGaps">'
        + '<h3>Yüksək prioritetli boşluqlar</h3>'
        + '<p class="nk303-hint">İlkin səviyyə və yüksək prioritet sahələr. Sətirə klikləyib qurumun analizində həmin boşluğa baxın.</p>'
        + highGapsTableHtml(rows, true)
        + '</section>';
}

function isVisNav(nav) {
    return nav === 'done' || nav === 'in_progress' || nav === 'review' || nav === 'not_started';
}

function donutPickOptions(onPick) {
    return {
        onClick: function(evt, els, chart) {
            var host = chart || this;
            var hits = els;
            if ((!hits || !hits.length) && host && host.getElementsAtEventForMode) {
                hits = host.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
                if (!hits || !hits.length) {
                    hits = host.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
                }
            }
            if (!hits || !hits.length) return;
            var item = ((host && host._donutItems) || [])[hits[0].index];
            if (item && item.filter && typeof onPick === 'function') onPick(item.filter);
        },
        onHover: function(evt, els) {
            var t = evt && evt.native && evt.native.target;
            if (t && t.style) t.style.cursor = els && els.length ? 'pointer' : 'default';
        }
    };
}

function visStatusPick() {
    return isVisNav(ui.status) ? ui.status : '';
}

function pickDonutSlice(items, selectedFilter) {
    items = items || [];
    var sliced = !!(selectedFilter && items.some(function(x) { return x.filter === selectedFilter; }));
    if (sliced) items = items.filter(function(x) { return x.filter === selectedFilter; });
    var hasAny = items.some(function(x) { return x.n > 0; });
    return {
        donutItems: hasAny ? items.filter(function(x) { return x.n > 0; }) : [{ label: NA, n: 1, color: '#e2e8f0' }],
        centerN: hasAny ? items.reduce(function(s, x) { return s + (x.n || 0); }, 0) : 0,
        filtered: sliced
    };
}

function countryOrgListBody(model, kind) {
    var all = model.rankedOrgs || [];
    var meta = {
        all: {
            title: 'Qiymətləndirilən qurumlar',
            hint: 'Qiymətləndirmədə olan qurumlar. Sətirə klikləyib qurumun analizini açın.'
        },
        done: {
            title: 'Tamamlanmış qiymətləndirmələr',
            hint: 'Diaqnostikası tamamlanmış qurumlar. Sətirə klikləyib qurumun analizini açın.'
        },
        in_progress: {
            title: 'İcradadır',
            hint: 'İcrada olan qiymətləndirmələr. Sətirə klikləyib qurumun tapşırığına baxın.'
        },
        review: {
            title: 'Rəydə',
            hint: 'Rəydə olan qiymətləndirmələr. Sətirə klikləyib qurumun tapşırığına baxın.'
        },
        not_started: {
            title: 'İcraya başlanmayıb',
            hint: 'İcraya başlanmamış qiymətləndirmələr. Sətirə klikləyib qurumun tapşırığına baxın.'
        }
    };
    var info = meta[kind] || meta.all;
    var rows = isVisNav(kind) ? all.filter(function(o) { return o.visId === kind; }) : all;
    return countryKpis(model)
        + '<section class="nk303-card nk303-card--orgs" id="nkCountryList">'
        + '<h3>' + esc(info.title) + '</h3>'
        + '<p class="nk303-hint">' + esc(info.hint) + '</p>'
        + orgTableHtml(model, rows)
        + '</section>';
}

function gapPriority(score, opts) {
    opts = opts || {};
    if (score == null || !isFinite(score)) return { id: 'mid', label: 'Orta' };
    var mat = maturityOf(score);
    var nx = nextOfficial(score);
    var gap = nx && nx.gap != null ? nx.gap : 0;
    if (opts.weakest || (mat && mat.id === 'ilkin')) {
        return { id: 'high', label: 'Yüksək' };
    }
    if (mat && mat.id === 'idare') {
        return gap >= 12 ? { id: 'high', label: 'Yüksək' } : { id: 'mid', label: 'Orta' };
    }
    if (mat && mat.id === 'mueyyen') return { id: 'mid', label: 'Orta' };
    return { id: 'low', label: 'Aşağı' };
}

function clipText(s, n) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (t.length <= n) return t;
    return t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

/** Bal yox, yalnız mətn nəticəsi olan İSQ/EXQ sətirləri üçün qısa etiketi. */
function hubTextResultNote(raw) {
    var full = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!full || full === '—' || full === NA) return null;
    if (num(full) != null && full.length <= 12) return null;
    var body = full
        .replace(/^(İSQ|ISQ|EXQ)\s*n[eə]tic[eə]si\s*[:：\-–—]?\s*/i, '')
        .trim();
    if (!body) body = full;
    if (num(body) != null && body.length <= 12) return null;
    var f = fold(body);
    var short;
    // «…hesabat quruma təqdim edilmişdir» və oxşar — kompakt etiket
    if (/teqdim\s*edil/.test(f) || (/hesabat/.test(f) && /teqdim/.test(f))) {
        short = 'Hesabat təqdim edilib';
    } else if (/tekmilles/.test(f) && /istiqamet/.test(f)) {
        short = 'Təkmilləşdirmə hesabatı';
    } else {
        short = clipText(body, 40);
    }
    return { short: short, full: full };
}

function hubYekunCellHtml(r, kind) {
    var score = r && r.score != null && isFinite(Number(r.score)) ? Number(r.score) : null;
    var star = score != null ? exqStarOfRow(r) : null;
    if (score != null) {
        var w = Math.max(0, Math.min(100, score));
        var suffix = (kind === 'isq' || kind === 'exq') ? '%' : '';
        return '<div class="nk303-scorecell"><b>' + esc(fmt1(score) + suffix) + '</b>'
            + (star ? '<em class="nk303-star-mini">' + esc(exqStarLabel(star)) + '</em>' : '')
            + '<span class="bar"><i style="width:' + w + '%;background:' + exqBarColor(score) + '"></i></span></div>';
    }
    var note = hubTextResultNote(r && r.result);
    if (note) {
        return '<div class="nk303-scorecell is-note" title="' + esc(note.full) + '">'
            + '<span class="nk303-score-note">' + esc(note.short) + '</span></div>';
    }
    return '<div class="nk303-scorecell"><b>—</b></div>';
}

function recommendAction(dirId, score, model, criterion) {
    var dir = DIRS.filter(function(d) { return d.id === dirId; })[0];
    var fromJira = (model && model.actions || []).filter(function(a) {
        if (!a || !a.action || !looksLikeAction(a.action)) return false;
        if (criterion && a.criterion && fold(a.criterion) === fold(criterion)) return true;
        return dir && a.dir === dir.name;
    })[0];
    if (fromJira && fromJira.action) return clipText(fromJira.action, 160);
    var mat = maturityOf(score);
    var pack = DIR_ACTIONS[dirId];
    if (mat && pack && pack[mat.id]) return pack[mat.id];
    var nx = nextOfficial(score);
    if (nx && nx.target != null) {
        return 'Qərar 303, bənd 4.10 üzrə növbəti rəsmi səviyyəyə (' + fmt1(nx.target) + ' bal) çatmaq üçün tədbirlər planı hazırlansın.';
    }
    return NA;
}

function aggregatedGapRows(gaps) {
    var map = {};
    (gaps || []).forEach(function(g) {
        var key = g.criterion || g.dir || '—';
        if (!map[key]) map[key] = { name: key, scores: [], dir: g.dir || '', dirId: g.dirId || '' };
        if (g.score != null) map[key].scores.push(g.score);
        if (!map[key].dirId && g.dirId) map[key].dirId = g.dirId;
    });
    return Object.keys(map).map(function(k) {
        var row = map[k];
        var a = avg(row.scores);
        var nx = nextOfficial(a);
        return { name: row.name, dir: row.dir, dirId: row.dirId, score: a, target: nx.target, gap: nx.gap };
    }).sort(function(a, b) {
        var as = a.score == null ? 101 : a.score;
        var bs = b.score == null ? 101 : b.score;
        return as - bs;
    }).map(function(row, i, arr) {
        row.pri = gapPriority(row.score, { weakest: i === 0 && arr.length > 0 });
        return row;
    });
}

function dirGapRows(dirAgg) {
    return (dirAgg || []).filter(function(d) { return d.avg != null; }).map(function(d) {
        var nx = nextOfficial(d.avg);
        return {
            id: d.id,
            name: d.name,
            dir: d.name,
            dirId: d.id,
            score: d.avg,
            target: nx.target,
            gap: nx.gap
        };
    }).sort(function(a, b) { return a.score - b.score; }).map(function(row, i, arr) {
        row.pri = gapPriority(row.score, { weakest: i === 0 });
        return row;
    });
}

function gapTableHtml(model, limit) {
    var rows = aggregatedGapRows(model && model.gaps).filter(function(r) {
        return r.gap != null && r.gap > 0;
    });
    if (!rows.length) {
        rows = dirGapRows(model && model.dirAgg).filter(function(r) {
            return r.gap != null && r.gap > 0;
        });
    }
    rows = rows.slice(0, limit || 6);
    if (!rows.length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<div class="nk303-table-wrap nk303-table-wrap--fit"><table class="nk303-table nk303-table--fit"><thead><tr>'
        + '<th>Göstərici</th><th>Cari bal</th><th>Hədəf</th><th>Boşluq</th><th>Prioritet</th>'
        + '</tr></thead><tbody>'
        + rows.map(function(r) {
            var hit = r.dirId ? ' onclick="nk303Call(\'openDir\',\'' + r.dirId + '\')"' : '';
            return '<tr' + hit + '>'
                + '<td class="q">' + esc(r.name) + '</td>'
                + '<td class="num">' + esc(r.score == null ? '—' : fmt1(r.score)) + '</td>'
                + '<td class="num">' + esc(r.target == null ? '—' : fmt1(r.target)) + '</td>'
                + '<td class="num is-gap">' + esc(r.gap == null ? '—' : fmt1(r.gap)) + '</td>'
                + '<td><span class="nk303-pri is-' + r.pri.id + '">' + esc(r.pri.label) + '</span></td>'
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
}

function actionPreviewHtml(model) {
    var dirs = dirGapRows(model.dirAgg);
    if (!dirs.length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<div class="nk303-actions-grid">'
        + dirs.map(function(d, i) {
            var now = d.score == null ? 0 : Math.max(0, Math.min(100, d.score));
            var goal = d.target == null ? null : Math.max(0, Math.min(100, d.target));
            var hit = d.dirId ? ' onclick="nk303Call(\'openDir\',\'' + d.dirId + '\')"' : '';
            return '<article class="nk303-action is-tone-' + (i % 3) + '"' + hit + '>'
                + '<header class="nk303-action-head">'
                + '<span class="nk303-action-rank">' + pad2(i + 1) + '</span>'
                + '<div class="nk303-action-title">'
                + '<b>' + esc(d.name) + '</b>'
                + '<span class="nk303-pri is-' + d.pri.id + '">' + esc(d.pri.label) + '</span>'
                + '</div></header>'
                + '<div class="nk303-action-metrics">'
                + '<span>Cari <b>' + esc(d.score == null ? '—' : fmt1(d.score)) + '</b></span>'
                + '<span>Hədəf <b>' + esc(d.target == null ? '—' : fmt1(d.target)) + '</b></span>'
                + '<span class="is-gap">Boşluq <b>' + esc(d.gap == null ? '—' : fmt1(d.gap)) + '</b></span>'
                + '</div>'
                + '<div class="nk303-action-bar" aria-hidden="true">'
                + '<i style="width:' + now + '%;background:' + barColor(d.score) + '"></i>'
                + (goal == null ? '' : '<em style="left:' + goal + '%"></em>')
                + '</div>'
                + '<p>' + esc(recommendAction(d.dirId, d.score, model, d.name)) + '</p>'
                + '</article>';
        }).join('')
        + '</div>';
}

function dirCompareRows(dirAgg) {
    return DIRS.map(function(d) {
        var row = (dirAgg || []).filter(function(x) { return x.id === d.id; })[0];
        var now = row && row.avg != null ? row.avg : null;
        return {
            id: d.id,
            name: d.name,
            short: dirShort(d),
            now: now,
            target: maturityTarget(now)
        };
    });
}

function critCompareRows(critAgg) {
    return (critAgg || []).map(function(d) {
        return {
            id: d.id,
            dirId: d.dirId,
            name: d.name,
            short: d.short || d.name,
            now: d.avg != null ? d.avg : null,
            target: maturityTarget(d.avg)
        };
    });
}

function compareChartRows(model) {
    var crits = critCompareRows(model && model.critAgg);
    if (crits.some(function(d) { return d.now != null; })) return crits;
    return dirCompareRows(model && model.dirAgg);
}

function radarCompareHtml(model) {
    var now = model.countryAvg;
    var goal = maturityTarget(now);
    var gap = now != null && goal != null ? Math.max(0, goal - now) : null;
    var nowCol = barColor(now);
    var goalCol = barColor(goal);
    var rows = compareChartRows(model);
    var useCrit = rows.length > 4;
    var tiles = rows.map(function(d) {
        var met = d.now != null && d.target != null && d.now >= d.target;
        var col = barColor(d.now);
        return '<article class="nk303-dir-tile' + (useCrit ? ' is-row' : '') + (met ? ' is-met' : '') + '" title="' + esc(d.name || d.short) + '">'
            + '<span>' + esc(useCrit ? (d.name || d.short) : d.short) + '</span>'
            + '<b' + (d.now == null ? ' class="is-empty"' : ' style="color:' + col + '"') + '>' + esc(fmtScore(d.now)) + '</b>'
            + '<em>' + (useCrit ? esc(fmtScore(d.target)) : ('Hədəf: ' + esc(fmtScore(d.target)))) + '</em>'
            + '</article>';
    }).join('');
    return '<section class="nk303-card nk303-card--compare">'
        + '<div class="nk303-compare-head">'
        + '<div>'
        + '<p class="nk303-kicker">' + (useCrit ? 'Qiymətləndirmə meyarları' : 'Rəqəmsallaşma istiqamətləri') + '</p>'
        + '<h3>Hədəf olunan və Mövcud vəziyyət</h3>'
        + '</div>'
        + compareLegendHtml(nowCol, goalCol)
        + '</div>'
        + '<div class="nk303-compare-grid">'
        + '<div class="nk303-compare-side">'
        + '<p class="nk303-compare-side-label">Ölkə üzrə ümumi nəticə</p>'
        + '<article class="nk303-compare-stat">'
        + '<span>Mövcud vəziyyət</span>'
        + '<b' + (now == null ? ' class="is-empty"' : ' style="color:' + nowCol + '"') + '>' + esc(fmtScore(now)) + '</b>'
        + '</article>'
        + '<article class="nk303-compare-stat is-goal">'
        + '<span>Hədəf olunan</span>'
        + '<b' + (goal == null ? ' class="is-empty"' : ' style="color:' + goalCol + '"') + '>' + esc(fmtScore(goal)) + '</b>'
        + '</article>'
        + '<article class="nk303-compare-stat is-gap">'
        + '<span>Fərq</span>'
        + '<b' + (gap == null ? ' class="is-empty"' : '') + '>' + esc(fmtScore(gap)) + '</b>'
        + '</article>'
        + '</div>'
        + '<div class="nk303-chart nk303-chart--compare nk303-chart--spider"><canvas id="nkRadarChart" aria-label="Qiymətləndirmə meyarları üzrə spider chart"></canvas></div>'
        + '</div>'
        + '<div class="nk303-dir-tiles' + (useCrit ? ' nk303-dir-tiles--crit' : '') + '">' + tiles + '</div>'
        + '</section>';
}

function countryBody(model) {
    var done = model.byVis.done || 0;
    var total = model.orgs.length;
    var donePct = pct(done, total);
    var visPick = visStatusPick();
    var legend = '<ul class="nk303-status-legend">'
        + VIS_STATUS.filter(function(s) { return !visPick || s.id === visPick; }).map(function(s) {
            var n = model.byVis[s.id] || 0;
            var on = visPick === s.id;
            return '<li class="is-click' + (on ? ' is-on' : '') + '" onclick="nk303Call(\'statusList\',\'' + s.id + '\')">'
                + '<i style="background:' + VIS_COLORS[s.id] + '"></i>'
                + '<span>' + esc(s.label) + '</span>'
                + '<b>' + n + '</b>'
                + '<em>' + (total ? pct(n, total) + '%' : '0%') + '</em>'
                + '</li>';
        }).join('')
        + '</ul>';
    var highRows = highPriorityGaps(model.gaps);
    return countryKpis(model)
        + '<div class="nk303-mid nk303-mid--hero">'
        + '<section class="nk303-card nk303-card--gauge"><h3>Ölkənin rəqəmsal yetkinlik səviyyəsi</h3>'
        + gaugeHtml(model.countryAvg)
        + '</section>'
        + radarCompareHtml(model)
        + '</div>'
        + '<div class="nk303-mid nk303-mid--insight">'
        + '<section class="nk303-card nk303-card--status"><h3>Qiymətləndirmələrin icra vəziyyəti</h3>'
        + '<div class="nk303-chart nk303-chart--donut"><canvas id="nkDonutChart"></canvas></div>'
        + legend
        + '<div class="nk303-complete is-click" onclick="nk303Call(\'statusList\',\'done\')" title="Tamamlanmış qiymətləndirmələrə bax">'
        + '<div class="nk303-complete-top"><span>Tamamlanma faizi</span><b>' + donePct + '%</b></div>'
        + '<div class="nk303-mini-bar is-green"><i style="width:' + donePct + '%"></i></div>'
        + '</div></section>'
        + trendChartHtml(model)
        + '</div>'
        + '<section class="nk303-card nk303-card--orgs"><h3>Qurumlar üzrə rəqəmsal yetkinlik</h3>'
        + orgTableHtml(model, visStatusPick()
            ? (model.rankedOrgs || []).filter(function(o) { return o.visId === visStatusPick(); })
            : model.rankedOrgs)
        + '</section>'
        + '<section class="nk303-card nk303-card--gaps"><h3>Əsas rəqəmsallaşma boşluqları</h3>'
        + (highRows.length
            ? highGapsTableHtml(highRows, false)
                + '<p class="nk303-hint">'
                + (highRows.length > 8
                    ? '<button type="button" class="nk303-link" onclick="nk303Call(\'highGaps\')">Bütün yüksək prioritetli boşluqlara bax (' + highRows.length + ')</button>'
                    : 'Sətirə klikləyib qurumun boşluğuna baxın.')
                + '</p>'
            : gapTableHtml(model, 8))
        + '</section>'
        + '<section class="nk303-card nk303-card--actions"><h3>Prioritet inkişaf istiqamətləri</h3>'
        + actionPreviewHtml(model)
        + '</section>';
}

function extrasForDir(org, dirId) {
    var extras = (org && org.extras) || [];
    if (!dirId) return extras.filter(function(e) { return !e.dirId; });
    return extras.filter(function(e) { return e.dirId === dirId; });
}

function extraKey(e) {
    return [e.dirId || '', e.criterion || '', e.sub || e.title || ''].join('|');
}

function extraLabel(e, dirName) {
    var seen = {};
    var parts = [];
    function add(v) {
        v = String(v || '').trim();
        if (!v) return;
        var k = fold(v);
        if (seen[k]) return;
        seen[k] = true;
        parts.push(v);
    }
    add(dirName);
    add(e.criterion);
    add(e.sub);
    add(e.title);
    return parts.join(' → ');
}

function extraCapTitle(e) {
    return String(e.sub || e.title || e.criterion || 'Altmeyar').trim();
}

function groupExtras(items) {
    var groups = [];
    var map = {};
    (items || []).forEach(function(e) {
        var name = String(e.criterion || '').trim();
        if (!name) {
            groups.push({ name: '', items: [e], score: e.score });
            return;
        }
        if (!map[name]) {
            map[name] = { name: name, items: [], score: null };
            groups.push(map[name]);
        }
        map[name].items.push(e);
    });
    groups.forEach(function(g) {
        g.score = avg(g.items.map(function(e) { return e.score; }));
    });
    return groups;
}

function extrasMeta(org, dirId) {
    var items = extrasForDir(org, dirId);
    var domains = {};
    var caps = 0;
    items.forEach(function(e) {
        if (e.criterion) domains[e.criterion] = true;
        if (e.sub) caps += 1;
    });
    return {
        items: items,
        domainN: Object.keys(domains).length,
        capN: caps
    };
}

function jiraBrowseUrl(key) {
    if (!key) return '';
    var base = (state.currentBaseUrl || '').replace(/\/+$/, '');
    if (!base) {
        var el = document.getElementById('baseUrl');
        base = el && el.value ? String(el.value).replace(/\/+$/, '') : '';
    }
    if (!base) base = 'https://jira.idda.az';
    return base + '/browse/' + encodeURIComponent(key);
}

function issueLinkHtml(key) {
    if (!key) return '<span>—</span>';
    return '<a class="nk303-issue" href="' + esc(jiraBrowseUrl(key))
        + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" title="Jira-da aç">'
        + esc(key) + '</a>';
}

function teqdimatBtnHtml(key) {
    if (!key) return '';
    return '<button type="button" class="nk303-btn nk303-btn--ghost nk303-teq-open" onclick="event.stopPropagation(); nk303Call(\'openTeqdimat\',\''
        + qarg(key) + '\')" title="Jira-dakı Təqdimat faylını göstər">Təqdimat</button>';
}

var teqdimatState = { key: '', blobUrl: '', loading: false, pptxViewer: null };

function isPresentationFilename(name) {
    var lower = String(name || '').toLowerCase();
    return /\.(pdf|pptx?|pptm)$/i.test(lower);
}

function isTeqdimatFilename(name) {
    if (!isPresentationFilename(name)) return false;
    var folded = fold(name);
    return /teqdimat|teqdim|presentation|prezentasiya|prezent/.test(folded);
}

function pickTeqdimatAttachments(rawList) {
    var all = (rawList || []).filter(function(a) {
        return a && a.id && a.filename;
    }).map(function(a) {
        return {
            id: String(a.id),
            filename: String(a.filename || ''),
            mimeType: String(a.mimeType || ''),
            size: a.size || 0,
            created: a.created || '',
            content: String(a.content || '')
        };
    });
    var named = all.filter(function(a) { return isTeqdimatFilename(a.filename); });
    if (named.length) return named;
    return all.filter(function(a) { return isPresentationFilename(a.filename); });
}

async function fetchIssueAttachmentList(key) {
    var safeKey = String(key || '').replace(/"/g, '').trim();
    if (!safeKey) throw new Error('Tapşırıq açarı yoxdur');

    // 1) Dashboard ilə eyni proxy — ən etibarlı yol
    var jiraRes = await apiFetch('/api/jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jql: 'key = "' + safeKey + '"',
            fields: 'attachment,summary',
            projectKey: (document.getElementById('projectKey') || {}).value || 'DGD'
        })
    });
    var jiraText = await jiraRes.text();
    var jiraData = {};
    try { jiraData = JSON.parse(jiraText); } catch (e1) { jiraData = {}; }
    if (jiraRes.ok) {
        var issue = ((jiraData.issues || [])[0]) || null;
        var raw = (issue && issue.fields && issue.fields.attachment) || [];
        return {
            key: safeKey,
            attachments: pickTeqdimatAttachments(raw),
            totalOnIssue: raw.length
        };
    }

    // 2) Xüsusi attachments endpoint (köməkçi)
    var listRes = await apiFetch('/api/jira/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: safeKey, teqdimatOnly: true })
    });
    var listData = await listRes.json().catch(function() { return {}; });
    if (listRes.ok) {
        return {
            key: safeKey,
            attachments: listData.attachments || [],
            totalOnIssue: listData.totalOnIssue || 0
        };
    }

    var msg = (jiraData && jiraData.error)
        || (listData && listData.error)
        || ('Əlavələr alınmadı (HTTP ' + (jiraRes.status || listRes.status || '?') + ')');
    throw new Error(msg);
}

function destroyTeqdimatPptxViewer() {
    if (teqdimatState.pptxViewer && typeof teqdimatState.pptxViewer.destroy === 'function') {
        try { teqdimatState.pptxViewer.destroy(); } catch (e) {}
    }
    teqdimatState.pptxViewer = null;
}

function closeTeqdimatModal() {
    var overlay = document.getElementById('nk303TeqdimatOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.hidden = true;
    }
    document.body.classList.remove('nk303-teq-open');
    destroyTeqdimatPptxViewer();
    if (teqdimatState.blobUrl) {
        try { URL.revokeObjectURL(teqdimatState.blobUrl); } catch (e) {}
        teqdimatState.blobUrl = '';
    }
    teqdimatState.key = '';
    teqdimatState.loading = false;
    var body = document.getElementById('nk303TeqdimatBody');
    if (body) body.innerHTML = '';
    var dl = document.getElementById('nk303TeqdimatDownload');
    if (dl) {
        dl.classList.add('hidden');
        dl.removeAttribute('href');
    }
}

function findExqHubOrgRow(payload) {
    var want = String(darg(payload || '') || '').trim();
    if (!want) return null;
    var view = currentHubView();
    if (!view || view.section !== 'exq') return null;
    var list = collapseExqHubRows(view.rows || [], true);
    var wantFold = fold(want);
    var i;
    for (i = 0; i < list.length; i++) {
        var r = list[i];
        if (!r) continue;
        if (r.key && r.key === want) return r;
        if (fold(r.qurum) === wantFold) return r;
    }
    return null;
}

function openExqStagesPopup(payload) {
    var row = findExqHubOrgRow(payload);
    var overlay = document.getElementById('nk303ExqStageOverlay');
    var body = document.getElementById('nk303ExqStageBody');
    var titleEl = document.getElementById('nk303ExqStageTitle');
    var metaEl = document.getElementById('nk303ExqStageMeta');
    if (!overlay || !body) return;
    if (!row) {
        body.innerHTML = '<p class="svc-digit-kpi-sub">Qurum tapılmadı.</p>';
    } else {
        if (titleEl) titleEl.textContent = row.qurum || 'Qurum';
        if (metaEl) {
            var bits = [];
            if (row.year) bits.push('İl: ' + row.year);
            if (row.svc != null) bits.push('Xidmət: ' + row.svc);
            if (row.score != null && isFinite(Number(row.score))) bits.push('Yekun: ' + fmt1(row.score) + '%');
            var star = exqStarOfRow(row);
            if (star) bits.push(exqStarLabel(star));
            metaEl.textContent = bits.join(' · ');
        }
        body.innerHTML = '<div class="svc-digit">' + exqOrgStagesPanelHtml(row.exqStages || {}, {
            title: 'Meyarlar üzrə nəticə və hədəf',
            hint: 'Şaquli xətt hədəfi göstərir · qırmızı rəqəm hədəfdən geriliyi bildirir'
        }) + '</div>';
    }
    overlay.classList.remove('hidden');
    overlay.hidden = false;
    document.body.classList.add('nk303-exq-stage-open');
}

function closeExqStagesPopup() {
    var overlay = document.getElementById('nk303ExqStageOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.hidden = true;
    }
    document.body.classList.remove('nk303-exq-stage-open');
    var body = document.getElementById('nk303ExqStageBody');
    if (body) body.innerHTML = '';
}

function formatFileSize(n) {
    var b = Number(n) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function isPdfAttachment(att) {
    var name = String((att && att.filename) || '').toLowerCase();
    var mime = String((att && att.mimeType) || '').toLowerCase();
    return name.endsWith('.pdf') || mime.indexOf('pdf') !== -1;
}

function isPptAttachment(att) {
    var name = String((att && att.filename) || '').toLowerCase();
    var mime = String((att && att.mimeType) || '').toLowerCase();
    return /\.pptx?$|\.pptm$/i.test(name) || mime.indexOf('presentation') !== -1 || mime.indexOf('powerpoint') !== -1;
}

function isModernPptx(att) {
    var name = String((att && att.filename) || '').toLowerCase();
    return /\.pptx$/i.test(name) || /\.pptm$/i.test(name);
}

function pptxDownloadActionsHtml(att, dlUrl, fileUrl) {
    return '<div class="nk303-teq-ppt-actions">'
        + '<a class="nk303-btn nk303-btn--primary" href="' + dlUrl + '" download="' + esc(att.filename || 'teqdimat') + '">Faylı yüklə</a>'
        + '<a class="nk303-btn nk303-btn--ghost" href="' + fileUrl + '" target="_blank" rel="noopener noreferrer">Yeni tabda aç</a>'
        + '</div>';
}

async function renderPptxPreview(blob, body, att, dlUrl, fileUrl) {
    destroyTeqdimatPptxViewer();
    body.innerHTML = '<div class="nk303-teq-pptx">'
        + '<div class="nk303-teq-pptx-bar">'
        + '<span class="nk303-teq-pptx-bar-name">' + esc(att.filename || 'Təqdimat') + '</span>'
        + pptxDownloadActionsHtml(att, dlUrl, fileUrl)
        + '</div>'
        + '<div class="nk303-teq-pptx-stage"><div id="nk303TeqPptxHost" class="nk303-teq-pptx-host">'
        + '<div class="nk303-teq-loading"><span class="nk303-teq-spinner" aria-hidden="true"></span><p>Slaydlar hazırlanır…</p></div>'
        + '</div></div></div>';
    var host = document.getElementById('nk303TeqPptxHost');
    if (!host) return;
    try {
        var mod = await import('https://esm.sh/pptx-preview@1.0.5');
        var initFn = mod.init || (mod.default && mod.default.init) || mod.default;
        if (typeof initFn !== 'function') throw new Error('pptx-preview yüklənmədi');
        host.innerHTML = '';
        var width = Math.max(640, Math.min(host.clientWidth || 960, 1100));
        var height = Math.max(360, Math.round(width * 0.5625));
        var viewer = initFn(host, { width: width, height: height });
        teqdimatState.pptxViewer = viewer;
        var buf = await blob.arrayBuffer();
        if (viewer && typeof viewer.preview === 'function') {
            await viewer.preview(buf);
        } else {
            throw new Error('preview metodu yoxdur');
        }
    } catch (err) {
        console.error(err);
        body.innerHTML = '<div class="nk303-teq-ppt"><div class="nk303-teq-ppt-card">'
            + '<p class="nk303-teq-ppt-name">' + esc(att.filename || 'Təqdimat') + '</p>'
            + '<p class="nk303-hint">PPTX önizləmə açıla bilmədi. Faylı yükləyib PowerPoint-də açın.</p>'
            + pptxDownloadActionsHtml(att, dlUrl, fileUrl)
            + '</div></div>';
        showToast('PPTX önizləmə alınmadı — faylı yükləyin', 'info');
    }
}

async function openTeqdimatModal(issueKey) {
    var key = String(issueKey || '').trim();
    if (!key) {
        showToast('Tapşırıq açarı yoxdur.', 'error');
        return;
    }
    closeTeqdimatModal();
    teqdimatState.key = key;
    teqdimatState.loading = true;
    var overlay = document.getElementById('nk303TeqdimatOverlay');
    var titleEl = document.getElementById('nk303TeqdimatTitle');
    var metaEl = document.getElementById('nk303TeqdimatMeta');
    var body = document.getElementById('nk303TeqdimatBody');
    var dl = document.getElementById('nk303TeqdimatDownload');
    if (!overlay || !body) return;
    if (titleEl) titleEl.textContent = 'Təqdimat';
    if (metaEl) metaEl.textContent = key + ' · Jira əlavələri yoxlanılır…';
    body.innerHTML = '<div class="nk303-teq-loading"><span class="nk303-teq-spinner" aria-hidden="true"></span><p>Təqdimat axtarılır…</p></div>';
    overlay.classList.remove('hidden');
    overlay.hidden = false;
    document.body.classList.add('nk303-teq-open');
    try {
        var listData = await fetchIssueAttachmentList(key);
        var atts = (listData && listData.attachments) || [];
        if (!atts.length) {
            body.innerHTML = '<div class="nk303-teq-empty"><p><b>Təqdimat tapılmadı</b></p>'
                + '<p class="nk303-hint">Bu tapşırığın Jira Attachments hissəsində PDF/PPTX təqdimat yoxdur'
                + (listData.totalOnIssue ? ' (ümumi əlavə: ' + listData.totalOnIssue + ')' : '')
                + '.</p>'
                + '<a class="nk303-issue" href="' + esc(jiraBrowseUrl(key)) + '" target="_blank" rel="noopener noreferrer">Jira-da aç: '
                + esc(key) + '</a></div>';
            if (metaEl) metaEl.textContent = key;
            return;
        }
        await showTeqdimatAttachment(key, atts, atts[0], body, titleEl, metaEl, dl);
    } catch (err) {
        body.innerHTML = '<div class="nk303-teq-empty"><p><b>Təqdimat açıla bilmədi</b></p>'
            + '<p class="nk303-hint">' + esc(err && err.message ? err.message : String(err)) + '</p>'
            + '<a class="nk303-issue" href="' + esc(jiraBrowseUrl(key)) + '" target="_blank" rel="noopener noreferrer">Jira-da aç: '
            + esc(key) + '</a></div>';
        showToast(err && err.message ? err.message : 'Təqdimat açıla bilmədi', 'error');
    } finally {
        teqdimatState.loading = false;
    }
}

async function showTeqdimatAttachment(key, atts, att, body, titleEl, metaEl, dl) {
    if (!att) return;
    if (titleEl) titleEl.textContent = att.filename || 'Təqdimat';
    if (metaEl) {
        metaEl.textContent = key
            + (atts.length > 1 ? ' · ' + atts.length + ' fayl' : '')
            + (att.size ? ' · ' + formatFileSize(att.size) : '');
    }
    var fileUrl = '/api/jira/attachment/' + encodeURIComponent(att.id)
        + '?key=' + encodeURIComponent(key);
    body.innerHTML = '<div class="nk303-teq-loading"><span class="nk303-teq-spinner" aria-hidden="true"></span><p>Fayl yüklənir…</p></div>';
    // POST — bir neçə köhnə Flask prosesi GET route-u bilməyə bilər; content URL də göndərilir
    var fileRes = await apiFetch('/api/jira/attachments/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: att.id,
            key: key,
            content: att.content || '',
            filename: att.filename || ''
        })
    });
    if (!fileRes.ok) {
        // Köhnə serverlərdə POST yoxdursa GET-ə düş
        if (fileRes.status === 404 || fileRes.status === 405) {
            fileRes = await apiFetch(fileUrl, { method: 'GET' });
        }
    }
    if (!fileRes.ok) {
        var errData = await fileRes.json().catch(function() { return {}; });
        var errMsg = (errData && errData.error) || ('Fayl yüklənmədi (HTTP ' + fileRes.status + ')');
        var browse = jiraBrowseUrl(key);
        body.innerHTML = '<div class="nk303-teq-empty"><p><b>Fayl proxy ilə açıla bilmədi</b></p>'
            + '<p class="nk303-hint">' + esc(errMsg) + '</p>'
            + '<p class="nk303-teq-ppt-name">' + esc(att.filename || 'Təqdimat') + '</p>'
            + '<div class="nk303-teq-ppt-actions">'
            + '<a class="nk303-btn nk303-btn--primary" href="' + esc(browse) + '" target="_blank" rel="noopener noreferrer">Jira-da aç</a>'
            + '</div></div>';
        showToast(errMsg, 'error');
        return;
    }
    var blob = await fileRes.blob();
    if (teqdimatState.blobUrl) {
        try { URL.revokeObjectURL(teqdimatState.blobUrl); } catch (e2) {}
    }
    teqdimatState.blobUrl = URL.createObjectURL(blob);
    var dlUrl = fileUrl + (fileUrl.indexOf('?') >= 0 ? '&' : '?') + 'download=1';
    if (dl) {
        dl.href = teqdimatState.blobUrl;
        dl.setAttribute('download', att.filename || 'teqdimat');
        dl.classList.remove('hidden');
    }
    if (isPdfAttachment(att)) {
        body.innerHTML = '<iframe class="nk303-teq-frame" title="' + esc(att.filename || 'Təqdimat')
            + '" src="' + teqdimatState.blobUrl + '#view=FitH"></iframe>';
    } else if (isModernPptx(att)) {
        await renderPptxPreview(blob, body, att, dlUrl, fileUrl);
    } else if (isPptAttachment(att)) {
        body.innerHTML = '<div class="nk303-teq-ppt">'
            + '<div class="nk303-teq-ppt-card">'
            + '<p class="nk303-teq-ppt-name">' + esc(att.filename || 'Təqdimat') + '</p>'
            + '<p class="nk303-hint">Köhnə .ppt formatı brauzerdə açılmır. Faylı yükləyib PowerPoint-də açın.</p>'
            + pptxDownloadActionsHtml(att, dlUrl, fileUrl)
            + '</div></div>';
    } else {
        body.innerHTML = '<div class="nk303-teq-empty"><p>' + esc(att.filename || 'Fayl') + '</p>'
            + '<a class="nk303-btn nk303-btn--primary" href="' + dlUrl + '" download>Yüklə</a></div>';
    }
    if (atts.length > 1) {
        var chips = atts.map(function(a, i) {
            return '<button type="button" class="nk303-teq-chip' + (String(a.id) === String(att.id) ? ' is-on' : '')
                + '" onclick="nk303Call(\'pickTeqdimat\',\'' + qarg(key + '|' + a.id) + '\')">'
                + esc(a.filename || ('Fayl ' + (i + 1))) + '</button>';
        }).join('');
        body.insertAdjacentHTML('afterbegin', '<div class="nk303-teq-chips">' + chips + '</div>');
    }
}

async function openTeqdimatById(issueKey, attId) {
    var key = String(issueKey || '').trim();
    var id = String(attId || '').trim();
    if (!key || !id) return;
    var body = document.getElementById('nk303TeqdimatBody');
    var titleEl = document.getElementById('nk303TeqdimatTitle');
    var metaEl = document.getElementById('nk303TeqdimatMeta');
    var dl = document.getElementById('nk303TeqdimatDownload');
    if (!body) return;
    body.innerHTML = '<div class="nk303-teq-loading"><span class="nk303-teq-spinner" aria-hidden="true"></span><p>Fayl açılır…</p></div>';
    try {
        var listData = await fetchIssueAttachmentList(key);
        var atts = (listData && listData.attachments) || [];
        var att = atts.filter(function(a) { return String(a.id) === id; })[0]
            || { id: id, filename: 'Təqdimat' };
        await showTeqdimatAttachment(key, atts.length ? atts : [att], att, body, titleEl, metaEl, dl);
    } catch (err) {
        body.innerHTML = '<div class="nk303-teq-empty"><p>' + esc(err && err.message ? err.message : String(err)) + '</p></div>';
    }
}

function processHtml(org) {
    var idx = org.processIdx == null ? 0 : org.processIdx;
    var last = PROCESS.length - 1;
    var finished = org.statusGroup === 'done' && idx >= last;
    var currentName = PROCESS[Math.min(Math.max(idx, 0), last)];
    var nowLabel = finished ? 'Diaqnostika tamamlanıb' : ('Cari mərhələ: ' + currentName);
    var href = org.issueKey ? jiraBrowseUrl(org.issueKey) : '';
    return '<div class="nk303-roadmap">'
        + '<div class="nk303-roadmap-head">'
        + '<div><h4>Diaqnostika mərhələləri</h4>'
        + '<p class="nk303-roadmap-now' + (finished ? ' is-done' : '') + '">' + esc(nowLabel) + '</p></div>'
        + '</div>'
        + '<div class="nk303-road-wrap">'
        + '<ol class="nk303-road" aria-label="Qərar 303, bənd 3.1 üzrə diaqnostika mərhələləri">'
        + PROCESS.map(function(name, i) {
            var done = finished || i < idx;
            var on = !finished && i === idx;
            var cls = done ? ' is-done' : (on ? ' is-on' : '');
            var stepState = done ? 'Tamamlanıb' : (on ? 'Cari mərhələ' : 'Gözlənilir');
            var inner = '<span class="nk303-road-node" aria-hidden="true">' + (done ? '✓' : String(i + 1)) + '</span>'
                + '<span class="nk303-road-label">' + esc(name) + '</span>'
                + '<span class="nk303-road-state">' + esc(stepState) + '</span>';
            if (href) {
                return '<li class="' + cls.trim() + '">'
                    + '<a class="nk303-road-hit" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'
                    + inner + '</a></li>';
            }
            return '<li class="' + cls.trim() + '">' + inner + '</li>';
        }).join('')
        + '</ol></div>'
        + '<p class="nk303-hint">Yerində baxış: hesabat hazırlanması istisna olmaqla bütün alt görüşlər Done olduqda tamamlanır. Status: '
        + esc(org.statusName) + ' (' + esc(org.visLabel) + ').</p>'
        + '</div>';
}

function criterionItemHtml(e) {
    var open = ui.expandCrit === extraKey(e);
    var state = officialState(e.score);
    var title = extraCapTitle(e);
    return '<button type="button" class="nk303-crit" onclick="nk303Call(\'crit\',\'' + qarg(extraKey(e)) + '\')">'
        + '<span><b>' + esc(title) + '</b>'
        + (e.score != null ? '<div class="nk303-hint" style="margin:0.15rem 0 0">Qiymətləndirmə: ' + esc(fmt(e.score))
            + (state ? ' · rəsmi vəziyyət ' + state : '') + '</div>' : '')
        + '</span>' + matBadge(e.score)
        + '</button>'
        + (open ? '<div class="nk303-sub">'
            + (e.criterion ? '<div class="lb">Meyar</div><p>' + esc(e.criterion) + '</p>' : '')
            + '<div class="lb">Altmeyar</div><p>' + esc(e.sub || title) + '</p>'
            + '<div class="lb">Qiymətləndirmə</div><p>' + esc(e.score != null ? fmt(e.score) : NA) + '</p>'
            + '<div class="lb">Cari vəziyyət</div><p>' + esc(e.current || e.text || NA) + '</p>'
            + '<div class="lb">Çatışmazlıq</div><p>' + esc(e.deficiency || (e.text && looksLikeFinding(e.text) ? e.text : (e.score != null && e.score < 50 ? (e.text || NA) : NA))) + '</p>'
            + '<div class="lb">Diaqnostika nəticəsi</div><p>' + esc(state || (e.scoreRaw || NA)) + '</p>'
            + '</div>' : '');
}

function criterionBlock(org, dirId) {
    var items = extrasForDir(org, dirId);
    if (!items.length) {
        var txt = org.dirTexts && org.dirTexts[dirId];
        if (!txt) return '';
        return '<div class="nk303-sub"><div class="lb">Cari vəziyyət</div><p>' + esc(txt) + '</p></div>';
    }
    var groups = groupExtras(items);
    var hasDomains = groups.some(function(g) { return g.name; });
    if (!hasDomains) {
        return items.map(criterionItemHtml).join('');
    }
    return groups.map(function(g) {
        if (!g.name) return g.items.map(criterionItemHtml).join('');
        return '<div class="nk303-domain">'
            + '<div class="nk303-domain-h">'
            + '<span><em>Meyar</em><b>' + esc(g.name) + '</b></span>'
            + (g.score != null ? '<span class="nk303-domain-sc">' + esc(fmt1(g.score)) + '</span>' : '')
            + matBadge(g.score)
            + '</div>'
            + g.items.map(criterionItemHtml).join('')
            + '</div>';
    }).join('');
}

function dirExpandPanelHtml(org) {
    var d = DIRS.filter(function(x) { return x.id === ui.expandDir; })[0];
    if (!d || !org || !dirHasDetail(org, d.id)) return '';
    var crits = extrasForDir(org, d.id);
    var meta = extrasMeta(org, d.id);
    var weak = crits.filter(function(e) { return e.score != null && e.score < 50; });
    var hint = [];
    if (meta.domainN) hint.push('Meyar sayı: ' + meta.domainN);
    else if (crits.length) hint.push('Meyar sayı: ' + crits.length);
    if (meta.capN) hint.push('Altmeyar sayı: ' + meta.capN);
    if (weak.length) hint.push('zəif sahələr: ' + weak.length);
    var block = criterionBlock(org, d.id);
    return '<div class="nk303-acc-body" style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid #eee8f6">'
        + '<p class="nk303-hint"><b>' + esc(d.name) + '</b>' + (hint.length ? ' · ' + hint.join(' · ') : '') + '</p>'
        + (org.dirTexts[d.id] ? '<div class="nk303-sub"><div class="lb">Cari vəziyyət</div><p>' + esc(org.dirTexts[d.id]) + '</p></div>' : '')
        + (org.dirGaps && org.dirGaps[d.id] ? '<div class="nk303-sub"><div class="lb">Çatışmazlıq</div><p>' + esc(org.dirGaps[d.id]) + '</p></div>' : '')
        + block
        + '</div>';
}

function institutionBody(model) {
    var org = model.selected;
    if (!org) {
        return '<p class="nk303-empty">Qurum seçin.</p>' + orgTableHtml(model, model.rankedOrgs, false);
    }
    var dirCards = DIRS.map(function(d) {
        var meta = extrasMeta(org, d.id);
        return {
            id: d.id,
            name: d.name,
            avg: org.dirs[d.id],
            maturity: maturityOf(org.dirs[d.id]),
            n: meta.domainN || extrasForDir(org, d.id).length,
            hasDetail: dirHasDetail(org, d.id)
        };
    });
    return '<section class="nk303-card" style="margin-bottom:0.55rem">'
        + '<div class="nk303-profile">'
        + '<div>'
        + '<p class="nk303-kicker">Qurumun diaqnostika nəticələri</p>'
        + '<h3 style="margin:0;font-size:1.05rem">' + esc(org.name) + '</h3>'
        + '<dl class="nk303-meta">'
        + '<div><dt>Diaqnostika tarixi</dt><dd>' + esc(org.start ? fmtDate(org.start) : (org.updated ? fmtDate(org.updated) : NA)) + '</dd></div>'
        + '<div><dt>Diaqnostika statusu</dt><dd>' + esc(org.visLabel) + ' · ' + esc(org.statusName) + '</dd></div>'
        + '<div><dt>Son yenilənmə</dt><dd>' + esc(org.updated ? fmtDate(org.updated) : NA) + '</dd></div>'
        + '<div><dt>Tapşırıq</dt><dd class="nk303-meta-task">' + issueLinkHtml(org.issueKey)
        + (org.issueKey ? ' ' + teqdimatBtnHtml(org.issueKey) : '')
        + '</dd></div>'
        + '</dl></div>'
        + '<div>'
        + '<p class="nk303-hint">Qurumun rəqəmsallaşma səviyyəsi' + (org.qrsgOfficial ? '' : '') + '</p>'
        + scoreIndicator(org.qrsg)
        + '</div></div>'
        + processHtml(org)
        + '</section>'
        + '<section class="nk303-card" style="margin-bottom:0.55rem"><h3>Dörd rəsmi istiqamət</h3>'
        + dirCardsHtml(dirCards, true, 'expandDir')
        + dirExpandPanelHtml(org)
        + '</section>'
        + (org.extras.filter(function(e) { return !e.dirId; }).length
            ? '<section class="nk303-card" style="margin-top:0.55rem"><h3>Mənbə məlumatında əlavə meyarlar</h3>'
                + '<p class="nk303-hint">Bu sətirlər ayrı top-level istiqamət deyil; diaqnostika sahəsindən oxunub.</p>'
                + criterionBlock({ extras: org.extras.filter(function(e) { return !e.dirId; }), dirTexts: {} }, '')
                + '</section>'
            : '');
}

function pushFinding(arr, title, text, score) {
    text = String(text || '').trim();
    if (!text) return;
    var i;
    for (i = 0; i < arr.length; i++) {
        if (arr[i].title === title && arr[i].text === text) return;
    }
    arr.push({ title: title, text: text, score: score });
}

function collectFindingTexts(org) {
    var currents = [];
    var defs = [];
    if (!org) return { currents: currents, defs: defs };
    pushFinding(currents, 'Ümumi', org.overallCurrent, org.qrsg);
    pushFinding(defs, 'Ümumi', org.overallGaps, org.qrsg);
    DIRS.forEach(function(d) {
        pushFinding(currents, d.name, org.dirTexts && org.dirTexts[d.id], org.dirs[d.id]);
        var dg = org.dirGaps && org.dirGaps[d.id];
        if (!isClosedGap(dg)) pushFinding(defs, d.name, dg, org.dirs[d.id]);
        extrasForDir(org, d.id).forEach(function(e) {
            var label = extraLabel(e, d.name);
            var cur = e.current || (!e.deficiency ? e.text : '');
            var def = e.deficiency || (looksLikeFinding(e.text) && !e.current ? e.text : '');
            if (isClosedGap(def)) def = '';
            pushFinding(currents, label, cur, e.score);
            pushFinding(defs, label, def, e.score);
        });
    });
        extrasForDir(org, '').forEach(function(e) {
        var cur = e.current || (!e.deficiency ? e.text : '');
        var def = e.deficiency || (looksLikeFinding(e.text) && !e.current ? e.text : '');
        if (isClosedGap(def)) def = '';
        pushFinding(currents, extraLabel(e, ''), cur, e.score);
        pushFinding(defs, extraLabel(e, ''), def, e.score);
    });
    return { currents: currents, defs: defs };
}

function findingItemsHtml(items) {
    if (!items.length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<ul class="nk303-list">' + items.map(function(it) {
        return '<li><div class="t">' + esc(it.title) + '</div>'
            + (it.score != null ? '<div class="d">Nəticə: ' + esc(fmt(it.score)) + '</div>' : '')
            + '<div class="d">' + esc(it.text) + '</div></li>';
    }).join('') + '</ul>';
}

function findingsHtml(org, gaps) {
    var pack = collectFindingTexts(org);
    if (!pack.currents.length && !pack.defs.length) {
        return gapsList(gaps, false);
    }
    return '<div class="nk303-findings">'
        + '<div class="nk303-find"><h4>Cari vəziyyət</h4>' + findingItemsHtml(pack.currents) + '</div>'
        + '<div class="nk303-find"><h4>Çatışmazlıqlar</h4>' + findingItemsHtml(pack.defs) + '</div>'
        + '</div>';
}

function gapsList(gaps, showOrg) {
    if (!gaps.length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<ul class="nk303-list">' + gaps.map(function(g) {
        return '<li>'
            + '<div class="t">' + esc([g.dir, g.criterion].filter(Boolean).join(' → ') || 'İstiqamət') + '</div>'
            + (showOrg ? '<div class="d">' + esc(g.org) + '</div>' : '')
            + '<div class="d">Cari vəziyyət: ' + esc(g.current || NA) + '</div>'
            + '<div class="d">Çatışmazlıq: ' + esc(g.deficiency || NA) + '</div>'
            + (g.score != null ? '<div class="d">Nəticə: ' + esc(fmt(g.score)) + '</div>' : '')
            + '</li>';
    }).join('') + '</ul>';
}

function dirsBody(model) {
    var active = DIRS.filter(function(d) { return d.id === (ui.dirId || ui.expandDir || 'strategiya'); })[0] || DIRS[0];
    var agg = model.dirAgg.filter(function(d) { return d.id === active.id; })[0];
    var orgs = model.orgs.filter(function(o) { return o.dirs[active.id] != null; })
        .slice().sort(function(a, b) { return (b.dirs[active.id] || 0) - (a.dirs[active.id] || 0); });
    var high = orgs.slice(0, 5);
    var low = orgs.slice().reverse().slice(0, 5);
    var critMap = {};
    model.orgs.forEach(function(o) {
        extrasForDir(o, active.id).forEach(function(e) {
            if (!critMap[e.title]) critMap[e.title] = [];
            if (e.score != null) critMap[e.title].push(e.score);
        });
    });
    var crits = Object.keys(critMap).map(function(title) {
        return { title: title, avg: avg(critMap[title]), n: critMap[title].length };
    }).filter(function(c) { return c.avg != null; }).sort(function(a, b) { return b.avg - a.avg; });
    var gaps = model.gaps.filter(function(g) { return g.dirId === active.id; });
    return '<section class="nk303-card" style="margin-bottom:0.55rem"><h3>İstiqamətlər üzrə analiz</h3>'
        + '<div class="nk303-cmp">'
        + DIRS.map(function(d) {
            return '<button type="button" class="nk303-chip' + (d.id === active.id ? ' is-on' : '') + '" onclick="nk303Call(\'openDir\',\'' + d.id + '\')">'
                + esc(d.name) + '</button>';
        }).join('')
        + '</div>'
        + scoreIndicator(agg && agg.avg)
        + '<p class="nk303-hint">' + ((agg && agg.n) || 0) + ' qurum · ' + esc(active.name) + '</p>'
        + '</section>'
        + '<div class="nk303-grid2">'
        + '<section class="nk303-card"><h3>Ən yüksək nəticə</h3>'
        + (high.length ? '<ul class="nk303-list">' + high.map(function(o) {
            return '<li><div class="t">' + esc(o.name) + '</div><div class="d">' + esc(fmt(o.dirs[active.id])) + '</div></li>';
        }).join('') + '</ul>' : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section>'
        + '<section class="nk303-card"><h3>Ən aşağı nəticə</h3>'
        + (low.length ? '<ul class="nk303-list">' + low.map(function(o) {
            return '<li><div class="t">' + esc(o.name) + '</div><div class="d">' + esc(fmt(o.dirs[active.id])) + '</div></li>';
        }).join('') + '</ul>' : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section></div>'
        + '<div class="nk303-grid2">'
        + '<section class="nk303-card"><h3>Ən güclü meyarlar</h3>'
        + (crits.length ? '<ul class="nk303-list">' + crits.slice(0, 5).map(function(c) {
            return '<li><div class="t">' + esc(c.title) + '</div><div class="d">' + esc(fmt(c.avg)) + '</div></li>';
        }).join('') + '</ul>' : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section>'
        + '<section class="nk303-card"><h3>Ən zəif meyarlar</h3>'
        + (crits.length ? '<ul class="nk303-list">' + crits.slice().reverse().slice(0, 5).map(function(c) {
            return '<li><div class="t">' + esc(c.title) + '</div><div class="d">' + esc(fmt(c.avg)) + '</div></li>';
        }).join('') + '</ul>' : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section></div>'
        + '<section class="nk303-card" style="margin-top:0.55rem"><h3>Çatışmazlıqlar</h3>'
        + gapsList(gaps, true)
        + '</section>';
}

function compareBody(model) {
    var keys = Object.keys(ui.compare);
    var selected = model.orgs.filter(function(o) { return ui.compare[o.key]; });
    if (keys.length && selected.length < keys.length) {
        selected = latestByOrg(model.all).filter(function(o) { return ui.compare[o.key]; });
    }
    return '<section class="nk303-card" style="margin-bottom:0.55rem"><h3>Qurumların müqayisəsi</h3>'
        + '<p class="nk303-hint">2–5 qurum seçin. Bu analitika lövhəsi rəqabət cədvəli deyil.</p>'
        + orgTableHtml(model, model.rankedOrgs, true)
        + '</section>'
        + (selected.length >= 2
            ? '<section class="nk303-card"><h3>Müqayisə cədvəli</h3>'
                + '<div class="nk303-table-wrap"><table class="nk303-table"><thead><tr><th>Göstərici</th>'
                + selected.map(function(o) { return '<th>' + esc(o.name) + '</th>'; }).join('')
                + '</tr></thead><tbody>'
                + '<tr><td>Ümumi nəticə</td>' + selected.map(function(o) { return '<td>' + esc(o.qrsg == null ? '—' : fmt(o.qrsg)) + '</td>'; }).join('') + '</tr>'
                + '<tr><td>Səviyyə</td>' + selected.map(function(o) { return '<td>' + (o.maturity ? esc(o.maturity.label) : esc(NA)) + '</td>'; }).join('') + '</tr>'
                + DIRS.map(function(d) {
                    return '<tr><td>' + esc(d.name) + '</td>'
                        + selected.map(function(o) { return '<td>' + esc(o.dirs[d.id] == null ? '—' : fmt(o.dirs[d.id])) + '</td>'; }).join('')
                        + '</tr>';
                }).join('')
                + '<tr><td>Status</td>' + selected.map(function(o) { return '<td>' + esc(o.visLabel) + '</td>'; }).join('') + '</tr>'
                + '</tbody></table></div></section>'
            : '<p class="nk303-empty">Müqayisə üçün ən azı 2 qurum seçin.</p>');
}

function reportText(model) {
    var lines = [];
    if (ui.mode === 'institution' && model.selected) {
        var o = model.selected;
        lines.push('Qurumun rəqəmsallaşma diaqnostikası');
        lines.push('Qurum: ' + o.name);
        lines.push('Diaqnostika tarixi: ' + (o.start ? fmtDate(o.start) : (o.updated ? fmtDate(o.updated) : NA)));
        lines.push('Status: ' + o.visLabel + ' (' + o.statusName + ')');
        lines.push('Ümumi nəticə: ' + (o.qrsg == null ? NA : fmt(o.qrsg)));
        lines.push('Rəqəmsallaşma səviyyəsi: ' + (o.maturity ? o.maturity.label : NA));
        DIRS.forEach(function(d) {
            lines.push(d.name + ': ' + (o.dirs[d.id] == null ? NA : fmt(o.dirs[d.id])));
            if (o.dirTexts[d.id]) lines.push('  Cari vəziyyət: ' + o.dirTexts[d.id]);
            extrasForDir(o, d.id).forEach(function(e) {
                lines.push('  Meyar: ' + e.title + ' · ' + (e.score == null ? NA : fmt(e.score)));
                if (e.text) lines.push('    ' + e.text);
            });
        });
        return lines.join('\n');
    }
    if (ui.nav === 'dirs' || ui.dirId) {
        var d = DIRS.filter(function(x) { return x.id === (ui.dirId || 'strategiya'); })[0];
        var agg = model.dirAgg.filter(function(x) { return x.id === d.id; })[0];
        lines.push('İstiqamət hesabatı: ' + d.name);
        lines.push('Ümumiləşdirilmiş nəticə: ' + (agg && agg.avg != null ? fmt(agg.avg) : NA));
        lines.push('Qurum sayı: ' + ((agg && agg.n) || 0));
        return lines.join('\n');
    }
    lines.push('Ölkə üzrə Rəqəmsallaşma Diaqnostikası');
    lines.push('Dövr: ' + (model.periodLabel || 'Bütün illər'));
    lines.push('Qiymətləndirilmiş qurumlar: ' + model.orgs.length);
    lines.push('Ümumiləşdirilmiş göstərici: ' + (model.countryAvg == null ? NA : fmt(model.countryAvg)));
    DIRS.forEach(function(d, i) {
        var a = model.dirAgg[i];
        lines.push(d.name + ': ' + (a.avg == null ? NA : fmt(a.avg)));
    });
    model.rankedOrgs.forEach(function(o, i) {
        lines.push((i + 1) + '. ' + o.name + ' · ' + (o.qrsg == null ? '—' : fmt(o.qrsg)) + ' · ' + (o.maturity ? o.maturity.label : NA));
    });
    return lines.join('\n');
}

function reportsBody(model) {
    return '<section class="nk303-card"><h3>Hesabat</h3>'
        + '<p class="nk303-hint">Eyni filtr və məlumat modeli. Uydurma bölmə əlavə edilmir.</p>'
        + '<pre class="nk303-report">' + esc(reportText(model)) + '</pre></section>';
}

function reportKindOf(r) {
    var k = r && r.kind;
    if (k === 'isq' || k === 'exq' || k === 'diag') return k;
    return 'diag';
}

function reportKindMeta(id) {
    return REPORT_KINDS.filter(function(k) { return k.id === id; })[0] || REPORT_KINDS[0];
}

function reportsOfKind(kind) {
    return (reportStore.reports || []).filter(function(r) { return reportKindOf(r) === kind; });
}

function presentReportKinds() {
    var seen = {};
    (reportStore.reports || []).forEach(function(r) { seen[reportKindOf(r)] = true; });
    return REPORT_KINDS.filter(function(k) { return seen[k.id]; });
}

function activeReportKind() {
    var k = ui.reportKind;
    if (k === 'isq' || k === 'exq' || k === 'diag') return k;
    var byId = (reportStore.reports || []).filter(function(r) { return r.id === ui.reportId; })[0];
    if (byId) return reportKindOf(byId);
    var present = presentReportKinds();
    return present.length ? present[0].id : 'diag';
}

function visibleReports() {
    return reportsOfKind(activeReportKind());
}

function reportAxes(kind) {
    if (kind === 'isq') return ISQ_PILLARS;
    if (kind === 'exq') {
        return [1, 2, 3, 4, 5].map(function(s) {
            return { id: 'star' + s, name: s + ' ulduz', short: s + '★', star: s };
        });
    }
    return DIRS;
}

function reportAxisScore(sel, axis, kind) {
    if (!sel || !axis) return null;
    if (kind === 'exq') {
        var row = (sel.byStar || []).filter(function(b) { return Number(b.star) === axis.star; })[0];
        if (row && row.possible) return Math.round((row.collected / row.possible) * 1000) / 10;
        return null;
    }
    if (sel.dirs && sel.dirs[axis.id] != null) return sel.dirs[axis.id];
    var p = (sel.pillars || []).filter(function(x) { return x.id === axis.id; })[0];
    return p && p.score != null ? p.score : null;
}

function reportExtLabel(r) {
    var fmt = String((r && r.format) || '').toLowerCase();
    if (!fmt) {
        var n = String((r && r.name) || '').toLowerCase();
        fmt = n.indexOf('.pdf') !== -1 ? 'pdf' : 'pptx';
    }
    return fmt === 'pdf' ? 'PDF' : 'PPTX';
}

function reportPageWord(r) {
    return reportExtLabel(r) === 'PDF' ? 'səhifə' : 'slayd';
}

function reportAxisName(dirId, kind) {
    var axis = reportAxes(kind || activeReportKind()).filter(function(d) { return d.id === dirId; })[0];
    if (axis) return axis.name;
    var d = DIRS.filter(function(x) { return x.id === dirId; })[0];
    return d ? d.name : '';
}

function selectedReport() {
    var list = visibleReports();
    if (!list.length) return null;
    var id = ui.reportId;
    var found = list.filter(function(r) { return r.id === id; })[0];
    return found || list[0];
}

function reportAgg() {
    var kind = activeReportKind();
    var axes = reportAxes(kind);
    var list = visibleReports();
    var overalls = [];
    var dirMap = {};
    var targets = {};
    var findings = 0;
    var stars = [];
    axes.forEach(function(d) {
        dirMap[d.id] = [];
        targets[d.id] = [];
    });
    list.forEach(function(r) {
        if (r.overall != null) overalls.push(r.overall);
        if (r.star != null) stars.push(Number(r.star));
        axes.forEach(function(d) {
            var v = reportAxisScore(r, d, kind);
            if (v != null) dirMap[d.id].push(v);
            if (kind === 'diag' && r.targets && r.targets[d.id] != null) targets[d.id].push(r.targets[d.id]);
        });
        findings += (r.findings || []).length;
    });
    var dirAvg = {};
    var targetAvg = {};
    axes.forEach(function(d) {
        dirAvg[d.id] = avg(dirMap[d.id]);
        targetAvg[d.id] = avg(targets[d.id]);
    });
    var weak = null;
    axes.forEach(function(d) {
        if (dirAvg[d.id] == null) return;
        if (!weak || dirAvg[d.id] < weak.score) {
            weak = { id: d.id, name: d.name, short: d.short || d.name, score: dirAvg[d.id] };
        }
    });
    return {
        kind: kind,
        n: list.length,
        overall: avg(overalls),
        star: stars.length ? Math.round(avg(stars)) : exqStarFromPercent(avg(overalls)),
        dirs: dirAvg,
        targets: targetAvg,
        findings: findings,
        weak: weak,
        axes: axes
    };
}

function reportFileTitle(name) {
    return String(name || '').trim().replace(/\.(pptx?|pptm|pdf)$/i, '');
}

function reportKindsHtml() {
    var cur = activeReportKind();
    return '<nav class="nk303-rep-kinds" aria-label="Hesabat növü">' + REPORT_KINDS.map(function(k) {
        var n = reportsOfKind(k.id).length;
        return '<button type="button" class="nk303-rep-kind is-' + k.id + (cur === k.id ? ' is-on' : '') + '" onclick="nk303Call(\'reportKind\',\'' + k.id + '\')">'
            + '<i style="background:' + k.color + '"></i>'
            + '<span>' + esc(k.label) + '</span>'
            + '<b>' + n + '</b></button>';
    }).join('') + '</nav>';
}

function reportPickKindHtml() {
    if (!ui.reportPickKind) return '';
    return '<section class="nk303-card nk303-card--kindpick">'
        + '<h3>Bu hesabat hansıdır?</h3>'
        + '<p class="nk303-hint">Növü siz seçin. Sistem nəticələri buna görə çıxaracaq — avtomatik təxmin etmir.</p>'
        + '<div class="nk303-rep-kinds is-pick">' + REPORT_KINDS.map(function(k) {
            return '<button type="button" class="nk303-rep-kind is-' + k.id + '" onclick="nk303Call(\'uploadAs\',\'' + k.id + '\')">'
                + '<i style="background:' + k.color + '"></i>'
                + '<span>' + esc(k.label) + '</span></button>';
        }).join('') + '</div>'
        + '<button type="button" class="nk303-btn nk303-btn--ghost" onclick="nk303Call(\'cancelPickKind\')">Ləğv et</button>'
        + '</section>';
}

function reportFileKindHtml(fileId, kind) {
    if (!isAdmin() || !fileId) {
        var km = reportKindMeta(kind);
        return '<p class="nk303-kicker">' + esc(km.label) + '</p>';
    }
    return '<div class="nk303-rep-kinds is-file" role="group" aria-label="Hesabat növü">' + REPORT_KINDS.map(function(k) {
        return '<button type="button" class="nk303-rep-kind is-' + k.id + (kind === k.id ? ' is-on' : '') + '" onclick="nk303Call(\'setFileKind\',\'' + qarg(fileId + '|' + k.id) + '\')">'
            + '<i style="background:' + k.color + '"></i>'
            + '<span>' + esc(k.label) + '</span></button>';
    }).join('') + '</div>';
}

function reportFilesHtml() {
    var kind = activeReportKind();
    var files = isAdmin() ? (reportStore.files || []) : [];
    var reports = visibleReports();
    var chips = files.length
        ? files.filter(function(f) {
            var rec = (reportStore.reports || []).filter(function(r) { return r.id === f.id; })[0] || f;
            return reportKindOf(rec) === kind;
        })
        : reports.map(function(r) {
            return { id: r.id, name: r.name || r.org, org: r.org, kind: r.kind, format: r.format };
        });
    if (!chips.length) return '';
    return '<div class="nk303-rep-files" role="list">' + chips.map(function(f) {
        var rec = (reportStore.reports || []).filter(function(r) { return r.id === f.id; })[0] || f;
        var on = ui.reportId === f.id || (!ui.reportId && selectedReport() && selectedReport().id === f.id);
        var raw = f.name || f.org || 'Hesabat';
        var title = reportFileTitle(raw) || 'Hesabat';
        var org = f.org && f.org !== raw && f.org !== title ? f.org : '';
        var km = reportKindMeta(reportKindOf(rec));
        return '<div class="nk303-rep-file is-' + km.id + (on ? ' is-on' : '') + '" role="listitem">'
            + '<button type="button" class="nk303-rep-file-btn" onclick="nk303Call(\'pickReport\',\'' + qarg(f.id) + '\')">'
            + '<span class="nk303-rep-file-ic" aria-hidden="true">' + iconSvg('file') + '</span>'
            + '<span class="nk303-rep-file-txt">'
            + '<strong title="' + esc(title) + '">' + esc(title) + '</strong>'
            + (org ? '<em title="' + esc(org) + '">' + esc(org) + '</em>' : '')
            + '</span>'
            + '<span class="nk303-rep-file-tags">'
            + '<span class="nk303-rep-file-kind">' + esc(km.label) + '</span>'
            + '<span class="nk303-rep-file-ext">' + esc(reportExtLabel(rec)) + '</span>'
            + '</span></button>'
            + (isAdmin()
                ? '<button type="button" class="nk303-xl-del" title="Hesabatı sil" onclick="event.stopPropagation(); nk303Call(\'removeReport\',\'' + qarg(f.id) + '\')">Sil</button>'
                : '')
            + '</div>';
    }).join('') + '</div>';
}

function reportListHtml(item, cls) {
    if (!(item || []).length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    var kind = activeReportKind();
    return '<ul class="nk303-list ' + (cls || '') + '">' + item.map(function(it) {
        var name = reportAxisName(it.dirId, kind);
        return '<li><div class="t">' + esc(name || (it.slide ? (reportPageWord(selectedReport()) + ' ' + it.slide) : 'Hesabat')) + '</div>'
            + '<div class="d">' + esc(it.text) + '</div></li>';
    }).join('') + '</ul>';
}

function reportFocusHit(key) {
    return "nk303Call('reportFocus','" + esc(key) + "')";
}

function uniqueReportItems(items) {
    var seen = {};
    return (items || []).filter(function(it) {
        var key = normalizeStr(it && it.text ? it.text : '').slice(0, 90);
        if (!key || seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

function reportItemsForWeak(sel, weak) {
    if (!sel || !weak || !weak.id) return uniqueReportItems(sel && sel.findings);
    var matched = uniqueReportItems([].concat(sel.findings || [], sel.strengths || [], sel.actions || []))
        .filter(function(it) { return it.dirId === weak.id; });
    return matched.length ? matched : uniqueReportItems(sel.findings);
}

function uniqueReportSlides(slides) {
    var seen = {};
    return (slides || []).filter(function(s) {
        var title = String((s && s.title) || '').replace(/[\u000b\u000c]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!title || seen[title]) return false;
        seen[title] = true;
        return true;
    });
}

function reportFocusMeta(sel, agg) {
    var focus = ui.reportFocus || '';
    var org = (sel && (sel.org || sel.name)) || 'Qurum';
    if (focus === 'findings') {
        return {
            id: 'findings',
            title: 'Çatışmazlıqlar',
            hint: org + ' üzrə hesabatda qeyd olunan çatışmazlıqlar.',
            items: uniqueReportItems(sel && sel.findings)
        };
    }
    if (focus === 'strengths') {
        return {
            id: 'strengths',
            title: 'Güclü tərəflər',
            hint: org + ' üzrə hesabatda təsbit edilən güclü tərəflər.',
            items: uniqueReportItems(sel && sel.strengths)
        };
    }
    if (focus === 'actions') {
        return {
            id: 'actions',
            title: 'Tövsiyələr',
            hint: org + ' üzrə növbəti addımlar.',
            items: uniqueReportItems(sel && sel.actions)
        };
    }
    if (focus === 'weak' || (focus && focus.indexOf('dir:') === 0)) {
        var did = focus === 'weak' ? (agg && agg.weak && agg.weak.id) : focus.slice(4);
        var dirName = reportAxisName(did, agg && agg.kind) || ((agg && agg.weak && agg.weak.name) || 'istiqamət');
        var score = sel ? reportAxisScore(sel, (agg.axes || []).filter(function(d) { return d.id === did; })[0], agg.kind) : null;
        if (score == null && agg && agg.dirs) score = agg.dirs[did];
        var items = uniqueReportItems([].concat((sel && sel.findings) || [], (sel && sel.strengths) || [], (sel && sel.actions) || []))
            .filter(function(it) { return !did || it.dirId === did; });
        if (!items.length && focus === 'weak') items = uniqueReportItems(sel && sel.findings);
        return {
            id: focus,
            title: focus === 'weak' ? ('Zəif tərəf: ' + dirName) : dirName,
            hint: org + ' üzrə ' + dirName
                + (score != null ? ' (' + fmt1(score) + '/100)' : '') + '.',
            items: items
        };
    }
    if (focus === 'summary') {
        return {
            id: 'summary',
            title: 'Ümumi nəticə',
            hint: org + ' üzrə rəqəmsal inkişafın qısa oxunuşu.',
            items: sel && sel.summary ? [{ text: sel.summary, dirId: null }] : []
        };
    }
    return null;
}

function reportFocusPaneHtml(sel, agg) {
    var meta = reportFocusMeta(sel, agg);
    if (!meta) {
        return '<div class="nk303-rep-pane" id="nkRepFocus">'
            + '<p class="nk303-kicker">Seçilmiş nəticə</p>'
            + '<h4>Hissəni klikləyin</h4>'
            + '<p class="nk303-hint">Çatışmazlıq, güclü tərəf və ya zəif tərəfə klikləyin — qurum üzrə həmin nəticələr burada açılsın.</p>'
            + '</div>';
    }
    return '<div class="nk303-rep-pane" id="nkRepFocus">'
        + '<div class="nk303-rep-focus-head">'
        + '<div><p class="nk303-kicker">Seçilmiş nəticə</p><h4>' + esc(meta.title) + '</h4>'
        + '<p class="nk303-hint">' + esc(meta.hint) + '</p></div>'
        + '<button type="button" class="nk303-btn nk303-btn--ghost" onclick="nk303Call(\'reportFocus\',\'\')">Bağla</button>'
        + '</div>'
        + reportListHtml(meta.items)
        + '</div>';
}

function scrollReportFocus() {
    var focus = ui.reportFocus || '';
    var id = 'nkRepDonutCard';
    if (focus === 'reports') id = 'nkRepDetail';
    var el = document.getElementById(id) || document.getElementById('nkRepFocus');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function reportPageHtml() {
    var kind = activeReportKind();
    var km = reportKindMeta(kind);
    var list = visibleReports();
    var all = reportStore.reports || [];
    var agg = reportAgg();
    var sel = selectedReport();
    var useStar = kind === 'isq' || kind === 'exq';
    var uploadBtn = isAdmin()
        ? '<button type="button" class="nk303-upload" onclick="nk303Call(\'uploadReport\')">' + iconSvg('upload') + ' PPTX / PDF yüklə</button>'
        : '';
    var head = '<div class="nk303-hub-toolbar">'
        + '<div class="nk303-hub-toolbar-main">'
        + '<div class="nk303-hub-toolbar-title">'
        + '<h3>Hesabat analizi</h3>'
        + '<p class="nk303-hint">Əvvəl növü seçin, sonra PPTX və ya PDF yükləyin. Hər növ öz nəticə lövhəsində açılır.</p>'
        + '</div></div>'
        + uploadBtn
        + '</div>'
        + reportKindsHtml()
        + reportPickKindHtml()
        + reportFilesHtml();
    if (!all.length || !list.length) {
        var emptyTitle = all.length ? (km.label + ' hesabatı yoxdur') : 'Hələ hesabat yoxdur';
        return head + '<section class="nk303-card nk303-card--report-empty">'
            + '<h3>' + esc(emptyTitle) + '</h3>'
            + '<p class="nk303-hint">' + (isAdmin()
                ? 'Yuxarıdan ' + km.label + ' seçilib. «PPTX / PDF yüklə» bu növə aid faylı oxuyacaq.'
                : 'Hesabat yüklənəndən sonra burada növünə uyğun indeks, istiqamətlər və tapıntılar görünəcək.')
            + '</p>'
            + (all.length ? '' : ('<ul class="nk303-rep-empty-kinds">'
            + '<li><b>Diaqnostika</b> — 4 rəsmi istiqamət, yetkinlik səviyyəsi</li>'
            + '<li><b>İSQ</b> — 10 sütun, yekun nəticə və ulduz şkalası</li>'
            + '<li><b>EXQ</b> — yekun faiz, ulduz və altmeyarlar</li>'
            + '</ul>'))
            + '</section>';
    }
    var focus = ui.reportFocus || '';
    var weakHtml = agg.weak
        ? esc(agg.weak.short || agg.weak.name) + ' · ' + esc(fmt1(agg.weak.score))
        : '—';
    var nStr = sel ? (sel.strengths || []).length : 0;
    if (!sel) {
        list.forEach(function(r) { nStr += (r.strengths || []).length; });
    }
    var indexLabel = kind === 'diag' ? 'Rəqəmsal inkişaf indeksi' : 'Yekun nəticə';
    var indexSub = useStar
        ? (exqStarFromPercent(agg.overall) ? exqStarLabel(exqStarFromPercent(agg.overall)) : NA)
        : ((maturityOf(agg.overall) && maturityOf(agg.overall).label) || NA);
    var third = kind === 'exq'
        ? kpiCardHtml({
            ic: 'is-amber', icon: 'star', label: 'Ulduz səviyyəsi',
            valueHtml: agg.star ? esc(String(agg.star) + ' ulduz') : '—',
            onclick: reportFocusHit('summary'), on: focus === 'summary'
        })
        : kpiCardHtml({
            ic: 'is-amber', icon: 'down',
            label: kind === 'isq' ? 'Ən zəif sütun' : 'Ən zəif istiqamət',
            valueHtml: weakHtml,
            onclick: reportFocusHit('weak'), on: focus === 'weak'
        });
    var kpis = '<div class="nk303-kpis nk303-kpis--4">'
        + kpiCardHtml({
            ic: 'is-teal', icon: 'chart', label: km.label + ' hesabatı', valueHtml: esc(String(agg.n)),
            onclick: reportFocusHit('reports'), on: focus === 'reports'
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'star', label: indexLabel,
            valueHtml: agg.overall == null ? '—' : (esc(fmt1(agg.overall)) + (useStar ? ' <small>%</small>' : ' <small>/ 100</small>')),
            subHtml: '<div class="sub">' + esc(indexSub) + '</div>',
            onclick: reportFocusHit('summary'), on: focus === 'summary'
        })
        + third
        + kpiCardHtml({
            ic: 'is-red', icon: 'flag', label: 'Çatışmazlıq', valueHtml: esc(String(agg.findings)),
            onclick: reportFocusHit('findings'), on: focus === 'findings'
        })
        + '</div>';
    var nFind = sel ? (sel.findings || []).length : agg.findings;
    var nWeak = reportItemsForWeak(sel, agg.weak).length || (agg.weak ? 1 : 0);
    var nAll = nFind + nStr + nWeak;
    var donutLegend = [
        { id: 'findings', label: 'Çatışmazlıq', n: nFind, color: '#dc2626' },
        { id: 'strengths', label: 'Güclü tərəf', n: nStr, color: '#0f766e' },
        { id: 'weak', label: 'Zəif tərəf', n: nWeak, color: '#d97706' }
    ];
    var radarTitle = kind === 'isq' ? 'İSQ sütunları' : (kind === 'exq' ? 'Ulduz səviyyələri' : 'Rəqəmsallaşma istiqamətləri');
    var nowHex = kind === 'isq' ? ISQ_RADAR_NOW : (useStar ? exqBarColor(agg.overall) : barColor(agg.overall));
    var goalHex = kind === 'isq' ? ISQ_RADAR_GOAL : (useStar ? exqBarColor(exqStarTarget(agg.overall)) : barColor(maturityTarget(agg.overall)));
    var mid = '<div class="nk303-mid nk303-mid--two nk303-mid--report">'
        + '<section class="nk303-card nk303-card--gauge nk303-card--hit' + (focus === 'summary' ? ' is-on' : '') + '" onclick="nk303Call(\'reportFocus\',\'summary\')"><h3>Ümumi nəticə</h3>'
        + reportGaugeHtml(agg.overall, kind)
        + '</section>'
        + '<section class="nk303-card nk303-card--radar"><h3>' + esc(radarTitle) + '</h3>'
        + (kind === 'exq' ? '<ul class="nk303-compare-legend"><li class="is-now" style="--nk-now:' + nowHex + '">Toplanmış / mümkün</li></ul>' : compareLegendHtml(nowHex, goalHex))
        + '<div class="nk303-chart nk303-chart--radar' + (kind === 'isq' ? ' is-isq' : '') + '"><canvas id="nkRepRadar"></canvas></div>'
        + '</section></div>'
        + '<section class="nk303-card nk303-card--rep-split' + (focus === 'findings' || focus === 'strengths' || focus === 'weak' || focus === 'actions' ? ' is-on' : '') + '" id="nkRepDonutCard">'
        + '<h3>Nəticələrin bölgüsü</h3>'
        + '<p class="nk303-hint">Dilimi klikləyin — həmin tapıntılar sağda açılsın.</p>'
        + '<div class="nk303-rep-split">'
        + '<div class="nk303-rep-split-chart">'
        + '<div class="nk303-chart nk303-chart--donut"><canvas id="nkRepDonut"></canvas></div>'
        + '<ul class="nk303-status-legend nk303-rep-legs">' + donutLegend.map(function(it) {
            var on = focus === it.id;
            var share = nAll ? Math.round((it.n / nAll) * 100) : 0;
            return '<li class="is-click' + (on ? ' is-on' : '') + '" role="button" tabindex="0" onclick="nk303Call(\'reportFocus\',\'' + it.id + '\')">'
                + '<i style="background:' + it.color + '"></i>'
                + '<span>' + esc(it.label) + '</span>'
                + '<b>' + esc(String(it.n)) + '</b>'
                + '<em>' + share + '%</em></li>';
        }).join('') + '</ul></div>'
        + reportFocusPaneHtml(sel, agg)
        + '</div></section>';
    var themes = (sel && sel.themes) || [];
    var themeHtml = (kind === 'diag' && themes.length)
        ? ('<section class="nk303-card"><h3>Əhatə olunan mövzular</h3>'
            + '<div class="nk303-theme-bars">' + themes.map(function(t) {
                return '<div class="nk303-dist-row"><b>' + esc(t.label) + '</b>'
                    + '<span class="nk303-track"><i style="width:' + Math.max(6, Math.min(100, t.score)) + '%;background:#0f766e"></i></span>'
                    + '<em>' + esc(fmt1(t.score)) + '</em></div>';
            }).join('') + '</div></section>')
        : '';
    var axes = agg.axes || reportAxes(kind);
    var detail = '';
    if (sel) {
        var pages = sel.pageCount || sel.slideCount;
        var pageWord = reportPageWord(sel);
        var dirRows = axes.map(function(d) {
            var sc = reportAxisScore(sel, d, kind);
            if (sc == null && sel.dirs) sc = sel.dirs[d.id];
            var on = focus === ('dir:' + d.id) || (focus === 'weak' && agg.weak && agg.weak.id === d.id);
            var badge = useStar ? (sc == null ? '' : '<span class="nk303-mat is-s' + (exqStarFromPercent(sc) || 1) + '">' + esc(fmt1(sc)) + '</span>') : matBadge(sc);
            return '<button type="button" class="nk303-rep-dir' + (on ? ' is-on' : '') + '" onclick="nk303Call(\'reportFocus\',\'dir:' + d.id + '\')">'
                + '<div><b>' + esc(d.short || d.name) + '</b>' + badge + '</div>'
                + '<em>' + (sc == null ? '—' : esc(fmt1(sc))) + '</em></button>';
        }).join('');
        var dirCls = 'nk303-rep-dirs' + (kind === 'isq' ? ' is-isq' : (kind === 'exq' ? ' is-exq' : ''));
        detail = '<section class="nk303-card nk303-card--report" id="nkRepDetail"><div class="nk303-rep-head">'
            + '<div><p class="nk303-kicker">Seçilmiş hesabat</p>'
            + reportFileKindHtml(sel.id, kind)
            + '<h3>' + esc(sel.org || sel.name || 'Hesabat') + '</h3>'
            + '<p class="nk303-hint">' + esc(reportFileTitle(sel.name) || '')
            + ' · ' + esc(reportExtLabel(sel))
            + (sel.year ? ' · ' + sel.year : '')
            + (pages ? ' · ' + pages + ' ' + pageWord : '')
            + (sel.inferred ? ' · bal mətn əsasında qiymətləndirilib' : '')
            + '</p></div>'
            + (isAdmin() ? '<button type="button" class="nk303-btn nk303-btn--ghost" onclick="nk303Call(\'removeReport\',\'' + qarg(sel.id) + '\')">Sil</button>' : '')
            + '</div>'
            + '<p class="nk303-rep-sum">' + esc(sel.summary || NA) + '</p>'
            + '<div class="' + dirCls + '" id="nkRepDirs">' + dirRows + '</div>'
            + '<div class="nk303-find nk303-find--3">'
            + '<div id="nkRepColStr" class="' + (focus === 'strengths' ? 'is-on' : '') + '"><button type="button" class="nk303-find-hit" onclick="nk303Call(\'reportFocus\',\'strengths\')"><h4>Cari vəziyyət / güclü tərəflər</h4></button>' + reportListHtml(sel.strengths) + '</div>'
            + '<div id="nkRepColFind" class="' + (focus === 'findings' ? 'is-on' : '') + '"><button type="button" class="nk303-find-hit" onclick="nk303Call(\'reportFocus\',\'findings\')"><h4>Çatışmazlıqlar</h4></button>' + reportListHtml(sel.findings) + '</div>'
            + '<div id="nkRepColAct" class="' + (focus === 'actions' ? 'is-on' : '') + '"><button type="button" class="nk303-find-hit" onclick="nk303Call(\'reportFocus\',\'actions\')"><h4>Tövsiyələr</h4></button>' + reportListHtml(sel.actions) + '</div>'
            + '</div>'
            + '</section>';
    }
    return head + kpis + mid + themeHtml + detail;
}

function drawReportCharts() {
    if (typeof Chart === 'undefined') return;
    var agg = reportAgg();
    var sel = selectedReport();
    var kind = agg.kind || activeReportKind();
    var axes = agg.axes || reportAxes(kind);
    var useStar = kind === 'isq' || kind === 'exq';
    var nowHex = kind === 'isq' ? ISQ_RADAR_NOW : (useStar ? exqBarColor(agg.overall) : barColor(agg.overall));
    var goalHex = kind === 'isq' ? ISQ_RADAR_GOAL : (useStar ? exqBarColor(exqStarTarget(agg.overall)) : barColor(maturityTarget(agg.overall)));
    if (document.getElementById('nkHubGauge')) {
        var empty = agg.overall == null;
        var v = empty ? 0 : Math.max(0, Math.min(100, agg.overall));
        var col = empty ? '#cbd5e1' : (useStar ? exqBarColor(agg.overall) : barColor(agg.overall));
        makeHubChart('nkHubGauge', {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: empty ? [1] : [Math.max(v, 0.4), Math.max(100 - v, 0.4)],
                    backgroundColor: empty ? ['#e8eef5'] : [col, '#e8eef5'],
                    borderWidth: 0,
                    hoverOffset: 0,
                    borderRadius: empty ? 0 : 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%',
                rotation: -90,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [centerTextPlugin('nkHubGaugeCenter', [
                { text: agg.overall == null ? '—' : fmt1(agg.overall), color: '#0f2744', font: '800 26px Inter, system-ui, sans-serif', gap: 20 },
                { text: useStar ? '%' : '/ 100', color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])]
        });
    }
    if (document.getElementById('nkRepRadar')) {
        var nowVals = axes.map(function(d) {
            var sc = sel ? reportAxisScore(sel, d, kind) : agg.dirs[d.id];
            if (sc == null && agg.dirs) sc = agg.dirs[d.id];
            return sc != null ? sc : 0;
        });
        var goalVals = axes.map(function(d, i) {
            var now = nowVals[i];
            if (kind === 'diag') {
                var goals = (sel && sel.targets) || agg.targets || {};
                if (goals[d.id] != null) return goals[d.id];
                var g = maturityTarget(now);
                return g != null ? g : 0;
            }
            if (kind === 'exq') return 100;
            var step = exqStarTarget(now);
            return step != null ? step : 0;
        });
        var sets = radarPairDatasets(nowVals, goalVals, nowHex, goalHex);
        if (kind === 'exq') sets = sets.slice(0, 1);
        makeHubChart('nkRepRadar', {
            type: 'radar',
            data: {
                labels: axes.map(function(d) { return d.short || dirShort(d) || d.name; }),
                datasets: sets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { stepSize: 20, color: '#94a3b8', backdropColor: 'transparent', font: { size: kind === 'isq' ? 9 : 10, weight: '600' } },
                        grid: { color: 'rgba(148,163,184,0.35)' },
                        angleLines: { color: 'rgba(148,163,184,0.35)' },
                        pointLabels: { color: '#334155', font: { size: kind === 'isq' ? 10 : 11, weight: '700' } }
                    }
                }
            }
        });
    }
    if (document.getElementById('nkRepDonut')) {
        var nFind = sel ? (sel.findings || []).length : agg.findings;
        var nStr = sel ? (sel.strengths || []).length : 0;
        if (!sel) {
            visibleReports().forEach(function(r) {
                nStr += (r.strengths || []).length;
            });
        }
        var nWeak = reportItemsForWeak(sel, agg.weak).length || (agg.weak ? 1 : 0);
        var items = [
            { label: 'Çatışmazlıq', n: nFind, color: '#dc2626', filter: 'findings' },
            { label: 'Güclü tərəf', n: nStr, color: '#0f766e', filter: 'strengths' },
            { label: 'Zəif tərəf', n: nWeak, color: '#d97706', filter: 'weak' }
        ];
        var shown = items.filter(function(it) { return it.n > 0; });
        var total = shown.reduce(function(s, it) { return s + (it.n || 0); }, 0);
        var donutPick = donutPickOptions(function(filter) {
            nk303Call('reportFocus', filter);
        });
        var donutItems = total ? shown : [];
        makeHubChart('nkRepDonut', {
            type: 'doughnut',
            data: {
                labels: (total ? shown : items).map(function(it) { return it.label; }),
                datasets: [{
                    data: total ? shown.map(function(it) { return it.n; }) : [1],
                    backgroundColor: total ? shown.map(function(it) { return it.color; }) : ['#e8eef5'],
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                interaction: { mode: 'nearest', intersect: true },
                plugins: { legend: { display: false } },
                onClick: donutPick.onClick,
                onHover: donutPick.onHover
            },
            _donutItems: donutItems
        });
        var donutEl = document.getElementById('nkRepDonut');
        if (donutEl) donutEl.style.cursor = 'pointer';
        if (nkHubCharts.nkRepDonut) nkHubCharts.nkRepDonut._donutItems = donutItems;
    }
    if (document.getElementById('nkRepRadar')) {
        var radarEl = document.getElementById('nkRepRadar');
        var radarChart = nkHubCharts.nkRepRadar;
        if (radarChart) {
            radarChart.options.onClick = function(evt, els) {
                if (!els || !els.length) return;
                var d = axes[els[0].index];
                if (d) nk303Call('reportFocus', 'dir:' + d.id);
            };
            radarChart.options.onHover = function(evt, els) {
                var t = evt && evt.native && evt.native.target;
                if (t && t.style) t.style.cursor = els && els.length ? 'pointer' : 'default';
            };
            radarChart.update();
        }
        if (radarEl) radarEl.style.cursor = 'pointer';
    }
}

function bodyHtml(model) {
    var inner;
    if (ui.hub) inner = hubPageHtml(currentHubView());
    else if (ui.mode === 'institution' || ui.orgKey) inner = institutionBody(model);
    else if (ui.nav === 'gaps') inner = highGapsBody(model);
    else if (ui.nav === 'orgs') inner = countryOrgListBody(model, 'all');
    else if (isVisNav(ui.nav)) inner = countryOrgListBody(model, ui.nav);
    else inner = countryBody(model);
    return inner + '</div>';
}

function destroyNkCharts() {
    Object.keys(nkCharts).forEach(function(k) {
        try { if (nkCharts[k]) nkCharts[k].destroy(); } catch (e) {}
        nkCharts[k] = null;
    });
}

function makeChart(id, cfg) {
    if (typeof Chart === 'undefined') return;
    var el = document.getElementById(id);
    if (!el) return;
    var existing = Chart.getChart(el);
    if (existing) existing.destroy();
    nkCharts[id] = new Chart(el.getContext('2d'), cfg);
    if (cfg && cfg._donutItems && nkCharts[id]) nkCharts[id]._donutItems = cfg._donutItems;
}

function centerTextPlugin(id, lines) {
    return {
        id: id,
        afterDraw: function(chart) {
            var ctx = chart.ctx;
            var area = chart.chartArea;
            var x = (area.left + area.right) / 2;
            var y = (area.top + area.bottom) / 2;
            var i, line, offset;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            offset = -((lines.length - 1) * 11);
            for (i = 0; i < lines.length; i++) {
                line = lines[i];
                ctx.fillStyle = line.color;
                ctx.font = line.font;
                ctx.fillText(line.text, x, y + offset);
                offset += line.gap || 22;
            }
            ctx.restore();
        }
    };
}

function drawCharts(model) {
    destroyNkCharts();
    if (typeof Chart === 'undefined') return;
    var score = model.countryAvg;
    var total = model.orgs.length;
    if (document.getElementById('nkGaugeChart')) {
        var empty = score == null;
        var v = empty ? 0 : Math.max(0, Math.min(100, score));
        var col = empty ? '#cbd5e1' : barColor(score);
        makeChart('nkGaugeChart', {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: empty ? [1] : [Math.max(v, 0.4), Math.max(100 - v, 0.4)],
                    backgroundColor: empty ? ['#e8eef5'] : [col, '#e8eef5'],
                    borderWidth: 0,
                    hoverOffset: 0,
                    borderRadius: empty ? 0 : 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%',
                rotation: -90,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [centerTextPlugin('nkGaugeCenter', [
                { text: score == null ? '—' : fmt1(score), color: '#0f2744', font: '800 26px Inter, system-ui, sans-serif', gap: 20 },
                { text: '/ 100', color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])]
        });
    }
    if (document.getElementById('nkRadarChart')) {
        var dirs = compareChartRows(model);
        var nowHex = barColor(model.countryAvg);
        var goalHex = barColor(maturityTarget(model.countryAvg));
        makeChart('nkRadarChart', {
            type: 'radar',
            data: {
                labels: dirs.map(function(d) { return d.short; }),
                datasets: radarPairDatasets(
                    dirs.map(function(d) { return d.now != null ? d.now : 0; }),
                    dirs.map(function(d) { return d.target != null ? d.target : 0; }),
                    nowHex,
                    goalHex
                )
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 18, bottom: 8, left: 18 } },
                elements: { line: { tension: 0, borderJoinStyle: 'round' } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + fmtScore(ctx.parsed.r);
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        beginAtZero: true,
                        ticks: {
                            stepSize: 20,
                            count: 6,
                            showLabelBackdrop: false,
                            color: '#64748b',
                            backdropColor: 'transparent',
                            font: { size: 10, weight: '600' },
                            z: 1
                        },
                        grid: {
                            circular: false,
                            color: 'rgba(15, 39, 68, 0.16)',
                            lineWidth: 1.15
                        },
                        angleLines: {
                            display: true,
                            color: 'rgba(15, 39, 68, 0.28)',
                            lineWidth: 1.35
                        },
                        pointLabels: {
                            color: '#0f2744',
                            font: { size: dirs.length > 4 ? 10 : 13, weight: '800' },
                            padding: dirs.length > 4 ? 6 : 10
                        }
                    }
                }
            }
        });
    }
    if (document.getElementById('nkDonutChart')) {
        var items = VIS_STATUS.map(function(s) {
            return { label: s.label, n: model.byVis[s.id] || 0, color: VIS_COLORS[s.id], filter: s.id };
        });
        var sliced = pickDonutSlice(items, visStatusPick());
        var donutItems = sliced.donutItems;
        var donutCenter = sliced.filtered ? sliced.centerN : total;
        var donutPick = donutPickOptions(function(filter) {
            nk303Call('statusList', filter);
        });
        makeChart('nkDonutChart', {
            type: 'doughnut',
            data: {
                labels: donutItems.map(function(x) { return x.label; }),
                datasets: [{
                    data: donutItems.map(function(x) { return x.n; }),
                    backgroundColor: donutItems.map(function(x) { return x.color; }),
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: { legend: { display: false } },
                onClick: donutPick.onClick,
                onHover: donutPick.onHover
            },
            plugins: [centerTextPlugin('nkDonutCenter', [
                { text: String(donutCenter), color: '#0f2744', font: '800 26px Inter, system-ui, sans-serif', gap: 20 },
                { text: 'Qurum', color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])],
            _donutItems: donutItems
        });
    }
    if (document.getElementById('nkTrendChart')) {
        var series = curvedTrendSeries(model.trend || []);
        if (series.length) {
            var yearTicks = series.filter(function(p) { return p.real; }).map(function(p) { return p.x; });
            var yBounds = trendAxisBounds(series);
            makeChart('nkTrendChart', {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Ölkə indeksi',
                        data: series.map(function(p) { return { x: p.x, y: p.y }; }),
                        borderColor: '#7c3aed',
                        backgroundColor: 'rgba(124,58,237,0.14)',
                        fill: true,
                        spanGaps: true,
                        tension: 0.42,
                        cubicInterpolationMode: 'monotone',
                        pointRadius: function(ctx) {
                            var p = series[ctx.dataIndex];
                            return p && p.real ? 5 : 0;
                        },
                        pointHoverRadius: 0,
                        pointHitRadius: 0,
                        pointBackgroundColor: '#7c3aed',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 2.8
                    }]
                },
                plugins: [{
                    id: 'trendDiagCounts',
                    afterDatasetsDraw: function(chart) {
                        var meta = chart.getDatasetMeta(0);
                        var area = chart.chartArea;
                        if (!meta || !area) return;
                        var ctx = chart.ctx;
                        series.forEach(function(p, i) {
                            if (!p || !p.real || p.n == null) return;
                            var pt = meta.data[i];
                            if (!pt) return;
                            var label = String(p.n);
                            ctx.save();
                            ctx.font = '800 12px Inter, system-ui, sans-serif';
                            ctx.fillStyle = '#5b21b6';
                            ctx.textBaseline = 'bottom';
                            var w = ctx.measureText(label).width;
                            var x = pt.x;
                            if (x - w / 2 < area.left + 2) x = area.left + 2 + w / 2;
                            if (x + w / 2 > area.right - 2) x = area.right - 2 - w / 2;
                            ctx.textAlign = 'center';
                            ctx.fillText(label, x, pt.y - 8);
                            ctx.restore();
                        });
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    events: [],
                    layout: { padding: { top: 16 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        y: {
                            min: yBounds.min,
                            max: yBounds.max,
                            ticks: { color: '#94a3b8', font: { size: 10 } },
                            grid: { color: '#eef2f7' },
                            border: { display: false }
                        },
                        x: {
                            type: 'linear',
                            min: yearTicks.length ? yearTicks[0] : undefined,
                            max: yearTicks.length ? yearTicks[yearTicks.length - 1] : undefined,
                            ticks: {
                                color: '#64748b',
                                font: { size: 11, weight: '700' },
                                stepSize: 1,
                                callback: function(v) {
                                    if (Math.abs(v - Math.round(v)) > 0.001) return '';
                                    return String(Math.round(v));
                                }
                            },
                            grid: { display: false },
                            border: { display: false }
                        }
                    }
                }
            });
        }
    }
}

function hubVisCounts(byStatus) {
    byStatus = byStatus || {};
    return {
        done: byStatus.done || 0,
        in_progress: (byStatus.progress || 0) + (byStatus.planned || 0) + (byStatus.paused || 0)
            + (byStatus.blocked || 0) + (byStatus.rejected || 0),
        review: (byStatus.review || 0) + (byStatus.esd || 0),
        not_started: byStatus.other || 0
    };
}

function hubOpinionLabel(kind) {
    if (kind === 'pos') return { id: 'pos', label: 'Müsbət' };
    if (kind === 'neg') return { id: 'neg', label: 'Mənfi' };
    if (kind === 'revision') return { id: 'rev', label: 'Düzəliş' };
    if (kind === 'baxilir') return { id: 'wait', label: 'İcradadır' };
    if (kind === 'partial') return { id: 'part', label: 'Qismən' };
    return { id: 'part', label: '—' };
}

function meqsedOpinionItems(st) {
    st = st || {};
    return [
        { id: 'pos', label: 'Müsbət', n: st.pos || 0, color: OPINION.pos, filter: 'pos' },
        { id: 'neg', label: 'Mənfi', n: st.neg || 0, color: OPINION.neg, filter: 'neg' },
        { id: 'rev', label: 'Düzəliş', n: st.other || 0, color: OPINION.revision, filter: 'revision' },
        { id: 'wait', label: 'İcradadır', n: st.icrada != null ? st.icrada : (st.baxilir || 0), color: OPINION.baxilir, filter: 'baxilir' }
    ];
}

function destroyHubCharts() {
    Object.keys(nkHubCharts).forEach(function(k) {
        try { if (nkHubCharts[k]) nkHubCharts[k].destroy(); } catch (e) {}
        nkHubCharts[k] = null;
    });
}

function makeHubChart(id, cfg) {
    if (typeof Chart === 'undefined') return;
    var el = document.getElementById(id);
    if (!el) return;
    var existing = Chart.getChart(el);
    if (existing) existing.destroy();
    cfg = cfg || {};
    cfg.options = cfg.options || {};
    cfg.options.animation = false;
    cfg.options.animations = false;
    nkHubCharts[id] = new Chart(el.getContext('2d'), cfg);
    if (cfg && cfg._donutItems && nkHubCharts[id]) nkHubCharts[id]._donutItems = cfg._donutItems;
}

function syncHubNav() {
    document.querySelectorAll('.nk303-sec').forEach(function(btn) {
        btn.classList.toggle('is-on', hubSectionOn(btn.getAttribute('data-sec')));
    });
}

function hideHubOverlay() {
    var overlay = document.getElementById('nk303HubOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('hidden', '');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('nk303-hub-open');
}

function resetHubState() {
    ui.hub = '';
    ui.hubSearch = '';
    ui.hubPage = 1;
    ui.hubFilter = '';
    ui.hubSort = 'desc';
    ui.hubDetailKey = '';
    ui.reportId = '';
    ui.reportKind = '';
    ui.reportPickKind = false;
    ui.reportUploadKind = '';
    ui.reportFocus = '';
    ui.reportPin = false;
    destroyHubCharts();
    destroyMeqsedOverviewCharts();
    hideHubOverlay();
}

function closeHub() {
    resetHubState();
}

function openHub(section) {
    if (!section || section === 'diag' || section === 'report') {
        closeHub();
        render({ soft: true, scrollTop: true });
        return;
    }
    if (ui.hub === section) {
        closeHub();
        render({ soft: true, scrollTop: true });
        return;
    }
    ui.hub = section;
    ui.hubSearch = '';
    ui.hubPage = 1;
    ui.hubFilter = '';
    ui.hubSort = section === 'meqsed' ? 'date' : 'desc';
    ui.hubDetailKey = '';
    ui.mode = 'country';
    ui.orgKey = '';
    ui.nav = 'overview';
    hideHubOverlay();
    render({ soft: true, scrollTop: true });
}

function hubKpiHit(key) {
    return "nk303Call('hubFilter','" + key + "')";
}

function hubKpisHtml(view) {
    var st = view.stats || {};
    var vis = hubVisCounts(st.byStatus);
    var total = st.qurum || 0;
    var donePct = pct(vis.done, total);
    var f = ui.hubFilter || '';
    var cards = '';
    var kpiCls = '';
    if (view.section === 'meqsed') {
        kpiCls = ' nk303-kpis--4 nk303-kpis--meqsed';
        cards = kpiCardHtml({
            ic: 'is-blue', icon: 'chart', label: 'Ümumi müraciət',
            valueHtml: esc(String(st.total || 0)),
            subHtml: '<div class="sub">' + esc(String(st.icrada != null ? st.icrada : (st.baxilir || 0))) + ' icradadır</div>',
            onclick: hubKpiHit('all'), on: !f
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'building', label: 'Müraciət edən qurum',
            valueHtml: esc(String(st.qurum || 0)), subHtml: '<div class="sub">unikal qurum</div>',
            onclick: hubKpiHit('orgs'), on: f === 'orgs'
        })
        + kpiCardHtml({
            ic: 'is-green', icon: 'star', label: 'Müsbət rəy',
            valueHtml: esc(String(st.pos || 0)), subHtml: '<div class="sub">nəticə</div>',
            onclick: hubKpiHit('pos'), on: f === 'pos'
        })
        + kpiCardHtml({
            ic: 'is-red', icon: 'down', label: 'Mənfi rəy',
            valueHtml: esc(String(st.neg || 0)), subHtml: '<div class="sub">nəticə</div>',
            onclick: hubKpiHit('neg'), on: f === 'neg'
        });
    } else if (view.section === 'exq') {
        var avg = st.weightedAvg != null ? st.weightedAvg : st.avg;
        kpiCls = ' nk303-kpis--4';
        var star = exqStarFromPercent(avg);
        cards = kpiCardHtml({
            ic: 'is-blue', icon: 'chart', label: 'Ölkə üzrə yekun nəticə',
            valueHtml: avg == null ? '—' : esc(fmt1(avg)) + ' <small>%</small>',
            subHtml: (star
                ? '<div class="sub">' + esc(exqStarLabel(star)) + ' · Qərar 380, bənd 4.18</div>'
                    + '<div class="nk303-kpi-stars">' + exqStarsHtml(star) + '</div>'
                : '<div class="sub">xidmət sayı ilə çəkili ortalama</div>'),
            onclick: hubKpiHit('has_result'), on: f === 'has_result'
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'building', label: 'Əhatə olunan qurumlar',
            valueHtml: esc(String(st.qurum || 0)),
            subHtml: '<div class="sub">' + esc(view.period || getAssessmentPeriodLabel() || 'Bütün illər') + '</div>',
            onclick: hubKpiHit('orgs'), on: f === 'orgs'
        })
        + kpiCardHtml({
            ic: 'is-green', icon: 'star', label: 'Tamamlanmış',
            valueHtml: esc(String(vis.done)) + ' <small>/ ' + esc(String(total)) + '</small>',
            subHtml: '<div class="nk303-mini-bar is-green" aria-hidden="true"><i style="width:' + donePct + '%"></i></div>',
            onclick: hubKpiHit('done'), on: f === 'done'
        })
        + kpiCardHtml({
            ic: 'is-amber', icon: 'flag', label: 'İcradadır',
            valueHtml: esc(String(vis.in_progress || 0)),
            subHtml: '<div class="sub">qurum</div>',
            onclick: hubKpiHit('in_progress'), on: f === 'in_progress'
        });
    } else if (view.section === 'isq') {
        kpiCls = ' nk303-kpis--4';
        var isqAvg = st.avg;
        var isqStar = exqStarFromPercent(isqAvg);
        cards = kpiCardHtml({
            ic: 'is-blue', icon: 'chart', label: 'Ölkə üzrə yekun nəticə',
            valueHtml: isqAvg == null ? '—' : esc(fmt1(isqAvg)) + ' <small>%</small>',
            subHtml: isqStar
                ? '<div class="sub">' + esc(exqStarLabel(isqStar)) + ' · Qərar 380, bənd 4.18</div>'
                : '<div class="sub">bütün qurumların ortalaması</div>'
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'building', label: 'Əhatə olunan qurumlar',
            valueHtml: esc(String(st.qurum || 0)),
            subHtml: '<div class="sub">' + esc(view.period || getAssessmentPeriodLabel() || 'Bütün illər') + '</div>',
            onclick: hubKpiHit('orgs'), on: f === 'orgs'
        })
        + kpiCardHtml({
            ic: 'is-green', icon: 'star', label: 'Tamamlanmış',
            valueHtml: esc(String(vis.done)) + ' <small>/ ' + esc(String(total)) + '</small>',
            subHtml: '<div class="nk303-mini-bar is-green" aria-hidden="true"><i style="width:' + donePct + '%"></i></div>',
            onclick: hubKpiHit('done'), on: f === 'done'
        })
        + kpiCardHtml({
            ic: 'is-amber', icon: 'flag', label: 'İcradadır',
            valueHtml: esc(String(vis.in_progress || 0)),
            subHtml: '<div class="sub">qurum</div>',
            onclick: hubKpiHit('in_progress'), on: f === 'in_progress'
        });
    } else {
        var isRadar = view.section === 'diag' || view.section === 'self';
        var best = st.bestDirection;
        var ranked = (st.dirRadar || []).filter(function(d) { return d.avg != null; })
            .slice().sort(function(a, b) { return a.avg - b.avg; });
        var weak = ranked[0];
        kpiCls = isRadar ? ' nk303-kpis--5' : ' nk303-kpis--4';
        cards = kpiCardHtml({
            ic: 'is-blue', icon: 'chart', label: 'Ölkə üzrə ortalama bal',
            valueHtml: st.avg == null ? '—' : esc(fmt1(st.avg)) + ' <small>/ 100</small>'
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'building', label: 'Qiymətləndirilən qurumlar',
            valueHtml: esc(String(st.qurum || 0)), subHtml: '<div class="sub">cəmi qurum</div>',
            onclick: hubKpiHit('all'), on: !f
        })
        + kpiCardHtml(isRadar ? {
            ic: 'is-green', icon: 'star', label: 'Ən güclü istiqamət',
            valueHtml: esc(best && best.avg != null ? (best.short || best.title) : '—'),
            valClass: 'is-name',
            subHtml: best && best.avg != null
                ? '<div class="sub is-up">' + esc(fmt1(best.avg)) + ' bal</div>'
                : ''
        } : {
            ic: 'is-green', icon: 'star', label: 'Tamamlanmış',
            valueHtml: esc(String(vis.done)),
            subHtml: '<div class="nk303-mini-bar is-green" aria-hidden="true"><i style="width:' + donePct + '%"></i></div>',
            onclick: hubKpiHit('done'), on: f === 'done'
        })
        + kpiCardHtml(isRadar ? {
            ic: 'is-red', icon: 'down', label: 'Ən zəif istiqamət',
            valueHtml: esc(weak ? (weak.short || weak.title) : '—'),
            valClass: 'is-name',
            subHtml: weak
                ? '<div class="sub is-down">' + esc(fmt1(weak.avg)) + ' bal</div>'
                : ''
        } : {
            ic: 'is-amber', icon: 'flag', label: 'İcradadır',
            valueHtml: esc(String(vis.in_progress || 0)),
            subHtml: '<div class="sub">qurum</div>',
            onclick: hubKpiHit('in_progress'), on: f === 'in_progress'
        });
        if (isRadar) {
            cards += kpiCardHtml({
                ic: 'is-amber', icon: 'flag', label: 'İcradadır',
                valueHtml: esc(String(vis.in_progress || 0)),
                subHtml: '<div class="sub">qurum</div>',
                onclick: hubKpiHit('in_progress'), on: f === 'in_progress'
            });
        }
    }
    return '<div class="nk303-kpis' + kpiCls + '">' + cards + '</div>';
}

function hubGaugeHtml(score, law) {
    var mat = maturityOf(score);
    return '<div class="nk303-gauge">'
        + '<div class="nk303-gauge-box"><canvas id="nkHubGauge"></canvas></div>'
        + (mat ? '<div class="nk303-mat is-' + mat.id + '">' + esc(mat.label) + '</div>'
            : '<div class="nk303-mat is-none">' + esc(NA) + '</div>')
        + (law
            ? '<p class="nk303-hint nk303-hint--law">Qərar 303, bənd 4.10</p>'
            : '<p class="nk303-hint">Ortalama bal 0–100 şkalası üzrə</p>')
        + '</div>';
}

function reportGaugeHtml(score, kind) {
    if (kind !== 'isq' && kind !== 'exq') return hubGaugeHtml(score, false);
    var star = exqStarFromPercent(score);
    return '<div class="nk303-gauge">'
        + '<div class="nk303-gauge-box"><canvas id="nkHubGauge"></canvas></div>'
        + (star
            ? '<div class="nk303-mat is-s' + star + '">' + esc(exqStarLabel(star)) + '</div>'
            : '<div class="nk303-mat is-none">' + esc(NA) + '</div>')
        + exqStarsHtml(star)
        + '<p class="nk303-hint">' + (kind === 'exq' ? 'EXQ yekunu, Qərar 380 ulduz şkalası' : 'İSQ yekunu, Qərar 380 ulduz şkalası') + '</p>'
        + '</div>';
}

function hubExqGaugeHtml(score, extraHint) {
    var star = exqStarFromPercent(score);
    var pos = score == null || !isFinite(score) ? 0 : Math.max(0, Math.min(100, score));
    var f = ui.hubFilter || '';
    var scale = (EXQ_STAR_BANDS || []).map(function(b) {
        var key = 'star_' + b.star;
        var on = f === key || (star && star === b.star && !f);
        return '<i class="is-s' + b.star + (on ? ' is-on' : '') + '"'
            + ' onclick="nk303Call(\'hubFilter\',\'' + key + '\')" title="'
            + esc(b.star + ' ulduz · ' + b.lo + '–' + b.hi + '%') + '"></i>';
    }).join('');
    var caps = (EXQ_STAR_BANDS || []).map(function(b) {
        var on = star && star === b.star;
        return '<span class="' + (on ? 'is-on' : '') + '">'
            + esc(b.lo + '–' + b.hi + '%') + '<br>' + esc(b.star + ' ulduz') + '</span>';
    }).join('');
    var formula = extraHint || ('Yekun nəticə = ümumi toplanmış / ümumi mümkün × 100. '
        + 'Çəkilər: 1★ 0,2 · 2★ 0,4 · 3★ 0,6 · 4★ 0,8 · 5★ 1 (bənd 4.16). '
        + 'N/A altmeyarlar mümkün nəticəyə daxil edilmir.');
    return '<div class="nk303-gauge">'
        + '<div class="nk303-gauge-box"><canvas id="nkHubGauge"></canvas></div>'
        + (star
            ? '<div class="nk303-mat is-s' + star + '">' + esc(exqStarLabel(star)) + '</div>'
            : '<div class="nk303-mat is-none">' + esc(NA) + '</div>')
        + exqStarsHtml(star)
        + '<div class="nk303-scale-col">'
        + (score == null ? '' : '<div class="nk303-scale-pointer" style="left:' + pos + '%" aria-hidden="true">▼</div>')
        + '<div class="nk303-scalebar nk303-scalebar--exq">' + scale + '</div>'
        + '<div class="nk303-scalecaps is-5">' + caps + '</div></div>'
        + '<p class="nk303-hint nk303-hint--law">Qərar 380, bənd 4.14–4.18 · '
        + '<a href="' + EXQ_LAW_URL + '" target="_blank" rel="noopener noreferrer">e-qanun.az/framework/60998</a></p>'
        + '<p class="nk303-exq-formula">' + esc(formula) + '</p>'
        + '</div>';
}

function hubRowHasResult(section, r) {
    if (section === 'meqsed') {
        return r.opinion === 'pos' || r.opinion === 'neg' || r.opinion === 'revision' || r.opinion === 'partial';
    }
    if (section === 'exq' || section === 'isq') {
        if (r.score != null || (r.star != null && isFinite(Number(r.star)))) return true;
        var txt = String(r.result || '').trim();
        return !!(txt && txt !== '—' && txt !== NA);
    }
    return r.score != null;
}

function hubRowMatchesFilter(section, r, filter) {
    if (!filter || filter === 'all' || filter === 'orgs') return true;
    if (section === 'meqsed') return hubRowMatchesMeqsedFilter(r, filter);
    if (filter === 'has_result') return hubRowHasResult(section, r);
    if (filter === 'no_result') return !hubRowHasResult(section, r);
    if (filter === 'done' || filter === 'in_progress' || filter === 'review' || filter === 'not_started') {
        var vis = visStatusOf(r.statusGroup);
        return vis && vis.id === filter;
    }
    if (filter === 'svc_sum') return r.svc != null && Number(r.svc) > 0;
    if (filter.indexOf('star_') === 0) {
        var want = Number(filter.slice(5));
        return exqStarOfRow(r) === want;
    }
    if (filter.indexOf('exq_stage_') === 0) {
        var sk = filter.slice('exq_stage_'.length);
        var stages = r && r.exqStages;
        if (!stages) return false;
        var sv = stages[sk];
        return sv != null && sv !== '';
    }
    return true;
}

function wrapAxisLabel(text, maxChars) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [''];
    maxChars = maxChars || 24;
    if (raw.length <= maxChars) return [raw];
    var words = raw.split(' ');
    var lines = [];
    var cur = '';
    var i;
    for (i = 0; i < words.length; i++) {
        var w = words[i];
        var next = cur ? cur + ' ' + w : w;
        if (next.length <= maxChars) {
            cur = next;
            continue;
        }
        if (cur) lines.push(cur);
        if (w.length > maxChars) {
            while (w.length > maxChars) {
                lines.push(w.slice(0, maxChars));
                w = w.slice(maxChars);
            }
            cur = w;
        } else {
            cur = w;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

function uniqueHubOrgs(list) {
    var seen = {};
    return (list || []).filter(function(r) {
        var k = fold(r.qurum) || r.key || '';
        if (!k || seen[k]) return false;
        seen[k] = true;
        return true;
    });
}

function exqQurumsForChart(st) {
    return ((st && st.byQurum) || []).filter(function(q) {
        return q && (q.svc || 0) > 0;
    });
}

function exqQurumLabel(q) {
    return String((q && (q.name || q.qurum)) || '').trim();
}

function exqBarChartHeightRem(qurums) {
    var rows = qurums || [];
    var lines = 1;
    rows.forEach(function(q) {
        lines = Math.max(lines, wrapAxisLabel(exqQurumLabel(q), 26).length);
    });
    var n = Math.max(rows.length, 1);
    return Math.max(12.2, n * (0.92 + lines * 0.58) + 2.2);
}

function collapseExqHubRows(list, keepUnevaluated) {
    var rows = list || [];
    var map = {};
    var order = [];
    rows.forEach(function(r) {
        var k = fold(r && r.qurum) || (r && r.key) || '';
        if (!k) return;
        if (!map[k]) {
            map[k] = {
                key: r.key || '',
                qurum: r.qurum,
                year: r.year,
                status: r.status,
                statusGroup: r.statusGroup,
                score: null,
                scores: [],
                stars: [],
                svc: 0,
                result: r.result || '',
                time: Number(r.time) || 0,
                canOpen: !!r.canOpen,
                scoredKey: '',
                exqStages: {}
            };
            order.push(k);
        }
        var row = map[k];
        var svc = Number(r.svc);
        if (isFinite(svc) && svc > 0) row.svc += svc;
        if (r.score != null && isFinite(Number(r.score))) {
            row.scores.push(Number(r.score));
            if (!row.scoredKey && r.key) {
                row.scoredKey = r.key;
                row.key = r.key;
                row.canOpen = !!r.canOpen;
            }
        }
        if (r.exqStages) {
            Object.keys(r.exqStages).forEach(function(sk) {
                var nv = r.exqStages[sk];
                if (nv == null || nv === '') return;
                var cur = row.exqStages[sk];
                if (cur == null || cur === '') {
                    row.exqStages[sk] = nv;
                    return;
                }
                if (typeof nv === 'number' && typeof cur === 'number') {
                    row.exqStages[sk] = Math.round(((cur + nv) / 2) * 10) / 10;
                }
            });
        }
        var rowStar = exqStarOfRow(r);
        if (rowStar) row.stars.push(rowStar);
        var yr = Number(r.year);
        var prevYr = Number(row.year);
        if (isFinite(yr) && (!isFinite(prevYr) || yr > prevYr)) row.year = r.year;
        var t = Number(r.time) || 0;
        if (t >= (Number(row.time) || 0)) {
            row.time = t;
            row.status = r.status;
            row.statusGroup = r.statusGroup;
            if (!row.scoredKey && r.key) {
                row.key = r.key;
                row.canOpen = !!r.canOpen;
            }
        }
    });
    var out = order.map(function(k) {
        var row = map[k];
        if (row.scores.length) {
            var sum = 0;
            row.scores.forEach(function(n) { sum += n; });
            row.score = sum / row.scores.length;
            row.star = exqStarFromPercent(row.score);
        } else {
            row.score = null;
            if (row.stars && row.stars.length) row.star = row.stars[row.stars.length - 1];
        }
        delete row.scores;
        delete row.stars;
        delete row.scoredKey;
        return row;
    });
    if (keepUnevaluated) return out;
    var evaluated = out.filter(function(r) { return (r.svc || 0) > 0; });
    return evaluated.length ? evaluated : out;
}

function hubMeqsedKindOf(r) {
    var k = String((r && r.novuKind) || '').trim();
    if (k && k !== 'other') return k;
    var novu = r && r.novu;
    if (novu && novu !== '—') {
        var classified = classifyMeqsedNovu(novu);
        if (classified) return classified;
    }
    return k || 'other';
}

function hubMeqsedNovuMatchesKind(r, kind) {
    if (hubMeqsedKindOf(r) === kind) return true;
    var label = (MEQSED_NOVU_LABELS && MEQSED_NOVU_LABELS[kind]) || '';
    var novu = String((r && r.novu) || '');
    if (!label || !novu || novu === '—') return false;
    var hay = fold(novu);
    var needle = fold(label);
    if (needle && hay.indexOf(needle) !== -1) return true;
    // Qısa açar sözlərlə də tut (məs. "bulud", "rsd")
    if (kind === 'cloud' && (hay.indexOf('bulud') !== -1 || hay.indexOf('hukumet') !== -1)) return true;
    if (kind === 'rsd' && hay.indexOf('rsd') !== -1) return true;
    if (kind === 'fiziki' && (hay.indexOf('fiziki') !== -1 || hay.indexOf('reqemsal') !== -1)) return true;
    if (kind === 'exist_service' && hay.indexOf('xidmet') !== -1 && hay.indexOf('movcud') !== -1) return true;
    if (kind === 'new_service' && hay.indexOf('xidmet') !== -1 && hay.indexOf('movcud') === -1) return true;
    if (kind === 'exist_system' && hay.indexOf('sistem') !== -1 && hay.indexOf('movcud') !== -1) return true;
    if (kind === 'new_system' && hay.indexOf('sistem') !== -1 && hay.indexOf('movcud') === -1) return true;
    return false;
}

function hubRowMatchesMeqsedFilter(r, filter) {
    if (!filter || filter === 'all' || filter === 'orgs') return true;
    var opinion = (r && r.opinion) || '';
    var resultKey = (r && r.resultKey) || '';
    if (filter === 'pos' || filter === 'neg' || filter === 'partial' || filter === 'revision') {
        return opinion === filter || resultKey === filter;
    }
    if (filter === 'baxilir') {
        var g = (r && r.statusGroup) || '';
        return g === 'progress' || g === 'esd' || resultKey === 'baxilir';
    }
    if (filter === 'new_system' || filter === 'exist_system' || filter === 'new_service'
        || filter === 'exist_service' || filter === 'fiziki' || filter === 'rsd'
        || filter === 'cloud' || filter === 'other') {
        return hubMeqsedNovuMatchesKind(r, filter);
    }
    if (filter === 'yeni') return !!(r && r.isNew) || hubMeqsedKindOf(r) === 'new_system' || hubMeqsedKindOf(r) === 'new_service';
    if (filter === 'movcud') return !!(r && r.isExist) || hubMeqsedKindOf(r) === 'exist_system' || hubMeqsedKindOf(r) === 'exist_service';
    if (filter === 'sistem') return !!(r && r.isSystem) || hubMeqsedKindOf(r) === 'new_system' || hubMeqsedKindOf(r) === 'exist_system';
    if (filter === 'xidmet') return !!(r && r.isService) || hubMeqsedKindOf(r) === 'new_service' || hubMeqsedKindOf(r) === 'exist_service';
    return true;
}

function hubSortMode() {
    if (ui.hubSort === 'asc' || ui.hubSort === 'date') return ui.hubSort;
    return 'desc';
}

function hubRowTime(r) {
    var t = Number(r && r.time) || 0;
    if (t) return t;
    var d = hubParseDateKey(r && r.date);
    if (d != null) return d;
    var y = Number(r && r.year);
    return y ? y * 10000 : 0;
}

function hubParseDateKey(s) {
    var t = String(s == null ? '' : s).trim();
    var m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return Number(m[3] + pad2(Number(m[2])) + pad2(Number(m[1])));
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Number(m[1] + pad2(Number(m[2])) + pad2(Number(m[3])));
    return null;
}

function sortHubRows(list, section, mode) {
    var rows = (list || []).slice();
    var byDate = section === 'meqsed' || mode === 'date';
    if (byDate) {
        var newestFirst = mode !== 'asc';
        return rows.sort(function(a, b) {
            var ta = hubRowTime(a);
            var tb = hubRowTime(b);
            if (ta !== tb) return newestFirst ? (tb - ta) : (ta - tb);
            return fold(a && a.qurum).localeCompare(fold(b && b.qurum), 'az');
        });
    }
    var sign = mode === 'asc' ? 1 : -1;
    return rows.sort(function(a, b) {
        var sa = a && a.score;
        var sb = b && b.score;
        var aN = sa == null || !isFinite(sa);
        var bN = sb == null || !isFinite(sb);
        if (aN && bN) {
            var ta = hubRowTime(a);
            var tb = hubRowTime(b);
            if (ta !== tb) return tb - ta;
            return fold(a && a.qurum).localeCompare(fold(b && b.qurum), 'az');
        }
        if (aN) return 1;
        if (bN) return -1;
        if (sa !== sb) return (sa - sb) * sign;
        return fold(a && a.qurum).localeCompare(fold(b && b.qurum), 'az');
    });
}

function hubFilterLabel(key) {
    if (!key || key === 'all') return '';
    if (key === 'orgs') return ui.hub === 'exq' || ui.hub === 'isq' ? 'Əhatə olunan qurumlar' : 'Müraciət edən qurumlar';
    if (key === 'has_result') return 'Nəticəsi olan';
    if (key === 'no_result') return 'Nəticəsiz';
    if (key === 'svc_sum') return 'Xidməti olan';
    if (key === 'done') return 'Tamamlanmış';
    if (key === 'in_progress') return 'İcradadır';
    if (key === 'review') return 'Rəydə';
    if (key === 'not_started') return 'İcraya başlanmayıb';
    if (key === 'pos') return 'Müsbət rəy';
    if (key === 'neg') return 'Mənfi rəy';
    if (key === 'revision') return 'Düzəlişə göndərilib';
    if (key === 'baxilir') return 'İcradadır';
    if (key === 'sistem') return 'Sistem';
    if (key === 'xidmet') return 'Xidmət';
    if (MEQSED_NOVU_LABELS && MEQSED_NOVU_LABELS[key]) return MEQSED_NOVU_LABELS[key];
    if (key === 'svc_sum') return 'Xidməti olan';
    if (key.indexOf('star_') === 0) return exqStarLabel(Number(key.slice(5))) || key;
    if (key.indexOf('exq_stage_') === 0) {
        var stageKey = key.slice('exq_stage_'.length);
        var stageDef = (EXQ_DIGIT_STAGES || []).filter(function(d) { return d.key === stageKey; })[0];
        return (stageDef && (stageDef.short || stageDef.name)) || stageKey;
    }
    return key;
}

function hubTableHtml(view) {
    var q = fold(ui.hubSearch || '');
    var list = (view.rows || []).filter(function(r) {
        if (!hubRowMatchesFilter(view.section, r, ui.hubFilter)) return false;
        if (!q) return true;
        return fold(r.qurum).indexOf(q) !== -1
            || fold(r.result || '').indexOf(q) !== -1
            || fold(r.novu || '').indexOf(q) !== -1
            || fold(r.netice || '').indexOf(q) !== -1
            || fold(r.key || '').indexOf(q) !== -1
            || fold(r.status || '').indexOf(q) !== -1;
    });
    if (view.section === 'exq') {
        /* Həmişə bütün qurumlar — xidmətsizlər də siyahıda qalır */
        list = collapseExqHubRows(list, true);
    }
    else if (ui.hubFilter === 'orgs') list = uniqueHubOrgs(list);
    list = sortHubRows(list, view.section, hubSortMode());
    var pages = Math.max(1, Math.ceil(list.length / HUB_PAGE_SIZE) || 1);
    if (ui.hubPage > pages) ui.hubPage = pages;
    if (ui.hubPage < 1) ui.hubPage = 1;
    var slice = list.slice((ui.hubPage - 1) * HUB_PAGE_SIZE, ui.hubPage * HUB_PAGE_SIZE);
    var heads;
    if (view.section === 'exq') heads = ['№', 'Qurum', 'İl', 'Xidmət', 'Yekun', 'Status', ''];
    else if (view.section === 'meqsed') heads = ['№', 'Qurum', 'Müraciət növü', 'Rəy', 'Tarix'];
    else if (view.section === 'isq') heads = ['№', 'Qurum', 'İl', 'Yekun', 'Status'];
    else heads = ['№', 'Qurum', 'İl', 'Bal', 'Status'];
    var body = slice.map(function(r, i) {
        var rank = (ui.hubPage - 1) * HUB_PAGE_SIZE + i + 1;
        var href = r.key ? jiraBrowseUrl(r.key) : '';
        var detailId = r.key || r.qurum || '';
        var click = '';
        if (view.section === 'isq' && detailId) {
            click = ' class="is-click" onclick="nk303Call(\'hubDetail\',\'' + qarg(detailId) + '\')"'
                + ' title="Qurum kartını aç: ' + esc(r.qurum || detailId) + '"';
        } else if (href) {
            click = ' class="is-click" onclick="nk303Call(\'hubOpen\',\'' + qarg(r.key) + '\')" title="Jira-da aç: ' + esc(r.key) + '"';
        }
        var eyeId = r.key || fold(r.qurum) || '';
        var eyeBtn = (view.section === 'exq' && eyeId)
            ? '<button type="button" class="nk303-eye-btn" title="Mərhələlər üzrə nəticə və hədəf"'
                + ' aria-label="Mərhələlərə bax: ' + esc(r.qurum) + '"'
                + ' onclick="event.stopPropagation(); nk303Call(\'exqStages\',\'' + qarg(eyeId) + '\')">'
                + iconSvg('eye') + '</button>'
            : '';
        var cells = '<td class="num">' + rank + '</td>'
            + '<td class="q" title="' + esc(r.qurum) + (r.key ? ' · ' + esc(r.key) : '') + '">'
            + (view.section === 'isq'
                ? esc(r.qurum)
                : (href
                    ? '<a class="nk303-qurum-link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">' + esc(r.qurum) + '</a>'
                    : esc(r.qurum)))
            + '</td>';
        if (view.section === 'meqsed') {
            var op = hubOpinionLabel(r.opinion || (r.resultKey === 'baxilir' ? 'baxilir' : ''));
            cells += '<td class="q">' + esc(clipText(r.novu || '—', 80)) + '</td>'
                + '<td><span class="nk303-pri is-' + op.id + '">' + esc(op.label) + '</span></td>'
                + '<td>' + esc(r.date || '—') + '</td>';
        } else if (view.section === 'exq') {
            cells += '<td class="num">' + esc(r.year || '—') + '</td>'
                + '<td class="num">' + esc(r.svc == null ? '—' : String(r.svc)) + '</td>'
                + '<td>' + hubYekunCellHtml(r, 'exq') + '</td>'
                + '<td>' + esc(r.status || '—') + '</td>'
                + '<td class="nk303-eye-cell">' + eyeBtn + '</td>';
        } else if (view.section === 'isq') {
            cells += '<td class="num">' + esc(r.year || '—') + '</td>'
                + '<td>' + hubYekunCellHtml(r, 'isq') + '</td>'
                + '<td>' + esc(r.status || '—') + '</td>';
        } else {
            var sw = r.score == null ? 0 : Math.max(0, Math.min(100, r.score));
            cells += '<td class="num">' + esc(r.year || '—') + '</td>'
                + '<td><div class="nk303-scorecell"><b>' + esc(r.score == null ? '—' : fmt1(r.score)) + '</b>'
                + '<span class="bar"><i style="width:' + sw + '%;background:' + barColor(r.score) + '"></i></span></div></td>'
                + '<td>' + esc(r.status || '—') + '</td>';
        }
        return '<tr' + click + '>' + cells + '</tr>';
    }).join('');
    var pager = '';
    if (list.length) {
        var n;
        pager = '<div class="nk303-pager">'
            + '<button type="button" ' + (ui.hubPage <= 1 ? 'disabled' : '') + ' onclick="nk303Call(\'hubPage\',' + (ui.hubPage - 1) + ')">‹</button>';
        for (n = 1; n <= pages; n++) {
            pager += '<button type="button" class="' + (n === ui.hubPage ? 'is-on' : '') + '" onclick="nk303Call(\'hubPage\',' + n + ')">' + n + '</button>';
        }
        pager += '<button type="button" ' + (ui.hubPage >= pages ? 'disabled' : '') + ' onclick="nk303Call(\'hubPage\',' + (ui.hubPage + 1) + ')">›</button></div>';
    }
    var filterChip = '';
    if (ui.hubFilter && ui.hubFilter !== 'all') {
        filterChip = '<button type="button" class="nk303-hub-chip" onclick="nk303Call(\'hubFilter\',\'all\')">'
            + esc(hubFilterLabel(ui.hubFilter)) + ' ×</button>';
    }
    var sort = hubSortMode();
    return '<div class="nk303-list-head">'
        + '<h3>' + esc(ui.hubFilter && ui.hubFilter !== 'all' ? hubFilterLabel(ui.hubFilter) : 'Qurumlar üzrə nəticələr') + '</h3>'
        + '<div class="nk303-list-tools">'
        + '<div class="nk303-hub-search">' + iconSvg('search')
        + '<input type="search" value="' + esc(ui.hubSearch || '') + '" placeholder="Qurum adı ilə axtar..."'
        + ' oninput="nk303Call(\'hubSearch\', this.value)"></div>'
        + '<select class="nk303-select nk303-hub-sort" aria-label="Sıralama" onchange="nk303Call(\'hubSort\', this.value)">'
        + (view.section === 'meqsed'
            ? optionHtml('date', 'Tarixə görə (yenidən köhnəyə)', sort)
                + optionHtml('asc', 'Tarixə görə (köhnədən yeniə)', sort)
            : optionHtml('date', 'Tarixə görə', sort)
                + optionHtml('desc', 'Bal üzrə (çoxdan aza)', sort)
                + optionHtml('asc', 'Bal üzrə (azdan çoxa)', sort))
        + '</select></div></div>'
        + '<div class="nk303-hub-tools">'
        + filterChip
        + '<p class="nk303-hint" style="margin:0">' + list.length
        + (view.section === 'exq' ? ' qurum' : ' qeyd')
        + (view.section !== 'exq' && view.rows && list.length !== view.rows.length ? ' / ' + view.rows.length : '')
        + (view.section === 'isq'
            ? ' · sətirə klikləyib qurum kartını açın'
            : (slice.some(function(r) { return r.key; }) ? ' · sətirə klikləyib tapşırığı Jira-da açın' : ''))
        + '</p></div>'
        + (list.length
            ? '<div class="nk303-table-wrap"><table class="nk303-table'
                + (view.section === 'exq' ? ' nk303-table--exq' : '')
                + '"><thead><tr>'
                + heads.map(function(h) {
                    return '<th' + (!h ? ' class="nk303-eye-cell"' : '') + '>'
                        + (h ? esc(h) : '<span class="sr-only">Mərhələlər</span>')
                        + '</th>';
                }).join('')
                + '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager
            : '<p class="nk303-empty">' + esc(
                (ui.hubFilter && ui.hubFilter !== 'all') || ui.hubSearch
                    ? 'Bu filtrə uyğun müraciət yoxdur'
                    : NA
            ) + '</p>');
}

function meqsedKindShareHtml(st) {
    st = st || {};
    var order = (MEQSED_NOVU_KINDS || []).slice();
    var otherN = (st.byKind && st.byKind.other) || 0;
    var otherSplit = (st.byKindResult && st.byKindResult.other) || {};
    if (otherN || otherSplit.total) order.push('other');
    var tones = [
        { key: 'pos', color: OPINION.pos },
        { key: 'neg', color: OPINION.neg },
        { key: 'revision', color: OPINION.revision },
        { key: 'baxilir', color: OPINION.baxilir }
    ];
    var rows = order.map(function(kind) {
        var split = (st.byKindResult && st.byKindResult[kind]) || {};
        var n = split.total || (st.byKind && st.byKind[kind]) || 0;
        var on = ui.hubFilter === kind;
        var segs = tones.map(function(t) {
            var v = split[t.key] || 0;
            if (!v) return '';
            return '<i style="flex-grow:' + v + ';background:' + t.color + '"></i>';
        }).join('');
        return '<button type="button" class="nk303-kindshare-row' + (on ? ' is-on' : '') + '"'
            + ' onclick="nk303Call(\'hubFilter\',\'' + kind + '\')">'
            + '<span>' + esc((MEQSED_NOVU_LABELS && MEQSED_NOVU_LABELS[kind]) || kind) + '</span>'
            + '<div class="nk303-kindshare-bar">' + (segs || '<i class="is-empty"></i>') + '</div>'
            + '<b>' + n + '</b>'
            + '</button>';
    }).join('');
    return '<div class="nk303-kindshare">' + (rows || '<p class="nk303-empty">' + esc(NA) + '</p>') + '</div>';
}

function meqsedHubExtraHtml(st) {
    st = st || {};
    var hasMonth = (st.byMonth || []).some(function(m) { return m && m.total > 0; });
    var orgs = st.topQurums || [];
    var orgHtml = orgs.length
        ? '<div class="nk303-orgpie">'
            + '<div class="nk303-orgpie-chart"><canvas id="meqsedTopOrgChart" aria-label="Ən çox müraciət edən qurumlar"></canvas></div>'
            + '<ul class="nk303-orgpie-legend" id="meqsedTopOrgLegend" aria-label="Qurum payı"></ul>'
            + '</div>'
        : '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<div class="nk303-mid nk303-mid--two nk303-mid--meqsed-extra">'
        + '<section class="nk303-card">'
        + '<div class="nk303-extra-head">'
        + '<h3>Aylıq axın</h3>'
        + '<ul class="nk303-mini-legend" aria-label="Rəy rəngləri">'
        + '<li><i style="background:' + OPINION.pos + '"></i>Müsbət</li>'
        + '<li><i style="background:' + OPINION.neg + '"></i>Mənfi</li>'
        + '<li><i style="background:' + OPINION.revision + '"></i>Düzəliş</li>'
        + '<li><i style="background:' + OPINION.baxilir + '"></i>İcradadır</li>'
        + '</ul></div>'
        + (hasMonth
            ? '<div class="nk303-chart nk303-chart--trend nk303-chart--month"><canvas id="meqsedMonthChart" aria-label="Aylıq müraciət axını"></canvas></div>'
            : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section>'
        + '<section class="nk303-card"><h3>Ən çox müraciət edən qurumlar</h3>'
        + orgHtml
        + '</section></div>';
}

var MQ_COLORS = {
    pos: '#1a9b64',
    neg: '#e25d6c',
    revision: '#7b68d6',
    baxilir: '#c9c3d4',
    org: '#0e2744'
};
var MQ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

function mqOfSuffix(n) {
    var v = Math.abs(parseInt(n, 10) || 0);
    var tens = v % 100;
    if (v && tens === 0) return 'ü';
    if (tens === 10 || tens === 30) return 'u';
    if (tens === 20 || tens === 50) return 'si';
    if (tens === 40 || tens === 60 || tens === 90) return 'ı';
    if (tens === 70 || tens === 80) return 'i';
    var d = v % 10;
    if (d === 2 || d === 7) return 'si';
    if (d === 6) return 'sı';
    if (d === 3 || d === 4) return 'ü';
    if (d === 9) return 'u';
    if (!d) return 'ı';
    return 'i';
}

function mqOpinionItems(st) {
    st = st || {};
    return [
        { key: 'pos', label: 'Müsbət', n: st.pos || 0, color: MQ_COLORS.pos, filter: 'pos' },
        { key: 'neg', label: 'Mənfi', n: st.neg || 0, color: MQ_COLORS.neg, filter: 'neg' },
        { key: 'revision', label: 'Düzəliş', n: st.other || 0, color: MQ_COLORS.revision, filter: 'revision' },
        { key: 'baxilir', label: 'İcradadır', n: st.icrada != null ? st.icrada : (st.baxilir || 0), color: MQ_COLORS.baxilir, filter: 'baxilir' }
    ];
}

function mqFilterOn(key) {
    var f = ui.hubFilter || '';
    if (key === 'all') return !f;
    return f === key;
}

function mqHit(key) {
    return 'nk303Call(\'hubFilter\',\'' + key + '\')';
}

function mqHeroSentence(st) {
    var total = st.total || 0;
    var pos = st.pos || 0;
    if (!total) return 'Bu dövrdə müraciət yoxdur.';
    var icrada = st.icrada != null ? st.icrada : (st.baxilir || 0);
    return total + ' müraciətin ' + pos + '-' + mqOfSuffix(pos)
        + ' müsbət rəy aldı. ' + (st.qurum || 0) + ' unikal qurum müraciət edib, icradadır: '
        + icrada + '.';
}

function mqMixHtml(items) {
    var segs = items.filter(function(it) { return it.n > 0; });
    if (!segs.length) return '<div class="mq-mix is-empty" aria-hidden="true"></div>';
    return '<div class="mq-mix" role="img" aria-label="Rəyin nəticəsi">' + segs.map(function(it) {
        var on = mqFilterOn(it.filter);
        return '<button type="button"' + (on ? ' class="is-on"' : '')
            + ' style="flex:' + it.n + ' 1 0;background:' + it.color + '"'
            + ' title="' + esc(it.label) + ': ' + it.n + '"'
            + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
            + ' onclick="' + mqHit(it.filter) + '"></button>';
    }).join('') + '</div>';
}

function mqLegendHtml(items, total, cls, compact) {
    return '<ul class="' + (cls || 'mq-legend') + '">' + items.map(function(it) {
        var on = mqFilterOn(it.filter);
        return '<li><button type="button" class="mq-leg' + (on ? ' is-on' : '') + '"'
            + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
            + ' onclick="' + mqHit(it.filter) + '">'
            + '<i style="background:' + it.color + '"></i>'
            + '<span>' + esc(it.label) + '</span>'
            + (compact ? '' : '<b>' + it.n + '</b><em>' + pct(it.n, total) + '%</em>')
            + '</button></li>';
    }).join('') + '</ul>';
}

function mqKpi(label, value, sub, filter, tone) {
    var on = mqFilterOn(filter);
    return '<button type="button" class="mq-kpi' + (tone ? ' ' + tone : '') + (on ? ' is-on' : '') + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + ' onclick="' + mqHit(filter) + '">'
        + '<span>' + esc(label) + '</span>'
        + '<strong>' + esc(String(value)) + '</strong>'
        + '<em>' + esc(sub) + '</em>'
        + '</button>';
}

function mqKindRows(st) {
    var order = (MEQSED_NOVU_KINDS || []).slice();
    if ((st.byKind && st.byKind.other) || 0) order.push('other');
    var rows = order.map(function(kind, idx) {
        var split = (st.byKindResult && st.byKindResult[kind]) || {};
        var n = split.total || (st.byKind && st.byKind[kind]) || 0;
        return { kind: kind, n: n, split: split, idx: idx };
    }).filter(function(r) { return r.n > 0; });
    rows.sort(function(a, b) { return (b.n - a.n) || (a.idx - b.idx); });
    return rows;
}

function mqKindHtml(st) {
    var rows = mqKindRows(st);
    if (!rows.length) return '<p class="mq-empty">Müraciət növü yoxdur.</p>';
    var h = Math.min(280, Math.max(120, rows.length * 28 + 28));
    var legend = '<ul class="mq-kind-legend" aria-label="Rəy rəngləri">'
        + mqOpinionItems(st).map(function(t) {
            return '<li><i style="background:' + t.color + '"></i>' + esc(t.label) + '</li>';
        }).join('')
        + '</ul>';
    return '<div class="mq-kind-chart" style="--mq-kind-h:' + h + 'px">'
        + '<canvas id="mqKindChart" aria-label="Müraciət növü üzrə nəticə"></canvas>'
        + '</div>' + legend;
}

var MQ_KIND_COLORS = {
    new_system: '#2f6fed',
    exist_system: '#1a9b64',
    new_service: '#e39b3a',
    exist_service: '#e25d6c',
    fiziki: '#0e7490',
    rsd: '#7b68d6',
    cloud: '#64748b',
    other: '#94a3b8'
};

function mqKindColor(kind) {
    return MQ_KIND_COLORS[kind] || '#94a3b8';
}

function mqKindSeries(st, kind) {
    var months = (st && st.byKindMonth) || [];
    var out = [];
    var i;
    for (i = 0; i < 12; i++) {
        var bucket = months[i] || {};
        out.push(Number(bucket[kind]) || 0);
    }
    return out;
}

function mqDynSub(view) {
    var period = (view && view.period) || '';
    if (period && period !== 'Bütün illər') return 'Hər ay müraciət növünə görə say, ' + period;
    return 'Hər ay müraciət növünə görə say';
}

function mqKindDynSeries(st) {
    return mqKindRows(st).map(function(r) {
        return {
            kind: r.kind,
            n: r.n,
            label: (MEQSED_NOVU_LABELS && MEQSED_NOVU_LABELS[r.kind]) || r.kind,
            color: mqKindColor(r.kind),
            data: mqKindSeries(st, r.kind)
        };
    });
}

var MQ_KIND_SHORT = {
    new_system: 'Yeni sistem',
    new_service: 'Yeni xidmət',
    exist_system: 'Mövcud sistem',
    exist_service: 'Mövcud xidmət',
    fiziki: 'Fiziki → rəqəmsal',
    rsd: 'RSD',
    cloud: 'Hökumət buludu',
    other: 'Digər'
};

function mqKindDynamicsHtml(st) {
    var series = mqKindDynSeries(st);
    if (!series.length) return '<p class="mq-empty">Müraciət növü yoxdur.</p>';
    var kindOn = (MEQSED_NOVU_KINDS || []).concat(['other']).indexOf(ui.hubFilter) >= 0;
    var legend = '<ul class="mq-dyn-legend" aria-label="Müraciət növləri">' + series.map(function(s) {
        var on = mqFilterOn(s.kind);
        var dim = kindOn && !on;
        var short = MQ_KIND_SHORT[s.kind] || s.label;
        return '<li><button type="button" class="mq-dyn-leg' + (on ? ' is-on' : '') + (dim ? ' is-dim' : '') + '"'
            + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
            + ' title="' + esc(s.label) + '"'
            + ' onclick="' + mqHit(s.kind) + '">'
            + '<i style="background:' + s.color + '"></i>'
            + '<span>' + esc(short) + '</span>'
            + '<b>' + s.n + '</b>'
            + '</button></li>';
    }).join('') + '</ul>';
    return '<div class="mq-dyn-chart" id="mqKindDynChart" role="img" aria-label="Müraciət növü üzrə aylıq dinamika"></div>'
        + legend;
}

function mqOrgBlock(st) {
    var rows = (st.topQurums || []).filter(function(r) { return r && r.n > 0; }).slice(0, 5);
    if (!rows.length) return { note: '', html: '<p class="mq-empty">Qurum müraciəti yoxdur.</p>' };
    var max = rows[0].n || 1;
    var sum = rows.reduce(function(s, r) { return s + (r.n || 0); }, 0);
    var html = '<div class="mq-orgs">' + rows.map(function(r) {
        var w = Math.max(1, Math.round((r.n / max) * 100));
        var raw = String(r.name || '');
        var name = raw
            .replace(/^Azərbaycan Respublikasının\s+/i, '')
            .replace(/^Azərbaycan Respublikası\s+/i, '')
            .trim() || raw;
        return '<button type="button" class="mq-org" title="' + esc(raw) + '"'
            + ' onclick="nk303Call(\'hubOrg\',\'' + qarg(raw) + '\')">'
            + '<span>' + esc(name) + '</span>'
            + '<div class="mq-org-track" aria-hidden="true"><i style="width:' + w + '%"></i></div>'
            + '<b>' + r.n + '</b>'
            + '</button>';
    }).join('') + '</div>';
    return { note: sum + ' müraciət üzrə ilk ' + rows.length + ' qurum', html: html };
}

function mqFlowSub(view) {
    var period = (view && view.period) || '';
    if (period && period !== 'Bütün illər') return 'Rəy statusuna görə müraciətlərin sayı, ' + period;
    return 'Rəy statusuna görə müraciətlərin sayı';
}

function meqsedDashHtml(view) {
    var st = (view && view.stats) || {};
    var total = st.total || 0;
    var items = mqOpinionItems(st);
    var posPct = pct(st.pos || 0, total);
    var hasMonth = (st.byMonth || []).some(function(m) { return m && m.total > 0; });
    var flowItems = items.filter(function(it) { return it.key !== 'baxilir' || it.n > 0; });
    var orgs = mqOrgBlock(st);
    return '<div class="mq-dash">'
        + '<section class="mq-hero">'
        + '<div class="mq-hero-top">'
        + '<b class="mq-hero-pct' + (total ? '' : ' is-empty') + '">' + (total ? posPct + '%' : '—') + '</b>'
        + '<p>' + esc(mqHeroSentence(st)) + '</p>'
        + '</div>'
        + mqMixHtml(items)
        + mqLegendHtml(items, total)
        + '</section>'
        + '<div class="mq-kpis">'
        + mqKpi('Ümumi müraciət', total, (st.icrada != null ? st.icrada : (st.baxilir || 0)) + ' icradadır', 'all', '')
        + mqKpi('Müraciət edən qurum', st.qurum || 0, 'unikal qurum', 'orgs', '')
        + mqKpi('Müsbət rəy', st.pos || 0, 'nəticə', 'pos', 'is-pos')
        + mqKpi('Mənfi rəy', st.neg || 0, 'nəticə', 'neg', 'is-neg')
        + '</div>'
        + '<div class="mq-grid">'
        + '<section class="mq-card mq-card--kinds">'
        + '<h3>Müraciət növü üzrə nəticə</h3>'
        + '<p class="mq-sub">Ümumi ' + total + ' müraciət · növə klikləyib filtrləyin</p>'
        + mqKindHtml(st)
        + '</section>'
        + '<section class="mq-card mq-card--dyn">'
        + '<h3>Müraciət növü üzrə dinamika</h3>'
        + '<p class="mq-sub">' + esc(mqDynSub(view)) + '</p>'
        + mqKindDynamicsHtml(st)
        + '</section>'
        + '</div>'
        + '<div class="mq-grid">'
        + '<section class="mq-card">'
        + '<h3>Aylıq axın</h3>'
        + '<p class="mq-sub">' + esc(mqFlowSub(view)) + '</p>'
        + (hasMonth
            ? '<div class="mq-month"><canvas id="meqsedMonthChart" aria-label="Aylıq müraciət axını"></canvas></div>'
                + mqLegendHtml(flowItems, total, 'mq-legend mq-legend--flow', true)
            : '<p class="mq-empty">Aylıq məlumat yoxdur.</p>')
        + '</section>'
        + '<section class="mq-card">'
        + '<h3>Ən çox müraciət edən qurumlar</h3>'
        + (orgs.note ? '<p class="mq-sub">' + esc(orgs.note) + '</p>' : '<p class="mq-sub">İlk 5 qurum</p>')
        + orgs.html
        + '</section>'
        + '</div>'
        + '</div>';
}

function hubBodyHtml(view) {
    if (view.section === 'meqsed') {
        return meqsedDashHtml(view)
            + '<section class="nk303-card" id="nk303HubList">'
            + hubTableHtml(view)
            + '</section>';
    }
    var st = view.stats || {};
    var vis = hubVisCounts(st.byStatus);
    var total = st.qurum || 0;
    var donePct = pct(vis.done, total);
    var avg = view.section === 'exq' && st.weightedAvg != null ? st.weightedAvg : st.avg;
    var rankHtml = '';
    var isRadar = view.section === 'diag' || view.section === 'self' || view.section === 'isq';
    var isqRadarTarget = view.section === 'isq' && st.radarHasTarget !== false;
    if (isRadar) {
        rankHtml = '<ol class="nk303-rank">'
            + (st.dirRadar || []).map(function(d, i) {
                var goal = view.section === 'isq'
                    ? (isqRadarTarget ? (d.target != null ? d.target : exqStarTarget(d.avg)) : null)
                    : maturityTarget(d.avg);
                return '<li title="Mövcud: ' + esc(d.avg == null ? '—' : fmt1(d.avg))
                    + (goal == null ? '' : (' · Hədəf: ' + esc(fmt1(goal)))) + '">'
                    + '<i>' + (i + 1) + '</i>'
                    + '<span>' + esc(d.short || d.title) + '</span>'
                    + '<b>' + esc(d.avg == null ? '—' : fmt1(d.avg)) + '</b>'
                    + (goal == null ? '<em></em>' : ('<em>' + esc(fmt1(goal)) + '</em>'))
                    + '</li>';
            }).join('')
            + '</ol>';
    }
    var legendItems = view.section === 'meqsed'
        ? meqsedOpinionItems(st)
        : VIS_STATUS.map(function(s) {
            return { id: s.id, label: s.label, n: vis[s.id] || 0, color: VIS_COLORS[s.id], filter: s.id };
        });
    if (ui.hubFilter) {
        var onlyLeg = legendItems.filter(function(s) { return s.filter === ui.hubFilter; });
        if (onlyLeg.length) legendItems = onlyLeg;
    }
    var legend = '<ul class="nk303-status-legend">'
        + legendItems.map(function(s) {
            var n = s.n || 0;
            var den = view.section === 'meqsed' ? (st.total || 0) : total;
            var on = s.filter && ui.hubFilter === s.filter;
            var inner = '<i style="background:' + s.color + '"></i>'
                + '<span>' + esc(s.label) + '</span>'
                + '<b>' + n + '</b>'
                + '<em>' + (den ? pct(n, den) + '%' : '0%') + '</em>';
            if (s.filter) {
                return '<li class="is-click' + (on ? ' is-on' : '') + '" onclick="nk303Call(\'hubFilter\',\'' + s.filter + '\')">'
                    + inner + '</li>';
            }
            return '<li>' + inner + '</li>';
        }).join('')
        + '</ul>';
    var midLeftTitle = view.section === 'meqsed' ? 'Rəy payı'
        : (view.section === 'exq' ? 'Yekun nəticə' : 'Ümumi nəticə');
    var midRightTitle = view.section === 'isq'
        ? (st.radarTitle || 'Ulduz səviyyələri')
        : (view.section === 'diag'
            ? (st.radarTitle || 'Qiymətləndirmə meyarları')
            : (isRadar ? 'Rəqəmsallaşma istiqamətləri'
                : (view.section === 'exq' ? 'Qurumların yekun nəticəsi'
                    : (view.section === 'meqsed' ? 'Müraciət növü üzrə nəticə' : 'Bal diapazonu'))));
    var radarLegend = view.section === 'isq'
        ? (isqRadarTarget
            ? compareLegendHtml(ISQ_RADAR_NOW, ISQ_RADAR_GOAL)
            : '<ul class="nk303-compare-legend" aria-hidden="false">'
                + '<li class="is-now" style="--nk-now:' + exqBarColor(avg) + '">Mövcud vəziyyət</li>'
                + '</ul>')
        : compareLegendHtml(barColor(avg), barColor(maturityTarget(avg)));
    var midRight = isRadar
        ? '<div class="nk303-hub-radar">'
            + radarLegend
            + '<div class="nk303-radar-row">'
            + '<div class="nk303-chart nk303-chart--radar"><canvas id="nkHubRadar"></canvas></div>'
            + rankHtml + '</div></div>'
        : (view.section === 'meqsed'
            ? meqsedKindShareHtml(st)
            : '<div class="nk303-chart nk303-chart--trend nk303-chart--exq-bars" style="height:'
                + (view.section === 'exq' ? exqBarChartHeightRem(exqQurumsForChart(st)) : 16)
                + 'rem"><canvas id="nkHubBars"></canvas></div>');
    var statusTitle = view.section === 'meqsed' ? 'Rəy vəziyyəti' : 'Qiymətləndirmələrin icra vəziyyəti';
    var isqFormula = 'Ölkə üzrə yekun nəticə bütün qurumların İSQ yekununun ortalamasıdır. '
        + 'Hər qurumun yekunu Qərar 380, bənd 4.14–4.16 üzrə (toplanmış / mümkün × 100) hesablanır, '
        + 'sonra bənd 4.18 ulduz şkalasına salınır.';
    var gaugeHtml = view.section === 'meqsed'
        ? '<div class="nk303-chart nk303-chart--donut"><canvas id="nkHubDonut"></canvas></div>'
        : (view.section === 'isq'
            ? hubExqGaugeHtml(avg, isqFormula)
            : hubGaugeHtml(avg, isRadar));
    var midBlock = '';
    if (view.section !== 'exq') {
        midBlock = '<div class="nk303-mid' + (view.section === 'meqsed' ? ' nk303-mid--meqsed' : '') + '">'
            + '<section class="nk303-card nk303-card--gauge"><h3>' + esc(midLeftTitle) + '</h3>'
            + gaugeHtml
            + '</section>'
            + '<section class="nk303-card nk303-card--radar"><h3>' + esc(midRightTitle) + '</h3>'
            + midRight
            + '</section>'
            + '<section class="nk303-card nk303-card--status"><h3>' + esc(statusTitle) + '</h3>'
            + (view.section === 'meqsed'
                ? '<p class="nk303-hint" style="margin-top:0">Yeni / mövcud və sistem / xidmət kəsimi</p>'
                    + '<div class="nk303-chart nk303-chart--trend" style="height:9.2rem"><canvas id="nkHubLife"></canvas></div>'
                : '<div class="nk303-chart nk303-chart--donut"><canvas id="nkHubDonut"></canvas></div>')
            + legend
            + (view.section === 'meqsed' ? '' : ('<div class="nk303-complete is-click" onclick="nk303Call(\'hubFilter\',\'done\')" title="Tamamlanmış qiymətləndirmələrə bax">'
                + '<div class="nk303-complete-top"><span>Tamamlanma faizi</span><b>' + donePct + '%</b></div>'
                + '<div class="nk303-mini-bar is-green"><i style="width:' + donePct + '%"></i></div></div>'))
            + '</section></div>';
    }
    var digitBlock = '';
    if (view.section === 'exq') {
        digitBlock = '<div id="serviceDigitizationMount" class="nk303-exq-digit">'
            + serviceDigitizationHtml(st.digitization)
            + '</div>';
    }
    return (view.section === 'exq' ? '' : hubKpisHtml(view))
        + midBlock
        + (view.section === 'meqsed' ? meqsedHubExtraHtml(st) : '')
        + digitBlock
        + '<section class="nk303-card" id="nk303HubList">'
        + hubTableHtml(view)
        + '</section>';
}

function hubSheetHtml(view) {
    var period = view.period || getAssessmentPeriodLabel() || 'Bütün illər';
    return '<div class="nk303-hub-sheet">'
        + '<div class="nk303-hub-head">'
        + '<div>'
        + '<p class="nk303-kicker">Diaqnostika və qiymətləndirmə</p>'
        + '<h2 id="nk303HubTitle">' + esc(view.label) + ' nəticələri</h2>'
        + '<p class="sub">Dövr: ' + esc(period) + '</p>'
        + '</div>'
        + '<button type="button" class="nk303-hub-close" onclick="nk303Call(\'closeHub\')" aria-label="Bağla">'
        + iconSvg('close') + '</button>'
        + '</div>'
        + '<div class="nk303-hub-navwrap"><div class="nk303-hub-navrow">' + hubNavHtml() + hubYearFilterHtml(view.section) + '</div></div>'
        + '<div class="nk303-hub-body">' + hubBodyHtml(view) + '</div>'
        + '</div>';
}

function drawHubCharts(view) {
    destroyHubCharts();
    if (typeof Chart === 'undefined') return;
    var st = view.stats || {};
    var avg = view.section === 'exq' && st.weightedAvg != null ? st.weightedAvg : st.avg;
    var use380 = view.section === 'exq' || view.section === 'isq';
    if (document.getElementById('nkHubGauge')) {
        var empty = avg == null;
        var v = empty ? 0 : Math.max(0, Math.min(100, avg));
        var col = empty ? '#cbd5e1' : (use380 ? exqBarColor(avg) : barColor(avg));
        makeHubChart('nkHubGauge', {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: empty ? [1] : [Math.max(v, 0.4), Math.max(100 - v, 0.4)],
                    backgroundColor: empty ? ['#e8eef5'] : [col, '#e8eef5'],
                    borderWidth: 0,
                    hoverOffset: 0,
                    borderRadius: empty ? 0 : 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%',
                rotation: -90,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [centerTextPlugin('nkHubGaugeCenter', [
                { text: avg == null ? '—' : fmt1(avg), color: '#0f2744', font: '800 26px Inter, system-ui, sans-serif', gap: 20 },
                { text: use380 ? '%' : '/ 100', color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])]
        });
    }
    if (document.getElementById('nkHubRadar')) {
        var dirs = (st.dirRadar || []).length
            ? st.dirRadar
            : ((view.section === 'diag' || view.section === 'self')
                ? DIRS.map(function(d) { return { short: dirShort(d), avg: null }; })
                : []);
        var nowHex = view.section === 'isq'
            ? ISQ_RADAR_NOW
            : (use380 ? exqBarColor(avg) : barColor(avg));
        var goalHex = view.section === 'isq' ? ISQ_RADAR_GOAL : barColor(maturityTarget(avg));
        var nowVals = dirs.map(function(d) { return d.avg != null ? d.avg : 0; });
        var goalVals = dirs.map(function(d) {
            if (view.section === 'isq') {
                if (st.radarHasTarget === false) return 0;
                if (d.target != null && isFinite(d.target)) return d.target;
                var step = exqStarTarget(d.avg);
                return step != null ? step : 0;
            }
            var goal = maturityTarget(d.avg);
            return goal != null ? goal : 0;
        });
        if (dirs.length) {
        var radarSets = radarPairDatasets(nowVals, goalVals, nowHex, goalHex);
        if (view.section === 'isq' && st.radarHasTarget === false) radarSets = radarSets.slice(0, 1);
        makeHubChart('nkHubRadar', {
            type: 'radar',
            data: {
                labels: dirs.map(function(d) { return d.short || d.title; }),
                datasets: radarSets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + fmtScore(ctx.parsed.r);
                            }
                        }
                    }
                },
                onClick: function(evt, els) {
                    if (!els || !els.length) return;
                    var d = dirs[els[0].index];
                    if (!d) return;
                    var f = d.filter || 'has_result';
                    nk303Call('hubFilter', f);
                },
                onHover: function(evt, els) {
                    var t = evt && evt.native && evt.native.target;
                    if (t && t.style) t.style.cursor = els && els.length ? 'pointer' : 'default';
                },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: {
                            stepSize: 20,
                            color: '#94a3b8',
                            backdropColor: 'transparent',
                            font: { size: 10, weight: '600' }
                        },
                        grid: { color: 'rgba(148,163,184,0.35)' },
                        angleLines: { color: 'rgba(148,163,184,0.35)' },
                        pointLabels: { color: '#334155', font: { size: dirs.length > 4 ? 10 : 11, weight: '700' } }
                    }
                }
            }
        });
        var hubRadarEl = document.getElementById('nkHubRadar');
        if (hubRadarEl) hubRadarEl.style.cursor = 'pointer';
        }
    }
    if (document.getElementById('nkHubDonut')) {
        var items;
        var centerN;
        var centerLb;
        if (view.section === 'meqsed') {
            items = meqsedOpinionItems(st);
            centerN = st.qurum || 0;
            centerLb = 'Qurum';
        } else {
            var vis = hubVisCounts(st.byStatus);
            items = VIS_STATUS.map(function(s) {
                return { label: s.label, n: vis[s.id] || 0, color: VIS_COLORS[s.id], filter: s.id };
            });
            centerN = st.qurum || 0;
            centerLb = 'Qurum';
        }
        var sliced = pickDonutSlice(items, ui.hubFilter);
        var donutItems = sliced.donutItems;
        if (sliced.filtered) centerN = sliced.centerN;
        var hubDonutPick = donutPickOptions(function(filter) {
            nk303Call('hubFilter', filter);
        });
        makeHubChart('nkHubDonut', {
            type: 'doughnut',
            data: {
                labels: donutItems.map(function(x) { return x.label; }),
                datasets: [{
                    data: donutItems.map(function(x) { return x.n; }),
                    backgroundColor: donutItems.map(function(x) { return x.color; }),
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: { legend: { display: false } },
                onClick: hubDonutPick.onClick,
                onHover: hubDonutPick.onHover
            },
            plugins: [centerTextPlugin('nkHubDonutCenter', [
                { text: String(centerN), color: '#0f2744', font: '800 26px Inter, system-ui, sans-serif', gap: 20 },
                { text: centerLb, color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])],
            _donutItems: donutItems
        });
    }
    if (document.getElementById('nkHubBars')) {
        if (view.section === 'exq') {
            var qurums = exqQurumsForChart(st);
            makeHubChart('nkHubBars', {
                type: 'bar',
                data: {
                    labels: qurums.map(function(q) { return wrapAxisLabel(exqQurumLabel(q), 26); }),
                    datasets: [{
                        data: qurums.map(function(q) {
                            return q.score != null && isFinite(q.score) ? q.score : 0;
                        }),
                        backgroundColor: qurums.map(function(q) {
                            return q.score != null && isFinite(q.score) ? exqBarColor(q.score) : '#cbd5e1';
                        }),
                        borderRadius: 6,
                        borderSkipped: false,
                        maxBarThickness: 14,
                        clip: false
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { left: 6, right: 10, top: 6, bottom: 2 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: function(ctx) {
                                    var row = qurums[ctx && ctx[0] ? ctx[0].dataIndex : -1];
                                    return row ? exqQurumLabel(row) : '';
                                },
                                label: function(ctx) {
                                    var row = qurums[ctx.dataIndex];
                                    if (!row) return '';
                                    var bal = row.score != null && isFinite(row.score) ? fmt1(row.score) + '%' : '—';
                                    var star = exqStarFromPercent(row.score);
                                    var svc = row.svc || 0;
                                    return ' Yekun: ' + bal
                                        + (star ? ' · ' + star + ' ulduz' : '')
                                        + (svc ? ' · ' + svc + ' xidmət' : '');
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            min: 0,
                            max: 100,
                            ticks: { color: '#94a3b8', font: { size: 11 } },
                            grid: { color: 'rgba(148,163,184,0.2)' },
                            border: { display: false }
                        },
                        y: {
                            ticks: {
                                color: '#1e293b',
                                font: { size: 11, weight: '600' },
                                autoSkip: false,
                                padding: 8
                            },
                            afterFit: function(axis) {
                                axis.width = Math.max(axis.width || 0, 188);
                            },
                            grid: { display: false },
                            border: { display: false }
                        }
                    }
                }
            });
        } else {
            var bands = [
                { key: 'score_high', label: '≥ 70', color: '#059669' },
                { key: 'score_mid', label: '40–69', color: '#d97706' },
                { key: 'score_low', label: '< 40', color: '#dc2626' }
            ];
            var byBand = st.byBand || {};
            makeHubChart('nkHubBars', {
                type: 'bar',
                data: {
                    labels: bands.map(function(b) { return b.label; }),
                    datasets: [{
                        data: bands.map(function(b) { return byBand[b.key] || 0; }),
                        backgroundColor: bands.map(function(b) { return b.color; }),
                        borderRadius: 8,
                        maxBarThickness: 42
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                        x: { ticks: { color: '#334155', font: { weight: '700' } }, grid: { display: false } }
                    }
                }
            });
        }
    }
    if (document.getElementById('nkHubLife')) {
        var life = st.byLifeUnit || {};
        function lifeN(k, u, op) {
            return (((life[k] || {})[u] || {})[op]) || 0;
        }
        makeHubChart('nkHubLife', {
            type: 'bar',
            data: {
                labels: ['Yeni sistem', 'Yeni xidmət', 'Mövcud sistem', 'Mövcud xidmət'],
                datasets: [
                    { label: 'Müsbət', backgroundColor: OPINION.pos, data: [lifeN('yeni', 'sistem', 'pos'), lifeN('yeni', 'xidmet', 'pos'), lifeN('movcud', 'sistem', 'pos'), lifeN('movcud', 'xidmet', 'pos')], borderRadius: 6 },
                    { label: 'Mənfi', backgroundColor: OPINION.neg, data: [lifeN('yeni', 'sistem', 'neg'), lifeN('yeni', 'xidmet', 'neg'), lifeN('movcud', 'sistem', 'neg'), lifeN('movcud', 'xidmet', 'neg')], borderRadius: 6 },
                    { label: 'Düzəliş', backgroundColor: OPINION.revision, data: [lifeN('yeni', 'sistem', 'revision'), lifeN('yeni', 'xidmet', 'revision'), lifeN('movcud', 'sistem', 'revision'), lifeN('movcud', 'xidmet', 'revision')], borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, weight: '600' } } } },
                scales: {
                    x: { stacked: true, ticks: { color: '#334155', font: { size: 11, weight: '600' } }, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } }
                }
            }
        });
    }
    drawMeqsedKindChart(st);
    drawMeqsedKindDynChart(st);
    drawMeqsedFlowChart(st);
}

function drawMeqsedKindChart(st) {
    if (typeof Chart === 'undefined' || !st) return;
    var canvas = document.getElementById('mqKindChart');
    if (!canvas) return;
    var rows = mqKindRows(st);
    if (!rows.length) return;
    var series = mqOpinionItems(st);
    var labels = rows.map(function(r) {
        var raw = (MEQSED_NOVU_LABELS && MEQSED_NOVU_LABELS[r.kind]) || r.kind;
        return raw.length > 28 ? raw.slice(0, 27) + '…' : raw;
    });
    var maxN = rows.reduce(function(m, r) { return Math.max(m, r.n || 0); }, 0);
    makeHubChart('mqKindChart', {
        type: 'bar',
        data: {
            labels: labels,
            datasets: series.map(function(it) {
                return {
                    label: it.label,
                    data: rows.map(function(r) { return (r.split && r.split[it.key]) || 0; }),
                    backgroundColor: it.color,
                    borderWidth: 0,
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.78,
                    maxBarThickness: 16,
                    _kinds: rows.map(function(r) { return r.kind; })
                };
            })
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 2, right: 18, left: 0, bottom: 2 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 8,
                    cornerRadius: 8,
                    callbacks: {
                        title: function(items) {
                            var i = items && items[0] ? items[0].dataIndex : -1;
                            var r = rows[i];
                            if (!r) return '';
                            return (MEQSED_NOVU_LABELS && MEQSED_NOVU_LABELS[r.kind]) || r.kind;
                        },
                        label: function(ctx) {
                            return ' ' + ctx.dataset.label + ': ' + (ctx.raw || 0);
                        },
                        footer: function(items) {
                            var i = items && items[0] ? items[0].dataIndex : -1;
                            var r = rows[i];
                            if (!r) return '';
                            var share = (st.total || 0) ? Math.round((r.n / st.total) * 100) : 0;
                            return 'Cəmi: ' + r.n + ' · ' + share + '%';
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    suggestedMax: maxN ? Math.ceil(maxN * 1.08) : undefined,
                    ticks: {
                        precision: 0,
                        maxTicksLimit: 5,
                        color: '#94a3b8',
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.16)' },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    ticks: {
                        autoSkip: false,
                        color: '#475569',
                        font: { size: 10, weight: '600' },
                        callback: function(val) {
                            var t = this.getLabelForValue(val);
                            return t && t.length > 22 ? t.slice(0, 21) + '…' : t;
                        }
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var ds = this.data.datasets[els[0].datasetIndex];
                var kind = ds && ds._kinds ? ds._kinds[els[0].index] : '';
                if (kind) nk303Call('hubFilter', kind);
            },
            onHover: function(evt, els) {
                var target = (evt && evt.native && evt.native.target)
                    || (evt && evt.chart && evt.chart.canvas);
                if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            }
        }
    });
}

function mqDynTangents(ys) {
    var n = ys.length;
    var m = [];
    var t = new Array(n);
    var i;
    for (i = 0; i < n - 1; i++) m[i] = ys[i + 1] - ys[i];
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = (m[i - 1] * m[i] <= 0) ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
        if (Math.abs(m[i]) < 1e-9) { t[i] = 0; t[i + 1] = 0; continue; }
        var a = t[i] / m[i];
        var b = t[i + 1] / m[i];
        var h = a * a + b * b;
        if (h > 9) {
            var tau = 3 / Math.sqrt(h);
            t[i] = tau * a * m[i];
            t[i + 1] = tau * b * m[i];
        }
    }
    return t;
}

function mqDynSamples(values, steps) {
    var n = values.length;
    var tg = mqDynTangents(values);
    var out = [];
    var i;
    var s;
    for (i = 0; i < n - 1; i++) {
        var y0 = values[i];
        var y1 = values[i + 1];
        var c1 = y0 + tg[i] / 3;
        var c2 = y1 - tg[i + 1] / 3;
        var count = i === n - 2 ? steps + 1 : steps;
        for (s = 0; s < count; s++) {
            var t = s / steps;
            var u = 1 - t;
            var y = u * u * u * y0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * y1;
            out.push(y < 0 ? 0 : y);
        }
    }
    return out;
}

function mqDynNiceMax(v) {
    var n = Math.max(1, v);
    if (n <= 4) return Math.ceil(n);
    var step = n <= 20 ? 5 : 10;
    return Math.ceil(n / step) * step;
}

function drawMeqsedKindDynChart(st) {
    var host = document.getElementById('mqKindDynChart');
    if (!host || !st) return;
    var series = mqKindDynSeries(st);
    if (!series.length) return;
    var w = host.clientWidth || 0;
    var h = host.clientHeight || 0;
    if (w < 40 || h < 40) {
        requestAnimationFrame(function() { drawMeqsedKindDynChart(st); });
        return;
    }
    var steps = 8;
    var samples = series.map(function(s) { return mqDynSamples(s.data, steps); });
    var len = samples[0].length;
    var peak = 1;
    var p;
    series.forEach(function(s) {
        s.data.forEach(function(v) { if (v > peak) peak = v; });
    });
    var ymax = mqDynNiceMax(peak);
    var padL = 28;
    var padR = 10;
    var padT = 14;
    var padB = 22;
    var plotW = Math.max(10, w - padL - padR);
    var plotH = Math.max(10, h - padT - padB);
    function xAt(i) { return padL + (i / (len - 1)) * plotW; }
    function yAt(v) { return padT + plotH - (v / ymax) * plotH; }
    var kindOn = (MEQSED_NOVU_KINDS || []).concat(['other']).indexOf(ui.hubFilter) >= 0;
    var grads = '';
    var fills = '';
    var strokes = '';
    var dots = '';
    var baseY = yAt(0).toFixed(2);
    series.forEach(function(s, idx) {
        var dim = kindOn && !mqFilterOn(s.kind);
        var gid = 'mqDynFill' + idx;
        grads += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0%" stop-color="' + s.color + '" stop-opacity="' + (dim ? '0.04' : '0.20') + '"/>'
            + '<stop offset="72%" stop-color="' + s.color + '" stop-opacity="' + (dim ? '0.02' : '0.05') + '"/>'
            + '<stop offset="100%" stop-color="' + s.color + '" stop-opacity="0"/>'
            + '</linearGradient>';
        var samp = samples[idx];
        var d = 'M ' + xAt(0).toFixed(2) + ' ' + yAt(samp[0]).toFixed(2);
        for (p = 1; p < len; p++) d += ' L ' + xAt(p).toFixed(2) + ' ' + yAt(samp[p]).toFixed(2);
        fills += '<path d="' + d + ' L ' + xAt(len - 1).toFixed(2) + ' ' + baseY + ' L ' + xAt(0).toFixed(2) + ' ' + baseY + ' Z" fill="url(#' + gid + ')"></path>';
        strokes += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-opacity="' + (dim ? '0.22' : '1') + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>';
        s.data.forEach(function(v, mi) {
            if (!v) return;
            dots += '<circle cx="' + (padL + (mi / 11) * plotW).toFixed(2) + '" cy="' + yAt(v).toFixed(2) + '" r="3.1" fill="#fff" stroke="' + s.color + '" stroke-opacity="' + (dim ? '0.28' : '1') + '" stroke-width="1.8"/>';
        });
    });
    var grid = '';
    var ticks = ymax <= 5 ? ymax : Math.round(ymax / (ymax <= 20 ? 5 : 10));
    var step = ymax / (ticks || 1);
    var g;
    for (g = 0; g <= ticks; g++) {
        var val = Math.round(step * g);
        var gy = yAt(val);
        grid += '<line x1="' + padL + '" y1="' + gy.toFixed(2) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(2) + '" stroke="#e8edf3" stroke-width="1"/>';
        grid += '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(2) + '" text-anchor="end" fill="#94a3b8" font-size="10" font-family="Inter, Segoe UI, sans-serif">' + val + '</text>';
    }
    var labels = '';
    MQ_MONTHS.forEach(function(name, i) {
        var x = padL + (i / 11) * plotW;
        labels += '<text x="' + x.toFixed(2) + '" y="' + (h - 6) + '" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="600" font-family="Inter, Segoe UI, sans-serif">' + name + '</text>';
    });
    host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="100%" aria-hidden="true">'
        + '<defs>' + grads + '</defs>'
        + grid
        + '<rect class="mq-dyn-hl" x="0" y="' + padT + '" width="0" height="' + plotH + '" fill="rgba(15,23,42,0.035)"></rect>'
        + fills + strokes + dots + labels
        + '</svg><div class="mq-dyn-tip" hidden></div>';
    var svg = host.querySelector('svg');
    var tip = host.querySelector('.mq-dyn-tip');
    var hl = host.querySelector('.mq-dyn-hl');
    function monthAt(clientX) {
        var box = svg.getBoundingClientRect();
        if (!box.width) return -1;
        var x = ((clientX - box.left) / box.width) * w;
        var t = (x - padL) / plotW;
        if (t < -0.04 || t > 1.04) return -1;
        return Math.max(0, Math.min(11, Math.round(t * 11)));
    }
    function kindAt(clientX, clientY) {
        var month = monthAt(clientX);
        if (month < 0) return '';
        var box = svg.getBoundingClientRect();
        var y = ((clientY - box.top) / box.height) * h;
        var best = '';
        var bestDist = 16;
        series.forEach(function(s) {
            var v = s.data[month] || 0;
            if (!v) return;
            var dist = Math.abs(y - yAt(v));
            if (dist < bestDist) { bestDist = dist; best = s.kind; }
        });
        return best;
    }
    host.onmousemove = function(ev) {
        var month = monthAt(ev.clientX);
        if (month < 0) { tip.hidden = true; hl.setAttribute('width', '0'); host.style.cursor = 'default'; return; }
        var box = host.getBoundingClientRect();
        var colW = plotW / 11;
        var svgBox = svg.getBoundingClientRect();
        var x = padL + (month / 11) * plotW;
        hl.setAttribute('x', (x - colW / 2).toFixed(2));
        hl.setAttribute('width', colW.toFixed(2));
        var lines = series.map(function(s) {
            var v = s.data[month] || 0;
            if (!v) return '';
            return '<span><i style="background:' + s.color + '"></i>' + esc(MQ_KIND_SHORT[s.kind] || s.label) + ' <b>' + v + '</b></span>';
        }).filter(Boolean);
        tip.innerHTML = '<strong>' + MQ_MONTHS[month] + '</strong>' + (lines.length ? lines.join('') : '<span>0</span>');
        tip.hidden = false;
        var left = ((x / w) * svgBox.width) + (svgBox.left - box.left);
        var tipW = tip.offsetWidth || 80;
        left = Math.max(tipW / 2 + 4, Math.min(box.width - tipW / 2 - 4, left));
        tip.style.left = left + 'px';
        tip.style.top = '8px';
        var over = kindAt(ev.clientX, ev.clientY);
        host.style.cursor = over ? 'pointer' : 'default';
    };
    host.onmouseleave = function() {
        tip.hidden = true;
        hl.setAttribute('width', '0');
        host.style.cursor = 'default';
    };
    host.onclick = function(ev) {
        var kind = kindAt(ev.clientX, ev.clientY);
        if (kind) nk303Call('hubFilter', kind);
    };
}

function drawMeqsedFlowChart(st) {
    if (typeof Chart === 'undefined' || !st) return;
    var canvas = document.getElementById('meqsedMonthChart');
    if (!canvas) return;
    var months = st.byMonth || [];
    var series = mqOpinionItems(st);
    var monthMax = 0;
    months.forEach(function(m) {
        if (m && m.total > monthMax) monthMax = m.total;
    });
    var totalsPlugin = {
        id: 'mqFlowTotals',
        afterDatasetsDraw: function(chart) {
            var c = chart.ctx;
            var sets = chart.data.datasets || [];
            c.save();
            c.font = '650 10px Inter, system-ui, sans-serif';
            c.fillStyle = '#64748b';
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            (chart.data.labels || []).forEach(function(_, i) {
                var sum = 0;
                var top = null;
                var x = null;
                sets.forEach(function(ds, di) {
                    var v = Number(ds.data[i]) || 0;
                    if (!v) return;
                    sum += v;
                    var meta = chart.getDatasetMeta(di);
                    var bar = meta && meta.data ? meta.data[i] : null;
                    if (!bar) return;
                    x = bar.x;
                    if (top == null || bar.y < top) top = bar.y;
                });
                if (sum && x != null && top != null) c.fillText(String(sum), x, top - 2);
            });
            c.restore();
        }
    };
    makeHubChart('meqsedMonthChart', {
        type: 'bar',
        data: {
            labels: MQ_MONTHS,
            datasets: series.map(function(it) {
                return {
                    label: it.label,
                    data: months.map(function(m) { return (m && m[it.key]) || 0; }),
                    backgroundColor: it.color,
                    borderWidth: 0,
                    borderRadius: 2,
                    barPercentage: 0.68,
                    categoryPercentage: 0.72,
                    maxBarThickness: 18,
                    _filter: it.filter
                };
            })
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 12, right: 2, left: 0, bottom: 0 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.94)',
                    padding: 8,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            return ' ' + ctx.dataset.label + ': ' + (ctx.raw || 0);
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10, weight: '600' }, maxRotation: 0 },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    suggestedMax: monthMax ? Math.ceil(monthMax * 1.12) : undefined,
                    ticks: {
                        precision: 0,
                        maxTicksLimit: 5,
                        color: '#94a3b8',
                        font: { size: 10 }
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.16)' },
                    border: { display: false }
                }
            },
            onClick: function(evt, els) {
                if (!els || !els.length) return;
                var ds = this.data.datasets[els[0].datasetIndex];
                if (ds && ds._filter) nk303Call('hubFilter', ds._filter);
            },
            onHover: function(evt, els) {
                var target = (evt && evt.native && evt.native.target)
                    || (evt && evt.chart && evt.chart.canvas);
                if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            }
        },
        plugins: [totalsPlugin]
    });
}

function renderHub(opts) {
    opts = opts || {};
    if (!ui.hub) return;
    var keepSearch = document.activeElement
        && document.activeElement.getAttribute
        && document.activeElement.getAttribute('placeholder') === 'Qurum adı ilə axtar...';
    render();
    requestAnimationFrame(function() {
        if (opts.scrollToList) {
            var list = document.getElementById('nk303HubList');
            if (list && list.scrollIntoView) list.scrollIntoView({ block: 'start' });
        }
        var inp = document.querySelector('.nk303-hub-page input[type="search"]');
        if (keepSearch && inp) {
            inp.focus();
            var len = inp.value.length;
            try { inp.setSelectionRange(len, len); } catch (e2) {}
        }
    });
}

function lightHubShellModel() {
    return {
        years: [],
        orgs: [],
        orgOptions: [],
        countryAvg: null,
        byVis: { not_started: 0, in_progress: 0, review: 0, done: 0 },
        byMat: {},
        rankedOrgs: [],
        gaps: [],
        trend: [],
        spanFrom: null,
        spanTo: null,
        spanDelta: null
    };
}

function scrollWindowInstant(y) {
    try {
        window.scrollTo({ top: y || 0, left: 0, behavior: 'instant' });
    } catch (e) {
        window.scrollTo(0, y || 0);
    }
}

function render(opts) {
    opts = opts || {};
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    var y = opts.scrollTop ? 0 : (window.scrollY || 0);
    /* Hub səhifəsində ölkə modelini qurma — yalnız kliklənən hub view. */
    var model = ui.hub ? lightHubShellModel() : buildModel();
    destroyNkCharts();
    destroyHubCharts();
    destroyMeqsedOverviewCharts();
    root.innerHTML = pageHeadHtml(model) + bodyHtml(model);
    document.title = pageHeadCopy(model).title;
    var wrap = root.querySelector('.nk303-wrap');
    if (opts.soft && wrap) wrap.classList.add('nk303-wrap--enter');
    requestAnimationFrame(function() {
        if (ui.hub) {
            var view = currentHubView();
            drawHubCharts(view);
        } else {
            drawCharts(model);
        }
        scrollWindowInstant(y);
    });
}

function bindEsc() {
    if (ui.escBound) return;
    ui.escBound = true;
    document.addEventListener('keydown', function(e) {
        if (!ui.open) return;
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (document.body.classList.contains('assess-modal-open')) return;
        if (document.body.classList.contains('nk303-teq-open')) {
            e.preventDefault();
            closeTeqdimatModal();
            return;
        }
        e.preventDefault();
        if (ui.hub) {
            closeHub();
            return;
        }
        closeNk303();
    });
}

function bindHistory() {
    if (histBound) return;
    histBound = true;
    window.addEventListener('popstate', function() {
        syncNk303Route();
    });
}

function isNk303Path() {
    var p = String(location.pathname || '').replace(/\/+$/, '');
    return p === '/diaqnostika' || p === '/diaqnostika/admin';
}

function isAdminPath() {
    var p = String(location.pathname || '').replace(/\/+$/, '');
    return p === '/diaqnostika/admin';
}

function diagApi(url, opts) {
    opts = opts || {};
    if (!opts.credentials) opts.credentials = 'same-origin';
    return apiFetch(url, opts);
}

function showAdminGate() {
    var gate = document.getElementById('nk303AdminGate');
    if (!gate) return;
    gate.classList.remove('hidden');
    gate.removeAttribute('hidden');
    document.body.classList.add('nk303-admin-locked');
    var root = document.getElementById(ROOT_ID);
    if (root) root.setAttribute('aria-hidden', 'true');
    var err = document.getElementById('nk303AdminError');
    if (err) {
        err.textContent = '';
        err.classList.add('hidden');
        err.setAttribute('hidden', '');
    }
    var input = document.getElementById('nk303AdminPassword');
    if (input) {
        input.value = '';
        setTimeout(function() { try { input.focus(); } catch (e) {} }, 30);
    }
}

function hideAdminGate() {
    var gate = document.getElementById('nk303AdminGate');
    if (gate) {
        gate.classList.add('hidden');
        gate.setAttribute('hidden', '');
    }
    document.body.classList.remove('nk303-admin-locked');
    var root = document.getElementById(ROOT_ID);
    if (root) root.removeAttribute('aria-hidden');
}

function setAdminError(msg) {
    var err = document.getElementById('nk303AdminError');
    if (!err) return;
    if (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
        err.removeAttribute('hidden');
    } else {
        err.textContent = '';
        err.classList.add('hidden');
        err.setAttribute('hidden', '');
    }
}

function submitAdminLogin(ev) {
    if (ev) ev.preventDefault();
    var input = document.getElementById('nk303AdminPassword');
    var btn = document.getElementById('nk303AdminSubmit');
    var pass = input ? String(input.value || '') : '';
    if (!pass) {
        setAdminError('Parolu yazın.');
        if (input) input.focus();
        return;
    }
    if (btn) btn.disabled = true;
    setAdminError('');
    diagApi('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
    })
        .then(function(r) {
            return r.json().then(function(data) {
                return { ok: r.ok, data: data };
            }).catch(function() {
                return { ok: false, data: { error: 'Daxil olmaq mümkün olmadı' } };
            });
        })
        .then(function(res) {
            if (btn) btn.disabled = false;
            if (!res.ok) {
                setAdminError((res.data && res.data.error) || 'Parol səhvdir');
                if (input) {
                    input.value = '';
                    input.focus();
                }
                return;
            }
            adminState.isAdmin = true;
            if (input) input.value = '';
            hideAdminGate();
            try { history.replaceState({ nk303: true }, '', '/diaqnostika'); } catch (e) {}
            showToast('Admin olaraq daxil oldunuz', 'success');
            render();
            return Promise.all([loadExcelUploads(), loadReportUploads()]);
        })
        .catch(function() {
            if (btn) btn.disabled = false;
            setAdminError('Daxil olmaq mümkün olmadı');
        });
}

function logoutAdmin() {
    diagApi('/api/admin/logout', { method: 'POST' })
        .then(function() {
            adminState.isAdmin = false;
            hideAdminGate();
            if (isAdminPath()) {
                try { history.replaceState({ nk303: true }, '', '/diaqnostika'); } catch (e) {}
            }
            showToast('Admin sessiyası bağlandı', 'success');
            render();
            return Promise.all([loadExcelUploads(), loadReportUploads()]);
        })
        .catch(function() {
            showToast('Çıxış alınmadı', 'error');
        });
}

function bindAdminGate() {
    if (adminState.bound) return;
    adminState.bound = true;
    var form = document.getElementById('nk303AdminForm');
    if (form) form.addEventListener('submit', submitAdminLogin);
}

function loadAdminState() {
    return diagApi('/api/admin/me')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            adminState.isAdmin = !!(data && data.admin);
        })
        .catch(function() {
            adminState.isAdmin = false;
        })
        .then(function() {
            if (isAdminPath() && !adminState.isAdmin) showAdminGate();
            else hideAdminGate();
            if (adminState.isAdmin && isAdminPath()) {
                try { history.replaceState({ nk303: true }, '', '/diaqnostika'); } catch (e2) {}
            }
        });
}

function showNk303Page() {
    var page = document.getElementById(PAGE_ID);
    var main = document.getElementById(MAIN_ID);
    if (!page) return;
    ui.open = true;
    page.classList.remove('hidden');
    page.removeAttribute('hidden');
    page.setAttribute('aria-hidden', 'false');
    if (main) {
        main.classList.add('hidden');
        main.setAttribute('hidden', '');
        main.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.add('nk303-page');
    document.title = pageHeadCopy().title;
    bindEsc();
    bindHistory();
    bindAdminGate();
    if (isAdminPath() && !adminState.isAdmin) showAdminGate();
    render({ soft: true, scrollTop: true });
    loadAdminState().then(function() {
        if (!ui.open) return;
        render({ soft: true });
        loadExcelUploads();
        loadReportUploads();
    });
}

function hideNk303Page() {
    var page = document.getElementById(PAGE_ID);
    var main = document.getElementById(MAIN_ID);
    ui.open = false;
    closeHub();
    destroyNkCharts();
    if (page) {
        page.classList.add('hidden');
        page.setAttribute('hidden', '');
        page.setAttribute('aria-hidden', 'true');
    }
    if (main) {
        main.classList.remove('hidden');
        main.removeAttribute('hidden');
        main.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.remove('nk303-page');
    document.body.classList.remove('nk303-admin-locked');
    hideAdminGate();
    document.title = 'Rəqəmsal İdarəetmə Paneli';
}

export function syncNk303Route() {
    if (isNk303Path()) {
        if (!canSeeDiagnostics()) {
            try { history.replaceState({}, '', '/'); } catch (e) {}
            hideNk303Page();
            return;
        }
        showNk303Page();
    }
    else hideNk303Page();
}

function resetFilters() {
    ui.year = 'all';
    ui.orgKey = '';
    ui.status = '';
    ui.maturity = '';
    ui.dirId = '';
    ui.search = '';
    ui.sort = 'score';
    ui.page = 1;
    ui.expandDir = '';
    ui.expandCrit = '';
    ui.mode = 'country';
    ui.nav = 'overview';
    resetHubState();
}

export function openNk303() {
    if (!canSeeDiagnostics()) {
        showToast('Qiymətləndirmə analitikası yalnız Komplayns komandasında əlçatandır', 'error');
        return;
    }
    if (typeof window.closeDiagModal === 'function') window.closeDiagModal();
    var period = getAssessmentPeriodState();
    ui.year = period && period.year && period.year !== 'custom' ? period.year : 'all';
    ui.status = '';
    ui.mode = 'country';
    ui.nav = 'overview';
    ui.page = 1;
    resetHubState();
    if (!isNk303Path()) {
        history.pushState({ nk303: true }, '', '/diaqnostika');
    }
    showNk303Page();
}

export function closeNk303() {
    hideNk303Page();
    if (isNk303Path()) {
        history.pushState({}, '', '/');
    }
}

export function onNk303OverlayClick() {}

function csvEscape(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function downloadBlob(filename, mime, content) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 500);
}

function exportCsv(model) {
    var cols = ['№', 'Qurum', 'Ümumi nəticə', 'Səviyyə'].concat(DIRS.map(function(d) { return d.name; })).concat(['Status', 'İl']);
    var lines = [cols.map(csvEscape).join(',')];
    model.rankedOrgs.forEach(function(o, i) {
        lines.push([
            i + 1,
            o.name,
            o.qrsg == null ? '' : fmt(o.qrsg),
            o.maturity ? o.maturity.label : '',
            o.dirs.strategiya == null ? '' : fmt(o.dirs.strategiya),
            o.dirs.xidmetler == null ? '' : fmt(o.dirs.xidmetler),
            o.dirs.texniki == null ? '' : fmt(o.dirs.texniki),
            o.dirs.emeliyyat == null ? '' : fmt(o.dirs.emeliyyat),
            o.visLabel,
            o.year == null ? '' : o.year
        ].map(csvEscape).join(','));
    });
    downloadBlob('reqemsallasma-diaqnostikasi.csv', 'text/csv;charset=utf-8', '\uFEFF' + lines.join('\n'));
}

function exportWord(model) {
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><title>Diaqnostika</title></head><body><pre>'
        + esc(reportText(model)) + '</pre></body></html>';
    downloadBlob('reqemsallasma-diaqnostikasi.doc', 'application/msword', html);
}

function applyExcelPayload(data) {
    excelStore.files = (data && data.files) || [];
    excelStore.orgs = (data && data.orgs) || [];
    excelStore.loaded = true;
    if (data && data.admin != null) adminState.isAdmin = !!data.admin;
}

function applyReportPayload(data) {
    reportStore.files = (data && data.files) || [];
    reportStore.reports = (data && data.reports) || [];
    reportStore.loaded = true;
    if (data && data.admin != null) adminState.isAdmin = !!data.admin;
    if (ui.reportId && !reportStore.reports.some(function(r) { return r.id === ui.reportId; })) {
        ui.reportId = '';
    }
}

function loadReportUploads() {
    return diagApi('/api/hesabat/uploads')
        .then(function(r) {
            if (r.status === 403) {
                applyReportPayload({ files: [], reports: [] });
                return null;
            }
            return r.json();
        })
        .then(function(data) {
            if (!data) return;
            applyReportPayload(data);
            if (ui.open) render();
        })
        .catch(function() {
            reportStore.loaded = true;
        });
}

function pickPptxFile(kind) {
    if (!isAdmin()) return;
    if (kind !== 'diag' && kind !== 'isq' && kind !== 'exq') {
        ui.reportPickKind = true;
        render();
        return;
    }
    ui.reportPickKind = false;
    ui.reportUploadKind = kind;
    ui.reportKind = kind;
    var input = document.getElementById('nk303PptxInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'nk303PptxInput';
        input.accept = '.pptx,.pptm,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf';
        input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', onPptxChosen);
        document.body.appendChild(input);
    }
    input.click();
}

function onPptxChosen(ev) {
    var input = ev.target;
    var files = input.files;
    if (!files || !files.length) return;
    var fd = new FormData();
    var i;
    for (i = 0; i < files.length; i++) fd.append('file', files[i]);
    fd.append('kind', ui.reportUploadKind || activeReportKind() || '');
    input.value = '';
    if (!fd.get('kind')) {
        showToast('Əvvəl hesabat növünü seçin: Diaqnostika, İSQ və ya EXQ', 'error');
        ui.reportPickKind = true;
        render();
        return;
    }
    showToast('Hesabat oxunur…', 'info');
    fetch('/api/hesabat/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function(r) {
            return r.json().then(function(data) {
                return { ok: r.ok, status: r.status, data: data };
            }).catch(function() {
                return {
                    ok: false,
                    status: r.status,
                    data: { error: r.status === 413 ? 'Fayl 25 MB-dan böyükdür' : 'Hesabat oxunmadı' }
                };
            });
        })
        .then(function(res) {
            if (!res.ok) {
                showToast((res.data && res.data.error) || (res.status === 401 ? 'Admin girişi lazımdır' : 'Hesabat oxunmadı'), 'error');
                return;
            }
            return diagApi('/api/hesabat/uploads').then(function(r) { return r.json(); }).then(function(data) {
                applyReportPayload(data);
                var first = (res.data.files || [])[0];
                if (first && first.id) {
                    ui.reportId = first.id;
                    var rec = (first.report || first);
                    ui.reportKind = reportKindOf(rec);
                }
                ui.hub = 'report';
                showToast(((first && (first.org || first.name)) || 'Hesabat') + ' yükləndi', 'success');
                if (res.data.errors && res.data.errors.length) {
                    showToast(res.data.errors[0], 'error');
                }
                render();
                window.scrollTo(0, 0);
            });
        })
        .catch(function() { showToast('Hesabat yüklənmədi', 'error'); });
}

function setUploadedReportKind(payload) {
    payload = darg(payload || '');
    var parts = payload.split('|');
    var fileId = parts[0] || '';
    var kind = parts[1] || '';
    if (!fileId || (kind !== 'diag' && kind !== 'isq' && kind !== 'exq') || !isAdmin()) return;
    var rec = (reportStore.reports || []).filter(function(r) { return r.id === fileId; })[0];
    if (rec && reportKindOf(rec) === kind) return;
    showToast('Növ yenilənir…', 'info');
    fetch('/api/hesabat/uploads/' + encodeURIComponent(fileId) + '/kind', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: kind })
    })
        .then(function(r) {
            return r.json().then(function(data) { return { ok: r.ok, data: data }; });
        })
        .then(function(res) {
            if (!res.ok) {
                showToast((res.data && res.data.error) || 'Növ dəyişmədi', 'error');
                return;
            }
            return diagApi('/api/hesabat/uploads').then(function(r) { return r.json(); }).then(function(data) {
                applyReportPayload(data);
                ui.reportId = fileId;
                ui.reportKind = kind;
                ui.hub = 'report';
                showToast(reportKindMeta(kind).label + ' kimi oxundu', 'success');
                render();
            });
        })
        .catch(function() { showToast('Növ dəyişmədi', 'error'); });
}

function removeReportFile(fileId) {
    fileId = darg(fileId || '');
    if (!fileId || !isAdmin()) return;
    var file = (reportStore.files || []).filter(function(f) { return f.id === fileId; })[0]
        || (reportStore.reports || []).filter(function(f) { return f.id === fileId; })[0];
    var label = (file && (file.name || file.org)) || 'Hesabat';
    if (!window.confirm(label + ' silinsin? Yüklənmiş hesabat və onun analizi səhifədən çıxacaq.')) return;
    fetch('/api/hesabat/uploads/' + encodeURIComponent(fileId), { method: 'DELETE', credentials: 'same-origin' })
        .then(function(r) {
            return r.json().then(function(data) { return { ok: r.ok, data: data }; });
        })
        .then(function(res) {
            if (!res.ok) {
                showToast((res.data && res.data.error) || 'Silinmədi', 'error');
                return;
            }
            return diagApi('/api/hesabat/uploads').then(function(r) { return r.json(); }).then(function(data) {
                if (ui.reportId === fileId) ui.reportId = '';
                applyReportPayload(data);
                showToast('Hesabat silindi', 'success');
                render();
            });
        })
        .catch(function() { showToast('Hesabat silinmədi', 'error'); });
}

function loadExcelUploads() {
    return diagApi('/api/diaqnostika/uploads')
        .then(function(r) {
            if (r.status === 403) {
                applyExcelPayload({ files: [], orgs: [] });
                return null;
            }
            return r.json();
        })
        .then(function(data) {
            if (!data) return;
            applyExcelPayload(data);
            if (ui.open) render();
        })
        .catch(function() {
            excelStore.loaded = true;
        });
}

export function nk303Call(action, payload) {
    if (action === 'mode') {
        ui.mode = payload === 'institution' ? 'institution' : 'country';
        if (ui.mode === 'country') {
            ui.orgKey = '';
            ui.expandDir = '';
            ui.expandCrit = '';
            ui.nav = 'overview';
            resetHubState();
        } else if (!ui.orgKey) {
            ui.nav = 'orgs';
        }
    } else if (action === 'nav') {
        ui.nav = payload;
        if (payload === 'overview' && ui.mode === 'institution' && !ui.orgKey) ui.nav = 'orgs';
        if (payload === 'dirs' && !ui.dirId) ui.expandDir = ui.expandDir || 'strategiya';
        ui.page = 1;
    } else if (action === 'year') {
        ui.year = payload || 'all';
        ui.page = 1;
        applyHubYear(ui.year);
        return;
    } else if (action === 'org') {
        ui.orgKey = payload || '';
        ui.page = 1;
        if (ui.orgKey) {
            resetHubState();
            ui.mode = 'institution';
            ui.nav = 'overview';
            applyOrgYear(ui.orgKey);
        } else {
            ui.mode = 'country';
        }
    } else if (action === 'status') {
        ui.status = payload || '';
        ui.page = 1;
    } else if (action === 'maturity') {
        ui.maturity = payload || '';
        ui.page = 1;
    } else if (action === 'sort') {
        ui.sort = payload === 'date' ? 'date' : 'score';
        ui.page = 1;
    } else if (action === 'dir') {
        ui.dirId = payload || '';
        ui.page = 1;
    } else if (action === 'search') {
        ui.search = payload || '';
        ui.page = 1;
        render();
        var inp = document.querySelector('#' + ROOT_ID + ' input[type="search"]');
        if (inp) {
            inp.focus();
            var len = inp.value.length;
            try { inp.setSelectionRange(len, len); } catch (e) {}
        }
        return;
    } else if (action === 'refresh') {
        if (typeof window.fetchDashboardData === 'function') window.fetchDashboardData();
        return;
    } else if (action === 'back') {
        goBackOneStep();
        return;
    } else if (action === 'reset') {
        resetFilters();
        ui.mode = 'country';
        ui.nav = 'overview';
        ui.hubDetailKey = '';
    } else if (action === 'openOrg') {
        ui.orgKey = darg(payload || '');
        ui.mode = 'institution';
        ui.nav = 'overview';
        ui.expandDir = '';
        ui.expandCrit = '';
        ui.hubDetailKey = '';
        applyOrgYear(ui.orgKey);
        window.scrollTo(0, 0);
    } else if (action === 'openDir') {
        ui.dirId = payload || '';
        ui.expandDir = payload || '';
        ui.nav = 'dirs';
        ui.page = 1;
    } else if (action === 'expandDir') {
        if (ui.expandDir === payload) {
            ui.expandDir = '';
        } else {
            var org = (buildModel().selected) || null;
            ui.expandDir = org && dirHasDetail(org, payload) ? payload : '';
        }
        ui.expandCrit = '';
    } else if (action === 'crit') {
        payload = darg(payload || '');
        ui.expandCrit = ui.expandCrit === payload ? '' : payload;
    } else if (action === 'page') {
        ui.page = Math.max(1, Number(payload) || 1);
    } else if (action === 'toggleCompare') {
        payload = darg(payload || '');
        if (ui.compare[payload]) delete ui.compare[payload];
        else if (Object.keys(ui.compare).length < 5) ui.compare[payload] = true;
        ui.nav = 'compare';
    } else if (action === 'export') {
        var model = buildModel();
        if (payload === 'csv') exportCsv(model);
        else if (payload === 'word') exportWord(model);
        else window.print();
        return;
    } else if (action === 'highGaps') {
        toggleCountryNav('gaps');
    } else if (action === 'orgsList') {
        toggleCountryNav('orgs');
    } else if (action === 'doneList') {
        toggleCountryNav('done');
    } else if (action === 'statusList') {
        var sid = String(payload || '');
        if (!isVisNav(sid)) return;
        ui.status = ui.status === sid ? '' : sid;
        ui.page = 1;
        if (isVisNav(ui.nav)) ui.nav = 'overview';
    } else if (action === 'openGap') {
        var bits = darg(payload || '').split('\t');
        ui.orgKey = bits[0] || '';
        ui.expandDir = bits[1] || '';
        ui.expandCrit = bits[2] || '';
        ui.year = 'all';
        ui.status = '';
        if (ui.orgKey) {
            ui.mode = 'institution';
            ui.nav = 'overview';
        }
        window.scrollTo(0, 0);
    } else if (action === 'hub') {
        openHub(payload || '');
        return;
    } else if (action === 'closeHub') {
        closeHub();
        window.scrollTo(0, 0);
        render();
        return;
    } else if (action === 'hubSearch') {
        ui.hubSearch = darg(payload || '');
        ui.hubPage = 1;
        renderHub();
        var hubInp = document.querySelector('.nk303-hub-page input[type="search"]');
        if (hubInp) {
            hubInp.focus();
            var hlen = hubInp.value.length;
            try { hubInp.setSelectionRange(hlen, hlen); } catch (e3) {}
        }
        return;
    } else if (action === 'hubOrg') {
        ui.hubFilter = '';
        ui.hubSearch = darg(payload || '');
        ui.hubPage = 1;
        ui.hubDetailKey = '';
        renderHub({ scrollToList: true });
        return;
    } else if (action === 'hubDetail') {
        ui.hubDetailKey = darg(payload || '');
        window.scrollTo(0, 0);
        render();
        return;
    } else if (action === 'hubYear') {
        applyHubYear(payload);
        return;
    } else if (action === 'hubSort') {
        ui.hubSort = payload === 'asc' ? 'asc' : (payload === 'date' ? 'date' : 'desc');
        ui.hubPage = 1;
        renderHub();
        return;
    } else if (action === 'hubFilter' || action === 'hubMeqsedFilter') {
        var nextFilter = String(payload == null ? '' : payload).trim();
        if (nextFilter === 'all' || nextFilter === '') ui.hubFilter = '';
        else ui.hubFilter = ui.hubFilter === nextFilter ? '' : nextFilter;
        // Növ/rəy filtrində köhnə qurum axtarışı nəticəni boşaldırdı — sıfırla
        ui.hubSearch = '';
        ui.hubPage = 1;
        renderHub({ scrollToList: true });
        return;
    } else if (action === 'hubPage') {
        ui.hubPage = Math.max(1, Number(payload) || 1);
        renderHub();
        return;
    } else if (action === 'hubOpen') {
        var issueKey = darg(payload || '');
        var href = jiraBrowseUrl(issueKey);
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        return;
    } else if (action === 'exqStages') {
        openExqStagesPopup(payload);
        return;
    } else if (action === 'closeExqStages') {
        closeExqStagesPopup();
        return;
    } else if (action === 'openTeqdimat') {
        openTeqdimatModal(darg(payload || ''));
        return;
    } else if (action === 'pickTeqdimat') {
        var pair = String(darg(payload || '') || '').split('|');
        openTeqdimatById(pair[0] || '', pair[1] || '');
        return;
    } else if (action === 'closeTeqdimat') {
        closeTeqdimatModal();
        return;
    } else if (action === 'logout') {
        logoutAdmin();
        return;
    }
    render();
}

export function nk303MeqsedFilter(key) {
    nk303Call('hubFilter', key);
}

export function nk303MeqsedSearch(query) {
    nk303Call('hubSearch', query || '');
}

window.nk303MeqsedFilter = nk303MeqsedFilter;
window.nk303MeqsedSearch = nk303MeqsedSearch;
