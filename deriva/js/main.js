/* ============================================================
   PATRÓN: STATE — menú / travesía / final
   Orquesta entrada, interacciones, minijuego de señal, HUD
   y condiciones de victoria/derrota.
   ============================================================ */
'use strict';

const UIx = {
  bannerTimer: null,
  banner(msg, sub, danger) {
    const el = document.getElementById('banner');
    el.innerHTML = msg + (sub ? `<small>${sub}</small>` : '');
    el.className = 'show' + (danger ? ' danger' : '');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.remove('show'), 3200);
  },
  hint(msg) {
    const el = document.getElementById('hint');
    if (msg) { el.textContent = msg; el.classList.add('show'); }
    else el.classList.remove('show');
  }
};

const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

const Game = {
  state: 'menu',
  keys: new Set(),
  ship: null, crew: null, director: null,
  repairProgress: 0,
  repairTarget: null,
  signal: null,
  hudT: 0,
  lastT: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    const rs = () => { this.canvas.width = innerWidth; this.canvas.height = innerHeight; };
    rs(); addEventListener('resize', rs);

    document.getElementById('btn-start').addEventListener('click', () => { SFX.unlock(); this.start(); });
    document.getElementById('btn-again').addEventListener('click', () => { SFX.unlock(); this.start(); });

    addEventListener('keydown', e => {
      SFX.unlock();
      if (this.signal && ARROWS[e.code]) { e.preventDefault(); this.signalInput(e.code); return; }
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyE' && this.state === 'playing') this.interact();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    requestAnimationFrame(t => this.loop(t));
  },

  start() {
    this.ship = new OdiseaShip();
    this.crew = new Crew(this.ship);
    this.director = new EventDirector();
    this.signal = null;
    this.repairProgress = 0;
    FX.clear();
    this.state = 'playing';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    document.body.classList.add('playing');
    UIx.banner('DÍA 1', 'rumbo a casa — mantén viva la ODISEA');
    Events.emit('ui:click');
  },

  /* ---------- interacción con E ---------- */
  interact() {
    const near = this.crew.nearest();
    if (!near || near.kind !== 'station') return;
    const st = near.obj;
    Events.emit('ui:click');

    if (st.hp < 40) { UIx.banner(st.name + ' AVERIADO', 'mantén R para repararlo (1 repuesto)', true); return; }

    switch (st.type) {
      case 'R': case 'O':
        st.on = !st.on;
        UIx.banner(st.name + (st.on ? ' ENCENDIDO' : ' APAGADO'));
        break;
      case 'M':
        st.throttle = st.throttle === 0 ? 0.5 : st.throttle === 0.5 ? 1 : 0;
        UIx.banner('MOTOR AL ' + (st.throttle * 100) + '%');
        break;
      case 'A':
        UIx.banner(this.ship.anomaly
          ? 'MANTÉN ESPACIO PARA QUEMAR MOTOR'
          : 'RUMBO ESTABLE', this.ship.anomaly ? 'suelta carga para escapar antes' : '');
        break;
      case 'C':
        if (this.ship.signalPending) this.startSignal();
        else UIx.banner('SIN SEÑALES', 'solo estática ahí fuera');
        break;
      case 'S':
        if (this.ship.jettison(st)) {
          UIx.banner('MÓDULO EYECTADO', 'la nave es más ligera: el motor rinde más');
          FX.shake(4);
          Events.emit('impact', {});
        }
        break;
    }
  },

  /* ---------- minijuego de señal ---------- */
  startSignal() {
    const keys = Object.keys(ARROWS);
    const seq = [];
    for (let i = 0; i < 5; i++) seq.push(keys[(Math.random() * 4) | 0]);
    this.signal = { seq, idx: 0, show: 2.4 };
    this.ship.signalPending = false;
    document.getElementById('signal').classList.add('show');
    document.getElementById('sig-status').textContent = 'RECIBIENDO…';
    this.renderSignal(true);
  },

  renderSignal(showing) {
    const el = document.getElementById('sig-seq');
    el.innerHTML = this.signal.seq.map((k, i) => {
      if (showing) return `<span>${ARROWS[k]}</span>`;
      if (i < this.signal.idx) return `<span class="done">${ARROWS[k]}</span>`;
      return `<span class="hiddenq">·</span>`;
    }).join(' ');
  },

  signalInput(code) {
    const s = this.signal;
    if (s.show > 0) return;                    // aún mostrando
    if (code === s.seq[s.idx]) {
      s.idx++;
      SFX.click();
      this.renderSignal(false);
      if (s.idx >= s.seq.length) this.endSignal(true);
    } else {
      this.endSignal(false);
    }
  },

  endSignal(ok) {
    document.getElementById('signal').classList.remove('show');
    this.signal = null;
    if (ok) {
      Events.emit('signal:ok', {});
      const roll = Math.random();
      if (roll < 0.34) { this.ship.parts += 3; UIx.banner('SEÑAL DESCIFRADA', 'cápsula de suministros: +3 repuestos'); }
      else if (roll < 0.67) { this.ship.dist = Math.max(0, this.ship.dist - 7); UIx.banner('SEÑAL DESCIFRADA', 'atajo de navegación: −7000 km'); }
      else { this.ship.fuel = Math.min(100, this.ship.fuel + 28); UIx.banner('SEÑAL DESCIFRADA', 'depósito abandonado: +combustible'); }
    } else {
      this.ship.power = Math.max(0, this.ship.power - 14);
      UIx.banner('SEÑAL PERDIDA', 'la interferencia castiga la red eléctrica', true);
    }
  },

  /* ---------- reparaciones con R ---------- */
  updateRepair(dt) {
    const near = this.crew.nearest();
    let target = null, need = 0, label = '';
    if (near) {
      if (near.kind === 'breach') { target = near; need = 2.0; label = this.ship.parts > 0 ? 'sellando brecha…' : 'SIN REPUESTOS'; }
      else if (near.kind === 'fire') { target = near; need = 1.3; label = 'sofocando fuego…'; }
      else if (near.kind === 'station' && near.obj.hp < 40) {
        target = near; need = 2.6;
        label = this.ship.parts > 0 ? 'reparando ' + near.obj.name + '…' : 'SIN REPUESTOS';
      }
    }

    if (this.keys.has('KeyR') && target) {
      const needsPart = target.kind !== 'fire';
      if (needsPart && this.ship.parts <= 0) { this.repairProgress = 0; UIx.hint(label); return; }
      if (this.repairTarget !== target.obj) { this.repairTarget = target.obj; this.repairProgress = 0; }
      this.repairProgress += dt / need;
      if (Math.random() < dt * 9) {
        Events.emit('repair:tick', {});
        FX.spawn({
          x: (target.obj.cx || this.crew.x) + rand(-6, 6),
          y: (target.obj.cy || this.crew.y) + rand(-6, 6),
          vx: rand(-40, 40), vy: rand(-40, 40),
          life: rand(0.15, 0.35), size: rand(0.8, 1.8), color: '150,235,255', glow: true
        });
      }
      UIx.hint(label);
      if (this.repairProgress >= 1) {
        this.repairProgress = 0;
        if (target.kind === 'breach') {
          this.ship.breaches = this.ship.breaches.filter(b => b !== target.obj);
          this.ship.parts--;
          UIx.banner('BRECHA SELLADA');
        } else if (target.kind === 'fire') {
          this.ship.fires = this.ship.fires.filter(f => f !== target.obj);
          UIx.banner('FUEGO SOFOCADO');
        } else {
          target.obj.hp = 100;
          this.ship.parts--;
          UIx.banner(target.obj.name + ' OPERATIVO');
        }
      }
      return;
    }
    this.repairProgress = 0;
    this.repairTarget = null;

    // pista contextual
    if (!near) { UIx.hint(null); return; }
    if (near.kind === 'breach') UIx.hint('R — sellar brecha (1 repuesto)');
    else if (near.kind === 'fire') UIx.hint('R — sofocar fuego');
    else {
      const st = near.obj;
      if (st.jettisoned) { UIx.hint(null); return; }
      if (st.hp < 40) UIx.hint('R — reparar ' + st.name + ' (1 repuesto)');
      else if (st.type === 'R' || st.type === 'O') UIx.hint('E — ' + (st.on ? 'apagar ' : 'encender ') + st.name);
      else if (st.type === 'M') UIx.hint('E — acelerar MOTOR (' + (st.throttle * 100) + '%)');
      else if (st.type === 'A') UIx.hint(this.ship.anomaly ? 'ESPACIO — quemar motor para escapar' : 'E — consultar rumbo');
      else if (st.type === 'C') UIx.hint(this.ship.signalPending ? 'E — DESCIFRAR SEÑAL' : 'E — escuchar antena');
      else if (st.type === 'S') UIx.hint('E — eyectar módulo de carga');
    }
  },

  /* ---------- bucle ---------- */
  loop(t) {
    const dt = Math.min((t - this.lastT) / 1000, 0.05);
    this.lastT = t;
    if (this.state === 'playing') this.update(dt);
    if (!this.preview) {
      this.preview = { ship: new OdiseaShip(), crew: { x: -999, y: -999, r: 8, facing: 0 }, repairProgress: 0 };
    }
    Scene.draw(this.ctx, this.canvas.width, this.canvas.height, this.ship ? this : this.preview, dt);
    requestAnimationFrame(tt => this.loop(tt));
  },

  update(dt) {
    const ship = this.ship;
    if (this.signal) {
      this.signal.show -= dt;
      if (this.signal.show <= 0 && this.signal.show + dt > 0) {
        this.renderSignal(false);
        document.getElementById('sig-status').textContent = 'REPITE LA SECUENCIA';
      }
    }

    ship.update(dt);
    this.crew.update(dt, this.keys);
    this.director.update(ship, dt);
    this.updateRepair(dt);
    FX.update(dt);

    // escape de anomalía en el timón
    const helm = ship.station('A');
    if (ship.anomaly && this.keys.has('Space') &&
        dist2(this.crew.x, this.crew.y, helm.cx, helm.cy) < 62 * 62 && ship.fuel > 0) {
      ship.fuel = Math.max(0, ship.fuel - 3.2 * dt);
      ship.anomalyEscape += dt / (2.4 + ship.cargoLeft() * 1.5);
      FX.shake(1.5);
      if (Math.random() < dt * 30) Events.emit('repair:tick', {});
      if (ship.anomalyEscape >= 1) {
        ship.anomaly = false;
        UIx.banner('ANOMALÍA SUPERADA', 'rumbo recuperado');
        Events.emit('signal:ok', {});
      }
    }

    // emisiones continuas: aire escapando y llamas
    for (const b of ship.breaches) {
      if (Math.random() < dt * 40) {
        FX.spawn({
          x: b.cx + rand(-4, 4), y: b.cy + rand(-4, 4),
          vx: b.dirx * rand(70, 150) + rand(-18, 18),
          vy: b.diry * rand(70, 150) + rand(-18, 18),
          life: rand(0.3, 0.7), size: rand(1, 2.2), color: '170,215,250', drag: 0.98
        });
      }
    }
    for (const f of ship.fires) {
      if (Math.random() < dt * 34) {
        FX.spawn({
          x: f.cx + rand(-9, 9), y: f.cy + rand(-9, 9),
          vx: rand(-16, 16), vy: rand(-26, -6),
          life: rand(0.3, 0.7), size: rand(1.6, 3.2),
          color: Math.random() < 0.6 ? '255,150,60' : '255,215,120', glow: true, grow: 1.5
        });
      }
    }

    // audio ambiental
    SFX.hiss(ship.breaches.length * 0.35);
    SFX.hum(ship.power > 1 ? 0.4 + ship.station('M').throttle * 0.5 : 0.05);

    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.12; this.updateHud(); }

    // final de travesía
    if (ship.dist <= 0) this.finish(true, 'HAS VUELTO A CASA', 'la ODISEA cruza la última baliza');
    else if (this.crew.hp <= 0) this.finish(false, 'EL PULSO SE DETIENE',
      ship.o2 <= 1 ? 'sin oxígeno, el sueño llega en silencio' : 'las llamas pudieron contigo');
    else if (ship.hull <= 0) this.finish(false, 'EL CASCO CEDE', 'la ODISEA se abre al vacío');
  },

  updateHud() {
    const s = this.ship;
    const set = (id, v) => document.getElementById(id).style.width = clamp(v, 0, 100) + '%';
    set('bar-o2', s.o2); set('bar-pw', s.power); set('bar-fu', s.fuel);
    set('bar-hu', s.hull); set('bar-hp', this.crew.hp);
    document.getElementById('txt-dist').textContent = Math.ceil(s.dist * 1000).toLocaleString('es');
    const eng = s.station('M');
    document.getElementById('txt-eng').textContent =
      eng.hp < 40 ? 'AVERIADO' : eng.throttle === 0 ? 'APAGADO' : (eng.throttle * 100) + '%';
    document.getElementById('txt-parts').textContent = s.parts;
    document.getElementById('txt-cargo').textContent = s.cargoLeft();
    document.getElementById('txt-day').textContent = 1 + Math.floor(s.time / 110);

    let a = '';
    if (s.breaches.length) a += `<div class="alert">⚠ ${s.breaches.length} BRECHA(S) — el aire escapa</div>`;
    if (s.fires.length)    a += '<div class="alert">⚠ FUEGO A BORDO</div>';
    if (s.anomaly)         a += '<div class="alert">⚠ ANOMALÍA GRAVITATORIA — te aleja de casa</div>';
    if (s.signalPending)   a += `<div class="warn">◈ SEÑAL EN ESPERA (${Math.ceil(s.signalTimer)} s)</div>`;
    if (s.o2 < 25)         a += '<div class="alert">OXÍGENO CRÍTICO</div>';
    else if (s.o2 < 45)    a += '<div class="warn">oxígeno bajo</div>';
    if (s.power < 15)      a += '<div class="warn">energía baja</div>';
    if (s.fuel < 15)       a += '<div class="warn">combustible bajo</div>';
    if (!s.station('R').on) a += '<div class="warn">reactor apagado</div>';
    document.getElementById('alerts').innerHTML = a;
  },

  finish(win, title, sub) {
    this.state = 'end';
    document.body.classList.remove('playing');
    SFX.hiss(0); SFX.hum(0);
    const s = this.ship;
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-title').style.color = win ? '' : 'var(--danger)';
    document.getElementById('end-sub').textContent = sub;
    document.getElementById('end-stats').innerHTML =
      `<p>días de travesía: <b>${1 + Math.floor(s.time / 110)}</b> · tiempo: <b>${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</b></p>` +
      `<p>casco final: <b>${s.hull.toFixed(0)}%</b> · repuestos: <b>${s.parts}</b> · carga conservada: <b>${s.cargoLeft()}/3</b></p>` +
      (win ? '<p>La carga que conservaste vale el doble en puerto. ¿Te atreves con menos eyecciones?</p>'
           : '<p>La ODISEA queda a la deriva. Otra tripulación la encontrará… algún día.</p>');
    document.getElementById('end').classList.remove('hidden');
  }
};

addEventListener('DOMContentLoaded', () => Game.init());
