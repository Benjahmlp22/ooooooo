/* ============================================================
   PATRÓN: FACADE — Persistencia del hangar
   ------------------------------------------------------------
   Interfaz única y simple sobre localStorage + códigos de
   intercambio. Guardar, publicar, exportar e importar naves
   sin que el resto del juego conozca el formato de almacenado.
   ============================================================ */
'use strict';

const HangarStore = (() => {
  const K_SHIPS = 'orbita_ships';
  const K_PUB   = 'orbita_published';
  const K_AUTHOR = 'orbita_author';
  const CODE_PREFIX = 'ORBITA1.';

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function sanitize(bp) {
    if (!bp || !Array.isArray(bp.blocks)) return null;
    const blocks = bp.blocks
      .filter(b => BLOCK_DEFS[b.t] && Number.isFinite(b.x) && Number.isFinite(b.y))
      .map(b => ({ t: b.t, x: b.x | 0, y: b.y | 0, r: (b.r | 0) & 3 }));
    if (blocks.length === 0) return null;
    return { name: String(bp.name || 'NAVE').slice(0, 24).toUpperCase(), blocks };
  }

  return {
    /* --- mis naves --- */
    listShips() { return load(K_SHIPS); },

    saveShip(bp) {
      bp = sanitize(bp);
      if (!bp) return false;
      const ships = load(K_SHIPS);
      const i = ships.findIndex(s => s.name === bp.name);
      if (i >= 0) ships[i] = bp; else ships.push(bp);
      save(K_SHIPS, ships);
      return true;
    },

    deleteShip(name) {
      save(K_SHIPS, load(K_SHIPS).filter(s => s.name !== name));
    },

    /* --- naves publicadas --- */
    listPublished() { return load(K_PUB); },

    publish(bp) {
      bp = sanitize(bp);
      if (!bp) return null;
      let author = localStorage.getItem(K_AUTHOR);
      if (!author) {
        author = (prompt('Firma del constructor (se guarda para futuras publicaciones):') || 'ANÓNIMO')
          .slice(0, 18).toUpperCase();
        localStorage.setItem(K_AUTHOR, author);
      }
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        author,
        date: new Date().toISOString().slice(0, 10),
        ...bp
      };
      const pub = load(K_PUB);
      pub.unshift(entry);
      save(K_PUB, pub);
      return entry;
    },

    unpublish(id) {
      save(K_PUB, load(K_PUB).filter(p => p.id !== id));
    },

    addPublished(entry) {
      const pub = load(K_PUB);
      pub.unshift(entry);
      save(K_PUB, pub);
    },

    /* --- códigos de intercambio --- */
    exportCode(bp) {
      const json = JSON.stringify({ name: bp.name, blocks: bp.blocks, author: bp.author });
      return CODE_PREFIX + btoa(unescape(encodeURIComponent(json)));
    },

    importCode(code) {
      try {
        code = (code || '').trim();
        if (!code.startsWith(CODE_PREFIX)) return null;
        const json = decodeURIComponent(escape(atob(code.slice(CODE_PREFIX.length))));
        const raw = JSON.parse(json);
        const bp = sanitize(raw);
        if (bp && raw.author) bp.author = String(raw.author).slice(0, 18);
        return bp;
      } catch (e) { return null; }
    }
  };
})();
