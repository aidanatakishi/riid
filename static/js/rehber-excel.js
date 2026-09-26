import { apiFetch } from './session.js?v=idda13';

var NA = 'Məlumat mövcud deyil';
var TABS = ['roadmaps', 'services', 'budget', 'arch', 'difficulties'];
var CAT_CLASS = ['cat-a', 'cat-b', 'cat-c', 'cat-d'];
var STATUS_COLORS = [
    ['icraya teqdim', '#2C7A6B'],
    ['api gozlenilir', '#3E9384'],
    ['brd', '#7FB8AC'],
    ['tesdiq', '#B8802A'],
    ['analiz', '#C79A55'],
    ['is axini', '#9C4430'],
    ['diger', '#B98A78'],
    ['planlasdir', '#B98A78']
];

function fold(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
        .replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, ' ')
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

function fmtNum(n) {
    if (n == null || n === '' || (typeof n === 'number' && !isFinite(n))) return NA;
    return String(n);
}

function deltaHtml(prev, cur) {
    if (prev == null || cur == null || !isFinite(Number(prev)) || !isFinite(Number(cur))) return '';
    var d = Number(cur) - Number(prev);
    if (!d) return '<span class="num">0</span>';
    var sign = d > 0 ? '+' : '';
    return '<span class="num" style="color:var(--teal);font-weight:600;">' + sign + d + '</span>';
}

function statusColor(name) {
    var f = fold(name);
    var i;
    for (i = 0; i < STATUS_COLORS.length; i++) {
        if (f.indexOf(STATUS_COLORS[i][0]) !== -1) return STATUS_COLORS[i][1];
    }
    var hash = 0;
    for (i = 0; i < f.length; i++) hash = ((hash << 5) - hash) + f.charCodeAt(i);
    var palette = ['#2C7A6B', '#3E9384', '#7FB8AC', '#B8802A', '#C79A55', '#9C4430', '#2E5C8A', '#B98A78'];
    return palette[Math.abs(hash) % palette.length];
}

function pillClass(status) {
    var f = fold(status);
    if (/risk|blok|yuban|dayanma|stuck/.test(f)) return 'stuck';
    if (/gozle|gozlen|aydinlas|asili|wait/.test(f)) return 'wait';
    if (/icra|imzalan|resmi razi|ok/.test(f)) return 'ok';
    return 'info';
}

function emptyBox() {
    return '<div class="card"><p class="eval-empty">' + esc(NA) + '</p></div>';
}

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text == null ? '' : String(text);
}

function paragraphs(text) {
    return String(text || '').split(/\n+/).map(function(p) { return p.trim(); }).filter(Boolean)
        .map(function(p) { return '<p>' + esc(p) + '</p>'; }).join('');
}

function activateTab(tab) {
    document.querySelectorAll('#tabnav button').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('section.tab').forEach(function(sec) {
        sec.classList.toggle('active', sec.id === 'tab-' + tab);
    });
}

function fileLine(tab, file) {
    var el = document.getElementById(tab + 'File');
    if (!el) return;
    if (!file || !file.name) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }
    el.hidden = false;
    el.innerHTML = esc(file.name)
        + ' <button type="button" class="rehber-del" data-del="' + esc(tab) + '">Sil</button>';
}

var defaultBodies = {};
var defaultHeader = null;
var overwritten = {};

function captureDefaults() {
    TABS.forEach(function(tab) {
        var root = document.getElementById(tab + 'Body');
        if (root && defaultBodies[tab] == null) defaultBodies[tab] = root.innerHTML;
    });
    if (!defaultHeader) {
        defaultHeader = {
            seal: (document.getElementById('headerSealNum') || {}).innerHTML,
            eyebrow: (document.getElementById('headerEyebrow') || {}).textContent,
            sub: (document.getElementById('headerSub') || {}).innerHTML,
            kpis: [].map.call(document.querySelectorAll('.kpi-strip .kpi'), function(k) {
                var num = k.querySelector('.num');
                var lab = k.querySelector('.label');
                return {
                    num: num ? num.innerHTML : '',
                    label: lab ? lab.textContent : ''
                };
            })
        };
    }
}

