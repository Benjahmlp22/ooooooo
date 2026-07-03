/* ============================================================
   Pasada de luces aditivas (pseudo-shader en canvas 2D)
   ------------------------------------------------------------
   Los sistemas registran luces cada frame (toberas, láseres,
   explosiones, escudos, plasma de reentrada) y se componen en
   una única pasada con 'lighter': iluminación dinámica barata
   que mantiene el estilo minimalista.
   ============================================================ */
'use strict';

const Lights = (() => {
  let frame = [];        // luces de un solo frame
  let timed = [];        // destellos con decaimiento

  function add(x, y, r, color, intensity) {
    if (frame.length < 220) frame.push({ x, y, r, color, i: intensity });
  }

  function flash(x, y, r, color, intensity, life) {
    timed.push({ x, y, r, color, i: intensity, life, maxLife: life });
  }

  function update(dt) {
    for (const l of timed) l.life -= dt;
    timed = timed.filter(l => l.life > 0);
  }

  function draw(ctx) {
    if (frame.length === 0 && timed.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const paint = (l, k) => {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(${l.color},${l.i * k})`);
      g.addColorStop(0.5, `rgba(${l.color},${l.i * k * 0.35})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    };
    for (const l of frame) paint(l, 1);
    for (const l of timed) paint(l, l.life / l.maxLife);
    ctx.restore();
    frame = [];
  }

  function clear() { frame = []; timed = []; }

  // destellos automáticos desde la simulación (Observer)
  Events.on('block:destroyed', d => flash(d.x, d.y, 130, '255,170,100', 0.5, 0.4));
  Events.on('ship:destroyed',  d => flash(d.x, d.y, 420, '255,190,120', 0.7, 0.9));
  Events.on('laser:hit',       d => flash(d.x, d.y, 70, d.color || '255,110,110', 0.4, 0.15));
  Events.on('shield:hit',      d => flash(d.x, d.y, 110, '110,231,255', 0.4, 0.3));
  Events.on('cannon:fire',     d => flash(d.x, d.y, 90, '255,200,130', 0.5, 0.12));

  return { add, flash, update, draw, clear };
})();
