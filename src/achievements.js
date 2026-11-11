/**
 * Achievements, Steam style: do something in the room for the first time and
 * a little badge slides in. Each of you has your own list, and you can see
 * the other's on the trophy shelf (🏆, top left).
 *
 * Anything in the app can say "I just did X":
 *     window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'note' }))
 * and the matching achievement unlocks, once.
 */
import { supabase } from './db.js';
import * as store from './store.js';
import { getMe, other, shortOf } from './who.js';
import { subscribe } from './room-data.js';
import { openPanel } from './room-panel.js';
import { esc } from './room-kit.js';
import { toast } from './ui.js';
import * as sfx from './sfx.js';
import { reportError } from './errors.js';

export const ACHIEVEMENTS = [
  { key: 'enter',          icon: '🏠', title: 'Welcome home',         desc: 'Walk into the room' },
  { key: 'together',       icon: '👣', title: 'Two pairs of slippers', desc: 'Be in the room at the same time' },
  { key: 'note',           icon: '🍾', title: 'Message in a bottle',   desc: 'Leave a note in the bottle' },
  { key: 'note-read',      icon: '📜', title: 'Uncorked',              desc: 'Read a note left for you' },
  { key: 'letter',         icon: '✉️', title: 'Dear you',              desc: 'Write a letter on a computer' },
  { key: 'capsule-seal',   icon: '🔒', title: 'See you in the future', desc: 'Seal a time capsule' },
  { key: 'capsule-open',   icon: '🗝️', title: 'Worth the wait',        desc: 'Open a time capsule on its day' },
  { key: 'frame',          icon: '🖼️', title: 'On the wall',           desc: 'Hang one of your photos' },
  { key: 'book-new',       icon: '📕', title: 'A new chapter',         desc: 'Start a book for a year' },
  { key: 'page-save',      icon: '📌', title: 'Pasted in',             desc: 'Save a scrapbook page' },
  { key: 'cover',          icon: '🎨', title: 'Judge this book',       desc: 'Change a book’s cover' },
  { key: 'tv-watch',       icon: '📺', title: 'Movie night',           desc: 'Sit down in front of the TV' },
  { key: 'watch-together', icon: '🍿', title: 'Watched together',      desc: 'Watch the TV while you’re both here' },
  { key: 'song',           icon: '🎵', title: 'Our song',              desc: 'Play a song on the speakers' },
  { key: 'song-add',       icon: '💿', title: 'Mixtape',               desc: 'Add a song' },
  { key: 'lights-off',     icon: '🌑', title: 'Lights out',            desc: 'Switch the lights off' },
  { key: 'night',          icon: '🌙', title: 'Time bender',           desc: 'Change day to night (or back) by hand' },
  { key: 'pc-boot',        icon: '💻', title: 'Logged in',             desc: 'Sign in to your computer' },
  { key: 'pc-visit',       icon: '🕵️', title: 'Lovingly snooping',     desc: 'Sign in to the other one’s computer' },
  { key: 'wallpaper',      icon: '🌸', title: 'Make it yours',         desc: 'Change a desktop background' },
  { key: 'cmd-love',       icon: '💗', title: 'Hello, world',          desc: 'Type love in the Command Prompt', secret: true },
  { key: 'bin-empty',      icon: '🗑️', title: 'Clean slate',           desc: 'Empty a Recycle Bin' },
  { key: 'help',           icon: '❓', title: 'Curious',               desc: 'Ask the room what you can touch' },
  { key: 'push',           icon: '🔔', title: 'Never miss a thing',    desc: 'Turn on notifications' },
  { key: 'install',        icon: '📱', title: 'Home screen',           desc: 'Open the room as an app on your phone' },
  { key: 'cat-adopt',      icon: '📦', title: 'Something in the box',  desc: 'Adopt the cat' },
  { key: 'cat-pet',        icon: '🐈', title: 'Purr machine',          desc: 'Pet the cat (and it lets you)' },
  { key: 'cat-feed',       icon: '🐟', title: 'Dinner is served',      desc: 'Fill the cat’s bowl' },
  { key: 'cat-design',     icon: '🎨', title: 'Just like mine',        desc: 'Design how the cat looks' },
  { key: 'cat-play',       icon: '🧶', title: 'Playtime',              desc: 'Play with the cat using the yarn ball' },
  { key: 'cat-family',     icon: '🐾', title: 'Cat family',            desc: 'Have two cats or more' },
  { key: 'cat-trust',      icon: '💞', title: 'Best friends',          desc: 'Earn the cat’s full trust' },
  { key: 'cat-flee',       icon: '💨', title: 'Rejected',              desc: 'Get hissed at by the cat', secret: true },
  { key: 'late',           icon: '🦉', title: '3 a.m. thoughts',       desc: 'Visit between midnight and 4 a.m.', secret: true },
];
const BY_KEY = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));

const live = () => store.mode === 'supabase' && !!supabase;
const LS_KEY = 'ourroom_achievements';
let rows = [];               // { who, key, unlocked_at }
let tableOk = true;
let loaded = null;

