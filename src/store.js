/**
 * The bridge between the app and wherever data actually lives.
 *
 * Every other file calls books.js, which calls this. Two backends:
 *   - supabase : shared between both of you, photos in real file storage
 *   - local    : the old localStorage behaviour, used when Supabase isn't configured
 *
 * The app keeps an in-memory cache so the editor stays synchronous (Konva
 * redraws constantly and can't await); writes are queued to the server in the
 * background and reported if they fail.
 */
import * as db from './db.js';
import { hasSupabase } from './db.js';
import { reportError } from './errors.js';

/**
 * Which backend is live.
 *
 * This used to be `hasSupabase ? 'supabase' : 'local'` — decided purely by
 * whether .env existed. That was wrong: with .env present but nobody signed in,
 * the app talked to Supabase anyway, so every read came back empty (RLS filters
 * rows) and every write was rejected with 42501. Work looked fine on screen and
 * silently evaporated.
 *
 * Now it also requires a session, and `load()` sets it. A live binding, so
 * `import { mode }` elsewhere sees the change.
 */
export let mode = hasSupabase ? 'supabase' : 'local';

/** Set when we know whether writes can actually reach the database. */
export let writable = true;
let denyReason = '';

export function getDenyReason(){ return denyReason; }

/** Force local-only — used by "continue without syncing". */
export function useLocalOnly(){
  mode = 'local';
  writable = true;
  denyReason = '';
}

function markUnwritable(reason){
  writable = false;
  denyReason = reason;
}

let cache = { books:{}, folders:[], letters:[], settings:{} };
let ready = false;
const listeners = new Set();

export function onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }
function emit(){ listeners.forEach(fn => { try { fn(); } catch(e){ reportError('store.listener', e); } }); }

export function isReady(){ return ready; }
export function snapshot(){ return cache; }

/* ---------------- loading ---------------- */
export async function load(){
  // Confirm there's a session AND that it can actually write, before trusting
  // Supabase with anything. An allowed email is what RLS checks, so a signed-in
  // stranger is just as unwritable as nobody at all.
  if (mode === 'supabase'){
    let user = null;
    try { user = await db.currentUser(); } catch(_){ }

    if (!user){
      mode = 'local';
      markUnwritable('not signed in — this device only, nothing is syncing');
    } else {
      const allowed = await db.isEmailAllowed(user.email).catch(() => false);
      if (!allowed){
        mode = 'local';
        markUnwritable(`${user.email} isn't on the allowed list — nothing will save`);
      } else {
        writable = true;
        denyReason = '';
      }
    }
  }

  if (mode === 'local'){
    cache = {
      books:   JSON.parse(localStorage.getItem('ourroom_books') || '{}'),
      folders: JSON.parse(localStorage.getItem('ourroom_pcphotos') || '[]'),
      letters: JSON.parse(localStorage.getItem('ourroom_letters') || '[]'),
      settings: JSON.parse(localStorage.getItem('ourroom_pcsettings') || '{}'),
    };
    // anything saved before there were two computers was made on Andrei's
    cache.folders.forEach(f => { f.owner = f.owner || 'andrei'; });
    cache.letters.forEach(l => { l.owner = l.owner || 'andrei'; });
    ready = true;
    emit();
    return cache;
  }

  const [books, folders, letters, settingsRows] = await Promise.all([
    db.fetchBooks(),
    db.fetchPcFolders(),
    db.fetchLetters(),
    db.fetchPcSettings().catch(e => { reportError('pc settings', e); return []; }),
  ]);
  const settings = Object.fromEntries(settingsRows.map(r => [r.owner, { wallpaper: r.wallpaper }]));
  cache = { books, folders, letters, settings };
  ready = true;
  emit();
  return cache;
}

/* ---------------- write queue ----------------
   Saves happen constantly while editing. Rather than fire a request per
   keystroke, writes are coalesced per key and flushed shortly after. */
const pending = new Map();
let flushTimer = null;

function queue(key, fn){
  pending.set(key, fn);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 600);
}

