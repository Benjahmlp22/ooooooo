/* ============================================================
   Cámara cinematográfica con fuerzas G
   ------------------------------------------------------------
   - Seguimiento suavizado con anticipación según la velocidad.
   - Zoom dinámico (se aleja a alta velocidad).
   - Sacudida (shake) por impactos/explosiones.
   - Efectos G: la vista se desplaza en sentido contrario a la
     aceleración SENTIDA (empuje, golpes; la gravedad en caída
     libre no se siente) y se inclina levemente con la
     velocidad angular — fuerza centrífuga visible.
   ============================================================ */
'use strict';

class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1; this.targetZoom = 1;
    this.shakeAmp = 0;
    this.sx = 0; this.sy = 0;   // offset de sacudida actual
    this.gx = 0; this.gy = 0;   // offset por fuerza G (suavizado)
    this.tilt = 0;              // inclinación por giro
    this.gForce = 0;            // lectura para el HUD (en "g")
  }

  shake(amp) { this.shakeAmp = Math.min(18, this.shakeAmp + amp); }

  follow(ship, dt) {
    // anticipación: la cámara se adelanta en la dirección de la velocidad
    const lead = 0.32;
    const tx = ship.pos.x + ship.vel.x * lead;
    const ty = ship.pos.y + ship.vel.y * lead;
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;

    // zoom dinámico con la velocidad (efecto cinematográfico de escala)
    const speed = Math.hypot(ship.vel.x, ship.vel.y);
    this.targetZoom = clamp(1.05 - speed / 2400, 0.62, 1.05);
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.pow(0.02, dt));

    // fuerza G: desplazar la vista contra la aceleración sentida
    const G_UNIT = 235;                       // 1 g en px/s²
    const fx = ship.felt.x, fy = ship.felt.y;
    const fmag = Math.hypot(fx, fy);
    this.gForce = fmag / G_UNIT;
    const maxOff = 26;
    const gtx = -clamp(fx / G_UNIT, -3, 3) / 3 * maxOff;
    const gty = -clamp(fy / G_UNIT, -3, 3) / 3 * maxOff;
    const gk = 1 - Math.pow(0.006, dt);
    this.gx += (gtx - this.gx) * gk;
    this.gy += (gty - this.gy) * gk;

    // inclinación centrífuga con la velocidad angular
    const wantTilt = clamp(-ship.angVel * 0.045, -0.055, 0.055);
    this.tilt += (wantTilt - this.tilt) * (1 - Math.pow(0.01, dt));

    // sacudida extra si las G son brutales
    if (this.gForce > 2.6) this.shakeAmp = Math.max(this.shakeAmp, (this.gForce - 2.6) * 2);

    // decaimiento de la sacudida
    this.shakeAmp *= Math.pow(0.001, dt);
    this.sx = rand(-1, 1) * this.shakeAmp;
    this.sy = rand(-1, 1) * this.shakeAmp;
  }

  apply(ctx, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2 + this.sx + this.gx, h / 2 + this.sy + this.gy);
    ctx.rotate(this.tilt);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(sx, sy, w, h) {
    const p = rotV(
      (sx - w / 2 - this.sx - this.gx),
      (sy - h / 2 - this.sy - this.gy), -this.tilt);
    return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y };
  }
}
