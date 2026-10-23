/**
 * Xidmətlərin rəqəmsallaşma vəziyyəti — EXQ hub.
 * Data Jira EXQ sətirlərindən (buildExqServiceDigitization) gəlir.
 */

import { exqStarFromPercent, exqStarLabel, EXQ_DIGIT_STAGES } from './model.js?v=idda26';


function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function num(n, digits) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    if (digits == null) return String(Math.round(v));
    return v.toFixed(digits);
}

function clampPct(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
}

function round1(n) {
    return Math.round(Number(n) * 10) / 10;
}

function filterClick(key, stopBubble) {
    if (!key) return '';
    var call = 'nk303Call(\'hubFilter\',\'' + String(key).replace(/'/g, '\\\'') + '\')';
    if (stopBubble) call = 'event.stopPropagation();' + call;
    return ' onclick="' + call + '"';
}

function derive(data) {
    var overall = data.overall || {};
    var services = data.services || {};
    var stages = Array.isArray(data.stages) ? data.stages : [];
    var current = Number(overall.current);
    var target = Number(overall.target);
    if (!isFinite(target)) target = 95;
    var digitized = Number(services.digitized) || 0;
    var notDigitized = Number(services.notDigitized) || 0;
    var totalServices = digitized + notDigitized;
    var digitizedPct = totalServices ? round1((digitized / totalServices) * 100) : 0;
    var interactive = Number(services.interactive) || 0;
    var proactive = Number(services.proactive) || 0;
    var typeTotal = interactive + proactive;
    var interactivePct = typeTotal ? Math.round((interactive / typeTotal) * 100) : 0;
    var proactivePct = typeTotal ? Math.round((proactive / typeTotal) * 100) : 0;
    var star = overall.star != null ? Number(overall.star) : exqStarFromPercent(current);
    var gap = (isFinite(target) && isFinite(current)) ? round1(target - current) : null;
    var weak = null;
    stages.forEach(function(st) {
        if (!st || st.na || st.value == null || !isFinite(Number(st.value))) return;
        var lag = round1((Number(st.target) || 100) - Number(st.value));
        if (!weak || lag > weak.lag) {
            weak = {
                key: st.key,
                name: st.short || st.name,
                value: Number(st.value),
                target: Number(st.target) || 100,
                lag: lag,
                filter: st.filter || (st.key ? ('exq_stage_' + st.key) : 'has_result')
            };
        }
    });
    return {
        stages: stages,
        overall: {
            current: current,
            target: target,
            gap: gap,
            star: star,
            filter: overall.filter || 'has_result'
        },
        services: {
            digitized: digitized,
            notDigitized: notDigitized,
            assessed: Number(services.assessed) || 0,
            interactive: interactive,
            proactive: proactive,
            totalServices: totalServices,
            digitizedPct: digitizedPct,
            interactivePct: interactivePct,
            proactivePct: proactivePct,
            typeTotal: typeTotal,
            orgsWithSvc: Number(services.orgsWithSvc) || 0,
            orgsWithResult: Number(services.orgsWithResult) || 0,
            orgsTotal: Number(services.orgsTotal) || 0,
            filters: (services.filters || {})
        },
        weak: weak
    };
}

function starsRowHtml(star) {
    if (!(star >= 1 && star <= 5)) return '';
    var i;
    var html = '<span class="svc-digit-stars" aria-label="' + esc(exqStarLabel(star) || '') + '">';
    for (i = 1; i <= 5; i++) {
        html += '<i class="' + (i <= star ? 'is-on' : '') + '" aria-hidden="true">★</i>';
    }
    return html + '</span>';
}

