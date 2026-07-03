/* ============================================================
   Dibujo de la escena + PATRÓN OBJECT POOL (partículas)
   ------------------------------------------------------------
   Mismo lenguaje visual que el astillero: líneas finas, casco
   unificado, luces aditivas discretas y ventanas al vacío.
   ============================================================ */
'use strict';

const FX = (() => {
  const MAX = 700;
  const pool = new Array(MAX);
  for (let i = 0; i < MAX; i++) pool[i] = { alive: false };
  let cursor = 0;
  let shakeAmp = 0, sx = 0, sy = 0;

  function spawn(o) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    Object.assign(p, {
      alive: true, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 0.5, maxLife: o.life || 0.5,
      size: o.size || 2, color: o.color || '200,214,229',
      drag: o.drag !== undefined ? o.drag : 0.92,
      glow: o.glow || false, grow: o.grow || 0
    });
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
    }
    shakeAmp *= Math.pow(0.001, dt);
    sx = rand(-1, 1) * shakeAmp;
    sy = rand(-1, 1) * shakeAmp;
  }

  function draw(ctx) {
    for (const p of pool) {
      if (!p.alive) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.glow) {
        ctx.fillStyle = `rgba(${p.color},${a * 0.15})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.6, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
  }

  function shake(a) { shakeAmp = Math.min(16, shakeAmp + a); }
  function offset() { return { x: sx, y: sy }; }
  function clear() { for (const p of pool) p.alive = false; shakeAmp = 0; }

  return { spawn, update, draw, shake, offset, clear };
})();

/* ---------- escena ---------- */
const Scene = (() => {
  let stars = null;

  function ensureStars(w, h) {
    if (stars) return;
    stars = [];
    for (let i = 0; i < 110; i++) {
      stars.push({ x: Math.random() * w, y: Math.random() * h, p: rand(0.3, 1), tw: rand(0, TAU) });
    }
  }

  function drawStars(ctx, w, h, dt, drift, t) {
    ensureStars(w, h);
    for (const s of stars) {
      s.x -= drift * s.p * dt;
      if (s.x < -4) { s.x = w + 4; s.y = Math.random() * h; }
      const a = (0.25 + 0.45 * s.p) * (0.7 + 0.3 * Math.sin(t * 2 + s.tw));
      ctx.fillStyle = `rgba(200,214,229,${a})`;
      ctx.fillRect(s.x, s.y, s.p * 1.6, s.p * 1.6);
    }
  }

  const statusColor = st =>
    st.hp < 40 ? '255,93,93' :
    (st.type === 'M' ? (st.throttle > 0 ? '163,230,53' : '92,107,125')
                     : (st.on || st.type === 'A' || st.type === 'C' || st.type === 'S')
                       ? '163,230,53' : '92,107,125');

  function drawStation(ctx, st, t) {
    const x = st.cx, y = st.cy;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(159,180,200,0.85)';
    ctx.lineWidth = 1.2;

    if (st.type === 'R') {
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke();
      ctx.fillStyle = st.on && st.hp >= 40 ? `rgba(163,230,53,${0.5 + 0.3 * Math.sin(t * 5)})` : 'rgba(92,107,125,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    } else if (st.type === 'O') {
      ctx.beginPath(); ctx.arc(-4, 2, 5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(5, -3, 3.4, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(3, 5, 2.2, 0, TAU); ctx.stroke();
    } else if (st.type === 'M') {
      ctx.beginPath();
      ctx.moveTo(-8, -9); ctx.lineTo(8, -9); ctx.lineTo(5, 2); ctx.lineTo(-5, 2); ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 2); ctx.lineTo(-9, 10); ctx.lineTo(9, 10); ctx.lineTo(5, 2); ctx.stroke();
      if (st.throttle > 0 && st.hp >= 40) {
        ctx.fillStyle = `rgba(110,231,255,${0.3 + 0.3 * st.throttle * (0.7 + 0.3 * Math.sin(t * 18))})`;
        ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.lineTo(0, 10 + 9 * st.throttle); ctx.closePath(); ctx.fill();
      }
    } else if (st.type === 'A') {
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-3.5, -8); ctx.lineTo(3.5, -8); ctx.closePath();
      ctx.fillStyle = 'rgba(110,231,255,0.8)'; ctx.fill();
    } else if (st.type === 'C') {
      ctx.beginPath(); ctx.arc(0, 3, 8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -9); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -9, 1.7, 0, TAU);
      ctx.fillStyle = 'rgba(159,180,200,0.9)'; ctx.fill();
    } else if (st.type === 'S') {
      if (st.jettisoned) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(92,107,125,0.4)';
        ctx.strokeRect(-9, -9, 18, 18);
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255,180,84,0.75)';
        ctx.strokeRect(-9, -9, 18, 18);
        ctx.beginPath();
        ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9);
        ctx.stroke();
      }
    }

    // piloto de estado + etiqueta
    if (!st.jettisoned) {
      ctx.fillStyle = `rgba(${statusColor(st)},0.9)`;
      ctx.fillRect(12, -14, 3, 3);
    }
    ctx.fillStyle = 'rgba(92,107,125,0.75)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(st.jettisoned ? 'EYECTADO' : st.name, 0, 22);
    ctx.restore();
  }

  function draw(ctx, w, h, game, dt) {
    const ship = game.ship, crew = game.crew;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, w, h);

    const engine = ship.station('M');
    drawStars(ctx, w, h, dt, 12 + engine.throttle * 80, ship.time);

    const scale = Math.min((w - 60) / ship.pw, (h - 190) / ship.ph, 1.15);
    const off = FX.offset();
    const ox = (w - ship.pw * scale) / 2 + off.x;
    const oy = (h - ship.ph * scale) / 2 - 26 + off.y;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);

    // suelo
    ctx.fillStyle = '#0d1117';
    for (const f of ship.floors) ctx.fillRect(f.x * TILE, f.y * TILE, TILE + 0.5, TILE + 0.5);
    ctx.strokeStyle = 'rgba(180,205,230,0.04)';
    ctx.lineWidth = 1;
    for (const f of ship.floors) ctx.strokeRect(f.x * TILE + 0.5, f.y * TILE + 0.5, TILE - 1, TILE - 1);

    // muros: casco unificado
    ctx.fillStyle = '#182029';
    for (const k of ship.walls) {
      const [x, y] = k.split(',').map(Number);
      ctx.fillRect(x * TILE, y * TILE, TILE + 0.5, TILE + 0.5);
    }
    // contorno del casco: solo bordes muro↔suelo o muro↔vacío exterior visible
    ctx.strokeStyle = 'rgba(150,170,192,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const k of ship.walls) {
      const [x, y] = k.split(',').map(Number);
      const px = x * TILE, py = y * TILE;
      if (!ship.isWall(x, y - 1) ) { ctx.moveTo(px, py); ctx.lineTo(px + TILE, py); }
      if (!ship.isWall(x, y + 1) ) { ctx.moveTo(px, py + TILE); ctx.lineTo(px + TILE, py + TILE); }
      if (!ship.isWall(x - 1, y) ) { ctx.moveTo(px, py); ctx.lineTo(px, py + TILE); }
      if (!ship.isWall(x + 1, y) ) { ctx.moveTo(px + TILE, py); ctx.lineTo(px + TILE, py + TILE); }
    }
    ctx.stroke();

    // estaciones
    for (const st of ship.stations) drawStation(ctx, st, ship.time);

    // brechas: grieta oscura + borde brillante
    for (const b of ship.breaches) {
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate(Math.atan2(b.diry, b.dirx));
      ctx.fillStyle = '#05070a';
      ctx.fillRect(-4, -9, 12, 18);
      ctx.strokeStyle = `rgba(143,208,255,${0.5 + 0.3 * Math.sin(ship.time * 9 + b.seed)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, -9); ctx.lineTo(2, -3); ctx.lineTo(-2, 1); ctx.lineTo(3, 9);
      ctx.stroke();
      ctx.restore();
    }

    FX.draw(ctx);

    // fuego: resplandor base (las llamas son partículas)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of ship.fires) {
      const g = ctx.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, 30);
      g.addColorStop(0, `rgba(255,150,60,${0.22 + 0.08 * Math.sin(ship.time * 13 + f.x)})`);
      g.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.cx - 30, f.cy - 30, 60, 60);
    }
    ctx.restore();

    // tripulante
    ctx.save();
    ctx.translate(crew.x, crew.y);
    ctx.fillStyle = 'rgba(20,28,36,0.95)';
    ctx.strokeStyle = '#c8d6e5';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, crew.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6ee7ff';
    ctx.beginPath();
    ctx.arc(0, 0, crew.r * 0.55, crew.facing - 0.7, crew.facing + 0.7);
    ctx.stroke();
    // progreso de reparación
    if (game.repairProgress > 0) {
      ctx.strokeStyle = 'rgba(110,231,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, crew.r + 6, -Math.PI / 2, -Math.PI / 2 + game.repairProgress * TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  return { draw };
})();