function restoreHeader() {
    if (!defaultHeader) return;
    var seal = document.getElementById('headerSealNum');
    if (seal && defaultHeader.seal != null) seal.innerHTML = defaultHeader.seal;
    if (defaultHeader.eyebrow != null) setText('headerEyebrow', defaultHeader.eyebrow);
    var sub = document.getElementById('headerSub');
    if (sub && defaultHeader.sub != null) sub.innerHTML = defaultHeader.sub;
    var kpis = document.querySelectorAll('.kpi-strip .kpi');
    (defaultHeader.kpis || []).forEach(function(item, i) {
        var num = kpis[i] && kpis[i].querySelector('.num');
        var lab = kpis[i] && kpis[i].querySelector('.label');
        if (num) num.innerHTML = item.num;
        if (lab && item.label) lab.textContent = item.label;
    });
}

function restoreDefault(tab) {
    fileLine(tab, null);
    if (!overwritten[tab]) {
        if (tab === 'roadmaps' && overwritten.header) {
            restoreHeader();
            overwritten.header = false;
        }
        return;
    }
    var root = document.getElementById(tab + 'Body');
    if (root && defaultBodies[tab] != null) root.innerHTML = defaultBodies[tab];
    overwritten[tab] = false;
    if (tab === 'roadmaps') {
        restoreHeader();
        overwritten.header = false;
    }
    if (tab === 'services' && typeof window.__rehberBindDefaultServices === 'function') {
        window.__rehberBindDefaultServices();
    }
}

function hasLiveData(payload) {
    return !!(payload && payload.file && payload.data);
}

function catCurrent(cat) {
    if (!cat) return null;
    if (cat.qurums && cat.qurums.length) return cat.qurums.length;
    if (cat.current != null && isFinite(Number(cat.current))) return Number(cat.current);
    return null;
}

function findCat(cats, needles) {
    var i;
    var j;
    for (i = 0; i < (cats || []).length; i++) {
        var f = fold(cats[i] && cats[i].title);
        for (j = 0; j < needles.length; j++) {
            if (f.indexOf(needles[j]) !== -1) return cats[i];
        }
    }
    return null;
}

function renderHeader(roadmaps) {
    if (!hasLiveData(roadmaps)) {
        restoreHeader();
        return;
    }
    var cats = (roadmaps && roadmaps.data && roadmaps.data.categories) || [];
    var meta = (roadmaps && roadmaps.data && roadmaps.data.meta) || {};
    var kpis = document.querySelectorAll('.kpi-strip .kpi');
    function fillKpi(el, cat, value) {
        var numEl = el && el.querySelector('.num');
        if (!numEl) return;
        if (value == null || !isFinite(Number(value))) {
            numEl.textContent = NA;
            return;
        }
        var delta = '';
        if (cat && cat.prev != null && isFinite(Number(cat.prev))) {
            var d = Number(value) - Number(cat.prev);
            if (d) {
                var down = d < 0 ? ' down' : '';
                delta = ' <span class="kpi-delta' + down + '">' + (d > 0 ? '+' : '') + d + '</span>';
            }
        }
        numEl.innerHTML = esc(String(value)) + delta;
    }
    overwritten.header = true;
    var official = findCat(cats, ['resmi razi']) || cats[0];
    var esd = findCat(cats, ['esd']) || findCat(cats, ['razilasma davam']) || cats[1];
    var worker = findCat(cats, ['isci qayda', 'tesdiq gozlen']) || cats[2];
    fillKpi(kpis[0], official, catCurrent(official));
    fillKpi(kpis[1], esd, catCurrent(esd));
    fillKpi(kpis[2], worker, catCurrent(worker));
    var fourth = findCat(cats, ['en azi isci']);
    var fourthVal = catCurrent(fourth);
    if (fourthVal == null) {
        var a = catCurrent(official);
        var b = catCurrent(esd);
        var c = catCurrent(worker);
        if (a != null && b != null && c != null) fourthVal = a + b + c;
    }
    fillKpi(kpis[3], fourth, fourthVal);
    var total = meta.total;
    if (total == null && cats.length) {
        total = cats.reduce(function(acc, cat) {
            var n = catCurrent(cat);
            return acc + (n != null ? n : 0);
        }, 0);
        if (!total) total = null;
    }
    var seal = document.getElementById('headerSealNum');
    if (seal) seal.textContent = total == null ? '—' : String(total);
    if (meta.updated) {
        setText('headerEyebrow', 'İRİA · Status Hesabatı · Yenilənib ' + meta.updated);
    } else {
        setText('headerEyebrow', 'İRİA · Status Hesabatı');
    }
    if (meta.sub) setText('headerSub', meta.sub);
}

