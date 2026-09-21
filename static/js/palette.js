export var STATUS = {
    done: '#059669',
    progress: '#7c3aed',
    review: '#6366f1',
    esd: '#4c1d95',
    planned: '#94a3b8',
    paused: '#a78bfa',
    blocked: '#e11d48',
    rejected: '#be123c',
    other: '#c4b5fd'
};

export var VIS = {
    done: STATUS.done,
    in_progress: STATUS.progress,
    review: STATUS.review,
    not_started: STATUS.other
};

export var MATURITY = {
    ilkin: '#dc2626',
    idare: '#d97706',
    mueyyen: '#2563eb',
    opt: '#059669'
};

export var KIND = {
    diag: '#7c3aed',
    isq: '#2563eb',
    self: '#059669',
    exq: '#d97706',
    meqsed: '#5b21b6',
    report: '#0f766e'
};

export var OPINION = {
    pos: STATUS.done,
    neg: STATUS.rejected,
    revision: STATUS.paused,
    baxilir: STATUS.progress
};

export var STAR = ['#94a3b8', '#dc2626', '#d97706', '#2563eb', '#059669'];

export var RANK = ['#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

export var WORKLOAD = ['#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd'];

export var CAT = [
    '#4c1d95',
    '#6d28d9',
    '#7c3aed',
    '#8b5cf6',
    '#6366f1',
    '#5b21b6',
    '#818cf8',
    '#a78bfa',
    '#4f46e5',
    '#7c3aed'
];

function foldKey(s) {
    return String(s || '').toLowerCase()
        .replace(/ı/g, 'i').replace(/ə/g, 'e').replace(/ö/g, 'o')
        .replace(/ü/g, 'u').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ç/g, 'c');
}

export function rankColor(index, total) {
    if (!total || total <= 1) return RANK[2];
    var t = Math.max(0, Math.min(1, index / Math.max(1, total - 1)));
    return RANK[Math.round(t * (RANK.length - 1))];
}

export function workloadColor(index, total) {
    if (!total || total <= 1) return WORKLOAD[1];
    var t = Math.max(0, Math.min(1, index / Math.max(1, total - 1)));
    return WORKLOAD[Math.round(t * (WORKLOAD.length - 1))];
}

export function catColor(index) {
    return CAT[((index % CAT.length) + CAT.length) % CAT.length];
}

export function catColorByKey(key) {
    var s = foldKey(key);
    var h = 0;
    var i;
    for (i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return CAT[Math.abs(h) % CAT.length];
}

export function seriesColor(name) {
    var n = foldKey(name);
    if (!n || n === 'etiketsiz') return STATUS.other;
    if (n.indexOf('isq') !== -1) return KIND.isq;
    if (n.indexOf('diaqnost') !== -1) return KIND.diag;
    if (n.indexOf('meqsed') !== -1 || n.indexOf('uygunluq') !== -1) return KIND.meqsed;
    if (n === 'self' || n.indexOf('ozunu') !== -1) return KIND.self;
    if (n.indexOf('exq') !== -1) return KIND.exq;
    if (n.indexOf('esd') !== -1) return STATUS.esd;
    if (n.indexOf('iesr') !== -1 || n.indexOf('qeydiyyat') !== -1) return '#6366f1';
    if (n.indexOf('hnar') !== -1) return '#7c3aed';
    if (n.indexOf('iqt') !== -1) return '#8b5cf6';
    if (n === 'rk') return '#4c1d95';
    return catColorByKey(n);
}

export function maturityColor(score) {
    if (score == null || !isFinite(score)) return STATUS.other;
    if (score < 25) return MATURITY.ilkin;
    if (score < 50) return MATURITY.idare;
    if (score < 75) return MATURITY.mueyyen;
    return MATURITY.opt;
}

export function starColor(star) {
    var n = Number(star);
    if (!isFinite(n) || n < 1) return STATUS.other;
    return STAR[Math.max(1, Math.min(5, Math.round(n))) - 1];
}
