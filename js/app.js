/* App wiring: controls, pointer input, popovers, preferences and the animation loop. */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const Q = ['x', 'v', 'a'];
  const PREF_KEY = 'moving-man-lab:prefs';

  const app = $('#app');
  const model = new MM.Model();
  const scene = new MM.Scene($('#scene'));
  const charts = { x: new MM.Chart($('#chart-x'), 'x'), v: new MM.Chart($('#chart-v'), 'v'), a: new MM.Chart($('#chart-a'), 'a') };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const state = {
    tab: 'intro', showV: false, showA: false, trail: false, invert: false,
    sound: true, speed: 1, theme: null, hinted: false
  };
  let drag = null;          // {kind: 'man'|'handle'|'scrub', ...}
  let activeSlider = null;  // quantity whose slider the pointer holds

  /* ---------- helpers ---------- */
  const fmt = v => (v <= -0.005 ? '−' : '') + (Math.abs(v) < 0.005 ? '0.00' : Math.abs(v).toFixed(2));
  const parseNum = s => parseFloat(String(s).replace(/[−–]/g, '-').replace(',', '.').replace(/[^0-9eE+\-.]/g, ''));
  const local = (e, el) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const isDark = () => state.theme ? state.theme === 'dark' : darkQuery.matches;
  const driverQ = () => (model.driver === 'expr' ? 'x' : model.driver);
  const inputLimit = q => (q === 'x' ? (model.walls ? 10 : 100) : 100);

  function savePrefs() {
    try {
      const { showV, showA, trail, invert, sound, speed, theme, tab } = state;
      localStorage.setItem(PREF_KEY, JSON.stringify({ showV, showA, trail, invert, sound, speed, theme, tab, walls: model.walls }));
    } catch (e) { /* storage unavailable */ }
  }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (p) {
        Object.assign(state, {
          showV: !!p.showV, showA: !!p.showA, trail: !!p.trail, invert: !!p.invert,
          sound: p.sound !== false, speed: [0.25, 0.5, 1, 2].includes(p.speed) ? p.speed : 1,
          theme: p.theme === 'dark' || p.theme === 'light' ? p.theme : null,
          tab: p.tab === 'charts' ? 'charts' : 'intro'
        });
        model.walls = p.walls !== false;
      }
    } catch (e) { /* storage unavailable */ }
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(text, actionLabel, action, ms) {
    const el = $('#toast'), btn = $('#toast-action');
    $('#toast-text').textContent = text;
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || '';
    btn.onclick = () => { el.hidden = true; if (action) action(); };
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || (actionLabel ? 6000 : 3200));
  }
  const toastFull = () => toast('The recording is full at 20 s.', 'Clear and record again', () => model.clear());

  function hideHint() {
    if (state.hinted) return;
    state.hinted = true;
    $('#drag-hint').classList.add('gone');
  }

  /* Gate for any user change to x, v or a. Switches playback to record, and can start the clock. */
  function beginInteract(autoPlay) {
    MM.Sound.unlock();
    hideHint();
    if (model.mode === 'playback') model.setMode('record');
    if (autoPlay && !model.playing) {
      if (model.full) { toastFull(); return false; }
      model.play();
    }
    return true;
  }

  /* ---------- model events ---------- */
  model.on('crash', d => { scene.crash(d.side, d.speed); MM.Sound.crash(d.speed); });
  model.on('full', () => toastFull());
  model.on('nodata', () => toast('Record some motion first, then play it back.'));
  model.on('truncated', () => toast('Recording again from ' + model.time.toFixed(2) + ' s. Data after that point was removed.'));

  /* ---------- sliders ---------- */
  $$('.js-slider').forEach(sl => {
    const q = sl.dataset.q;
    sl.addEventListener('pointerdown', () => { activeSlider = q; });
    sl.addEventListener('input', () => {
      if (!beginInteract(true)) { activeSlider = null; return; }
      model.setValue(q, parseFloat(sl.value));
    });
  });
  window.addEventListener('pointerup', () => { activeSlider = null; });

  /* ---------- editable readouts ---------- */
  $$('.js-num').forEach(inp => {
    const q = inp.dataset.q;
    let before = '';
    inp.addEventListener('focus', () => { before = inp.value; setTimeout(() => inp.select(), 0); });
    const commit = () => {
      const val = parseNum(inp.value);
      if (inp.value === before) return;
      if (!Number.isFinite(val)) { inp.value = before; return; }
      if (!beginInteract(false)) return;
      const lim = inputLimit(q);
      model.setValue(q, clamp(val, -lim, lim));
      before = inp.value;
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { commit(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = before; inp.blur(); }
    });
    inp.addEventListener('blur', commit);
  });

  /* ---------- toggles ---------- */
  function syncToggles() {
    $$('.js-vec').forEach(cb => { cb.checked = cb.dataset.q === 'v' ? state.showV : state.showA; });
    $$('.js-trail').forEach(cb => { cb.checked = state.trail; });
    $('#opt-walls').checked = model.walls;
    $('#opt-sound').checked = state.sound;
    $('#opt-invert').checked = state.invert;
    app.classList.toggle('inverted', state.invert);
    MM.Sound.enabled = state.sound;
    $$('#speed-seg .seg-btn').forEach(b => b.setAttribute('aria-pressed', String(parseFloat(b.dataset.speed) === state.speed)));
  }
  $$('.js-vec').forEach(cb => cb.addEventListener('change', () => {
    if (cb.dataset.q === 'v') state.showV = cb.checked; else state.showA = cb.checked;
    syncToggles(); savePrefs();
  }));
  $$('.js-trail').forEach(cb => cb.addEventListener('change', () => { state.trail = cb.checked; syncToggles(); savePrefs(); }));
  $('#opt-walls').addEventListener('change', e => { model.setWalls(e.target.checked); savePrefs(); });
  $('#opt-sound').addEventListener('change', e => { state.sound = e.target.checked; syncToggles(); if (state.sound) MM.Sound.unlock(); savePrefs(); });
  $('#opt-invert').addEventListener('change', e => { state.invert = e.target.checked; syncToggles(); savePrefs(); });
  $$('#speed-seg .seg-btn').forEach(b => b.addEventListener('click', () => { state.speed = parseFloat(b.dataset.speed); syncToggles(); savePrefs(); }));

  /* ---------- tabs ---------- */
  function setTab(tab) {
    state.tab = tab;
    app.dataset.tab = tab;
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $('#panel-intro').hidden = tab !== 'intro';
    $('#panel-charts').hidden = tab !== 'charts';
    requestAnimationFrame(() => Q.forEach(q => charts[q].resize()));
    savePrefs();
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

  /* ---------- theme ---------- */
  function applyTheme() {
    if (state.theme) document.documentElement.setAttribute('data-theme', state.theme);
    else document.documentElement.removeAttribute('data-theme');
    const dark = isDark();
    $('#btn-theme').dataset.eff = dark ? 'dark' : 'light';
    scene.setTheme(dark);
    Q.forEach(q => charts[q].readColors());
  }
  $('#btn-theme').addEventListener('click', () => { state.theme = isDark() ? 'light' : 'dark'; applyTheme(); savePrefs(); });
  darkQuery.addEventListener('change', () => { if (!state.theme) applyTheme(); });

  /* ---------- popovers ---------- */
  const pops = [['#btn-options', '#pop-options'], ['#btn-expr', '#pop-expr']];
  function closePops() { pops.forEach(([b, p]) => { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); }); }
  pops.forEach(([b, p]) => $(b).addEventListener('click', () => {
    const open = $(p).hidden;
    closePops();
    if (open) {
      $(p).hidden = false;
      $(b).setAttribute('aria-expanded', 'true');
      if (p === '#pop-expr') { validateExpr(); setTimeout(() => $('#expr-input').focus(), 30); }
    }
  }));
  document.addEventListener('pointerdown', e => {
    if (pops.some(([b, p]) => $(p).contains(e.target) || $(b).contains(e.target))) return;
    closePops();
  });

  /* ---------- formula ---------- */
  function validateExpr() {
    const res = MM.Expr.compile($('#expr-input').value);
    const msg = $('#expr-msg');
    msg.classList.toggle('err', !!res.error);
    msg.textContent = res.error || 'Starts at x(0) = ' + fmt(res.fn(0)) + ' m' + (model.walls ? '. Walls stop the man at ±10 m.' : '.');
    return res;
  }
  $('#expr-input').addEventListener('input', validateExpr);
  $$('#expr-presets .chip').forEach(ch => ch.addEventListener('click', () => { $('#expr-input').value = ch.dataset.expr; validateExpr(); }));
  $('#expr-form').addEventListener('submit', e => {
    e.preventDefault();
    const res = validateExpr();
    if (res.error) return;
    hideHint();
    if (model.mode === 'playback') model.setMode('record');
    if (model.full) model.clear();
    model.setExpr(res.fn, $('#expr-input').value.trim());
    closePops();
    toast('Press play to record the formula.', 'Play now', () => { MM.Sound.unlock(); model.play(); });
  });
  $('#expr-stop').addEventListener('click', () => { model.clearExpr(); closePops(); });

  /* ---------- transport ---------- */
  function togglePlay() {
    MM.Sound.unlock();
    hideHint();
    if (model.playing) { model.pause(); return; }
    if (model.mode === 'record' && model.full) { toastFull(); return; }
    model.play();
  }
  $('#btn-play').addEventListener('click', togglePlay);
  $('#mode-record').addEventListener('click', () => model.setMode('record'));
  $('#mode-playback').addEventListener('click', () => model.setMode('playback'));
  $('#btn-rewind').addEventListener('click', () => model.rewind());
  $('#btn-stepback').addEventListener('click', () => model.stepBack());
  $('#btn-step').addEventListener('click', () => { hideHint(); model.stepForward(); });
  $('#btn-clear').addEventListener('click', () => { model.clear(); toast('Recording cleared.'); });
  $('#btn-return').addEventListener('click', () => model.returnMan());
  $('#scrub').addEventListener('input', e => {
    if (!model.hasData) { e.target.value = 0; return; }
    model.pause();
    model.seek(parseFloat(e.target.value));
  });
  $('#btn-reset').addEventListener('click', () => {
    model.resetAll();
    model.setWalls(true);
    Object.assign(state, { showV: false, showA: false, trail: false, invert: false, speed: 1 });
    Q.forEach(q => { charts[q].zi = charts[q].ranges.indexOf(10); });
    $$('.chart-row').forEach(r => setCollapsed(r, false));
    syncToggles(); savePrefs();
    toast('Everything is back to the start.');
  });

  /* ---------- dragging the man ---------- */
  const sceneCanvas = $('#scene');
  sceneCanvas.addEventListener('pointerdown', e => {
    const p = local(e, sceneCanvas);
    if (!scene.hitMan(p.x, p.y, model.x)) return;
    if (!beginInteract(true)) return;
    e.preventDefault();
    sceneCanvas.setPointerCapture(e.pointerId);
    drag = { kind: 'man', offset: p.x - scene.xToPx(model.x) };
    sceneCanvas.classList.add('grabbing');
    model.setValue('x', scene.pxToX(p.x - drag.offset));
  });
  sceneCanvas.addEventListener('pointermove', e => {
    const p = local(e, sceneCanvas);
    if (drag && drag.kind === 'man') {
      model.setValue('x', scene.pxToX(p.x - drag.offset));
    } else {
      sceneCanvas.style.cursor = scene.hitMan(p.x, p.y, model.x) ? 'grab' : 'default';
    }
  });
  const endManDrag = () => { if (drag && drag.kind === 'man') drag = null; sceneCanvas.classList.remove('grabbing'); };
  sceneCanvas.addEventListener('pointerup', endManDrag);
  sceneCanvas.addEventListener('pointercancel', endManDrag);

  /* ---------- charts: axis handle + scrubbing ---------- */
  function setCollapsed(row, collapsed) {
    row.classList.toggle('collapsed', collapsed);
    const btn = row.querySelector('.collapse');
    btn.setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed) requestAnimationFrame(() => charts[row.dataset.q].resize());
  }
  $$('.collapse').forEach(b => b.addEventListener('click', () => {
    const row = b.closest('.chart-row');
    setCollapsed(row, !row.classList.contains('collapsed'));
  }));
  $$('.zoom-btn').forEach(b => b.addEventListener('click', () => charts[b.dataset.q].zoom(b.dataset.zoom)));

  Q.forEach(q => {
    const ch = charts[q], cv = ch.canvas;
    const zone = document.createElement('div');
    zone.className = 'handle-zone';
    zone.setAttribute('aria-hidden', 'true');
    cv.parentElement.appendChild(zone);

    const setFromHandle = y => model.setValue(q, clamp(ch.pyToV(y), -ch.range, ch.range));
    const startHandle = e => {
      if (!beginInteract(true)) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag = { kind: 'handle', q };
      setFromHandle(local(e, cv).y);
    };
    zone.addEventListener('pointerdown', startHandle);
    zone.addEventListener('pointermove', e => { if (drag && drag.kind === 'handle' && drag.q === q) setFromHandle(local(e, cv).y); });

    cv.addEventListener('pointerdown', e => {
      const p = local(e, cv);
      const part = ch.hit(p.x, p.y);
      if (part === 'handle') { startHandle(e); return; }
      if (part !== 'plot' || !model.hasData) return;
      cv.setPointerCapture(e.pointerId);
      model.pause();
      drag = { kind: 'scrub', q };
      model.seek(ch.pxToT(p.x, model.MAX_T));
    });
    cv.addEventListener('pointermove', e => {
      const p = local(e, cv);
      if (drag && drag.q === q) {
        if (drag.kind === 'scrub') model.seek(ch.pxToT(p.x, model.MAX_T));
        else if (drag.kind === 'handle') setFromHandle(p.y);
        ch.hover = null;
        return;
      }
      const part = ch.hit(p.x, p.y);
      ch.hover = part === 'plot' && e.pointerType === 'mouse' ? p : null;
      cv.style.cursor = part === 'handle' ? 'ns-resize' : part === 'plot' && model.hasData ? 'ew-resize' : 'default';
    });
    cv.addEventListener('pointerleave', () => { ch.hover = null; });
    [cv, zone].forEach(el => {
      el.addEventListener('pointerup', () => { drag = null; });
      el.addEventListener('pointercancel', () => { drag = null; });
    });
  });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePops(); return; }
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === ' ' && !(t.closest && t.closest('button'))) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); model.stepForward(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); model.stepBack(); }
    else if (e.key === 'Home') { e.preventDefault(); model.rewind(); }
  });

  /* ---------- resizing ---------- */
  const ro = new ResizeObserver(entries => entries.forEach(en => {
    if (en.target.id === 'stage') scene.resize();
    else { const q = en.target.closest('.chart-row').dataset.q; charts[q].resize(); }
  }));
  ro.observe($('#stage'));
  $$('.chart-box').forEach(b => ro.observe(b));

  /* ---------- UI sync, once per frame ---------- */
  const cache = {};
  const setText = (el, key, text) => { if (cache[key] !== text) { cache[key] = text; el.textContent = text; } };
  const setAttr = (el, key, name, val) => { if (cache[key] !== val) { cache[key] = val; el.setAttribute(name, val); } };

  function syncUI() {
    const vals = { x: model.x, v: model.v, a: model.a };
    const dq = driverQ();
    Q.forEach(q => {
      const s = fmt(vals[q]);
      $$('.js-num[data-q="' + q + '"]').forEach(inp => {
        if (document.activeElement !== inp && inp.value !== s) inp.value = s;
      });
      const sl = $('#slider-' + q);
      if (activeSlider !== q) {
        const v = clamp(vals[q], -10, 10);
        if (Math.abs(parseFloat(sl.value) - v) > 1e-6) sl.value = v;
      }
      const pos = (clamp(parseFloat(sl.value), -10, 10) + 10) / 20 * 100;
      let lo = Math.min(pos, 50), hi = Math.max(pos, 50);
      if (state.invert) { const l = 100 - hi; hi = 100 - lo; lo = l; }
      const fill = lo.toFixed(2) + '|' + hi.toFixed(2);
      if (cache['fill' + q] !== fill) {
        cache['fill' + q] = fill;
        sl.style.setProperty('--lo', lo + '%');
        sl.style.setProperty('--hi', hi + '%');
      }
      const driving = dq === q;
      if (cache['drv' + q] !== driving) {
        cache['drv' + q] = driving;
        $('#gauge-' + q).classList.toggle('is-driving', driving);
        $('#row-' + q).classList.toggle('is-driving', driving);
      }
    });

    app.classList.toggle('playing', model.playing);
    if (app.dataset.mode !== model.mode) app.dataset.mode = model.mode;
    setAttr($('#mode-record'), 'mr', 'aria-checked', String(model.mode === 'record'));
    setAttr($('#mode-playback'), 'mp', 'aria-checked', String(model.mode === 'playback'));
    setAttr($('#btn-play'), 'pl', 'aria-label', model.playing ? 'Pause' : model.mode === 'record' ? 'Record' : 'Play');
    $('#btn-rewind').disabled = $('#btn-stepback').disabled = !model.hasData;

    setText($('#time-now'), 'time', model.time.toFixed(2));
    const scrub = $('#scrub');
    if (document.activeElement !== scrub || !model.playing) scrub.value = model.time;
    const posPct = (model.time / model.MAX_T * 100).toFixed(2) + '%', recPct = (model.duration / model.MAX_T * 100).toFixed(2) + '%';
    if (cache.pos !== posPct) { cache.pos = posPct; scrub.style.setProperty('--pos', posPct); }
    if (cache.rec !== recPct) { cache.rec = recPct; scrub.style.setProperty('--rec', recPct); }

    const chip = $('#hud-mode');
    let label, cls;
    if (model.mode === 'record') {
      label = model.playing ? 'Recording' : model.full ? 'Recording full' : model.T.length ? 'Paused' : 'Ready to record';
      cls = model.playing ? 'live' : '';
    } else {
      label = model.playing ? 'Playing back' : 'Playback paused';
      cls = 'play';
    }
    setText($('#hud-mode-text'), 'hud', label);
    if (cache.hudCls !== cls) { cache.hudCls = cls; chip.className = 'hud-chip ' + cls; }
    const exprOn = model.driver === 'expr';
    const exprChip = $('#hud-expr');
    exprChip.hidden = !exprOn;
    if (exprOn) setText(exprChip, 'expr', 'x(t) = ' + model.exprSrc);
    $('#btn-return').hidden = !scene.offscreen;
  }

  /* ---------- trail (one mark every 0.5 s up to now) ---------- */
  function trailMarks() {
    if (!state.trail || model.T.length < 2) return null;
    const out = [], end = Math.min(model.time, model.duration) + 1e-9;
    for (let k = 0; k * 0.5 <= end; k++) out.push({ t: k * 0.5, x: model.sampleAt(k * 0.5).x });
    return out;
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (model.playing) model.advance(dt * state.speed);
    const stepped = scene.render({
      x: model.x, v: model.v, a: model.a, walls: model.walls, invert: state.invert,
      showV: state.showV, showA: state.showA, trail: trailMarks(), reduced: reduceMotion.matches
    }, dt);
    if (stepped && model.playing) MM.Sound.step(Math.min(1, Math.abs(model.v) / 4));
    if (state.tab === 'charts') Q.forEach(q => { if (!$('#row-' + q).classList.contains('collapsed')) charts[q].render(model, driverQ() === q); });
    syncUI();
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  function start(data) {
    loadPrefs();
    if (data && data.model) { model.restore(data.model); if (model.T.length) hideHint(); }
    if (data && data.state) Object.assign(state, data.state);
    if (location.hash === '#charts' || location.hash === '#intro') state.tab = location.hash.slice(1);
    applyTheme();
    syncToggles();
    setTab(state.tab);
    requestAnimationFrame(frame);
  }
  MM.app = { model, scene, charts, state };
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try { hot.snapshot(() => ({ model: model.snapshot(), state: { tab: state.tab, hinted: state.hinted } })); } catch (e) { /* not supported */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
