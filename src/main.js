import { initScene } from './scene.js';
import { installGlobalHandlers, reportError } from './errors.js';
import * as store from './store.js';
import { hasSupabase, currentUser, signIn, sendMagicLink, signOut, consumeAuthErrorFromUrl, whoAmI } from './db.js';
import * as db from './db.js';
import { setMe, setAdmin, idFromEmail, idFromName, getMe, other, shortOf } from './who.js';
import { toast } from './ui.js';
import { showDiagnosis, diagnose } from './diagnose.js';

installGlobalHandlers();

// installable on a phone's home screen, opens fast, and receives notifications
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('service worker:', e));
  });
}

// A quick, visible statement of which backend is live. Silently falling back to
// localStorage while you think you're syncing is the worst possible outcome,
// so this says so plainly in the console and on the sign-in screen.
console.log(
  hasSupabase
    ? '%c Our Room — connected to Supabase '
    : '%c Our Room — LOCAL ONLY (no .env found, nothing will sync) ',
  `background:${hasSupabase ? '#2a6b3f' : '#8a5a1f'};color:#fff;padding:3px 8px;border-radius:3px`
);

const CORRECT_PIN = '06122026';
const SESSION_KEY = 'ourroom_session';

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ---------------- entering the room ---------------- */
async function goToRoom(name){
  showScreen('screen-room');

  const label = document.querySelector('#loading-room .loading-text');
  try {
    if (label) label.textContent = store.mode === 'supabase'
      ? 'Fetching our things…' : 'Setting up the room…';
    await store.load();
  } catch(e){
    reportError('loading data', e);
    // say *why*, not just that it failed
    try {
      const r = await diagnose();
      toast(r.ok ? "Couldn't load your things — see the error panel"
                 : `${r.summary}. ${r.fix}`, 9000);
    } catch(_){
      toast("Couldn't load from the server — you're seeing an empty room", 6000);
    }
  }

  // Who you are comes from the database, keyed on your login email. The name
  // you clicked only sets the greeting.
  let me = null;
  if (store.mode === 'supabase'){
    me = await whoAmI().catch(() => null);
    if (!me){
      const u = await currentUser().catch(() => null);
      me = idFromEmail(u?.email);
    }
  }
  setMe(me || idFromName(name) || 'andrei');
  // You're both admins: either of you can change anything on both computers.
  // The database says so once migration 003 is in; offline, same rule here.
  setAdmin(store.mode === 'supabase' ? await db.amAdmin().catch(() => false) : true);

  // who's already in the room? said on the loading screen, before you walk in
  window.__ourroomPeek = peekWhoIsHere().then(here => {
    const them = other();
    if (!here.includes(them)) return false;
    const el = document.getElementById('loading-here');
    if (el){
      el.innerHTML = `<span class="lh-dot"></span>${shortOf(them)} is here <span class="lh-heart">♥</span><small>${them === 'cherryl' ? 'she' : 'he'}'s in the room right now</small>`;
      el.classList.add('show');
    }
    return true;
  }).catch(() => false);

  showSyncWarning();
  if (store.mode === 'supabase' && db.needsMigration){
    toast('The new room features need one database update: run supabase-migration-002.sql in Supabase → SQL Editor', 12000);
  }

  try { initScene(name); }
  catch(e){ reportError('initScene', e); }
}

/** Look into the room's presence channel for a moment, without announcing ourselves. */
function peekWhoIsHere(timeout = 2600){
  if (store.mode !== 'supabase' || !db.supabase) return Promise.resolve([]);
  return new Promise(resolve => {
    let done = false;
    const ch = db.supabase.channel('our-room-presence');
    const finish = () => {
      if (done) return;
      done = true;
      const keys = Object.keys(ch.presenceState() || {});
      // fully closed before the room's own presence channel opens
      db.supabase.removeChannel(ch).catch(() => {}).then(() => resolve(keys));
    };
    ch.on('presence', { event: 'sync' }, () => setTimeout(finish, 150)).subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') finish();
    });
    setTimeout(finish, timeout);
  });
}

/**
 * A standing warning whenever edits aren't reaching the database. Without it
 * you can fill a whole page, hit save, and lose everything on reload with no
 * indication anything was wrong — which is exactly what happened.
 */
function showSyncWarning(){
  const bar = document.getElementById('sync-warning');
  const txt = document.getElementById('sync-warning-text');
  if (!bar || !txt) return;

  const reason = store.getDenyReason();
  if (!reason){ bar.classList.remove('show'); return; }

  txt.textContent = reason;
  bar.classList.add('show');
}

// re-check after each batch of saves, in case a write was refused mid-session
store.onChange(() => showSyncWarning());

document.getElementById('sync-warning-fix').addEventListener('click', async () => {
  try { await store.flush(); } catch(_){}
  try { if (hasSupabase) await signOut(); } catch(_){}
  localStorage.removeItem(SESSION_KEY);
  location.reload();
});

/* ---------------- resume ---------------- */
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
catch(e){ localStorage.removeItem(SESSION_KEY); }

(async function boot(){
  if (hasSupabase){
    const user = await currentUser().catch(() => null);
    if (user && saved?.name){ goToRoom(saved.name); return; }
    if (user){ showScreen('screen-who'); return; }
  } else if (saved && saved.unlocked && saved.name){
    goToRoom(saved.name); return;
  }
  showScreen('screen-gate');
})();

/* ---------------- gate ---------------- */
document.getElementById('enter-btn').addEventListener('click', () => {
  showScreen('screen-pin');
  resetPin();
  setTimeout(() => boxes[0].focus(), 60);
});

/* ---------------- PIN ---------------- */
const boxes = Array.from(document.querySelectorAll('.pin-box'));
const boxesWrap = document.getElementById('pin-boxes');
const errEl = document.getElementById('pin-error');
let checking = false;

