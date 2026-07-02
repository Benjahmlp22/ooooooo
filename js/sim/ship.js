/* ============================================================
   Nave = cuerpo rígido compuesto por bloques en grilla
   ------------------------------------------------------------
   - Masa, centro de masa e inercia recalculados al cambiar.
   - Cada bloque conserva su hitbox exacta (AABB en el marco
     local de la nave) para raycasts y colisiones precisas.
   - Propulsores: fuerza aplicada en su posición → par realista.
   - Sistemas: combustible, electricidad, reactores, fugas,
     cortocircuitos, láseres con recarga.
   - Sin gravedad: integración newtoniana pura.
   ============================================================ */
'use strict';

class Ship {
  constructor(blueprint, opts = {}) {
    this.name    = blueprint.name || 'NAVE';
    this.faction = opts.faction || 'player';
    this.ai      = null;

    this.pos    = { x: opts.x || 0, y: opts.y || 0 };
    this.vel    = { x: 0, y: 0 };
    this.angle  = opts.angle || 0;
    this.angVel = 0;
    this.alive  = true;
    this.sas    = true;
    this.leaking = false;
    this.shorting = false;

    this.intents = { fwd:0, back:0, latL:0, latR:0, turnL:0, turnR:0, fire:false, killRot:false };

    this.blocks = new Map();
    for (const b of blueprint.blocks) {
      const blk = BlockFactory.create(b.t, b.x, b.y, b.r);
      this.blocks.set(keyOf(b.x, b.y), blk);
    }

    this.comx = 0; this.comy = 0;
    this.recompute(true);
    this.initialHpTotal = this.hpTotal();
    this.updateWorldPositions();
  }

  /* ---------- geometría / masa ---------- */

  recompute(initial) {
    let m = 0, cx = 0, cy = 0;
    for (const b of this.blocks.values()) {
      m += b.def.mass;
      cx += b.gx * b.def.mass;
      cy += b.gy * b.def.mass;
    }
    if (m <= 0) { this.mass = 1; this.blockArr = []; return; }
    cx /= m; cy /= m;

    // al perder bloques en vuelo, desplazar pos para que los bloques
    // conserven su posición en el mundo (el CDM se mueve, no la nave)
    if (!initial) {
      const d = rotV((cx - this.comx) * CELL, (cy - this.comy) * CELL, this.angle);
      this.pos.x += d.x; this.pos.y += d.y;
    }
    this.comx = cx; this.comy = cy;

    this.mass = m;
    this.blockArr = [...this.blocks.values()];
    let I = 0, maxR2 = 0;
    for (const b of this.blockArr) {
      b.lx = (b.gx - cx) * CELL;
      b.ly = (b.gy - cy) * CELL;
      const r2 = b.lx * b.lx + b.ly * b.ly;
      I += b.def.mass * (r2 + CELL * CELL / 6);
      if (r2 > maxR2) maxR2 = r2;
    }
    this.inertia = Math.max(I, 200);
    this.radius = Math.sqrt(maxR2) + CELL;
  }

