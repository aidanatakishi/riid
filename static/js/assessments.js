import { state } from './state.js';
import { normalizeStr } from './utils.js';
import {
    classifyAssessmentCategory,
    formatAssessmentFieldText,
    getAssessmentQurumLabel,
    getAssessmentTaskTime,
    getAssessmentYear,
    getDiagHeadline,
    getExqServiceCount,
    getMeqsedInfo,
    getQurumName,
    getSelfAssessInfo,
    getStatusGroup,
    hasAssessmentResult,
    isTaskType,
    isDiagOverallLabel,
    parseDiagUmumiNetice
} from './model.js';

var SECTIONS = ['diag', 'isq', 'self', 'exq', 'meqsed'];
var searchState = { diag: '', isq: '', self: '', exq: '', meqsed: '' };
var openKeys = { self: {} };
var activeTab = 'diag';
var selectedYear = null;
var yearTouched = false;
var searchDebounceTimer = null;
var YEAR_SELECT_ID = 'assessmentYearSelect';
var HUB_BODY_ID = 'assessmentHubBody';
var DIAG_MODAL_ID = 'assessDiagModal';
var openDiagKey = null;
var diagByKey = {};
var lastEyeBtn = null;
var modalEscBound = false;

var EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">'
    + '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />'
    + '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function statusPill(name) {
    var raw = name || '—';
    var g = getStatusGroup(raw) || 'other';
    return '<span class="assess-status assess-status--' + g + '">' + escapeHtml(raw) + '</span>';
}

function collectCategoryTasks(category) {
    var rows = [];
    var qurumFilter = state.currentQurumFilter;
    (state.allTasks || []).forEach(function(t) {
        if (!t) return;
        if (!isTaskType(t)) return;
        if (classifyAssessmentCategory(t) !== category) return;
        var qurum = getAssessmentQurumLabel(t) || (t && t.key) || '—';
        if (qurumFilter) {
            var q = qurum || getQurumName(t) || 'Təyin edilməyib';
            if (q !== qurumFilter) return;
        }
        var year = getAssessmentYear(t);
        rows.push({
            task: t,
            qurum: qurum,
            year: year,
            hasResult: hasAssessmentResult(category, t),
            time: getAssessmentTaskTime(t)
        });
    });
    return rows;
}

function sameYear(a, b) {
    if (a == null || b == null) return false;
    return Number(a) === Number(b);
}

function collectGlobalYears() {
    var set = {};
    (state.allTasks || []).forEach(function(t) {
        var y = getAssessmentYear(t);
        if (y != null && isFinite(y) && y >= 2000 && y <= 2100) set[Number(y)] = true;
    });
    return Object.keys(set).map(Number).sort(function(a, b) { return b - a; });
}

function yearsForSection(section) {
    var set = {};
    collectCategoryTasks(section).forEach(function(r) {
        if (r.year != null && isFinite(r.year)) set[Number(r.year)] = true;
    });
    return Object.keys(set).map(Number).sort(function(a, b) { return b - a; });
}

function resolveSelectedYear(section, globalYears) {
    var sectionYears = yearsForSection(section);
    if (yearTouched && selectedYear != null && isFinite(selectedYear)) return Number(selectedYear);
    if (sectionYears.length) {
        if (selectedYear != null && sectionYears.indexOf(Number(selectedYear)) !== -1) {
            return Number(selectedYear);
        }
        return sectionYears[0];
    }
    if (globalYears && globalYears.length) return globalYears[0];
    if (selectedYear != null && isFinite(selectedYear)) return Number(selectedYear);
    return new Date().getFullYear();
}

function pickBestPerQurumYear(rows, year, includeUndated) {
    var yearNum = Number(year);
    var groups = {};
    rows.forEach(function(r) {
        var ry = r.year == null ? null : Number(r.year);
        var match = sameYear(ry, yearNum);
        if (!match && !(includeUndated && ry == null)) return;
        var key = r.qurum || r.task.key;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });
    var picked = [];
    Object.keys(groups).forEach(function(key) {
        var list = groups[key].slice();
        var withResult = list.filter(function(r) { return r.hasResult; });
        var pool = withResult.length ? withResult : list;
        pool.sort(function(a, b) { return b.time - a.time; });
        picked.push(pool[0]);
    });
    picked.sort(function(a, b) {
        return String(a.qurum || '').localeCompare(String(b.qurum || ''), 'az');
    });
    return picked;
}

