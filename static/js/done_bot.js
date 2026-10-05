/**
 * AI Done bot — ported verbatim from ai-done-bot.html
 * SVG ids prefixed with donebot-. Demo UI removed.
 */

var WIDGET_HTML = "<div id=\"done-bot\" data-user=\"\">\n  <div class=\"bubble\" id=\"bubble\" role=\"status\" aria-live=\"polite\"></div>\n  <div class=\"bot-box\">\n  <button class=\"bot\" id=\"bot\" type=\"button\" aria-label=\"AI k\u00f6m\u0259k\u00e7i\">\n    <svg viewBox=\"0 0 200 250\" aria-hidden=\"true\">\n      <defs>\n        <radialGradient id=\"donebot-body\" cx=\"36%\" cy=\"22%\" r=\"95%\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".45\" stop-color=\"#eef2f9\"/><stop offset=\"1\" stop-color=\"var(--bot-body-2)\"/></radialGradient>\n        <radialGradient id=\"donebot-vol\" cx=\"42%\" cy=\"34%\" r=\"70%\"><stop offset=\".55\" stop-color=\"#5a6e96\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#4a5d86\" stop-opacity=\".38\"/></radialGradient>\n        <linearGradient id=\"donebot-bounce\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\".6\" stop-color=\"var(--bot-glow)\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"var(--bot-glow)\" stop-opacity=\".22\"/></linearGradient>\n        <linearGradient id=\"donebot-visor\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#26334f\"/><stop offset=\".55\" stop-color=\"#0b1020\"/><stop offset=\"1\" stop-color=\"#04060d\"/></linearGradient>\n        <linearGradient id=\"donebot-refl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".28\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient>\n        <radialGradient id=\"donebot-eyeg\" cx=\"50%\" cy=\"35%\" r=\"65%\"><stop offset=\"0\" stop-color=\"#f2feff\"/><stop offset=\".5\" stop-color=\"#8eeaff\"/><stop offset=\"1\" stop-color=\"var(--bot-glow)\"/></radialGradient>\n        <radialGradient id=\"donebot-sphere\" cx=\"35%\" cy=\"28%\" r=\"80%\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\".6\" stop-color=\"#e3eaf5\"/><stop offset=\"1\" stop-color=\"#a9b8cf\"/></radialGradient>\n        <radialGradient id=\"donebot-gsh\" cx=\"50%\" cy=\"50%\" r=\"50%\"><stop offset=\"0\" stop-color=\"#1b2a4a\" stop-opacity=\".35\"/><stop offset=\"1\" stop-color=\"#1b2a4a\" stop-opacity=\"0\"/></radialGradient>\n        <linearGradient id=\"donebot-ring\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#9fb0c9\"/></linearGradient>\n        <filter id=\"donebot-b1\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\"><feGaussianBlur stdDeviation=\"1.6\"/></filter>\n        <filter id=\"donebot-b3\" x=\"-80%\" y=\"-80%\" width=\"260%\" height=\"260%\"><feGaussianBlur stdDeviation=\"3.5\"/></filter>\n        <filter id=\"donebot-b6\" x=\"-80%\" y=\"-80%\" width=\"260%\" height=\"260%\"><feGaussianBlur stdDeviation=\"7\"/></filter>\n        <clipPath id=\"donebot-hc\"><rect x=\"30\" y=\"36\" width=\"140\" height=\"104\" rx=\"52\"/></clipPath>\n      </defs>\n      <ellipse id=\"donebot-shadow\" cx=\"100\" cy=\"236\" rx=\"52\" ry=\"9\" fill=\"url(#donebot-gsh)\"/>\n      <g id=\"donebot-float\">\n        <!-- feet -->\n        <ellipse cx=\"83\" cy=\"223\" rx=\"15\" ry=\"8\" fill=\"url(#donebot-sphere)\"/><ellipse cx=\"117\" cy=\"223\" rx=\"15\" ry=\"8\" fill=\"url(#donebot-sphere)\"/>\n        <!-- body -->\n        <path d=\"M64 148 Q64 136 78 136 H122 Q136 136 136 148 V188 Q136 224 100 224 Q64 224 64 188Z\" fill=\"url(#donebot-body)\"/>\n        <path d=\"M64 148 Q64 136 78 136 H122 Q136 136 136 148 V188 Q136 224 100 224 Q64 224 64 188Z\" fill=\"url(#donebot-vol)\"/>\n        <path d=\"M64 148 Q64 136 78 136 H122 Q136 136 136 148 V188 Q136 224 100 224 Q64 224 64 188Z\" fill=\"url(#donebot-bounce)\"/>\n        <ellipse cx=\"100\" cy=\"142\" rx=\"30\" ry=\"7\" fill=\"#3d4f78\" opacity=\".35\" filter=\"url(#donebot-b3)\"/>\n        <ellipse cx=\"80\" cy=\"168\" rx=\"7\" ry=\"16\" fill=\"#fff\" opacity=\".7\" filter=\"url(#donebot-b1)\" transform=\"rotate(10 80 168)\"/>\n        <!-- badge -->\n        <circle cx=\"100\" cy=\"184\" r=\"20\" fill=\"url(#donebot-ring)\"/>\n        <circle cx=\"100\" cy=\"184\" r=\"17\" fill=\"url(#donebot-visor)\"/>\n        <ellipse cx=\"94\" cy=\"177\" rx=\"8\" ry=\"4\" fill=\"url(#donebot-refl)\"/>\n        <circle class=\"ring\" cx=\"100\" cy=\"184\" r=\"24\" fill=\"none\" stroke=\"var(--bot-glow)\" stroke-width=\"3\" stroke-dasharray=\"28 120\" stroke-linecap=\"round\"/>\n        <text x=\"100\" y=\"190\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#d9f7ff\" font-family=\"system-ui,sans-serif\" style=\"filter:drop-shadow(0 0 3px var(--bot-glow))\">AI</text>\n        <!-- hands -->\n        <ellipse cx=\"54\" cy=\"188\" rx=\"10\" ry=\"3\" fill=\"#1b2a4a\" opacity=\".18\" filter=\"url(#donebot-b1)\"/>\n        <circle cx=\"50\" cy=\"182\" r=\"10.5\" fill=\"url(#donebot-sphere)\"/>\n        <g class=\"hand-r\"><circle cx=\"150\" cy=\"182\" r=\"10.5\" fill=\"url(#donebot-sphere)\"/></g>\n        <!-- head -->\n        <g id=\"donebot-head\">\n          <g id=\"donebot-ant\"><line x1=\"100\" y1=\"40\" x2=\"100\" y2=\"25\" stroke=\"#c4d0e2\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>\n            <circle class=\"tip\" cx=\"100\" cy=\"20\" r=\"9\" fill=\"var(--bot-glow)\" opacity=\".5\" filter=\"url(#donebot-b3)\"/>\n            <circle cx=\"100\" cy=\"20\" r=\"4.5\" fill=\"url(#donebot-eyeg)\"/></g>\n          <rect x=\"30\" y=\"36\" width=\"140\" height=\"104\" rx=\"52\" fill=\"url(#donebot-body)\"/>\n          <rect x=\"30\" y=\"36\" width=\"140\" height=\"104\" rx=\"52\" fill=\"url(#donebot-vol)\"/>\n          <g clip-path=\"url(#donebot-hc)\">\n            <path d=\"M168 50 Q176 90 160 130\" fill=\"none\" stroke=\"var(--bot-glow)\" stroke-width=\"7\" opacity=\".5\" filter=\"url(#donebot-b3)\"/>\n            <ellipse cx=\"100\" cy=\"146\" rx=\"60\" ry=\"10\" fill=\"#3d4f78\" opacity=\".25\" filter=\"url(#donebot-b3)\"/>\n          </g>\n          <ellipse cx=\"62\" cy=\"52\" rx=\"22\" ry=\"7\" fill=\"#fff\" opacity=\".85\" filter=\"url(#donebot-b1)\" transform=\"rotate(-20 62 52)\"/>\n          <circle cx=\"48\" cy=\"62\" r=\"1.8\" fill=\"#fff\" opacity=\".9\"/>\n          <circle cx=\"30\" cy=\"92\" r=\"6\" fill=\"var(--bot-glow)\" opacity=\".5\" filter=\"url(#donebot-b3)\"/><circle cx=\"170\" cy=\"92\" r=\"6\" fill=\"var(--bot-glow)\" opacity=\".5\" filter=\"url(#donebot-b3)\"/>\n          <!-- visor glass -->\n          <rect x=\"43\" y=\"52\" width=\"114\" height=\"74\" rx=\"35\" fill=\"#9fb0c9\" opacity=\".45\"/>\n          <rect x=\"45\" y=\"54\" width=\"110\" height=\"70\" rx=\"33\" fill=\"url(#donebot-visor)\"/>\n          <path d=\"M56 66 Q100 50 144 66 Q140 78 100 74 Q60 78 56 66Z\" fill=\"url(#donebot-refl)\"/>\n          <g id=\"donebot-face\">\n            <g class=\"eyes\" id=\"donebot-eyes\">\n              <ellipse class=\"eye l\" cx=\"79\" cy=\"90\" rx=\"13\" ry=\"15\" fill=\"var(--bot-glow)\" opacity=\".45\" filter=\"url(#donebot-b3)\"/>\n              <ellipse class=\"eye r\" cx=\"121\" cy=\"90\" rx=\"13\" ry=\"15\" fill=\"var(--bot-glow)\" opacity=\".45\" filter=\"url(#donebot-b3)\"/>\n              <ellipse class=\"eye l\" cx=\"79\" cy=\"90\" rx=\"8\" ry=\"10.5\" fill=\"url(#donebot-eyeg)\"/>\n              <ellipse class=\"eye r\" cx=\"121\" cy=\"90\" rx=\"8\" ry=\"10.5\" fill=\"url(#donebot-eyeg)\"/>\n            </g>\n            <g class=\"happy\" fill=\"none\" stroke-linecap=\"round\">\n              <path d=\"M70 95 Q79 82 88 95 M112 95 Q121 82 130 95\" stroke=\"var(--bot-glow)\" stroke-width=\"8\" opacity=\".5\" filter=\"url(#donebot-b3)\"/>\n              <path d=\"M70 95 Q79 82 88 95 M112 95 Q121 82 130 95\" stroke=\"url(#donebot-eyeg)\" stroke-width=\"4.5\"/></g>\n            <path d=\"M90 107 Q100 114 110 107\" fill=\"none\" stroke=\"var(--bot-glow)\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".5\" filter=\"url(#donebot-b1)\"/>\n            <path d=\"M90 107 Q100 114 110 107\" fill=\"none\" stroke=\"#bff3ff\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>\n          </g>\n        </g>\n        <g class=\"notify\"><circle cx=\"152\" cy=\"52\" r=\"10\" fill=\"#f43f5e\" stroke=\"#fff\" stroke-width=\"3\"/></g>\n      </g>\n    </svg>\n  </button>\n  <button class=\"close\" id=\"bot-close\" type=\"button\" aria-label=\"AI k\u00f6m\u0259k\u00e7ini ba\u011fla\"><svg viewBox=\"0 0 12 12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M2 2l8 8M10 2l-8 8\"/></svg></button>\n  </div>\n  <button class=\"reopen\" id=\"bot-reopen\" type=\"button\" aria-label=\"AI k\u00f6m\u0259k\u00e7ini a\u00e7\">AI</button>\n</div>";