function renderRoadmaps(payload) {
    var root = document.getElementById('roadmapsBody');
    if (!root) return;
    if (!hasLiveData(payload)) {
        restoreDefault('roadmaps');
        return;
    }
    fileLine('roadmaps', payload.file);
    overwritten.roadmaps = true;
    overwritten.header = true;
    var data = payload.data;
    var html = '';
    (data.categories || []).forEach(function(cat, i) {
        var cls = CAT_CLASS[i % CAT_CLASS.length];
        var chips = (cat.qurums || []).map(function(q) {
            var extra = q.isNew
                ? ' style="background:var(--teal-soft);border-color:#C3DED6;color:var(--teal);font-weight:600;"'
                : '';
            var label = q.name + (q.isNew && fold(q.name).indexOf('yeni') === -1 ? ' · yeni' : '');
            return '<span class="chip"' + extra + '>' + esc(label) + '</span>';
        }).join('');
        html += '<details class="cat ' + cls + '"' + (i === 0 ? ' open' : '') + '>'
            + '<summary><div class="catnum">' + esc(fmtNum(cat.current)) + '</div>'
            + '<div class="cattext"><h4>' + esc(cat.title || NA) + '</h4>'
            + (cat.desc ? '<p>' + esc(cat.desc) + '</p>' : '')
            + '</div><div class="chev">▾</div></summary>'
            + '<div class="chips">' + (chips || '<span class="eval-empty">' + esc(NA) + '</span>') + '</div></details>';
    });
    if (data.changes && data.changes.length) {
        html += '<div class="section-head" style="margin-top:32px;"><h2>Əvvəlki hesabatdan sonra əsas status dəyişiklikləri</h2>'
            + '<p>Hesabat dövrü ərzində status kateqoriyası dəyişən qurumlar.</p></div>';
        data.changes.forEach(function(ch) {
            html += '<div class="change-card"><div class="tag">' + esc(ch.tag || '') + '</div>'
                + '<p>' + esc(ch.text || NA) + '</p></div>';
        });
    }
    if ((data.categories || []).length) {
        html += '<div class="card" style="margin-top:4px;"><div class="table-wrap"><table>'
            + '<thead><tr><th>Kateqoriya</th><th class="num">Əvvəlki hesabat</th><th class="num">Cari hesabat</th><th class="num">Fərq</th></tr></thead><tbody>';
        data.categories.forEach(function(cat) {
            html += '<tr><td>' + esc(cat.title || NA) + '</td>'
                + '<td class="num">' + esc(fmtNum(cat.prev)) + '</td>'
                + '<td class="num">' + esc(fmtNum(cat.current)) + '</td>'
                + '<td>' + (deltaHtml(cat.prev, cat.current) || '<span class="num">' + esc(NA) + '</span>') + '</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }
    if (data.notes && data.notes.length) {
        html += '<div class="section-head" style="margin-top:32px;"><h2>Qurum üzrə qeyd olunan hallar</h2>'
            + '<p>Xüsusi diqqət tələb edən, risk yaradan və ya rəhbərlik üçün məlumat xarakterli qeydlər.</p></div>'
            + '<div class="inst-grid">';
        data.notes.forEach(function(note) {
            html += '<div class="inst-card"><div class="inst-head">'
                + (note.badge ? '<span class="badge">' + esc(note.badge) + '</span>' : '')
                + '<h3>' + esc(note.name || NA) + '</h3>'
                + (note.status ? '<span class="pill ' + pillClass(note.status) + '">' + esc(note.status) + '</span>' : '')
                + '</div>' + paragraphs(note.text);
            if (note.update) html += '<div class="update-tag"><b>Yenilənmə:</b> ' + esc(note.update) + '</div>';
            if (note.headsup) html += '<div class="headsup"><b>Rəhbərlik üçün qeyd:</b> ' + esc(note.headsup) + '</div>';
            (note.lists || []).forEach(function(list) {
                if (!list.items || !list.items.length) return;
                html += '<div class="sub-block">'
                    + (list.title ? '<h4>' + esc(list.title) + '</h4>' : '')
                    + '<ul>' + list.items.map(function(it) { return '<li>' + esc(it) + '</li>'; }).join('') + '</ul></div>';
            });
            html += '</div>';
        });
        html += '</div>';
    }
    root.innerHTML = html || emptyBox();
}

function renderServices(payload) {
    var root = document.getElementById('servicesBody');
    if (!root) return;
    var rows = (payload && payload.data && payload.data.services) || [];
    if (!hasLiveData(payload) || !rows.length) {
        restoreDefault('services');
        return;
    }
    fileLine('services', payload.file);
    overwritten.services = true;
    var data = payload.data;
    var orgs = {};
    var statuses = {};
    var biz = 0;
    rows.forEach(function(r) {
        var org = r.org || NA;
        if (!orgs[org]) orgs[org] = { n: 0, biz: 0 };
        orgs[org].n += 1;
        if (r.business) {
            orgs[org].biz += 1;
            biz += 1;
        }
        var st = r.status || NA;
        statuses[st] = (statuses[st] || 0) + 1;
    });
    var orgNames = Object.keys(orgs);
    var total = rows.length;
    var statusKeys = Object.keys(statuses);
    var statusRows = statusKeys.map(function(k) {
        var n = statuses[k];
        var pct = total ? Math.round((n / total) * 100) : 0;
        return { name: k, n: n, pct: pct, color: statusColor(k) };
    });
    var grad = [];
    var acc = 0;
    statusRows.forEach(function(s) {
        var next = acc + (total ? (s.n / total) * 100 : 0);
        grad.push(s.color + ' ' + acc.toFixed(2) + '% ' + next.toFixed(2) + '%');
        acc = next;
    });
    var html = '<div class="stat-row">'
        + '<div class="stat"><div class="num">' + orgNames.length + '</div><div class="label">Dövlət qurumu</div></div>'
        + '<div class="stat"><div class="num">' + total + '</div><div class="label">Elektron xidmət</div></div>'
        + '<div class="stat"><div class="num">' + biz + '</div><div class="label">O cümlədən biznes xidməti</div></div>'
        + '</div>'
        + '<div class="grid-2"><div class="card"><h3 style="font-size:15px;margin-bottom:10px;color:var(--navy);">Xidmətlərin status bölgüsü</h3>'
        + '<div class="table-wrap"><table><thead><tr><th>Status</th><th class="num">Sayı</th><th class="num">Pay</th></tr></thead><tbody>';
    statusRows.forEach(function(s) {
        html += '<tr><td>' + esc(s.name) + '</td><td class="num">' + s.n + '</td><td class="num">' + s.pct + '%</td></tr>';
    });
    html += '<tr class="total-row"><td>CƏMİ</td><td class="num">' + total + '</td><td class="num">100%</td></tr></tbody></table></div></div>'
        + '<div class="card"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(' + (grad.join(', ') || '#DBDFD6 0% 100%') + ');">'
        + '<div class="center-label"><div class="n">' + total + '</div><div class="t">xidmət</div></div></div><div class="legend">';
    statusRows.forEach(function(s) {
        html += '<div class="row"><span class="sw" style="background:' + s.color + ';"></span><span class="lbl">' + esc(s.name)
            + '</span><span class="val">' + s.n + ' · ' + s.pct + '%</span></div>';
    });
    html += '</div></div></div></div>';
    var sorted = orgNames.slice().sort(function(a, b) { return orgs[b].n - orgs[a].n; });
    var max = sorted.length ? orgs[sorted[0]].n : 1;
    html += '<div class="card"><h3 style="font-size:15px;margin-bottom:14px;color:var(--navy);">Qurumlar üzrə xidmət sayı</h3>'
        + '<div class="hbar-list" id="instBars">';
    sorted.forEach(function(name) {
        var pct = ((orgs[name].n / max) * 100).toFixed(1);
        html += '<div class="hbar-row"><div class="lbl" title="' + esc(name) + '">' + esc(name) + '</div>'
            + '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:#2C7A6B;"></div></div>'
            + '<div class="v">' + orgs[name].n + '</div></div>';
    });
    html += '</div><div class="table-wrap" style="margin-top:16px;"><table>'
        + '<thead><tr><th>Qurum</th><th class="num">Xidmət sayı</th><th class="num">O cümlədən biznes</th></tr></thead><tbody>';
    sorted.forEach(function(name) {
        html += '<tr><td>' + esc(name) + '</td><td class="num">' + orgs[name].n + '</td><td class="num">'
            + (orgs[name].biz ? orgs[name].biz : '-') + '</td></tr>';
    });
    html += '</tbody></table></div></div>'
        + '<div class="section-head" style="margin-top:34px;"><h2 style="font-size:20px;">Xidmətlər üzrə ətraflı reyestr</h2>'
        + '<p>Hər xidmət üzrə cari status və qeydlər. Qurum və ya status üzrə süzgəcdən keçirin.</p></div>'
        + '<div class="card"><div class="filters">'
        + '<input type="text" id="svcSearch" placeholder="Xidmət adı üzrə axtar…">'
        + '<select id="svcInstFilter"><option value="">Bütün qurumlar</option></select>'
        + '<select id="svcStatusFilter"><option value="">Bütün statuslar</option></select></div>'
        + '<div id="svcCount"></div><div class="table-wrap"><table>'
        + '<thead><tr><th style="width:22%">Qurum</th><th style="width:30%">Xidmət</th><th style="width:16%">Status</th><th>Qeyd</th></tr></thead>'
        + '<tbody id="svcTableBody"></tbody></table></div></div>';
    if (data.problems && data.problems.length) {
        html += '<div class="section-head" style="margin-top:34px;"><h2 style="font-size:20px;">Qurumlarla iş prosesində üzləşilən problemlər</h2></div>';
        data.problems.forEach(function(p) {
            html += '<div class="problem-card"><div class="tag">' + esc(p.tag || '') + '</div><p>' + esc(p.text || NA) + '</p></div>';
        });
    }
    root.innerHTML = html;
    bindServiceFilters(rows);
}

function bindServiceFilters(rows) {
    var search = document.getElementById('svcSearch');
    var inst = document.getElementById('svcInstFilter');
    var stat = document.getElementById('svcStatusFilter');
    var body = document.getElementById('svcTableBody');
    var count = document.getElementById('svcCount');
    if (!body) return;
    var orgs = [];
    var statuses = [];
    rows.forEach(function(r) {
        if (r.org && orgs.indexOf(r.org) === -1) orgs.push(r.org);
        var st = r.status || NA;
        if (statuses.indexOf(st) === -1) statuses.push(st);
    });
    orgs.sort(function(a, b) { return a.localeCompare(b, 'az'); });
    orgs.forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        inst.appendChild(opt);
    });
    statuses.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        stat.appendChild(opt);
    });
    function paint() {
        var q = fold(search && search.value);
        var io = inst ? inst.value : '';
        var so = stat ? stat.value : '';
        var n = 0;
        body.innerHTML = '';
        rows.forEach(function(r) {
            var st = r.status || NA;
            if (io && r.org !== io) return;
            if (so && st !== so) return;
            if (q && fold(r.service).indexOf(q) === -1 && fold(r.org).indexOf(q) === -1) return;
            n += 1;
            var changed = r.oldStatus ? '<span class="changed-flag">əvvəl: ' + esc(r.oldStatus) + '</span>' : '';
            var c = statusColor(st);
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + esc(r.org || NA) + '</td><td>' + esc(r.service || NA) + '</td>'
                + '<td><span class="status-chip" style="background:' + c + '22;color:' + c + ';">' + esc(st) + '</span>'
                + changed + '</td><td>' + esc(r.note || '-') + '</td>';
            body.appendChild(tr);
        });
        if (count) count.textContent = n + ' / ' + rows.length + ' xidmət göstərilir';
    }
    if (search) search.addEventListener('input', paint);
    if (inst) inst.addEventListener('change', paint);
    if (stat) stat.addEventListener('change', paint);
    paint();
}