export async function flush(){
  if (!pending.size) return;
  const jobs = [...pending.values()];
  pending.clear();
  for (const job of jobs){
    try { await job(); }
    catch(e){
      if (isDenial(e)) markUnwritable(denialReason(e));
      reportError('save', e);
    }
  }
}

// don't lose the last edit if the tab closes mid-typing
window.addEventListener('beforeunload', () => { if (pending.size) flush(); });

/* ---------------- books ---------------- */
export function getBooks(){ return cache.books; }

export function createBookLocal(year, cover){
  cache.books[year] = { year:Number(year), cover, pages:[] };
  if (mode === 'local') persistLocalBooks();
  else queue('book:'+year, () => db.upsertBook(year, cover));
  emit();
  return cache.books[year];
}

export function saveCoverLocal(year, cover){
  const b = cache.books[year];
  if (!b) return false;
  b.cover = { ...(b.cover || {}), ...cover };
  if (mode === 'local') persistLocalBooks();
  else queue('book:'+year, () => db.upsertBook(year, b.cover));
  emit();
  return true;
}

export function addPageLocal(year, label){
  const b = cache.books[year] || createBookLocal(year, {});
  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  const page = { id: tempId, label, paper:'kraft', elements:[] };
  b.pages.push(page);

  if (mode === 'local') persistLocalBooks();
  else {
    const position = b.pages.length - 1;
    // insert immediately so the real id replaces the temporary one
    db.insertPage(year, label, position)
      .then(realId => { page.id = realId; emit(); })
      .catch(e => {
        // A page stuck on a tmp_ id can never be saved (updates skip those), so
        // its edits would vanish in silence. Mark it and say so instead.
        page.unsaved = true;
        if (isDenial(e)) markUnwritable(denialReason(e));
        reportError('addPage', e);
      });
  }
  emit();
  return page;
}

/** Postgres 42501 = row-level security refused the write. */
function isDenial(e){
  return e?.code === '42501' || /row-level security/i.test(e?.message || '');
}

function denialReason(){
  return "the database refused the write — you're either not signed in, "
       + "or the email you used isn't in allowed_emails";
}

export function updatePageLocal(year, pageId, fields){
  const b = cache.books[year];
  const p = b?.pages.find(p => p.id === pageId);
  if (!p) return false;
  Object.assign(p, fields);

  if (mode === 'local'){
    persistLocalBooks();
  } else if (String(pageId).startsWith('tmp_')){
    // Its insert failed earlier. Retry it, then save the content — otherwise
    // this page is permanently write-only-to-nowhere.
    const position = b.pages.indexOf(p);
    queue('page:'+pageId, async () => {
      const realId = await db.insertPage(year, p.label, position);
      p.id = realId;
      p.unsaved = false;
      await db.updatePage(realId, { label:p.label, paper:p.paper, elements:p.elements });
      emit();
    });
  } else {
    queue('page:'+pageId, () => db.updatePage(pageId, {
      label: p.label, paper: p.paper, elements: p.elements
    }));
  }
  emit();
  return true;
}

export function deletePageLocal(year, pageId){
  const b = cache.books[year];
  if (!b) return;
  b.pages = b.pages.filter(p => p.id !== pageId);
  if (mode === 'local') persistLocalBooks();
  else if (!String(pageId).startsWith('tmp_')){
    db.deletePageRow(pageId).catch(e => reportError('deletePage', e));
  }
  emit();
}

function persistLocalBooks(){
  try { localStorage.setItem('ourroom_books', JSON.stringify(cache.books)); }
  catch(e){ reportError('localStorage', e); }
}

/* ---------------- PC folders & photos ----------------
   Everything on the two computers. Deleting moves things to the Recycle Bin
   (deletedAt is set); only emptying the bin really removes them. */
const live = f => !f.deletedAt;
const viewOf = f => ({ ...f, photos: f.photos.filter(live) });

