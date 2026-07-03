/* ============================================================
   Mundo de simulación
   ------------------------------------------------------------
   Espacio abierto + planetas con gravedad newtoniana g·(R/r)²,
   atmósfera (arrastre + reentrada) y suelo con colisión por
   bloque. Gestiona naves, láseres, proyectiles de cañón,
   colisiones nave-nave por impulsos y oleadas de hostiles.
   ============================================================ */
'use strict';

class World {
  constructor() {
    this.ships = [];
    this.beams = [];
    this.projectiles = [];
    this.planets = createDefaultPlanets();
    this.player = null;
    this.wave = 0;
    this.waveTimer = 2.5;   // segundos hasta la primera oleada
    this.pendingWave = true;
  }

  addShip(ship) {
    this.ships.push(ship);
    ship.updateWorldPositions();
    return ship;
  }

  setPlayer(ship) { this.player = this.addShip(ship); }

  enemies() { return this.ships.filter(s => s.alive && s.faction === 'enemy'); }

  update(dt) {
    this.applyGravity(dt);
    for (const s of this.ships) s.update(dt, this);
    this.collide(dt);
    this.collidePlanets(dt);
    this.updateProjectiles(dt);
    this.ships = this.ships.filter(s => s.alive);

    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);

    Particles.update(dt);
    Lights.update(dt);
    this.waveLogic(dt);
  }

  /* ---------- gravedad, atmósfera y reentrada ---------- */

  applyGravity(dt) {
    for (const s of this.ships) {
      if (!s.alive) continue;
      s.reentry = false;
      for (const pl of this.planets) {
        const f = pl.fieldAt(s.pos.x, s.pos.y);
        if (!f) continue;
        s.vel.x += f.gx * dt;
        s.vel.y += f.gy * dt;

        if (f.dens > 0) {
          // arrastre atmosférico (exponencial, estable)
          const k = Math.exp(-f.dens * 0.55 * dt);
          s.vel.x *= k; s.vel.y *= k;
          s.angVel *= Math.exp(-f.dens * 0.8 * dt);

          // calentamiento de reentrada: plasma en el borde de ataque
          const sp = Math.hypot(s.vel.x, s.vel.y);
          if (f.dens > 0.12 && sp > 420) {
            s.reentry = true;
            const dx = s.vel.x / sp, dy = s.vel.y / sp;
            const lx = s.pos.x + dx * s.radius * 0.8;
            const ly = s.pos.y + dy * s.radius * 0.8;
            const heat = clamp((sp - 420) / 700, 0, 1) * f.dens;
            Lights.add(lx, ly, 90 + heat * 120, '255,150,70', 0.3 * heat + 0.1);
            if (Math.random() < dt * 90 * heat) {
              Particles.spawn({
                x: lx + rand(-s.radius * 0.6, s.radius * 0.6),
                y: ly + rand(-s.radius * 0.6, s.radius * 0.6),
                vx: s.vel.x * 0.25 - dx * rand(80, 200) + rand(-60, 60),
                vy: s.vel.y * 0.25 - dy * rand(80, 200) + rand(-60, 60),
                life: rand(0.2, 0.55), size: rand(1.5, 3.5),
                color: Math.random() < 0.6 ? '255,150,70' : '255,220,150',
                drag: 0.93, glow: true
              });
            }
          }
        }
      }
    }
  }

  /* ---------- suelo planetario: contacto por bloque ---------- */

  collidePlanets(dt) {
    for (const s of this.ships) {
      if (!s.alive) continue;
      s.grounded = false;
      for (const pl of this.planets) {
        const d = Math.hypot(s.pos.x - pl.x, s.pos.y - pl.y);
        if (d > pl.r + s.radius + CELL) continue;

        let deepest = null, contacts = 0;
        for (const b of [...s.blockArr]) {
          if (!s.alive || !s.blocks.has(keyOf(b.gx, b.gy))) continue;
          const bd = Math.hypot(b.wx - pl.x, b.wy - pl.y) || 1;
          const pen = pl.r + CELL * 0.45 - bd;
          if (pen <= 0) continue;

          const nx = (b.wx - pl.x) / bd, ny = (b.wy - pl.y) / bd;
          s.grounded = true;

          const rx = b.wx - s.pos.x, ry = b.wy - s.pos.y;
          const vpx = s.vel.x - s.angVel * ry, vpy = s.vel.y + s.angVel * rx;
          const vn = vpx * nx + vpy * ny;

          if (vn < 0) {
            const rXn = rx * ny - ry * nx;
            const invSum = 1 / s.mass + (rXn * rXn) / s.inertia;
            const j = -(1 + 0.05) * vn / invSum;
            s.applyImpulse(j * nx, j * ny, b.wx, b.wy);

            // fricción tangencial
            const vtx = vpx - vn * nx, vty = vpy - vn * ny;
            const vt = Math.hypot(vtx, vty);
            if (vt > 0.5) {
              const tx = vtx / vt, ty = vty / vt;
              const rXt = rx * ty - ry * tx;
              const invT = 1 / s.mass + (rXt * rXt) / s.inertia;
              const jt = Math.min(vt / invT * 0.9, j * 0.5);
              s.applyImpulse(-tx * jt, -ty * jt, b.wx, b.wy);
            }

            // daño por aterrizaje brusco: el tren aguanta mucho más
            const thr = b.def.landing ? 340 : 125;
            if (-vn > thr) {
              const dmg = (-vn - thr) * 0.25;
              Events.emit('impact', { x: b.wx, y: b.wy, j: -vn * 6 });
              s.damageBlock(b, dmg, b.wx, b.wy);
              Particles.burst(b.wx, b.wy, 8, { color: '190,180,160', spMax: 140, life: 0.7 });
            }
          }

          if (!deepest || pen > deepest.pen) deepest = { pen, nx, ny };
          if (++contacts > 12) break;
        }

        if (deepest && s.alive) {
          s.pos.x += deepest.nx * deepest.pen;
          s.pos.y += deepest.ny * deepest.pen;
          s.angVel *= (1 - 1.4 * dt);      // asentamiento
        }
      }
    }
  }

  /* ---------- oleadas ---------- */

  waveLogic(dt) {
    if (!this.player || !this.player.alive) return;
    const hostiles = this.enemies().length;

    if (hostiles === 0 && !this.pendingWave) {
      this.pendingWave = true;
      this.waveTimer = 5;
      if (this.wave > 0) Events.emit('wave:cleared', { wave: this.wave });
    }
    if (this.pendingWave) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.pendingWave = false;
        this.wave++;
        this.spawnWave(this.wave);
        Events.emit('wave:start', { wave: this.wave });
      }
    }
  }

  spawnWave(n) {
    const designs = pickWaveDesigns(n);
    for (const d of designs) {
      let x = 0, y = 0, ok = false;
      for (let tries = 0; tries < 14 && !ok; tries++) {
        const ang = rand(0, TAU);
        const dist = rand(1300, 1900);
        x = this.player.pos.x + Math.cos(ang) * dist;
        y = this.player.pos.y + Math.sin(ang) * dist;
        ok = this.planets.every(pl =>
          Math.hypot(x - pl.x, y - pl.y) > pl.r + pl.atmo + 500);
      }
      if (!ok) continue;   // jugador demasiado rodeado de planeta: menos enemigos
      const ship = new Ship(d.blueprint, {
        faction: 'enemy', x, y, angle: rand(0, TAU)
      });
      ship.ai = d.strategy;
      ship.sas = true;
      this.addShip(ship);
    }
  }

  /* ---------- raycast global (láseres): bloques y escudos ---------- */

  raycast(ox, oy, dx, dy, maxDist, except) {
    let best = null;
    for (const s of this.ships) {
      if (s === except || !s.alive) continue;

      let cand = null;
      if (s.shieldCap() > 0 && s.shieldActive()) {
        const t = rayCircleT(ox, oy, dx, dy, s.pos.x, s.pos.y, s.shieldR(), maxDist);
        if (t !== null) cand = { t, ship: s, shieldHit: true, x: ox + dx * t, y: oy + dy * t };
      } else {
        // broadphase: distancia del centro al rayo
        const px = s.pos.x - ox, py = s.pos.y - oy;
        const tt = clamp(px * dx + py * dy, 0, maxDist);
        const cx = ox + dx * tt - s.pos.x, cy = oy + dy * tt - s.pos.y;
        if (cx * cx + cy * cy > s.radius * s.radius) continue;
        cand = s.raycast(ox, oy, dx, dy, maxDist);
      }
      if (cand && (!best || cand.t < best.t)) best = cand;
    }
    return best;
  }

  /* ---------- proyectiles de cañón ---------- */

  spawnProjectile(p) { this.projectiles.push(p); }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.life <= 0) continue;

      // gravedad y suelo
      for (const pl of this.planets) {
        const f = pl.fieldAt(p.x, p.y);
        if (!f) continue;
        p.vx += f.gx * dt; p.vy += f.gy * dt;
        if (f.alt <= 0) {
          p.life = 0;
          Particles.burst(p.x, p.y, 10, { color: '200,190,170', spMax: 160, life: 0.6 });
          Lights.flash(p.x, p.y, 70, '255,200,140', 0.4, 0.2);
        }
      }
      if (p.life <= 0) continue;

      const px = p.x, py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // impacto: raycast del segmento recorrido este frame
      const seg = Math.hypot(p.x - px, p.y - py);
      if (seg <= 0.001) continue;
      const dx = (p.x - px) / seg, dy = (p.y - py) / seg;
      const hit = this.raycast(px, py, dx, dy, seg, p.owner);
      if (!hit) continue;

      p.life = 0;
      if (hit.shieldHit) {
        hit.ship.hitShield(p.dmg * 0.85, hit.x, hit.y);
        hit.ship.applyImpulse(dx * p.punch * 0.4, dy * p.punch * 0.4, hit.x, hit.y);
      } else {
        hit.ship.applyImpulse(dx * p.punch, dy * p.punch, hit.x, hit.y);
        hit.ship.damageBlock(hit.block, p.dmg, hit.x, hit.y);
        Events.emit('impact', { x: hit.x, y: hit.y, j: 900 });
        Particles.burst(hit.x, hit.y, 9, { color: '255,190,120', spMax: 190, life: 0.5, glow: true });
        Lights.flash(hit.x, hit.y, 90, '255,190,120', 0.5, 0.2);
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  /* ---------- colisiones nave-nave por bloque ---------- */

  collide(dt) {
    const R = CELL * 0.95;          // distancia de contacto entre centros de bloque
    for (let i = 0; i < this.ships.length; i++) {
      for (let j = i + 1; j < this.ships.length; j++) {
        const A = this.ships[i], B = this.ships[j];
        if (!A.alive || !B.alive) continue;
        const dx = B.pos.x - A.pos.x, dy = B.pos.y - A.pos.y;
        const rr = A.radius + B.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        this.collidePair(A, B, R);
      }
    }
  }

  collidePair(A, B, R) {
    // buscar el contacto más profundo entre bloques
    let best = null;
    for (const a of A.blockArr) {
      for (const b of B.blockArr) {
        const d2 = dist2(a.wx, a.wy, b.wx, b.wy);
        if (d2 >= R * R) continue;
        const depth = R - Math.sqrt(d2);
        if (!best || depth > best.depth) best = { a, b, depth };
      }
    }
    if (!best) return;

    const { a, b, depth } = best;
    let nx = b.wx - a.wx, ny = b.wy - a.wy;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const cx = (a.wx + b.wx) / 2, cy = (a.wy + b.wy) / 2;

    // separación posicional ponderada por masa
    const total = A.mass + B.mass;
    A.pos.x -= nx * depth * (B.mass / total) * 0.6;
    A.pos.y -= ny * depth * (B.mass / total) * 0.6;
    B.pos.x += nx * depth * (A.mass / total) * 0.6;
    B.pos.y += ny * depth * (A.mass / total) * 0.6;

    // velocidad relativa en el punto de contacto
    const rax = cx - A.pos.x, ray = cy - A.pos.y;
    const rbx = cx - B.pos.x, rby = cy - B.pos.y;
    const vax = A.vel.x - A.angVel * ray, vay = A.vel.y + A.angVel * rax;
    const vbx = B.vel.x - B.angVel * rby, vby = B.vel.y + B.angVel * rbx;
    const rvx = vbx - vax, rvy = vby - vay;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;

    const raXn = rax * ny - ray * nx;
    const rbXn = rbx * ny - rby * nx;
    const invSum = 1 / A.mass + 1 / B.mass +
                   (raXn * raXn) / A.inertia + (rbXn * rbXn) / B.inertia;
    const e = 0.18;
    const jImp = -(1 + e) * vn / invSum;

    A.applyImpulse(-jImp * nx, -jImp * ny, cx, cy);
    B.applyImpulse( jImp * nx,  jImp * ny, cx, cy);

    Events.emit('impact', { x: cx, y: cy, j: jImp });

    // daño estructural por impacto fuerte (los roces leves no dañan)
    const dmg = Math.max(0, (jImp - 900) * 0.02);
    if (dmg > 0.5) {
      A.damageBlock(a, dmg, cx, cy);
      if (B.alive && B.blocks.has(keyOf(b.gx, b.gy))) B.damageBlock(b, dmg, cx, cy);
    }
  }
}

/* intersección rayo-círculo: primer t en [0,maxDist] o null */
function rayCircleT(ox, oy, dx, dy, cx, cy, r, maxDist) {
  const fx = ox - cx, fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;                  // origen dentro del círculo
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return (t >= 0 && t <= maxDist) ? t : null;
}
