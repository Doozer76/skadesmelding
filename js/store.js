/* store.js – al lokal lagring samlet ét sted (IndexedDB).
 * Resten af appen kender kun disse funktioner. Når der kommer en backend,
 * er det her og i sync.js, der skal ændres – ikke i UI'et.
 *
 * Tabeller (object stores):
 *   users       { id, name, createdAt }
 *   shifts      { id, userId, userName, start, end }           – vagtlog
 *   treatments  { id, jnr, userId, shiftId, ..., version, status, createdAt, updatedAt }
 *   meta        { key, value }                                  – indstillinger, kladder, tællere
 */
(function () {
  'use strict';
  const DB_NAME = 'skadesmelding';
  const DB_VERSION = 1;
  const STORES = ['users', 'shifts', 'treatments'];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('Browseren understøtter ikke lokal lagring (IndexedDB).'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      let result;
      const r = fn(os);
      if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaktion afbrudt'));
    }));
  }

  const clone = o => JSON.parse(JSON.stringify(o));

  const Store = {
    open,
    all: store => tx(store, 'readonly', os => os.getAll()).then(r => r || []),
    get: (store, id) => tx(store, 'readonly', os => os.get(id)),
    put: (store, obj) => tx(store, 'readwrite', os => os.put(clone(obj))).then(() => obj),
    del: (store, id) => tx(store, 'readwrite', os => os.delete(id)),
    clear: store => tx(store, 'readwrite', os => os.clear()),

    getMeta: (key, fallback) => tx('meta', 'readonly', os => os.get(key)).then(r => (r ? r.value : fallback)),
    setMeta: (key, value) => tx('meta', 'readwrite', os => os.put({ key, value: clone(value) })),
    delMeta: key => tx('meta', 'readwrite', os => os.delete(key)),

    /* Sletter alt undtagen indstillinger (bruges til at nulstille testdata). */
    wipeData: () => Promise.all(STORES.map(s => Store.clear(s))).then(() =>
      tx('meta', 'readwrite', os => {
        const req = os.openCursor();
        req.onsuccess = () => {
          const c = req.result; if (!c) return;
          if (c.key !== 'settings') c.delete();
          c.continue();
        };
      })),

    /* Beder browseren om ikke at rydde data automatisk (virker bedst som installeret app). */
    persist: () => (navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(() => false) : Promise.resolve(false))
  };

  Store.uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  window.Store = Store;
})();