/** One computer's folders (or everyone's), without anything in the bin. */
export function getFolders(owner){
  return cache.folders
    .filter(f => live(f) && (!owner || (f.owner || 'andrei') === owner))
    .map(viewOf);
}
export function getFolder(id){ return cache.folders.find(f => f.id === id) || null; }

export function addFolderLocal(name, owner = 'andrei'){
  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const folder = { id: tempId, name, owner, photos: [], deletedAt: null };
  cache.folders.push(folder);
  if (mode === 'local') persistLocalFolders();
  else db.insertFolder(name, cache.folders.length - 1, owner)
        .then(id => {
          // anything filed into it while it was still being created follows it
          cache.letters.forEach(l => { if (l.folderId === tempId){ l.folderId = id; db.upsertLetter(l).catch(e => reportError('moveLetter', e)); } });
          folder.id = id; emit();
        })
        .catch(e => reportError('addFolder', e));
  emit();
  return folder;
}

export function renameFolder(id, name){
  const f = getFolder(id);
  if (!f) return;
  f.name = name;
  if (mode === 'local') persistLocalFolders();
  else db.renameFolderRow(id, name).catch(e => reportError('renameFolder', e));
  emit();
}

export async function addPhoto(folderId, dataUrl, caption){
  const folder = cache.folders.find(f => f.id === folderId);
  if (!folder) return null;

  if (mode === 'local'){
    folder.photos.push({ id:'ph_'+Date.now()+Math.random().toString(36).slice(2, 5), src:dataUrl, caption, deletedAt:null, addedAt:new Date().toISOString() });
    persistLocalFolders();
    emit();
    return true;
  }

  const blob = db.dataUrlToBlob(dataUrl);
  const rec = await db.uploadPhoto(folderId, blob, caption);
  folder.photos.push({ id:rec.id, path:rec.path, caption:rec.caption, src:dataUrl, deletedAt:null, addedAt:new Date().toISOString() });
  emit();
  return true;
}

/** Permanently remove one photo (row and file). */
export async function removePhoto(folderId, photoId){
  const folder = cache.folders.find(f => f.id === folderId);
  if (!folder) return;
  const photo = folder.photos.find(p => p.id === photoId);
  folder.photos = folder.photos.filter(p => p.id !== photoId);

  if (mode === 'local') persistLocalFolders();
  else if (photo?.path) await db.deletePhoto(photoId, photo.path).catch(e => reportError('deletePhoto', e));
  emit();
}

/** Photos from the server arrive without a usable src until it's signed. */
export async function ensurePhotoSrc(photo){
  if (photo.src) return photo.src;
  if (mode === 'local' || !photo.path) return null;
  try {
    photo.src = await db.signedUrl(photo.path);
    return photo.src;
  } catch(e){ reportError('signedUrl', e); return null; }
}

function persistLocalFolders(){
  try { localStorage.setItem('ourroom_pcphotos', JSON.stringify(cache.folders)); }
  catch(e){ reportError('localStorage', e); }
}

/* ---------------- letters (the .txt files) ---------------- */
export function getLettersCached(owner){
  return cache.letters.filter(l => live(l) && (!owner || (l.owner || 'andrei') === owner));
}
export function getLetter(id){ return cache.letters.find(l => l.id === id) || null; }

function persistLocalLetters(){
  try { localStorage.setItem('ourroom_letters', JSON.stringify(cache.letters)); }
  catch(e){ reportError('localStorage', e); }
}

/** Put the starter letters on a computer that has none yet. */
export function seedLetters(defaults, owner = 'andrei'){
  if (getLettersCached(owner).length) return getLettersCached(owner);
  const rows = defaults.map(l => ({ ...l, owner, folderId: null, deletedAt: null }));
  cache.letters.push(...rows);
  if (mode === 'local') persistLocalLetters();
  else rows.forEach((l, i) => db.upsertLetter(l, i).catch(e => reportError('seedLetter', e)));
  return getLettersCached(owner);
}

