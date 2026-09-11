import { getDiagPeriodRows, getAssessmentPeriodState, getAssessmentPeriodLabel, getAssessmentHubView, getAssessmentHubNav, getAssessmentHubYears, setAssessmentYearForActiveTab, prefetchAssessmentHubViews, drawMeqsedOverviewCharts, destroyMeqsedOverviewCharts } from './assessments.js?v=idda26';
import {
    parseDiagUmumiNetice,
    getDiagHeadline,
    getDiagScore,
    getStatusGroup,
    qurumMatchKey,
    getRawPhaseEntries,
    getTaskStartDate,
    getPhaseFieldText,
    PHASE_FIELDS,
    MEQSED_NOVU_KINDS,
    MEQSED_NOVU_LABELS,
    EXQ_STAR_BANDS,
    EXQ_LAW_URL,
    exqStarFromPercent,
    exqStarColor,
    exqStarLabel
} from './model.js';
import { normalizeStr, showToast } from './utils.js';
import { state } from './state.js';

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
var hubPrefetchTimer = null;
var HUB_TABS = [
    { id: 'diag', label: 'Diaqnostika', color: '#7c3aed' },
    { id: 'isq', label: 'İSQ', color: '#2563eb' },
    { id: 'self', label: 'Özünüqiymətləndirmə', color: '#059669' },
    { id: 'exq', label: 'EXQ', color: '#d97706' },
    { id: 'meqsed', label: 'Məqsədəuyğunluq', color: '#5b21b6' },
    { id: 'report', label: 'Hesabat analizi', color: '#0f766e' }
];
var HUB_STATUS_COLORS = {
    done: '#059669',
    progress: '#2563eb',
    planned: '#ea580c',
    paused: '#d97706',
    review: '#0891b2',
    esd: '#4f46e5',
    blocked: '#dc2626',
    rejected: '#e11d48',
    other: '#64748b'
};
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

var MATS = [
    { id: 'ilkin', label: 'İlkin', lo: 0, hi: 24, color: '#ef4444' },
    { id: 'idare', label: 'İdarə olunan', lo: 25, hi: 49, color: '#f59e0b' },
    { id: 'mueyyen', label: 'Müəyyən edilmiş', lo: 50, hi: 74, color: '#3b82f6' },
    { id: 'opt', label: 'Optimallaşdırılan', lo: 75, hi: 100, color: '#10b981' }
];

var VIS_STATUS = [
    { id: 'done', label: 'Tamamlanıb', groups: { done: true } },
    { id: 'in_progress', label: 'İcradadır', groups: { planned: true, progress: true, paused: true, blocked: true, rejected: true } },
    { id: 'review', label: 'Rəydə', groups: { review: true, esd: true } },
    { id: 'not_started', label: 'İcraya başlanmayıb', groups: { other: true } }
];
var VIS_COLORS = { done: '#22c55e', in_progress: '#3b82f6', review: '#f59e0b', not_started: '#94a3b8' };

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
    'Sorğunun göndərilməsi',
    'Özünüqiymətləndirmə',
    'Sənədlərin və məlumatların toplanması',
    'Yoxlama və təhlil',
    'Hesabat və fəaliyyət planının hazırlanması',
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
    reportId: '',
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
    return (next.lo + next.hi) / 2;
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

function processIndex(group, hasResult) {
    if (group === 'done') return hasResult ? 5 : 4;
    if (group === 'review' || group === 'esd') return 3;
    if (group === 'progress') return hasResult ? 4 : 2;
    if (group === 'planned') return 1;
    if (group === 'paused' || group === 'blocked') return 3;
    if (group === 'rejected') return 0;
    return hasResult ? 4 : 0;
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
            pointRadius: 4,
            pointHoverRadius: 5
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
            pointRadius: 4,
            pointHoverRadius: 5
        }
    ];
}

function exqBarColor(score) {
    return exqStarColor(score) || '#94a3b8';
}

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

function parseRow(row, index) {
    var t = row && row.task;
    var parsed = parseDiagUmumiNetice(t && t.fields && t.fields.customfield_17319);
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
    var extras = ((parsed && parsed.extras) || []).filter(function(e) {
        return e && e.title && String(e.title).trim();
    }).map(function(e) {
        var sc = num(e.score);
        return {
            title: e.title,
            score: sc,
            scoreRaw: e.score && e.score !== '—' ? String(e.score) : '',
            text: String(e.text || '').trim(),
            current: '',
            deficiency: '',
            criterion: '',
            sub: '',
            dirId: dirIdFromTitle(e.title)
        };
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
        processIdx: processIndex(group, hasResult),
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
        return {
            title: e.title || 'Meyar',
            score: num(e.score),
            scoreRaw: e.score != null && e.score !== '' ? String(e.score) : '',
            text: String(e.text || e.current || e.deficiency || '').trim(),
            current: String(e.current || '').trim(),
            deficiency: String(e.deficiency || '').trim(),
            criterion: String(e.criterion || '').trim(),
            sub: String(e.sub || '').trim(),
            dirId: e.dirId || dirIdFromTitle(e.title)
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
        var slice = latestByOrg(all.filter(function(it) { return Number(it.year) === y; }));
        var scoredY = slice.filter(function(o) { return o.qrsg != null; });
        return { y: y, avg: avg(scoredY.map(function(o) { return o.qrsg; })), n: scoredY.length };
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
        refresh: '<path d="M21 12a9 9 0 11-3.2-6.8"/><path d="M21 4v5h-5"/>',
        download: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>',
        upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
        external: '<path d="M14 5h5v5"/><path d="M20 4l-9 9"/><path d="M9 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-3"/>',
        chevron: '<path d="M15 18l-6-6 6-6"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + (paths[name] || '') + '</svg>';
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
    var title = ui.mode === 'institution' && model.selected
        ? model.selected.name
        : 'Ölkə üzrə Rəqəmsallaşma Diaqnostikası';
    var sub = ui.mode === 'institution' && model.selected
        ? 'Qurumun diaqnostika nəticələri'
        : 'Qurumların rəqəmsal yetkinlik səviyyəsinin qiymətləndirilməsi';
    return '<div class="nk303-wrap"><div class="nk303-head">'
        + '<div class="nk303-head-left">'
        + '<a href="/" class="nk303-home" onclick="closeNk303(); return false;">'
        + '<span class="nk303-home-ic">' + iconSvg('chevron') + '</span>'
        + '<span class="nk303-home-txt"><span class="nk303-home-kicker">Geri qayıt</span>'
        + '<span class="nk303-home-name">İdarəetmə paneli</span></span></a>'
        + '<p class="nk303-kicker">Diaqnostika analitikası</p>'
        + '<h1 id="nk303Title">' + esc(title) + '</h1>'
        + '<p class="sub">' + esc(sub) + '</p>'
        + '</div>'
        + (ui.hub === 'report'
            ? ''
            : '<div class="nk303-tools">'
                + '<div class="nk303-filters">'
                + (ui.orgKey ? '' : '<label class="nk303-field"><span>İl</span><select onchange="nk303Call(\'year\', this.value)">' + yearOpts + '</select></label>')
                + '<label class="nk303-field"><span>Qurum</span><select onchange="nk303Call(\'org\', this.value)">' + orgOpts + '</select></label>'
                + '</div>'
                + (isAdmin()
                    ? '<div class="nk303-admin-row">'
                        + '<button type="button" class="nk303-upload" onclick="nk303Call(\'upload\')">' + iconSvg('upload') + ' Excel yüklə</button>'
                        + '<button type="button" class="nk303-btn nk303-btn--ghost" onclick="nk303Call(\'logout\')">Çıx</button>'
                        + '</div>'
                    : '')
                + '</div>')
        + '</div>'
        + (ui.hub === 'report' ? '' : excelFilesHtml())
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

function reportTabItem() {
    return {
        id: 'report',
        label: 'Hesabat analizi',
        color: '#0f766e',
        count: (reportStore.reports || []).length
    };
}

function hubNavHtml() {
    var items = HUB_TABS.filter(function(it) { return it.id !== 'report'; });
    try {
        var live = getAssessmentHubNav();
        if (live && live.length) items = live.slice();
    } catch (e) {}
    items = items.filter(function(it) { return it.id !== 'report'; });
    items.push(reportTabItem());
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

function excelFilesHtml() {
    if (!isAdmin()) return '';
    var files = excelStore.files || [];
    if (!files.length) return '';
    return '<div class="nk303-xl-files">' + files.map(function(f) {
        return '<span class="nk303-xl-chip">' + esc(f.name)
            + (f.orgCount ? '<em>' + esc(String(f.orgCount)) + ' qurum</em>' : '')
            + '<button type="button" class="nk303-xl-del" title="Excel-i sil" onclick="event.stopPropagation(); nk303Call(\'removeExcel\',\'' + qarg(f.id) + '\')">Sil</button></span>';
    }).join('') + '</div>';
}

function backToCountryHtml(compact) {
    if (compact) {
        return '<button type="button" class="nk303-back" onclick="nk303Call(\'mode\',\'country\')">'
            + iconSvg('chevron') + ' Ölkə üzrə nəticələr</button>';
    }
    return '<button type="button" class="nk303-home nk303-home--back" onclick="nk303Call(\'mode\',\'country\')">'
        + '<span class="nk303-home-ic">' + iconSvg('chevron') + '</span>'
        + '<span class="nk303-home-txt"><span class="nk303-home-kicker">Geri qayıt</span>'
        + '<span class="nk303-home-name">Ölkə üzrə nəticələr</span></span></button>';
}

function currentHubView() {
    if (ui.hub === 'report') {
        return { section: 'report', label: 'Hesabat analizi', stats: {}, rows: [], period: '' };
    }
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
    return '<section class="nk303-card nk303-card--index">'
        + '<p class="nk303-kicker">Diaqnostika və qiymətləndirmə</p>'
        + '<h3>Rəqəmsallaşma indeksinin dinamikası</h3>'
        + '<p class="nk303-hint">' + esc(hint) + '</p>'
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

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
                y: y0 + (y1 - y0) * easeInOutCubic(t),
                real: false
            });
        }
        out.push(cur);
    });
    return out;
}

