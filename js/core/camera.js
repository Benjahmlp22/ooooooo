/* ============================================================
   Cámara cinematográfica
   ------------------------------------------------------------
   Seguimiento suavizado con anticipación según la velocidad,
   zoom dinámico (se aleja a alta velocidad) y sacudida (shake)
   alimentada por eventos de impacto/explosión.
   ============================================================ */
'use strict';

class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1; this.targetZoom = 1;
    this.shakeAmp = 0;
    this.sx = 0; this.sy = 0;   // offset de sacudida actual
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

    // decaimiento de la sacudida
    this.shakeAmp *= Math.pow(0.001, dt);
    this.sx = rand(-1, 1) * this.shakeAmp;
    this.sy = rand(-1, 1) * this.shakeAmp;
  }

  apply(ctx, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2 + this.sx, h / 2 + this.sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(sx, sy, w, h) {
    return {
      x: (sx - w / 2 - this.sx) / this.zoom + this.x,
      y: (sy - h / 2 - this.sy) / this.zoom + this.y
    };
  }
}
