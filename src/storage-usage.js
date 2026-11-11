import { mode } from './store.js';

/** Only meaningful in local mode — Supabase has gigabytes, not 5MB. */
export function storageUsage(){
  if (mode !== 'local') return { bytes:0, ratio:0, unlimited:true };
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      bytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
    }
    return { bytes, ratio: Math.min(1, bytes / (5 * 1024 * 1024)), unlimited:false };
  } catch(e){ return { bytes:0, ratio:0, unlimited:false }; }
}
