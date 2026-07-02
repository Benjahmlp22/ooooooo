/* ============================================================
   ESTADO: CONSTRUIR
   ------------------------------------------------------------
   Editor de naves sobre grilla: colocar/rotar/borrar bloques,
   pan y zoom, deshacer/rehacer, validación y estadísticas de
   ingeniería en tiempo real. El plano se guarda como borrador.
   ============================================================ */
'use strict';

const DEFAULT_BP = {
  name: 'NAVE-01',
  blocks: [
    { t: 'laser',    x: 0,  y: -2, r: 0 },
    { t: 'rcs',      x: -1, y: -1, r: 3 },
    { t: 'cabin',    x: 0,  y: -1, r: 0 },
    { t: 'rcs',      x: 1,  y: -1, r: 1 },
    { t: 'tank',     x: -1, y:  0, r: 0 },
    { t: 'reactor',  x: 0,  y:  0, r: 0 },
    { t: 'battery',  x: 1,  y:  0, r: 0 },
    { t: 'thruster', x: -1, y: 1, r: 0 },
    { t: 'gyro',     x: 0,  y:  1, r: 0 },
    { t: 'thruster', x: 1,  y:  1, r: 0 }
  ]
};

class BuildState extends GameState {
  constructor() {
    super();
    this.builder = new Builder();
    this.selected = 'hull';
    this.rot = 0;
    this.zoom = 1.6;
    this.panX = 0; this.panY = 0;
    this.hover = null;              // {gx, gy}
    this.dragging = null;           // 'place' | 'erase' | 'pan'
    this.lastMouse = { x: 0, y: 0 };
    this.spaceHeld = false;
    this.domReady = false;

    // restaurar borrador
    try {
      const draft = JSON.parse(localStorage.getItem('orbita_draft'));
      this.builder.fromBlueprint(draft && draft.blocks && draft.blocks.length ? draft : DEFAULT_BP);
    } catch (e) { this.builder.fromBlueprint(DEFAULT_BP); }

    Events.on('build:changed', () => {
      if (Game.fsm.currentName === 'build') this.refreshPanels();
      try { localStorage.setItem('orbita_draft', JSON.stringify(this.builder.toBlueprint())); } catch (e) {}
    });
  }

  /* ---------- DOM ---------- */

  initDom() {
    if (this.domReady) return;
    this.domReady = true;

    const list = document.getElementById('palette-list');
    for (const type of BlockFactory.types) {
      const def = BLOCK_DEFS[type];
      const el = document.createElement('div');
      el.className = 'pal-item';
      el.dataset.type = type;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 40;
      const c = cv.getContext('2d');
      c.translate(20, 20);
      drawBlockType(c, type, 0, 34);
      el.appendChild(cv);
      const label = document.createElement('span');
      label.textContent = def.name;
      el.appendChild(label);
      const kbd = document.createElement('kbd');
      kbd.textContent = def.hotkey;
      el.appendChild(kbd);
      el.addEventListener('click', () => { this.select(type); Events.emit('ui:click'); });
      el.addEventListener('mouseenter', () => this.showInfo(type));
      list.appendChild(el);
    }

    const nameInput = document.getElementById('ship-name');
    nameInput.addEventListener('input', () => {
      this.builder.name = nameInput.value.toUpperCase() || 'NAVE';
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      Events.emit('ui:click');
      this.builder.clear();
      UI.toast('PLANO LIMPIO');
    });
    document.getElementById('btn-save').addEventListener('click', () => {
      Events.emit('ui:click');
      this.save();
    });
    document.getElementById('btn-launch').addEventListener('click', () => {
      Events.emit('ui:click');
      this.launch();
    });

    this.select('hull');
  }

  select(type) {
    this.selected = type;
    document.querySelectorAll('.pal-item').forEach(el =>
      el.classList.toggle('sel', el.dataset.type === type));
    this.showInfo(type);
  }