function filterBySearch(rows, section) {
    var q = (searchState[section] || '').trim();
    if (!q) return rows;
    var normQ = normalizeStr(q);
    return rows.filter(function(r) {
        return normalizeStr(r.qurum || '').includes(normQ);
    });
}

function fillYearSelect(years, selected) {
    var selectedNum = selected == null ? null : Number(selected);
    var opts = (years || []).map(Number).filter(function(y) { return isFinite(y); });
    if (selectedNum != null && isFinite(selectedNum) && opts.indexOf(selectedNum) === -1) opts.push(selectedNum);
    opts.sort(function(a, b) { return b - a; });

    var el = document.getElementById(YEAR_SELECT_ID);
    if (el) {
        el.innerHTML = opts.map(function(y) {
            return '<option value="' + y + '"' + (y === selectedNum ? ' selected' : '') + '>' + y + '</option>';
        }).join('');
        if (selectedNum != null) el.value = String(selectedNum);
    }

    var pills = document.getElementById('assessmentYearPills');
    if (pills) {
        if (!opts.length) {
            pills.innerHTML = '<span class="assess-year-empty">İl yoxdur</span>';
        } else {
            pills.innerHTML = opts.map(function(y) {
                var on = y === selectedNum;
                return '<button type="button" class="assess-year-pill' + (on ? ' is-active' : '') + '"'
                    + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
                    + ' onclick="event.stopPropagation(); setAssessmentYearForActiveTab(' + y + ')">'
                    + y + '</button>';
            }).join('');
        }
    }
}

function updateHubMeta(count, searchActive, year) {
    var meta = document.getElementById('assessHubMeta');
    if (!meta) return;
    var yearBit = year != null ? String(year) : '';
    if (searchActive) {
        meta.textContent = (yearBit ? yearBit + ' · ' : '') + (count === 1 ? '1 nəticə tapıldı' : count + ' nəticə tapıldı');
        meta.classList.add('is-search');
    } else if (count > 0) {
        meta.textContent = (yearBit ? yearBit + ' · ' : '') + (count === 1 ? '1 qurum' : count + ' qurum');
        meta.classList.remove('is-search');
    } else if (yearBit) {
        meta.textContent = yearBit + ' · qeyd yoxdur';
        meta.classList.remove('is-search');
    } else {
        meta.textContent = '';
        meta.classList.remove('is-search');
    }
}

function syncSearchInput() {
    var input = document.getElementById('assessSearchInput');
    var clearBtn = document.getElementById('assessSearchClear');
    if (!input) return;
    var val = searchState[activeTab] || '';
    input.value = val;
    if (clearBtn) clearBtn.classList.toggle('hidden', !val);
}

