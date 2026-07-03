/* ============================================================
   Campo de estrellas con parallax (3 capas) + nebulosas tenues
   ------------------------------------------------------------
   Posiciones deterministas en una región que se repite; cada
   capa se desplaza a distinta velocidad respecto a la cámara
   para dar profundidad. A alta velocidad las estrellas cercanas
   se estiran en líneas (motion streaks cinematográficos).
   ============================================================ */
'use strict';

class Starfield {
  constructor() {
    this.layers = [];
    const REGION = 2200;
    const specs = [
      { n: 140, p: 0.15, size: 0.7, a: 0.35 },
      { n: 90,  p: 0.38, size: 1.1, a: 0.55 },
      { n: 45,  p: 0.72, size: 1.7, a: 0.9  }
    ];
    for (const sp of specs) {
      const stars = [];
      for (let i = 0; i < sp.n; i++) {
        stars.push({ x: Math.random() * REGION, y: Math.random() * REGION, tw: Math.random() * TAU });
      }
      this.layers.push({ ...sp, stars, region: REGION });
    }
    // nebulosas: manchas radiales muy tenues pre-renderizadas
    this.nebula = document.createElement('canvas');
    this.nebula.width = this.nebula.height = 512;
    const nc = this.nebula.getContext('2d');
    const colors = ['110,231,255', '201,162,255', '255,180,84'];
    for (let i = 0; i < 5; i++) {
      const r = rand(60, 150);
      // el blob debe quedar entero dentro del tile para no crear costuras
      const x = rand(r, 512 - r), y = rand(r, 512 - r);
      const g = nc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${colors[i % 3]},0.018)`);
      g.addColorStop(0.7, `rgba(${colors[i % 3]},0.007)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      nc.fillStyle = g;
      nc.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  draw(ctx, cam, w, h, velX, velY, t, fade) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // dentro de la atmósfera las estrellas y nebulosas se desvanecen
    const vis = 1 - clamp(fade || 0, 0, 1) * 0.9;
    if (vis <= 0.02) return;
    // nebulosa con parallax mínimo
    ctx.globalAlpha = vis;
    const nx = -((cam.x * 0.05) % 512), ny = -((cam.y * 0.05) % 512);
    for (let ix = -1; ix <= Math.ceil(w / 512); ix++)
      for (let iy = -1; iy <= Math.ceil(h / 512); iy++)
        ctx.drawImage(this.nebula, nx + ix * 512, ny + iy * 512);
    ctx.globalAlpha = 1;

    const speed = Math.hypot(velX, velY);
    for (const L of this.layers) {
      const R = L.region;
      const ox = cam.x * L.p, oy = cam.y * L.p;
      // estiramiento por velocidad (solo capas cercanas)
      const stretch = clamp((speed - 260) / 900, 0, 1) * L.p * 26;
      const dx = speed > 1 ? velX / speed : 0, dy = speed > 1 ? velY / speed : 0;

      for (const s of L.stars) {
        let x = ((s.x - ox) % R + R) % R - (R - w) / 2;
        let y = ((s.y - oy) % R + R) % R - (R - h) / 2;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
        const tw = (0.75 + 0.25 * Math.sin(t * 2 + s.tw)) * vis;
        if (stretch > 0.8) {
          ctx.strokeStyle = `rgba(200,214,229,${L.a * tw * 0.8})`;
          ctx.lineWidth = L.size;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - dx * stretch, y - dy * stretch);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(200,214,229,${L.a * tw})`;
          ctx.fillRect(x - L.size / 2, y - L.size / 2, L.size, L.size);
        }
      }
    }
  }
}
