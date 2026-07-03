/* ============================================================
   PATRÓN: FACTORY (BlockFactory)
   ------------------------------------------------------------
   Definiciones de bloques dirigidas por datos + fábrica que
   instancia bloques vivos (con PV, combustible, carga...).
   Los bloques se dibujan SIN costuras: relleno de celda
   completa + contorno solo en los bordes expuestos (sin
   vecino), de modo que la nave se lee como un casco unificado.
   Cada def.draw() dibuja únicamente el "glifo" interior.
   ============================================================ */
'use strict';

const BLOCK_DEFS = {

  /* ---------------- MANDO ---------------- */

  cabin: {
    name: 'CABINA', hotkey: '1', cat: 'MANDO',
    desc: 'Núcleo de mando. Obligatoria y única. Almacena algo de energía. Si se destruye, la nave se pierde.',
    mass: 5, hp: 140, powerCap: 30,
    color: '#6ee7ff', fill: 'rgba(20,32,42,0.95)',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(110,231,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, -h + 3); ctx.lineTo(h - 4, h - 4); ctx.lineTo(-h + 4, h - 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6ee7ff';
      ctx.beginPath();
      ctx.moveTo(-h * 0.28, h * 0.1); ctx.lineTo(h * 0.28, h * 0.1);
      ctx.stroke();
    }
  },

  gyro: {
    name: 'GIROSCOPIO', hotkey: '9', cat: 'MANDO',
    desc: 'Volante de inercia: par de giro sin combustible, consume 3 u/s de energía al girar. Clave para el SAS.',
    mass: 4, hp: 60, torque: 52000, powerUse: 3,
    color: '#c9a2ff', fill: 'rgba(26,23,34,0.95)',
    draw(ctx, s) {
      const h = s / 2 - 2;
      ctx.strokeStyle = '#c9a2ff'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.6, -0.4, Math.PI + 0.9);
      ctx.stroke();
      const tip = rotV(h * 0.6, 0, -0.4);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - 4, tip.y - 1); ctx.lineTo(tip.x - 0.5, tip.y + 4.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(201,162,255,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
    }
  },

  /* ---------------- ESTRUCTURA ---------------- */

  hull: {
    name: 'CASCO', hotkey: '2', cat: 'ESTRUCTURA',
    desc: 'Estructura ligera. Conecta módulos con poca masa.',
    mass: 2, hp: 80,
    color: '#8a97a5',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = 'rgba(140,155,172,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-h * 0.55, h * 0.55); ctx.lineTo(h * 0.55, -h * 0.55);
      ctx.stroke();
    }
  },

  armor: {
    name: 'BLINDAJE', hotkey: '3', cat: 'ESTRUCTURA',
    desc: 'Placa pesada. Absorbe el 55% del daño recibido y resiste impactos.',
    mass: 6, hp: 280, resist: 0.55,
    color: '#aab6c2', fill: 'rgba(46,54,64,0.96)', edge: 'rgba(178,190,203,0.9)',
    draw(ctx, s) {
      const i = s / 2 * 0.5;
      ctx.strokeStyle = 'rgba(178,190,203,0.55)'; ctx.lineWidth = 1;
      ctx.strokeRect(-i, -i, i * 2, i * 2);
      const j = i * 0.45;
      ctx.strokeStyle = 'rgba(178,190,203,0.3)';
      ctx.strokeRect(-j, -j, j * 2, j * 2);
    }
  },

  leg: {
    name: 'TREN', hotkey: 'L', cat: 'ESTRUCTURA',
    desc: 'Pata de aterrizaje amortiguada: soporta contactos con el suelo a hasta 3× la velocidad segura. Apunta el pie hacia fuera (R).',
    mass: 2, hp: 130, resist: 0.15, landing: true, directional: true,
    color: '#8a97a5', fill: 'rgba(24,29,36,0.9)',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.4;
      // puntales en A (pie hacia abajo en rot 0)
      ctx.beginPath();
      ctx.moveTo(-h * 0.45, -h * 0.6); ctx.lineTo(-h * 0.3, h * 0.62);
      ctx.moveTo( h * 0.45, -h * 0.6); ctx.lineTo( h * 0.3, h * 0.62);
      ctx.stroke();
      // zapata
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-h * 0.6, h * 0.72); ctx.lineTo(h * 0.6, h * 0.72);
      ctx.stroke();
      // amortiguador
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(159,180,200,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5); ctx.lineTo(0, h * 0.3);
      ctx.stroke();
    }
  },

  /* ---------------- PROPULSIÓN ---------------- */

  thruster: {
    name: 'PROPULSOR', hotkey: '7', cat: 'PROPULSIÓN',
    desc: 'Empuje principal: 5200 N. Consume 3.2 u/s de combustible. Direccional: empuja hacia donde apunta (R para rotar).',
    mass: 3, hp: 70, thrust: 5200, fuelUse: 3.2, directional: true,
    color: '#6ee7ff', fill: 'rgba(19,25,33,0.92)',
    draw(ctx, s, block) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-h * 0.5, -h * 0.75);
      ctx.lineTo(h * 0.5, -h * 0.75);
      ctx.lineTo(h * 0.5, h * 0.2);
      ctx.lineTo(-h * 0.5, h * 0.2);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-h * 0.35, h * 0.2);
      ctx.lineTo(-h * 0.7, h - 1.5);
      ctx.lineTo(h * 0.7, h - 1.5);
      ctx.lineTo(h * 0.35, h * 0.2);
      ctx.stroke();
      if (block && block.throttle > 0.05) {
        ctx.fillStyle = `rgba(110,231,255,${0.4 * block.throttle})`;
        ctx.beginPath();
        ctx.moveTo(-h * 0.45, h - 1.5); ctx.lineTo(h * 0.45, h - 1.5); ctx.lineTo(0, h + h * block.throttle);
        ctx.closePath(); ctx.fill();
      }
    }
  },

  thruster_h: {
    name: 'MOTOR PESADO', hotkey: 'U', cat: 'PROPULSIÓN',
    desc: 'Motor de crucero: 13000 N, 7.5 u/s de combustible. Lento de respuesta pero enorme empuje. Direccional.',
    mass: 8, hp: 110, thrust: 13000, fuelUse: 7.5, directional: true, slowSpool: true,
    color: '#6ee7ff', fill: 'rgba(19,25,33,0.92)',
    draw(ctx, s, block) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-h * 0.62, -h + 1.5);
      ctx.lineTo(h * 0.62, -h + 1.5);
      ctx.lineTo(h * 0.62, h * 0.05);
      ctx.lineTo(-h * 0.62, h * 0.05);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-h * 0.45, h * 0.05);
      ctx.lineTo(-h * 0.92, h - 1);
      ctx.lineTo(h * 0.92, h - 1);
      ctx.lineTo(h * 0.45, h * 0.05);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(159,180,200,0.4)';
      ctx.beginPath();
      ctx.moveTo(-h * 0.3, -h * 0.55); ctx.lineTo(-h * 0.3, -h * 0.1);
      ctx.moveTo( h * 0.3, -h * 0.55); ctx.lineTo( h * 0.3, -h * 0.1);
      ctx.stroke();
      if (block && block.throttle > 0.05) {
        ctx.fillStyle = `rgba(140,225,255,${0.45 * block.throttle})`;
        ctx.beginPath();
        ctx.moveTo(-h * 0.6, h - 1); ctx.lineTo(h * 0.6, h - 1); ctx.lineTo(0, h + h * 1.5 * block.throttle);
        ctx.closePath(); ctx.fill();
      }
    }
  },

  rcs: {
    name: 'RCS', hotkey: '8', cat: 'PROPULSIÓN',
    desc: 'Propulsor de maniobra: 1500 N, 0.8 u/s. Colócalos en los extremos para girar y desplazarte lateralmente.',
    mass: 1, hp: 40, thrust: 1500, fuelUse: 0.8, directional: true,
    color: '#6ee7ff', fill: 'rgba(19,25,33,0.9)',
    draw(ctx, s, block) {
      const h = s / 2;
      ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1;
      ctx.strokeRect(-h * 0.32, -h * 0.5, h * 0.64, h * 0.78);
      ctx.beginPath();
      ctx.moveTo(-h * 0.22, h * 0.28);
      ctx.lineTo(-h * 0.45, h * 0.82);
      ctx.lineTo(h * 0.45, h * 0.82);
      ctx.lineTo(h * 0.22, h * 0.28);
      ctx.stroke();
      if (block && block.throttle > 0.05) {
        ctx.fillStyle = `rgba(110,231,255,${0.45 * block.throttle})`;
        ctx.beginPath();
        ctx.moveTo(-h * 0.28, h * 0.82); ctx.lineTo(h * 0.28, h * 0.82); ctx.lineTo(0, h * 1.3);
        ctx.closePath(); ctx.fill();
      }
    }
  },

  /* ---------------- ENERGÍA ---------------- */

  tank: {
    name: 'TANQUE', hotkey: '4', cat: 'ENERGÍA',
    desc: 'Almacena 100 u. de combustible. Si su casco baja del 50%, pierde combustible por una fuga que además empuja la nave.',
    mass: 3, hp: 70, fuelCap: 100,
    color: '#ffb454', fill: 'rgba(31,27,19,0.94)',
    draw(ctx, s, block) {
      const h = s / 2 - 3.5;
      ctx.strokeStyle = 'rgba(201,143,69,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-h, -h, h * 2, h * 2, 3); else ctx.rect(-h, -h, h * 2, h * 2);
      ctx.stroke();
      const lvl = block ? block.fuel / this.fuelCap : 1;
      const fh = (h * 2 - 4) * clamp(lvl, 0, 1);
      ctx.fillStyle = 'rgba(255,180,84,0.35)';
      ctx.fillRect(-h + 2, h - 2 - fh, h * 2 - 4, fh);
    }
  },

  battery: {
    name: 'BATERÍA', hotkey: '5', cat: 'ENERGÍA',
    desc: 'Almacena 120 u. de energía. Dañada, produce cortocircuitos y pierde carga.',
    mass: 3, hp: 60, powerCap: 120,
    color: '#a3e635', fill: 'rgba(23,28,19,0.94)',
    draw(ctx, s, block) {
      const h = s / 2 - 3.5;
      const lvl = block ? block.charge / this.powerCap : 1;
      const bars = Math.round(clamp(lvl, 0, 1) * 3);
      ctx.fillStyle = 'rgba(163,230,53,0.45)';
      for (let i = 0; i < bars; i++) ctx.fillRect(-h + 1, h - 4 - i * 5.5, h * 2 - 2, 3.2);
      ctx.strokeStyle = 'rgba(163,230,53,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) ctx.strokeRect(-h + 1, h - 4 - i * 5.5, h * 2 - 2, 3.2);
      ctx.strokeStyle = 'rgba(163,230,53,0.7)';
      ctx.beginPath();
      ctx.moveTo(-2.5, -h + 1.2); ctx.lineTo(2.5, -h + 1.2);
      ctx.stroke();
    }
  },

  reactor: {
    name: 'REACTOR', hotkey: '6', cat: 'ENERGÍA',
    desc: 'Quema 0.9 u/s de combustible y genera 10 u/s de energía. Dañado rinde la mitad y humea.',
    mass: 7, hp: 100, powerGen: 10, fuelBurn: 0.9,
    color: '#a3e635', fill: 'rgba(23,28,19,0.94)',
    draw(ctx, s) {
      const h = s / 2 - 2;
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.55, 0, TAU);
      ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.16, 0, TAU);
      ctx.fillStyle = '#a3e635';
      ctx.fill();
      ctx.strokeStyle = 'rgba(163,230,53,0.35)';
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * h * 0.62, Math.sin(a) * h * 0.62);
        ctx.lineTo(Math.cos(a) * h * 0.85, Math.sin(a) * h * 0.85);
        ctx.stroke();
      }
    }
  },

  solar: {
    name: 'PANEL SOLAR', hotkey: 'I', cat: 'ENERGÍA',
    desc: 'Genera 2.5 u/s de energía sin combustible. Frágil: no lo pongas en primera línea.',
    mass: 2, hp: 35, powerGen: 2.5, fuelBurn: 0,
    color: '#5ea9ff', fill: 'rgba(15,23,36,0.94)',
    draw(ctx, s) {
      const h = s / 2 - 3;
      ctx.strokeStyle = 'rgba(94,169,255,0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      ctx.beginPath();
      ctx.moveTo(0, -h); ctx.lineTo(0, h);
      ctx.moveTo(-h, -h / 3); ctx.lineTo(h, -h / 3);
      ctx.moveTo(-h, h / 3); ctx.lineTo(h, h / 3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,230,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(-h * 0.7, h * 0.75); ctx.lineTo(h * 0.15, -h * 0.75);
      ctx.stroke();
    }
  },

  /* ---------------- ARMAS ---------------- */

  laser: {
    name: 'LÁSER', hotkey: '0', cat: 'ARMAS',
    desc: 'Cañón de energía: 22 de daño, 900 m de alcance, 6 u. por disparo. Instantáneo. Dispara hacia donde apunta.',
    mass: 4, hp: 60, laser: { dmg: 22, range: 900, cost: 6, cooldown: 0.34 }, directional: true,
    color: '#ff6e6e', fill: 'rgba(30,20,21,0.94)',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = 'rgba(194,87,87,0.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(-h * 0.42, -h * 0.05, h * 0.84, h * 0.8);
      ctx.strokeStyle = '#ff6e6e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.05); ctx.lineTo(0, -h + 1);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -h + 3.5); ctx.lineTo(3, -h + 3.5);
      ctx.stroke();
    }
  },

  cannon: {
    name: 'CAÑÓN', hotkey: 'O', cat: 'ARMAS',
    desc: 'Arma cinética: proyectil de 46 de daño con retroceso e impulso de impacto. 4 u. de energía, recarga 0.9 s.',
    mass: 6, hp: 85, directional: true,
    cannon: { dmg: 46, speed: 820, cost: 4, cooldown: 0.9, punch: 260, life: 2.6 },
    color: '#ffc46e', fill: 'rgba(30,25,18,0.94)',
    draw(ctx, s) {
      const h = s / 2;
      ctx.strokeStyle = 'rgba(200,160,100,0.85)'; ctx.lineWidth = 1;
      ctx.strokeRect(-h * 0.5, h * 0.05, h, h * 0.75);
      // cañón grueso
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.05); ctx.lineTo(0, -h + 1);
      ctx.stroke();
      // freno de boca
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-3.5, -h + 2.5); ctx.lineTo(3.5, -h + 2.5);
      ctx.moveTo(-3.5, -h + 5);   ctx.lineTo(3.5, -h + 5);
      ctx.stroke();
    }
  },

  /* ---------------- DEFENSA ---------------- */

  shield: {
    name: 'ESCUDO', hotkey: 'P', cat: 'DEFENSA',
    desc: 'Proyecta una burbuja de 90 PV que absorbe láseres y proyectiles. Se recarga con energía (7 PV/s) tras 2.5 s sin recibir daño.',
    mass: 5, hp: 70, shieldCap: 90, shieldRegen: 7, shieldCost: 1.2,
    color: '#6ee7ff', fill: 'rgba(20,26,38,0.94)',
    draw(ctx, s) {
      const h = s / 2 - 3;
      ctx.strokeStyle = 'rgba(110,231,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const x = Math.cos(a) * h * 0.85, y = Math.sin(a) * h * 0.85;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(110,231,255,0.55)';
      ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fill();
    }
  }
};