function syncTabPanels() {
    document.querySelectorAll('.assess-tab').forEach(function(btn) {
        var tab = btn.getAttribute('data-tab');
        var isActive = tab === activeTab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

function getSectionRows(section) {
    var allRows = collectCategoryTasks(section);
    var globalYears = collectGlobalYears();
    var year = resolveSelectedYear(section, globalYears);
    var includeUndated = !yearTouched;
    var rows = pickBestPerQurumYear(allRows, year, includeUndated);
    return { allRows: allRows, years: globalYears, year: year, rows: rows };
}

function updateTabCounts() {
    SECTIONS.forEach(function(section) {
        var btn = document.querySelector('.assess-tab[data-tab="' + section + '"]');
        if (!btn) return;
        var data = getSectionRows(section);
        var count = filterBySearch(data.rows, section).length;
        var badge = btn.querySelector('.assess-tab-count');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'assess-tab-count';
                btn.appendChild(badge);
            }
            badge.textContent = String(count);
        } else if (badge) {
            badge.remove();
        }
    });
}

function emptyHtml() {
    return '<div class="assess-hub-empty">'
        + '<div class="assess-hub-empty-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">'
        + '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />'
        + '</svg></div><p>Bu ildə qeyd tapılmadı.</p></div>';
}

function searchEmptyHtml() {
    return '<div class="assess-hub-empty">'
        + '<div class="assess-hub-empty-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">'
        + '<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />'
        + '</svg></div><p>Axtarışa uyğun qurum tapılmadı.</p></div>';
}

function scoreBadge(value) {
    return '<span class="assess-score-badge">' + escapeHtml(value) + '</span>';
}

function taskBrowseUrl(task) {
    var key = task && task.key;
    if (!key) return '';
    var base = (state.currentBaseUrl || '').replace(/\/+$/, '');
    if (!base) return '';
    return base + '/browse/' + key;
}

function qurumCell(r) {
    var raw = r && r.qurum != null ? String(r.qurum).trim() : '';
    var name = escapeHtml(raw || '—');
    var url = taskBrowseUrl(r.task);
    if (!url) {
        return '<div class="assess-hub-qurum">' + name + '</div>';
    }
    return '<div class="assess-hub-qurum">'
        + '<a class="assess-hub-qurum-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"'
        + ' onclick="event.stopPropagation();">'
        + name
        + '</a></div>';
}

function hubTable(section, headers, rowsHtml) {
    var ths = headers.map(function(h) {
        return '<div class="assess-hub-th">' + (h ? escapeHtml(h) : '&nbsp;') + '</div>';
    }).join('');
    return '<div class="assess-hub-table assess-hub-table--' + section + '" role="table">'
        + '<div class="assess-hub-thead" role="rowgroup">' + ths + '</div>'
        + '<div class="assess-hub-rows" role="rowgroup">' + rowsHtml + '</div></div>';
}

function hubRow(cells, detailHtml) {
    var cellsHtml = cells.map(function(c) {
        var cls = 'assess-hub-cell' + (c.cls ? ' ' + c.cls : '');
        return '<div class="' + cls + '" data-label="' + escapeHtml(c.label || '') + '">' + c.html + '</div>';
    }).join('');
    var detail = detailHtml
        ? '<div class="assess-hub-detail-wrap">' + detailHtml + '</div>'
        : '';
    return '<div class="assess-hub-row" role="row">' + cellsHtml + detail + '</div>';
}

function renderBlocks(blocks) {
    if (!blocks || !blocks.length) {
        return '<p class="text-sm text-slate-400">Nəticə qeyd edilməyib.</p>';
    }
    return '<div class="assess-blocks">' + blocks.map(function(b) {
        var label = b.label ? '<div class="assess-block-label">' + escapeHtml(b.label) + '</div>' : '';
        var value = '<div class="assess-block-value">' + escapeHtml(b.value || '—') + '</div>';
        return '<div class="assess-block">' + label + value + '</div>';
    }).join('') + '</div>';
}

function detailButton(section, key, open) {
    var label = open ? 'Bağla' : 'Ətraflı bax';
    return '<button type="button" class="assess-detail-btn' + (open ? ' is-open' : '') + '"'
        + ' onclick="event.stopPropagation(); toggleAssessmentDetail(\'' + section + '\', \'' + escapeHtml(key) + '\');">'
        + escapeHtml(label)
        + '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>'
        + '</button>';
}

function detailPanel(open, inner) {
    return '<div class="assess-detail' + (open ? '' : ' hidden') + '">' + inner + '</div>';
}

function eyeButton(key) {
    var open = openDiagKey === key;
    return '<button type="button" class="assess-eye-btn' + (open ? ' is-open' : '') + '"'
        + ' data-diag-key="' + escapeHtml(key) + '"'
        + ' aria-label="Ətraflı bax" title="Ətraflı bax"'
        + ' onclick="event.stopPropagation(); openDiagModal(\'' + escapeHtml(key) + '\', this);">'
        + EYE_SVG + '</button>';
}

function headlineCell(value) {
    var v = value == null || value === '' ? '—' : String(value);
    return '<span class="assess-text-value">' + escapeHtml(v) + '</span>';
}

function renderDiag(rows) {
    diagByKey = {};
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var key = t.key;
        diagByKey[key] = r;
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var headline = getDiagHeadline(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Status', html: statusPill(status) },
            { label: 'Ümumi nəticə', html: headlineCell(headline) },
            { label: '', cls: 'assess-hub-cell--action', html: eyeButton(key) }
        ], '');
    }).join('');
    return hubTable('diag', ['Qurum adı', 'Status', 'Ümumi nəticə', ''], body);
}

