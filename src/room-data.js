/**
 * Data for everything that lives in the room itself: the message bottle, the
 * wall frames, the time capsule, the TV and the music.
 *
 * Signed in → Supabase, shared between you both, live.
 * Not signed in ("continue without syncing") → this browser only.
 */
import { supabase, signedUrl, flagMissingSchema, dataUrlToBlob } from './db.js';
import * as store from './store.js';
import { getMe } from './who.js';
import { idbPut, idbGet, idbDel } from './idb.js';

const live = () => store.mode === 'supabase' && !!supabase;

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;   // Supabase free plan: 50 MB per file

/** Thrown when the database doesn't have migration 002 yet. */
export class NeedsMigration extends Error {
  constructor(){ super('Run supabase-migration-002.sql in the Supabase SQL editor first'); this.needsMigration = true; }
}
function check(error){
  if (!error) return;
  if (flagMissingSchema(error)) throw new NeedsMigration();
  throw error;
}

const LS = {
  get(k, d){ try { return JSON.parse(localStorage.getItem('ourroom_' + k)) ?? d; } catch(_){ return d; } },
  set(k, v){ localStorage.setItem('ourroom_' + k, JSON.stringify(v)); },
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now() + Math.random().toString(36).slice(2));

/* ================= signed URLs, cached until shortly before they expire ================= */
const urlCache = new Map();
export async function mediaUrl(path, bucket = 'photos'){
  if (!path) return null;
  const key = bucket + ':' + path;
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const url = await signedUrl(path, 3 * 3600, bucket);
  urlCache.set(key, { url, exp: Date.now() + 2.5 * 3600 * 1000 });
  return url;
}

async function uploadTo(bucket, folder, blob, ext){
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}
const extOf = (file, fallback) => (file.name?.split('.').pop() || fallback).toLowerCase().replace('jpeg', 'jpg');

/* ================= message bottle ================= */
export async function listNotes(){
  if (!live()) return LS.get('notes', []);
  const { data, error } = await supabase.from('notes')
    .select('id, author, body, created_at, read_at').order('created_at');
  check(error);
  return data || [];
}

export async function sendNote(body){
  body = String(body || '').trim().slice(0, 2000);
  if (!body) throw new Error('write something first');
  if (!live()){
    const all = LS.get('notes', []);
    all.push({ id: uid(), author: getMe(), body, created_at: new Date().toISOString(), read_at: null });
    LS.set('notes', all);
    return;
  }
  const { error } = await supabase.from('notes').insert({ body });
  check(error);
}

/** Mark the other person's notes to me as read. */
export async function markNotesRead(ids){
  if (!ids.length) return;
  const now = new Date().toISOString();
  if (!live()){
    LS.set('notes', LS.get('notes', []).map(n => ids.includes(n.id) ? { ...n, read_at: now } : n));
    return;
  }
  const { error } = await supabase.from('notes').update({ read_at: now }).in('id', ids);
  check(error);
}

/** Take back a note they haven't read yet. */
export async function unsendNote(id){
  if (!live()){ LS.set('notes', LS.get('notes', []).filter(n => n.id !== id)); return; }
  const { error } = await supabase.from('notes').delete().eq('id', id);
  check(error);
}

/* ================= wall frames ================= */
/** { 1: url, 2: url, … } */
export async function listFrames(){
  if (!live()) return LS.get('frames', {});
  const { data, error } = await supabase.from('frames').select('slot, storage_path');
  check(error);
  const out = {};
  await Promise.all((data || []).map(async f => {
    try { out[f.slot] = await mediaUrl(f.storage_path, 'photos'); } catch(_){}
  }));
  return out;
}

export async function setFrame(slot, dataUrl){
  if (!live()){
    const all = LS.get('frames', {});
    all[slot] = dataUrl;
    LS.set('frames', all);
    return dataUrl;
  }
  const path = await uploadTo('photos', 'frames', dataUrlToBlob(dataUrl), 'jpg');
  const { data: old } = await supabase.from('frames').select('storage_path').eq('slot', slot).maybeSingle();
  const { error } = await supabase.from('frames').upsert({ slot, storage_path: path }, { onConflict: 'slot' });
  check(error);
  if (old?.storage_path) supabase.storage.from('photos').remove([old.storage_path]).catch(() => {});
  return mediaUrl(path, 'photos');
}

/** Put the model's original picture back in a frame. */
export async function clearFrame(slot){
  if (!live()){
    const all = LS.get('frames', {});
    delete all[slot];
    LS.set('frames', all);
    return;
  }
  const { data: old } = await supabase.from('frames').select('storage_path').eq('slot', slot).maybeSingle();
  const { error } = await supabase.from('frames').delete().eq('slot', slot);
  check(error);
  if (old?.storage_path) supabase.storage.from('photos').remove([old.storage_path]).catch(() => {});
}

