/**
 * AI Done floating chat widget — DOM/CSS/behavior match ai-done-chat design.
 * Data: window.AIDone.setTasks([...]) pushes real Jira tasks; answer() uses them.
 */

var SYMBOLS_HTML = ''
  + '<svg width="0" height="0" style="position:absolute" aria-hidden="true" id="aidSymbols"><defs>'
  + '<radialGradient id="mH" cx=".32" cy=".22" r=".95"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#EEEAFB"/><stop offset="1" stop-color="#B3A8E4"/></radialGradient>'
  + '<linearGradient id="mV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B2B8F"/><stop offset="1" stop-color="#110836"/></linearGradient>'
  + '<radialGradient id="mE" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#9AF0FF"/><stop offset="1" stop-color="#1FC3F0"/></radialGradient>'
  + '<linearGradient id="mA"><stop offset="0" stop-color="#E2DCF8"/><stop offset="1" stop-color="#9A8ED2"/></linearGradient>'
  + '<radialGradient id="mO" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#4FD6FF"/></radialGradient>'
  + '<filter id="mB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter></defs>'
  + '<symbol id="mascot" viewBox="0 0 44 44"><rect x="21" y="6" width="2" height="6" rx="1" fill="#C7BFEC"/><circle cx="22" cy="4.6" r="5" fill="#7DE3FF" opacity=".55" filter="url(#mB)"/><circle cx="22" cy="4.6" r="3" fill="url(#mO)"/><rect x="2.5" y="20.5" width="5" height="10" rx="2.5" fill="url(#mA)"/><rect x="36.5" y="20.5" width="5" height="10" rx="2.5" fill="url(#mA)"/><rect x="7" y="11" width="30" height="27" rx="13.5" fill="url(#mH)"/><rect x="11" y="16" width="22" height="17" rx="8.5" fill="url(#mV)"/><path d="M13.6 21.2q.2-3.7 5-4.1h6.4q-6.6 1.2-9.4 6z" fill="#fff" opacity=".2"/><g style="transform:translate(calc(var(--ex)*1px),calc(var(--ey)*1px));transition:transform .15s ease-out"><g class="bl"><circle cx="17.5" cy="25" r="3.8" fill="#4FD6FF" opacity=".6" filter="url(#mB)"/><circle cx="26.5" cy="25" r="3.8" fill="#4FD6FF" opacity=".6" filter="url(#mB)"/><ellipse cx="17.5" cy="25" rx="2.3" ry="2.9" fill="url(#mE)"/><ellipse cx="26.5" cy="25" rx="2.3" ry="2.9" fill="url(#mE)"/><circle cx="16.8" cy="23.9" r=".7" fill="#fff"/><circle cx="25.8" cy="23.9" r=".7" fill="#fff"/><path d="M19.8 29.6q2.2 1.5 4.4 0" stroke="#7DE3FF" stroke-width="1" stroke-linecap="round" fill="none"/></g></g></symbol>'
  + '<symbol id="i-send" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></symbol>'
  + '<symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>'
  + '<symbol id="i-new" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></symbol>'
  + '<symbol id="i-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>'
  + '<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>'
  + '<symbol id="i-pause" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></symbol>'
  + '<symbol id="i-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></symbol>'
  + '<symbol id="i-list" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/></symbol>'
  + '<symbol id="i-tri" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01"/></symbol></svg>';

