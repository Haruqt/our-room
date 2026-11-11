/**
 * A tiny IndexedDB key-value store for big blobs (videos, songs) when the app
 * runs without Supabase. localStorage tops out around 5MB; IndexedDB doesn't.
 */

const DB = 'ourroom';
const STORE = 'blobs';
let dbp = null;

function open(){
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn){
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const idbPut = (key, blob) => tx('readwrite', s => s.put(blob, key));
export const idbGet = key => tx('readonly', s => s.get(key));
export const idbDel = key => tx('readwrite', s => s.delete(key));