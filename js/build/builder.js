/* ============================================================
   Modelo del constructor: el plano (blueprint) de la nave
   ------------------------------------------------------------
   Grilla dispersa de celdas → tipo+rotación. Toda mutación
   pasa por comandos (patrón Command). Valida conectividad,
   cabina única y calcula estadísticas de ingeniería en vivo.
   ============================================================ */
'use strict';

class Builder {
  constructor() {
    this.grid = new Map();          // "x,y" -> { t, r }
    this.commands = new CommandStack(this);
    this.name = 'NAVE-01';
  }

  get(gx, gy)          { return this.grid.get(keyOf(gx, gy)); }
  rawSet(gx, gy, cell) { this.grid.set(keyOf(gx, gy), { t: cell.t, r: cell.r & 3 }); }
  rawRemove(gx, gy)    { this.grid.delete(keyOf(gx, gy)); }

  place(gx, gy, type, rot) {
    const cur = this.get(gx, gy);
    if (cur && cur.t === type && cur.r === (rot & 3)) return;   // sin cambio
    this.commands.exec(new PlaceCommand(gx, gy, type, rot & 3));
  }

  remove(gx, gy) {
    if (!this.get(gx, gy)) return;
    this.commands.exec(new RemoveCommand(gx, gy));
  }

  clear() {
    if (this.grid.size === 0) return;
    this.commands.exec(new ClearCommand());
  }

  undo() { return this.commands.undo(); }
  redo() { return this.commands.redo(); }

  /* ---------- validación ---------- */

  validate() {
    const errors = [], warnings = [];
    const cabins = [];
    for (const [k, c] of this.grid) if (c.t === 'cabin') cabins.push(k);

    if (this.grid.size === 0) { errors.push('El plano está vacío.'); return { ok: false, errors, warnings, orphans: new Set() }; }
    if (cabins.length === 0)  errors.push('Falta una CABINA.');
    if (cabins.length > 1)    errors.push('Solo puede haber una CABINA.');

    // conectividad desde la cabina
    const orphans = new Set(this.grid.keys());
    if (cabins.length >= 1) {
      const seen = new Set([cabins[0]]);
      const stack = [cabins[0]];
      while (stack.length) {
        const [x, y] = stack.pop().split(',').map(Number);
        for (const d of DIRS) {
          const k = keyOf(x + d.x, y + d.y);
          if (!seen.has(k) && this.grid.has(k)) { seen.add(k); stack.push(k); }
        }
      }
      for (const k of seen) orphans.delete(k);
      if (orphans.size > 0) errors.push(`${orphans.size} bloque(s) sin conexión con la cabina.`);
    }

    const s = this.stats();
    if (s.thrust === 0)   warnings.push('Sin propulsores: la nave no podrá moverse.');
    if (s.fuelCap === 0 && s.thrust > 0) warnings.push('Sin tanques: los propulsores no tendrán combustible.');
    if (s.lasers > 0 && s.powerCap === 0) warnings.push('Láseres sin reserva de energía.');
    if (s.lasers > 0 && s.powerGen === 0) warnings.push('Sin reactor: los láseres agotarán las baterías.');
    if (s.torque === 0 && s.thrust > 0) warnings.push('Sin giroscopio ni RCS descentrados: girar será difícil.');

    return { ok: errors.length === 0, errors, warnings, orphans };
  }

  /* ---------- estadísticas de ingeniería ---------- */

  stats() {
    let mass = 0, thrust = 0, fuelCap = 0, powerCap = 0, powerGen = 0,
        fuelUse = 0, torque = 0, lasers = 0, hp = 0;
    for (const c of this.grid.values()) {
      const d = BLOCK_DEFS[c.t];
      mass += d.mass; hp += d.hp;
      if (d.thrust && DIRS[c.r].y < 0) thrust += d.thrust;   // empuje hacia adelante
      if (d.fuelCap) fuelCap += d.fuelCap;
      if (d.powerCap) powerCap += d.powerCap;
      if (d.powerGen) powerGen += d.powerGen;
      if (d.fuelUse) fuelUse += d.fuelUse;
      if (d.torque) torque += d.torque;
      if (d.laser) lasers++;
    }
    return {
      blocks: this.grid.size, mass, hp, thrust, fuelCap, powerCap, powerGen,
      fuelUse, torque, lasers,
      accel: mass > 0 ? thrust / mass : 0
    };
  }

  /* ---------- serialización ---------- */

  toBlueprint() {
    const blocks = [];
    for (const [k, c] of this.grid) {
      const [x, y] = k.split(',').map(Number);
      blocks.push({ t: c.t, x, y, r: c.r });
    }
    return { name: this.name, blocks };
  }

  fromBlueprint(bp) {
    this.grid.clear();
    this.commands = new CommandStack(this);
    this.name = bp.name || 'NAVE';
    for (const b of bp.blocks || []) {
      if (BLOCK_DEFS[b.t]) this.rawSet(b.x, b.y, { t: b.t, r: b.r });
    }
    Events.emit('build:changed');
  }
}