/* orden de la paleta agrupado por categoría */
const BLOCK_CATS = ['MANDO', 'ESTRUCTURA', 'PROPULSIÓN', 'ENERGÍA', 'ARMAS', 'DEFENSA'];

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
      cooldown: 0,          // recarga (armas)
      leakDir: null,        // dirección fija de la fuga cuando ocurre
      heat: 0,              // calor de reentrada (0..1)
      burning: 0            // segundos de incendio restantes
    };
    if (def.fuelCap)  b.fuel   = def.fuelCap;
    if (def.powerCap) b.charge = def.powerCap;
    return b;
  }
};

const EDGE_ALL = { n: true, e: true, s: true, w: true };

/* dibuja un bloque centrado en (0,0). `edges` indica qué bordes están
   expuestos (sin vecino) — solo esos llevan contorno: casco sin costuras. */
function drawBlock(ctx, block, size, edges) {
  const h = size / 2, d = block.def;
  const e = edges || EDGE_ALL;

  // relleno de la celda completa: los bloques contiguos se funden
  ctx.fillStyle = d.fill || 'rgba(18,24,32,0.92)';
  ctx.fillRect(-h, -h, size, size);

  // glifo interior (respeta la rotación del bloque)
  ctx.save();
  ctx.rotate(block.rot * Math.PI / 2);
  d.draw(ctx, size, block);
  ctx.restore();

  // contorno solo en bordes expuestos
  ctx.strokeStyle = d.edge || 'rgba(150,170,192,0.8)';
  ctx.lineWidth = Math.max(1, size / 26);
  ctx.beginPath();
  if (e.n) { ctx.moveTo(-h, -h); ctx.lineTo( h, -h); }
  if (e.e) { ctx.moveTo( h, -h); ctx.lineTo( h,  h); }
  if (e.s) { ctx.moveTo( h,  h); ctx.lineTo(-h,  h); }
  if (e.w) { ctx.moveTo(-h,  h); ctx.lineTo(-h, -h); }
  ctx.stroke();

  // marcas de daño (independientes de la rotación)
  if (block.hp < block.def.hp * 0.999) {
    const dmg = 1 - block.hp / block.def.hp;
    if (dmg > 0.25) {
      ctx.strokeStyle = `rgba(255,93,93,${0.25 + dmg * 0.5})`;
      ctx.lineWidth = 1;
      const k = size / 2 - 3;
      ctx.beginPath();
      ctx.moveTo(-k, k * 0.4); ctx.lineTo(-k * 0.2, -k * 0.3); ctx.lineTo(k * 0.3, k * 0.5);
      if (dmg > 0.6) { ctx.lineTo(k * 0.7, -k * 0.5); }
      ctx.stroke();
    }
  }
}

/* dibuja un tipo "plano" (para paleta / plano / miniaturas) */
function drawBlockType(ctx, type, rot, size, edges) {
  const fake = { type, def: BLOCK_DEFS[type], rot: rot || 0, hp: BLOCK_DEFS[type].hp, throttle: 0 };
  if (fake.def.fuelCap)  fake.fuel   = fake.def.fuelCap;
  if (fake.def.powerCap) fake.charge = fake.def.powerCap;
  drawBlock(ctx, fake, size, edges);
}
