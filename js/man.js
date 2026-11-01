/* The walking man: procedural gait driven by distance travelled, so feet never slide. */
window.MM = window.MM || {};
(function () {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);

  const C = {
    skin: '#E2A97F', skinShade: '#C88A61', hair: '#2A2131',
    shirt: '#F3A83B', shirtShade: '#D98C1F', collar: '#FFF4E0',
    pants: '#34425E', pantsShade: '#27324A',
    shoe: '#F7F7F5', sole: '#2A2A2E', eye: '#1E1A22'
  };

  class Man {
    constructor() {
      this.phase = 0; this.turn = 0; this.walk = 0; this.run = 0; this.lean = 0;
      this.bump = 0; this.blink = 0; this.nextBlink = 2.5; this.breath = 0; this.lastStepSign = 1;
    }

    /* dxPx: screen movement this frame. vS, aS: velocity/acceleration in screen direction. */
    update(dt, dxPx, vS, aS, H) {
      const speed = Math.abs(vS);
      this.walk = ease(this.walk, clamp(speed / 0.9, 0, 1), 10, dt);
      this.run = ease(this.run, clamp((speed - 2.5) / 4, 0, 1), 6, dt);
      const facing = speed > 0.08 ? Math.sign(vS) : 0;
      this.turn = ease(this.turn, facing, 9, dt);
      if (Math.abs(this.turn) < 0.002) this.turn = 0;

      const stride = H * (0.5 + 0.3 * this.run);
      this.phase += (Math.abs(dxPx) / stride) * Math.PI;

      const dir = Math.sign(this.turn) || 1;
      const leanTarget = 0.04 * this.walk + 0.12 * this.run + clamp(aS * dir * 0.012, -0.12, 0.14);
      this.lean = ease(this.lean, this.walk > 0.1 ? leanTarget : 0, 6, dt);

      this.bump = Math.max(0, this.bump - dt * 3);
      this.breath += dt;
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blink = 0.14; this.nextBlink = 2 + Math.random() * 3; }
      this.blink = Math.max(0, this.blink - dt);

      // footstep each time the gait passes a half cycle
      const s = Math.sign(Math.sin(this.phase));
      let stepped = false;
      if (s !== this.lastStepSign && s !== 0) {
        this.lastStepSign = s;
        stepped = this.walk > 0.35;
      }
      return stepped;
    }

    draw(ctx, px, groundY, H) {
      const t = Math.abs(this.turn);
      const side = t >= 0.5;
      const sx = Math.max(0.12, side ? (t - 0.5) * 2 : 1 - t * 2);
      const dir = this.turn < 0 ? -1 : 1;
      ctx.save();
      ctx.translate(px, groundY);
      const sq = this.bump;
      ctx.scale(sx * (side ? dir : 1) * (1 + 0.14 * sq), 1 - 0.1 * sq);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (side) this.drawSide(ctx, H); else this.drawFront(ctx, H);
      ctx.restore();
    }

    leg(p, amp, kneeAmp) {
      const th = amp * Math.sin(p);
      const ts = th - kneeAmp * Math.max(0, Math.cos(p));
      return { th, ts };
    }

    drawSide(ctx, H) {
      const w = this.walk, r = this.run;
      const amp = 0.42 * w + 0.22 * r;
      const kneeAmp = 0.55 * w + 0.7 * r;
      const armAmp = 0.45 * w + 0.35 * r;
      const elbow = 0.2 + 0.3 * w + 1.0 * r;
      const thigh = 0.235 * H, shin = 0.225 * H, sole = 0.035 * H;

      const legs = [this.phase + Math.PI, this.phase].map(p => {
        const { th, ts } = this.leg(p, amp, kneeAmp);
        const knee = { x: thigh * Math.sin(th), y: thigh * Math.cos(th) };
        const ankle = { x: knee.x + shin * Math.sin(ts), y: knee.y + shin * Math.cos(ts) };
        return { p, knee, ankle, ts };
      });
      const hipY = -(Math.max(legs[0].ankle.y, legs[1].ankle.y) + sole);

      ctx.translate(0, hipY);
      // far arm, far leg (shaded), near leg
      this.sideArm(ctx, H, legs[0].p, armAmp, elbow, true);
      legs.forEach((L, i) => this.sideLeg(ctx, H, L, i === 0));

      // upper body pivots at the hip
      ctx.save();
      ctx.rotate(this.lean);
      const tw = 0.165 * H, top = -0.31 * H;
      ctx.fillStyle = C.shirt;
      roundRect(ctx, -tw / 2, top, tw, 0.33 * H, tw * 0.42);
      ctx.fill();
      ctx.fillStyle = C.shirtShade;
      roundRect(ctx, -tw / 2, -0.06 * H, tw, 0.08 * H, tw * 0.3);
      ctx.fill();
      ctx.fillStyle = C.pants;
      roundRect(ctx, -tw / 2, -0.02 * H, tw, 0.07 * H, tw * 0.3);
      ctx.fill();

      // head
      const hr = 0.1 * H, hx = 0.012 * H, hy = top - hr * 0.95;
      ctx.fillStyle = C.skin;
      ctx.fillRect(-0.025 * H, top - 0.05 * H, 0.05 * H, 0.06 * H);
      circle(ctx, hx, hy, hr, C.skin);
      ctx.fillStyle = C.hair;
      ctx.beginPath();
      ctx.arc(hx, hy, hr * 1.04, Math.PI * 0.92, Math.PI * 1.9);
      ctx.quadraticCurveTo(hx + hr * 0.2, hy - hr * 0.35, hx - hr * 0.35, hy - hr * 0.15);
      ctx.quadraticCurveTo(hx - hr * 0.6, hy + hr * 0.2, hx - hr * 0.95, hy + hr * 0.45);
      ctx.closePath();
      ctx.fill();
      circle(ctx, hx - hr * 0.12, hy + hr * 0.12, hr * 0.2, C.skinShade);
      ctx.fillStyle = C.skin;
      ctx.beginPath();
      ctx.ellipse(hx + hr * 0.98, hy + hr * 0.12, hr * 0.16, hr * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      if (this.blink > 0) {
        ctx.strokeStyle = C.eye; ctx.lineWidth = hr * 0.09;
        ctx.beginPath(); ctx.moveTo(hx + hr * 0.42, hy - hr * 0.05); ctx.lineTo(hx + hr * 0.66, hy - hr * 0.05); ctx.stroke();
      } else circle(ctx, hx + hr * 0.55, hy - hr * 0.06, hr * 0.11, C.eye);
      ctx.strokeStyle = C.skinShade; ctx.lineWidth = hr * 0.08;
      ctx.beginPath(); ctx.arc(hx + hr * 0.62, hy + hr * 0.4, hr * 0.18, 0.2, 1.3); ctx.stroke();

      // near arm
      this.sideArm(ctx, H, legs[1].p, armAmp, elbow, false);
      ctx.restore();
    }

    sideLeg(ctx, H, L, far) {
      const lw = 0.078 * H;
      ctx.strokeStyle = far ? C.pantsShade : C.pants;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L.knee.x, L.knee.y); ctx.lineTo(L.ankle.x, L.ankle.y); ctx.stroke();
      // shoe follows the shin a little, flattening on the ground
      const ang = L.ts * 0.6;
      ctx.save();
      ctx.translate(L.ankle.x, L.ankle.y);
      ctx.rotate(-ang);
      ctx.fillStyle = far ? '#D9D9D6' : C.shoe;
      roundRect(ctx, -0.035 * H, -0.02 * H, 0.12 * H, 0.05 * H, 0.022 * H); ctx.fill();
      ctx.fillStyle = C.sole;
      roundRect(ctx, -0.035 * H, 0.018 * H, 0.122 * H, 0.016 * H, 0.008 * H); ctx.fill();
      ctx.restore();
    }

    sideArm(ctx, H, legPhase, amp, elbow, far) {
      ctx.save();
      if (far) ctx.rotate(this.lean);
      const sh = { x: 0, y: -0.27 * H };
      const tu = -amp * Math.sin(legPhase);
      const tf = tu + elbow;
      const up = 0.165 * H, fo = 0.15 * H;
      const el = { x: sh.x + up * Math.sin(tu), y: sh.y + up * Math.cos(tu) };
      const hd = { x: el.x + fo * Math.sin(tf), y: el.y + fo * Math.cos(tf) };
      ctx.strokeStyle = far ? C.shirtShade : C.shirt;
      ctx.lineWidth = 0.068 * H;
      ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.stroke();
      ctx.strokeStyle = far ? C.skinShade : C.skin;
      ctx.lineWidth = 0.055 * H;
      ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
      circle(ctx, hd.x, hd.y, 0.034 * H, far ? C.skinShade : C.skin);
      ctx.restore();
    }

    drawFront(ctx, H) {
      const b = Math.sin(this.breath * 2.2) * 0.006 * H;
      const hipY = -0.46 * H;
      // legs
      ctx.strokeStyle = C.pants; ctx.lineWidth = 0.085 * H;
      [-1, 1].forEach(s => {
        ctx.beginPath(); ctx.moveTo(s * 0.05 * H, hipY); ctx.lineTo(s * 0.055 * H, -0.05 * H); ctx.stroke();
        ctx.fillStyle = C.shoe;
        ctx.beginPath(); ctx.ellipse(s * 0.065 * H, -0.03 * H, 0.055 * H, 0.03 * H, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.sole; ctx.fillRect(s * 0.065 * H - 0.055 * H, -0.012 * H, 0.11 * H, 0.012 * H);
      });
      // arms
      [-1, 1].forEach(s => {
        ctx.strokeStyle = C.shirt; ctx.lineWidth = 0.07 * H;
        ctx.beginPath(); ctx.moveTo(s * 0.12 * H, -0.73 * H + b); ctx.lineTo(s * 0.15 * H, -0.58 * H + b); ctx.stroke();
        ctx.strokeStyle = C.skin; ctx.lineWidth = 0.056 * H;
        ctx.beginPath(); ctx.moveTo(s * 0.15 * H, -0.58 * H + b); ctx.lineTo(s * 0.16 * H, -0.45 * H + b); ctx.stroke();
        circle(ctx, s * 0.16 * H, -0.43 * H + b, 0.034 * H, C.skin);
      });
      // torso
      const tw = 0.27 * H;
      ctx.fillStyle = C.shirt;
      roundRect(ctx, -tw / 2, -0.77 * H + b, tw, 0.31 * H - b, 0.07 * H); ctx.fill();
      ctx.fillStyle = C.pants;
      roundRect(ctx, -tw / 2, -0.5 * H, tw, 0.07 * H, 0.025 * H); ctx.fill();
      ctx.fillStyle = C.collar;
      ctx.beginPath(); ctx.moveTo(-0.045 * H, -0.77 * H + b); ctx.lineTo(0, -0.71 * H + b); ctx.lineTo(0.045 * H, -0.77 * H + b); ctx.closePath(); ctx.fill();
      // head
      const hr = 0.1 * H, hy = -0.87 * H + b;
      ctx.fillStyle = C.skin; ctx.fillRect(-0.025 * H, -0.8 * H + b, 0.05 * H, 0.05 * H);
      circle(ctx, -hr * 0.98, hy + hr * 0.1, hr * 0.17, C.skinShade);
      circle(ctx, hr * 0.98, hy + hr * 0.1, hr * 0.17, C.skinShade);
      circle(ctx, 0, hy, hr, C.skin);
      ctx.fillStyle = C.hair;
      ctx.beginPath();
      ctx.arc(0, hy, hr * 1.05, Math.PI * 0.97, Math.PI * 2.03);
      ctx.quadraticCurveTo(hr * 0.5, hy - hr * 0.45, -hr * 0.1, hy - hr * 0.5);
      ctx.quadraticCurveTo(-hr * 0.7, hy - hr * 0.45, -hr * 1.02, hy + hr * 0.05);
      ctx.closePath(); ctx.fill();
      if (this.blink > 0) {
        ctx.strokeStyle = C.eye; ctx.lineWidth = hr * 0.09;
        [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(s * hr * 0.25, hy + hr * 0.05); ctx.lineTo(s * hr * 0.47, hy + hr * 0.05); ctx.stroke(); });
      } else [-1, 1].forEach(s => circle(ctx, s * hr * 0.36, hy + hr * 0.05, hr * 0.11, C.eye));
      ctx.strokeStyle = C.skinShade; ctx.lineWidth = hr * 0.09;
      ctx.beginPath(); ctx.arc(0, hy + hr * 0.25, hr * 0.32, 0.35, Math.PI - 0.35); ctx.stroke();
    }
  }

  function circle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  MM.Man = Man;
  MM.draw = { circle, roundRect };
})();