function OverallHero(overall) {
    var cur = isFinite(overall.current) ? clampPct(overall.current) : 0;
    var tgt = clampPct(overall.target);
    var gap = overall.gap;
    var star = overall.star;
    var hasCur = isFinite(overall.current);
    var valText = hasCur ? (num(overall.current, 1) + '%') : '—';
    var sentence = 'Hədəf ' + num(overall.target) + '%-dir.'
        + (gap == null ? '' : (' Mövcud nəticədən fərq ' + num(gap, 1) + '.'));
    var starHtml = star
        ? '<span class="svc-digit-star-pill">' + esc(exqStarLabel(star)) + '</span>'
            + starsRowHtml(star)
        : '';
    var click = overall.filter ? filterClick(overall.filter) : '';
    var aria = 'Ümumi nəticə ' + valText + ', hədəf ' + num(overall.target) + '%'
        + (star ? ', ' + exqStarLabel(star) : '');
    return '<section class="svc-digit-measure">'
        + '<div class="svc-digit-measure-top">'
        + '<button type="button" class="svc-digit-measure-pct' + (hasCur ? '' : ' is-empty') + '"' + click
            + ' title="Nəticəsi olan qurumlara bax">' + esc(valText) + '</button>'
        + '<p>' + esc(sentence) + (starHtml ? starHtml : '') + '</p>'
        + '</div>'
        + '<button type="button" class="svc-digit-measure-track"' + click
            + ' title="Nəticəsi olan qurumlara bax" aria-label="' + esc(aria) + '">'
        + '<i style="width:' + cur + '%"></i>'
        + '<span class="svc-digit-measure-goal" style="left:' + tgt + '%" aria-hidden="true"></span>'
        + '</button>'
        + '<ul class="svc-digit-measure-legend">'
        + '<li><i class="is-now"></i><span>Mövcud</span><b>' + esc(valText) + '</b></li>'
        + '<li><i class="is-goal"></i><span>Hədəf</span><b>' + esc(num(overall.target)) + '%</b></li>'
        + '</ul>'
        + '</section>';
}

function KpiCard(opts) {
    var tag = opts.filter ? 'button' : 'article';
    var typeAttr = opts.filter ? ' type="button"' : '';
    var click = opts.filter ? filterClick(opts.filter) : '';
    var cls = 'svc-digit-measure-kpi' + (opts.warn ? ' is-warn' : '') + (opts.filter ? ' is-click' : '');
    return '<' + tag + ' class="' + cls + '"' + typeAttr + click
        + (opts.title ? ' title="' + esc(opts.title) + '"' : '') + '>'
        + '<span>' + esc(opts.label) + '</span>'
        + '<strong>' + esc(String(opts.value)) + '</strong>'
        + '<em>' + (opts.subHtml || '') + '</em>'
        + '</' + tag + '>';
}

function SegmentBar(interactive, proactive, interactivePct, proactivePct) {
    var total = interactive + proactive;
    if (!total) {
        return '<div class="svc-digit-seg" aria-hidden="true"><i style="flex:1;background:var(--pl)"></i></div>'
            + '<div class="svc-digit-seg-legend"><span>Məlumat yoxdur</span></div>';
    }
    return '<div class="svc-digit-seg" role="img" aria-label="' + interactive + ' interaktiv, ' + proactive + ' proaktiv">'
        + '<i style="flex:' + interactive + ';background:var(--p2)" title="Interaktiv"></i>'
        + '<i style="flex:' + proactive + ';background:var(--pro)" title="Proaktiv"></i>'
        + '</div>'
        + '<div class="svc-digit-seg-legend">'
        + '<span class="is-int">' + interactive + ' interaktiv · ' + interactivePct + '%</span>'
        + '<span class="is-pro">' + proactive + ' proaktiv · ' + proactivePct + '%</span>'
        + '</div>';
}

function radarPoint(cx, cy, R, index, n, ratio) {
    var a = -Math.PI / 2 + index * (2 * Math.PI / n);
    return {
        x: cx + Math.cos(a) * R * ratio,
        y: cy + Math.sin(a) * R * ratio,
        a: a
    };
}

function polyPoints(cx, cy, R, n, ratios) {
    var pts = [];
    var i;
    for (i = 0; i < n; i++) {
        var p = radarPoint(cx, cy, R, i, n, ratios[i]);
        pts.push(p.x.toFixed(2) + ',' + p.y.toFixed(2));
    }
    return pts.join(' ');
}

function textAnchorForAngle(a) {
    var c = Math.cos(a);
    if (c > 0.2) return 'start';
    if (c < -0.2) return 'end';
    return 'middle';
}

