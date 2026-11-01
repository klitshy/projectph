/* Canvas scene: sky, street, ruler, walls, the man, vectors and effects. */
window.MM = window.MM || {};
(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const { circle, roundRect } = MM.draw;
  const KEYS = ['sky-top', 'sky-bottom', 'sun', 'cloud', 'star', 'hill-far', 'hill-near', 'grass', 'grass-dark',
    'walk', 'walk-line', 'curb', 'ruler-bg', 'ruler-ink', 'ruler-dim', 'brick', 'brick-dark', 'mortar',
    'house-wall', 'house-roof', 'house-trim', 'window', 'door', 'leaf', 'leaf-2', 'trunk', 'shadow-ground',
    'x', 'v', 'a', 'ink', 'surface', 'bg'];
  const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace';

  class Scene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.man = new MM.Man();
      this.particles = [];
      this.rings = [];
      this.shake = 0;
      this.invert = false;
      this.night = false;
      this.offscreen = 0;
      this.lastPx = null;
      this.time = 0;
      this.clouds = [
        { x: 0.12, y: 0.16, s: 1.0, v: 6 }, { x: 0.46, y: 0.09, s: 0.7, v: 4 },
        { x: 0.7, y: 0.22, s: 0.85, v: 8 }, { x: 0.93, y: 0.12, s: 0.6, v: 5 }
      ];
      this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.62, r: 0.4 + Math.random() * 1.1, p: Math.random() * 6 }));
      this.readColors();
      this.resize();
    }

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      this.c = {};
      KEYS.forEach(k => { this.c[k] = cs.getPropertyValue('--' + k).trim() || '#888'; });
    }

    setTheme(night) { this.night = night; this.readColors(); }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      const W = this.W, H = this.H;
      this.rulerH = H < 250 ? 30 : 36;
      this.rulerTop = H - this.rulerH;
      this.walkBot = this.rulerTop;
      this.walkTop = this.rulerTop - Math.max(34, H * 0.15);
      this.feetY = this.walkTop + (this.walkBot - this.walkTop) * 0.64;
      this.horizon = this.walkTop - Math.max(16, H * 0.09);
      this.manH = clamp(H * 0.42, 80, 175);
      this.manHalf = this.manH * 0.12;
      this.wallW = clamp(W * 0.018, 12, 22);
      this.ppm = Math.max(4, (W / 2 - this.manHalf - this.wallW - 8) / 10);
    }

    xToPx(m) { return this.W / 2 + (this.invert ? -m : m) * this.ppm; }
    pxToX(px) { const m = (px - this.W / 2) / this.ppm; return this.invert ? -m : m; }

    hitMan(px, py, x) {
      const mx = this.xToPx(x);
      return Math.abs(px - mx) < Math.max(26, this.manHalf * 1.7) &&
        py > this.feetY - this.manH - 12 && py < this.feetY + 16;
    }

    crash(side, speed) {
      const edge = this.xToPx(side * 10);
      const s = Math.sign(edge - this.W / 2) || 1;
      const x = edge + s * this.manHalf, y = this.feetY - this.manH * 0.55;
      const n = 10 + Math.round(Math.min(14, speed * 2));
      for (let i = 0; i < n; i++) {
        const ang = (Math.random() - 0.5) * 2.2;
        const sp = 90 + Math.random() * 160 * (0.5 + Math.min(1, speed / 6));
        this.particles.push({
          x, y: y + (Math.random() - 0.5) * this.manH * 0.5,
          vx: -s * Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80,
          life: 0.7, max: 0.7, size: 2.5 + Math.random() * 3.5,
          color: Math.random() < 0.5 ? this.c.brick : this.c.mortar
        });
      }
      this.rings.push({ x, y, r: 6, life: 0.45 });
      this.shake = Math.min(9, 2 + speed * 0.9);
      this.man.bump = Math.min(1, 0.45 + speed / 8);
    }

    /* s: {x, v, a, walls, invert, showV, showA, trail, reduced}. Returns true on a footstep. */
    render(s, dt) {
      const ctx = this.ctx, W = this.W, H = this.H;
      this.invert = s.invert;
      this.time += dt;
      const px = this.xToPx(s.x);
      const dx = this.lastPx == null ? 0 : px - this.lastPx;
      this.lastPx = px;
      const dir = s.invert ? -1 : 1;
      const stepped = this.man.update(dt, clamp(dx, -30, 30), s.v * dir, s.a * dir, this.manH);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (this.shake > 0.05 && !s.reduced) {
        ctx.translate((Math.random() - 0.5) * 2 * this.shake, (Math.random() - 0.5) * this.shake);
      }
      this.shake *= Math.exp(-dt * 10);

      this.drawSky(dt, s.reduced);
      this.drawHills();
      this.drawHouse(this.xToPx(-7), this.walkTop, Math.min(clamp(this.ppm * 4, 62, 170), (this.walkTop - 14) / 1.05));
      this.drawTree(this.xToPx(7), this.walkTop, Math.min(clamp(this.ppm * 3.3, 54, 140), (this.walkTop - 10) / 1.42));
      this.drawSidewalk();
      if (s.walls) this.drawWalls();
      if (s.trail && s.trail.length) this.drawTrail(s.trail);

      // shadow + man
      const shW = this.manH * (0.2 + 0.06 * this.man.walk);
      ctx.fillStyle = this.c['shadow-ground'];
      ctx.beginPath(); ctx.ellipse(px, this.feetY + 2, shW, this.manH * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      this.man.draw(ctx, px, this.feetY, this.manH);

      const vy = this.feetY - this.manH - 24;
      if (s.showV) this.drawVector(px, vy, s.v * dir, this.ppm * 0.55, this.c.v, 'v');
      if (s.showA) this.drawVector(px, vy - (s.showV ? 30 : 0), s.a * dir, this.ppm * 0.35, this.c.a, 'a');

      this.drawEffects(dt);
      this.drawRuler(px);
      this.drawOffscreen(px, s.x);
      return stepped;
    }

    drawSky(dt, reduced) {
      const ctx = this.ctx, W = this.W, H = this.H, c = this.c;
      const g = ctx.createLinearGradient(0, 0, 0, this.horizon);
      g.addColorStop(0, c['sky-top']);
      g.addColorStop(1, c['sky-bottom']);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, this.horizon + 40);

      if (this.night) {
        this.stars.forEach(st => {
          const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(this.time * 1.7 + st.p);
          ctx.globalAlpha = tw;
          circle(ctx, st.x * W, st.y * this.horizon, st.r, c.star);
        });
        ctx.globalAlpha = 1;
      }

      const sx = W * 0.84, sy = Math.min(H * 0.2, this.horizon * 0.4), sr = clamp(H * 0.06, 12, 26);
      ctx.save();
      ctx.shadowColor = c.sun; ctx.shadowBlur = sr * 1.6;
      circle(ctx, sx, sy, sr, c.sun);
      ctx.restore();
      if (this.night) circle(ctx, sx + sr * 0.42, sy - sr * 0.22, sr * 0.86, g);

      this.clouds.forEach(cl => {
        if (!reduced) { cl.x += (cl.v * dt) / W; if (cl.x > 1.15) cl.x = -0.15; }
        const x = cl.x * W, y = cl.y * this.horizon + 6, k = cl.s * clamp(H / 320, 0.6, 1.2);
        ctx.globalAlpha = this.night ? 0.55 : 0.92;
        ctx.fillStyle = c.cloud;
        ctx.beginPath();
        ctx.arc(x, y, 16 * k, 0, Math.PI * 2);
        ctx.arc(x + 18 * k, y - 8 * k, 20 * k, 0, Math.PI * 2);
        ctx.arc(x + 40 * k, y, 15 * k, 0, Math.PI * 2);
        ctx.fill();
        roundRect(ctx, x - 4 * k, y, 54 * k, 14 * k, 7 * k);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    drawHills() {
      const ctx = this.ctx, W = this.W, H = this.H, c = this.c, hz = this.horizon;
      const layer = (color, base, amp, f, ph) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-10, hz + 2);
        for (let x = -10; x <= W + 10; x += 12) {
          const y = base - amp * (0.6 * Math.sin(x / W * Math.PI * 2 * f + ph) + 0.4 * Math.sin(x / W * Math.PI * 2 * f * 2.3 + ph * 1.7));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 10, hz + 2);
        ctx.closePath();
        ctx.fill();
      };
      layer(c['hill-far'], hz - H * 0.07, H * 0.05, 1.1, 0.8);
      layer(c['hill-near'], hz - H * 0.02, H * 0.03, 1.7, 2.4);
      ctx.fillStyle = c.grass;
      ctx.fillRect(-20, hz, W + 40, this.walkTop - hz + 1);
    }

    drawHouse(cx, baseY, w) {
      const ctx = this.ctx, c = this.c;
      const h = w * 0.6, roofH = w * 0.4, left = cx - w / 2;
      ctx.fillStyle = c['house-roof'];
      ctx.fillRect(cx + w * 0.2, baseY - h - roofH * 0.9, w * 0.11, roofH * 0.6);
      ctx.fillStyle = c['house-wall'];
      ctx.fillRect(left, baseY - h, w, h);
      ctx.fillStyle = c['house-roof'];
      ctx.beginPath();
      ctx.moveTo(left - w * 0.07, baseY - h + 2);
      ctx.lineTo(cx, baseY - h - roofH);
      ctx.lineTo(left + w * 1.07, baseY - h + 2);
      ctx.closePath(); ctx.fill();

      ctx.save();
      if (this.night) { ctx.shadowColor = c.window; ctx.shadowBlur = 14; }
      const ws = w * 0.24, wx = cx - w * 0.3, wy = baseY - h * 0.72;
      ctx.fillStyle = c['house-trim']; ctx.fillRect(wx - 3, wy - 3, ws + 6, ws + 6);
      ctx.fillStyle = c.window; ctx.fillRect(wx, wy, ws, ws);
      circle(ctx, cx, baseY - h - roofH * 0.36, w * 0.065, c.window);
      ctx.restore();
      ctx.fillStyle = c['house-trim'];
      ctx.fillRect(wx + ws / 2 - 1.5, wy, 3, ws);
      ctx.fillRect(wx, wy + ws / 2 - 1.5, ws, 3);

      const dw = w * 0.19, dh = h * 0.62, dx = cx + w * 0.1;
      ctx.fillStyle = c.door;
      roundRect(ctx, dx, baseY - dh, dw, dh, dw * 0.45); ctx.fill();
      ctx.fillRect(dx, baseY - dh * 0.6, dw, dh * 0.6);
      circle(ctx, dx + dw * 0.75, baseY - dh * 0.45, Math.max(1.5, w * 0.012), c['house-trim']);
    }

    drawTree(cx, baseY, w) {
      const ctx = this.ctx, c = this.c;
      ctx.fillStyle = c.trunk;
      roundRect(ctx, cx - w * 0.07, baseY - w * 0.6, w * 0.14, w * 0.6 + 2, 3); ctx.fill();
      circle(ctx, cx + w * 0.02, baseY - w * 0.92, w * 0.4, c['leaf-2']);
      circle(ctx, cx - w * 0.27, baseY - w * 0.7, w * 0.27, c.leaf);
      circle(ctx, cx + w * 0.28, baseY - w * 0.74, w * 0.29, c.leaf);
      circle(ctx, cx - w * 0.06, baseY - w * 1.1, w * 0.28, c.leaf);
      ctx.globalAlpha = 0.18;
      circle(ctx, cx - w * 0.12, baseY - w * 1.16, w * 0.13, '#ffffff');
      ctx.globalAlpha = 1;
    }

    drawSidewalk() {
      const ctx = this.ctx, W = this.W, c = this.c, top = this.walkTop, bot = this.walkBot;
      ctx.fillStyle = c.walk;
      ctx.fillRect(-20, top, W + 40, bot - top);
      ctx.strokeStyle = c['walk-line'];
      ctx.lineWidth = 1.5;
      const span = Math.ceil(W / 2 / this.ppm) + 2;
      for (let m = -span; m <= span; m++) {
        const xb = this.xToPx(m), xt = W / 2 + (xb - W / 2) * 0.93;
        ctx.beginPath(); ctx.moveTo(xt, top); ctx.lineTo(xb, bot); ctx.stroke();
      }
      ctx.fillStyle = c['grass-dark'];
      ctx.fillRect(-20, top - 2, W + 40, 3);
      ctx.fillStyle = c.curb;
      ctx.fillRect(-20, bot - 5, W + 40, 5);
    }

    drawWalls() {
      const ctx = this.ctx, c = this.c;
      const top = this.feetY - this.manH * 1.15, bot = this.walkBot;
      [-1, 1].forEach(side => {
        const edge = this.xToPx(side * 10);
        const s = Math.sign(edge - this.W / 2) || 1;
        const inner = edge + s * this.manHalf;
        const x0 = s > 0 ? inner : inner - this.wallW, w = this.wallW;
        ctx.fillStyle = this.c['shadow-ground'];
        ctx.fillRect(s > 0 ? x0 - 6 : x0 + w, this.walkTop + 2, 6, bot - this.walkTop - 6);
        ctx.save();
        roundRect(ctx, x0, top, w, bot - top, 3);
        ctx.clip();
        ctx.fillStyle = c.brick;
        ctx.fillRect(x0, top, w, bot - top);
        ctx.fillStyle = c.mortar;
        const bh = 8;
        for (let y = top, row = 0; y < bot; y += bh, row++) {
          ctx.fillRect(x0, y, w, 1.5);
          const off = row % 2 ? w / 2 : 0;
          for (let x = x0 + off; x < x0 + w; x += w) ctx.fillRect(x, y, 1.5, bh);
        }
        ctx.fillStyle = c['brick-dark'];
        ctx.fillRect(s > 0 ? x0 + w - 3 : x0, top, 3, bot - top);
        ctx.restore();
        ctx.fillStyle = c['brick-dark'];
        roundRect(ctx, x0 - 2, top - 5, w + 4, 7, 2); ctx.fill();
      });
    }

    drawTrail(trail) {
      const ctx = this.ctx, c = this.c;
      const y = this.walkTop + (this.feetY - this.walkTop) * 0.32;
      trail.forEach((p, i) => {
        const px = this.xToPx(p.x);
        const alpha = 0.35 + 0.65 * ((i + 1) / trail.length);
        ctx.globalAlpha = alpha;
        circle(ctx, px, y, 5, c.surface);
        circle(ctx, px, y, 3.6, c.x);
        if (Math.abs(p.t % 2) < 1e-6 && p.t > 0) {
          ctx.font = '600 10px ' + MONO;
          ctx.textAlign = 'center';
          ctx.fillStyle = c.ink;
          ctx.fillText(p.t.toFixed(0) + 's', px, y - 9);
        }
      });
      ctx.globalAlpha = 1;
    }

    drawVector(px, y, val, k, color, label) {
      const ctx = this.ctx;
      const len = clamp(val * k, -this.W * 0.46, this.W * 0.46);
      ctx.save();
      ctx.font = 'italic 700 17px Georgia, "Times New Roman", serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = len >= 0 ? 'right' : 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.c.surface;
      ctx.strokeText(label, px + (len >= 0 ? -9 : 9), y);
      ctx.fillStyle = color;
      ctx.fillText(label, px + (len >= 0 ? -9 : 9), y);
      if (Math.abs(len) < 3) {
        circle(ctx, px, y, 5, this.c.surface);
        circle(ctx, px, y, 3.5, color);
        ctx.restore();
        return;
      }
      const sgn = Math.sign(len), L = Math.abs(len);
      const head = Math.min(15, L * 0.6), hw = 9, sw = 3.5;
      ctx.translate(px, y);
      ctx.scale(sgn, 1);
      ctx.beginPath();
      ctx.moveTo(0, -sw);
      ctx.lineTo(L - head, -sw);
      ctx.lineTo(L - head, -hw);
      ctx.lineTo(L, 0);
      ctx.lineTo(L - head, hw);
      ctx.lineTo(L - head, sw);
      ctx.lineTo(0, sw);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.c.surface;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    drawEffects(dt) {
      const ctx = this.ctx;
      this.rings = this.rings.filter(r => (r.life -= dt) > 0);
      this.rings.forEach(r => {
        r.r += dt * 140;
        ctx.globalAlpha = r.life / 0.45;
        ctx.strokeStyle = this.c.surface;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      });
      this.particles = this.particles.filter(p => (p.life -= dt) > 0);
      this.particles.forEach(p => {
        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > this.feetY) { p.y = this.feetY; p.vy *= -0.35; p.vx *= 0.7; }
        ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;
    }

    drawRuler(manPx) {
      const ctx = this.ctx, W = this.W, c = this.c, top = this.rulerTop;
      ctx.fillStyle = c['ruler-bg'];
      ctx.fillRect(-20, top, W + 40, this.rulerH + 20);
      const span = W / 2 / this.ppm;
      const every = this.ppm >= 30 ? 1 : 2;
      ctx.font = '600 11px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (let m = Math.ceil(-span); m <= Math.floor(span); m++) {
        const px = this.xToPx(m);
        const major = m % every === 0;
        ctx.fillStyle = major ? c['ruler-ink'] : c['ruler-dim'];
        ctx.fillRect(px - 0.75, top, 1.5, major ? 8 : 4);
        if (this.ppm >= 40) { const hp = this.xToPx(m + 0.5); ctx.fillStyle = c['ruler-dim']; ctx.fillRect(hp - 0.5, top, 1, 3); }
        if (major && px > 12 && px < W - 12) {
          ctx.fillStyle = m === 0 ? c['ruler-ink'] : c['ruler-dim'];
          ctx.fillText(m < 0 ? '−' + (-m) : String(m), px, top + this.rulerH - 10);
        }
      }
      ctx.textAlign = this.invert ? 'left' : 'right';
      ctx.fillStyle = c['ruler-dim'];
      ctx.fillText('m', this.invert ? 6 : W - 6, top + this.rulerH - 10);
      if (manPx > -10 && manPx < W + 10) {
        ctx.fillStyle = c.x;
        ctx.beginPath();
        ctx.moveTo(manPx - 7, top); ctx.lineTo(manPx + 7, top); ctx.lineTo(manPx, top + 8);
        ctx.closePath(); ctx.fill();
      }
    }

    drawOffscreen(px, x) {
      const W = this.W, ctx = this.ctx, c = this.c;
      const off = px < -this.manHalf ? -1 : px > W + this.manHalf ? 1 : 0;
      this.offscreen = off;
      if (!off) return;
      const label = (x < 0 ? '−' : '') + Math.abs(x).toFixed(1) + ' m';
      ctx.font = '700 12px ' + MONO;
      const tw = ctx.measureText(label).width;
      const w = tw + 34, h = 28, y = this.feetY - this.manH * 0.55 - h / 2;
      const x0 = off < 0 ? 8 : W - 8 - w;
      ctx.fillStyle = c['ruler-bg'];
      roundRect(ctx, x0, y, w, h, 14); ctx.fill();
      ctx.fillStyle = c['ruler-ink'];
      ctx.beginPath();
      const ax = off < 0 ? x0 + 12 : x0 + w - 12;
      ctx.moveTo(ax + off * 5, y + h / 2); ctx.lineTo(ax - off * 3, y + h / 2 - 6); ctx.lineTo(ax - off * 3, y + h / 2 + 6);
      ctx.closePath(); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x0 + w / 2 + (off < 0 ? 6 : -6), y + h / 2 + 1);
    }
  }

  MM.Scene = Scene;
})();