function renderBudget(payload) {
    var root = document.getElementById('budgetBody');
    if (!root) return;
    if (!hasLiveData(payload)) {
        restoreDefault('budget');
        return;
    }
    fileLine('budget', payload.file);
    overwritten.budget = true;
    var data = payload.data;
    var html = '';
    if (data.budget && data.budget.length) {
        html += '<div class="flow">';
        data.budget.forEach(function(s, i) {
            var cls = i === 0 ? 'tot' : (i === 1 ? 'ok' : 'pend');
            html += '<div class="step ' + cls + '"><div class="n">' + esc(fmtNum(s.value)) + '</div><div class="l">'
                + esc(s.label || '') + '</div></div>';
        });
        html += '</div>';
    }
    (data.problems || []).forEach(function(p) {
        html += '<div class="problem-card"><div class="tag">' + esc(p.tag || '') + '</div><p>' + esc(p.text || NA) + '</p>';
        if (p.deadline) html += '<div class="deadline"><b>Təcili tələb olunur:</b> ' + esc(p.deadline) + '</div>';
        html += '</div>';
    });
    if (data.efg && data.efg.length) {
        html += '<div class="section-head" style="margin-top:34px;"><h2 style="font-size:20px;">ƏFG kartları</h2>'
            + '<p>Əsas Fəaliyyət Göstəriciləri kartları üzrə müraciətlərin və razılaşdırmanın vəziyyəti.</p></div><div class="stat-row">';
        data.efg.forEach(function(s) {
            html += '<div class="stat"><div class="num">' + esc(fmtNum(s.value)) + '</div><div class="label">'
                + esc(s.label || '') + '</div></div>';
        });
        html += '</div>';
    }
    if (data.updates && data.updates.length) {
        html += '<div class="section-head" style="margin-top:34px;"><h2 style="font-size:20px;">Digər yenilənmə</h2></div>';
        data.updates.forEach(function(u) {
            html += '<div class="change-card"><div class="tag">' + esc(u.tag || '') + '</div><p>' + esc(u.text || NA) + '</p></div>';
        });
    }
    root.innerHTML = html || emptyBox();
}

