import { createClient } from '@supabase/supabase-js';
import { reportError } from './errors.js';

// Supabase's dashboard shows Next.js-style names (NEXT_PUBLIC_…). Vite only
// exposes variables prefixed VITE_, so both spellings are accepted here to save
// anyone the confusion of copying the dashboard snippet verbatim.
const env = import.meta.env;
const URL =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const hasSupabase = Boolean(URL && KEY);

export const supabase = hasSupabase
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/* ---------------- auth ---------------- */
export async function currentUser(){
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

/**
 * Sign in with a password.
 *
 * This replaced magic links, which fought the free tier on three fronts:
 *   - Supabase's built-in mailer allows only a couple of emails per hour
 *   - links are single-use, and mail scanners prefetch them, so the link is
 *     often already spent by the time a human clicks it (otp_expired)
 *   - every link depends on the redirect allowlist being exactly right
 * A password has none of those failure modes and is just as real a lock: it's
 * checked server-side, and RLS still gates every row behind allowed_emails.
 */
export async function signIn(email, password){
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return;

  const msg = (error.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')){
    throw new Error('wrong email or password');
  }
  if (msg.includes('email not confirmed')){
    throw new Error("that account isn't confirmed yet — tick 'Auto Confirm User' in Supabase");
  }
  throw error;
}

/** Magic link, kept as a fallback. Rate-limited by Supabase's built-in mailer. */
export async function sendMagicLink(email){
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false }
  });
  if (error){
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('after')){
      throw new Error('too many emails for now — use the password instead');
    }
    if (/signup|not allowed|user not found/i.test(msg)){
      throw new Error("that email isn't on the list — only the two of us can get in");
    }
    throw error;
  }
}

/**
 * Read an auth failure Supabase left in the URL fragment.
 *
 * A dead magic link lands back here as #error=…&error_code=otp_expired, which
 * the app would otherwise ignore — leaving you on the shelf with no explanation
 * for why nothing loaded.
 */
export function consumeAuthErrorFromUrl(){
  const hash = window.location.hash || '';
  if (!hash.includes('error')) return null;

  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const code = p.get('error_code') || p.get('error') || '';
  const desc = (p.get('error_description') || '').replace(/\+/g, ' ');

  history.replaceState(null, '', window.location.pathname + window.location.search);

  if (/otp_expired|access_denied/i.test(code)){
    return 'that email link was already used or expired — sign in with the password instead';
  }
  return desc || 'sign-in failed';
}

export async function signOut(){
  if (supabase) await supabase.auth.signOut();
}

/** 'andrei' | 'cherryl' | null — decided by the database from your login email. */
export async function whoAmI(){
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('who_am_i');
  if (error){ flagMissingSchema(error); return null; }   // migration 002 not run yet
  return data || null;
}

/** True for an admin (Che). False if migration 003 hasn't been run yet. */
export async function amAdmin(){
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return error ? false : Boolean(data);
}

/**
 * Set when the database is missing the columns/tables migration 002 adds.
 * The app keeps working on the old shape and shows a banner saying so.
 */
export let needsMigration = false;
function missingSchema(e){
  // 42703 undefined column, 42P01 undefined table, PGRST204/205 schema cache misses
  return ['42703', '42P01', 'PGRST204', 'PGRST205', 'PGRST202'].includes(e?.code)
      || /does not exist|schema cache/i.test(e?.message || '');
}
export function flagMissingSchema(e){
  if (missingSchema(e)){ needsMigration = true; return true; }
  return false;
}

/* ---------------- books & pages ---------------- */
export async function fetchBooks(){
  const { data: books, error: e1 } = await supabase
    .from('books').select('year, cover').order('year');
  if (e1) throw e1;

  const { data: pages, error: e2 } = await supabase
    .from('pages').select('id, year, label, paper, elements, position')
    .order('year').order('position');
  if (e2) throw e2;

  const out = {};
  (books || []).forEach(b => { out[b.year] = { year:b.year, cover:b.cover || {}, pages:[] }; });
  (pages || []).forEach(p => {
    if (!out[p.year]) out[p.year] = { year:p.year, cover:{}, pages:[] };
    out[p.year].pages.push({
      id: p.id, label: p.label, paper: p.paper, elements: p.elements || []
    });
  });
  return out;
}

