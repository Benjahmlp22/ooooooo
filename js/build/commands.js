/* ============================================================
   PATRÓN: COMMAND — Operaciones de construcción reversibles
   ------------------------------------------------------------
   Cada edición del plano (colocar, quitar, limpiar) es un
   comando con do/undo, apilado para Ctrl+Z / Ctrl+Y.
   ============================================================ */
'use strict';

class PlaceCommand {
  constructor(gx, gy, type, rot) {
    this.gx = gx; this.gy = gy; this.type = type; this.rot = rot;
    this.prev = null;
  }
  do(builder) {
    this.prev = builder.get(this.gx, this.gy) || null;
    builder.rawSet(this.gx, this.gy, { t: this.type, r: this.rot });
  }
  undo(builder) {
    if (this.prev) builder.rawSet(this.gx, this.gy, this.prev);
    else builder.rawRemove(this.gx, this.gy);
  }
}

class RemoveCommand {
  constructor(gx, gy) {
    this.gx = gx; this.gy = gy; this.prev = null;
  }
  do(builder) {
    this.prev = builder.get(this.gx, this.gy) || null;
    builder.rawRemove(this.gx, this.gy);
  }
  undo(builder) {
    if (this.prev) builder.rawSet(this.gx, this.gy, this.prev);
  }
}

class ClearCommand {
  constructor() { this.prev = null; }
  do(builder) {
    this.prev = new Map(builder.grid);
    builder.grid.clear();
  }
  undo(builder) {
    builder.grid = new Map(this.prev);
  }
}

class CommandStack {
  constructor(builder, limit = 200) {
    this.builder = builder;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  exec(cmd) {
    cmd.do(this.builder);
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    Events.emit('build:changed');
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo(this.builder);
    this.redoStack.push(cmd);
    Events.emit('build:changed');
    return true;
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.do(this.builder);
    this.undoStack.push(cmd);
    Events.emit('build:changed');
    return true;
  }
}