function renderArch(payload) {
    var root = document.getElementById('archBody');
    if (!root) return;
    if (!hasLiveData(payload)) {
        restoreDefault('arch');
        return;
    }
    fileLine('arch', payload.file);
    overwritten.arch = true;
    var data = payload.data;
    var groups = { done: [], ongoing: [], block: [], plan: [] };
    (data.work || []).forEach(function(w) {
        (groups[w.section] || groups.done).push(w);
    });
    var titles = {
        done: '1. Görülən işlər',
        ongoing: '2. Yarımçıq qalan / davam edən işlər',
        block: '3. Mövcud problemlər və blokerlər',
        plan: '4. Cari həftə üzrə plan'
    };
    var html = '';
    ['done', 'ongoing', 'block', 'plan'].forEach(function(sec) {
        var items = groups[sec];
        if (sec === 'block') {
            var probs = data.problems || [];
            if (!items.length && !probs.length) return;
            html += '<div class="section-head" style="margin-top:30px;"><h2 style="font-size:20px;">' + titles.block + '</h2></div>';
            items.forEach(function(w) {
                html += '<div class="problem-card"><div class="tag">' + esc(w.who || w.title || '') + '</div><p>'
                    + esc(w.text || NA) + '</p></div>';
            });
            probs.forEach(function(p) {
                html += '<div class="problem-card"><div class="tag">' + esc(p.tag || '') + '</div><p>' + esc(p.text || NA) + '</p></div>';
            });
            return;
        }
        if (!items.length) return;
        html += '<div class="card"' + (sec === 'plan' ? ' style="margin-top:20px;"' : '') + '>'
            + '<h3 style="font-size:15px;margin-bottom:8px;color:var(--navy);">' + titles[sec] + '</h3><ul class="work-list">';
        items.forEach(function(w) {
            html += '<li>' + (w.who ? '<span class="who">' + esc(w.who) + '</span>' : '')
                + (w.title ? '<b>' + esc(w.title) + '</b> ' : '') + esc(w.text || '') + '</li>';
        });
        html += '</ul></div>';
    });
    root.innerHTML = html || emptyBox();
}

