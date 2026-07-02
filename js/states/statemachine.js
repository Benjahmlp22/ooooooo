/* ============================================================
   PATRÓN: STATE — Máquina de estados del juego
   ------------------------------------------------------------
   CONSTRUIR ⇄ VUELO ⇄ HANGAR. Cada estado encapsula su lógica,
   render y manejo de entrada. El <body> refleja el estado
   actual con una clase CSS para mostrar/ocultar la interfaz.
   ============================================================ */
'use strict';

class GameState {
  enter(params) {}
  exit() {}
  update(dt) {}
  render(ctx, w, h) {}
  onKeyDown(e) {}
  onKeyUp(e) {}
  onMouse(type, e) {}
  onWheel(e) {}
}

class StateMachine {
  constructor() {
    this.states = new Map();
    this.current = null;
    this.currentName = '';
  }

  add(name, state) { this.states.set(name, state); }

  set(name, params) {
    if (this.current) this.current.exit();
    this.currentName = name;
    this.current = this.states.get(name);
    document.body.className = 'state-' + name;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById('tab-' + (name === 'flight' ? 'build' : name));
    if (tab) tab.classList.add('active');
    this.current.enter(params || {});
    Events.emit('state:changed', { name });
  }

  update(dt)         { if (this.current) this.current.update(dt); }
  render(ctx, w, h)  { if (this.current) this.current.render(ctx, w, h); }
}