function renderIsq(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var netice = formatAssessmentFieldText(t.fields && t.fields.customfield_17316);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'İSQ Nəticəsi', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(netice) + '</span>' }
        ], '');
    }).join('');
    return hubTable('isq', ['Qurum adı', 'İSQ Nəticəsi'], body);
}

function renderSelf(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var key = t.key;
        var open = !!openKeys.self[key];
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var info = getSelfAssessInfo(t);
        var detailInner = info.blocks.length
            ? renderBlocks(info.blocks)
            : '<p class="text-sm text-slate-400">Ətraflı məlumat tapılmadı.</p>';
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Bal', html: scoreBadge(info.score) },
            { label: 'Status', html: statusPill(status) },
            { label: '', cls: 'assess-hub-cell--action', html: detailButton('self', key, open) }
        ], detailPanel(open, detailInner));
    }).join('');
    return hubTable('self', ['Qurum adı', 'Bal', 'Status', ''], body);
}

function renderExq(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var status = (t.fields && t.fields.status && t.fields.status.name) || '—';
        var count = getExqServiceCount(t);
        var countLabel = count == null ? '—' : String(count);
        var netice = formatAssessmentFieldText(t.fields && t.fields.customfield_17317);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Status', html: statusPill(status) },
            { label: 'Xidmət sayı', html: scoreBadge(countLabel) },
            { label: 'EXQ Nəticəsi', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(netice) + '</span>' }
        ], '');
    }).join('');
    return hubTable('exq', ['Qurum adı', 'Status', 'Xidmət sayı', 'EXQ Nəticəsi'], body);
}

function renderMeqsed(rows) {
    if (!rows.length) return emptyHtml();
    var body = rows.map(function(r) {
        var t = r.task;
        var info = getMeqsedInfo(t);
        return hubRow([
            { label: 'Qurum adı', cls: 'assess-hub-cell--qurum', html: qurumCell(r) },
            { label: 'Müraciətin növü', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.novu) + '</span>' },
            { label: 'Məqsədəuyğunluq Rəyi Nəticə', html: '<span class="assess-text-value whitespace-pre-wrap break-words">' + escapeHtml(info.netice) + '</span>' }
        ], '');
    }).join('');
    return hubTable('meqsed', ['Qurum adı', 'Müraciətin növü', 'Məqsədəuyğunluq Rəyi Nəticə'], body);
}

function isJiraTableHeaderDump(text) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return false;
    var f = t.toLowerCase()
        .replace(/ı/g, 'i').replace(/ə/g, 'e').replace(/ö/g, 'o')
        .replace(/ü/g, 'u').replace(/ğ/g, 'g').replace(/ş/g, 's').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, ' ').trim();
    if (!f) return false;
    var leftover = f.replace(/\b(qiymetlendirme istiqameti|qiymetlendirme|istiqametler|istiqameti|istiqamet|umumi|yekun|neticesi|neticeleri|neticeler|netice|diaqnostika|bal|ball|score|result|ad|name|title|basliq)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
    return !leftover;
}

function directionCard(d, overallText) {
    var title = d && d.title ? String(d.title).trim() : '';
    if (!title || isJiraTableHeaderDump(title) || isDiagOverallLabel(title)) return '';
    var score = d.score && d.score !== '—' ? scoreBadge(d.score) : '<span class="assess-score-badge is-empty">—</span>';
    var text = d.text ? String(d.text).trim() : '';
    if (isJiraTableHeaderDump(text)) text = '';
    if (overallText && text && text.replace(/\s+/g, ' ') === String(overallText).replace(/\s+/g, ' ')) text = '';
    return '<article class="assess-dir-card' + (text ? '' : ' is-score-only') + '">'
        + '<div class="assess-dir-card-head"><h4>' + escapeHtml(title) + '</h4>' + score + '</div>'
        + (text ? '<p class="assess-dir-card-text">' + escapeHtml(text) + '</p>' : '')
        + '</article>';
}