  showInfo(type) {
    const d = BLOCK_DEFS[type];
    const rows = [`<span class="t">${d.name}</span>`, d.desc, ''];
    const st = [`masa <b>${d.mass}</b>`, `PV <b>${d.hp}</b>`];
    if (d.thrust)   st.push(`empuje <b>${d.thrust} N</b>`);
    if (d.fuelUse)  st.push(`consumo <b>${d.fuelUse} u/s</b>`);
    if (d.fuelCap)  st.push(`combustible <b>${d.fuelCap} u</b>`);
    if (d.powerCap) st.push(`energía <b>${d.powerCap} u</b>`);
    if (d.powerGen) st.push(`genera <b>${d.powerGen} u/s</b>`);
    if (d.torque)   st.push(`par <b>${d.torque}</b>`);
    if (d.resist)   st.push(`absorbe <b>${Math.round(d.resist * 100)}%</b>`);
    if (d.laser)    st.push(`daño <b>${d.laser.dmg}</b> · alcance <b>${d.laser.range}</b>`);
    document.getElementById('block-info').innerHTML =
      rows.join('<br>') + st.join(' · ');
  }

  refreshPanels() {
    const s = this.builder.stats();
    const v = this.builder.validate();
    this.orphans = v.orphans;

    const fmt = (a, b) => `<div class="row"><span>${a}</span><span>${b}</span></div>`;
    document.getElementById('ship-stats').innerHTML =
      fmt('BLOQUES', s.blocks) +
      fmt('MASA', s.mass.toFixed(0)) +
      fmt('PV TOTAL', s.hp) +
      fmt('EMPUJE ADELANTE', s.thrust + ' N') +
      fmt('ACELERACIÓN', s.accel.toFixed(1) + ' m/s²') +
      fmt('COMBUSTIBLE', s.fuelCap + ' u') +
      fmt('ENERGÍA', s.powerCap + ' u') +
      fmt('GENERACIÓN', s.powerGen + ' u/s') +
      fmt('PAR GIRO', s.torque) +
      fmt('LÁSERES', s.lasers);

    let html = '';
    for (const e of v.errors)   html += `<div class="err">✕ ${e}</div>`;
    for (const w of v.warnings) html += `<div class="dim">△ ${w}</div>`;
    if (v.ok && v.warnings.length === 0) html = '<div class="ok">✓ Nave lista para el despegue.</div>';
    else if (v.ok) html = '<div class="ok">✓ Válida (con avisos).</div>' + html;
    document.getElementById('validation').innerHTML = html;

    document.getElementById('btn-launch').disabled = !v.ok;
  }

  /* ---------- ciclo ---------- */

  enter() {
    this.initDom();
    document.getElementById('ship-name').value = this.builder.name;
    this.refreshPanels();
  }

  exit() {}

  loadBlueprint(bp) {
    this.builder.fromBlueprint(bp);
    if (this.domReady) document.getElementById('ship-name').value = this.builder.name;
  }

  save() {
    const bp = this.builder.toBlueprint();
    if (bp.blocks.length === 0) { UI.toast('NADA QUE GUARDAR'); return; }
    if (HangarStore.saveShip(bp)) UI.toast(`«${bp.name}» GUARDADA EN EL HANGAR`);
  }

  launch() {
    const v = this.builder.validate();
    if (!v.ok) { UI.toast(v.errors[0]); return; }
    this.save();
    Game.fsm.set('flight', { blueprint: this.builder.toBlueprint() });
  }

  /* ---------- entrada ---------- */

  screenToGrid(sx, sy, w, h) {
    const wx = (sx - w / 2 - this.panX) / this.zoom;
    const wy = (sy - h / 2 - this.panY) / this.zoom;
    return { gx: Math.round(wx / CELL), gy: Math.round(wy / CELL) };
  }

