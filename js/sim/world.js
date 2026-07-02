/* ============================================================
   Mundo de simulación
   ------------------------------------------------------------
   Espacio abierto sin gravedad. Gestiona naves, rayos láser,
   colisiones nave-nave con resolución de impulsos a nivel de
   bloque (hitboxes precisas) y las oleadas de hostiles.
   ============================================================ */
'use strict';

class World {
  constructor() {
    this.ships = [];
    this.beams = [];
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
    for (const s of this.ships) s.update(dt, this);
    this.collide(dt);
    this.ships = this.ships.filter(s => s.alive);

    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);

    Particles.update(dt);
    this.waveLogic(dt);
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
      const ang = rand(0, TAU);
      const dist = rand(1300, 1900);
      const ship = new Ship(d.blueprint, {
        faction: 'enemy',
        x: this.player.pos.x + Math.cos(ang) * dist,
        y: this.player.pos.y + Math.sin(ang) * dist,
        angle: rand(0, TAU)
      });
      ship.ai = d.strategy;
      ship.sas = true;
      this.addShip(ship);
    }
  }

  /* ---------- raycast global (láseres) ---------- */

  raycast(ox, oy, dx, dy, maxDist, except) {
    let best = null;
    for (const s of this.ships) {
      if (s === except || !s.alive) continue;
      // broadphase: distancia del centro al rayo
      const px = s.pos.x - ox, py = s.pos.y - oy;
      const t = clamp(px * dx + py * dy, 0, maxDist);
      const cx = ox + dx * t - s.pos.x, cy = oy + dy * t - s.pos.y;
      if (cx * cx + cy * cy > s.radius * s.radius) continue;

      const hit = s.raycast(ox, oy, dx, dy, maxDist);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    return best;
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
        if (!best || depth > best.depth) best = { a, b, depth, d: Math.sqrt(d2) };
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