function RadarChart(props) {
    var labels = props.labels || [];
    var current = props.current || [];
    var target = props.target || [];
    var n = labels.length;
    if (!n) return '<p class="svc-digit-kpi-sub">Məlumat yoxdur.</p>';

    var cx = 210;
    var cy = 165;
    var R = 110;
    var rings = [0.25, 0.5, 0.75, 1];
    var i;
    var svg = '';

    rings.forEach(function(r) {
        var ratios = [];
        for (i = 0; i < n; i++) ratios.push(r);
        svg += '<polygon points="' + polyPoints(cx, cy, R, n, ratios)
            + '" fill="none" stroke="var(--line)" stroke-width="1"/>';
    });

    for (i = 0; i < n; i++) {
        var tip = radarPoint(cx, cy, R, i, n, 1);
        svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + tip.x.toFixed(2)
            + '" y2="' + tip.y.toFixed(2) + '" stroke="var(--line)" stroke-width="1"/>';
    }

    var targetRatios = [];
    var currentRatios = [];
    for (i = 0; i < n; i++) {
        targetRatios.push(clampPct(target[i]) / 100);
        currentRatios.push(clampPct(current[i]) / 100);
    }

    svg += '<polygon points="' + polyPoints(cx, cy, R, n, targetRatios)
        + '" fill="#b9a6f5" fill-opacity="0.35" stroke="#b9a6f5" stroke-width="2"/>';
    svg += '<polygon points="' + polyPoints(cx, cy, R, n, currentRatios)
        + '" fill="var(--p)" fill-opacity="0.3" stroke="var(--p)" stroke-width="2.5"/>';

    var filters = props.filters || [];
    var tipVals = props.tipValues || current;
    var vbW = 420;
    var vbH = 330;
    var tipsHtml = '';

    function pctFmt(v) {
        if (v == null || v === '' || !isFinite(Number(v))) return 'N/A';
        return num(v, 1) + '%';
    }

    function tipBubble(kind, label, valueText, hint) {
        return '<span class="svc-digit-tip" role="tooltip">'
            + '<span class="svc-digit-tip-kind">' + esc(kind) + '</span>'
            + '<span class="svc-digit-tip-label">' + esc(label) + '</span>'
            + '<span class="svc-digit-tip-val">' + esc(valueText) + '</span>'
            + (hint ? '<span class="svc-digit-tip-hint">' + esc(hint) + '</span>' : '')
            + '</span>';
    }

    function tipAnchor(pt, kindClass, kindName, label, valueText, filt, hint) {
        var left = (pt.x / vbW) * 100;
        var top = (pt.y / vbH) * 100;
        var place = pt.y < cy ? 'is-below' : 'is-above';
        if (pt.x < cx - 40) place += ' is-right';
        else if (pt.x > cx + 40) place += ' is-left';
        var tag = filt ? 'button' : 'span';
        var click = filt ? filterClick(filt) : '';
        var typeAttr = filt ? ' type="button"' : '';
        return '<' + tag + ' class="svc-digit-radar-pt ' + kindClass + ' ' + place + '"'
            + typeAttr + click
            + ' style="left:' + left.toFixed(2) + '%;top:' + top.toFixed(2) + '%"'
            + ' aria-label="' + esc(kindName + ': ' + label + ' ' + valueText) + '">'
            + '<i class="svc-digit-radar-pt-dot" aria-hidden="true"></i>'
            + tipBubble(kindName, label, valueText, hint)
            + '</' + tag + '>';
    }

    /* HTML overlay nöqtələr — hover tooltip + mövcud üçün klik */
    for (i = 0; i < n; i++) {
        var goalDot = radarPoint(cx, cy, R, i, n, targetRatios[i]);
        tipsHtml += tipAnchor(goalDot, 'is-goal', 'Hədəf olunan', labels[i], pctFmt(target[i]), '', '');
    }
    for (i = 0; i < n; i++) {
        var dot = radarPoint(cx, cy, R, i, n, currentRatios[i]);
        var filt = filters[i] || 'has_result';
        var tipVal = tipVals[i];
        tipsHtml += tipAnchor(dot, 'is-now', 'Mövcud vəziyyət', labels[i], pctFmt(tipVal), filt, 'Kliklə nəticəyə bax');
    }

    /* Etiketlər — yalnız mətn, klik yox */
    for (i = 0; i < n; i++) {
        var lab = radarPoint(cx, cy, R, i, n, 1.22);
        svg += '<text class="svc-digit-radar-lab" x="' + lab.x.toFixed(2) + '" y="' + lab.y.toFixed(2)
            + '" text-anchor="' + textAnchorForAngle(lab.a) + '" dominant-baseline="middle"'
            + ' font-size="12" font-weight="600" fill="var(--mut)">'
            + esc(labels[i]) + '</text>';
    }

    return '<div class="svc-digit-radar-wrap">'
        + '<div class="svc-digit-radar-plot">'
        + '<svg class="svc-digit-radar" viewBox="0 0 420 330" role="img" aria-label="Hədəf və mövcud vəziyyət radar">'
        + svg
        + '</svg>'
        + '<div class="svc-digit-radar-pts">' + tipsHtml + '</div>'
        + '</div>'
        + '<div class="svc-digit-radar-legend">'
        + '<span class="svc-digit-leg is-goal-fill"><i aria-hidden="true"></i>Hədəf olunan</span>'
        + '<span class="svc-digit-leg is-now"><i aria-hidden="true"></i>Mövcud vəziyyət</span>'
        + '</div>'
        + '</div>';
}

