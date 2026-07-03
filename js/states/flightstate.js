/* ============================================================
   ESTADO: VUELO
   ------------------------------------------------------------
   Despegue, vuelo newtoniano, planetas con atmósfera y combate.
   Cámara con fuerzas G, cielo dinámico, estelas de velocidad,
   pasada de luces, HUD técnico, reparación en vuelo y modo
   ASISTIDO/REALISTA conmutables con G.
   ============================================================ */
'use strict';

class FlightState extends GameState {
  constructor() {
    super();
    this.world = null;
    this.camera = null;
    this.starfield = new Starfield();
    this.time = 0;
    this.deathTimer = -1;
    this.keys = new Set();
    this.hudTick = 0;
    this.atmo = { dens: 0, sky: '96,150,200', alt: Infinity, planet: null };

    Events.on('wave:start',   d => { if (this.active()) UI.overlay(`OLA ${d.wave}`, 'contactos hostiles detectados', '', 1800); });
    Events.on('wave:cleared', d => { if (this.active()) UI.overlay('SECTOR DESPEJADO', 'siguiente ola en 5 s', '', 2200); });

    // sacudidas de cámara (una sola suscripción; la cámara cambia por vuelo)
    Events.on('impact',          d => { if (this.camera) this.camera.shake(clamp(d.j / 500, 0, 8)); });
    Events.on('block:destroyed', () => { if (this.camera) this.camera.shake(5); });
    Events.on('ship:destroyed',  () => { if (this.camera) this.camera.shake(14); });
  }

  active() { return Game.fsm.currentName === 'flight'; }

  enter(params) {
    Particles.clear();
    Lights.clear();
    this.world = new World();
    this.camera = new Camera();
    this.time = 0;
    this.deathTimer = -1;
    this.keys.clear();

    const player = new Ship(params.blueprint, { faction: 'player', x: 0, y: 0, angle: 0 });
    player.sas = true;
    this.world.setPlayer(player);

    this.camera.x = 0; this.camera.y = 0;
    this.camera.zoom = 2.2;   // arranque cerca → se abre: despegue cinematográfico

    UI.overlay('DESPEGUE', params.blueprint.name, '', 2000);
    SFX.unlock();
  }

  exit() {
    SFX.stopThrust();
    SFX.stopWind();
    document.getElementById('alerts').innerHTML = '';
  }

  /* ---------- entrada ---------- */

  onKeyDown(e) {
    this.keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Escape') Game.fsm.set('build');
    if (e.code === 'KeyT') {
      const p = this.world.player;
      if (p && p.alive) { p.sas = !p.sas; UI.toast('SAS ' + (p.sas ? 'ACTIVADO' : 'DESACTIVADO')); }
    }
    if (e.code === 'KeyG') {
      const v = Settings.toggleAssist();
      UI.toast('MODO ' + (v ? 'ASISTIDO' : 'REALISTA'));
    }
  }

  onKeyUp(e) { this.keys.delete(e.code); }

  readInput() {
    const p = this.world.player;
    if (!p || !p.alive) return;
    const k = this.keys;
    const it = p.intents;
    it.fwd     = k.has('KeyW') || k.has('ArrowUp')    ? 1 : 0;
    it.back    = k.has('KeyS') || k.has('ArrowDown')  ? 1 : 0;
    it.turnL   = k.has('KeyA') || k.has('ArrowLeft')  ? 1 : 0;
    it.turnR   = k.has('KeyD') || k.has('ArrowRight') ? 1 : 0;
    it.latL    = k.has('KeyQ') ? 1 : 0;
    it.latR    = k.has('KeyE') ? 1 : 0;
    it.fire    = k.has('Space');
    it.killRot = k.has('KeyX');
    it.repair  = k.has('KeyR');
  }

  /* ---------- ciclo ---------- */

  update(dt) {
    this.time += dt;

    this.readInput();
    this.world.update(dt);

    const p = this.world.player;

    // atmósfera en la posición del jugador (cielo, viento, HUD)
    this.atmo = { dens: 0, sky: '96,150,200', alt: Infinity, planet: null };
    if (p && p.alive) {
      for (const pl of this.world.planets) {
        const f = pl.fieldAt(p.pos.x, p.pos.y);
        if (f && f.alt < this.atmo.alt) {
          this.atmo = { dens: f.dens, sky: pl.sky, alt: f.alt, planet: pl };
        }
      }
    }

    if (p && p.alive) {
      this.camera.follow(p, dt);
      SFX.thrust(clamp(p.throttleTotal || 0, 0, 1));
      const sp = Math.hypot(p.vel.x, p.vel.y);
      SFX.wind(this.atmo.dens * clamp(sp / 520, 0, 1));
    } else {
      SFX.stopThrust();
      SFX.stopWind();
      this.camera.shakeAmp *= Math.pow(0.01, dt);
      if (this.deathTimer < 0) {
        this.deathTimer = 3.2;
        UI.overlay('NAVE PERDIDA', 'cabina destruida — volviendo al astillero', 'danger', 3000);
      } else {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) Game.fsm.set('build');
      }
    }

