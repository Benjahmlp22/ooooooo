/* ============================================================
   Constantes y utilidades matemáticas compartidas
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