function resetPin(){
  checking = false;
  boxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
  errEl.textContent = '';
}
const currentPin = () => boxes.map(b => b.value).join('');

function focusFirstEmpty(){
  (boxes.find(b => !b.value) || boxes[boxes.length-1]).focus();
}

boxes.forEach((box, idx) => {
  box.addEventListener('input', () => {
    box.value = box.value.replace(/\D/g, '').slice(-1);
    box.classList.toggle('filled', !!box.value);
    if (box.value && idx < boxes.length - 1) boxes[idx+1].focus();
    maybeCheck();
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Backspace'){
      if (box.value){ box.value = ''; box.classList.remove('filled'); }
      else if (idx > 0){
        e.preventDefault();
        boxes[idx-1].value = ''; boxes[idx-1].classList.remove('filled'); boxes[idx-1].focus();
      }
      errEl.textContent = '';
      return;
    }
    if (e.key === 'ArrowLeft'  && idx > 0){ e.preventDefault(); boxes[idx-1].focus(); }
    if (e.key === 'ArrowRight' && idx < boxes.length-1){ e.preventDefault(); boxes[idx+1].focus(); }
    if (e.key === 'Enter'){ e.preventDefault(); maybeCheck(true); }
  });
  box.addEventListener('paste', e => {
    e.preventDefault();
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, boxes.length);
    if (!digits) return;
    digits.split('').forEach((d,i) => { if (boxes[i]){ boxes[i].value = d; boxes[i].classList.add('filled'); } });
    focusFirstEmpty();
    maybeCheck();
  });
  box.addEventListener('focus', () => box.select());
});

function maybeCheck(force){
  if (checking) return;
  const pin = currentPin();
  if (pin.length < boxes.length && !force) return;
  if (pin.length < boxes.length){ errEl.textContent = 'Fill in all eight.'; return; }
  checking = true;

  if (pin === CORRECT_PIN){
    errEl.textContent = '';
    setTimeout(() => {
      checking = false;
      // with Supabase configured, the passcode is the doormat and the
      // email link is the actual lock
      showScreen(hasSupabase ? 'screen-auth' : 'screen-who');
      if (hasSupabase) setTimeout(() => document.getElementById('auth-email').focus(), 80);
    }, 220);
  } else {
    errEl.textContent = "that's not it — try again";
    boxesWrap.classList.add('shake');
    setTimeout(() => {
      boxesWrap.classList.remove('shake');
      boxes.forEach(b => { b.value=''; b.classList.remove('filled'); });
      boxes[0].focus();
      checking = false;
    }, 460);
  }
}

document.getElementById('pin-back').addEventListener('click', () => { resetPin(); showScreen('screen-gate'); });

/* ---------------- sign in ---------------- */
const authMsg = document.getElementById('auth-msg');

// Probe each part of the setup and say which one is wrong, rather than
// reporting a bare failure that needs another round trip to understand.
if (hasSupabase) showDiagnosis();

const authPass = document.getElementById('auth-pass');

// show / hide the password, for the days it's forgotten
const authEye = document.getElementById('auth-eye');
authEye?.addEventListener('click', () => {
  const show = authPass.type === 'password';
  authPass.type = show ? 'text' : 'password';
  authEye.classList.toggle('showing', show);
  authEye.title = show ? 'Hide password' : 'Show password';
  authEye.setAttribute('aria-label', authEye.title);
  authPass.focus();
});

// A dead magic link comes back as #error=… in the URL. Say so rather than
// dropping the user on an empty shelf with no explanation.
const urlAuthError = consumeAuthErrorFromUrl();
if (urlAuthError) authMsg.textContent = urlAuthError;

async function doSignIn(){
  const email = document.getElementById('auth-email').value.trim();
  const pass = authPass.value;
  if (!email || !email.includes('@')){ authMsg.textContent = 'that email looks off'; return; }
  if (!pass){ authMsg.textContent = 'password?'; authPass.focus(); return; }

  authMsg.textContent = 'opening…';
  try {
    await signIn(email, pass);
    showScreen('screen-who');
  } catch(e){
    authMsg.textContent = e.message || 'could not sign in';
    reportError('signIn', e);
  }
}

document.getElementById('auth-send').addEventListener('click', doSignIn);
authPass.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
document.getElementById('auth-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') authPass.focus();
});

// Fallback for whoever forgets the password. Rate-limited by Supabase's mailer,
// so it's the secondary route, not the front door.
document.getElementById('auth-magic').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  if (!email || !email.includes('@')){ authMsg.textContent = 'put your email in first'; return; }
  authMsg.textContent = 'sending…';
  try {
    await sendMagicLink(email);
    authMsg.textContent = 'check your inbox — open the link in this same browser';
  } catch(e){
    authMsg.textContent = e.message || 'could not send the link';
  }
});

// Escape hatch: browse without syncing. This must genuinely switch to local
// storage — it used to only change screen, leaving the app pointed at Supabase
// with no session, where reads came back empty and writes died with 42501.
document.getElementById('auth-skip').addEventListener('click', () => {
  store.useLocalOnly();
  toast('Local only — nothing will sync to the other device', 4000);
  showScreen('screen-who');
});

/* ---------------- who ---------------- */
document.querySelectorAll('.who-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.name;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ unlocked:true, name })); }
    catch(e){ console.error(e); }
    goToRoom(name);
  });
});

/* leaving through the door signs out of Supabase too */
window.addEventListener('ourroom:leave', async () => {
  try { await store.flush(); } catch(e){}
  try { if (hasSupabase) await signOut(); } catch(e){}
  localStorage.removeItem(SESSION_KEY);
  location.reload();
});