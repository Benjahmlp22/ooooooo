/* ============================================================
   PATRÓN: STRATEGY — Inteligencia de naves hostiles
   ------------------------------------------------------------
   Cada nave enemiga recibe una estrategia intercambiable que
   solo escribe en ship.intents: la IA vuela con exactamente la
   misma física, combustible y propulsores que el jugador.
   ============================================================ */
'use strict';

class AIStrategy {
  constructor(opts = {}) {
    this.engageRange = opts.engageRange || 460;
    this.fireArc     = opts.fireArc || 0.13;
    this.jitter      = rand(0, TAU);   // desincroniza los enjambres
  }

  update(ship, world, dt) { /* abstracto */ }

  /* orientar la nave hacia un punto: devuelve el error angular */
  steerTo(ship, tx, ty) {
    const fwd = rotV(0, -1, ship.angle);
    const cur = Math.atan2(fwd.y, fwd.x);
    const want = Math.atan2(ty - ship.pos.y, tx - ship.pos.x);
    let err = angDiff(cur, want);
    // anticipación: frenar el giro antes de pasarse
    const eff = err - ship.angVel * 0.4;
    ship.intents.turnR = eff >  0.06 ? 1 : 0;
    ship.intents.turnL = eff < -0.06 ? 1 : 0;
    return err;
  }

  /* punto de intercepción simple según la velocidad relativa */
  leadPoint(ship, target) {
    const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y;
    const t = clamp(Math.hypot(dx, dy) / 900, 0, 1.1);
    return {
      x: target.pos.x + (target.vel.x - ship.vel.x) * t,
      y: target.pos.y + (target.vel.y - ship.vel.y) * t
    };
  }

  resetIntents(ship) {
    const it = ship.intents;
    it.fwd = it.back = it.latL = it.latR = it.turnL = it.turnR = 0;
    it.fire = false;
  }
}

/* --- CAZADOR: persigue, se detiene a distancia de tiro y dispara --- */
class HunterStrategy extends AIStrategy {
  update(ship, world, dt) {
    this.resetIntents(ship);
    const target = world.player;
    if (!target || !target.alive) return;

    const aim = this.leadPoint(ship, target);
    const err = Math.abs(this.steerTo(ship, aim.x, aim.y));
    const dist = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y);

    // control de velocidad relativa para no embestir
    const rel = rotV(ship.vel.x - target.vel.x, ship.vel.y - target.vel.y, -ship.angle);
    if (err < 0.55) {
      if (dist > this.engageRange && rel.y > -260) ship.intents.fwd = 1;
      else if (dist < this.engageRange * 0.55 || rel.y < -300) ship.intents.back = 1;
    }
    ship.intents.fire = err < this.fireArc && dist < 880;
  }
}

/* --- ORBITADOR: mantiene distancia y rodea al objetivo disparando --- */
class OrbitStrategy extends AIStrategy {
  constructor(opts = {}) {
    super(opts);
    this.orbitDist = opts.orbitDist || 380;
    this.dir = Math.random() < 0.5 ? 1 : -1;
  }

  update(ship, world, dt) {
    this.resetIntents(ship);
    const target = world.player;
    if (!target || !target.alive) return;

    const aim = this.leadPoint(ship, target);
    const err = Math.abs(this.steerTo(ship, aim.x, aim.y));
    const dist = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y);

    if (err < 0.7) {
      if (dist > this.orbitDist * 1.25) ship.intents.fwd = 1;
      else if (dist < this.orbitDist * 0.7) ship.intents.back = 1;
      else {
        // desplazamiento lateral: órbita
        if (this.dir > 0) ship.intents.latR = 1; else ship.intents.latL = 1;
      }
    }
    ship.intents.fire = err < this.fireArc && dist < 880;
  }
}

/* ============================================================
   Diseños de naves hostiles (mismos bloques que el jugador)
   ============================================================ */
const ENEMY_DESIGNS = {
  drone: {
    name: 'DRON',
    blocks: [
      { t: 'laser',    x: 0, y: -1, r: 0 },
      { t: 'cabin',    x: 0, y:  0, r: 0 },
      { t: 'tank',     x: -1, y: 0, r: 0 },
      { t: 'gyro',     x: 1, y:  0, r: 0 },
      { t: 'battery',  x: -1, y: 1, r: 0 },
      { t: 'thruster', x: 0, y:  1, r: 0 }
    ]
  },
  interceptor: {
    name: 'INTERCEPTOR',
    blocks: [
      { t: 'laser',    x: 0,  y: -2, r: 0 },
      { t: 'hull',     x: 0,  y: -1, r: 0 },
      { t: 'gyro',     x: -1, y: -1, r: 0 },
      { t: 'battery',  x: 1,  y: -1, r: 0 },
      { t: 'cabin',    x: 0,  y:  0, r: 0 },
      { t: 'reactor',  x: -1, y: 0, r: 0 },
      { t: 'tank',     x: 1,  y:  0, r: 0 },
      { t: 'rcs',      x: -1, y: 1, r: 3 },
      { t: 'thruster', x: 0,  y:  1, r: 0 },
      { t: 'rcs',      x: 1,  y:  1, r: 1 }
    ]
  },
  corvette: {
    name: 'CORBETA',
    blocks: [
      { t: 'laser',    x: -1, y: -2, r: 0 },
      { t: 'armor',    x: 0,  y: -2, r: 0 },
      { t: 'laser',    x: 1,  y: -2, r: 0 },
      { t: 'armor',    x: -1, y: -1, r: 0 },
      { t: 'cabin',    x: 0,  y: -1, r: 0 },
      { t: 'armor',    x: 1,  y: -1, r: 0 },
      { t: 'rcs',      x: -2, y:  0, r: 3 },
      { t: 'tank',     x: -1, y:  0, r: 0 },
      { t: 'reactor',  x: 0,  y:  0, r: 0 },
      { t: 'tank',     x: 1,  y:  0, r: 0 },
      { t: 'rcs',      x: 2,  y:  0, r: 1 },
      { t: 'battery',  x: -1, y:  1, r: 0 },
      { t: 'gyro',     x: 0,  y:  1, r: 0 },
      { t: 'battery',  x: 1,  y:  1, r: 0 },
      { t: 'thruster', x: -1, y: 2, r: 0 },
      { t: 'armor',    x: 0,  y:  2, r: 0 },
      { t: 'thruster', x: 1,  y:  2, r: 0 }
    ]
  }
};

/* composición de cada oleada: crece en dificultad sin gamificación ruidosa */
function pickWaveDesigns(n) {
  const out = [];
  const add = (key, StratCls, opts) =>
    out.push({ blueprint: ENEMY_DESIGNS[key], strategy: new StratCls(opts || {}) });

  if (n === 1) {
    add('drone', HunterStrategy, { engageRange: 320 });
    add('interceptor', HunterStrategy);
  } else if (n === 2) {
    add('drone', HunterStrategy, { engageRange: 300 });
    add('interceptor', HunterStrategy);
    add('interceptor', OrbitStrategy);
  } else {
    const count = Math.min(2 + n, 7);
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      if (roll < 0.3) add('drone', HunterStrategy, { engageRange: rand(260, 360) });
      else if (roll < 0.55 + (n > 4 ? -0.15 : 0)) add('interceptor', Math.random() < 0.5 ? HunterStrategy : OrbitStrategy);
      else add('corvette', OrbitStrategy, { orbitDist: rand(330, 430) });
    }
  }
  return out;
}
