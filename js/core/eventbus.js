/* ============================================================
   PATRÓN: OBSERVER (Event Bus)
   ------------------------------------------------------------
   Canal central de eventos. Los sistemas se desacoplan entre sí:
   la simulación emite ('block:destroyed', 'ship:destroyed',
   'impact', 'leak:start'...) y los efectos, el sonido y el HUD
   se suscriben sin conocerse mutuamente.
   ============================================================ */
'use strict';

class EventBus {
  constructor() { this.map = new Map(); }

  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
    return () => this.off(ev, fn);
  }

  off(ev, fn) {
    const s = this.map.get(ev);
    if (s) s.delete(fn);
  }

  emit(ev, data) {
    const s = this.map.get(ev);
    if (s) for (const fn of s) fn(data);
  }

  clear(ev) {
    if (ev) this.map.delete(ev); else this.map.clear();
  }
}

const Events = new EventBus();