function renderDifficulties(payload) {
    var root = document.getElementById('difficultiesBody');
    if (!root) return;
    var items = payload && payload.data && payload.data.items;
    if (!hasLiveData(payload) || !items || !items.length) {
        restoreDefault('difficulties');
        return;
    }
    fileLine('difficulties', payload.file);
    overwritten.difficulties = true;
    root.innerHTML = items.map(function(it) {
        return '<div class="diff-card"><div class="num-badge">!</div><p>' + esc(it.text || NA) + '</p></div>';
    }).join('');
}

function applyPayload(tab, payload) {
    if (tab === 'roadmaps') {
        renderRoadmaps(payload);
        renderHeader(payload);
    } else if (tab === 'services') renderServices(payload);
    else if (tab === 'budget') renderBudget(payload);
    else if (tab === 'arch') renderArch(payload);
    else if (tab === 'difficulties') renderDifficulties(payload);
}

function showErr(tab, msg) {
    var el = document.getElementById(tab + 'Err');
    if (!el) return;
    if (!msg) {
        el.hidden = true;
        el.textContent = '';
        return;
    }
    el.hidden = false;
    el.textContent = msg;
}

async function loadAll() {
    var res = await apiFetch('/api/rehber/data');
    var data = res.ok ? await res.json() : { tabs: {} };
    var tabs = data.tabs || {};
    TABS.forEach(function(tab) {
        applyPayload(tab, tabs[tab] || { tab: tab, file: null, data: null });
    });
}