export async function upsertBook(year, cover){
  const { error } = await supabase.from('books')
    .upsert({ year, cover: cover || {} }, { onConflict:'year' });
  if (error) throw error;
}

export async function deleteBookRow(year){
  const { error } = await supabase.from('books').delete().eq('year', year);
  if (error) throw error;
}

export async function insertPage(year, label, position){
  const { data, error } = await supabase.from('pages')
    .insert({ year, label, position, paper:'kraft', elements:[] })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updatePage(id, fields){
  const { error } = await supabase.from('pages').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deletePageRow(id){
  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- PC folders & photos ----------------
   Photos go into the storage bucket as real files; only the path is in the
   table. That's the whole point of moving off localStorage — images stop
   being base64 text competing for a 5MB budget. */
/**
 * Set when migration 004 (recycle bin, text files in folders, wallpaper sync)
 * hasn't been run yet. The computers still work; deleting is then permanent.
 */
export let needsPcMigration = false;

/** Try a select with the newer columns; fall back to the older shape. */
async function selectWithFallback(table, cols, oldCols, order){
  let { data, error } = await supabase.from(table).select(cols).order(order);
  if (error && missingSchema(error)){
    needsPcMigration = true;
    ({ data, error } = await supabase.from(table).select(oldCols).order(order));
    if (error && missingSchema(error)){
      needsMigration = true;
      ({ data, error } = await supabase.from(table).select(oldCols.replace(', owner', '')).order(order));
    }
  }
  if (error) throw error;
  return data || [];
}

export async function fetchPcFolders(){
  const folders = await selectWithFallback('pc_folders',
    'id, name, position, owner, deleted_at', 'id, name, position, owner', 'position');
  const photos = await selectWithFallback('pc_photos',
    'id, folder_id, caption, storage_path, deleted_at, created_at', 'id, folder_id, caption, storage_path, created_at', 'created_at');

  const byId = {};
  folders.forEach(f => {
    byId[f.id] = { id:f.id, name:f.name, owner:f.owner || 'andrei', deletedAt:f.deleted_at || null, photos:[] };
  });
  for (const p of photos){
    if (!byId[p.folder_id]) continue;
    byId[p.folder_id].photos.push({
      id: p.id, caption: p.caption || '', path: p.storage_path, src: null,
      deletedAt: p.deleted_at || null, addedAt: p.created_at || null,
    });
  }
  return Object.values(byId);
}

/** Signed URLs expire, so they're fetched on demand rather than stored. */
export async function signedUrl(path, seconds = 3600, bucket = 'photos'){
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadPhoto(folderId, blob, caption){
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${folderId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;

  const { error: upErr } = await supabase.storage.from('photos')
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from('pc_photos')
    .insert({ folder_id: folderId, caption: caption || '', storage_path: path })
    .select('id').single();
  if (error) throw error;
  return { id: data.id, path, caption: caption || '' };
}

export async function deletePhoto(photoId, path){
  await supabase.storage.from('photos').remove([path]).catch(e => reportError('storage.remove', e));
  const { error } = await supabase.from('pc_photos').delete().eq('id', photoId);
  if (error) throw error;
}

export async function insertFolder(name, position, owner){
  const row = needsMigration ? { name, position } : { name, position, owner };
  const { data, error } = await supabase.from('pc_folders')
    .insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

/* ---------------- letters (the .txt files) ---------------- */
export async function fetchLetters(){
  const rows = await selectWithFallback('letters',
    'id, filename, body, position, owner, folder_id, deleted_at, updated_at',
    'id, filename, body, position, owner, updated_at', 'position');
  return rows.map(l => ({
    id:l.id, filename:l.filename, text:l.body, owner:l.owner || 'andrei',
    folderId:l.folder_id || null, deletedAt:l.deleted_at || null, updatedAt:l.updated_at || null,
  }));
}

export async function upsertLetter(letter, position = 0){
  const row = { id: letter.id, filename: letter.filename, body: letter.text ?? '', position };
  if (!needsMigration && letter.owner) row.owner = letter.owner;
  if (!needsPcMigration){
    row.folder_id = letter.folderId || null;
    row.deleted_at = letter.deletedAt || null;
  }
  const { error } = await supabase.from('letters').upsert(row, { onConflict:'id' });
  if (error) throw error;
}

export async function deleteLetterRow(id){
  const { error } = await supabase.from('letters').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- recycle bin, rename, move ---------------- */
/** Move a row to the bin (a date) or back out of it (null). */
export async function setDeleted(table, id, when){
  if (needsPcMigration) throw Object.assign(new Error('run supabase-migration-004.sql to turn on the Recycle Bin'), { needsMigration: true });
  const { error } = await supabase.from(table).update({ deleted_at: when }).eq('id', id);
  if (error) throw error;
}

export async function renameFolderRow(id, name){
  const { error } = await supabase.from('pc_folders').update({ name }).eq('id', id);
  if (error) throw error;
}

/** Gone for good: the folder, its photos (rows and files) and its text files. */
export async function deleteFolderRow(id, photoPaths = []){
  if (photoPaths.length) await removeFiles(photoPaths);
  const { error } = await supabase.from('pc_folders').delete().eq('id', id);
  if (error) throw error;
}

export async function removeFiles(paths, bucket = 'photos'){
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) reportError('storage.remove', error);
}

/* ---------------- each computer's settings ---------------- */
export async function fetchPcSettings(){
  const { data, error } = await supabase.from('pc_settings').select('owner, wallpaper');
  if (error){ if (missingSchema(error)){ needsPcMigration = true; return []; } throw error; }
  return data || [];
}

export async function savePcSettings(owner, wallpaper){
  if (needsPcMigration) throw Object.assign(new Error('run supabase-migration-004.sql to sync wallpapers'), { needsMigration: true });
  const { error } = await supabase.from('pc_settings')
    .upsert({ owner, wallpaper, updated_at: new Date().toISOString() }, { onConflict: 'owner' });
  if (error) throw error;
}

/** Upload a wallpaper picture into the photos bucket; returns its path. */
export async function uploadWallpaper(owner, blob){
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `wallpapers/${owner}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

/** Bytes used: { photos, media, database }. Null if migration 004 isn't in. */
export async function fetchStorageUsage(){
  const { data, error } = await supabase.rpc('storage_usage');
  if (error){ if (missingSchema(error)) needsPcMigration = true; return null; }
  const out = { photos: 0, media: 0, database: 0 };
  (data || []).forEach(r => { out[r.drive] = Number(r.bytes) || 0; });
  return out;
}

/* ---------------- data URL <-> blob ---------------- */
export function dataUrlToBlob(dataUrl){
  const [head, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Is this address in allowed_emails?
 *
 * RLS keys off this table, so an account that isn't in it can sign in but can't
 * read or write a single row. Checking up front lets the app say so plainly
 * instead of letting every save fail with a raw Postgres error.
 */
export async function isEmailAllowed(email){
  if (!supabase || !email) return false;

  // Ask the database using the very function RLS uses. It's SECURITY DEFINER,
  // so it bypasses row-level security and always agrees with what a write will
  // actually do. Reading the table directly was the mistake: that read is
  // itself behind RLS, so a bad policy made a perfectly allowed user look
  // barred — a warning about a problem that didn't exist.
  const rpc = await supabase.rpc('is_allowed');
  if (!rpc.error) return Boolean(rpc.data);

  // Older databases may not have the function granted; fall back to the table.
  const direct = await supabase
    .from('allowed_emails').select('email').eq('email', email).maybeSingle();
  if (direct.error){
    console.warn('could not verify the allow list:', direct.error.message);
    // Don't cry wolf. If we genuinely can't tell, let the write attempt decide —
    // a real denial still surfaces as 42501 and shows the banner then.
    return true;
  }
  return Boolean(direct.data);
}