const mine = who => rows.filter(r => r.who === who);
export const has = (key, who = getMe()) => rows.some(r => r.who === who && r.key === key);
export const count = (who = getMe()) => mine(who).filter(r => BY_KEY[r.key]).length;

function readLocal(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch(_){ return []; } }
function writeLocal(){ try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch(_){} }

export function loadAchievements(){
  if (loaded) return loaded;
  rows = readLocal();
  loaded = (async () => {
    if (!live()) return rows;
    try {
      const { data, error } = await supabase.from('achievements').select('who, key, unlocked_at');
      if (error) throw error;
      // keep anything unlocked here before the table existed, and send it up
      const local = rows.filter(r => r.who === getMe() && !(data || []).some(d => d.who === r.who && d.key === r.key));
      rows = [...(data || []), ...local];
      writeLocal();
      local.forEach(r => supabase.from('achievements').insert({ who: r.who, key: r.key }).then(() => {}, () => {}));
    } catch(e){ tableOk = false; if (!/does not exist|schema cache/i.test(e.message || '')) reportError('achievements', e); }
    subscribe('achievements', payload => {
      const r = payload.new;
      if (!r || rows.some(x => x.who === r.who && x.key === r.key)) return;
      rows.push(r); writeLocal();
      if (r.who !== getMe() && BY_KEY[r.key]) toast(`${shortOf(r.who)} unlocked “${BY_KEY[r.key].title}”`, 3200);
      refreshPanel();
    });
    return rows;
  })();
  return loaded;
}

/** Unlock (once). Safe to call as often as you like. */
export async function unlock(key){
  const a = BY_KEY[key];
  if (!a) return;
  await loadAchievements();
  if (has(key)) return;
  const row = { who: getMe(), key, unlocked_at: new Date().toISOString() };
  rows.push(row); writeLocal();
  popup(a);
  refreshPanel();
  if (live() && tableOk){
    const { error } = await supabase.from('achievements').insert({ who: row.who, key });
    if (error && !/duplicate/i.test(error.message)) console.warn('achievement save:', error.message);
  }
}

window.addEventListener('ourroom:did', e => { unlock(String(e.detail)).catch(err => reportError('unlock', err)); });

/* ---------- the pop-up ---------- */
let queue = Promise.resolve();
function popup(a){
  queue = queue.then(() => new Promise(done => {
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.innerHTML = `<span class="ach-icon">${a.icon}</span><span class="ach-txt"><small>Achievement unlocked</small><b>${esc(a.title)}</b><i>${esc(a.desc)}</i></span>`;
    el.addEventListener('click', () => openTrophies());
    document.body.appendChild(el);
    sfx.ding();
    void el.offsetWidth;                 // start from the hidden position, then slide in
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.remove(); done(); }, 500); }, 4200);
  }));
}

/* ---------- the trophy shelf ---------- */
let panel = null;
let tab = null;
export function openTrophies(){
  tab = tab || getMe();
  panel = openPanel({ className: 'trophy-panel', onClose: () => { panel = null; }, html: `
    <p class="rp-eyebrow">the trophy shelf</p>
    <h2 class="rp-title">Achievements</h2>
    <div class="cap-tabs ach-tabs">
      <button data-who="${getMe()}">Mine</button>
      <button data-who="${other()}">${esc(shortOf(other()))}’s</button>
    </div>
    <div class="ach-progress"><span></span><i><b></b></i></div>
    <div class="ach-grid"></div>` });
  panel.querySelectorAll('.ach-tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.who; refreshPanel(); }));
  loadAchievements().then(refreshPanel);
  refreshPanel();
}

function refreshPanel(){
  if (!panel) return;
  panel.querySelectorAll('.ach-tabs button').forEach(b => b.classList.toggle('on', b.dataset.who === tab));
  const got = new Map(mine(tab).map(r => [r.key, r]));
  const n = ACHIEVEMENTS.filter(a => got.has(a.key)).length;
  panel.querySelector('.ach-progress span').textContent = `${n} of ${ACHIEVEMENTS.length} unlocked`;
  panel.querySelector('.ach-progress b').style.width = (n / ACHIEVEMENTS.length * 100) + '%';
  const grid = panel.querySelector('.ach-grid');
  grid.innerHTML = '';
  // unlocked first (newest on top), then the ones still waiting
  const list = [...ACHIEVEMENTS].sort((x, y) => {
    const gx = got.get(x.key), gy = got.get(y.key);
    if (gx && gy) return String(gy.unlocked_at).localeCompare(String(gx.unlocked_at));
    return gx ? -1 : gy ? 1 : 0;
  });
  list.forEach(a => {
    const r = got.get(a.key);
    const hide = !r && a.secret;
    const el = document.createElement('div');
    el.className = 'ach-card' + (r ? ' got' : '');
    el.innerHTML = `<span class="ach-icon">${hide ? '❔' : a.icon}</span>
      <span class="ach-txt"><b>${esc(hide ? 'Secret' : a.title)}</b><i>${esc(hide ? 'keep exploring…' : a.desc)}</i>
      ${r ? `<small>${new Date(r.unlocked_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</small>` : ''}</span>`;
    grid.appendChild(el);
  });
}