  onMouse(type, e) {
    const w = Game.canvas.width, h = Game.canvas.height;
    const g = this.screenToGrid(e.clientX, e.clientY, w, h);
    this.hover = g;

    if (type === 'down') {
      SFX.unlock();
      if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
        this.dragging = 'pan';
      } else if (e.button === 0) {
        this.dragging = 'place';
        this.builder.place(g.gx, g.gy, this.selected, this.rot);
      } else if (e.button === 2) {
        this.dragging = 'erase';
        this.builder.remove(g.gx, g.gy);
      }
    } else if (type === 'move') {
      if (this.dragging === 'pan') {
        this.panX += e.clientX - this.lastMouse.x;
        this.panY += e.clientY - this.lastMouse.y;
      } else if (this.dragging === 'place') {
        this.builder.place(g.gx, g.gy, this.selected, this.rot);
      } else if (this.dragging === 'erase') {
        this.builder.remove(g.gx, g.gy);
      }
    } else if (type === 'up') {
      this.dragging = null;
    }
    this.lastMouse = { x: e.clientX, y: e.clientY };
  }

  onWheel(e) {
    const z = this.zoom * (e.deltaY < 0 ? 1.12 : 0.9);
    this.zoom = clamp(z, 0.6, 3.2);
  }

  onKeyDown(e) {
    if (e.code === 'Space') { this.spaceHeld = true; e.preventDefault(); }
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) this.rot = (this.rot + 1) & 3;
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.builder.redo() : this.builder.undo(); }
      if (e.code === 'KeyY') { e.preventDefault(); this.builder.redo(); }
      return;
    }
    // selección rápida por tecla
    for (const type of BlockFactory.types) {
      const hk = BLOCK_DEFS[type].hotkey;
      if (e.key === hk) { this.select(type); break; }
    }
  }

  onKeyUp(e) {
    if (e.code === 'Space') this.spaceHeld = false;
  }

  /* ---------- render ---------- */

  update(dt) {}

  render(ctx, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2 + this.panX, h / 2 + this.panY);
    ctx.scale(this.zoom, this.zoom);

    // grilla
    const half = CELL / 2;
    const x0 = Math.floor((-w / 2 - this.panX) / this.zoom / CELL) - 1;
    const x1 = Math.ceil(( w / 2 - this.panX) / this.zoom / CELL) + 1;
    const y0 = Math.floor((-h / 2 - this.panY) / this.zoom / CELL) - 1;
    const y1 = Math.ceil(( h / 2 - this.panY) / this.zoom / CELL) + 1;

    ctx.strokeStyle = 'rgba(180,205,230,0.05)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) { ctx.moveTo(x * CELL - half, y0 * CELL); ctx.lineTo(x * CELL - half, y1 * CELL); }
    for (let y = y0; y <= y1; y++) { ctx.moveTo(x0 * CELL, y * CELL - half); ctx.lineTo(x1 * CELL, y * CELL - half); }
    ctx.stroke();

    // ejes de referencia
    ctx.strokeStyle = 'rgba(110,231,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, y0 * CELL); ctx.lineTo(0, y1 * CELL);
    ctx.moveTo(x0 * CELL, 0); ctx.lineTo(x1 * CELL, 0);
    ctx.stroke();

    // indicador de proa
    ctx.fillStyle = 'rgba(110,231,255,0.3)';
    ctx.font = `${10 / this.zoom + 4}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('▲ PROA', 0, (y0 + 0.7) * CELL);

    // bloques del plano
    for (const [k, c] of this.builder.grid) {
      const [gx, gy] = k.split(',').map(Number);
      ctx.save();
      ctx.translate(gx * CELL, gy * CELL);
      drawBlockType(ctx, c.t, c.r, CELL);
      ctx.restore();
      if (this.orphans && this.orphans.has(k)) {
        ctx.strokeStyle = 'rgba(255,93,93,0.7)';
        ctx.lineWidth = 1.5 / this.zoom;
        ctx.strokeRect(gx * CELL - half, gy * CELL - half, CELL, CELL);
      }
    }

    // centro de masa
    const s = this.builder.stats();
    if (s.blocks > 0) {
      let cx = 0, cy = 0, m = 0;
      for (const [k, c] of this.builder.grid) {
        const [gx, gy] = k.split(',').map(Number);
        const bm = BLOCK_DEFS[c.t].mass;
        cx += gx * bm; cy += gy * bm; m += bm;
      }
      cx = cx / m * CELL; cy = cy / m * CELL;
      ctx.strokeStyle = 'rgba(255,180,84,0.8)';
      ctx.lineWidth = 1 / this.zoom;
      const r = 5 / this.zoom + 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.moveTo(cx - r * 1.6, cy); ctx.lineTo(cx + r * 1.6, cy);
      ctx.moveTo(cx, cy - r * 1.6); ctx.lineTo(cx, cy + r * 1.6);
      ctx.stroke();
    }

    // fantasma del bloque a colocar
    if (this.hover && !this.dragging) {
      const occupied = !!this.builder.get(this.hover.gx, this.hover.gy);
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.translate(this.hover.gx * CELL, this.hover.gy * CELL);
      drawBlockType(ctx, this.selected, this.rot, CELL);
      ctx.restore();
      ctx.strokeStyle = occupied ? 'rgba(255,93,93,0.6)' : 'rgba(110,231,255,0.4)';
      ctx.lineWidth = 1 / this.zoom;
      ctx.strokeRect(this.hover.gx * CELL - half, this.hover.gy * CELL - half, CELL, CELL);
    }
  }
}
