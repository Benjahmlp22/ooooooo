/* ============================================================
   PATRÓN: FACTORY (BlockFactory)
   ------------------------------------------------------------
   Definiciones de bloques dirigidas por datos + fábrica que
   instancia bloques vivos (con PV, combustible, carga...).
   Cada bloque tiene su propio dibujo vectorial minimalista,
   hitbox propia (celda exacta) y comportamiento por rotación.
   ============================================================ */
'use strict';

const BLOCK_DEFS = {
  cabin: {
    name: 'CABINA', hotkey: '1',
    desc: 'Núcleo de mando. Obligatoria y única. Almacena algo de energía. Si se destruye, la nave se pierde.',
    mass: 5, hp: 140, powerCap: 30,
    color: '#6ee7ff',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(110,231,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(0, -h + 2); ctx.lineTo(h - 2, h - 3); ctx.lineTo(-h + 2, h - 3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // visor
      ctx.strokeStyle = '#6ee7ff';
      ctx.beginPath();
      ctx.moveTo(-h * 0.32, h * 0.1); ctx.lineTo(h * 0.32, h * 0.1);
      ctx.stroke();
    }
  },

  hull: {
    name: 'CASCO', hotkey: '2',
    desc: 'Estructura ligera. Conecta módulos con poca masa.',
    mass: 2, hp: 80,
    color: '#8a97a5',
    draw(ctx, s) {
      const h = s / 2 - 1.5;
      ctx.strokeStyle = '#77879a'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(140,155,172,0.05)';
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.fillRect(-h, -h, h * 2, h * 2);
      ctx.beginPath();
      ctx.moveTo(-h, -h); ctx.lineTo(h, h);
      ctx.strokeStyle = 'rgba(140,155,172,0.35)';
      ctx.stroke();
    }
  },

  armor: {
    name: 'BLINDAJE', hotkey: '3',
    desc: 'Placa pesada. Absorbe el 55% del daño recibido y resiste impactos.',
    mass: 6, hp: 280, resist: 0.55,
    color: '#aab6c2',
    draw(ctx, s) {
      const h = s / 2 - 1;
      ctx.strokeStyle = '#aab6c2'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(170,182,194,0.10)';
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.fillRect(-h, -h, h * 2, h * 2);
      const i = h * 0.45;
      ctx.lineWidth = 1;
      ctx.strokeRect(-i, -i, i * 2, i * 2);
    }
  },

  tank: {
    name: 'TANQUE', hotkey: '4',
    desc: 'Almacena 100 u. de combustible. Si su casco baja del 50%, pierde combustible por una fuga que además empuja la nave.',
    mass: 3, hp: 70, fuelCap: 100,
    color: '#ffb454',
    draw(ctx, s, block) {
      const h = s / 2 - 2;
      ctx.strokeStyle = '#c98f45'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,180,84,0.05)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-h, -h, h * 2, h * 2, 4); else ctx.rect(-h, -h, h*2, h*2);
      ctx.fill(); ctx.stroke();
      // nivel de combustible
      const lvl = block ? block.fuel / this.fuelCap : 1;
      const fh = (h * 2 - 5) * clamp(lvl, 0, 1);
      ctx.fillStyle = 'rgba(255,180,84,0.35)';
      ctx.fillRect(-h + 2.5, h - 2.5 - fh, h * 2 - 5, fh);
    }
  },

  battery: {
    name: 'BATERÍA', hotkey: '5',
    desc: 'Almacena 120 u. de energía. Dañada, produce cortocircuitos y pierde carga.',
    mass: 3, hp: 60, powerCap: 120,
    color: '#a3e635',
    draw(ctx, s, block) {
      const h = s / 2 - 2;
      ctx.strokeStyle = '#7ea832'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(163,230,53,0.05)';
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.fillRect(-h, -h, h * 2, h * 2);
      const lvl = block ? block.charge / this.powerCap : 1;
      const bars = Math.round(clamp(lvl, 0, 1) * 3);
      ctx.fillStyle = 'rgba(163,230,53,0.45)';
      for (let i = 0; i < bars; i++) {
        ctx.fillRect(-h + 3, h - 5 - i * 6, h * 2 - 6, 3.5);
      }
    }
  },

  reactor: {
    name: 'REACTOR', hotkey: '6',
    desc: 'Quema 0.9 u/s de combustible y genera 10 u/s de energía. Dañado rinde la mitad y humea.',
    mass: 7, hp: 100, powerGen: 10, fuelBurn: 0.9,
    color: '#a3e635',
    draw(ctx, s) {
      const h = s / 2 - 1.5;
      ctx.strokeStyle = '#7ea832'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(163,230,53,0.06)';
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.fillRect(-h, -h, h * 2, h * 2);
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.5, 0, TAU);
      ctx.strokeStyle = '#a3e635';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.16, 0, TAU);
      ctx.fillStyle = '#a3e635';
      ctx.fill();
    }
  },

  thruster: {
    name: 'PROPULSOR', hotkey: '7',
    desc: 'Empuje principal: 5200 N. Consume 3.2 u/s de combustible. Direccional: empuja hacia donde apunta (R para rotar).',
    mass: 3, hp: 70, thrust: 5200, fuelUse: 3.2, directional: true,
    color: '#6ee7ff',
    draw(ctx, s, block) {
      const h = s / 2;
      // cuerpo (apunta hacia arriba en rot 0; tobera abajo)
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(159,180,200,0.06)';
      ctx.beginPath();
      ctx.moveTo(-h * 0.55, -h + 2);
      ctx.lineTo(h * 0.55, -h + 2);
      ctx.lineTo(h * 0.55, h * 0.25);
      ctx.lineTo(-h * 0.55, h * 0.25);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // tobera
      ctx.beginPath();
      ctx.moveTo(-h * 0.4, h * 0.25);
      ctx.lineTo(-h * 0.75, h - 2);
      ctx.lineTo(h * 0.75, h - 2);
      ctx.lineTo(h * 0.4, h * 0.25);
      ctx.stroke();
      // brillo si está encendido
      if (block && block.throttle > 0.05) {
        ctx.fillStyle = `rgba(110,231,255,${0.35 * block.throttle})`;
        ctx.beginPath();
        ctx.moveTo(-h * 0.5, h - 2); ctx.lineTo(h * 0.5, h - 2); ctx.lineTo(0, h + h * block.throttle);
        ctx.closePath(); ctx.fill();
      }
    }
  },

  rcs: {
    name: 'RCS', hotkey: '8',
    desc: 'Propulsor de maniobra: 1500 N, 0.8 u/s. Colócalos en los extremos para girar y desplazarte lateralmente.',
    mass: 1, hp: 40, thrust: 1500, fuelUse: 0.8, directional: true,
    color: '#6ee7ff',
    draw(ctx, s, block) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(159,180,200,0.05)';
      ctx.strokeRect(-h * 0.4, -h * 0.55, h * 0.8, h * 0.85);
      ctx.fillRect(-h * 0.4, -h * 0.55, h * 0.8, h * 0.85);
      ctx.beginPath();
      ctx.moveTo(-h * 0.28, h * 0.3);
      ctx.lineTo(-h * 0.5, h * 0.85);
      ctx.lineTo(h * 0.5, h * 0.85);
      ctx.lineTo(h * 0.28, h * 0.3);
      ctx.stroke();
      if (block && block.throttle > 0.05) {
        ctx.fillStyle = `rgba(110,231,255,${0.4 * block.throttle})`;
        ctx.beginPath();
        ctx.moveTo(-h * 0.3, h * 0.85); ctx.lineTo(h * 0.3, h * 0.85); ctx.lineTo(0, h * 1.35);
        ctx.closePath(); ctx.fill();
      }
    }
  },

  gyro: {
    name: 'GIROSCOPIO', hotkey: '9',
    desc: 'Volante de inercia: par de giro sin combustible, consume 3 u/s de energía al girar. Clave para el SAS.',
    mass: 4, hp: 60, torque: 52000, powerUse: 3,
    color: '#c9a2ff',
    draw(ctx, s) {
      const h = s / 2 - 2;
      ctx.strokeStyle = '#9b7fc9'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(201,162,255,0.05)';
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.fillRect(-h, -h, h * 2, h * 2);
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.62, -0.4, Math.PI + 0.9);
      ctx.strokeStyle = '#c9a2ff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(h * 0.62, -0.4);
      const tip = rotV(h * 0.62, 0, -0.4);
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - 4, tip.y - 1); ctx.lineTo(tip.x - 0.5, tip.y + 4.5);
      ctx.stroke();
    }
  },

  laser: {
    name: 'LÁSER', hotkey: '0',
    desc: 'Cañón de 22 de daño por disparo, 900 m de alcance, 6 u. de energía por disparo. Dispara hacia donde apunta.',
    mass: 4, hp: 60, laser: { dmg: 22, range: 900, cost: 6, cooldown: 0.34 }, directional: true,
    color: '#ff6e6e',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = '#c25757'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,110,110,0.06)';
      ctx.strokeRect(-h * 0.55, -h * 0.15, h * 1.1, h * 1.0);
      ctx.fillRect(-h * 0.55, -h * 0.15, h * 1.1, h * 1.0);
      // cañón hacia arriba
      ctx.strokeStyle = '#ff6e6e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.15); ctx.lineTo(0, -h + 1.5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3.5, -h + 4); ctx.lineTo(3.5, -h + 4);
      ctx.stroke();
    }
  }
};

