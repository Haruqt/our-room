/**
 * "She left you something" — notifications that arrive even when the site
 * (or the phone app) is closed.
 *
 *   enablePush()          ask this device for permission and remember it
 *   notifyOther(kind, …)  tell the other person's devices something new is here
 *
 * Needs migration 005, the "notify" Edge Function, and VITE_VAPID_PUBLIC_KEY
 * in .env (see START-HERE.md). Without them it quietly does nothing.
 *
 * iPhone: notifications only work after "Add to Home Screen" and opening it
 * from there (Apple's rule for websites).
 */
import { supabase } from './db.js';
import * as store from './store.js';
import { getMe, other, shortOf } from './who.js';
import { bothHere } from './room-live.js';
import { reportError } from './errors.js';

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const live = () => store.mode === 'supabase' && !!supabase;

export const pushPossible = () =>
  live() && !!PUBLIC_KEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'on' | 'off' | 'blocked' | 'unsupported' | 'needs-install' | 'not-set-up' */
export async function pushStatus(){
  if (!live()) return 'unsupported';
  if (!PUBLIC_KEY) return 'not-set-up';
  if (isIOS() && !isInstalled()) return 'needs-install';
  if (!pushPossible()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch(_){ return 'off'; }
}

function keyBytes(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** Must be called from a tap/click (browsers only ask permission then). */
export async function enablePush(){
  if (!pushPossible()) throw new Error(isIOS() && !isInstalled()
    ? 'On iPhone: Share → Add to Home Screen, open it from there, then turn this on'
    : 'Notifications are not available here');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed — you can allow them in the browser settings');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ endpoint: j.endpoint, who: getMe(), p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  return true;
}

export async function disablePush(){
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub){
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch(e){ reportError('push off', e); }
}

const LINES = {
  note:    me => ({ title: `${me} left you a note 🍾`, body: 'It’s in the bottle on the coffee table.' }),
  letter:  (me, d) => ({ title: `${me} wrote you a letter ✉️`, body: d ? `${d} — on ${me === 'Che' ? 'her' : 'his'} computer.` : 'It’s on the computer.' }),
  capsule: (me, d) => ({ title: `${me} sealed a time capsule for you 🔒`, body: d ? `It opens ${d}. No peeking.` : 'No peeking until the day comes.' }),
  photo:   (me, d) => ({ title: `${me} hung a new photo 🖼`, body: d || 'Go look at the wall.' }),
};

/**
 * Tell the other person. Skipped when they're in the room right now (they'll
 * see it happen live). Never throws: a missed notification isn't an error
 * worth interrupting anyone for.
 */
export async function notifyOther(kind, detail = ''){
  if (!live() || bothHere()) return;
  const line = (LINES[kind] || LINES.note)(shortOf(getMe()), detail);
  try {
    const { error } = await supabase.functions.invoke('notify', {
      body: { to: other(), title: line.title, body: line.body, tag: kind },
    });
    if (error) console.warn('notify:', error.message || error);
  } catch(e){ console.warn('notify:', e); }
}