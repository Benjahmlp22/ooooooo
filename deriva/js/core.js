/* ============================================================
   Núcleo: utilidades + PATRÓN OBSERVER (EventBus)
   + PATRÓN SINGLETON (audio procedural WebAudio)
   ============================================================ */
'use strict';

const TILE = 42;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

class EventBus {
  constructor() { this.map = new Map(); }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
  }
  emit(ev, d) { const s = this.map.get(ev); if (s) for (const f of s) f(d); }
}
const Events = new EventBus();

/* ---------- audio ---------- */
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let hiss = null, hum = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 8;
      master = ctx.createGain(); master.gain.value = 0.5;
      master.connect(comp); comp.connect(ctx.destination);
      const n = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return false; }
    return true;
  }
  function noise(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = !!loop; return s; }
  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  const api = {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },

    click() {
      if (!ensure()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 1100;
      env(g, t, 0.05, 0.05); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
    },

    thud() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      env(g, t, 0.5, 0.32); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
      const s = noise(); const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      const g2 = ctx.createGain(); env(g2, t, 0.25, 0.15);
      s.connect(f); f.connect(g2); g2.connect(master); s.start(t); s.stop(t + 0.18);
    },

    weld() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const s = noise(); const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 4000 + Math.random() * 1800; f.Q.value = 3;
      const g = ctx.createGain(); env(g, t, 0.06, 0.07);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.08);
    },

    alarm() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 620;
        env(g, t + i * 0.28, 0.07, 0.2);
        o.connect(g); g.connect(master); o.start(t + i * 0.28); o.stop(t + i * 0.28 + 0.22);
      }
    },

    chime() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        env(g, t + i * 0.09, 0.09, 0.4);
        o.connect(g); g.connect(master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.45);
      });
    },

    spark() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const s = noise(); const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 4;
      const g = ctx.createGain(); env(g, t, 0.08, 0.05);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.06);
    },

    /* fuga de aire continua: nivel según nº de brechas */
    hiss(level) {
      if (!ensure()) return;
      if (!hiss) {
        const s = noise(true);
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(master); s.start();
        hiss = { g };
      }
      hiss.g.gain.setTargetAtTime(clamp(level, 0, 1) * 0.12, ctx.currentTime, 0.3);
    },

    /* zumbido ambiental de la nave (baja si no hay energía) */
    hum(level) {
      if (!ensure()) return;
      if (!hum) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(g); g.connect(master); o.start();
        hum = { g };
      }
      hum.g.gain.setTargetAtTime(clamp(level, 0, 1) * 0.05, ctx.currentTime, 0.5);
    }
  };

  Events.on('ui:click',  () => api.click());
  Events.on('impact',    () => api.thud());
  Events.on('repair:tick', () => api.weld());
  Events.on('event:start', () => api.alarm());
  Events.on('signal:ok', () => api.chime());
  Events.on('spark',     () => api.spark());

  return api;
})();