/* ================= time capsule ================= */
export async function listCapsules(){
  if (!live()) return LS.get('capsules', []).map(({ body, photo, ...env }) => env);
  const { data, error } = await supabase.from('capsules')
    .select('id, author, recipient, title, unlock_at, created_at, opened_at, opened_by')
    .order('unlock_at');
  check(error);
  return data || [];
}

export async function sealCapsule({ recipient, title, unlockAt, body, photo }){
  if (!live()){
    if (unlockAt.getTime() < Date.now() + 3600e3) throw new Error('pick a day in the future');
    const all = LS.get('capsules', []);
    all.push({
      id: uid(), author: getMe(), recipient, title: title || '', unlock_at: unlockAt.toISOString(),
      created_at: new Date().toISOString(), opened_at: null, opened_by: null, body, photo: photo || null,
    });
    LS.set('capsules', all);
    return;
  }
  const { error } = await supabase.rpc('seal_capsule', {
    p_recipient: recipient, p_title: title || '', p_unlock_at: unlockAt.toISOString(),
    p_body: body, p_photo: photo || null,
  });
  check(error);
}

/** Resolves to the letter, or throws with the database's reason ("still sealed", …). */
export async function openCapsule(id){
  if (!live()){
    const all = LS.get('capsules', []);
    const c = all.find(x => x.id === id);
    if (!c) throw new Error('no such letter');
    if (Date.now() < new Date(c.unlock_at).getTime()) throw new Error('still sealed');
    if (!c.opened_at && c.recipient !== 'both' && c.recipient !== getMe()){
      throw new Error(`this one is for ${c.recipient} to open first`);
    }
    if (!c.opened_at){ c.opened_at = new Date().toISOString(); c.opened_by = getMe(); LS.set('capsules', all); }
    return c;
  }
  const { data, error } = await supabase.rpc('open_capsule', { p_id: id });
  check(error);
  return Array.isArray(data) ? data[0] : data;
}

/* ================= TV ================= */
export async function listVideos(){
  if (!live()) return LS.get('videos', []);
  const { data, error } = await supabase.from('tv_videos')
    .select('id, title, kind, storage_path, url, added_by, created_at').order('created_at');
  check(error);
  return data || [];
}

export async function addVideoFile(file, title){
  if (file.size > MAX_MEDIA_BYTES) throw new Error('that video is over 50 MB — trim or compress it first');
  title = title || file.name.replace(/\.[^.]+$/, '');
  if (!live()){
    const id = uid();
    await idbPut('video:' + id, file);
    const all = LS.get('videos', []);
    all.push({ id, title, kind: 'upload', storage_path: 'idb:video:' + id, url: null, added_by: getMe(), created_at: new Date().toISOString() });
    LS.set('videos', all);
    return;
  }
  const path = await uploadTo('media', 'videos', file, extOf(file, 'mp4'));
  const { error } = await supabase.from('tv_videos').insert({ title, kind: 'upload', storage_path: path });
  check(error);
}

export async function addYouTube(url, title){
  const id = youTubeId(url);
  if (!id) throw new Error("that doesn't look like a YouTube link");
  if (!live()){
    const all = LS.get('videos', []);
    all.push({ id: uid(), title: title || 'YouTube', kind: 'youtube', storage_path: null, url, added_by: getMe(), created_at: new Date().toISOString() });
    LS.set('videos', all);
    return;
  }
  const { error } = await supabase.from('tv_videos').insert({ title: title || 'YouTube', kind: 'youtube', url });
  check(error);
}

export async function removeVideo(v){
  if (!live()){
    LS.set('videos', LS.get('videos', []).filter(x => x.id !== v.id));
    if (v.storage_path?.startsWith('idb:')) idbDel(v.storage_path.slice(4)).catch(() => {});
    return;
  }
  const { error } = await supabase.from('tv_videos').delete().eq('id', v.id);
  check(error);
  if (v.storage_path) supabase.storage.from('media').remove([v.storage_path]).catch(() => {});
}

export function youTubeId(url){
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/* ================= music ================= */
export async function listTracks(){
  if (!live()) return LS.get('tracks', []);
  const { data, error } = await supabase.from('tracks')
    .select('id, title, artist, kind, storage_path, url, added_by, created_at').order('created_at');
  check(error);
  return data || [];
}

export async function addTrackFile(file, title, artist){
  if (file.size > MAX_MEDIA_BYTES) throw new Error('that song is over 50 MB');
  title = title || file.name.replace(/\.[^.]+$/, '');
  if (!live()){
    const id = uid();
    await idbPut('track:' + id, file);
    const all = LS.get('tracks', []);
    all.push({ id, title, artist: artist || '', kind: 'upload', storage_path: 'idb:track:' + id, url: null, added_by: getMe(), created_at: new Date().toISOString() });
    LS.set('tracks', all);
    return;
  }
  const path = await uploadTo('media', 'music', file, extOf(file, 'mp3'));
  const { error } = await supabase.from('tracks').insert({ title, artist: artist || '', kind: 'upload', storage_path: path });
  check(error);
}

/** Every Spotify link in a bit of pasted text (one link, or many pasted together). */
export function spotifyLinks(text){
  const out = [], seen = new Set();
  const re = /(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]{22})|spotify:(track|album|playlist|episode|show):([A-Za-z0-9]{22})/g;
  let m;
  while ((m = re.exec(String(text || '')))){
    const type = m[1] || m[3], id = m[2] || m[4];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ type, id, url: `https://open.spotify.com/${type}/${id}` });
  }
  return out;
}