function pickFile(tab) {
    var input = document.getElementById('upload-' + tab);
    if (input) input.click();
}

async function sendFile(tab, file) {
    if (!file) return;
    showErr(tab, '');
    var fd = new FormData();
    fd.append('tab', tab);
    fd.append('file', file);
    var res = await apiFetch('/api/rehber/upload', { method: 'POST', body: fd });
    var data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
        showErr(tab, data.error || 'Excel oxunmadı');
        return;
    }
    applyPayload(tab, data);
    activateTab(tab);
}

async function deleteTab(tab) {
    showErr(tab, '');
    var res = await apiFetch('/api/rehber/uploads/' + encodeURIComponent(tab), { method: 'DELETE' });
    var data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) {
        showErr(tab, data.error || 'Silinmədi');
        return;
    }
    applyPayload(tab, data.tab || { tab: tab, file: null, data: null });
}

function bindUi() {
    document.querySelectorAll('#tabnav button[data-tab]').forEach(function(btn) {
        btn.addEventListener('click', function(ev) {
            if (ev.target.closest('.nav-up')) return;
            activateTab(btn.getAttribute('data-tab'));
        });
    });
    document.querySelectorAll('.nav-up, .rehber-up-btn').forEach(function(el) {
        el.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var tab = el.getAttribute('data-upload');
            if (tab) pickFile(tab);
        });
    });
    TABS.forEach(function(tab) {
        var input = document.getElementById('upload-' + tab);
        if (!input) return;
        input.addEventListener('change', function() {
            var file = input.files && input.files[0];
            input.value = '';
            sendFile(tab, file).catch(function() { showErr(tab, 'Excel oxunmadı'); });
        });
    });
    document.addEventListener('click', function(ev) {
        var del = ev.target.closest('.rehber-del');
        if (!del) return;
        ev.preventDefault();
        deleteTab(del.getAttribute('data-del')).catch(function() { showErr(del.getAttribute('data-del'), 'Silinmədi'); });
    });
    var logout = document.getElementById('logoutLink');
    if (logout) {
        logout.addEventListener('click', function(ev) {
            ev.preventDefault();
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                .finally(function() { window.location.href = '/login'; });
        });
    }
}

function boot() {
    activateTab('eval');
    bindUi();
    captureDefaults();
    loadAll().catch(function() {
        TABS.forEach(function(tab) { restoreDefault(tab); });
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
