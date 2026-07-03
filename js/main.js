/* ============================================================
   PATRÓN: SINGLETON — Objeto Game (raíz de composición)
   ------------------------------------------------------------
   Crea el canvas, la máquina de estados, enruta la entrada al
   estado activo y ejecuta el bucle principal con paso limitado.
   ============================================================ */
'use strict';

const UI = {
  toastTimer: null,
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  },

  overlayTimer: null,
  overlay(msg, sub, cls, ms) {
    const el = document.getElementById('overlay-msg');
    el.innerHTML = msg + (sub ? `<small>${sub}</small>` : '');
    el.className = 'show' + (cls ? ' ' + cls : '');
    clearTimeout(this.overlayTimer);
    this.overlayTimer = setTimeout(() => el.classList.remove('show'), ms || 2000);
  }
};

const Game = {
  canvas: null,
  ctx: null,
  fsm: null,
  buildState: null,
  lastT: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // estados
    this.fsm = new StateMachine();
    this.buildState = new BuildState();
    this.fsm.add('build', this.buildState);
    this.fsm.add('flight', new FlightState());
    this.fsm.add('hangar', new HangarState());
    this.fsm.set('build');

    this.bindInput();
    this.bindChrome();

    requestAnimationFrame(t => this.loop(t));
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  typing() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  },

  bindInput() {
    window.addEventListener('keydown', e => {
      SFX.unlock();
      if (this.typing()) return;
      if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
        const muted = SFX.toggleMute();
        UI.toast(muted ? 'SONIDO DESACTIVADO' : 'SONIDO ACTIVADO');
        return;
      }
      this.fsm.current.onKeyDown(e);
    });
    window.addEventListener('keyup', e => {
      if (this.typing()) return;
      this.fsm.current.onKeyUp(e);
    });

    const cv = this.canvas;
    cv.addEventListener('mousedown', e => { e.preventDefault(); this.fsm.current.onMouse('down', e); });
    window.addEventListener('mousemove', e => this.fsm.current.onMouse('move', e));
    window.addEventListener('mouseup',   e => this.fsm.current.onMouse('up', e));
    cv.addEventListener('wheel', e => { e.preventDefault(); this.fsm.current.onWheel(e); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => {
      const st = this.fsm.current;
      if (st && st.keys) st.keys.clear();
    });
  },

  bindChrome() {
    document.getElementById('tab-build').addEventListener('click', () => {
      Events.emit('ui:click');
      if (this.fsm.currentName !== 'build') this.fsm.set('build');
    });
    document.getElementById('tab-hangar').addEventListener('click', () => {
      Events.emit('ui:click');
      if (this.fsm.currentName !== 'hangar') this.fsm.set('hangar');
    });
    document.getElementById('btn-mute').addEventListener('click', () => {
      const muted = SFX.toggleMute();
      UI.toast(muted ? 'SONIDO DESACTIVADO' : 'SONIDO ACTIVADO');
    });

    // modo de vuelo ASISTIDO / REALISTA (persistente; G en vuelo)
    const btnAssist = document.getElementById('btn-assist');
    const syncAssist = () => { btnAssist.textContent = Settings.assist ? 'ASISTIDO' : 'REALISTA'; };
    syncAssist();
    btnAssist.addEventListener('click', () => {
      Events.emit('ui:click');
      const v = Settings.toggleAssist();
      UI.toast('MODO DE VUELO: ' + (v ? 'ASISTIDO' : 'REALISTA'));
    });
    Events.on('settings:assist', syncAssist);
  },

  loop(t) {
    const dt = Math.min((t - this.lastT) / 1000, 0.05);
    this.lastT = t;
    this.fsm.update(dt);
    this.fsm.render(this.ctx, this.canvas.width, this.canvas.height);
    requestAnimationFrame(tt => this.loop(tt));
  }
};

window.addEventListener('DOMContentLoaded', () => Game.init());
