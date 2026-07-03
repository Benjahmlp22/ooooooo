/* ============================================================
   PATRÓN: SINGLETON — Motor de sonido procedural (WebAudio)
   ------------------------------------------------------------
   Una única instancia global. Todo el audio se sintetiza en
   tiempo real: sin assets. Cadena maestra con compresor para
   pegada y filtro suave. Capas continuas: empuje (rumble +
   silbido) y viento atmosférico. Se suscribe al EventBus.
   ============================================================ */
'use strict';

const SFX = (() => {
  let ctx = null, master = null, comp = null, muted = false;
  let noiseBuf = null;
  let thrust = null;   // { src, lp, gain, sub, subGain }
  let wind = null;     // { src, bp, gain }

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 22;
      comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.18;
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(comp); comp.connect(ctx.destination);
      const n = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return false; }
    return true;
  }

  function noise(dur) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = dur === undefined;
    return src;
  }

  function env(g, t0, peak, dur, attack) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  const api = {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },

    click() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 1150;
      env(g, t, 0.045, 0.05);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.06);
    },

    laser() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      // doble oscilador desafinado: zumbido con cuerpo
      for (const det of [0, 7]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(1350 + det * 14, t);
        o.frequency.exponentialRampToValueAtTime(170, t + 0.11);
        o.detune.value = det;
        env(g, t, 0.075, 0.13);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.14);
      }
      const s = noise(0.05); const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 3800;
      const g = ctx.createGain(); env(g, t, 0.05, 0.05);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + 0.06);
    },

    cannon() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      // golpe grave con caída + estampido de ruido
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      env(g, t, 0.5, 0.26, 0.004);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.28);
      const s = noise(0.12); const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.12);
      const g2 = ctx.createGain(); env(g2, t, 0.3, 0.12, 0.002);
      s.connect(f); f.connect(g2); g2.connect(master);
      s.start(t); s.stop(t + 0.14);
    },

    hit() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const s = noise(0.1);
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 800;
      const g = ctx.createGain();
      env(g, t, 0.16, 0.1);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + 0.12);
      // "clank" metálico
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'square'; o.frequency.value = 320 + Math.random() * 300;
      env(g2, t, 0.05, 0.07);
      o.connect(g2); g2.connect(master);
      o.start(t); o.stop(t + 0.08);
    },

    shieldHit() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(940, t + 0.16);
      env(g, t, 0.14, 0.2);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.22);
      const s = noise(0.09); const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 6;
      const g2 = ctx.createGain(); env(g2, t, 0.09, 0.09);
      s.connect(f); f.connect(g2); g2.connect(master);
      s.start(t); s.stop(t + 0.1);
    },

    weld() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const s = noise(0.07); const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 4200 + Math.random() * 1600; f.Q.value = 3;
      const g = ctx.createGain(); env(g, t, 0.06, 0.07);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + 0.08);
    },

    boom(big) {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const dur = big ? 1.15 : 0.4;
      // capa de estruendo
      const s = noise(dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(big ? 1100 : 1500, t);
      f.frequency.exponentialRampToValueAtTime(45, t + dur);
      const g = ctx.createGain();
      env(g, t, big ? 0.6 : 0.28, dur, 0.006);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.05);
      // sub-bajo
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(big ? 95 : 160, t);
      o.frequency.exponentialRampToValueAtTime(26, t + dur);
      env(g2, t, big ? 0.55 : 0.2, dur, 0.006);
      o.connect(g2); g2.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
      // crujidos (solo explosiones grandes)
      if (big) {
        for (let i = 0; i < 5; i++) {
          const tt = t + 0.06 + Math.random() * 0.5;
          const c = noise(0.04);
          const cf = ctx.createBiquadFilter(); cf.type = 'bandpass';
          cf.frequency.value = 900 + Math.random() * 2400; cf.Q.value = 5;
          const cg = ctx.createGain(); env(cg, tt, 0.12, 0.05);
          c.connect(cf); cf.connect(cg); cg.connect(master);
          c.start(tt); c.stop(tt + 0.06);
        }
      }
    },

    spark() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const s = noise(0.05);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 4;
      const g = ctx.createGain();
      env(g, t, 0.07, 0.05);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + 0.06);
    },

    // empuje continuo: rumble grave + silbido, ganancia sigue el nivel
    thrust(level) {
      if (!ensure()) return;
      if (!thrust) {
        const src = noise();
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
        const gain = ctx.createGain(); gain.gain.value = 0;
        src.connect(lp); lp.connect(gain); gain.connect(master);
        src.start();
        const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 42;
        const subGain = ctx.createGain(); subGain.gain.value = 0;
        sub.connect(subGain); subGain.connect(master);
        sub.start();
        thrust = { src, lp, gain, sub, subGain };
      }
      const l = clamp(level, 0, 1) * (muted ? 0 : 1);
      thrust.gain.gain.setTargetAtTime(l * 0.2, ctx.currentTime, 0.06);
      thrust.subGain.gain.setTargetAtTime(l * 0.12, ctx.currentTime, 0.08);
      thrust.lp.frequency.setTargetAtTime(300 + l * 600, ctx.currentTime, 0.1);
      thrust.sub.frequency.setTargetAtTime(42 + l * 18, ctx.currentTime, 0.1);
    },

    stopThrust() {
      if (thrust) {
        thrust.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        thrust.subGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
    },

    // viento atmosférico continuo (reentrada / vuelo en atmósfera)
    wind(level) {
      if (!ensure()) return;
      if (!wind) {
        const src = noise();
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
        const gain = ctx.createGain(); gain.gain.value = 0;
        src.connect(bp); bp.connect(gain); gain.connect(master);
        src.start();
        wind = { src, bp, gain };
      }
      const l = clamp(level, 0, 1) * (muted ? 0 : 1);
      wind.gain.gain.setTargetAtTime(l * 0.26, ctx.currentTime, 0.15);
      wind.bp.frequency.setTargetAtTime(380 + l * 900, ctx.currentTime, 0.2);
    },

    stopWind() {
      if (wind) wind.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }
  };

  // suscripciones al bus de eventos (Observer)
  Events.on('laser:fire',      () => api.laser());
  Events.on('cannon:fire',     () => api.cannon());
  Events.on('block:hit',       () => api.hit());
  Events.on('shield:hit',      () => api.shieldHit());
  Events.on('block:destroyed', () => api.boom(false));
  Events.on('ship:destroyed',  () => api.boom(true));
  Events.on('explosion',       d  => { if (d.kind === 'reactor') api.boom(true); });
  Events.on('impact',          d  => { if (d.j > 700) api.hit(); });
  Events.on('spark',           () => api.spark());
  Events.on('repair:tick',     () => api.weld());
  Events.on('ui:click',        () => api.click());

  return api;
})();
