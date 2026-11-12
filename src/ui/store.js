/* تخزين المكتبة محلياً في IndexedDB (لا شبكة). عند تعذّره (نافذة خاصة…) تعمل المكتبة في الذاكرة فقط. */
const DB = 'das-library', REC = 'records', BLOB = 'blobs';
let dbp = null;
const mem = { records: new Map(), blobs: new Map() };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { const d = rq.result; d.createObjectStore(REC, { keyPath: 'id' }); d.createObjectStore(BLOB); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  return dbp;
}
const wrap = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
async function tx(store, mode, fn) {
  const d = await open();
  if (!d) return undefined;
  const t = d.transaction(store, mode);
  const r = await wrap(fn(t.objectStore(store)));
  return r;
}

export async function persistent() { return !!(await open()); }
export async function loadAll() {
  const r = await tx(REC, 'readonly', (s) => s.getAll());
  return r === undefined ? [...mem.records.values()] : r;
}
export async function putRecord(rec) {
  mem.records.set(rec.id, rec);
  try { await tx(REC, 'readwrite', (s) => s.put(rec)); } catch (e) { console.error(e); }
}
export async function delRecord(id) {
  mem.records.delete(id); mem.blobs.delete('thumb:' + id); mem.blobs.delete('full:' + id);
  try {
    await tx(REC, 'readwrite', (s) => s.delete(id));
    await tx(BLOB, 'readwrite', (s) => s.delete('thumb:' + id));
    await tx(BLOB, 'readwrite', (s) => s.delete('full:' + id));
  } catch (e) { console.error(e); }
}
export async function putBlob(key, blob) {
  mem.blobs.set(key, blob);
  try { await tx(BLOB, 'readwrite', (s) => s.put(blob, key)); } catch (e) { console.error(e); }
}
export async function getBlob(key) {
  try { const r = await tx(BLOB, 'readonly', (s) => s.get(key)); if (r !== undefined) return r; } catch (e) { console.error(e); }
  return mem.blobs.get(key) || null;
}
export async function clearAll() {
  mem.records.clear(); mem.blobs.clear();
  try { await tx(REC, 'readwrite', (s) => s.clear()); await tx(BLOB, 'readwrite', (s) => s.clear()); } catch (e) { console.error(e); }
}