/**
 * The name Spotify gives a link (song title, album or playlist name), from
 * Spotify's public oEmbed lookup. Null if it can't be reached.
 */
export async function spotifyTitle(url){
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url), { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && typeof j.title === 'string' && j.title.trim()) ? j.title.trim() : null;
  } catch(_){ return null; }
}

export async function addSpotify(url, title){
  const sp = spotifyRef(url);
  if (!sp) throw new Error("that doesn't look like a Spotify song, album or playlist link");
  if (!live()){
    const all = LS.get('tracks', []);
    all.push({ id: uid(), title: title || `Spotify ${sp.type}`, artist: '', kind: 'spotify', storage_path: null, url, added_by: getMe(), created_at: new Date().toISOString() });
    LS.set('tracks', all);
    return;
  }
  const { error } = await supabase.from('tracks').insert({ title: title || `Spotify ${sp.type}`, kind: 'spotify', url });
  check(error);
}

export async function removeTrack(t){
  if (!live()){
    LS.set('tracks', LS.get('tracks', []).filter(x => x.id !== t.id));
    if (t.storage_path?.startsWith('idb:')) idbDel(t.storage_path.slice(4)).catch(() => {});
    return;
  }
  const { error } = await supabase.from('tracks').delete().eq('id', t.id);
  check(error);
  if (t.storage_path) supabase.storage.from('media').remove([t.storage_path]).catch(() => {});
}

/** spotify:track:… or https://open.spotify.com/(intl-xx/)track/… → { type, id } */
export function spotifyRef(url){
  const m = String(url || '').match(/(?:open\.spotify\.com\/(?:intl-[\w-]+\/)?|spotify:)(track|album|playlist|episode|show)[/:]([A-Za-z0-9]{10,})/);
  return m ? { type: m[1], id: m[2], uri: `spotify:${m[1]}:${m[2]}` } : null;
}

/** A playable URL for an uploaded video or song, from storage or this browser. */
const objectUrls = new Map();
export async function playableUrl(item){
  const p = item.storage_path;
  if (!p) return null;
  if (p.startsWith('idb:')){
    if (objectUrls.has(p)) return objectUrls.get(p);
    const blob = await idbGet(p.slice(4));
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    objectUrls.set(p, u);
    return u;
  }
  return mediaUrl(p, 'media');
}

/* ================= live updates ================= */
/** Call `cb` whenever a row in `table` changes. Returns an unsubscribe function. */
export function subscribe(table, cb){
  if (!live()) return () => {};
  const ch = supabase.channel('db-' + table + '-' + Math.random().toString(36).slice(2, 7))
    .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      try { cb(payload); } catch(e){ console.error(e); }
    })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

/* ================= who's here right now ================= */
/**
 * Join the room's presence channel. `onChange` gets a Set of who is on the
 * site right now ('andrei', 'cherryl'). Without Supabase it's just you.
 */
export function joinPresence(me, onChange){
  if (!live()){ onChange(new Set([me])); return () => {}; }
  let ch = null, stopped = false;
  onChange(new Set([me]));
  (async () => {
    // the loading screen's quick "who's here?" look uses this same channel;
    // wait until it has fully closed, or supabase hands back the old one
    if (window.__ourroomPeek) await Promise.race([window.__ourroomPeek, new Promise(r => setTimeout(r, 4000))]);
    for (const old of supabase.getChannels()){
      if (old.topic === 'realtime:our-room-presence') await supabase.removeChannel(old).catch(() => {});
    }
    if (stopped) return;
    ch = supabase.channel('our-room-presence', { config: { presence: { key: me } } });
    const emit = () => onChange(new Set([me, ...Object.keys(ch.presenceState())]));
    ch.on('presence', { event: 'sync' }, emit)
      .on('presence', { event: 'join' }, emit)
      .on('presence', { event: 'leave' }, emit)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED'){
          try { await ch.track({ who: me, since: new Date().toISOString() }); } catch(e){ console.warn('presence', e); }
        }
      });
  })().catch(e => console.warn('presence', e));
  return () => { stopped = true; if (ch){ ch.untrack().catch(() => {}); supabase.removeChannel(ch); } };
}