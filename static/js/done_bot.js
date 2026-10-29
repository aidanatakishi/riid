/**
 * AI Done bot — floating widget chrome + 3D robot visual.
 */

import { mountBot3D } from './done_bot_3d.js?v=idda4';

var WIDGET_HTML = ''
  + '<div id="done-bot" data-user="">'
  + '  <div class="bubble" id="bubble" role="status" aria-live="polite"></div>'
  + '  <div class="bot-box">'
  + '  <button class="bot is-3d" id="bot" type="button" aria-label="AI köməkçi">'
  + '    <canvas id="donebot-canvas" class="bot-canvas" aria-hidden="true"></canvas>'
  + '  </button>'
  + '  <button class="close" id="bot-close" type="button" aria-label="AI köməkçini bağla">'
  + '    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>'
  + '  </button>'
  + '  </div>'
  + '  <button class="reopen" id="bot-reopen" type="button" aria-label="AI Done köməkçini aç">'
  + '    <svg class="reopen-mascot" viewBox="0 0 44 44" aria-hidden="true"><use href="#mascot"/></svg>'
  + '    <span class="reopen-badge" aria-hidden="true"></span>'
  + '  </button>'
  + '</div>';

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
  if (document.body && document.body.classList.contains('is-booting')) {
    root.classList.add('is-boot-pending');
  }
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
  var canvas = document.getElementById('donebot-canvas');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var user = root.dataset.user || '';
  var text = '';
  var typeT, hideT;
  var robot3d = null;
  var clickIdx = 0;
  var audioCtx = null;
  /* AI Robot.html — klik sözləri */
  var CLICK_WORDS = [
    'Salam! 👋',
    'Necəsən? 😊',
    'Sənə kömək edim? ✨',
    'Mən buradayam! 🤖',
    'Əla gündür! 💙',
    'Yenə klik et, xoşuma gəlir 😄'
  ];
  var CLICK_EMOJI = ['✨', '💫', '⭐', '🌟'];
  var INTRO_WORD = 'Salam! Mən sənin AI köməkçinəm 👋';

  function bubbleTextFor() {
    return 'Salam! Mən AI Done-am — sizi görməyə çox şadam! Paneldə sizə kömək edə bilərəm, klikləyin!';
  }

  function showBubbleText(msg, holdMs) {
    clearTimeout(typeT);
    clearTimeout(hideT);
    text = msg || bubbleTextFor();
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
    var hold = holdMs != null ? holdMs : (2400 + (reduce ? 0 : text.length * 18));
    hideT = setTimeout(function () {
      bubble.classList.remove('show');
    }, hold);
  }

  function showBubble() {
    showBubbleText(bubbleTextFor(), 8000);
  }

  function blip() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      var n = audioCtx.currentTime;
      o.frequency.setValueAtTime(520, n);
      o.frequency.exponentialRampToValueAtTime(980, n + 0.14);
      g.gain.setValueAtTime(0.1, n);
      g.gain.exponentialRampToValueAtTime(0.001, n + 0.22);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(n + 0.24);
    } catch (e) {}
  }

  function spawnClickFx(clientX, clientY) {
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('span');
      s.className = 'donebot-fx';
      s.textContent = CLICK_EMOJI[i % CLICK_EMOJI.length];
      s.style.left = (clientX - 13 + Math.random() * 90 - 45) + 'px';
      s.style.top = (clientY - 13) + 'px';
      s.style.setProperty('--dx', (Math.random() * 90 - 45) + 'px');
      s.style.animationDelay = (i * 0.05) + 's';
      document.body.appendChild(s);
      setTimeout(function (el) { return function () { el.remove(); }; }(s), 1300);
    }
  }

  function sayClickPhrase(ev) {
    var phrase = CLICK_WORDS[clickIdx % CLICK_WORDS.length];
    clickIdx += 1;
    showBubbleText(phrase, 2400);
    blip();
    if (robot3d && robot3d.react) robot3d.react();
    if (ev && !reduce) spawnClickFx(ev.clientX, ev.clientY);
  }

  try { sessionStorage.removeItem('done-bot-closed'); sessionStorage.removeItem('done-bot-v'); } catch (e) {}
  setTimeout(function () {
    if (!root.classList.contains('closed') && !root.classList.contains('is-boot-hero') && !root.classList.contains('is-boot-landing')) {
      showBubble();
    }
  }, 1500);
  bot.addEventListener('mouseenter', function () {
    if (root.classList.contains('is-boot-hero') || root.classList.contains('is-boot-landing')) return;
    if (!bubble.classList.contains('show')) showBubble();
  });
  bot.addEventListener('focus', function () {
    if (root.classList.contains('is-boot-hero') || root.classList.contains('is-boot-landing')) return;
    if (!bubble.classList.contains('show')) showBubble();
  });

  if (canvas) {
    mountBot3D(canvas, { reduceMotion: reduce, quality: 'high' }).then(function (api) {
      robot3d = api;
      if (root.classList.contains('paused') && robot3d.setPaused) robot3d.setPaused(true);
      if (robot3d.resize) robot3d.resize();
    }).catch(function (err) {
      console.warn('AI Done 3D bot failed to mount', err);
    });
  }

  bot.addEventListener('click', function (ev) {
    bot.classList.remove('squish');
    void bot.offsetWidth;
    bot.classList.add('squish');
    bot.classList.remove('alert');
    sayClickPhrase(ev);
    /* Loading ekranında yalnız danışır — chat açılmasın */
    if (root.classList.contains('is-boot-hero') || root.classList.contains('is-boot-landing')) return;
    root.dispatchEvent(new CustomEvent('done-bot:open', { bubbles: true }));
  });

  function setMood(mood) {
    bot.classList.remove('thinking', 'is-happy', 'is-waving');
    if (mood === 'think') bot.classList.add('thinking');
    else if (mood === 'happy') bot.classList.add('is-happy');
    else if (mood === 'wave') bot.classList.add('is-waving', 'is-happy');
    else if (mood === 'cheer') bot.classList.add('is-happy', 'is-waving');
    if (robot3d && robot3d.setMood) robot3d.setMood(mood || null);
  }

  function enterBootHero() {
    var host = document.getElementById('loadBotHost');
    clearTimeout(typeT);
    clearTimeout(hideT);
    bubble.classList.remove('show');
    root.classList.remove('closed', 'is-boot-landing', 'is-boot-pending');
    if (host && root.parentNode !== host) host.appendChild(root);
    root.classList.add('is-boot-hero');
    bot.classList.remove('vanish', 'appear');
    bot.style.transition = '';
    bot.style.transform = '';
    bot.style.transformOrigin = '';
    /* Loading: sakit dayansın — fırlanma/spin olmasın */
    setMood(null);
    setTimeout(function () {
      if (robot3d && robot3d.resize) robot3d.resize();
      showBubbleText(INTRO_WORD, 2600);
    }, 40);
  }

  function exitBootHero(cb) {
    root.classList.remove('is-boot-pending');
    if (!root.classList.contains('is-boot-hero')) {
      if (typeof cb === 'function') cb();
      return;
    }
    setMood(null);
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var first = bot.getBoundingClientRect();
    if (root.parentNode !== document.body) document.body.appendChild(root);
    root.classList.remove('is-boot-hero');
    root.classList.add('is-boot-landing');
    if (reduceMotion) {
      root.classList.remove('is-boot-landing');
      bot.style.transition = '';
      bot.style.transform = '';
      if (robot3d && robot3d.resize) robot3d.resize();
      if (typeof cb === 'function') cb();
      return;
    }
    var last = bot.getBoundingClientRect();
    var dx = first.left - last.left;
    var dy = first.top - last.top;
    var sx = first.width / Math.max(last.width, 1);
    var sy = first.height / Math.max(last.height, 1);
    bot.style.transformOrigin = '50% 100%';
    bot.style.transition = 'none';
    bot.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    void bot.offsetWidth;
    bot.style.transition = 'transform 0.85s cubic-bezier(.22,1,.36,1)';
    bot.style.transform = 'none';
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      bot.style.transition = '';
      bot.style.transform = '';
      bot.style.transformOrigin = '';
      root.classList.remove('is-boot-landing');
      bot.classList.remove('appear');
      void bot.offsetWidth;
      bot.classList.add('appear');
      setTimeout(function () { bot.classList.remove('appear'); }, 750);
      setTimeout(function () {
        if (!root.classList.contains('closed')) showBubble();
      }, 400);
      if (robot3d && robot3d.resize) robot3d.resize();
      if (typeof cb === 'function') cb();
    }
    function onEnd(e) {
      if (e && e.propertyName && e.propertyName !== 'transform') return;
      bot.removeEventListener('transitionend', onEnd);
      finish();
    }
    bot.addEventListener('transitionend', onEnd);
    setTimeout(finish, 980);
  }

  window.DoneBot = {
    setThinking: function (v) {
      bot.classList.toggle('thinking', !!v);
      if (robot3d && robot3d.setMood) robot3d.setMood(v ? 'think' : null);
    },
    setAlert: function (v) { bot.classList.toggle('alert', !!v); },
    setMood: setMood,
    enterBootHero: enterBootHero,
    exitBootHero: exitBootHero,
    say: showBubble,
    setUserName: function (name) { root.setAttribute('data-user', name || ''); }
  };

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
  /** Vanish 3D mascot with star burst; leave design fab in the corner. */
  function parkToFab(optsPark) {
    optsPark = optsPark || {};
    if (root.classList.contains('closed') || bot.classList.contains('vanish')) return;
    clearTimeout(typeT);
    clearTimeout(hideT);
    bubble.classList.remove('show');
    if (!optsPark.silent) {
      root.dispatchEvent(new CustomEvent('done-bot:close', { bubbles: true }));
    }
    if (reduce) {
      root.classList.add('closed');
      if (robot3d && robot3d.setPaused) robot3d.setPaused(true);
      return;
    }
    if (robot3d && robot3d.setMood) robot3d.setMood('wave');
    bot.classList.add('vanish');
    setTimeout(burst, 480);
    setTimeout(function () {
      root.classList.add('closed');
      bot.classList.remove('vanish');
      if (robot3d && robot3d.setPaused) robot3d.setPaused(true);
    }, 1000);
  }
  function closeBot() {
    parkToFab({ silent: false });
  }
  function openBot(optsOpen) {
    optsOpen = optsOpen || {};
    root.classList.remove('closed');
    bot.classList.remove('vanish');
    bot.classList.remove('appear');
    void bot.offsetWidth;
    bot.classList.add('appear');
    if (robot3d && robot3d.setPaused) robot3d.setPaused(false);
    if (robot3d && robot3d.resize) robot3d.resize();
    if (robot3d && robot3d.react) robot3d.react();
    setTimeout(showBubble, 700);
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
  var reopenLock = 0;
  function onReopen(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (!root.classList.contains('closed')) return;
    var now = Date.now();
    /* Guard against pointerup+click (or touchend+click) double-toggle */
    if (now - reopenLock < 500) return;
    reopenLock = now;
    /* Keep design fab — only toggle the chat panel */
    root.dispatchEvent(new CustomEvent('done-bot:open', { bubbles: true }));
  }
  reopen.addEventListener('click', onReopen);
  window.DoneBot.close = closeBot;
  window.DoneBot.parkToFab = parkToFab;
  window.DoneBot.open = function () { openBot({ openPanel: true }); };

  document.addEventListener('visibilitychange', function () {
    root.classList.toggle('paused', document.hidden);
    if (robot3d && robot3d.setPaused) robot3d.setPaused(document.hidden);
  });

  if (typeof opts.onOpen === 'function') {
    root.addEventListener('done-bot:open', function () { opts.onOpen(); });
  }
  if (typeof opts.onClose === 'function') {
    root.addEventListener('done-bot:close', function () { opts.onClose(); });
  }
}
