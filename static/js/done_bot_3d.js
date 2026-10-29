/**
 * 3D AI Robot — improved from Downloads/ai-robot.html
 * Env map, higher meshes/textures, sharper face/badge.
 */

function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = '/static/vendor/three.min.js';
    s.async = true;
    s.onload = function () {
      if (window.THREE) resolve(window.THREE);
      else reject(new Error('THREE missing after load'));
    };
    s.onerror = function () { reject(new Error('Failed to load three.min.js')); };
    document.head.appendChild(s);
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reduceMotion?: boolean, quality?: string }} opts
 */
export function mountBot3D(canvas, opts) {
  opts = opts || {};
  return loadThree().then(function (THREE) {
    return createScene(THREE, canvas, opts);
  });
}

function createScene(THREE, canvas, opts) {
  var reduce = !!opts.reduceMotion;
  var highQ = opts.quality !== 'low';
  var R = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  function applyPixelRatio() {
    var dpr = window.devicePixelRatio || 1;
    R.setPixelRatio(Math.min(dpr, highQ ? 3 : 2));
  }
  applyPixelRatio();
  R.outputEncoding = THREE.sRGBEncoding;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.1;

  function cvs(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function tex(c) {
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  var S = new THREE.Scene();
  var cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  /* Environment reflections (ai-robot.html) */
  (function () {
    var e = new THREE.Scene();
    var c = cvs(256, 128);
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#cfd9ff');
    g.addColorStop(1, '#5a5f9a');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 128);
    e.add(new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex(c), side: THREE.BackSide })
    ));
    [
      [6, 0.2, 6, 0, 7, 3, 0xffffff],
      [0.2, 6, 3, -7, 2, 2, 0xffffff],
      [0.2, 5, 3, 7, 1, -2, 0x7fe9ff]
    ].forEach(function (a) {
      var m = new THREE.Mesh(
        new THREE.BoxGeometry(a[0], a[1], a[2]),
        new THREE.MeshBasicMaterial({ color: a[6] })
      );
      m.position.set(a[3], a[4], a[5]);
      e.add(m);
    });
    var pm = new THREE.PMREMGenerator(R);
    S.environment = pm.fromScene(e, 0.04).texture;
    pm.dispose();
  })();

  S.add(new THREE.HemisphereLight(0xffffff, 0x9fb4ff, 0.35));
  var key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(3, 5, 6);
  S.add(key);
  var rim = new THREE.DirectionalLight(0x5ee7ff, 1.3);
  rim.position.set(-5, 2, -3);
  S.add(rim);
  var fl = new THREE.PointLight(0x5ee7ff, 0.6, 6);
  fl.position.set(0, 1.8, 2.5);
  S.add(fl);

  function M(c, o) {
    return new THREE.MeshPhysicalMaterial(Object.assign({
      color: c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12,
      envMapIntensity: 1
    }, o || {}));
  }
  var white = M(0xf3f6fc);
  var dark = M(0x16213f, { roughness: 0.35 });
  var visorM = M(0x040a1a, { roughness: 0.08, metalness: 0.4 });

  function ell(m, x, y, z) {
    var o = new THREE.Mesh(new THREE.SphereGeometry(1, highQ ? 96 : 48, highQ ? 64 : 32), m);
    o.scale.set(x, y, z);
    return o;
  }

  var bot = new THREE.Group();
  var spin = new THREE.Group();
  bot.add(spin);
  S.add(bot);

  var head = new THREE.Group();
  head.position.y = 1.75;
  spin.add(head);
  head.add(ell(white, 1.2, 1, 1));
  var visor = ell(visorM, 0.88, 0.6, 0.31);
  visor.position.z = 0.72;
  head.add(visor);

  var fc = cvs(highQ ? 1024 : 512, highQ ? 640 : 320);
  var fx = fc.getContext('2d');
  var ft = tex(fc);
  try {
    ft.anisotropy = R.capabilities.getMaxAnisotropy();
  } catch (e) {}
  var faceScale = highQ ? 2 : 1;
  var pg = new THREE.PlaneGeometry(1.6, 1, 28, 18);
  var pp = pg.attributes.position;
  for (var i = 0; i < pp.count; i++) {
    var px0 = pp.getX(i) / 0.88;
    var py0 = pp.getY(i) / 0.6;
    pp.setZ(i, 0.72 + 0.31 * Math.sqrt(Math.max(0, 1 - px0 * px0 - py0 * py0)) + 0.025);
  }
  var fp = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({
    map: ft, transparent: true, depthWrite: false, toneMapped: false
  }));
  head.add(fp);

  var earM = new THREE.MeshStandardMaterial({
    color: 0x0a1a33, emissive: 0x35d9ff, emissiveIntensity: 0.9
  });
  [-1, 1].forEach(function (s) {
    var e = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 32), earM);
    e.rotation.z = Math.PI / 2;
    e.position.set(s * 1.17, 0, 0);
    head.add(e);
  });
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.1, 24), dark);
  base.position.y = 1;
  head.add(base);
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 12), dark);
  stem.position.y = 1.2;
  head.add(stem);
  var ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x6beaff, toneMapped: false })
  );
  ball.position.y = 1.5;
  head.add(ball);

  var gc = cvs(128, 128);
  var gx = gc.getContext('2d');
  var gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gg.addColorStop(0, 'rgba(120,240,255,.9)');
  gg.addColorStop(0.4, 'rgba(60,200,255,.35)');
  gg.addColorStop(1, 'rgba(60,200,255,0)');
  gx.fillStyle = gg;
  gx.fillRect(0, 0, 128, 128);
  var glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(gc),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  }));
  glow.position.y = 1.5;
  head.add(glow);

  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.22, 32), dark);
  neck.position.y = 0.82;
  spin.add(neck);
  var body = ell(white, 0.66, 0.74, 0.56);
  body.position.y = 0.15;
  spin.add(body);

  var bc = cvs(highQ ? 512 : 256, highQ ? 512 : 256);
  var bx = bc.getContext('2d');
  if (highQ) bx.scale(2, 2);
  bx.fillStyle = '#0b1a3a';
  bx.beginPath();
  bx.arc(128, 128, 124, 0, 7);
  bx.fill();
  bx.strokeStyle = '#5ee7ff';
  bx.lineWidth = 12;
  bx.shadowColor = '#2fd4ff';
  bx.shadowBlur = highQ ? 28 : 14;
  bx.beginPath();
  bx.arc(128, 128, 108, 0, 7);
  bx.stroke();
  bx.shadowBlur = 0;
  bx.fillStyle = '#fff';
  bx.font = 'bold 104px system-ui,Arial,sans-serif';
  bx.textAlign = 'center';
  bx.textBaseline = 'middle';
  bx.fillText('AI', 128, 136);
  var badge = new THREE.Mesh(
    new THREE.CircleGeometry(0.27, 48),
    new THREE.MeshBasicMaterial({ map: tex(bc), transparent: true, toneMapped: false })
  );
  badge.position.set(0, 0.2, 0.57);
  spin.add(badge);

  [-1, 1].forEach(function (s) {
    var f = ell(white, 0.28, 0.2, 0.36);
    f.position.set(s * 0.33, -0.58, 0.08);
    spin.add(f);
  });

  function ring(R0, T, y) {
    var m = new THREE.Mesh(new THREE.TorusGeometry(R0, T, 14, 28), dark);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    return m;
  }
  function arm(s) {
    var g = new THREE.Group();
    g.position.set(s * 0.66, 0.5, 0);
    var so = ell(dark, 0.12, 0.22, 0.22);
    so.position.set(-s * 0.06, 0, 0);
    g.add(so);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.14, 28), dark);
    cap.position.y = -0.06;
    g.add(cap);
    var u = ell(white, 0.2, 0.3, 0.2);
    u.position.y = -0.3;
    g.add(u);
    g.add(ring(0.17, 0.05, -0.52));
    var f = ell(white, 0.22, 0.26, 0.21);
    f.position.y = -0.74;
    g.add(f);
    var p = ell(dark, 0.15, 0.12, 0.14);
    p.position.y = -0.98;
    g.add(p);
    [-1, 0, 1].forEach(function (k) {
      var fg = ell(dark, 0.05, 0.14, 0.055);
      fg.position.set(k * 0.09, -1.1, k === 0 ? 0.07 : 0);
      fg.rotation.z = k * 0.35;
      g.add(fg);
    });
    spin.add(g);
    return g;
  }
  var armL = arm(-1);
  var armR = arm(1);

  var sc = cvs(128, 128);
  var sx = sc.getContext('2d');
  var sg = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
  sg.addColorStop(0, 'rgba(30,20,90,.45)');
  sg.addColorStop(1, 'rgba(30,20,90,0)');
  sx.fillStyle = sg;
  sx.fillRect(0, 0, 128, 128);
  var shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.5;
  S.add(shadow);

  function drawFace(b, joy, lx, ly) {
    fx.setTransform(faceScale, 0, 0, faceScale, 0, 0);
    fx.clearRect(0, 0, 512, 320);
    var bg = fx.createRadialGradient(256, 160, 20, 256, 160, 260);
    bg.addColorStop(0, 'rgba(20,70,120,.5)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    fx.fillStyle = bg;
    fx.fillRect(0, 0, 512, 320);
    if (joy) {
      fx.save();
      fx.globalAlpha = 0.35;
      fx.fillStyle = '#ff7ab8';
      [96, 416].forEach(function (cx) {
        fx.beginPath();
        fx.ellipse(cx, 218, 30, 15, 0, 0, 7);
        fx.fill();
      });
      fx.restore();
    }
    fx.strokeStyle = fx.fillStyle = '#5ee7ff';
    fx.shadowColor = '#2fd4ff';
    fx.shadowBlur = highQ ? 60 : 30;
    fx.lineCap = 'round';
    fx.lineWidth = 13;
    [150, 362].forEach(function (ex) {
      fx.beginPath();
      if (joy) fx.arc(ex + lx, 165 + ly, 40, Math.PI * 1.1, Math.PI * 1.9);
      else fx.ellipse(ex + lx, 140 + ly, 40, Math.max(3, 40 * b), 0, 0, 7);
      fx.stroke();
      if (!joy && b > 0.5) {
        fx.save();
        fx.shadowBlur = 0;
        fx.fillStyle = '#fff';
        fx.beginPath();
        fx.arc(ex + lx + 16, 123 + ly, 5, 0, 7);
        fx.fill();
        fx.restore();
      }
    });
    fx.beginPath();
    if (joy) {
      fx.arc(256, 205, 44, 0, Math.PI);
      fx.closePath();
      fx.fill();
    } else {
      fx.arc(256, 198, 30, Math.PI * 0.15, Math.PI * 0.85);
      fx.stroke();
    }
    fx.save();
    fx.shadowBlur = 0;
    var gl = fx.createLinearGradient(40, 20, 260, 150);
    gl.addColorStop(0, 'rgba(255,255,255,.2)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    fx.fillStyle = gl;
    fx.beginPath();
    fx.moveTo(50, 30);
    fx.lineTo(300, 30);
    fx.lineTo(170, 140);
    fx.lineTo(50, 140);
    fx.closePath();
    fx.fill();
    fx.restore();
    ft.needsUpdate = true;
  }

  var t = 0;
  var hover = false;
  var happy = 0;
  var react = null;
  var mx = 0;
  var my = 0;
  var hx = 0;
  var hy = 0;
  var hw = 0;
  var nb = 2;
  var lastKey = '';
  var moodWave = false;
  var moodThink = false;
  var paused = false;
  var disposed = false;
  var raf = 0;
  var ray = new THREE.Raycaster();
  var nd = new THREE.Vector2();
  var ease = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  var back = function (x) {
    var c = 1.70158;
    var d = c + 1;
    return 1 + d * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };
  var cl = function (v) { return Math.max(-1, Math.min(1, v)); };

  function hit() {
    ray.setFromCamera(nd, cam);
    return ray.intersectObject(bot, true).length > 0;
  }

  function onPointerMove(e) {
    if (disposed || paused) return;
    mx = e.clientX / innerWidth * 2 - 1;
    my = -(e.clientY / innerHeight * 2 - 1);
    nd.set(mx, my);
    hover = hit();
  }

  function resize() {
    if (disposed) return;
    applyPixelRatio();
    var w = Math.max(1, canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 140);
    var h = Math.max(1, canvas.clientHeight || (canvas.parentElement && canvas.parentElement.clientHeight) || 168);
    R.setSize(w, h, false);
    cam.aspect = w / h;
    var d = Math.max(8.2, 5.1 / Math.max(cam.aspect, 0.6));
    cam.position.set(0, 1.4, d);
    cam.lookAt(0, 1.15, 0);
    cam.updateProjectionMatrix();
  }

  function setMood(mood) {
    moodWave = mood === 'wave' || mood === 'cheer' || mood === 'happy';
    moodThink = mood === 'think';
    if (moodWave) {
      happy = t + 2.2;
      react = { t0: t, spin: mood === 'cheer' };
    }
  }

  function reactClick() {
    react = { t0: t, spin: Math.random() > 0.55 };
    happy = t + 1.8;
  }

  function setPaused(v) { paused = !!v; }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('resize', resize);
    if (ro) ro.disconnect();
    try { R.dispose(); } catch (e) {}
  }

  function drawIfNeeded(b) {
    var joy = t < happy || hw > 0.6 || moodWave;
    var lx = Math.round(hx * 10);
    var ly = Math.round(-hy * 6);
    var kk = Math.round(b * 10) + '|' + joy + '|' + lx + '|' + ly;
    if (kk !== lastKey) {
      lastKey = kk;
      drawFace(b, joy, lx, ly);
    }
  }

  var clock = new THREE.Clock();
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (paused || document.hidden) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    if (reduce) dt = 0.016;
    t += dt || 0.016;

    var k = Math.min((dt || 0.016) * 5, 1);
    hx += (mx - hx) * k;
    hy += (my - hy) * k;
    hw += ((hover ? 1 : 0) - hw) * Math.min((dt || 0.016) * 6, 1);

    var intro = Math.min(t / 1.1, 1);
    var s = intro < 1 ? back(intro) : 1;
    var r = react ? t - react.t0 : 99;
    var jy = 0;
    var sy = 1;
    var sz = 1;
    if (r < 0.75) {
      var p = Math.sin(r / 0.75 * Math.PI);
      jy = p * 1.0;
      sy = 1 + p * 0.08;
      sz = 1 - p * 0.04;
    } else if (r < 0.95) {
      sy = 1 - 0.1 * Math.sin((r - 0.75) / 0.2 * Math.PI);
      sz = 1 + 0.05 * Math.sin((r - 0.75) / 0.2 * Math.PI);
    }
    var hs = 1 + hw * 0.04;
    var bootHero = !!(canvas.closest && canvas.closest('#done-bot.is-boot-hero'));
    bot.position.y = Math.sin(t * 1.7) * (bootHero ? 0.04 : 0.09) + (bootHero ? 0 : jy);
    bot.scale.set(sz * s * hs, sy * s * hs, sz * s * hs);
    if (bootHero) {
      /* Loading ekranı: fırlanma/dönmə yox — sakit idle */
      bot.rotation.z = 0;
      spin.rotation.y = 0;
      head.rotation.y = Math.sin(t * 0.7) * 0.04;
      head.rotation.x = Math.sin(t * 1.1) * 0.02;
      head.rotation.z = 0;
      if (react && react.spin) react.spin = false;
    } else {
      /* Yüngül əyilmə — kursor istiqamətinə */
      bot.rotation.z = -cl(hx) * 0.08;
      spin.rotation.y = (react && react.spin && r < 1.1 ? ease(r / 1.1) * Math.PI * 2 : 0) + hx * 0.18;
      head.rotation.y = hx * 0.5;
      head.rotation.x = -hy * 0.3 + Math.sin(t * 1.3) * 0.03;
      head.rotation.z = Math.sin(t * 0.9) * 0.04 - hx * 0.05;
    }

    var wv = r < 2.2 ? Math.min(r * 5, 1) * Math.min((2.2 - r) * 5, 1) : 0;
    if (moodWave && t < happy) wv = Math.max(wv, 0.85);
    var ch = r < 0.75 ? Math.sin(r / 0.75 * Math.PI) : 0;
    var id = Math.sin(t * 1.7) * 0.05;
    var wr = Math.max(wv, ch);
    armR.rotation.z = (0.28 + id) * (1 - wr) + (2.45 + Math.sin(t * 13) * 0.22) * wr;
    armL.rotation.z = -(0.28 + id + hw * 0.2) * (1 - ch) - 2.5 * ch;

    var thinkPulse = moodThink ? 1.35 : 1;
    var pu = (0.85 + 0.2 * Math.sin(t * (3 + hw * 6))) * thinkPulse;
    glow.scale.set(pu, pu, 1);
    ball.scale.setScalar((0.9 + 0.1 * Math.sin(t * (3 + hw * 6))) * thinkPulse);
    fl.intensity = (0.5 + 0.2 * Math.sin(t * 2)) * (moodThink ? 1.4 : 1);
    shadow.scale.setScalar((1 - jy * 0.25) * s);
    shadow.material.opacity = 1 - jy * 0.35;

    var bl = 1;
    if (t > nb) {
      var bp = (t - nb) / 0.16;
      if (bp >= 1) nb = t + 2 + Math.random() * 3;
      else bl = 1 - Math.sin(bp * Math.PI);
    }
    drawIfNeeded(bl);
    R.render(S, cam);
  }

  addEventListener('pointermove', onPointerMove, { passive: true });
  var ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(function () { resize(); })
    : null;
  if (ro) ro.observe(canvas.parentElement || canvas);
  addEventListener('resize', resize, { passive: true });

  resize();
  drawFace(1, false, 0, 0);
  setTimeout(function () {
    if (disposed) return;
    react = { t0: t, spin: false };
    happy = t + 1.8;
  }, 900);
  loop();

  return {
    setMood: setMood,
    react: reactClick,
    resize: resize,
    setPaused: setPaused,
    dispose: dispose
  };
}