/* ---------- fábrica ---------- */
const BlockFactory = {
  types: Object.keys(BLOCK_DEFS),

  create(type, gx, gy, rot) {
    const def = BLOCK_DEFS[type];
    if (!def) throw new Error('Bloque desconocido: ' + type);
    const b = {
      type, def,
      gx: gx | 0, gy: gy | 0,
      rot: (rot || 0) & 3,
      hp: def.hp,
      throttle: 0,          // nivel de encendido (propulsores)
      cooldown: 0,          // recarga (láseres)
      leakDir: null         // dirección fija de la fuga cuando ocurre
    };
    if (def.fuelCap)  b.fuel   = def.fuelCap;
    if (def.powerCap) b.charge = def.powerCap;
    return b;
  }
};

/* dibuja un bloque centrado en (0,0); rot en pasos de 90° */
function drawBlock(ctx, block, size) {
  ctx.save();
  ctx.rotate(block.rot * Math.PI / 2);
  block.def.draw(ctx, size, block);
  ctx.restore();
  // marca de daño (independiente de la rotación)
  if (block.hp < block.def.hp * 0.999) {
    const dmg = 1 - block.hp / block.def.hp;
    if (dmg > 0.25) {
      ctx.strokeStyle = `rgba(255,93,93,${0.25 + dmg * 0.5})`;
      ctx.lineWidth = 1;
      const h = size / 2 - 3;
      ctx.beginPath();
      ctx.moveTo(-h, h * 0.4); ctx.lineTo(-h * 0.2, -h * 0.3); ctx.lineTo(h * 0.3, h * 0.5);
      if (dmg > 0.6) { ctx.lineTo(h * 0.7, -h * 0.5); }
      ctx.stroke();
    }
  }
}

/* dibuja un tipo "plano" (para paleta / miniaturas) */
function drawBlockType(ctx, type, rot, size) {
  const fake = { type, def: BLOCK_DEFS[type], rot: rot || 0, hp: BLOCK_DEFS[type].hp, throttle: 0 };
  if (fake.def.fuelCap)  fake.fuel   = fake.def.fuelCap;
  if (fake.def.powerCap) fake.charge = fake.def.powerCap;
  drawBlock(ctx, fake, size);
}
