/* ============================================================
   El tripulante: deriva en gravedad cero por el interior
   ------------------------------------------------------------
   WASD aplica impulso (mochila de maniobra); sin rozamiento
   real, solo un leve agarre. Colisión círculo-casilla contra
   los muros. Las brechas succionan aire... y a ti.
   ============================================================ */
'use strict';

class Crew {
  constructor(ship) {
    this.ship = ship;
    this.x = 12.5 * TILE; this.y = 7.5 * TILE;   // arranca junto al timón
    this.vx = 0; this.vy = 0;
    this.r = 8;
    this.hp = 100;
    this.facing = 0;
    this.puffT = 0;
  }

  update(dt, input) {
    const ACCEL = 300;
    let ax = 0, ay = 0;
    if (input.has('KeyW')) ay -= 1;
    if (input.has('KeyS')) ay += 1;
    if (input.has('KeyA')) ax -= 1;
    if (input.has('KeyD')) ax += 1;
    const m = Math.hypot(ax, ay);
    if (m > 0) {
      ax /= m; ay /= m;
      this.vx += ax * ACCEL * dt;
      this.vy += ay * ACCEL * dt;
      this.facing = Math.atan2(ay, ax);
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 0.04;
        FX.spawn({
          x: this.x - ax * 10, y: this.y - ay * 10,
          vx: this.vx * 0.3 - ax * rand(60, 110) + rand(-14, 14),
          vy: this.vy * 0.3 - ay * rand(60, 110) + rand(-14, 14),
          life: rand(0.15, 0.35), size: rand(1, 2.2),
          color: '150,220,255', glow: true
        });
      }
    }
    // leve agarre (pasamanos): no es fricción total, sigues derivando
    const grip = Math.pow(0.55, dt);
    this.vx *= grip; this.vy *= grip;

    // succión de las brechas
    for (const b of this.ship.breaches) {
      const d2 = dist2(this.x, this.y, b.cx, b.cy);
      if (d2 < 210 * 210 && d2 > 1) {
        const d = Math.sqrt(d2);
        const f = (1 - d / 210) * 95;
        this.vx += (b.cx - this.x) / d * f * dt;
        this.vy += (b.cy - this.y) / d * f * dt;
      }
    }

    // integrar + colisión con muros
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.collide();

    // salud: asfixia y fuego
    if (this.ship.o2 <= 0.5) this.hp = Math.max(0, this.hp - 6.5 * dt);
    else if (this.ship.o2 > 30 && this.hp < 100) this.hp = Math.min(100, this.hp + 0.9 * dt);
    for (const f of this.ship.fires) {
      if (dist2(this.x, this.y, f.cx, f.cy) < 34 * 34) this.hp = Math.max(0, this.hp - 14 * dt);
    }
  }

  collide() {
    const s = this.ship;
    const tx0 = Math.floor((this.x - this.r) / TILE), tx1 = Math.floor((this.x + this.r) / TILE);
    const ty0 = Math.floor((this.y - this.r) / TILE), ty1 = Math.floor((this.y + this.r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!s.isWall(tx, ty)) continue;
        // punto más cercano del AABB de la casilla
        const nx = clamp(this.x, tx * TILE, (tx + 1) * TILE);
        const ny = clamp(this.y, ty * TILE, (ty + 1) * TILE);
        const dx = this.x - nx, dy = this.y - ny;
        const d2v = dx * dx + dy * dy;
        if (d2v >= this.r * this.r || d2v === 0) continue;
        const d = Math.sqrt(d2v);
        const push = this.r - d;
        this.x += dx / d * push;
        this.y += dy / d * push;
        // anular la componente de velocidad hacia el muro
        const vn = this.vx * (dx / d) + this.vy * (dy / d);
        if (vn < 0) { this.vx -= dx / d * vn; this.vy -= dy / d * vn; }
      }
    }
  }

  /* objeto interactuable más cercano: brecha, fuego o estación */
  nearest() {
    const s = this.ship;
    let best = null, bestD = 62 * 62;
    for (const b of s.breaches) {
      const d = dist2(this.x, this.y, b.cx, b.cy);
      if (d < bestD) { bestD = d; best = { kind: 'breach', obj: b }; }
    }
    for (const f of s.fires) {
      const d = dist2(this.x, this.y, f.cx, f.cy);
      if (d < bestD) { bestD = d; best = { kind: 'fire', obj: f }; }
    }
    for (const st of s.stations) {
      if (st.jettisoned) continue;
      const d = dist2(this.x, this.y, st.cx, st.cy);
      if (d < bestD) { bestD = d; best = { kind: 'station', obj: st }; }
    }
    return best;
  }
}
