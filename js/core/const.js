/* ============================================================
   Constantes, utilidades matemáticas y ajustes globales
   ============================================================ */
'use strict';

const CELL = 24;                 // tamaño de celda en unidades de mundo (px)
const TAU  = Math.PI * 2;

// direcciones locales por rotación de bloque: 0=arriba, 1=derecha, 2=abajo, 3=izquierda
const DIRS = [ {x:0,y:-1}, {x:1,y:0}, {x:0,y:1}, {x:-1,y:0} ];

const clamp  = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp   = (a, b, t) => a + (b - a) * t;
const rand   = (a, b) => a + Math.random() * (b - a);
const dist2  = (ax, ay, bx, by) => (ax-bx)*(ax-bx) + (ay-by)*(ay-by);

// diferencia angular normalizada a [-PI, PI]
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d >  Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// rota (x,y) por ángulo
function rotV(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: x*c - y*s, y: x*s + y*c };
}

const keyOf = (gx, gy) => gx + ',' + gy;

/* ---------- ajustes del jugador (persistentes) ----------
   Tres modos de vuelo:
   ARCADE   → rotación directa y empuje total en cualquier dirección,
              freno automático fuerte. Accesible y ágil.
   ASISTIDO → física real por propulsor + amortiguación automática
              de giro y deriva.
   REALISTA → newtoniano puro: solo el SAS de a bordo te ayuda. */
const FLIGHT_MODES = ['arcade', 'assist', 'real'];
const MODE_LABELS = { arcade: 'ARCADE', assist: 'ASISTIDO', real: 'REALISTA' };

const Settings = {
  mode: (() => {
    const m = localStorage.getItem('orbita_mode');
    return FLIGHT_MODES.includes(m) ? m : 'assist';
  })(),
  setMode(m) {
    if (!FLIGHT_MODES.includes(m)) return;
    this.mode = m;
    try { localStorage.setItem('orbita_mode', m); } catch (e) {}
    Events.emit('settings:mode', m);
  },
  cycleMode() {
    const i = FLIGHT_MODES.indexOf(this.mode);
    this.setMode(FLIGHT_MODES[(i + 1) % FLIGHT_MODES.length]);
    return this.mode;
  },
  get assist() { return this.mode !== 'real'; }
};
