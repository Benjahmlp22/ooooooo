/* ============================================================
   PATRÓN: SINGLETON — Motor de sonido procedural (WebAudio)
   ------------------------------------------------------------
   Una única instancia global. Todo el audio se sintetiza en
   tiempo real: sin assets externos. Se suscribe al EventBus
   (Observer) para reaccionar a la simulación.
   ============================================================ */
'use strict';

const SFX = (() => {
  let ctx = null, master = null, muted = false;
  let thrustNode = null, thrustGain = null, thrustFilter = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { return false; }
    return true;
  }

  function noiseBuffer(dur) {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(gainNode, t0, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  const api = {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },

    click() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 1400;
      env(g, t, 0.05, 0.04);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.05);
    },

    laser() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.1);
      env(g, t, 0.12, 0.12);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.13);
    },

    hit() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.09);
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const g = ctx.createGain();
      env(g, t, 0.18, 0.09);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
    },

    boom(big) {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const dur = big ? 0.9 : 0.35;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(big ? 900 : 1400, t);
      f.frequency.exponentialRampToValueAtTime(60, t + dur);
      const g = ctx.createGain();
      env(g, t, big ? 0.5 : 0.25, dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(big ? 120 : 200, t);
      o.frequency.exponentialRampToValueAtTime(30, t + dur);
      env(g2, t, big ? 0.4 : 0.15, dur);
      o.connect(g2); g2.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    },

    spark() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.05);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 4;
      const g = ctx.createGain();
      env(g, t, 0.08, 0.05);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t);
    },

    // empuje continuo: ruido filtrado cuya ganancia sigue el nivel total de propulsión
    thrust(level) {
      if (!ensure() || muted && !thrustNode) return;
      if (!thrustNode) {
        thrustNode = ctx.createBufferSource();
        thrustNode.buffer = noiseBuffer(2);
        thrustNode.loop = true;
        thrustFilter = ctx.createBiquadFilter();
        thrustFilter.type = 'lowpass'; thrustFilter.frequency.value = 320;
        thrustGain = ctx.createGain(); thrustGain.gain.value = 0;
        thrustNode.connect(thrustFilter); thrustFilter.connect(thrustGain); thrustGain.connect(master);
        thrustNode.start();
      }
      const target = clamp(level, 0, 1) * 0.22;
      thrustGain.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
      thrustFilter.frequency.setTargetAtTime(320 + level * 500, ctx.currentTime, 0.1);
    },

    stopThrust() {
      if (thrustGain) thrustGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
  };

  // suscripciones al bus de eventos (Observer)
  Events.on('laser:fire',      () => api.laser());
  Events.on('block:hit',       () => api.hit());
  Events.on('block:destroyed', () => api.boom(false));
  Events.on('ship:destroyed',  () => api.boom(true));
  Events.on('impact',          d  => { if (d.j > 700) api.hit(); });
  Events.on('spark',           () => api.spark());
  Events.on('ui:click',        () => api.click());

  return api;
})();
