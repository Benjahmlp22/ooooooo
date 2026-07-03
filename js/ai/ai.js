/* ============================================================
   PATRÓN: STRATEGY — Inteligencia de naves hostiles
   ------------------------------------------------------------
   Cada nave enemiga recibe una estrategia intercambiable que
   solo escribe en ship.intents: la IA vuela con exactamente la
   misma física, combustible y propulsores que el jugador.

   Pilotaje: control por VELOCIDAD DESEADA — la estrategia decide
   qué vector de velocidad quiere (interceptar, orbitar, huir,
   separarse de aliados, esquivar planetas) y el piloto lo
   convierte en intenciones proporcionales de empuje y giro.
   ============================================================ */
'use strict';

class AIStrategy {
  constructor(opts = {}) {
    this.engageRange = opts.engageRange || 460;
    this.fireArc     = opts.fireArc || 0.13;
    this.fireRange   = opts.fireRange || 840;
    this.projSpeed   = opts.projSpeed || 0;    // >0: apuntado para cañones
  }

  update(ship, world, dt) { /* abstracto */ }

  resetIntents(ship) {
    const it = ship.intents;
    it.fwd = it.back = it.latL = it.latR = it.turnL = it.turnR = 0;
    it.fire = false;
  }

  /* orientación proporcional con anticipación: devuelve el error angular */
  steerTo(ship, tx, ty) {
    const fwd = rotV(0, -1, ship.angle);
    const cur = Math.atan2(fwd.y, fwd.x);
    const want = Math.atan2(ty - ship.pos.y, tx - ship.pos.x);
    const err = angDiff(cur, want);
    const eff = err - ship.angVel * 0.45;        // frenar antes de pasarse
    ship.intents.turnR = eff > 0 ? clamp(eff * 2.4, 0, 1) : 0;
    ship.intents.turnL = eff < 0 ? clamp(-eff * 2.4, 0, 1) : 0;
    return err;
  }

  /* punto de intercepción según velocidad relativa (y del proyectil) */
  leadPoint(ship, target) {
    const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y;
    const closing = this.projSpeed > 0 ? this.projSpeed : 900;
    const t = clamp(Math.hypot(dx, dy) / closing, 0, 1.2);
    return {
      x: target.pos.x + (target.vel.x - ship.vel.x) * t,
      y: target.pos.y + (target.vel.y - ship.vel.y) * t
    };
  }

  /* convierte una velocidad deseada en intenciones de traslación */
  flyTowardsVelocity(ship, dvx, dvy) {
    const loc = rotV(dvx - ship.vel.x, dvy - ship.vel.y, -ship.angle);
    const K = 1 / 150;
    const it = ship.intents;
    it.fwd  = loc.y < 0 ? clamp(-loc.y * K, 0, 1) : 0;
    it.back = loc.y > 0 ? clamp( loc.y * K, 0, 1) : 0;
    it.latL = loc.x < 0 ? clamp(-loc.x * K, 0, 1) : 0;
    it.latR = loc.x > 0 ? clamp( loc.x * K, 0, 1) : 0;
  }

  /* componentes comunes: separación de aliados + evitar planetas */
  avoidance(ship, world) {
    let ax = 0, ay = 0;
    for (const o of world.ships) {
      if (o === ship || !o.alive || o.faction !== ship.faction) continue;
      const dx = ship.pos.x - o.pos.x, dy = ship.pos.y - o.pos.y;
      const d = Math.hypot(dx, dy);
      const min = ship.radius + o.radius + 90;
      if (d > 0.1 && d < min) {
        const f = (min - d) / min * 260;
        ax += dx / d * f; ay += dy / d * f;
      }
    }
    for (const pl of world.planets) {
      const dx = ship.pos.x - pl.x, dy = ship.pos.y - pl.y;
      const d = Math.hypot(dx, dy) || 1;
      const danger = pl.r + pl.atmo + 520;
      if (d < danger) {
        // subir: cuanto más hondo, más urgencia (vence a la gravedad)
        const f = (1 - (d - pl.r) / (danger - pl.r)) * 620 + 160;
        ax += dx / d * f; ay += dy / d * f;
      }
    }
    return { ax, ay };
  }