var mounted = false;

/**
 * @param {{ userName?: string, onOpen?: Function, onClose?: Function }} opts
 */
export function mountDoneBot(opts) {
  opts = opts || {};
  if (mounted || document.getElementById('done-bot')) {
    if (opts.userName != null) {
      var existing = document.getElementById('done-bot');
      if (existing) existing.setAttribute('data-user', opts.userName || '');
    }
    return window.DoneBot;
  }
  mounted = true;

  var wrap = document.createElement('div');
  wrap.innerHTML = String(WIDGET_HTML).trim();
  var root = wrap.firstElementChild;
  root.setAttribute('data-user', opts.userName || '');
  document.body.appendChild(root);
  bindDoneBot(root, opts);
  return window.DoneBot;
}

export function getDoneBot() {
  return window.DoneBot || null;
}

function bindDoneBot(root, opts) {
  opts = opts || {};
  var bot = document.getElementById('bot');
  var bubble = document.getElementById('bubble');
  var eyes = document.getElementById('donebot-eyes');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var user = root.dataset.user || '';
  var text = bubbleTextFor(user);
  var typeT, hideT;

  function bubbleTextFor(name) {
    if (name) {
      return 'Salam, ' + name + '! Mən AI Done-am — çox şadam! Paneldə sizə kömək edə bilərəm, klikləyin!';
    }
    return 'Salam! Mən AI Done-am — çox şadam! Paneldə sizə kömək edə bilərəm, klikləyin!';
  }

  /* Speech bubble: spring in + typewriter, auto-hide after 8s */
  function showBubble() {
    clearTimeout(typeT);
    clearTimeout(hideT);
    user = root.dataset.user || '';
    text = bubbleTextFor(user);
    bubble.classList.add('show');
    if (reduce) {
      bubble.textContent = text;
    } else {
      bubble.textContent = '';
      var i = 0;
      (function tick() {
        bubble.textContent = text.slice(0, ++i);
        if (i < text.length) typeT = setTimeout(tick, 28);
      })();
    }
    hideT = setTimeout(function () {
      bubble.classList.remove('show');
    }, 8000 + (reduce ? 0 : text.length * 28));
  }

  /* Closed only for this page lifetime — a full browser refresh shows the bot again */
  try { sessionStorage.removeItem('done-bot-closed'); sessionStorage.removeItem('done-bot-v'); } catch (e) {}
  setTimeout(function () {
    if (!root.classList.contains('closed')) showBubble();
  }, 1500);
  bot.addEventListener('mouseenter', function () {
    if (!bubble.classList.contains('show')) showBubble();
  });
  bot.addEventListener('focus', function () {
    if (!bubble.classList.contains('show')) showBubble();
  });

  /* Head follows cursor (max ~9deg tilt) */
  if (!reduce) {
    addEventListener('pointermove', function (e) {
      var r = bot.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / innerWidth * 2;
      var dy = (e.clientY - (r.top + r.height / 3)) / innerHeight * 2;
      var c = function (v) { return Math.max(-1, Math.min(1, v)); };
      bot.style.setProperty('--hr', c(dx) * 9 + 'deg');
      bot.style.setProperty('--hx', c(dx) * 4 + 'px');
      bot.style.setProperty('--hy', c(dy) * 3 + 'px');
      bot.style.setProperty('--fx', c(dx) * 5 + 'px');
      bot.style.setProperty('--fy', c(dy) * 3 + 'px');
    }, { passive: true });
    /* Random blink every 3-5s */
    (function blink() {
      setTimeout(function () {
        eyes.classList.add('blink');
        setTimeout(function () {
          eyes.classList.remove('blink');
          blink();
        }, 140);
      }, 3000 + Math.random() * 2000);
    })();
  }
  /* head vars live on svg parent; make them reach inner groups */
  bot.querySelectorAll('#donebot-head,#donebot-face').forEach(function () {});

  /* Click: squash & stretch, then fire open event */
  bot.addEventListener('click', function () {
    bot.classList.remove('squish');
    void bot.offsetWidth;
    bot.classList.add('squish');
    bubble.classList.remove('show');
    bot.classList.remove('alert');
    root.dispatchEvent(new CustomEvent('done-bot:open', { bubbles: true }));
  });

  /* Public API for your app */
  window.DoneBot = {
    setThinking: function (v) { bot.classList.toggle('thinking', !!v); },
    setAlert: function (v) { bot.classList.toggle('alert', !!v); },
    say: showBubble,
    setUserName: function (name) { root.setAttribute('data-user', name || ''); }
  };

  /* Close (X): bot waves, squishes, spins away in a burst of sparks */
  var box = root.querySelector('.bot-box');
  var closeBtn = document.getElementById('bot-close');
  var reopen = document.getElementById('bot-reopen');
  function burst() {
    var cx = box.offsetLeft + box.offsetWidth / 2;
    var cy = box.offsetTop + box.offsetHeight / 2 - 10;
    var sh = document.createElement('span');
    sh.className = 'shock';
    sh.style.cssText = 'left:' + cx + 'px;top:' + cy + 'px';
    root.appendChild(sh);
    sh.animate(
      [{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(3)', opacity: 0 }],
      { duration: 650, easing: 'ease-out' }
    ).onfinish = function () { sh.remove(); };
    for (var i = 0; i < 18; i++) {
      var d = document.createElement('span');
      d.className = 'spark';
      d.style.cssText = 'left:' + cx + 'px;top:' + cy + 'px';
      root.appendChild(d);
      var a = Math.PI * 2 * i / 18 + Math.random() * 0.4;
      var rr = 50 + Math.random() * 60;
      d.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: 'translate(' + (Math.cos(a) * rr) + 'px,' + (Math.sin(a) * rr - 20) + 'px) scale(0)', opacity: 0 }
        ],
        { duration: 600 + Math.random() * 500, easing: 'cubic-bezier(.15,.8,.3,1)' }
      ).onfinish = (function (el) { return function () { el.remove(); }; })(d);
    }
  }
  function closeBot() {
    if (root.classList.contains('closed') || bot.classList.contains('vanish')) return;
    clearTimeout(typeT);
    clearTimeout(hideT);
    bubble.classList.remove('show');
    root.dispatchEvent(new CustomEvent('done-bot:close', { bubbles: true }));
    if (reduce) {
      root.classList.add('closed');
      return;
    }
    bot.classList.add('vanish');
    setTimeout(burst, 480);
    setTimeout(function () {
      root.classList.add('closed');
      bot.classList.remove('vanish');
    }, 1000);
  }
  function openBot(optsOpen) {
    optsOpen = optsOpen || {};
    root.classList.remove('closed');
    bot.classList.remove('vanish');
    bot.classList.remove('appear');
    void bot.offsetWidth;
    bot.classList.add('appear');
    setTimeout(showBubble, 700);
    /* Reopen FAB must open the chat panel too (otherwise user is stuck after X) */
    if (optsOpen.openPanel !== false) {
      root.dispatchEvent(new CustomEvent('done-bot:open', { bubbles: true }));
    }
  }
  closeBtn.addEventListener('click', function (ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    closeBot();
  });
  function onReopen(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (!root.classList.contains('closed')) return;
    openBot({ openPanel: true });
  }
  reopen.addEventListener('click', onReopen);
  reopen.addEventListener('pointerup', onReopen);
  reopen.addEventListener('touchend', onReopen, { passive: false });
  window.DoneBot.close = closeBot;
  window.DoneBot.open = function () { openBot({ openPanel: true }); };

  /* Save CPU when tab hidden */
  document.addEventListener('visibilitychange', function () {
    root.classList.toggle('paused', document.hidden);
  });

  if (typeof opts.onOpen === 'function') {
    root.addEventListener('done-bot:open', function () { opts.onOpen(); });
  }
  if (typeof opts.onClose === 'function') {
    root.addEventListener('done-bot:close', function () { opts.onClose(); });
  }
}
