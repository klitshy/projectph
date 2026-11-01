/* Simulation model: kinematics, wall collisions and the 20-second recording. */
window.MM = window.MM || {};
(function () {
  const MAX_T = 20;      // seconds of recording
  const LIMIT = 10;      // walls at ±10 m
  const SUB = 1 / 120;   // max physics sub-step
  const STEP = 1 / 30;   // one press of the step button

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  class Model {
    constructor() {
      this.listeners = {};
      this.walls = true;
      this.resetAll();
    }

    on(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    emit(type, data) { (this.listeners[type] || []).forEach(fn => fn(data)); }

    get MAX_T() { return MAX_T; }
    get LIMIT() { return LIMIT; }
    get duration() { return this.T.length ? this.T[this.T.length - 1] : 0; }
    get full() { return this.T.length > 0 && this.duration >= MAX_T - 1e-9; }
    get hasData() { return this.T.length > 1; }

    resetAll() {
      this.x = 0; this.v = 0; this.a = 0;
      this.inX = 0; this.inV = 0; this.inA = 0;
      this.driver = 'x';
      this.expr = null; this.exprSrc = '';
      this.clear();
    }

    clear() {
      this.T = []; this.X = []; this.V = []; this.A = [];
      this.time = 0; this.mode = 'record'; this.playing = false;
      if (this.driver === 'expr') this.previewExpr();
      this.emit('change');
    }

    pushSample() {
      this.T.push(this.time); this.X.push(this.x); this.V.push(this.v); this.A.push(this.a);
    }

    /* Least-squares slope of Y over the recent time window, including the new point. */
    slope(Y, yNew, tNew, win) {
      let n = 1, st = 0, sy = yNew, stt = 0, sty = 0;
      for (let i = this.T.length - 1; i >= 0; i--) {
        const dt = this.T[i] - tNew;
        if (i < this.T.length - 1 && -dt > win) break;
        n++; st += dt; sy += Y[i]; stt += dt * dt; sty += dt * Y[i];
      }
      if (n < 2) return 0;
      const d = n * stt - st * st;
      return Math.abs(d) < 1e-14 ? 0 : (n * sty - st * sy) / d;
    }

    hitWall() {
      if (!this.walls || Math.abs(this.x) <= LIMIT) return;
      const side = Math.sign(this.x), impact = Math.abs(this.v);
      this.x = side * LIMIT;
      this.v = 0;
      if (this.driver === 'v') this.inV = 0;
      if (this.driver === 'a') { this.inA = 0; this.a = 0; }
      this.emit('crash', { side, speed: impact });
    }

    exprState(t) {
      const f = this.expr, h = 1e-3;
      let x = f(t);
      let v = (f(t + h) - f(t - h)) / (2 * h);
      let a = (f(t + h) - 2 * x + f(t - h)) / (h * h);
      if (this.walls && Math.abs(x) > LIMIT) { x = Math.sign(x) * LIMIT; v = 0; a = 0; }
      return { x, v, a };
    }

    previewExpr() {
      if (!this.expr) return;
      const s = this.exprState(this.time);
      this.x = s.x; this.v = s.v; this.a = s.a; this.inX = s.x;
    }

    /* One physics sub-step while recording. Returns false when the recording is full. */
    integrate(h) {
      if (this.time + h > MAX_T) h = MAX_T - this.time;
      if (h <= 1e-9) return false;
      const t = this.time + h;
      switch (this.driver) {
        case 'x': {
          this.x = this.walls ? clamp(this.inX, -LIMIT, LIMIT) : this.inX;
          this.v = this.slope(this.X, this.x, t, 0.1);
          this.a = this.slope(this.V, this.v, t, 0.12);
          break;
        }
        case 'expr': {
          const s = this.exprState(t);
          this.x = s.x; this.v = s.v; this.a = s.a; this.inX = s.x;
          break;
        }
        case 'v': {
          this.v = this.inV;
          this.x += this.v * h;
          this.hitWall();
          this.a = this.slope(this.V, this.v, t, 0.1);
          break;
        }
        case 'a': {
          this.a = this.inA;
          this.v += this.a * h;
          this.x += this.v * h;
          this.hitWall();
          break;
        }
      }
      this.time = t;
      this.pushSample();
      return this.time < MAX_T - 1e-9;
    }

    recordFor(dt) {
      let remaining = dt;
      while (remaining > 1e-9) {
        const h = Math.min(remaining, SUB);
        remaining -= h;
        if (!this.integrate(h)) {
          this.playing = false;
          this.emit('full');
          this.emit('change');
          return false;
        }
      }
      return true;
    }

    /* Called every animation frame with simulated seconds (real dt × speed). */
    advance(dt) {
      if (!this.playing || dt <= 0) return;
      if (this.mode === 'record') this.recordFor(dt);
      else {
        this.time = Math.min(this.time + dt, this.duration);
        this.applyAt(this.time);
        if (this.time >= this.duration - 1e-9) {
          this.playing = false;
          this.emit('end');
          this.emit('change');
        }
      }
    }

    indexAt(t) {
      const T = this.T;
      let lo = 0, hi = T.length - 1;
      if (t <= T[0]) return 0;
      if (t >= T[hi]) return hi;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (T[mid] <= t) lo = mid; else hi = mid;
      }
      return lo;
    }

    sampleAt(t) {
      const T = this.T;
      if (!T.length) return null;
      const i = this.indexAt(t);
      if (i >= T.length - 1 || t <= T[0]) return { x: this.X[i], v: this.V[i], a: this.A[i] };
      const f = (t - T[i]) / (T[i + 1] - T[i] || 1);
      const lerp = arr => arr[i] + (arr[i + 1] - arr[i]) * f;
      return { x: lerp(this.X), v: lerp(this.V), a: lerp(this.A) };
    }

    applyAt(t) {
      const s = this.sampleAt(t);
      if (s) { this.x = s.x; this.v = s.v; this.a = s.a; }
    }

    play() {
      if (this.mode === 'record') {
        if (this.full) { this.emit('full'); return false; }
        if (!this.T.length) {
          this.time = 0;
          if (this.driver === 'expr') this.previewExpr();
          this.pushSample();
        }
      } else {
        if (!this.hasData) return false;
        if (this.time >= this.duration - 1e-6) { this.time = 0; this.applyAt(0); }
      }
      this.playing = true;
      this.emit('change');
      return true;
    }

    pause() {
      if (!this.playing) return;
      this.playing = false;
      this.emit('change');
    }

    /* Drop everything recorded after the current time so recording can resume from here. */
    truncate() {
      if (!this.T.length) return 0;
      let i = this.indexAt(this.time);
      if (this.T[i] > this.time + 1e-9) i = Math.max(0, i - 1);
      const removed = this.duration - this.T[i];
      this.T.length = this.X.length = this.V.length = this.A.length = i + 1;
      this.time = this.T[i];
      this.x = this.X[i]; this.v = this.V[i]; this.a = this.A[i];
      this.inX = this.x; this.inV = this.v; this.inA = this.a;
      return removed;
    }

    setMode(mode) {
      if (mode === this.mode) return true;
      if (mode === 'playback' && !this.hasData) { this.emit('nodata'); return false; }
      this.playing = false;
      this.mode = mode;
      let removed = 0;
      if (mode === 'record') removed = this.truncate();
      else this.applyAt(this.time);
      this.emit('change');
      if (removed > 0.05) this.emit('truncated', removed);
      return true;
    }

    seek(t) {
      if (!this.hasData) return;
      if (this.mode === 'record') { this.mode = 'playback'; this.playing = false; }
      this.time = clamp(t, 0, this.duration);
      this.applyAt(this.time);
      this.emit('change');
    }

    rewind() {
      if (!this.hasData) return;
      this.playing = false;
      this.mode = 'playback';
      this.time = 0;
      this.applyAt(0);
      this.emit('change');
    }

    stepForward() {
      this.playing = false;
      if (this.mode === 'record') {
        if (this.full) { this.emit('full'); return; }
        if (!this.T.length) { this.time = 0; if (this.driver === 'expr') this.previewExpr(); this.pushSample(); }
        if (!this.recordFor(STEP)) return;
      } else {
        this.time = Math.min(this.time + STEP, this.duration);
        this.applyAt(this.time);
      }
      this.emit('change');
    }

    stepBack() {
      if (!this.hasData) return;
      this.playing = false;
      this.mode = 'playback';
      this.time = Math.max(0, this.time - STEP);
      this.applyAt(this.time);
      this.emit('change');
    }

    /* A user sets one quantity; that quantity becomes the driver. */
    setValue(q, val) {
      if (!Number.isFinite(val)) return;
      if (this.driver === 'expr') this.expr = null;
      if (q === 'x') {
        this.driver = 'x';
        this.inX = this.walls ? clamp(val, -LIMIT, LIMIT) : val;
        if (!this.playing) { this.x = this.inX; this.v = 0; this.a = 0; }
      } else if (q === 'v') {
        this.driver = 'v';
        this.inV = val;
        if (!this.playing) this.v = val;
      } else if (q === 'a') {
        this.driver = 'a';
        this.inA = val;
        if (!this.playing) this.a = val;
      }
      this.emit('change');
    }

    setExpr(fn, src) {
      this.expr = fn; this.exprSrc = src; this.driver = 'expr';
      if (!this.playing && this.mode === 'record') this.previewExpr();
      this.emit('change');
    }

    clearExpr() {
      if (this.driver !== 'expr') return;
      this.expr = null; this.driver = 'x'; this.inX = this.x;
      this.emit('change');
    }

    setWalls(on) {
      this.walls = on;
      if (on && this.mode === 'record' && Math.abs(this.x) > LIMIT) {
        this.x = Math.sign(this.x) * LIMIT; this.inX = this.x; this.v = 0; this.inV = 0;
      }
      this.emit('change');
    }

    returnMan() {
      this.playing = false;
      if (this.mode === 'playback') this.setMode('record');
      if (this.driver === 'expr') this.expr = null;
      this.driver = 'x';
      this.x = this.v = this.a = 0;
      this.inX = this.inV = this.inA = 0;
      this.emit('change');
    }

    snapshot() {
      return {
        T: this.T.slice(), X: this.X.slice(), V: this.V.slice(), A: this.A.slice(),
        time: this.time, mode: this.mode, x: this.x, v: this.v, a: this.a,
        inX: this.inX, inV: this.inV, inA: this.inA,
        driver: this.driver === 'expr' ? 'x' : this.driver, walls: this.walls
      };
    }

    restore(s) {
      if (!s || !Array.isArray(s.T)) return;
      Object.assign(this, {
        T: s.T, X: s.X, V: s.V, A: s.A, time: s.time || 0, mode: s.mode === 'playback' ? 'playback' : 'record',
        x: s.x || 0, v: s.v || 0, a: s.a || 0, inX: s.inX || 0, inV: s.inV || 0, inA: s.inA || 0,
        driver: s.driver || 'x', walls: s.walls !== false, playing: false
      });
      this.emit('change');
    }
  }

  MM.Model = Model;
})();
