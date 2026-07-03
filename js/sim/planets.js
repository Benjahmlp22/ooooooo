/* ============================================================
   Planetas: gravedad, atmósfera y superficie con vida
   ------------------------------------------------------------
   Cuerpos enormes a escala. Gravedad newtoniana g·(R/r)²,
   atmósfera con densidad por altitud (arrastre + cielo +
   calentamiento de reentrada) y superficie procedural con
   árboles, rocas, hierba y cráteres — deterministas por semilla.
   ============================================================ */
'use strict';

class Planet {
  constructor(o) {
    this.x = o.x; this.y = o.y;
    this.r = o.r;                       // radio de superficie
    this.g = o.g;                       // gravedad superficial (px/s²)
    this.atmo = o.atmo || 0;            // altura de atmósfera
    this.name = o.name;
    this.body = o.body || '#10151c';
    this.rim  = o.rim  || 'rgba(160,190,215,0.35)';
    this.sky  = o.sky  || '96,150,200'; // color rgb del cielo
    this.seed = o.seed || 1;
    this.features = this.generateFeatures(o.flora !== false, o.craters === true);
  }

  /* pseudoaleatorio determinista */
  rng() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  generateFeatures(flora, craters) {
    const out = [];
    const n = Math.floor(this.r / 14);             // densidad por circunferencia
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.rng() * 0.02;
      const roll = this.rng();
      let type;
      if (flora) {
        type = roll < 0.42 ? 'tree' : roll < 0.6 ? 'rock' : roll < 0.92 ? 'grass' : 'bush';
      } else {
        type = roll < 0.5 ? 'rock' : craters && roll < 0.75 ? 'crater' : 'pebble';
      }
      out.push({ a, type, s: 0.6 + this.rng() * 0.9, v: this.rng() });
    }
    return out;
  }

  /* gravedad y densidad atmosférica en un punto.
     La densidad crece con exponente 2.4: el borde superior de la
     atmósfera apenas frena — la entrada es progresiva, sin "muro". */
  fieldAt(x, y) {
    const dx = x - this.x, dy = y - this.y;
    const r = Math.hypot(dx, dy) || 1;
    const alt = r - this.r;
    if (r > this.r * 3.5) return null;   // esfera de influencia acotada
    const g = this.g * (this.r / r) * (this.r / r);
    const dens = this.atmo > 0 ? Math.pow(clamp(1 - alt / this.atmo, 0, 1), 2.4) : 0;
    return { gx: -dx / r * g, gy: -dy / r * g, nx: dx / r, ny: dy / r, alt, dens, r };
  }

  render(ctx, cam, w, h) {
    const dc = Math.hypot(cam.x - this.x, cam.y - this.y);
    const view = Math.max(w, h) / cam.zoom;
    if (dc - this.r > view) return;      // fuera de cámara

    // atmósfera: halo graduado
    if (this.atmo > 0) {
      const g = ctx.createRadialGradient(this.x, this.y, this.r * 0.995, this.x, this.y, this.r + this.atmo);
      g.addColorStop(0, `rgba(${this.sky},0.22)`);
      g.addColorStop(0.35, `rgba(${this.sky},0.09)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + this.atmo, 0, TAU);
      ctx.fill();
    }

    // cuerpo
    const bg = ctx.createRadialGradient(this.x, this.y, this.r * 0.55, this.x, this.y, this.r);
    bg.addColorStop(0, '#0a0e13');
    bg.addColorStop(1, this.body);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.rim;
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.stroke();

    // detalles de superficie solo de cerca
    if (dc - this.r > 2600) return;
    const camA = Math.atan2(cam.y - this.y, cam.x - this.x);
    const hw = (view * 0.7) / this.r + 0.02;

    for (const f of this.features) {
      if (Math.abs(angDiff(f.a, camA)) > hw) continue;
      const px = this.x + Math.cos(f.a) * this.r;
      const py = this.y + Math.sin(f.a) * this.r;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(f.a + Math.PI / 2);     // -y local = alejarse del planeta
      this.drawFeature(ctx, f);
      ctx.restore();
    }
  }

  drawFeature(ctx, f) {
    const s = f.s;
    switch (f.type) {
      case 'tree': {
        const hgt = 26 * s;
        ctx.strokeStyle = 'rgba(120,110,90,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -hgt * 0.45); ctx.stroke();
        ctx.fillStyle = f.v < 0.5 ? 'rgba(78,150,120,0.75)' : 'rgba(95,168,130,0.7)';
        ctx.strokeStyle = 'rgba(130,200,165,0.5)';
        ctx.lineWidth = 1;
        // copa: dos triángulos apilados
        ctx.beginPath();
        ctx.moveTo(0, -hgt); ctx.lineTo(-7 * s, -hgt * 0.4); ctx.lineTo(7 * s, -hgt * 0.4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -hgt * 1.35); ctx.lineTo(-5 * s, -hgt * 0.78); ctx.lineTo(5 * s, -hgt * 0.78);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'bush':
        ctx.fillStyle = 'rgba(88,160,125,0.55)';
        ctx.beginPath();
        ctx.arc(-3 * s, -3 * s, 3.4 * s, 0, TAU);
        ctx.arc(2.5 * s, -2.6 * s, 2.8 * s, 0, TAU);
        ctx.fill();
        break;
      case 'rock': {
        ctx.fillStyle = 'rgba(96,108,120,0.8)';
        ctx.strokeStyle = 'rgba(150,165,180,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6 * s, 0);
        ctx.lineTo(-4 * s, -5 * s + f.v * 3);
        ctx.lineTo(1 * s, -7 * s);
        ctx.lineTo(6 * s, -3 * s);
        ctx.lineTo(6.5 * s, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'pebble':
        ctx.fillStyle = 'rgba(110,118,128,0.6)';
        ctx.beginPath();
        ctx.arc(0, -1.6 * s, 2.2 * s, 0, TAU);
        ctx.fill();
        break;
      case 'grass':
        ctx.strokeStyle = 'rgba(110,175,140,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-2 * s, 0); ctx.lineTo(-2.6 * s, -4.5 * s);
        ctx.moveTo(0, 0);      ctx.lineTo(0.4 * s, -5.5 * s);
        ctx.moveTo(2 * s, 0);  ctx.lineTo(2.8 * s, -4 * s);
        ctx.stroke();
        break;
      case 'crater':
        ctx.strokeStyle = 'rgba(140,150,160,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 1.5, 9 * s, 3 * s, 0, Math.PI, TAU);
        ctx.stroke();
        break;
    }
  }
}

/* sistema por defecto: cuerpos ENORMES y lejanos, a escala.
   Llegar a VERDANIA desde el punto de partida lleva ~40 s de crucero,
   y el descenso atmosférico (5500 m) otro buen rato frenando. */
function createDefaultPlanets() {
  return [
    new Planet({
      name: 'VERDANIA',
      x: 0, y: 92000, r: 22000,
      g: 235,                      // ~9.8 m/s² a escala de celda
      atmo: 5500,
      body: '#101b16', rim: 'rgba(140,210,170,0.4)', sky: '96,158,190',
      seed: 1337, flora: true
    }),
    new Planet({
      name: 'CENIZA',
      x: -88000, y: -42000, r: 8500,
      g: 82,
      atmo: 0,
      body: '#14161a', rim: 'rgba(170,178,188,0.35)', sky: '120,120,130',
      seed: 4242, flora: false, craters: true
    })
  ];
}