function hubPageHtml(view) {
    var period = view.period || getAssessmentPeriodLabel() || 'Bütün illər';
    return '<div class="nk303-hub-toolbar">'
        + '<div class="nk303-hub-toolbar-main">'
        + backToCountryHtml(true)
        + '<div class="nk303-hub-toolbar-title">'
        + '<h3 id="nk303HubTitle">' + esc(view.label) + ' nəticələri</h3>'
        + '<p class="nk303-hint">Dövr: ' + esc(period)
        + (view.section === 'exq' ? ' · Qərar 380, bənd 4.14–4.18' : '')
        + '</p>'
        + '</div></div>'
        + hubYearFilterHtml(view.section)
        + '</div>'
        + '<div class="nk303-hub-page">' + hubBodyHtml(view) + '</div>';
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

function dirCardsHtml(dirAgg, clickable) {
    return '<div class="nk303-dirs">'
        + dirAgg.map(function(d) {
            var w = d.avg == null ? 0 : Math.max(0, Math.min(100, d.avg));
            var onclick = clickable ? ' onclick="nk303Call(\'openDir\',\'' + d.id + '\')"' : '';
            var tag = clickable ? 'button type="button"' : 'article';
            var close = clickable ? 'button' : 'article';
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
            + '<td class="q" title="' + esc(o.name) + '">' + esc(o.name)
            + (o.fromExcel && isAdmin() ? ' <em class="nk303-xl">Excel</em>' : '') + '</td>'
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
    if (score == null || !isFinite(score)) return { target: null, gap: null };
    var mat = maturityOf(score);
    if (!mat) return { target: null, gap: null };
    var i = MATS.indexOf(mat);
    if (i < 0) return { target: null, gap: null };
    if (i === MATS.length - 1) return { target: 100, gap: Math.max(0, 100 - score) };
    return { target: MATS[i + 1].lo, gap: Math.max(0, MATS[i + 1].lo - score) };
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
        + backToCountryHtml()
        + '<h3 style="margin-top:0.7rem">Yüksək prioritetli boşluqlar</h3>'
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
        + backToCountryHtml()
        + '<h3 style="margin-top:0.7rem">' + esc(info.title) + '</h3>'
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

function summaryText(model) {
    if (model.countryAvg == null) {
        return (model.orgs.length ? (model.orgs.length + ' qurum siyahıdadır. ') : '')
            + 'Ümumiləşdirilmiş göstərici üçün bal məlumatı mövcud deyil.';
    }
    var idx = fmt1(model.countryAvg);
    var mat = maturityOf(model.countryAvg);
    var strong = model.strongestDir;
    var weak = model.weakestDir;
    var parts = ['Qiymətləndirilmiş qurumlar üzrə ümumiləşdirilmiş göstərici ' + idx + ' baldır'
        + (mat ? ' (' + mat.label + ').' : '.')];
    parts.push(model.orgs.length + ' qurumdan ' + (model.byVis.done || 0) + ' diaqnostikası tamamlanıb.');
    if (strong && strong.avg != null) parts.push('Ən yüksək nəticə: ' + strong.name + ' (' + fmt1(strong.avg) + ').');
    if (weak && weak.avg != null) parts.push('Ən zəif istiqamət: ' + weak.name + ' (' + fmt1(weak.avg) + ').');
    return parts.join(' ');
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

function radarCompareHtml(model) {
    var now = model.countryAvg;
    var goal = maturityTarget(now);
    var gap = now != null && goal != null ? Math.max(0, goal - now) : null;
    var nowCol = barColor(now);
    var goalCol = barColor(goal);
    var rows = dirCompareRows(model.dirAgg);
    var tiles = rows.map(function(d) {
        var met = d.now != null && d.target != null && d.now >= d.target;
        var col = barColor(d.now);
        return '<article class="nk303-dir-tile' + (met ? ' is-met' : '') + '">'
            + '<span>' + esc(d.short) + '</span>'
            + '<b' + (d.now == null ? ' class="is-empty"' : ' style="color:' + col + '"') + '>' + esc(fmtScore(d.now)) + '</b>'
            + '<em>Hədəf: ' + esc(fmtScore(d.target)) + '</em>'
            + '</article>';
    }).join('');
    return '<section class="nk303-card nk303-card--compare">'
        + '<div class="nk303-compare-head">'
        + '<div>'
        + '<p class="nk303-kicker">Rəqəmsallaşma istiqamətləri</p>'
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
        + '<div class="nk303-chart nk303-chart--compare"><canvas id="nkRadarChart"></canvas></div>'
        + '</div>'
        + '<div class="nk303-dir-tiles">' + tiles + '</div>'
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
        + '<section class="nk303-result"><b>Əsas nəticə</b><p>' + esc(summaryText(model)) + '</p></section>'
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
        + '<p class="nk303-hint">Mərhələlər Qərar 303, bənd 3.1 əsasında xəritələnir. Status: '
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
        var txt = org.dirTexts[dirId];
        if (!txt) return '<p class="nk303-empty">' + esc(NA) + '</p>';
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
            n: meta.domainN || extrasForDir(org, d.id).length
        };
    });
    return '<section class="nk303-card" style="margin-bottom:0.55rem">'
        + backToCountryHtml()
        + '<div class="nk303-profile" style="margin-top:0.55rem">'
        + '<div>'
        + '<p class="nk303-kicker">Qurumun diaqnostika nəticələri</p>'
        + '<h3 style="margin:0;font-size:1.05rem">' + esc(org.name) + '</h3>'
        + '<dl class="nk303-meta">'
        + '<div><dt>Diaqnostika tarixi</dt><dd>' + esc(org.start ? fmtDate(org.start) : (org.updated ? fmtDate(org.updated) : NA)) + '</dd></div>'
        + '<div><dt>Diaqnostika statusu</dt><dd>' + esc(org.visLabel) + ' · ' + esc(org.statusName) + '</dd></div>'
        + '<div><dt>Son yenilənmə</dt><dd>' + esc(org.updated ? fmtDate(org.updated) : NA) + '</dd></div>'
        + '<div><dt>Tapşırıq</dt><dd>' + issueLinkHtml(org.issueKey) + '</dd></div>'
        + (org.fromExcel && isAdmin() ? '<div><dt>Excel</dt><dd>' + esc(org.excelFile || 'Yüklənib')
            + (org.excelFileId ? ' <button type="button" class="nk303-link nk303-del" onclick="nk303Call(\'removeExcel\',\'' + qarg(org.excelFileId) + '\')">Sil</button>' : '')
            + '</dd></div>' : '')
        + '</dl></div>'
        + '<div>'
        + '<p class="nk303-hint">Qurumun rəqəmsallaşma səviyyəsi' + (org.qrsgOfficial ? '' : '') + '</p>'
        + scoreIndicator(org.qrsg)
        + '</div></div>'
        + processHtml(org)
        + '</section>'
        + '<section class="nk303-card" style="margin-bottom:0.55rem"><h3>Dörd rəsmi istiqamət</h3>'
        + dirCardsHtml(dirCards, false)
        + '</section>'
        + DIRS.map(function(d) {
            var sc = org.dirs[d.id];
            var open = ui.expandDir === d.id;
            var crits = extrasForDir(org, d.id);
            var meta = extrasMeta(org, d.id);
            var weak = crits.filter(function(e) { return e.score != null && e.score < 50; });
            var hint = [];
            if (meta.domainN) hint.push('Meyar sayı: ' + meta.domainN);
            else if (crits.length) hint.push('Meyar sayı: ' + crits.length);
            if (meta.capN) hint.push('Altmeyar sayı: ' + meta.capN);
            if (weak.length) hint.push('zəif sahələr: ' + weak.length);
            return '<div class="nk303-acc">'
                + '<button type="button" onclick="nk303Call(\'expandDir\',\'' + d.id + '\')">'
                + '<span class="nm">' + esc(d.name) + '</span>'
                + '<span>' + esc(sc == null ? '—' : fmt(sc)) + '</span>'
                + matBadge(sc)
                + '</button>'
                + (open ? '<div class="nk303-acc-body">'
                    + '<p class="nk303-hint">' + (hint.length ? hint.join(' · ') : esc(NA)) + '</p>'
                    + (org.dirTexts[d.id] ? '<div class="nk303-sub"><div class="lb">Cari vəziyyət</div><p>' + esc(org.dirTexts[d.id]) + '</p></div>' : '')
                    + (org.dirGaps && org.dirGaps[d.id] ? '<div class="nk303-sub"><div class="lb">Çatışmazlıq</div><p>' + esc(org.dirGaps[d.id]) + '</p></div>' : '')
                    + criterionBlock(org, d.id)
                    + '</div>' : '')
                + '</div>';
        }).join('')
        + (org.extras.filter(function(e) { return !e.dirId; }).length
            ? '<section class="nk303-card" style="margin-top:0.55rem"><h3>Mənbə məlumatında əlavə meyarlar</h3>'
                + '<p class="nk303-hint">Bu sətirlər ayrı top-level istiqamət deyil; diaqnostika sahəsindən oxunub.</p>'
                + criterionBlock({ extras: org.extras.filter(function(e) { return !e.dirId; }), dirTexts: {} }, '')
                + '</section>'
            : '')
        + '<section class="nk303-card" style="margin-top:0.55rem"><h3>Çatışmazlıqlar</h3>'
        + findingsHtml(org, model.gaps.filter(function(g) { return g.orgKey === org.key; }))
        + '</section>';
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

function selectedReport() {
    var list = reportStore.reports || [];
    if (!list.length) return null;
    var id = ui.reportId;
    var found = list.filter(function(r) { return r.id === id; })[0];
    return found || list[0];
}

function reportAgg() {
    var list = reportStore.reports || [];
    var overalls = [];
    var dirs = { strategiya: [], xidmetler: [], texniki: [], emeliyyat: [] };
    var targets = { strategiya: [], xidmetler: [], texniki: [], emeliyyat: [] };
    var findings = 0;
    list.forEach(function(r) {
        if (r.overall != null) overalls.push(r.overall);
        DIRS.forEach(function(d) {
            var v = r.dirs && r.dirs[d.id];
            if (v != null) dirs[d.id].push(v);
            var g = r.targets && r.targets[d.id];
            if (g != null) targets[d.id].push(g);
        });
        findings += (r.findings || []).length;
    });
    var dirAvg = {};
    var targetAvg = {};
    DIRS.forEach(function(d) {
        dirAvg[d.id] = avg(dirs[d.id]);
        targetAvg[d.id] = avg(targets[d.id]);
    });
    var weak = null;
    DIRS.forEach(function(d) {
        if (dirAvg[d.id] == null) return;
        if (!weak || dirAvg[d.id] < weak.score) weak = { id: d.id, name: d.name, score: dirAvg[d.id] };
    });
    return {
        n: list.length,
        overall: avg(overalls),
        dirs: dirAvg,
        targets: targetAvg,
        findings: findings,
        weak: weak
    };
}

function reportFilesHtml() {
    var files = isAdmin() ? (reportStore.files || []) : [];
    var reports = reportStore.reports || [];
    var chips = files.length ? files : reports.map(function(r) {
        return { id: r.id, name: r.name || r.org, org: r.org };
    });
    if (!chips.length) return '';
    return '<div class="nk303-xl-files">' + chips.map(function(f) {
        var on = ui.reportId === f.id || (!ui.reportId && selectedReport() && selectedReport().id === f.id);
        return '<span class="nk303-xl-chip' + (on ? ' is-on' : '') + '">'
            + '<button type="button" class="nk303-xl-pick" onclick="nk303Call(\'pickReport\',\'' + qarg(f.id) + '\')">'
            + esc(f.name || f.org || 'Hesabat')
            + (f.org && f.name && f.org !== f.name ? '<em>' + esc(f.org) + '</em>' : '')
            + '</button>'
            + (isAdmin()
                ? '<button type="button" class="nk303-xl-del" title="Hesabatı sil" onclick="event.stopPropagation(); nk303Call(\'removeReport\',\'' + qarg(f.id) + '\')">Sil</button>'
                : '')
            + '</span>';
    }).join('') + '</div>';
}

function reportListHtml(item, cls) {
    if (!(item || []).length) return '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<ul class="nk303-list ' + (cls || '') + '">' + item.map(function(it) {
        var dir = DIRS.filter(function(d) { return d.id === it.dirId; })[0];
        return '<li><div class="t">' + esc(dir ? dir.name : (it.slide ? 'Slayd ' + it.slide : 'Hesabat')) + '</div>'
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
        var dir = DIRS.filter(function(d) { return d.id === did; })[0];
        var score = sel && sel.dirs && did ? sel.dirs[did] : (agg && agg.dirs && did ? agg.dirs[did] : null);
        var items = uniqueReportItems([].concat((sel && sel.findings) || [], (sel && sel.strengths) || [], (sel && sel.actions) || []))
            .filter(function(it) { return !did || it.dirId === did; });
        if (!items.length && focus === 'weak') items = uniqueReportItems(sel && sel.findings);
        return {
            id: focus,
            title: focus === 'weak'
                ? ('Zəif tərəf: ' + ((dir && dir.name) || 'istiqamət'))
                : ((dir && dir.name) || 'İstiqamət'),
            hint: org + ' üzrə ' + ((dir && dir.name) || 'istiqamət')
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
    if (focus === 'reports') id = 'nkRepCards';
    var el = document.getElementById(id) || document.getElementById('nkRepFocus');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function reportPageHtml() {
    var list = reportStore.reports || [];
    var agg = reportAgg();
    var sel = selectedReport();
    var uploadBtn = isAdmin()
        ? '<button type="button" class="nk303-upload" onclick="nk303Call(\'uploadReport\')">' + iconSvg('upload') + ' PPTX yüklə</button>'
        : '';
    var head = '<div class="nk303-hub-toolbar">'
        + '<div class="nk303-hub-toolbar-main">'
        + backToCountryHtml(true)
        + '<div class="nk303-hub-toolbar-title">'
        + '<h3>Hesabat analizi</h3>'
        + '<p class="nk303-hint">Yüklənmiş PPTX əsasında qurumun rəqəmsal inkişafının qiymətləndirilməsi.</p>'
        + '</div></div>'
        + uploadBtn
        + '</div>'
        + reportFilesHtml();
    if (!list.length) {
        return head + '<section class="nk303-card nk303-card--report-empty">'
            + '<h3>Hələ hesabat yoxdur</h3>'
            + '<p class="nk303-hint">' + (isAdmin()
                ? 'Qurumun diaqnostika və ya rəqəmsal inkişaf hesabatını PPTX formatında yükləyin. Sistem slaydları oxuyub istiqamət ballarını, cari vəziyyəti, çatışmazlıqları və tövsiyələri çıxaracaq.'
                : 'Hesabat yüklənəndən sonra burada qurumun rəqəmsal inkişaf indeksi, 4 rəsmi istiqamət və tapıntılar görünəcək.')
            + '</p></section>';
    }
    var focus = ui.reportFocus || '';
    var weakHtml = agg.weak
        ? esc(agg.weak.name) + ' · ' + esc(fmt1(agg.weak.score))
        : '—';
    var nStr = sel ? (sel.strengths || []).length : 0;
    var nAct = sel ? (sel.actions || []).length : 0;
    if (!sel) {
        (list || []).forEach(function(r) {
            nStr += (r.strengths || []).length;
            nAct += (r.actions || []).length;
        });
    }
    var kpis = '<div class="nk303-kpis nk303-kpis--4">'
        + kpiCardHtml({
            ic: 'is-teal', icon: 'chart', label: 'Hesabat', valueHtml: esc(String(agg.n)),
            onclick: reportFocusHit('reports'), on: focus === 'reports'
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'star', label: 'Rəqəmsal inkişaf indeksi',
            valueHtml: agg.overall == null ? '—' : (esc(fmt1(agg.overall)) + ' <small>/ 100</small>'),
            subHtml: '<div class="sub">' + esc(maturityOf(agg.overall) ? maturityOf(agg.overall).label : NA) + '</div>',
            onclick: reportFocusHit('summary'), on: focus === 'summary'
        })
        + kpiCardHtml({
            ic: 'is-amber', icon: 'down', label: 'Ən zəif istiqamət', valueHtml: weakHtml,
            onclick: reportFocusHit('weak'), on: focus === 'weak'
        })
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
    var mid = '<div class="nk303-mid nk303-mid--two">'
        + '<section class="nk303-card nk303-card--gauge nk303-card--hit' + (focus === 'summary' ? ' is-on' : '') + '" onclick="nk303Call(\'reportFocus\',\'summary\')"><h3>Ümumi nəticə</h3>'
        + hubGaugeHtml(agg.overall, false)
        + '</section>'
        + '<section class="nk303-card nk303-card--radar"><h3>Rəqəmsallaşma istiqamətləri</h3>'
        + compareLegendHtml(barColor(agg.overall), barColor(maturityTarget(agg.overall)))
        + '<div class="nk303-chart nk303-chart--radar"><canvas id="nkRepRadar"></canvas></div>'
        + '</section></div>'
        + '<section class="nk303-card nk303-card--rep-split' + (focus === 'findings' || focus === 'strengths' || focus === 'weak' || focus === 'actions' ? ' is-on' : '') + '" id="nkRepDonutCard">'
        + '<h3>Nəticələrin bölgüsü</h3>'
        + '<p class="nk303-hint">Dilimi və ya adı klikləyin — qurumun çatışmazlığı, güclü və zəif tərəfi açılsın.</p>'
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
    var themeHtml = '<section class="nk303-card"><h3>Əhatə olunan mövzular</h3>'
        + (themes.length
            ? '<div class="nk303-theme-bars">' + themes.map(function(t) {
                return '<div class="nk303-dist-row"><b>' + esc(t.label) + '</b>'
                    + '<span class="nk303-track"><i style="width:' + Math.max(6, Math.min(100, t.score)) + '%;background:#0f766e"></i></span>'
                    + '<em>' + esc(fmt1(t.score)) + '</em></div>';
            }).join('') + '</div>'
            : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section>';
    var cards = '<section class="nk303-card" id="nkRepCards"><h3>Yüklənmiş hesabatlar</h3>'
        + '<div class="nk303-rep-grid">' + list.map(function(r) {
            var on = sel && sel.id === r.id;
            return '<button type="button" class="nk303-rep-card' + (on ? ' is-on' : '') + '" onclick="nk303Call(\'pickReport\',\'' + qarg(r.id) + '\')">'
                + '<span class="nk303-rep-org">' + esc(r.org || r.name || 'Hesabat') + '</span>'
                + '<strong>' + (r.overall == null ? '—' : esc(fmt1(r.overall))) + '</strong>'
                + '<span class="nk303-hint">' + esc((r.maturity && r.maturity.label) || NA)
                + (r.year ? ' · ' + r.year : '')
                + (r.slideCount ? ' · ' + r.slideCount + ' slayd' : '')
                + '</span></button>';
        }).join('') + '</div></section>';
    var detail = '';
    if (sel) {
        var dirRows = DIRS.map(function(d) {
            var sc = sel.dirs && sel.dirs[d.id];
            var on = focus === ('dir:' + d.id) || (focus === 'weak' && agg.weak && agg.weak.id === d.id);
            return '<button type="button" class="nk303-rep-dir' + (on ? ' is-on' : '') + '" onclick="nk303Call(\'reportFocus\',\'dir:' + d.id + '\')">'
                + '<div><b>' + esc(d.name) + '</b>' + matBadge(sc) + '</div>'
                + '<em>' + (sc == null ? '—' : esc(fmt1(sc))) + '</em></button>';
        }).join('');
        detail = '<section class="nk303-card nk303-card--report" id="nkRepDetail"><div class="nk303-rep-head">'
            + '<div><p class="nk303-kicker">Seçilmiş hesabat</p><h3>' + esc(sel.org || sel.name || 'Hesabat') + '</h3>'
            + '<p class="nk303-hint">' + esc(sel.name || '')
            + (sel.year ? ' · ' + sel.year : '')
            + (sel.slideCount ? ' · ' + sel.slideCount + ' slayd' : '')
            + (sel.inferred ? ' · bal mətn əsasında qiymətləndirilib' : '')
            + '</p></div>'
            + (isAdmin() ? '<button type="button" class="nk303-btn nk303-btn--ghost" onclick="nk303Call(\'removeReport\',\'' + qarg(sel.id) + '\')">Sil</button>' : '')
            + '</div>'
            + '<p class="nk303-rep-sum">' + esc(sel.summary || NA) + '</p>'
            + '<div class="nk303-rep-dirs" id="nkRepDirs">' + dirRows + '</div>'
            + '<div class="nk303-find nk303-find--3">'
            + '<div id="nkRepColStr" class="' + (focus === 'strengths' ? 'is-on' : '') + '"><button type="button" class="nk303-find-hit" onclick="nk303Call(\'reportFocus\',\'strengths\')"><h4>Cari vəziyyət / güclü tərəflər</h4></button>' + reportListHtml(sel.strengths) + '</div>'
            + '<div id="nkRepColFind" class="' + (focus === 'findings' ? 'is-on' : '') + '"><button type="button" class="nk303-find-hit" onclick="nk303Call(\'reportFocus\',\'findings\')"><h4>Çatışmazlıqlar</h4></button>' + reportListHtml(sel.findings) + '</div>'
            + '<div id="nkRepColAct" class="' + (focus === 'actions' ? 'is-on' : '') + '"><button type="button" class="nk303-find-hit" onclick="nk303Call(\'reportFocus\',\'actions\')"><h4>Tövsiyələr</h4></button>' + reportListHtml(sel.actions) + '</div>'
            + '</div>'
            + ((sel.slides || []).length
                ? '<h4 class="nk303-rep-slides-h">Slayd icmalı'
                    + (sel.slideCount ? '<span>' + esc(String(sel.slideCount)) + ' slayd</span>' : '')
                    + '</h4><ul class="nk303-rep-slides">'
                    + (sel.slides || []).map(function(s) {
                        var title = String(s.title || ('Slayd ' + (s.n || ''))).replace(/[\u000b\u000c]+/g, ' ').replace(/\s+/g, ' ').trim();
                        return '<li><em>' + esc(String(s.n || '')) + '</em><b>' + esc(title) + '</b></li>';
                    }).join('') + '</ul>'
                : '')
            + '</section>';
    }
    return head + kpis + mid + themeHtml + cards + detail;
}

function drawReportCharts() {
    if (typeof Chart === 'undefined') return;
    var agg = reportAgg();
    var sel = selectedReport();
    if (document.getElementById('nkHubGauge')) {
        var empty = agg.overall == null;
        var v = empty ? 0 : Math.max(0, Math.min(100, agg.overall));
        var col = empty ? '#cbd5e1' : barColor(agg.overall);
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
                { text: '/ 100', color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])]
        });
    }
    if (document.getElementById('nkRepRadar')) {
        var src = sel && sel.dirs ? sel.dirs : agg.dirs;
        var goals = (sel && sel.targets) || (agg && agg.targets) || {};
        var nowVals = DIRS.map(function(d) { return src[d.id] != null ? src[d.id] : 0; });
        var goalVals = DIRS.map(function(d) {
            if (goals[d.id] != null) return goals[d.id];
            var goal = maturityTarget(src[d.id]);
            return goal != null ? goal : 0;
        });
        makeHubChart('nkRepRadar', {
            type: 'radar',
            data: {
                labels: DIRS.map(function(d) { return dirShort(d); }),
                datasets: radarPairDatasets(nowVals, goalVals, barColor(agg.overall), barColor(maturityTarget(agg.overall)))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { stepSize: 20, color: '#94a3b8', backdropColor: 'transparent', font: { size: 10, weight: '600' } },
                        grid: { color: 'rgba(148,163,184,0.35)' },
                        angleLines: { color: 'rgba(148,163,184,0.35)' },
                        pointLabels: { color: '#334155', font: { size: 11, weight: '700' } }
                    }
                }
            }
        });
    }
    if (document.getElementById('nkRepDonut')) {
        var nFind = sel ? (sel.findings || []).length : agg.findings;
        var nStr = sel ? (sel.strengths || []).length : 0;
        if (!sel) {
            (reportStore.reports || []).forEach(function(r) {
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
                var d = DIRS[els[0].index];
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
    if (ui.hub === 'report') inner = reportPageHtml();
    else if (ui.hub) inner = hubPageHtml(currentHubView());
    else if (ui.mode === 'institution' || ui.orgKey) inner = institutionBody(model);
    else if (ui.nav === 'gaps') inner = highGapsBody(model);
    else if (ui.nav === 'orgs') inner = countryOrgListBody(model, 'all');
    else if (isVisNav(ui.nav)) inner = countryOrgListBody(model, ui.nav);
    else inner = countryBody(model);
    return inner + sourceHtml() + '</div>';
}

function sourceHtml() {
    if (ui.hub === 'report') {
        return '<p class="nk303-src">Hesabat analizi yüklənmiş PPTX təqdimatın mətni, balları və rəsmi 4 istiqamət (Strategiya, Xidmətlər, Texniki-texnoloji infrastruktur, Əməliyyat modelləri) əsasında qurulur.</p>';
    }
    if (ui.hub === 'exq') {
        return '<p class="nk303-src">Mənbə: <a href="' + EXQ_LAW_URL + '" target="_blank" rel="noopener noreferrer">e-qanun.az/framework/60998</a>'
            + ' · NK Qərar 380 (9 dekabr 2025) · bənd 4.14–4.18 · yekun nəticə və 5 ulduz şkalası</p>';
    }
    return '<p class="nk303-src">Mənbə: <a href="https://e-qanun.az/framework/60692" target="_blank" rel="noopener noreferrer">e-qanun.az/framework/60692</a>'
        + ' · metodologiya sənədi: <a href="https://nk.gov.az/uploads/doc/docs/68f9c02089229.pdf" target="_blank" rel="noopener noreferrer">nk.gov.az PDF</a>'
        + ' · rəsmi istiqamətlər: Strategiya, Xidmətlər, Texniki-texnoloji infrastruktur, Əməliyyat modelləri</p>';
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
        var dirs = dirCompareRows(model.dirAgg);
        makeChart('nkRadarChart', {
            type: 'radar',
            data: {
                labels: dirs.map(function(d) { return d.short; }),
                datasets: radarPairDatasets(
                    dirs.map(function(d) { return d.now != null ? d.now : 0; }),
                    dirs.map(function(d) { return d.target != null ? d.target : 0; }),
                    barColor(model.countryAvg),
                    barColor(maturityTarget(model.countryAvg))
                )
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
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            color: '#94a3b8',
                            backdropColor: 'transparent',
                            font: { size: 10, weight: '600' }
                        },
                        grid: { color: 'rgba(148,163,184,0.35)' },
                        angleLines: { color: 'rgba(148,163,184,0.35)' },
                        pointLabels: { color: '#1e3a8a', font: { size: 12, weight: '700' } }
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
                        tension: 0.2,
                        cubicInterpolationMode: 'monotone',
                        pointRadius: function(ctx) {
                            var p = series[ctx.dataIndex];
                            return p && p.real ? 5 : 0;
                        },
                        pointHoverRadius: function(ctx) {
                            var p = series[ctx.dataIndex];
                            return p && p.real ? 7 : 0;
                        },
                        pointBackgroundColor: '#7c3aed',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 2.8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            filter: function(item) {
                                var p = series[item.dataIndex];
                                return !!(p && p.real);
                            },
                            callbacks: {
                                title: function(items) {
                                    var i = items && items[0] && items[0].dataIndex;
                                    var row = series[i];
                                    return row && row.year != null ? String(row.year) : '';
                                },
                                label: function(ctx) {
                                    var row = series[ctx.dataIndex] || {};
                                    if (row.y == null) return 'Bal yoxdur';
                                    var n = row.n || 0;
                                    return 'Ortalama: ' + fmt1(row.y) + ' · ' + n + ' qurum';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
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
    if (kind === 'baxilir') return { id: 'part', label: 'İcradadır' };
    if (kind === 'partial') return { id: 'part', label: 'Qismən' };
    return { id: 'part', label: '—' };
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
    ui.reportId = '';
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
    if (!section || section === 'diag') {
        closeHub();
        window.scrollTo(0, 0);
        render();
        return;
    }
    if (ui.hub === section) {
        closeHub();
        window.scrollTo(0, 0);
        render();
        return;
    }
    ui.hub = section;
    ui.hubSearch = '';
    ui.hubPage = 1;
    ui.hubFilter = '';
    ui.hubSort = section === 'meqsed' ? 'date' : 'desc';
    ui.mode = 'country';
    ui.orgKey = '';
    ui.nav = 'overview';
    hideHubOverlay();
    window.scrollTo(0, 0);
    render();
    if (section === 'report' && !reportStore.loaded) loadReportUploads();
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
        kpiCls = ' nk303-kpis--4';
        cards = kpiCardHtml({
            ic: 'is-blue', icon: 'chart', label: 'Ümumi müraciət',
            valueHtml: esc(String(st.total || 0)), subHtml: '<div class="sub">' + esc(String(st.baxilir || 0)) + ' icradadır</div>',
            onclick: hubKpiHit('all'), on: !f
        })
        + kpiCardHtml({
            ic: 'is-blue', icon: 'building', label: 'Müraciət edən qurum',
            valueHtml: esc(String(st.qurum || 0)), subHtml: '<div class="sub">unikal qurum</div>',
            onclick: hubKpiHit('orgs'), on: f === 'orgs'
        })
        + kpiCardHtml({
            ic: 'is-rose', icon: 'star', label: 'Müsbət rəy',
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
            subHtml: star
                ? '<div class="sub">' + esc(exqStarLabel(star)) + ' · Qərar 380, bənd 4.18</div>'
                : '<div class="sub">xidmət sayı ilə çəkili ortalama</div>'
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

function hubExqGaugeHtml(score) {
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
        + '<p class="nk303-exq-formula">Yekun nəticə = ümumi toplanmış / ümumi mümkün × 100. '
        + 'Çəkilər: 1★ 0,2 · 2★ 0,4 · 3★ 0,6 · 4★ 0,8 · 5★ 1 (bənd 4.16). '
        + 'N/A altmeyarlar mümkün nəticəyə daxil edilmir.</p>'
        + '</div>';
}

function hubRowHasResult(section, r) {
    if (section === 'meqsed') {
        return r.opinion === 'pos' || r.opinion === 'neg' || r.opinion === 'revision' || r.opinion === 'partial';
    }
    if (section === 'exq') {
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
    return true;
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
                scoredKey: ''
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

function hubRowMatchesMeqsedFilter(r, filter) {
    if (!filter || filter === 'all' || filter === 'orgs') return true;
    var opinion = (r && r.opinion) || '';
    var kind = (r && r.novuKind) || 'other';
    var resultKey = (r && r.resultKey) || '';
    if (filter === 'pos' || filter === 'neg' || filter === 'partial' || filter === 'revision') return opinion === filter;
    if (filter === 'baxilir') return resultKey === 'baxilir';
    if (filter === 'new_system' || filter === 'exist_system' || filter === 'new_service'
        || filter === 'exist_service' || filter === 'fiziki' || filter === 'rsd'
        || filter === 'cloud' || filter === 'other') {
        return kind === filter;
    }
    if (filter === 'yeni') return !!(r && r.isNew);
    if (filter === 'movcud') return !!(r && r.isExist);
    if (filter === 'sistem') return !!(r && r.isSystem);
    if (filter === 'xidmet') return !!(r && r.isService);
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
    if (key === 'orgs') return ui.hub === 'exq' ? 'Əhatə olunan qurumlar' : 'Müraciət edən qurumlar';
    if (key === 'has_result') return 'Nəticəsi olan';
    if (key === 'no_result') return 'Nəticəsiz';
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
        var keepAll = ui.hubFilter === 'orgs'
            || !!(ui.hubFilter && ui.hubFilter !== 'all' && ui.hubFilter !== 'svc_sum');
        list = collapseExqHubRows(list, keepAll);
    }
    else if (ui.hubFilter === 'orgs') list = uniqueHubOrgs(list);
    list = sortHubRows(list, view.section, hubSortMode());
    var pages = Math.max(1, Math.ceil(list.length / HUB_PAGE_SIZE) || 1);
    if (ui.hubPage > pages) ui.hubPage = pages;
    if (ui.hubPage < 1) ui.hubPage = 1;
    var slice = list.slice((ui.hubPage - 1) * HUB_PAGE_SIZE, ui.hubPage * HUB_PAGE_SIZE);
    var heads;
    if (view.section === 'exq') heads = ['№', 'Qurum', 'İl', 'Xidmət', 'Yekun', 'Status'];
    else if (view.section === 'meqsed') heads = ['№', 'Qurum', 'Müraciət növü', 'Rəy', 'Tarix'];
    else if (view.section === 'isq') heads = ['№', 'Qurum', 'İl', 'Bal', 'Nəticə', 'Status'];
    else heads = ['№', 'Qurum', 'İl', 'Bal', 'Status'];
    var body = slice.map(function(r, i) {
        var rank = (ui.hubPage - 1) * HUB_PAGE_SIZE + i + 1;
        var href = r.key ? jiraBrowseUrl(r.key) : '';
        var click = href
            ? ' class="is-click" onclick="nk303Call(\'hubOpen\',\'' + qarg(r.key) + '\')" title="Jira-da aç: ' + esc(r.key) + '"'
            : '';
        var cells = '<td class="num">' + rank + '</td>'
            + '<td class="q" title="' + esc(r.qurum) + (r.key ? ' · ' + esc(r.key) : '') + '">'
            + (href
                ? '<a class="nk303-qurum-link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">' + esc(r.qurum) + '</a>'
                : esc(r.qurum))
            + '</td>';
        if (view.section === 'meqsed') {
            var op = hubOpinionLabel(r.opinion || (r.resultKey === 'baxilir' ? 'baxilir' : ''));
            cells += '<td class="q">' + esc(clipText(r.novu || '—', 80)) + '</td>'
                + '<td><span class="nk303-pri is-' + op.id + '">' + esc(op.label) + '</span></td>'
                + '<td>' + esc(r.date || '—') + '</td>';
        } else if (view.section === 'exq') {
            var w = r.score == null ? 0 : Math.max(0, Math.min(100, r.score));
            var rowStar = exqStarOfRow(r);
            cells += '<td class="num">' + esc(r.year || '—') + '</td>'
                + '<td class="num">' + esc(r.svc == null ? '—' : String(r.svc)) + '</td>'
                + '<td><div class="nk303-scorecell"><b>' + esc(r.score == null ? '—' : fmt1(r.score) + '%') + '</b>'
                + (rowStar ? '<em class="nk303-star-mini">' + esc(exqStarLabel(rowStar)) + '</em>' : '')
                + '<span class="bar"><i style="width:' + w + '%;background:' + exqBarColor(r.score) + '"></i></span></div></td>'
                + '<td>' + esc(r.status || '—') + '</td>';
        } else if (view.section === 'isq') {
            cells += '<td class="num">' + esc(r.year || '—') + '</td>'
                + '<td class="num">' + esc(r.score == null ? '—' : fmt1(r.score)) + '</td>'
                + '<td class="act">' + esc(clipText(r.result || NA, 90)) + '</td>'
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
        + (slice.some(function(r) { return r.key; }) ? ' · sətirə klikləyib tapşırığı Jira-da açın' : '')
        + '</p></div>'
        + (list.length
            ? '<div class="nk303-table-wrap"><table class="nk303-table"><thead><tr>'
                + heads.map(function(h) { return '<th>' + esc(h) + '</th>'; }).join('')
                + '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager
            : '<p class="nk303-empty">' + esc(NA) + '</p>');
}

function meqsedKindShareHtml(st) {
    st = st || {};
    var order = (MEQSED_NOVU_KINDS || []).slice();
    var otherN = (st.byKind && st.byKind.other) || 0;
    var otherSplit = (st.byKindResult && st.byKindResult.other) || {};
    if (otherN || otherSplit.total) order.push('other');
    var tones = [
        { key: 'pos', color: '#5b21b6' },
        { key: 'neg', color: '#dc2626' },
        { key: 'revision', color: '#d97706' },
        { key: 'baxilir', color: '#94a3b8' }
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
    var max = orgs.length ? (orgs[0].n || 1) : 1;
    var orgHtml = orgs.length
        ? '<ul class="nk303-orgshare">' + orgs.map(function(row) {
            var w = max ? Math.round((row.n / max) * 100) : 0;
            return '<li><button type="button" onclick="nk303Call(\'hubSearch\',\'' + qarg(row.name || '') + '\')">'
                + '<span title="' + esc(row.name) + '">' + esc(row.name) + '</span>'
                + '<div class="trk" aria-hidden="true"><i style="width:' + w + '%"></i></div>'
                + '<b>' + esc(String(row.n || 0)) + '</b>'
                + '</button></li>';
        }).join('') + '</ul>'
        : '<p class="nk303-empty">' + esc(NA) + '</p>';
    return '<div class="nk303-mid nk303-mid--two">'
        + '<section class="nk303-card"><h3>Aylıq axın</h3>'
        + (hasMonth
            ? '<div class="nk303-chart nk303-chart--trend" style="height:13rem"><canvas id="meqsedMonthChart" aria-label="Aylıq müraciət axını"></canvas></div>'
            : '<p class="nk303-empty">' + esc(NA) + '</p>')
        + '</section>'
        + '<section class="nk303-card"><h3>Ən çox müraciət edən qurumlar</h3>'
        + orgHtml
        + '</section></div>';
}

function hubBodyHtml(view) {
    var st = view.stats || {};
    var vis = hubVisCounts(st.byStatus);
    var total = st.qurum || 0;
    var donePct = pct(vis.done, total);
    var avg = view.section === 'exq' && st.weightedAvg != null ? st.weightedAvg : st.avg;
    var rankHtml = '';
    var isRadar = view.section === 'diag' || view.section === 'self';
    if (isRadar) {
        rankHtml = '<ol class="nk303-rank">'
            + (st.dirRadar || []).map(function(d, i) {
                var goal = maturityTarget(d.avg);
                return '<li title="Mövcud: ' + esc(d.avg == null ? '—' : fmt1(d.avg))
                    + ' · Hədəf: ' + esc(goal == null ? '—' : fmt1(goal)) + '">'
                    + '<i>' + (i + 1) + '</i>'
                    + '<span>' + esc(d.short || d.title) + '</span>'
                    + '<b>' + esc(d.avg == null ? '—' : fmt1(d.avg)) + '</b>'
                    + '<em>' + esc(goal == null ? '—' : fmt1(goal)) + '</em>'
                    + '</li>';
            }).join('')
            + '</ol>';
    }
    var legendItems = view.section === 'meqsed'
        ? [
            { id: 'pos', label: 'Müsbət', n: st.pos || 0, color: '#5b21b6', filter: 'pos' },
            { id: 'neg', label: 'Mənfi', n: st.neg || 0, color: '#dc2626', filter: 'neg' },
            { id: 'rev', label: 'Düzəliş', n: st.other || 0, color: '#d97706', filter: 'revision' },
            { id: 'wait', label: 'İcradadır', n: st.baxilir || 0, color: '#94a3b8', filter: 'baxilir' }
        ]
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
    var midRightTitle = isRadar ? 'Rəqəmsallaşma istiqamətləri'
        : (view.section === 'exq' ? 'Qurumların yekun nəticəsi'
            : (view.section === 'meqsed' ? 'Müraciət növü üzrə nəticə' : 'Bal diapazonu'));
    var midRight = isRadar
        ? '<div class="nk303-hub-radar">'
            + compareLegendHtml(barColor(avg), barColor(maturityTarget(avg)))
            + '<div class="nk303-radar-row">'
            + '<div class="nk303-chart nk303-chart--radar"><canvas id="nkHubRadar"></canvas></div>'
            + rankHtml + '</div></div>'
        : (view.section === 'meqsed'
            ? meqsedKindShareHtml(st)
            : '<div class="nk303-chart nk303-chart--trend" style="height:'
                + (view.section === 'exq' ? Math.max(16, exqQurumsForChart(st).length * 2.15 + 2.4) : 16)
                + 'rem"><canvas id="nkHubBars"></canvas></div>');
    var statusTitle = view.section === 'meqsed' ? 'Rəy vəziyyəti' : 'Qiymətləndirmələrin icra vəziyyəti';
    return hubKpisHtml(view)
        + '<div class="nk303-mid">'
        + '<section class="nk303-card nk303-card--gauge"><h3>' + esc(midLeftTitle) + '</h3>'
        + (view.section === 'meqsed'
            ? '<div class="nk303-chart nk303-chart--donut"><canvas id="nkHubDonut"></canvas></div>'
            : (view.section === 'exq' ? hubExqGaugeHtml(avg) : hubGaugeHtml(avg, isRadar)))
        + '</section>'
        + '<section class="nk303-card nk303-card--radar"><h3>' + esc(midRightTitle) + '</h3>'
        + midRight
        + '</section>'
        + '<section class="nk303-card nk303-card--status"><h3>' + esc(statusTitle) + '</h3>'
        + (view.section === 'meqsed'
            ? '<p class="nk303-hint" style="margin-top:0">Yeni / mövcud və sistem / xidmət kəsimi</p>'
                + '<div class="nk303-chart nk303-chart--trend" style="height:13rem"><canvas id="nkHubLife"></canvas></div>'
            : '<div class="nk303-chart nk303-chart--donut"><canvas id="nkHubDonut"></canvas></div>')
        + legend
        + (view.section === 'meqsed' ? '' : ('<div class="nk303-complete is-click" onclick="nk303Call(\'hubFilter\',\'done\')" title="Tamamlanmış qiymətləndirmələrə bax">'
            + '<div class="nk303-complete-top"><span>Tamamlanma faizi</span><b>' + donePct + '%</b></div>'
            + '<div class="nk303-mini-bar is-green"><i style="width:' + donePct + '%"></i></div></div>'))
        + '</section></div>'
        + (view.section === 'meqsed' ? meqsedHubExtraHtml(st) : '')
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
    if (document.getElementById('nkHubGauge')) {
        var empty = avg == null;
        var v = empty ? 0 : Math.max(0, Math.min(100, avg));
        var col = empty ? '#cbd5e1' : (view.section === 'exq' ? exqBarColor(avg) : barColor(avg));
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
                { text: view.section === 'exq' ? '%' : '/ 100', color: '#94a3b8', font: '600 12px Inter, system-ui, sans-serif', gap: 18 }
            ])]
        });
    }
    if (document.getElementById('nkHubRadar')) {
        var dirs = (st.dirRadar || []).length ? st.dirRadar : DIRS.map(function(d) {
            return { short: dirShort(d), avg: null };
        });
        makeHubChart('nkHubRadar', {
            type: 'radar',
            data: {
                labels: dirs.map(function(d) { return d.short || d.title; }),
                datasets: radarPairDatasets(
                    dirs.map(function(d) { return d.avg != null ? d.avg : 0; }),
                    dirs.map(function(d) {
                        var goal = maturityTarget(d.avg);
                        return goal != null ? goal : 0;
                    }),
                    barColor(avg),
                    barColor(maturityTarget(avg))
                )
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
                        pointLabels: { color: '#334155', font: { size: 11, weight: '700' } }
                    }
                }
            }
        });
    }
    if (document.getElementById('nkHubDonut')) {
        var items;
        var centerN;
        var centerLb;
        if (view.section === 'meqsed') {
            items = [
                { label: 'Müsbət', n: st.pos || 0, color: '#5b21b6', filter: 'pos' },
                { label: 'Mənfi', n: st.neg || 0, color: '#dc2626', filter: 'neg' },
                { label: 'Düzəliş', n: st.other || 0, color: '#d97706', filter: 'revision' },
                { label: 'İcradadır', n: st.baxilir || 0, color: '#94a3b8', filter: 'baxilir' }
            ];
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
                    labels: qurums.map(function(q) { return q.name; }),
                    datasets: [{
                        data: qurums.map(function(q) {
                            return q.score != null && isFinite(q.score) ? q.score : 0;
                        }),
                        backgroundColor: qurums.map(function(q) {
                            return q.score != null && isFinite(q.score) ? exqBarColor(q.score) : '#cbd5e1';
                        }),
                        borderRadius: 6,
                        maxBarThickness: 18
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
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
                        x: { min: 0, max: 100, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.2)' } },
                        y: { ticks: { color: '#334155', font: { size: 11, weight: '600' } }, grid: { display: false } }
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
                    { label: 'Müsbət', backgroundColor: '#5b21b6', data: [lifeN('yeni', 'sistem', 'pos'), lifeN('yeni', 'xidmet', 'pos'), lifeN('movcud', 'sistem', 'pos'), lifeN('movcud', 'xidmet', 'pos')], borderRadius: 6 },
                    { label: 'Mənfi', backgroundColor: '#dc2626', data: [lifeN('yeni', 'sistem', 'neg'), lifeN('yeni', 'xidmet', 'neg'), lifeN('movcud', 'sistem', 'neg'), lifeN('movcud', 'xidmet', 'neg')], borderRadius: 6 },
                    { label: 'Düzəliş', backgroundColor: '#d97706', data: [lifeN('yeni', 'sistem', 'revision'), lifeN('yeni', 'xidmet', 'revision'), lifeN('movcud', 'sistem', 'revision'), lifeN('movcud', 'xidmet', 'revision')], borderRadius: 6 }
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

function scheduleHubPrefetch() {
    if (hubPrefetchTimer) clearTimeout(hubPrefetchTimer);
    hubPrefetchTimer = setTimeout(function() {
        hubPrefetchTimer = null;
        try { prefetchAssessmentHubViews(); } catch (e) {}
    }, 50);
}

function render() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    var y = window.scrollY || 0;
    var model = buildModel();
    destroyNkCharts();
    destroyHubCharts();
    destroyMeqsedOverviewCharts();
    root.innerHTML = pageHeadHtml(model) + bodyHtml(model);
    requestAnimationFrame(function() {
        if (ui.hub === 'report') {
            drawReportCharts();
        } else if (ui.hub) {
            var view = currentHubView();
            drawHubCharts(view);
            if (view.section === 'meqsed') drawMeqsedOverviewCharts(view.stats);
        } else {
            drawCharts(model);
        }
        if (ui.hub === 'report' && ui.reportPin) {
            ui.reportPin = false;
            scrollReportFocus();
        } else {
            window.scrollTo(0, y);
        }
        scheduleHubPrefetch();
    });
}

function bindEsc() {
    if (ui.escBound) return;
    ui.escBound = true;
    document.addEventListener('keydown', function(e) {
        if (!ui.open) return;
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (document.body.classList.contains('assess-modal-open')) return;
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
    return fetch(url, opts);
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
    document.title = 'Ölkə üzrə Rəqəmsallaşma Diaqnostikası';
    bindEsc();
    bindHistory();
    bindAdminGate();
    if (isAdminPath() && !adminState.isAdmin) showAdminGate();
    render();
    loadAdminState().then(function() {
        if (!ui.open) return;
        render();
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
    if (isNk303Path()) showNk303Page();
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
        .then(function(r) { return r.json(); })
        .then(function(data) {
            applyReportPayload(data);
            if (ui.open) render();
        })
        .catch(function() {
            reportStore.loaded = true;
        });
}

function pickPptxFile() {
    if (!isAdmin()) return;
    var input = document.getElementById('nk303PptxInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'nk303PptxInput';
        input.accept = '.pptx,.pptm,application/vnd.openxmlformats-officedocument.presentationml.presentation';
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
    input.value = '';
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
                if (first && first.id) ui.reportId = first.id;
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
        .then(function(r) { return r.json(); })
        .then(function(data) {
            applyExcelPayload(data);
            if (ui.open) render();
        })
        .catch(function() {
            excelStore.loaded = true;
        });
}

function pickExcelFile() {
    if (!isAdmin()) return;
    var input = document.getElementById('nk303ExcelInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'nk303ExcelInput';
        input.accept = '.xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', onExcelChosen);
        document.body.appendChild(input);
    }
    input.click();
}

function onExcelChosen(ev) {
    var input = ev.target;
    var files = input.files;
    if (!files || !files.length) return;
    var fd = new FormData();
    var i;
    for (i = 0; i < files.length; i++) fd.append('file', files[i]);
    input.value = '';
    showToast('Excel oxunur…', 'info');
    fetch('/api/diaqnostika/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function(r) {
            return r.json().then(function(data) {
                return { ok: r.ok, status: r.status, data: data };
            }).catch(function() {
                return {
                    ok: false,
                    status: r.status,
                    data: { error: r.status === 413 ? 'Fayl 25 MB-dan böyükdür' : 'Excel oxunmadı' }
                };
            });
        })
        .then(function(res) {
            if (!res.ok) {
                showToast((res.data && res.data.error) || (res.status === 401 ? 'Admin girişi lazımdır' : 'Excel oxunmadı'), 'error');
                return;
            }
            return diagApi('/api/diaqnostika/uploads').then(function(r) { return r.json(); }).then(function(data) {
                applyExcelPayload(data);
                var names = [];
                (res.data.files || []).forEach(function(f) {
                    (f.orgs || []).forEach(function(o) {
                        if (o && o.name) names.push(o.name);
                    });
                });
                showToast(
                    (names[0] || 'Excel') + (names.length > 1 ? ' və ' + (names.length - 1) + ' qurum' : '') + ' yükləndi',
                    'success'
                );
                if (res.data.errors && res.data.errors.length) {
                    showToast(res.data.errors[0], 'error');
                }
                ui.status = '';
                var uploadedOrgs = [];
                (res.data.files || []).forEach(function(f) {
                    (f.orgs || []).forEach(function(o) { uploadedOrgs.push(o); });
                });
                var ys = uniqueYearsFromOrgs(uploadedOrgs);
                ui.year = ys.length === 1 ? String(ys[0]) : 'all';
                if (names.length === 1) {
                    ui.orgKey = qurumMatchKey(names[0]) || ui.orgKey;
                    ui.mode = 'institution';
                    ui.nav = 'overview';
                    applyOrgYear(ui.orgKey);
                } else {
                    ui.mode = 'country';
                    ui.nav = 'orgs';
                }
                render();
                window.scrollTo(0, 0);
            });
        })
        .catch(function() { showToast('Excel yüklənmədi', 'error'); });
}

function removeExcelFile(fileId) {
    fileId = darg(fileId || '');
    if (!fileId || !isAdmin()) return;
    var file = (excelStore.files || []).filter(function(f) { return f.id === fileId; })[0];
    var label = file && file.name ? file.name : 'Excel';
    if (!window.confirm(label + ' silinsin? Bu fayldan gələn qurum nəticələri səhifədən çıxacaq.')) return;
    fetch('/api/diaqnostika/uploads/' + encodeURIComponent(fileId), { method: 'DELETE', credentials: 'same-origin' })
        .then(function(r) {
            return r.json().then(function(data) { return { ok: r.ok, data: data }; });
        })
        .then(function(res) {
            if (!res.ok) {
                showToast((res.data && res.data.error) || 'Silinmədi', 'error');
                return;
            }
            return diagApi('/api/diaqnostika/uploads').then(function(r) { return r.json(); }).then(function(data) {
                applyExcelPayload(data);
                var still = buildModel();
                if (ui.orgKey && !still.selected) {
                    ui.orgKey = '';
                    ui.mode = 'country';
                    ui.nav = 'overview';
                }
                showToast('Excel silindi', 'success');
                render();
            });
        })
        .catch(function() { showToast('Excel silinmədi', 'error'); });
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
    } else if (action === 'reset') {
        resetFilters();
        ui.mode = 'country';
        ui.nav = 'overview';
    } else if (action === 'openOrg') {
        ui.orgKey = darg(payload || '');
        ui.mode = 'institution';
        ui.nav = 'overview';
        ui.expandDir = '';
        ui.expandCrit = '';
        applyOrgYear(ui.orgKey);
        window.scrollTo(0, 0);
    } else if (action === 'openDir') {
        ui.dirId = payload || '';
        ui.expandDir = payload || '';
        ui.nav = 'dirs';
        ui.page = 1;
    } else if (action === 'expandDir') {
        ui.expandDir = ui.expandDir === payload ? '' : payload;
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
        var hubInp = document.querySelector('#nk303HubRoot input[type="search"]');
        if (hubInp) {
            hubInp.focus();
            var hlen = hubInp.value.length;
            try { hubInp.setSelectionRange(hlen, hlen); } catch (e3) {}
        }
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
    } else if (action === 'upload') {
        pickExcelFile();
        return;
    } else if (action === 'removeExcel') {
        removeExcelFile(payload);
        return;
    } else if (action === 'uploadReport') {
        pickPptxFile();
        return;
    } else if (action === 'removeReport') {
        removeReportFile(payload);
        return;
    } else if (action === 'pickReport') {
        ui.reportId = darg(payload || '');
        ui.reportFocus = '';
        ui.reportPin = false;
        ui.hub = 'report';
        window.scrollTo(0, 0);
    } else if (action === 'reportFocus') {
        var next = darg(payload || '');
        ui.reportFocus = ui.reportFocus === next ? '' : next;
        ui.reportPin = true;
        ui.hub = 'report';
        render();
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
