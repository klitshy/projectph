/* Strip charts for x(t), v(t), a(t) with an axis handle for setting values and a scrubbable cursor. */
window.MM = window.MM || {};
(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace';
  const RANGES = {
    x: [2.5, 5, 10, 20, 50, 100],
    v: [2.5, 5, 10, 20, 50],
    a: [2.5, 5, 10, 25, 50, 100, 250]
  };
  const UNITS = { x: 'm', v: 'm/s', a: 'm/s²' };
  const KEYS = ['ink', 'muted', 'line', 'surface', 'surface-2', 'x', 'v', 'a', 'bg'];

  const fmtAxis = v => {
    if (Math.abs(v) < 1e-9) return '0';
    const s = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
    return (v < 0 ? '−' : '') + s;
  };

  class Chart {
    constructor(canvas, q) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.q = q;
      this.ranges = RANGES[q];
      this.zi = this.ranges.indexOf(10);
      this.hover = null;
      this.readColors();
      this.resize();
    }

    get range() { return this.ranges[this.zi]; }

    zoom(dir) {
      this.zi = clamp(this.zi + (dir === 'in' ? -1 : 1), 0, this.ranges.length - 1);
      return this.range;
    }

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      this.c = {};
      KEYS.forEach(k => { this.c[k] = cs.getPropertyValue('--' + k).trim() || '#888'; });
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.W = r.width; this.H = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.L = 48; this.R = 14; this.T = 14; this.B = 24;
      this.pw = this.W - this.L - this.R;
      this.ph = this.H - this.T - this.B;
      return true;
    }

    tToPx(t, maxT) { return this.L + (t / maxT) * this.pw; }
    pxToT(px, maxT) { return clamp((px - this.L) / this.pw, 0, 1) * maxT; }
    vToPy(v) { return this.T + (1 - (v + this.range) / (2 * this.range)) * this.ph; }
    pyToV(py) { return (1 - (py - this.T) / this.ph) * 2 * this.range - this.range; }

    /* Which part of the chart a pointer landed on. */
    hit(px, py) {
      if (px < this.L + 4) return 'handle';
      if (px <= this.W - this.R + 6 && py >= this.T - 6 && py <= this.H - this.B + 6) return 'plot';
      return null;
    }

    render(model, driving) {
      if (!this.W) return;
      const ctx = this.ctx, c = this.c, q = this.q, col = c[q];
      const maxT = model.MAX_T, L = this.L, T = this.T, pw = this.pw, ph = this.ph, R = this.range;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);

      // grid
      ctx.font = '500 10.5px ' + MONO;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (let k = -2; k <= 2; k++) {
        const v = (k / 2) * R, y = Math.round(this.vToPy(v)) + 0.5;
        ctx.strokeStyle = c.line;
        ctx.lineWidth = k === 0 ? 1.5 : 1;
        ctx.setLineDash(k === 0 ? [] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
        ctx.fillStyle = c.muted;
        ctx.fillText(fmtAxis(v), L - 16, y);
      }
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (let t = 0; t <= maxT; t += 2) {
        const x = Math.round(this.tToPx(t, maxT)) + 0.5;
        ctx.strokeStyle = c.line; ctx.lineWidth = 1;
        ctx.globalAlpha = t === 0 ? 1 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.muted;
        if (pw > 360 || t % 4 === 0) ctx.fillText(t === maxT ? t + ' s' : String(t), clamp(x, L + 4, this.W - 18), this.H - 7);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = c.muted;
      ctx.fillText(UNITS[q], L + pw - 4, T + 10);

      // data
      const data = q === 'x' ? model.X : q === 'v' ? model.V : model.A;
      const n = model.T.length;
      const cursorX = this.tToPx(model.time, maxT);
      if (n > 1) {
        const stride = Math.max(1, Math.floor(n / (pw * 1.5)));
        const path = new Path2D();
        let first = true;
        for (let i = 0; i < n; i += stride) {
          const x = this.tToPx(model.T[i], maxT), y = this.vToPy(clamp(data[i], -R * 3, R * 3));
          if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
        }
        const lastX = this.tToPx(model.T[n - 1], maxT);
        path.lineTo(lastX, this.vToPy(clamp(data[n - 1], -R * 3, R * 3)));
        const area = new Path2D(path);
        const zeroY = this.vToPy(0);
        area.lineTo(lastX, zeroY);
        area.lineTo(this.tToPx(model.T[0], maxT), zeroY);
        area.closePath();

        const segs = model.mode === 'playback'
          ? [[L, cursorX, 1], [cursorX, L + pw + 2, 0.32]]
          : [[L, L + pw + 2, 1]];
        segs.forEach(([x0, x1, alpha]) => {
          ctx.save();
          ctx.beginPath(); ctx.rect(x0, T - 2, Math.max(0, x1 - x0), ph + 4); ctx.clip();
          ctx.globalAlpha = 0.14 * alpha;
          ctx.fillStyle = col;
          ctx.fill(area);
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.25;
          ctx.lineJoin = 'round';
          ctx.stroke(path);
          ctx.restore();
        });
      }

      // value guide + axis handle
      const val = q === 'x' ? model.x : q === 'v' ? model.v : model.a;
      const inside = Math.abs(val) <= R;
      const hy = this.vToPy(clamp(val, -R, R));
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(L, hy); ctx.lineTo(Math.max(L, cursorX), hy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const hx = L - 6;
      ctx.fillStyle = c.surface;
      ctx.beginPath(); ctx.arc(hx, hy, driving ? 9 : 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      if (inside) {
        ctx.beginPath(); ctx.arc(hx, hy, driving ? 7 : 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c.surface;
        ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, Math.PI * 2); ctx.fill();
      } else {
        const s = val > 0 ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(hx - 6, hy - s * 3); ctx.lineTo(hx + 6, hy - s * 3); ctx.lineTo(hx, hy + s * 6); ctx.closePath(); ctx.fill();
      }

      // time cursor
      if (n > 0 || model.time > 0) {
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cursorX, T - 4); ctx.lineTo(cursorX, T + ph); ctx.stroke();
        ctx.fillStyle = c.ink;
        ctx.beginPath(); ctx.moveTo(cursorX - 5, T - 9); ctx.lineTo(cursorX + 5, T - 9); ctx.lineTo(cursorX, T - 3); ctx.closePath(); ctx.fill();
        if (inside) {
          ctx.fillStyle = c.surface; ctx.beginPath(); ctx.arc(cursorX, hy, 5.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cursorX, hy, 3.8, 0, Math.PI * 2); ctx.fill();
        }
      }

      // hover readout
      if (this.hover && n > 1) {
        const ht = this.pxToT(this.hover.x, maxT);
        if (ht <= model.duration + 1e-6) {
          const s = model.sampleAt(ht);
          const hv = s[q];
          const x = this.tToPx(ht, maxT), y = this.vToPy(clamp(hv, -R, R));
          ctx.strokeStyle = c.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
          const text = 't ' + ht.toFixed(2) + ' s   ' + (hv < 0 ? '−' : '') + Math.abs(hv).toFixed(2) + ' ' + UNITS[q];
          ctx.font = '600 11px ' + MONO;
          const tw = ctx.measureText(text).width + 16;
          const bx = clamp(x + 10, L, this.W - this.R - tw), by = y < T + 30 ? y + 10 : y - 30;
          ctx.fillStyle = c.ink;
          MM.draw.roundRect(ctx, bx, by, tw, 22, 7); ctx.fill();
          ctx.fillStyle = c.bg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(text, bx + 8, by + 11.5);
        }
      }
    }
  }

  MM.Chart = Chart;
})();