var WIDGET_HTML = ''
  + '<div class="aid-root" id="root">'
  + '<section class="aid" aria-label="AI Done köməkçisi" aria-hidden="true" inert>'
  + '  <header class="aid__header">'
  + '    <div class="aid__top">'
  + '      <button class="aid__mascot" type="button" aria-label="AI Done"><svg class="m"><use href="#mascot"/></svg></button>'
  + '      <div class="aid__head-text">'
  + '        <p class="aid__title"><span class="aid__title-ai">AI</span> Done</p>'
  + '        <div class="aid__status"><span class="aid__dot"></span>Süni intellekt köməkçiniz</div>'
  + '      </div>'
  + '      <button class="aid__icon-btn" data-action="reset" aria-label="Söhbəti yenilə" type="button"><svg class="ic"><use href="#i-new"/></svg></button>'
  + '      <button class="aid__icon-btn" data-action="close" aria-label="Bağla" type="button"><svg class="ic"><use href="#i-x"/></svg></button>'
  + '    </div>'
  + '  </header>'
  + '  <div class="aid__messages" aria-live="polite"></div>'
  + '  <div class="aid__footer">'
  + '    <div class="aid__chips">'
  + '      <button class="aid__chip" type="button" data-q="Mənim işlərim"><svg class="ic"><use href="#i-list"/></svg>Mənim işlərim</button>'
  + '      <button class="aid__chip" type="button" data-q="Cari həftə üzrə risklər"><svg class="ic"><use href="#i-tri"/></svg>Cari həftə üzrə risklər</button>'
  + '    </div>'
  + '    <form class="aid__form">'
  + '      <input class="aid__input" type="text" placeholder="Sualınızı yazın…" aria-label="Sualınızı yazın" autocomplete="off">'
  + '      <button class="aid__send" type="submit" aria-label="Göndər" disabled><svg class="ic"><use href="#i-send"/></svg></button>'
  + '    </form>'
  + '  </div>'
  + '</section>'
  + '<div class="aid-launcher">'
  + '  <div class="aid-launcher__bubble">'
  + '    <button class="aid-launcher__close" aria-label="Bağla" type="button"><svg class="ic"><use href="#i-x"/></svg></button>'
  + '    <div class="aid-launcher__label">AI Done</div>'
  + '    <p class="aid-launcher__text">Salam! Mən AI Done-am — sizi görməyə çox şadam! Paneldə sizə kömək edim?</p>'
  + '  </div>'
  + '  <button class="aid-launcher__fab" aria-label="AI Done söhbətini aç" aria-expanded="false" type="button"><svg class="m"><use href="#mascot"/></svg><span class="aid-launcher__badge"></span></button>'
  + '</div>'
  + '</div>';

var mounted = false;
var api = null;

function $(s, r) {
  return (r || document).querySelector(s);
}

/**
 * @param {{ answer?: (q: string, tasks: any[]) => [string, string], startOpen?: boolean }} opts
 */
export function mountAIDone(opts) {
  opts = opts || {};
  if (mounted && document.getElementById('root') && document.getElementById('root').classList.contains('aid-root')) {
    return api || window.AIDone;
  }
  if (!document.getElementById('aidSymbols')) {
    var symWrap = document.createElement('div');
    symWrap.innerHTML = SYMBOLS_HTML;
    document.body.appendChild(symWrap.firstElementChild);
  }
  var wrap = document.createElement('div');
  wrap.innerHTML = WIDGET_HTML.trim();
  var root = wrap.firstElementChild;
  if (opts.externalLauncher !== false) {
    root.classList.add('aid-root--bot-launcher');
  }
  document.body.appendChild(root);
  api = bindAIDone(root, opts);
  mounted = true;
  window.AIDone = api;
  return api;
}

export function getAIDone() {
  return api || window.AIDone || null;
}

