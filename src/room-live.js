/**
 * One room for both of you.
 *
 * The things that should look the same on both screens — the lights, day or
 * night when someone set it by hand, and what's on the TV — live in a single
 * shared row (room_state, migration 005). A change on one phone shows on the
 * other within a second.
 *
 * The TV also talks over a live channel ("watch together"): play, pause and
 * jumping around go straight to the other screen, and while you're both
 * watching, whoever pressed play last keeps the other in step.
 *
 * Without syncing ("continue without syncing"), it's this browser only, with
 * the same API, so the features don't need to care.
 */
import { supabase, flagMissingSchema } from './db.js';
import * as store from './store.js';
import { getMe } from './who.js';
import { reportError } from './errors.js';

const live = () => store.mode === 'supabase' && !!supabase;
const LS_KEY = 'ourroom_shared';

let state = {};
let ready = null;
let channel = null;
let tableOk = true;
const keyListeners = new Map();      // key -> Set(fn(value, by))
const eventListeners = new Map();    // event -> Set(fn(payload))

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch(_){ return {}; } };
const writeLocal = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(_){} };

function emitKey(key, value, by){
  (keyListeners.get(key) || []).forEach(fn => { try { fn(value, by); } catch(e){ reportError('shared ' + key, e); } });
}

/** Apply a whole state from the server: tell listeners about what changed. */
function absorb(next, by){
  const prev = state;
  state = { ...next };
  writeLocal();
  if (by === getMe()) return;                    // our own write coming back
  for (const k of Object.keys(next)){
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) emitKey(k, next[k], by);
  }
}

/** Load the shared state once; later calls wait on the same load. */
export function loadShared(){
  if (ready) return ready;
  state = readLocal();
  ready = (async () => {
    if (!live()) return state;
    try {
      const { data, error } = await supabase.from('room_state').select('state, updated_by').eq('id', 1).maybeSingle();
      if (error){ if (flagMissingSchema(error)) tableOk = false; else throw error; }
      if (data?.state) state = { ...state, ...data.state };
      writeLocal();
    } catch(e){ reportError('room state', e); }
    connect();
    return state;
  })();
  return ready;
}

function connect(){
  if (channel || !live()) return;
  channel = supabase.channel('our-room-live', { config: { broadcast: { self: false } } });
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_state' }, payload => {
    const row = payload.new;
    if (row?.state) absorb({ ...state, ...row.state }, row.updated_by);
  });
  channel.on('broadcast', { event: 'live' }, ({ payload }) => {
    if (!payload || payload.from === getMe()) return;
    (eventListeners.get(payload.type) || []).forEach(fn => { try { fn(payload.data, payload.from); } catch(e){ reportError('live ' + payload.type, e); } });
  });
  channel.subscribe();
}

/** The shared value for a key (lights, night, tv …). */
export const getShared = (key, fallback) => (key in state ? state[key] : fallback);

/** Change a shared value: saved for both of you. */
export async function setShared(key, value){
  state = { ...state, [key]: value };
  writeLocal();
  if (!live() || !tableOk) return;
  try {
    const { error } = await supabase.rpc('room_state_patch', { p: { [key]: value } });
    if (error){ if (flagMissingSchema(error)) tableOk = false; else throw error; }
  } catch(e){ reportError('room state save', e); }
}

/** Called when the other person changes a key: fn(value, who). */
export function onShared(key, fn){
  if (!keyListeners.has(key)) keyListeners.set(key, new Set());
  keyListeners.get(key).add(fn);
  return () => keyListeners.get(key).delete(fn);
}

/** A quick message to the other screen (not saved). */
export function send(type, data){
  if (!channel) return;
  channel.send({ type: 'broadcast', event: 'live', payload: { type, data, from: getMe() } }).catch(() => {});
}
export function onMessage(type, fn){
  if (!eventListeners.has(type)) eventListeners.set(type, new Set());
  eventListeners.get(type).add(fn);
  return () => eventListeners.get(type).delete(fn);
}

/** True once migration 005 is in (or when not syncing at all). */
export const sharedWorks = () => !live() || tableOk;

/* ---------- who's in the room right now (fed by feat-presence.js) ---------- */
let here = new Set();
const hereListeners = new Set();
export function setHere(set){ here = new Set(set); hereListeners.forEach(fn => { try { fn(here); } catch(_){} }); }
export const whoIsHere = () => here;
export const bothHere = () => here.has('andrei') && here.has('cherryl');
export function onHere(fn){ hereListeners.add(fn); return () => hereListeners.delete(fn); }

/* ---------- the last 6 o'clock in Manila (UTC+8, no daylight saving) ---------- */
export function lastSixOClock(now = Date.now()){
  const d = new Date(now);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // 6am Manila = 22:00 UTC the day before; 6pm Manila = 10:00 UTC
  const marks = [day - 2 * 3600e3, day + 10 * 3600e3, day + 22 * 3600e3, day - 14 * 3600e3];
  return Math.max(...marks.filter(m => m <= now));
}

/* for testing without a second phone: pretend the other person did something */
window.__ourroomLive = {
  remote(patch, by = 'cherryl'){ absorb({ ...state, ...patch }, by); },
  message(type, data, from = 'cherryl'){ (eventListeners.get(type) || []).forEach(fn => fn(data, from)); },
  setHere,
};