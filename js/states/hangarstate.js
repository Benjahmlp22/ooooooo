/* ============================================================
   ESTADO: HANGAR
   ------------------------------------------------------------
   Biblioteca de naves: guardar, cargar, eliminar, publicar y
   compartir por código. Miniaturas renderizadas del plano.
   ============================================================ */
'use strict';

class HangarState extends GameState {
  constructor() {
    super();
    this.domReady = false;
  }

  initDom() {
    if (this.domReady) return;
    this.domReady = true;
    document.getElementById('btn-import').addEventListener('click', () => {
      Events.emit('ui:click');
      const code = prompt('Pega el código de nave (ORBITA1.xxxx):');
      if (!code) return;
      const bp = HangarStore.importCode(code);
      if (!bp) { UI.toast('CÓDIGO INVÁLIDO'); return; }
      HangarStore.saveShip(bp);
      UI.toast(`«${bp.name}» IMPORTADA`);
      this.refresh();
    });
  }

  enter() {
    this.initDom();
    this.refresh();
  }

  thumbnail(bp, wpx, hpx) {
    const cv = document.createElement('canvas');
    cv.width = wpx; cv.height = hpx;
    const c = cv.getContext('2d');
    if (!bp.blocks.length) return cv;

    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const b of bp.blocks) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
    }
    const gw = (maxX - minX + 1), gh = (maxY - minY + 1);
    const s = Math.min((wpx - 16) / gw, (hpx - 16) / gh, 18);
    c.translate(wpx / 2 - (minX + maxX) / 2 * s, hpx / 2 - (minY + maxY) / 2 * s);
    for (const b of bp.blocks) {
      c.save();
      c.translate(b.x * s, b.y * s);
      drawBlockType(c, b.t, b.r, s);
      c.restore();
    }
    return cv;
  }

  card(bp, actions) {
    const el = document.createElement('div');
    el.className = 'ship-card';
    el.appendChild(this.thumbnail(bp, 180, 100));
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = bp.name;
    el.appendChild(name);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${bp.blocks.length} bloques` +
      (bp.author ? ` · por ${bp.author}` : '') +
      (bp.date ? ` · ${bp.date}` : '');
    el.appendChild(meta);
    const row = document.createElement('div');
    row.className = 'row';
    for (const [label, fn, cls] of actions) {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (cls) btn.className = cls;
      btn.addEventListener('click', () => { Events.emit('ui:click'); fn(); });
      row.appendChild(btn);
    }
    el.appendChild(row);
    return el;
  }

  refresh() {
    const mine = document.getElementById('hangar-list');
    mine.innerHTML = '';
    const ships = HangarStore.listShips();
    if (ships.length === 0) {
      mine.innerHTML = '<div class="empty">— sin naves guardadas: construye una y pulsa GUARDAR —</div>';
    }
    for (const bp of ships) {
      mine.appendChild(this.card(bp, [
        ['CARGAR', () => {
          Game.buildState.loadBlueprint(bp);
          Game.fsm.set('build');
          UI.toast(`«${bp.name}» EN EL ASTILLERO`);
        }],
        ['PUBLICAR', () => {
          const entry = HangarStore.publish(bp);
          if (entry) {
            this.copyCode(HangarStore.exportCode(entry));
            UI.toast('PUBLICADA — CÓDIGO COPIADO');
            this.refresh();
          }
        }],
        ['CÓDIGO', () => {
          this.copyCode(HangarStore.exportCode(bp));
          UI.toast('CÓDIGO COPIADO AL PORTAPAPELES');
        }],
        ['✕', () => {
          if (confirm(`¿Eliminar «${bp.name}»?`)) { HangarStore.deleteShip(bp.name); this.refresh(); }
        }, 'danger']
      ]));
    }

    const pub = document.getElementById('published-list');
    pub.innerHTML = '';
    const published = HangarStore.listPublished();
    if (published.length === 0) {
      pub.innerHTML = '<div class="empty">— nada publicado todavía —</div>';
    }
    for (const entry of published) {
      pub.appendChild(this.card(entry, [
        ['CARGAR', () => {
          Game.buildState.loadBlueprint(entry);
          Game.fsm.set('build');
        }],
        ['CÓDIGO', () => {
          this.copyCode(HangarStore.exportCode(entry));
          UI.toast('CÓDIGO COPIADO AL PORTAPAPELES');
        }],
        ['RETIRAR', () => { HangarStore.unpublish(entry.id); this.refresh(); }, 'danger']
      ]));
    }
  }

  copyCode(code) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).catch(() => prompt('Copia el código:', code));
    } else {
      prompt('Copia el código:', code);
    }
  }

  render(ctx, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, w, h);
  }
}