    this.hudTick -= dt;
    if (this.hudTick <= 0) { this.hudTick = 0.1; this.updateHud(); }
  }

  updateHud() {
    const p = this.world.player;
    if (!p || !p.alive) return;

    const fuel = p.totalFuel(), fuelCap = p.fuelCap() || 1;
    const pow = p.totalPower(), powCap = p.powerCap() || 1;
    const integ = p.integrity();
    const speed = Math.hypot(p.vel.x, p.vel.y);

    document.getElementById('bar-fuel').style.width = (fuel / fuelCap * 100) + '%';
    document.getElementById('bar-power').style.width = (pow / powCap * 100) + '%';
    document.getElementById('bar-hull').style.width = (integ * 100) + '%';
    document.getElementById('txt-fuel').textContent = fuel.toFixed(0) + ' / ' + fuelCap.toFixed(0);
    document.getElementById('txt-power').textContent = pow.toFixed(0) + ' / ' + powCap.toFixed(0);
    document.getElementById('txt-hull').textContent = Math.round(integ * 100) + '%';

    // escudo: solo visible si la nave tiene generador
    const sCap = p.shieldCap();
    const meterS = document.getElementById('meter-shield');
    meterS.style.display = sCap > 0 ? 'block' : 'none';
    if (sCap > 0) {
      document.getElementById('bar-shield').style.width = (p.shield / sCap * 100) + '%';
      document.getElementById('txt-shield').textContent = p.shield.toFixed(0) + ' / ' + sCap;
    }

    document.getElementById('txt-vel').textContent = speed.toFixed(0);
    document.getElementById('txt-g').textContent = this.camera.gForce.toFixed(1);
    const sas = document.getElementById('txt-sas');
    sas.textContent = p.sas ? 'ON' : 'OFF';
    sas.className = p.sas ? 'on' : 'off';
    const mode = document.getElementById('txt-mode');
    mode.textContent = Settings.assist ? 'ASIST' : 'REAL';
    mode.className = Settings.assist ? 'on' : 'off';
    document.getElementById('txt-wave').textContent = this.world.wave || '—';
    document.getElementById('txt-enemies').textContent = this.world.enemies().length;

    // altitud sobre el planeta más cercano
    const roAlt = document.getElementById('ro-alt');
    if (this.atmo.planet && this.atmo.alt < this.atmo.planet.r * 3) {
      roAlt.style.display = 'block';
      document.getElementById('txt-alt').textContent = Math.max(0, this.atmo.alt / 10).toFixed(0);
    } else roAlt.style.display = 'none';

    let alerts = '';
    if (p.leaking)  alerts += '<div class="alert">⚠ FUGA DE COMBUSTIBLE — mantén R para soldar</div>';
    if (p.shorting) alerts += '<div class="alert">⚠ CORTOCIRCUITO — mantén R para reparar</div>';
    if (p.reentry)  alerts += '<div class="alert">⚠ CALENTAMIENTO ATMOSFÉRICO</div>';
    if (p.repairingBlock) alerts += '<div class="warn">◈ REPARANDO ' + p.repairingBlock.def.name + '…</div>';
    if (fuel / fuelCap < 0.15 && fuelCap > 1) alerts += '<div class="warn">COMBUSTIBLE BAJO</div>';
    if (pow / powCap < 0.15 && powCap > 1)   alerts += '<div class="warn">ENERGÍA BAJA</div>';
    document.getElementById('alerts').innerHTML = alerts;
  }

  /* ---------- render ---------- */

  render(ctx, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, w, h);

    const p = this.world.player;
    const vx = p && p.alive ? p.vel.x : 0;
    const vy = p && p.alive ? p.vel.y : 0;
    const dens = this.atmo.dens;

    // las estrellas se apagan dentro de la atmósfera
    this.starfield.draw(ctx, this.camera, w, h, vx, vy, this.time, dens);

    // cielo: tinte atmosférico a pantalla completa
    if (dens > 0.005) {
      ctx.fillStyle = `rgba(${this.atmo.sky},${dens * 0.42})`;
      ctx.fillRect(0, 0, w, h);
    }

    this.camera.apply(ctx, w, h);

    for (const pl of this.world.planets) pl.render(ctx, this.camera, w, h);

    Particles.draw(ctx);

    for (const s of this.world.ships) {
      s.render(ctx);
      if (s.faction === 'enemy') this.drawBrackets(ctx, s);
    }

    this.drawBeams(ctx);
    this.drawProjectiles(ctx);
    Lights.draw(ctx);

    // marcador de velocidad: vector desde la nave (lectura técnica)
    if (p && p.alive) {
      const speed = Math.hypot(vx, vy);
      if (speed > 30) {
        ctx.strokeStyle = 'rgba(110,231,255,0.25)';
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.beginPath();
        ctx.moveTo(p.pos.x, p.pos.y);
        ctx.lineTo(p.pos.x + vx / speed * 60, p.pos.y + vy / speed * 60);
        ctx.stroke();
      }
    }

    // capa de pantalla: estelas de velocidad + indicadores fuera de cámara
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSpeedStreaks(ctx, w, h, vx, vy);
    this.drawOffscreenMarkers(ctx, w, h);
  }

  drawBeams(ctx) {
    for (const b of this.world.beams) {
      const a = b.life / b.maxLife;
      ctx.strokeStyle = `rgba(${b.color},${a * 0.18})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(${b.color},${a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
      ctx.beginPath(); ctx.arc(b.x1, b.y1, 2, 0, TAU); ctx.fill();
    }
  }

  drawProjectiles(ctx) {
    for (const pr of this.world.projectiles) {
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      const tx = pr.vx / sp, ty = pr.vy / sp;
      ctx.strokeStyle = `rgba(${pr.color},0.55)`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(pr.x - tx * 16, pr.y - ty * 16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, 1.8, 0, TAU); ctx.fill();
      Lights.add(pr.x, pr.y, 34, pr.color, 0.22);
    }
  }

  drawBrackets(ctx, s) {
    const r = s.radius * 1.15;
    const t = r * 0.35;
    ctx.strokeStyle = 'rgba(255,110,110,0.4)';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      ctx.moveTo(s.pos.x + sx * r, s.pos.y + sy * r - sy * t);
      ctx.lineTo(s.pos.x + sx * r, s.pos.y + sy * r);
      ctx.lineTo(s.pos.x + sx * r - sx * t, s.pos.y + sy * r);
    }
    ctx.stroke();
  }

  drawSpeedStreaks(ctx, w, h, vx, vy) {
    const speed = Math.hypot(vx, vy);
    const k = clamp((speed - 380) / 800, 0, 1);
    if (k <= 0) return;
    const dx = vx / speed, dy = vy / speed;
    const len = 30 + k * 150;
    ctx.strokeStyle = `rgba(160,200,235,${k * 0.28})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // pseudoaleatorio estable por franja de tiempo → parpadeo cinematográfico
    const seed = Math.floor(this.time * 22);
    for (let i = 0; i < 16; i++) {
      const q = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      const rx = (q - Math.floor(q)) * w;
      const q2 = Math.sin(seed * 39.346 + i * 11.135) * 24634.6345;
      const ry = (q2 - Math.floor(q2)) * h;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - dx * len, ry - dy * len);
    }
    ctx.stroke();
  }

  drawOffscreenMarkers(ctx, w, h) {
    const cam = this.camera;
    const marker = (wx, wy, color, label) => {
      const sx = (wx - cam.x) * cam.zoom + w / 2;
      const sy = (wy - cam.y) * cam.zoom + h / 2;
      if (sx > -20 && sx < w + 20 && sy > -20 && sy < h + 20) return;
      const cx = clamp(sx, 26, w - 26), cy = clamp(sy, 60, h - 26);
      const ang = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-4, 4.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + 16);
    };

    for (const s of this.world.enemies()) {
      const d = Math.hypot(s.pos.x - cam.x, s.pos.y - cam.y);
      marker(s.pos.x, s.pos.y, 'rgba(255,110,110,0.55)', (d / 10).toFixed(0));
    }
    for (const pl of this.world.planets) {
      const d = Math.hypot(pl.x - cam.x, pl.y - cam.y) - pl.r;
      if (d < 500) continue;   // ya estás en él
      marker(pl.x, pl.y, 'rgba(110,231,255,0.45)', pl.name + ' ' + (d / 10).toFixed(0));
    }
  }
}