  updateWorldPositions() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    for (const b of this.blockArr) {
      b.wx = this.pos.x + b.lx * c - b.ly * s;
      b.wy = this.pos.y + b.lx * s + b.ly * c;
    }
  }

  /* ---------- recursos ---------- */

  totalFuel()  { let t = 0; for (const b of this.blockArr) if (b.fuel)   t += b.fuel;   return t; }
  fuelCap()    { let t = 0; for (const b of this.blockArr) if (b.def.fuelCap)  t += b.def.fuelCap;  return t; }
  totalPower() { let t = 0; for (const b of this.blockArr) if (b.charge) t += b.charge; return t; }
  powerCap()   { let t = 0; for (const b of this.blockArr) if (b.def.powerCap) t += b.def.powerCap; return t; }
  hpTotal()    { let t = 0; for (const b of this.blockArr) t += b.hp; return t; }
  integrity()  { return this.initialHpTotal ? this.hpTotal() / this.initialHpTotal : 0; }

  drawFuel(amount) {
    const total = this.totalFuel();
    if (total <= 0.0001) return 0;
    const take = Math.min(amount, total);
    for (const b of this.blockArr)
      if (b.fuel) b.fuel = Math.max(0, b.fuel - take * (b.fuel / total));
    return take;
  }

  drawPower(amount) {
    const total = this.totalPower();
    if (total <= 0.0001) return 0;
    const take = Math.min(amount, total);
    for (const b of this.blockArr)
      if (b.charge) b.charge = Math.max(0, b.charge - take * (b.charge / total));
    return take;
  }

  addPower(amount) {
    for (const b of this.blockArr) {
      if (b.def.powerCap === undefined) continue;
      const space = b.def.powerCap - b.charge;
      if (space <= 0) continue;
      const put = Math.min(space, amount);
      b.charge += put; amount -= put;
      if (amount <= 0) break;
    }
  }

  /* ---------- bucle principal ---------- */

  update(dt, world) {
    if (!this.alive) return;
    this.updateWorldPositions();
    if (this.ai) this.ai.update(this, world, dt);
    this.systems(dt);
    this.control(dt);
    if (this.intents.fire) this.fireLasers(world);

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.angle += this.angVel * dt;
  }

  /* sistemas de a bordo: reactores, fugas, cortos, recargas */
  systems(dt) {
    this.leaking = false;
    this.shorting = false;

    for (const b of this.blockArr) {
      const def = b.def;
      if (b.cooldown > 0) b.cooldown -= dt;

      // reactor: combustible → electricidad
      if (def.powerGen) {
        const damaged = b.hp < def.hp * 0.5;
        const eff = damaged ? 0.5 : 1;
        const burn = def.fuelBurn * eff * dt;
        const got = this.drawFuel(burn);
        if (got > 0) this.addPower(def.powerGen * eff * dt * (got / burn));
        if (damaged && Math.random() < dt * 6) {
          Particles.spawn({
            x: b.wx + rand(-4, 4), y: b.wy + rand(-4, 4),
            vx: this.vel.x * 0.6 + rand(-12, 12), vy: this.vel.y * 0.6 + rand(-12, 12),
            life: rand(0.8, 1.6), size: rand(2, 4), color: '120,128,138',
            drag: 0.96, grow: 3
          });
        }
      }

      // fuga de combustible: tanque dañado pierde gas que además empuja
      if (def.fuelCap && b.fuel > 0 && b.hp < def.hp * 0.5) {
        this.leaking = true;
        if (!b.leakDir) {
          b.leakDir = rand(0, TAU);
          Events.emit('leak:start', { ship: this });
        }
        b.fuel = Math.max(0, b.fuel - 3.0 * dt);
        const dir = rotV(Math.cos(b.leakDir), Math.sin(b.leakDir), this.angle);
        // reacción: el gas expulsado empuja la nave al lado contrario
        this.applyForce(-dir.x * 240, -dir.y * 240, b.wx, b.wy, dt);
        if (Math.random() < dt * 60) {
          Particles.spawn({
            x: b.wx + dir.x * CELL * 0.4, y: b.wy + dir.y * CELL * 0.4,
            vx: this.vel.x + dir.x * rand(60, 140) + rand(-15, 15),
            vy: this.vel.y + dir.y * rand(60, 140) + rand(-15, 15),
            life: rand(0.4, 0.9), size: rand(1.5, 3), color: '255,180,84',
            drag: 0.94, glow: true
          });
        }
      }

      // batería dañada: cortocircuitos y pérdida de carga
      if (def.powerCap && b.charge > 0 && b.hp < def.hp * 0.5) {
        this.shorting = true;
        b.charge = Math.max(0, b.charge - 2.0 * dt);
        if (Math.random() < dt * 3.5) {
          Events.emit('spark', {});
          Particles.burst(b.wx, b.wy, 5, { color: '163,230,53', spMax: 130, life: 0.3, glow: true });
        }
      }
    }
  }

  /* control de vuelo: asigna encendido a cada propulsor según la intención */
  control(dt) {
    const it = this.intents;
    const fuelAvail = this.totalFuel() > 0.001;
    let fx = 0, fy = 0, torque = 0;
    this.throttleTotal = 0;

    for (const b of this.blockArr) {
      const def = b.def;
      if (!def.thrust) continue;

      const dir = DIRS[b.rot];                        // dirección de empuje local
      const tq = b.lx * dir.y * def.thrust - b.ly * dir.x * def.thrust; // par que genera
      let act = 0;

      if (fuelAvail) {
        // traslación: activar si el empuje apunta a donde se quiere ir
        if (it.fwd  && dir.y < -0.5) act = Math.max(act, it.fwd);
        if (it.back && dir.y >  0.5) act = Math.max(act, it.back);
        if (it.latL && dir.x < -0.5) act = Math.max(act, it.latL);
        if (it.latR && dir.x >  0.5) act = Math.max(act, it.latR);
        // giro: activar si su par ayuda al giro pedido
        const lever = Math.abs(tq) / (def.thrust * CELL);
        if (lever > 0.25) {
          if (it.turnR && tq > 0) act = Math.max(act, 1);
          if (it.turnL && tq < 0) act = Math.max(act, 1);
          if (it.killRot || (this.sas && !it.turnL && !it.turnR)) {
            // amortiguar rotación con los propulsores adecuados
            const damp = clamp(-this.angVel * Math.sign(tq) * 0.8, 0, 1);
            if (Math.abs(this.angVel) > 0.05) act = Math.max(act, damp * (it.killRot ? 1 : 0.6));
          }
        }
      }

      b.throttle += (act - b.throttle) * Math.min(1, dt * 14);
      if (b.throttle < 0.02) { b.throttle = Math.max(0, b.throttle - dt); continue; }

      const need = def.fuelUse * b.throttle * dt;
      const got = this.drawFuel(need);
      const eff = need > 0 ? b.throttle * (got / need) : 0;
      if (eff <= 0.001) continue;

      const F = def.thrust * eff;
      fx += dir.x * F; fy += dir.y * F;
      torque += tq * eff;
      this.throttleTotal += eff * (def.thrust > 3000 ? 1 : 0.3);

      // pluma de escape
      const wdir = rotV(dir.x, dir.y, this.angle);
      const ex = b.wx - wdir.x * CELL * 0.6, ey = b.wy - wdir.y * CELL * 0.6;
      const rate = dt * (def.thrust > 3000 ? 110 : 45) * eff;
      let nP = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      while (nP-- > 0) {
        Particles.spawn({
          x: ex + rand(-3, 3), y: ey + rand(-3, 3),
          vx: this.vel.x - wdir.x * rand(220, 380) + rand(-25, 25),
          vy: this.vel.y - wdir.y * rand(220, 380) + rand(-25, 25),
          life: rand(0.12, 0.4), size: rand(1.2, 2.6),
          color: Math.random() < 0.75 ? '140,220,255' : '255,240,200',
          drag: 0.92, glow: true
        });
      }
    }

    // giroscopios: par directo consumiendo electricidad
    let gyroT = 0, gyroUse = 0;
    for (const b of this.blockArr) {
      if (!b.def.torque) continue;
      gyroT += b.def.torque * (b.hp < b.def.hp * 0.5 ? 0.5 : 1);
      gyroUse += b.def.powerUse;
    }
    if (gyroT > 0) {
      let want = 0;
      if (it.turnR) want += 1;
      if (it.turnL) want -= 1;
      if (want === 0 && (it.killRot || this.sas)) {
        want = clamp(-this.angVel * this.inertia / (gyroT * 0.25), -1, 1);
        if (Math.abs(this.angVel) < 0.01) want = 0;
      }
      if (want !== 0) {
        const need = gyroUse * Math.abs(want) * dt;
        const got = this.drawPower(need);
        const eff = need > 0 ? got / need : 0;
        torque += gyroT * want * eff;
      }
    }

    // aplicar fuerzas en el marco del mundo
    const wf = rotV(fx, fy, this.angle);
    this.vel.x += wf.x / this.mass * dt;
    this.vel.y += wf.y / this.mass * dt;
    this.angVel += torque / this.inertia * dt;
  }

  applyForce(fx, fy, px, py, dt) {
    this.vel.x += fx / this.mass * dt;
    this.vel.y += fy / this.mass * dt;
    const rx = px - this.pos.x, ry = py - this.pos.y;
    this.angVel += (rx * fy - ry * fx) / this.inertia * dt;
  }

  applyImpulse(jx, jy, px, py) {
    this.vel.x += jx / this.mass;
    this.vel.y += jy / this.mass;
    const rx = px - this.pos.x, ry = py - this.pos.y;
    this.angVel += (rx * jy - ry * jx) / this.inertia;
  }

  /* ---------- armas ---------- */

  fireLasers(world) {
    for (const b of this.blockArr) {
      const L = b.def.laser;
      if (!L || b.cooldown > 0) continue;
      if (this.drawPower(L.cost) < L.cost * 0.999) continue;
      b.cooldown = L.cooldown;

      const dirL = DIRS[b.rot];
      const dir = rotV(dirL.x, dirL.y, this.angle);
      const ox = b.wx + dir.x * CELL * 0.6, oy = b.wy + dir.y * CELL * 0.6;
      const hit = world.raycast(ox, oy, dir.x, dir.y, L.range, this);

      const ex = hit ? hit.x : ox + dir.x * L.range;
      const ey = hit ? hit.y : oy + dir.y * L.range;
      world.beams.push({
        x1: ox, y1: oy, x2: ex, y2: ey,
        life: 0.09, maxLife: 0.09,
        color: this.faction === 'player' ? '110,231,255' : '255,110,110'
      });
      Events.emit('laser:fire', { ship: this });

      if (hit) {
        Events.emit('laser:hit', { x: hit.x, y: hit.y, color: this.faction === 'player' ? '110,231,255' : '255,110,110' });
        hit.ship.damageBlock(hit.block, L.dmg, hit.x, hit.y);
      }
    }
  }

  /* raycast contra las hitboxes exactas (AABB por bloque en marco local) */
  raycast(ox, oy, dx, dy, maxDist) {
    const rel = rotV(ox - this.pos.x, oy - this.pos.y, -this.angle);
    const d = rotV(dx, dy, -this.angle);
    const h = CELL / 2;
    let best = null;

    for (const b of this.blockArr) {
      const minX = b.lx - h, maxX = b.lx + h;
      const minY = b.ly - h, maxY = b.ly + h;
      let t0 = 0, t1 = maxDist;

      if (Math.abs(d.x) < 1e-9) {
        if (rel.x < minX || rel.x > maxX) continue;
      } else {
        let ta = (minX - rel.x) / d.x, tb = (maxX - rel.x) / d.x;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (Math.abs(d.y) < 1e-9) {
        if (rel.y < minY || rel.y > maxY) continue;
      } else {
        let ta = (minY - rel.y) / d.y, tb = (maxY - rel.y) / d.y;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (t0 >= 0 && (!best || t0 < best.t)) best = { t: t0, block: b };
    }

    if (!best) return null;
    return { t: best.t, block: best.block, ship: this, x: ox + dx * best.t, y: oy + dy * best.t };
  }

  /* ---------- daño ---------- */

  damageBlock(block, dmg, x, y) {
    dmg *= 1 - (block.def.resist || 0);
    block.hp -= dmg;
    Events.emit('block:hit', { ship: this, block, x, y });
    if (block.hp <= 0) this.destroyBlock(block);
  }

  destroyBlock(block) {
    Events.emit('block:destroyed', {
      x: block.wx, y: block.wy,
      rgb: hexToRgb(block.def.color)
    });
    this.blocks.delete(keyOf(block.gx, block.gy));

    if (block.type === 'cabin' || this.blocks.size === 0) { this.destroy(); return; }

    this.recompute(false);
    this.dropOrphans();
    this.updateWorldPositions();
  }

  /* los bloques desconectados de la cabina se desprenden como escombros */
  dropOrphans() {
    let cabin = null;
    for (const b of this.blocks.values()) if (b.type === 'cabin') { cabin = b; break; }
    if (!cabin) { this.destroy(); return; }

    const seen = new Set([keyOf(cabin.gx, cabin.gy)]);
    const stack = [cabin];
    while (stack.length) {
      const b = stack.pop();
      for (const d of DIRS) {
        const k = keyOf(b.gx + d.x, b.gy + d.y);
        if (!seen.has(k) && this.blocks.has(k)) { seen.add(k); stack.push(this.blocks.get(k)); }
      }
    }

    let dropped = false;
    for (const [k, b] of [...this.blocks]) {
      if (seen.has(k)) continue;
      dropped = true;
      this.blocks.delete(k);
      Particles.burst(b.wx, b.wy, 5, {
        color: hexToRgb(b.def.color), spMax: 90, life: 2.2,
        shape: 'shard', size: 3.5, drag: 0.985, vx: this.vel.x * 0.8, vy: this.vel.y * 0.8
      });
    }
    if (dropped) this.recompute(false);
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    Events.emit('ship:destroyed', { x: this.pos.x, y: this.pos.y, ship: this });
  }

  /* ---------- render ---------- */

  render(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    for (const b of this.blockArr) {
      ctx.save();
      ctx.translate(b.lx, b.ly);
      drawBlock(ctx, b, CELL);
      ctx.restore();
    }
    ctx.restore();
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
