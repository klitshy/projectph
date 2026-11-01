/* Synthesized sounds: soft footsteps and a wall thud. Starts only after a user gesture. */
window.MM = window.MM || {};
(function () {
  let ctx = null, master = null, noise = null;
  let lastCrash = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  function burst(dur, freq, q, gain, when) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(when); src.stop(when + dur + 0.02);
  }

  const Sound = {
    enabled: true,
    unlock() { if (this.enabled) ensure(); },
    step(intensity) {
      if (!this.enabled || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      burst(0.06, 900 + Math.random() * 300, 1.4, 0.05 + 0.08 * Math.min(1, intensity), now);
    },
    crash(speed) {
      if (!this.enabled || !ensure()) return;
      const nowMs = performance.now();
      if (nowMs - lastCrash < 180 || speed < 0.4) return;
      lastCrash = nowMs;
      const k = Math.min(1, speed / 8);
      const now = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, now);
      o.frequency.exponentialRampToValueAtTime(45, now + 0.25);
      g.gain.setValueAtTime(0.35 + 0.5 * k, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      o.connect(g); g.connect(master);
      o.start(now); o.stop(now + 0.32);
      burst(0.18, 380, 0.8, 0.25 + 0.4 * k, now);
      burst(0.09, 2400, 1.2, 0.08 + 0.12 * k, now + 0.01);
    },
    click() {
      if (!this.enabled || !ctx || ctx.state !== 'running') return;
      burst(0.03, 3000, 2, 0.05, ctx.currentTime);
    }
  };

  MM.Sound = Sound;
})();