  tryFire(ship, err, dist) {
    ship.intents.fire = Math.abs(err) < this.fireArc && dist < this.fireRange;
  }
}

/* --- CAZADOR: intercepta, iguala velocidad a distancia de tiro --- */
class HunterStrategy extends AIStrategy {
  update(ship, world, dt) {
    this.resetIntents(ship);
    const target = world.player;
    if (!target || !target.alive) return;

    const aim = this.leadPoint(ship, target);
    const err = this.steerTo(ship, aim.x, aim.y);

    const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = dx / dist, ty = dy / dist;
    const av = this.avoidance(ship, world);

    let dvx, dvy;
    if (ship.integrity() < 0.35) {
      // malherido: huir manteniendo fuego de cobertura
      dvx = target.vel.x - tx * 430 + av.ax;
      dvy = target.vel.y - ty * 430 + av.ay;
    } else {
      // acercarse hasta la distancia de combate e igualar velocidad
      const speedGoal = clamp((dist - this.engageRange) * 1.5, -240, 500);
      dvx = target.vel.x + tx * speedGoal + av.ax;
      dvy = target.vel.y + ty * speedGoal + av.ay;
    }
    this.flyTowardsVelocity(ship, dvx, dvy);
    this.tryFire(ship, err, dist);
  }
}

/* --- ORBITADOR: rodea al objetivo a distancia fija disparando --- */
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
    const err = this.steerTo(ship, aim.x, aim.y);

    const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = dx / dist, ty = dy / dist;
    const av = this.avoidance(ship, world);

    let dvx, dvy;
    if (ship.integrity() < 0.3) {
      dvx = target.vel.x - tx * 430 + av.ax;
      dvy = target.vel.y - ty * 430 + av.ay;
    } else {
      // radial: corregir hacia la órbita; tangencial: rodear
      const radial = clamp((dist - this.orbitDist) * 1.6, -260, 420);
      const tang = 215 * this.dir;
      dvx = target.vel.x + tx * radial + (-ty) * tang + av.ax;
      dvy = target.vel.y + ty * radial + ( tx) * tang + av.ay;
    }
    this.flyTowardsVelocity(ship, dvx, dvy);
    this.tryFire(ship, err, dist);
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
      { t: 'thruster', x: 1,  y: 2, r: 0 }
    ]
  },
  gunship: {
    name: 'CAÑONERA',
    blocks: [
      { t: 'cannon',   x: 0,  y: -2, r: 0 },
      { t: 'armor',    x: -1, y: -1, r: 0 },
      { t: 'cabin',    x: 0,  y: -1, r: 0 },
      { t: 'armor',    x: 1,  y: -1, r: 0 },
      { t: 'rcs',      x: -2, y:  0, r: 3 },
      { t: 'tank',     x: -1, y:  0, r: 0 },
      { t: 'reactor',  x: 0,  y:  0, r: 0 },
      { t: 'tank',     x: 1,  y:  0, r: 0 },
      { t: 'rcs',      x: 2,  y:  0, r: 1 },
      { t: 'battery',  x: -1, y:  1, r: 0 },
      { t: 'shield',   x: 0,  y:  1, r: 0 },
      { t: 'gyro',     x: 1,  y:  1, r: 0 },
      { t: 'thruster', x: -1, y: 2, r: 0 },
      { t: 'battery',  x: 0,  y:  2, r: 0 },
      { t: 'thruster', x: 1,  y: 2, r: 0 }
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
  } else if (n === 3) {
    add('interceptor', HunterStrategy);
    add('interceptor', OrbitStrategy);
    add('corvette', OrbitStrategy, { orbitDist: 380 });
  } else {
    const count = Math.min(2 + n, 7);
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      if (roll < 0.25) add('drone', HunterStrategy, { engageRange: rand(260, 360) });
      else if (roll < 0.5) add('interceptor', Math.random() < 0.5 ? HunterStrategy : OrbitStrategy);
      else if (roll < 0.75) add('gunship', HunterStrategy, { engageRange: 540, fireArc: 0.09, projSpeed: 820, fireRange: 760 });
      else add('corvette', OrbitStrategy, { orbitDist: rand(330, 430) });
    }
  }
  return out;
}
