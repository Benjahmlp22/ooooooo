/* ============================================================
   PATRÓN: OBJECT POOL — Sistema de partículas
   ------------------------------------------------------------
   Pool fijo de partículas reutilizadas sin asignar memoria en
   caliente. Alimenta: plumas de propulsión, fugas de combustible,
   chispas eléctricas, escombros, explosiones y humo.
   Se suscribe al EventBus para reaccionar a la simulación.
   ============================================================ */
'use strict';

const Particles = (() => {
  const MAX = 1400;
  const pool = new Array(MAX);
  for (let i = 0; i < MAX; i++) pool[i] = { alive: false };
  let cursor = 0;

  function spawn(o) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    p.alive = true;
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = p.maxLife = o.life || 0.6;
    p.size = o.size || 2;
    p.color = o.color || '200,214,229';
    p.drag = o.drag !== undefined ? o.drag : 0.9;
    p.glow = o.glow || false;
    p.shape = o.shape || 'dot';      // dot | shard | ring
    p.rot = rand(0, TAU);
    p.rotV = o.rotV || rand(-4, 4);
    p.grow = o.grow || 0;
    return p;
  }

  function burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(opts.spMin || 20, opts.spMax || 160);
      spawn({
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        life: rand(0.3, opts.life || 0.9),
        size: rand(1, opts.size || 3),
        color: opts.color, drag: opts.drag, glow: opts.glow,
        shape: opts.shape, grow: opts.grow
      });
    }
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.rotV * dt;
      if (p.grow) p.size += p.grow * dt;
    }
  }

  function draw(ctx) {
    ctx.save();
    for (const p of pool) {
      if (!p.alive) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.shape === 'ring') {
        ctx.strokeStyle = `rgba(${p.color},${a * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 2.2), 0, TAU);
        ctx.stroke();
      } else if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(${p.color},${a})`;
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      } else {
        if (p.glow) {
          ctx.fillStyle = `rgba(${p.color},${a * 0.16})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.6, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = `rgba(${p.color},${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  function clear() { for (const p of pool) p.alive = false; }

  /* ---------- reacciones a eventos de la simulación (Observer) ---------- */

  Events.on('block:destroyed', d => {
    burst(d.x, d.y, 10, { color: '255,150,90', spMax: 190, life: 0.7, glow: true });
    burst(d.x, d.y, 6,  { color: d.rgb || '160,175,190', spMax: 240, life: 1.6, shape: 'shard', size: 3.5, drag: 0.97 });
    spawn({ x: d.x, y: d.y, life: 0.5, size: 6, color: '255,190,120', shape: 'ring' });
  });

  Events.on('ship:destroyed', d => {
    burst(d.x, d.y, 46, { color: '255,150,90', spMax: 340, life: 1.3, glow: true, size: 4 });
    burst(d.x, d.y, 26, { color: '160,175,190', spMax: 380, life: 2.4, shape: 'shard', size: 4, drag: 0.985 });
    spawn({ x: d.x, y: d.y, life: 0.9, size: 14, color: '255,210,150', shape: 'ring' });
    spawn({ x: d.x, y: d.y, life: 1.3, size: 26, color: '110,231,255', shape: 'ring' });
  });

  Events.on('impact', d => {
    if (d.j > 350) burst(d.x, d.y, Math.min(12, d.j / 300), { color: '200,214,229', spMax: 120, life: 0.4 });
  });

  Events.on('laser:hit', d => {
    burst(d.x, d.y, 6, { color: d.color || '255,110,110', spMax: 160, life: 0.35, glow: true });
  });

  return { spawn, burst, update, draw, clear };
})();