function StageBulletRow(stage, opts) {
    opts = opts || {};
    var interactive = opts.interactive !== false;
    var isNa = !!stage.na;
    var value = isNa || stage.value == null || !isFinite(Number(stage.value)) ? null : clampPct(stage.value);
    var target = clampPct(stage.target);
    var lag = value == null ? null : round1(target - value);
    var warn = lag != null && lag > 30;
    var deltaHtml = lag != null && lag > 0
        ? '<span class="svc-digit-stage-delta">−' + esc(num(lag)) + '</span>'
        : (lag != null && lag < 0
            ? '<span class="svc-digit-stage-delta is-ok">+' + esc(num(Math.abs(lag))) + '</span>'
            : '');
    var filter = stage.filter || (stage.key ? ('exq_stage_' + stage.key) : 'has_result');
    var fillW = value == null ? 0 : value;
    var numHtml = isNa
        ? '<p class="svc-digit-stage-nums"><b class="is-na">N/A</b></p>'
        : '<p class="svc-digit-stage-nums"><b>' + (value == null ? '—' : esc(num(value)) + '%') + '</b>'
            + '<em> / ' + esc(num(target)) + '%</em></p>';
    var inner = '<p class="svc-digit-stage-name">' + esc(stage.name) + '</p>'
        + '<div class="svc-digit-stage-track-wrap">'
        + '<div class="svc-digit-stage-track" aria-hidden="true">'
        + '<div class="svc-digit-stage-fill' + (warn ? ' is-warn' : '') + '" style="width:' + fillW + '%"></div>'
        + (isNa ? '' : '<span class="svc-digit-stage-goal" style="left:' + target + '%"></span>')
        + '</div></div>'
        + '<div class="svc-digit-stage-meta">' + numHtml + deltaHtml + '</div>';
    if (!interactive) return '<div class="svc-digit-stage">' + inner + '</div>';
    return '<button type="button" class="svc-digit-stage is-click"' + filterClick(filter)
        + ' title="' + esc(stage.name) + ' — bu meyar üzrə nəticəyə bax">'
        + inner + '</button>';
}

/** Qurumun mərhələ xəritəsindən StageBulletRow massivi. */
export function stagesFromExqMap(stageMap) {
    return (EXQ_DIGIT_STAGES || []).map(function(def) {
        var raw = stageMap ? stageMap[def.key] : null;
        var isNa = raw === 'na';
        var value = (!isNa && raw != null && isFinite(Number(raw))) ? Number(raw) : null;
        return {
            key: def.key,
            name: def.name,
            short: def.short,
            value: value,
            target: def.target,
            na: isNa,
            radar: !!def.radar,
            filter: 'exq_stage_' + def.key
        };
    });
}

/** Popup / panel: «Meyarlar üzrə nəticə və hədəf» (qurum üzrə). */
export function exqOrgStagesPanelHtml(stageMap, opts) {
    opts = opts || {};
    var stages = stagesFromExqMap(stageMap);
    var hasAny = stages.some(function(st) {
        return st.na || (st.value != null && isFinite(st.value));
    });
    return '<div class="svc-digit-card svc-digit-stages-panel">'
        + '<div class="svc-digit-card-head"><h4>' + esc(opts.title || 'Meyarlar üzrə nəticə və hədəf') + '</h4>'
        + '<p>' + esc(opts.hint || 'Şaquli xətt hədəfi göstərir · qırmızı rəqəm hədəfdən geriliyi bildirir') + '</p></div>'
        + (hasAny
            ? '<div class="svc-digit-stages">' + stages.map(function(st) {
                return StageBulletRow(st, { interactive: false });
            }).join('') + '</div>'
            : '<p class="svc-digit-kpi-sub">Bu qurum üçün mərhələ məlumatı yoxdur.</p>')
        + '</div>';
}