function fillDiagModal(r) {
    var t = r.task;
    var parsed = parseDiagUmumiNetice(t.fields && t.fields.customfield_17319);
    var titleEl = document.getElementById('assessDiagModalTitle');
    var subEl = document.getElementById('assessDiagModalSub');
    var keyEl = document.getElementById('assessDiagModalKey');
    var bodyEl = document.getElementById('assessDiagModalBody');
    var yearLabel = r.year ? String(r.year) : '';
    if (titleEl) {
        titleEl.textContent = yearLabel ? (r.qurum + ' · ' + yearLabel) : (r.qurum || '—');
    }
    if (subEl) subEl.textContent = 'Ümumi nəticə';
    if (keyEl) {
        var base = (state.currentBaseUrl || '').replace(/\/+$/, '');
        keyEl.textContent = t.key || '';
        keyEl.href = base && t.key ? (base + '/browse/' + encodeURIComponent(t.key)) : '#';
        keyEl.classList.toggle('hidden', !t.key);
    }
    if (!bodyEl) return;
    var parts = [];
    var overallScore = parsed.overall.score && parsed.overall.score !== '—' && !isJiraTableHeaderDump(parsed.overall.score)
        ? parsed.overall.score : '';
    var overallText = parsed.overall.text || '';
    if (isJiraTableHeaderDump(overallText)) overallText = '';
    var extras = (parsed.extras || []).filter(function(e) {
        return e && e.title && !isJiraTableHeaderDump(e.title) && !isJiraTableHeaderDump(e.score)
            && !isDiagOverallLabel(e.title);
    });
    if (overallScore || overallText) {
        parts.push('<div class="assess-modal-overall">'
            + '<div class="assess-modal-overall-label">Ümumi nəticə</div>'
            + (overallScore ? '<div class="assess-modal-overall-score">' + scoreBadge(overallScore) + '</div>' : '')
            + (overallText ? '<p class="assess-modal-overall-text">' + escapeHtml(overallText) + '</p>' : '')
            + '</div>');
    }
    var dirHtml = parsed.directions.map(function(d) { return directionCard(d, overallText); }).join('')
        + extras.map(function(e) { return directionCard(e, overallText); }).join('');
    if (dirHtml) {
        parts.push('<h4 class="assess-modal-section-title">Qiymətləndirmə istiqamətləri</h4>');
        parts.push('<div class="assess-dir-grid">' + dirHtml + '</div>');
    }
    var hasAny = overallScore || overallText
        || parsed.directions.some(function(d) { return (d.score && d.score !== '—') || d.text; })
        || extras.length;
    if (!hasAny) {
        parts = ['<p class="assess-modal-empty">Ümumi nəticə qeyd edilməyib.</p>'];
    }
    bodyEl.innerHTML = parts.join('');
}

function bindModalEsc() {
    if (modalEscBound) return;
    modalEscBound = true;
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') closeDiagModal();
    });
}

export function openDiagModal(key, btn) {
    if (!key) return;
    if (openDiagKey === key) {
        closeDiagModal();
        return;
    }
    var r = diagByKey[key];
    if (!r) {
        var found = (state.allTasks || []).filter(isTaskType).filter(function(t) { return t.key === key; })[0];
        if (!found) return;
        r = { task: found, qurum: getAssessmentQurumLabel(found), year: getAssessmentYear(found) };
    }
    openDiagKey = key;
    lastEyeBtn = btn || null;
    fillDiagModal(r);
    var overlay = document.getElementById(DIAG_MODAL_ID);
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('assess-modal-open');
    bindModalEsc();
    var closeBtn = overlay && overlay.querySelector('.assess-modal-close');
    if (closeBtn) closeBtn.focus();
    document.querySelectorAll('.assess-eye-btn').forEach(function(el) {
        el.classList.toggle('is-open', el.getAttribute('data-diag-key') === key);
    });
}

