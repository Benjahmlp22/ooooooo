/* ============================================================
   PATRÓN: STRATEGY — Director de eventos de la travesía
   ------------------------------------------------------------
   Cada tipo de evento es una estrategia con su puesta en escena
   y sus consecuencias. El director los programa con intervalos
   que se acortan según avanza la travesía.
   ============================================================ */
'use strict';

class GameEvent {
  constructor(director) { this.dir = director; this.done = false; }
  start(ship) {}
  update(ship, dt) {}
}

/* --- tormenta de meteoritos: impactos que abren brechas --- */
class MeteorStorm extends GameEvent {
  start(ship) {
    this.left = (4 + Math.random() * 4) | 0;
    this.timer = 0.6;
    UIx.banner('TORMENTA DE METEORITOS', 'impactos en el casco — sella las brechas (R)', true);
  }
  update(ship, dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = rand(0.5, 1.3);
    this.left--;
    Events.emit('impact', {});
    FX.shake(7);
    const roll = Math.random();
    if (roll < 0.5) ship.addBreach();
    else if (roll < 0.68 && ship.fires.length < 5) {
      const f = ship.floors[(Math.random() * ship.floors.length) | 0];
      ship.addFire(f.x, f.y);
    } else if (roll < 0.8) ship.damageRandomStation();
    if (this.left <= 0) this.done = true;
  }
}

/* --- señal desconocida: descífrala en comunicaciones --- */
class StrangeSignal extends GameEvent {
  start(ship) {
    ship.signalPending = true;
    ship.signalTimer = 45;
    UIx.banner('SEÑAL DESCONOCIDA', 'acude a COMUNICACIONES y descífrala (E)');
    this.done = true;
  }
}

/* --- subida de tensión: el reactor sufre --- */
class PowerSurge extends GameEvent {
  start(ship) {
    UIx.banner('SUBIDA DE TENSIÓN', 'sistema eléctrico inestable', true);
    Events.emit('spark', {});
    if (Math.random() < 0.55) ship.damageRandomStation();
    else ship.power = Math.max(0, ship.power - 32);
    this.done = true;
  }
}

/* --- anomalía gravitatoria: te arrastra lejos de casa --- */
class GravityAnomaly extends GameEvent {
  start(ship) {
    ship.anomaly = true;
    ship.anomalyEscape = 0;
    UIx.banner('ANOMALÍA GRAVITATORIA', 'al TIMÓN: mantén ESPACIO para quemar motor — menos carga, antes escapas', true);
  }
  update(ship, dt) {
    if (!ship.anomaly) this.done = true;   // escapada desde el timón
  }
}

/* --- fuego espontáneo --- */
class SpontaneousFire extends GameEvent {
  start(ship) {
    const f = ship.floors[(Math.random() * ship.floors.length) | 0];
    ship.addFire(f.x, f.y);
    UIx.banner('FUEGO A BORDO', 'sofócalo antes de que se propague (R)', true);
    this.done = true;
  }
}

class EventDirector {
  constructor() {
    this.timer = 16;         // primer aviso
    this.active = [];
  }

  update(ship, dt) {
    for (const e of this.active) e.update(ship, dt);
    this.active = this.active.filter(e => !e.done);

    this.timer -= dt;
    if (this.timer > 0) return;
    // cadencia que aprieta con los días
    const day = 1 + Math.floor(ship.time / 110);
    this.timer = rand(15, 26) - Math.min(day * 1.4, 9);

    const pool = [];
    const add = (C, w) => { for (let i = 0; i < w; i++) pool.push(C); };
    add(MeteorStorm, 3);
    add(StrangeSignal, ship.signalPending ? 0 : 2);
    add(PowerSurge, 2);
    add(GravityAnomaly, ship.anomaly ? 0 : 2);
    add(SpontaneousFire, 2);
    const C = pool[(Math.random() * pool.length) | 0];
    const ev = new C(this);
    Events.emit('event:start', {});
    ev.start(ship);
    if (!ev.done) this.active.push(ev);
  }
}
