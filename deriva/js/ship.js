/* ============================================================
   La nave ODISEA: mapa de casco, sistemas de a bordo y averías
   ------------------------------------------------------------
   No se edita: se habita. Recursos acoplados entre sí:
   reactor quema combustible → energía; oxigenador gasta
   energía → oxígeno; motor quema combustible → acerca a casa.
   Brechas drenan aire (y succionan), los incendios lo queman.
   Soltar carga aligera la nave: el motor rinde más.
   ============================================================ */
'use strict';

const MAP = [
  '##########################',
  '#......#........#........#',
  '#..R...#...O....#..C.....#',
  '#......+........+........#',
  '#......#........#........#',
  '###+#######+#######+######',
  '#......#........#........#',
  '#..M...+...A....+..S.S.S.#',
  '#......#........#........#',
  '##########################'
];

const STATION_DEFS = {
  R: { name: 'REACTOR',        desc: 'quema combustible → genera energía' },
  O: { name: 'OXIGENADOR',     desc: 'gasta energía → recicla oxígeno' },
  M: { name: 'MOTOR',          desc: 'quema combustible → rumbo a casa' },
  A: { name: 'TIMÓN',          desc: 'control de emergencia de la nave' },
  C: { name: 'COMUNICACIONES', desc: 'antena de señales de auxilio' },
  S: { name: 'MÓDULO DE CARGA', desc: 'lastre eyectable' }
};

class OdiseaShip {
  constructor() {
    this.w = MAP[0].length;
    this.h = MAP.length;
    this.pw = this.w * TILE;
    this.ph = this.h * TILE;

    this.walls = new Set();
    this.floors = [];
    this.stations = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = MAP[y][x];
        if (c === '#') this.walls.add(x + ',' + y);
        else {
          this.floors.push({ x, y });
          if (STATION_DEFS[c]) {
            this.stations.push({
              type: c, ...STATION_DEFS[c],
              x, y, cx: (x + 0.5) * TILE, cy: (y + 0.5) * TILE,
              hp: 100, on: c === 'R' || c === 'O',   // reactor y O2 arrancan encendidos
              throttle: 0, jettisoned: false
            });
          }
        }
      }
    }

    // recursos
    this.o2 = 100; this.power = 100; this.fuel = 100; this.hull = 100;
    this.parts = 8;
    this.dist = 100;                 // ×1000 km para mostrar
    this.breaches = [];              // {x,y,cx,cy,dirx,diry}
    this.fires = [];                 // {x,y,cx,cy,spread}
    this.signalPending = false;
    this.signalTimer = 0;
    this.anomaly = false;
    this.anomalyEscape = 0;
    this.time = 0;
  }

  isWall(tx, ty) { return this.walls.has(tx + ',' + ty); }

  station(type) { return this.stations.find(s => s.type === type); }
  cargoLeft() { return this.stations.filter(s => s.type === 'S' && !s.jettisoned).length; }

  /* la nave rinde más ligera: 3 módulos = lenta, 0 = ágil */
  massFactor() { return 1 + this.cargoLeft() * 0.35; }

  update(dt) {
    this.time += dt;

    const reactor = this.station('R');
    const oxy = this.station('O');
    const engine = this.station('M');

    // reactor
    if (reactor.on && reactor.hp > 40 && this.fuel > 0) {
      const burn = 0.38 * dt;
      this.fuel = Math.max(0, this.fuel - burn);
      this.power = Math.min(100, this.power + 6 * dt * (reactor.hp < 75 ? 0.6 : 1));
    }
    // oxigenador
    if (oxy.on && oxy.hp > 40 && this.power > 0.5) {
      this.power = Math.max(0, this.power - 2.1 * dt);
      this.o2 = Math.min(100, this.o2 + 3.2 * dt * (oxy.hp < 75 ? 0.6 : 1));
    }
    // motor: acerca a casa (más rápido con menos carga)
    if (engine.throttle > 0 && engine.hp > 40 && this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - 1.05 * engine.throttle * dt);
      this.dist = Math.max(0, this.dist - engine.throttle * (1.15 / this.massFactor()) * dt);
    }

    // respiración + brechas
    this.o2 = Math.max(0, this.o2 - 0.4 * dt - this.breaches.length * 3.2 * dt);

    // señal caduca
    if (this.signalPending) {
      this.signalTimer -= dt;
      if (this.signalTimer <= 0) { this.signalPending = false; Events.emit('signal:lost'); }
    }

    // anomalía gravitatoria: arrastra la nave lejos de casa
    if (this.anomaly) this.dist += 0.5 * dt;

    // incendios: queman oxígeno y casco, se propagan
    for (const f of this.fires) {
      this.o2 = Math.max(0, this.o2 - 1.1 * dt);
      this.hull = Math.max(0, this.hull - 0.35 * dt);
      f.spread -= dt;
      if (f.spread <= 0) {
        f.spread = rand(5, 9);
        this.igniteAdjacent(f);
      }
      // daña la estación de su casilla
      const st = this.stations.find(s => s.x === f.x && s.y === f.y && !s.jettisoned);
      if (st) st.hp = Math.max(0, st.hp - 4 * dt);
    }

    // el aire que se escapa sin reparar fatiga el casco
    this.hull = Math.max(0, this.hull - this.breaches.length * 0.06 * dt);
  }

  igniteAdjacent(f) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const d = dirs[(Math.random() * 4) | 0];
    const nx = f.x + d[0], ny = f.y + d[1];
    if (this.isWall(nx, ny)) return;
    if (this.fires.some(o => o.x === nx && o.y === ny)) return;
    if (this.fires.length >= 7) return;
    this.addFire(nx, ny);
  }

  addFire(x, y) {
    this.fires.push({ x, y, cx: (x + 0.5) * TILE, cy: (y + 0.5) * TILE, spread: rand(5, 9) });
    Events.emit('fire:start', {});
  }

  /* brecha en un muro exterior junto a suelo */
  addBreach() {
    for (let tries = 0; tries < 40; tries++) {
      const f = this.floors[(Math.random() * this.floors.length) | 0];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[(Math.random() * 4) | 0];
      const wx = f.x + d[0], wy = f.y + d[1];
      if (!this.isWall(wx, wy)) continue;
      // exterior: la casilla al otro lado del muro no existe o es muro del borde
      const ox = wx + d[0], oy = wy + d[1];
      if (ox >= 0 && ox < this.w && oy >= 0 && oy < this.h && !this.isWall(ox, oy)) continue;
      if (this.breaches.some(b => b.x === wx && b.y === wy)) continue;
      this.breaches.push({
        x: wx, y: wy,
        cx: (wx + 0.5) * TILE, cy: (wy + 0.5) * TILE,
        dirx: d[0], diry: d[1],
        seed: Math.random() * 100
      });
      this.hull = Math.max(0, this.hull - 4);
      Events.emit('breach:new', {});
      return true;
    }
    return false;
  }

  damageRandomStation() {
    const list = this.stations.filter(s => !s.jettisoned && s.type !== 'S' && s.hp > 40);
    if (!list.length) return null;
    const st = list[(Math.random() * list.length) | 0];
    st.hp = rand(10, 35);
    Events.emit('station:damaged', { st });
    return st;
  }

  jettison(st) {
    if (st.type !== 'S' || st.jettisoned) return false;
    st.jettisoned = true;
    Events.emit('cargo:jettison', { st });
    return true;
  }
}
