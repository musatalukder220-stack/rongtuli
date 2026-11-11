'use strict';
/* ============================================================
 * 15-store.js : where "My folders" keeps its projects.
 * They live in the browser's own database on this phone (IndexedDB),
 * so they are still there after the app is closed. Where the browser
 * does not allow that (a locked-down preview frame, some private modes)
 * they are kept in memory until the page is closed: Store.persistent
 * tells which of the two is in use.
 *
 * Records ("meta" store, key = id):
 *   project { id, kind:'project', name, folder (id or ''), created, modified, width, height, count, size, thumb }
 *   folder  { id, kind:'folder', name, created }
 *   draft   { id:'draft', kind:'draft', ... }   the last unsaved edit, to carry on after the browser closed the page
 * The project file itself (bytes) is in the "data" store under the same id.
 * ============================================================ */
const Store = { persistent: false };
(function () {
  const DB_NAME = 'rongtuli', DB_VERSION = 1;
  let db = null, opening = null;
  const mem = { meta: new Map(), data: new Map() };
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('The storage could not be read')); });
  const finished = (tx) => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('The storage could not be written'));
    tx.onabort = () => rej(tx.error || new Error('The storage could not be written'));
  });
  function friendly(e) {
    const name = e && e.name ? e.name : '';
    if (name === 'QuotaExceededError' || /quota/i.test(String(e && e.message))) return new Error('The storage of this phone is full. Delete some old projects (or other files) and try again.');
    return e instanceof Error ? e : new Error(String(e || 'The storage did not work'));
  }

  /* open the database (once). Never fails: falls back to memory. */
  Store.ready = function () {
    if (opening) return opening;
    opening = new Promise((resolve) => {
      let settled = false;
      const fin = (d) => {
        if (settled) { if (d) { try { d.close(); } catch (e) { /* ignore */ } } return; }
        settled = true; db = d || null; Store.persistent = !!d; resolve();
      };
      try {
        if (U.sandboxed() || typeof indexedDB === 'undefined' || !indexedDB) { fin(null); return; }
        const r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('data')) d.createObjectStore('data');
        };
        r.onsuccess = () => {
          const d = r.result;
          d.onversionchange = () => { try { d.close(); } catch (e) { /* ignore */ } if (db === d) { db = null; opening = null; } };
          fin(d);
        };
        r.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); fin(null); };
        r.onblocked = () => fin(null);
        setTimeout(() => fin(null), 5000);
      } catch (e) { fin(null); }
    });
    return opening;
  };

  /* -> { projects (newest first), folders (A-Z), draft | null } */
  Store.all = async function () {
    await Store.ready();
    let list;
    try { list = db ? await req(db.transaction('meta', 'readonly').objectStore('meta').getAll()) : Array.from(mem.meta.values()); }
    catch (e) { throw friendly(e); }
    return {
      projects: list.filter((m) => m.kind === 'project').sort((a, b) => (b.modified || 0) - (a.modified || 0)),
      folders: list.filter((m) => m.kind === 'folder').sort((a, b) => String(a.name).localeCompare(String(b.name))),
      draft: list.find((m) => m.kind === 'draft') || null
    };
  };
  Store.meta = async function (id) {
    await Store.ready();
    try { return (db ? await req(db.transaction('meta', 'readonly').objectStore('meta').get(id)) : mem.meta.get(id)) || null; }
    catch (e) { throw friendly(e); }
  };
  /* write a record, and (when given) the bytes of the project file that belongs to it */
  Store.save = async function (meta, buf) {
    await Store.ready();
    if (!db) { mem.meta.set(meta.id, Object.assign({}, meta)); if (buf) mem.data.set(meta.id, buf); return; }
    try {
      const tx = db.transaction(buf ? ['meta', 'data'] : ['meta'], 'readwrite');
      tx.objectStore('meta').put(meta);
      if (buf) tx.objectStore('data').put(buf, meta.id);
      await finished(tx);
    } catch (e) { throw friendly(e); }
  };
  Store.patch = async function (id, changes) {
    const m = await Store.meta(id);
    if (!m) return null;
    Object.assign(m, changes);
    await Store.save(m);
    return m;
  };
  /* the bytes of a project file (ArrayBuffer), or null */
  Store.load = async function (id) {
    await Store.ready();
    try { return (db ? await req(db.transaction('data', 'readonly').objectStore('data').get(id)) : mem.data.get(id)) || null; }
    catch (e) { throw friendly(e); }
  };
  Store.remove = async function (id) {
    await Store.ready();
    if (!db) { mem.meta.delete(id); mem.data.delete(id); return; }
    try {
      const tx = db.transaction(['meta', 'data'], 'readwrite');
      tx.objectStore('meta').delete(id); tx.objectStore('data').delete(id);
      await finished(tx);
    } catch (e) { throw friendly(e); }
  };
  /* ask the browser not to clear our projects when the phone runs low on space (it may say no) */
  let asked = false;
  Store.keep = function () {
    if (asked || !Store.persistent) return;
    asked = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { }); } catch (e) { /* ignore */ }
  };
  Store.newId = (prefix) => (prefix || 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
})();