function bindAIDone(root, opts) {
  var panel = $('.aid', root);
  var box = $('.aid__messages', root);
  var form = $('.aid__form', root);
  var inp = $('.aid__input', root);
  var send = $('.aid__send', root);
  var fab = $('.aid-launcher__fab', root);
  var mas = $('.aid__mascot', root);
  var T = [];
  var busy = 0;
  var customAnswer = typeof opts.answer === 'function' ? opts.answer : null;
  var smartReply = typeof opts.reply === 'function' ? opts.reply : null;
  var onReset = typeof opts.onReset === 'function' ? opts.onReset : null;

  var esc = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var L = { p: ['İcrada', 'i-clock'], w: ['Gözləmədə', 'i-pause'], l: ['Gecikir', 'i-alert'] };
  var ic = function(n) { return '<svg class="ic"><use href="#' + n + '"/></svg>'; };
  var now = function() { return new Date().toTimeString().slice(0, 5); };

  var tasks = function(a) {
    return '<div class="aid__tasks">' + (a || []).map(function(t) {
      var st = L[t.s] || L.p;
      var n = Math.max(0, Math.min(100, Number(t.n) || 0));
      return '<div class="aid__task" data-s="' + esc(t.s || 'p') + '">'
        + '<button class="aid__task-btn" type="button" aria-expanded="false">'
        + '<span class="aid__task-icon">' + ic(st[1]) + '</span>'
        + '<span class="aid__task-main"><span class="aid__task-top">'
        + '<span class="aid__task-key">' + esc(t.k) + '</span>'
        + '<span class="aid__tag">' + st[0] + '</span></span>'
        + '<span class="aid__task-title">' + esc(t.t) + '</span></span>'
        + ic('i-chev') + '</button>'
        + '<div class="aid__task-more"><div><p>Müddət: <b>' + esc(t.d) + '</b></p>'
        + '<div class="aid__bar"><i style="width:' + n + '%"></i></div>'
        + '<small>' + n + '% tamamlanıb</small></div></div></div>';
    }).join('') + '</div>';
  };

  function down() {
    requestAnimationFrame(function() {
      box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
    });
  }

  function row(u, h) {
    var r = document.createElement('div');
    r.className = 'aid__row' + (u ? ' aid__row--user' : '');
    r.innerHTML = (u ? '' : '<div class="aid__avatar"><svg class="m"><use href="#mascot"/></svg></div>')
      + '<div class="aid__bubble' + (u ? ' aid__bubble--user' : '') + '"></div>';
    var b = $('.aid__bubble', r);
    if (u) b.textContent = h;
    else b.innerHTML = h;
    if (h !== null && !/typing/.test(String(h))) {
      b.insertAdjacentHTML('beforeend', '<div class="aid__time">' + now() + '</div>');
    }
    box.appendChild(r);
    down();
    return r;
  }

  function greet() {
    row(0, 'Salam! Mən <b>AI Done</b>-am, süni intellekt köməkçinizəm. Tapşırıqlarınız, risklər və iş yükü barədə soruşa bilərsiniz. Aşağıdakı düymələrdən birini seçin və ya sualınızı yazın.');
  }

  function defaultAnswer(q) {
    var r = String(q || '').toLowerCase();
    var f = function(s) { return T.filter(function(t) { return t.s === s; }); };
    var wantsList = /risk|gecik|gözlə|gozle|icra|iş|ish|tapşırıq|tapshiriq|siyah|sıral|siral|göstər|goster|necə|nece|mənim|menim/.test(r);
    if (/gecik/.test(r) && /deyil|yanlış|yanlis|səhv|sehv|axı|axi/.test(r)) {
      return [
        'Düzdür: <b>Gözləmədə</b> ≠ <b>Gecikən</b>. Gecikən yalnız müddəti keçmiş işlərdir. '
          + 'Cari həftə gecikən yoxdursa, risk siyahısı boş qalır. Açıq işlərə baxmaq üçün «Mənim işlərim» yazın.',
        ''
      ];
    }
    if (!T.length && wantsList) {
      return ['Hazırda sizə təyin olunmuş aktiv tapşırıq yoxdur, risk də yoxdur.', ''];
    }
    if (/risk|gecik/.test(r)) {
      var late = f('l');
      if (late.length) {
        return [
          'Cari həftə <b>' + late.length + ' gecikən</b> tapşırıq var (müddəti keçib). Bunlar riskdir:',
          tasks(late)
        ];
      }
      var waiting = f('w').length;
      var inProg = f('p').length;
      var hint = '';
      if (waiting || inProg) {
        hint = ' Aktiv işləriniz var'
          + (waiting ? (' — <b>' + waiting + '</b> gözləmədə') : '')
          + (inProg ? ((waiting ? ',' : ' —') + ' <b>' + inProg + '</b> icrada') : '')
          + ', amma bunlar gecikən deyil. Siyahı üçün «Mənim işlərim» yazın.';
      }
      return ['Cari həftə <b>gecikən</b> tapşırıq yoxdur — risk görünmür.' + hint, ''];
    }
    if (/gözlə|gozle/.test(r)) {
      return f('w').length
        ? ['<b>' + f('w').length + ' tapşırıq</b> gözləmədədir:', tasks(f('w'))]
        : ['Gözləmədə olan tapşırıq yoxdur.', ''];
    }
    if (/icrada|icra\b/.test(r) && !/işlərim|islerim|tapşırıq|tapshiriq/.test(r)) {
      return f('p').length
        ? ['İndi <b>' + f('p').length + ' tapşırıq</b> icradadır:', tasks(f('p'))]
        : ['Hazırda icrada olan tapşırıq yoxdur.', ''];
    }
    if (/iş|ish|tapşırıq|tapshiriq|siyah|sıral|siral|göstər|goster|necə|nece|mənim|menim/.test(r)) {
      return ['Aktiv tapşırıqlarınız <b>' + T.length + '</b>-dir. Ətraflı baxmaq üçün karta toxunun:', tasks(T)];
    }
    return ['Bunu hələ başa düşmürəm. «Mənim işlərim» və ya «Cari həftə üzrə risklər» yazmağı yoxlayın.', ''];
  }

  function answer(q) {
    if (customAnswer) {
      try {
        var out = customAnswer(q, T.slice());
        if (Array.isArray(out) && out.length >= 1) {
          return [out[0] || '', out[1] || ''];
        }
      } catch (e) {
        console.warn('[AI Done] answer hook failed', e);
      }
    }
    return defaultAnswer(q);
  }

  function paintBot(introHtml, tasksHtml) {
    var r = row(0, introHtml || '');
    if (tasksHtml) {
      var timeEl = r.querySelector('.aid__time');
      if (timeEl) timeEl.insertAdjacentHTML('beforebegin', tasksHtml);
      else r.querySelector('.aid__bubble').insertAdjacentHTML('beforeend', tasksHtml);
    }
    down();
    return r;
  }

  function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    toggle(1);
    busy = 1;
    row(1, q);
    var typingRow = row(0, '<span class="typing"><i></i><i></i><i></i></span>');

    function finishLocal() {
      if (typingRow.parentNode) typingRow.remove();
      var pair = answer(q);
      paintBot(pair[0], pair[1]);
      busy = 0;
    }

    if (!smartReply) {
      setTimeout(finishLocal, 900);
      return;
    }

    Promise.resolve()
      .then(function() { return smartReply(q, T.slice()); })
      .then(function(out) {
        if (typingRow.parentNode) typingRow.remove();
        if (!root.isConnected) { busy = 0; return; }
        if (out == null) {
          finishLocal();
          return;
        }
        if (out === '') { busy = 0; return; }
        if (Array.isArray(out)) paintBot(out[0] || '', out[1] || '');
        else paintBot(String(out), '');
        busy = 0;
      })
      .catch(function(err) {
        console.warn('[AI Done] smart reply failed', err);
        if (typingRow.parentNode) typingRow.remove();
        if (!root.isConnected) { busy = 0; return; }
        try {
          var pair = answer(q);
          paintBot(pair[0], pair[1]);
        } catch (e2) {
          paintBot('Cavab alına bilmədi, yenidən cəhd edin.', '');
        }
        busy = 0;
      });
  }

  function toggle(v) {
    v = v == null ? !root.classList.contains('open') : !!v;
    try {
      panel.getAnimations().forEach(function(a) { a.cancel(); });
    } catch (eAnim) {}
    root.classList.toggle('open', v);
    try { document.body.classList.toggle('aid-chat-open', v); } catch (eBody) {}
    if (v) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    try { panel.inert = !v; } catch (eInert) {}
    panel.setAttribute('aria-hidden', v ? 'false' : 'true');
    if (fab) fab.setAttribute('aria-expanded', String(v));
    try {
      document.dispatchEvent(new CustomEvent(v ? 'aid-done:open' : 'aid-done:close', { bubbles: true }));
    } catch (eEv) {}
    /* Some embedded Chromium builds stall CSS transitions at currentTime=0 — finish them. */
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        try {
          var anims = panel.getAnimations();
          var stalled = anims.some(function(a) {
            return a.playState === 'running' && (!a.currentTime || a.currentTime < 16);
          });
          if (stalled) anims.forEach(function(a) { try { a.finish(); } catch (eF) {} });
        } catch (e2) {}
      });
    });
    if (v && matchMedia('(hover:hover)').matches) {
      setTimeout(function() { inp.focus(); }, 300);
    }
    return v;
  }

  function reset() {
    busy = 0;
    try { if (onReset) onReset(); } catch (eR) {}
    box.innerHTML = '';
    greet();
  }

  function setTasks(a) {
    T = Array.isArray(a) ? a.slice() : [];
  }

  function setAlert() {
    /* Design badge is a persistent online indicator — keep visible. */
  }

  document.addEventListener('click', function(e) {
    if (!root.contains(e.target) && e.target !== root) {
      /* only handle inside widget for most actions; fab/chips live inside root */
    }
    var q = e.target.closest('[data-q]');
    var a = e.target.closest('[data-action]');
    var tb = e.target.closest('.aid__task-btn');
    if (q && root.contains(q)) ask(q.dataset.q);
    var retry = e.target.closest('[data-retry-q]');
    if (retry && root.contains(retry) && !busy) {
      ask(retry.getAttribute('data-retry-q') || '');
    }
    if (a && root.contains(a)) {
      if (a.dataset.action === 'close') toggle(0);
      else reset();
    }
    if (tb && root.contains(tb)) {
      var c = tb.parentElement;
      tb.setAttribute('aria-expanded', String(c.classList.toggle('open')));
    }
    if (e.target.closest('.aid-launcher__close') && root.contains(e.target.closest('.aid-launcher__close'))) {
      root.classList.add('nogreet');
    }
    if (e.target.closest('.aid-launcher__fab') && root.contains(e.target.closest('.aid-launcher__fab'))) {
      toggle();
    }
    if (e.target.closest('.aid__mascot') && root.contains(e.target.closest('.aid__mascot'))) {
      mas.classList.remove('hop');
      void mas.offsetWidth;
      mas.classList.add('hop');
    }
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    ask(inp.value);
    inp.value = '';
    send.disabled = true;
  });
  inp.addEventListener('input', function() {
    send.disabled = !inp.value.trim();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && root.classList.contains('open')) toggle(0);
  });
  addEventListener('pointermove', function(e) {
    var s = document.documentElement.style;
    s.setProperty('--ex', ((e.clientX / innerWidth - 0.5) * 3).toFixed(2));
    s.setProperty('--ey', ((e.clientY / innerHeight - 0.5) * 2.4).toFixed(2));
  });

  greet();
  if (opts.startOpen) toggle(1);
  else toggle(0);

  return {
    setTasks: setTasks,
    open: function() { toggle(1); },
    close: function() { toggle(0); },
    toggle: toggle,
    reset: reset,
    ask: ask,
    setAlert: setAlert,
    isOpen: function() { return root.classList.contains('open'); },
    tasksHtml: tasks,
    answer: answer
  };
}