export function closeDiagModal() {
    if (!openDiagKey) {
        var overlayEarly = document.getElementById(DIAG_MODAL_ID);
        if (overlayEarly && overlayEarly.classList.contains('hidden')) return;
    }
    openDiagKey = null;
    var overlay = document.getElementById(DIAG_MODAL_ID);
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('assess-modal-open');
    document.querySelectorAll('.assess-eye-btn.is-open').forEach(function(el) {
        el.classList.remove('is-open');
    });
    if (lastEyeBtn && typeof lastEyeBtn.focus === 'function') {
        try { lastEyeBtn.focus(); } catch (e) {}
    }
    lastEyeBtn = null;
}

export function onDiagModalOverlayClick(ev) {
    if (ev && ev.target && ev.target.id === DIAG_MODAL_ID) closeDiagModal();
}

function renderOne(section) {
    var bodyEl = document.getElementById(HUB_BODY_ID);
    if (!bodyEl) return;
    if (!(state.allTasks || []).length) {
        if (!yearTouched) selectedYear = null;
        fillYearSelect([], selectedYear);
        if (section === activeTab) updateHubMeta(0, false, null);
        bodyEl.innerHTML = emptyHtml();
        return;
    }
    var globalYears = collectGlobalYears();
    var year = resolveSelectedYear(section, globalYears);
    selectedYear = year;
    fillYearSelect(globalYears, year);
    var includeUndated = !yearTouched;
    var allRows = collectCategoryTasks(section);
    var rows = pickBestPerQurumYear(allRows, year, includeUndated);
    var searchActive = !!(searchState[section] || '').trim();
    var filtered = filterBySearch(rows, section);

    if (section === activeTab) {
        updateHubMeta(filtered.length, searchActive, year);
    }

    if (!filtered.length) {
        if (section === 'diag') diagByKey = {};
        bodyEl.innerHTML = (searchActive && rows.length) ? searchEmptyHtml() : emptyHtml();
        if (section === 'diag' && openDiagKey) closeDiagModal();
        return;
    }
    if (section === 'diag') {
        bodyEl.innerHTML = renderDiag(filtered);
        if (openDiagKey && diagByKey[openDiagKey]) fillDiagModal(diagByKey[openDiagKey]);
        else if (openDiagKey) closeDiagModal();
    } else if (section === 'isq') bodyEl.innerHTML = renderIsq(filtered);
    else if (section === 'self') bodyEl.innerHTML = renderSelf(filtered);
    else if (section === 'exq') bodyEl.innerHTML = renderExq(filtered);
    else bodyEl.innerHTML = renderMeqsed(filtered);
}

export function renderAssessmentSections() {
    syncTabPanels();
    syncSearchInput();
    renderOne(activeTab);
    updateTabCounts();
}

export function setAssessmentTab(tab) {
    if (SECTIONS.indexOf(tab) === -1 || tab === activeTab) return;
    activeTab = tab;
    syncTabPanels();
    syncSearchInput();
    renderOne(activeTab);
    updateTabCounts();
}

export function setAssessmentSearch(section, query) {
    if (SECTIONS.indexOf(section) === -1) return;
    searchState[section] = query || '';
    if (section === activeTab) renderOne(section);
    updateTabCounts();
}

export function onAssessmentSearchInput(value) {
    var clearBtn = document.getElementById('assessSearchClear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !value);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function() {
        setAssessmentSearch(activeTab, value);
    }, 200);
}

export function clearAssessmentSearch() {
    searchState[activeTab] = '';
    var input = document.getElementById('assessSearchInput');
    if (input) input.value = '';
    var clearBtn = document.getElementById('assessSearchClear');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderOne(activeTab);
    updateTabCounts();
}

export function setAssessmentYear(section, year) {
    setAssessmentYearForActiveTab(year);
}

export function setAssessmentYearForActiveTab(year) {
    var y = parseInt(year, 10);
    if (!isFinite(y)) return;
    selectedYear = y;
    yearTouched = true;
    renderOne(activeTab);
    updateTabCounts();
}

export function toggleAssessmentDetail(section, key) {
    if (!openKeys[section] || !key) return;
    if (openKeys[section][key]) delete openKeys[section][key];
    else openKeys[section][key] = true;
    renderOne(section);
}

export function getActiveAssessmentTab() {
    return activeTab;
}