function ServiceDigitizationSection(raw) {
    var d = derive(raw || {});
    var s = d.services;
    var o = d.overall;
    var stages = d.stages;
    var filters = s.filters || {};

    var radarStages = stages.filter(function(st) { return st.radar !== false; });
    var radarCurrent = radarStages.map(function(st) {
        return st.na || st.value == null || !isFinite(Number(st.value)) ? 0 : Number(st.value);
    });
    var radarTarget = radarStages.map(function(st) { return Number(st.target) || 0; });
    /* Radar: qısa etiket; siyahı: tam meyar adı (Jira ilə eyni) */
    var radarLabels = radarStages.map(function(st) { return st.short || st.name; });
    var radarFilters = radarStages.map(function(st) {
        return st.filter || (st.key ? ('exq_stage_' + st.key) : 'has_result');
    });
    var radarTipValues = radarStages.map(function(st) {
        return st.na ? null : st.value;
    });

    var digitizedSub = 'Ümumi xidmət sayı: ' + esc(String(s.totalServices || s.digitized));
    var orgSub = esc(String(s.orgsTotal || 0)) + ' qurumdan ' + esc(String(s.orgsWithResult || 0)) + ' nəticəli';

    var gapVal = o.gap == null ? '—' : num(o.gap, 1);
    var gapSub = o.gap == null
        ? 'Hədəf ' + esc(num(o.target)) + '%'
        : 'Hədəf ' + esc(num(o.target)) + '% · mövcud '
            + (isFinite(o.current) ? esc(num(o.current, 1)) + '%' : '—');

    var weak = d.weak;
    var weakCard = weak
        ? KpiCard({
            label: 'Ən zəif meyar',
            value: num(weak.value) + '%',
            warn: weak.lag > 20,
            filter: weak.filter,
            title: weak.name + ' — bu meyar üzrə nəticəyə bax',
            subHtml: esc(weak.name) + ' · fərq ' + esc(num(weak.lag))
        })
        : KpiCard({
            label: 'Ən zəif meyar',
            value: '—',
            subHtml: 'Meyar məlumatı yoxdur'
        });

    return '<section class="svc-digit" id="serviceDigitizationSection" aria-labelledby="svcDigitTitle">'
        + '<header class="svc-digit-head">'
        + '<h3 id="svcDigitTitle">Xidmətlərin rəqəmsallaşma vəziyyəti</h3>'
        + '</header>'
        + '<div class="svc-digit-stack">'
        + OverallHero(o)
        + '<div class="svc-digit-measure-kpis">'
        + KpiCard({
            label: 'Rəqəmsallaşmış xidmət',
            value: s.digitized,
            subHtml: digitizedSub,
            filter: filters.digitized || 'svc_sum',
            title: 'Xidməti olan qurumlara bax'
        })
        + KpiCard({
            label: 'Qiymətləndirilən qurum',
            value: s.orgsWithSvc,
            subHtml: orgSub,
            filter: filters.orgs || 'svc_sum',
            title: 'Xidməti olan qurumlara bax'
        })
        + KpiCard({
            label: 'Hədəfdən fərq',
            value: gapVal,
            warn: o.gap != null && o.gap > 0,
            subHtml: gapSub
        })
        + weakCard
        + '</div>'
        + '<div class="svc-digit-charts">'
        + '<article class="svc-digit-card svc-digit-radar-card">'
        + '<div class="svc-digit-card-head"><h4>Hədəf və mövcud vəziyyət</h4>'
        + '<p>Mərhələlər üzrə müqayisə · nöqtəyə kliklə nəticəyə bax</p></div>'
        + RadarChart({
            labels: radarLabels,
            current: radarCurrent,
            target: radarTarget,
            filters: radarFilters,
            tipValues: radarTipValues
        })
        + '</article>'
        + '<article class="svc-digit-card">'
        + '<div class="svc-digit-card-head"><h4>Meyarlar üzrə nəticə və hədəf</h4>'
        + '<p>Şaquli xətt hədəfi göstərir · qırmızı rəqəm hədəfdən geriliyi bildirir</p></div>'
        + '<div class="svc-digit-stages">'
        + stages.map(StageBulletRow).join('')
        + '</div>'
        + '</article>'
        + '</div>'
        + '</div>'
        + '</section>';
}

export function serviceDigitizationHtml(data) {
    if (!data || (!data.stages && !data.overall && !data.services)) {
        return '<section class="svc-digit"><p class="svc-digit-kpi-sub">EXQ məlumatı yüklənməyib.</p></section>';
    }
    return ServiceDigitizationSection(data);
}

export function renderServiceDigitizationSection(data) {
    var el = document.getElementById('serviceDigitizationMount');
    if (!el) return;
    el.innerHTML = serviceDigitizationHtml(data);
}