/** Create or update one letter (rename and move go through here too). */
export function saveLetter(letter){
  const i = cache.letters.findIndex(l => l.id === letter.id);
  if (i >= 0) cache.letters[i] = { ...cache.letters[i], ...letter };
  else cache.letters.push({ folderId: null, deletedAt: null, ...letter });
  const full = cache.letters[i >= 0 ? i : cache.letters.length - 1];
  full.updatedAt = new Date().toISOString();
  if (mode === 'local') persistLocalLetters();
  else queue('letter:' + letter.id, () => db.upsertLetter(full, i >= 0 ? i : cache.letters.length - 1));
  emit();
}

/** Permanently remove one letter. */
export function deleteLetter(id){
  cache.letters = cache.letters.filter(l => l.id !== id);
  pending.delete('letter:' + id);
  if (mode === 'local') persistLocalLetters();
  else db.deleteLetterRow(id).catch(e => reportError('deleteLetter', e));
  emit();
}

/* ---------------- Recycle Bin ---------------- */
/** Can things go to the bin, or does deleting remove them for good? */
export const binWorks = () => mode === 'local' || !db.needsPcMigration;

/** Everything in one computer's bin: { kind, id, name, deletedAt, ... } */
export function binItems(owner){
  const out = [];
  cache.folders.filter(f => (f.owner || 'andrei') === owner).forEach(f => {
    if (f.deletedAt){
      out.push({ kind: 'folder', id: f.id, name: f.name, deletedAt: f.deletedAt,
        size: f.photos.length + cache.letters.filter(l => l.folderId === f.id).length });
    } else {
      f.photos.filter(p => p.deletedAt).forEach(p => out.push({
        kind: 'photo', id: p.id, folderId: f.id, name: p.caption || 'untitled', from: f.name, deletedAt: p.deletedAt, photo: p }));
    }
  });
  cache.letters.filter(l => (l.owner || 'andrei') === owner && l.deletedAt).forEach(l => {
    const f = l.folderId && getFolder(l.folderId);
    if (f?.deletedAt) return;                       // goes and comes back with its folder
    out.push({ kind: 'letter', id: l.id, name: l.filename, from: f ? f.name : 'Desktop', deletedAt: l.deletedAt });
  });
  return out.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

function setLocalDeleted(item, when){
  if (item.kind === 'folder'){ const f = getFolder(item.id); if (f) f.deletedAt = when; persistLocalFolders(); }
  if (item.kind === 'photo'){ const p = getFolder(item.folderId)?.photos.find(x => x.id === item.id); if (p) p.deletedAt = when; persistLocalFolders(); }
  if (item.kind === 'letter'){ const l = getLetter(item.id); if (l) l.deletedAt = when; persistLocalLetters(); }
}
const TABLE = { folder: 'pc_folders', photo: 'pc_photos', letter: 'letters' };

/** Move to the bin. Without migration 004 this falls back to deleting for good. */
export async function trash(item){
  if (!binWorks()) return purge(item);
  const when = new Date().toISOString();
  setLocalDeleted(item, when);
  if (mode !== 'local'){
    if (item.kind === 'letter') pending.delete('letter:' + item.id);
    try { await db.setDeleted(TABLE[item.kind], item.id, when); }
    catch(e){ setLocalDeleted(item, null); emit(); throw e; }
  }
  emit();
}

export async function restore(item){
  setLocalDeleted(item, null);
  // a text file whose folder is still in the bin comes back to the desktop
  if (item.kind === 'letter'){
    const l = getLetter(item.id);
    const f = l?.folderId && getFolder(l.folderId);
    if (l && f?.deletedAt){ l.folderId = null; if (mode === 'local') persistLocalLetters(); else await db.upsertLetter(l).catch(e => reportError('restore', e)); }
  }
  if (mode !== 'local') await db.setDeleted(TABLE[item.kind], item.id, null).catch(e => reportError('restore', e));
  emit();
}

/** Gone for good. */
export async function purge(item){
  if (item.kind === 'letter') return deleteLetter(item.id);
  if (item.kind === 'photo') return removePhoto(item.folderId, item.id);
  if (item.kind === 'folder'){
    const f = getFolder(item.id);
    if (!f) return;
    cache.folders = cache.folders.filter(x => x.id !== item.id);
    cache.letters = cache.letters.filter(l => l.folderId !== item.id);
    if (mode === 'local'){ persistLocalFolders(); persistLocalLetters(); }
    else await db.deleteFolderRow(item.id, f.photos.map(p => p.path).filter(Boolean)).catch(e => reportError('purgeFolder', e));
    emit();
  }
}

/** Empty the bin; with `olderThanDays`, only what's been there that long. */
export async function emptyBin(owner, olderThanDays = 0){
  const cutoff = Date.now() - olderThanDays * 86400000;
  const items = binItems(owner).filter(i => !olderThanDays || new Date(i.deletedAt).getTime() < cutoff);
  for (const i of items) await purge(i);
  return items.length;
}

/* ---------------- each computer's settings (wallpaper) ---------------- */
export function getPcSettings(owner){ return (cache.settings || {})[owner] || {}; }

export async function setWallpaper(owner, wallpaper){
  cache.settings = cache.settings || {};
  cache.settings[owner] = { ...(cache.settings[owner] || {}), wallpaper };
  if (mode === 'local'){
    try { localStorage.setItem('ourroom_pcsettings', JSON.stringify(cache.settings)); }
    catch(e){ throw new Error("this browser is out of room — pick a smaller picture"); }
  } else await db.savePcSettings(owner, wallpaper);
  emit();
}

/** Upload a picture for a wallpaper. Local mode keeps the picture itself. */
export async function storeWallpaperImage(owner, dataUrl){
  if (mode === 'local') return { kind: 'image', src: dataUrl };
  const path = await db.uploadWallpaper(owner, db.dataUrlToBlob(dataUrl));
  return { kind: 'image', path };
}

/** A signed URL (or the data URL) for a stored wallpaper picture. */
export async function wallpaperSrc(wp){
  if (!wp) return null;
  if (wp.src) return wp.src;
  if (wp.path && mode !== 'local'){
    try { return await db.signedUrl(wp.path, 3600 * 24); } catch(e){ reportError('wallpaper', e); }
  }
  return null;
}

/* ---------------- storage, as "drives" ---------------- */
export async function driveUsage(){
  if (mode !== 'local'){
    const u = await db.fetchStorageUsage().catch(() => null);
    return u ? { mode: 'cloud', ...u } : { mode: 'cloud', unknown: true };
  }
  let local = 0;
  try {
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      local += (k.length + (localStorage.getItem(k) || '').length) * 2;
    }
  } catch(_){}
  let est = null;
  try { est = await navigator.storage?.estimate?.(); } catch(_){}
  return { mode: 'local', localStorage: local, browserUsed: est?.usage || 0, browserQuota: est?.quota || 0 };
}

/* ---------------- live: a change on one computer shows on the other ---------------- */
let refreshTimer = null;
/** Reload the computers' data from the server (after a change elsewhere). */
export function refreshPc(){
  if (mode === 'local') return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      const [folders, letters, settings] = await Promise.all([db.fetchPcFolders(), db.fetchLetters(), db.fetchPcSettings()]);
      // keep signed photo URLs we already have, and any letter still being saved
      const oldSrc = new Map();
      cache.folders.forEach(f => f.photos.forEach(p => p.src && oldSrc.set(p.id, p.src)));
      folders.forEach(f => f.photos.forEach(p => { if (oldSrc.has(p.id)) p.src = oldSrc.get(p.id); }));
      const typing = new Map(cache.letters.filter(l => pending.has('letter:' + l.id)).map(l => [l.id, l]));
      cache.folders = folders;
      cache.letters = letters.map(l => typing.get(l.id) || l);
      cache.settings = Object.fromEntries(settings.map(r => [r.owner, { wallpaper: r.wallpaper }]));
      emit();
    } catch(e){ reportError('refreshPc', e); }
  }, 700);
}