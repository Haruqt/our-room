/**
 * The three round buttons in the room's top-left corner:
 *
 *   ?   help — every clickable thing in the room lights up with its name.
 *       Tap a name to go straight to it (handy on a phone).
 *   🏆  the trophy shelf (achievements)
 *   ⚙   settings — notifications, sound effects, install as an app, our cat, the guide
 */
import { openTrophies, count, loadAchievements } from './achievements.js';
import { openPanel, closePanel } from './room-panel.js';
import { pushStatus, enablePush, disablePush, isIOS, isInstalled } from './push.js';
import { soundOn, setSoundOn } from './sfx.js';
import { toast } from './ui.js';
import { esc } from './room-kit.js';
import { reportError } from './errors.js';

const did = key => window.dispatchEvent(new CustomEvent('ourroom:did', { detail: key }));

/* the browser's own "install this app" prompt (Android / desktop Chrome, Edge, Brave) */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; did('install'); });

/**
 * @param ctx.spots   () => [{ x, y, z, label, sub, go }]  every clickable thing, in world space
 * @param ctx.camera, ctx.THREE, ctx.isBusy () => bool  (camera focused somewhere)
 */
export function installHud({ THREE, camera, spots, isBusy, onFrame }){
  const room = document.getElementById('screen-room');
  const hud = document.createElement('div');
  hud.id = 'room-hud';
  hud.innerHTML = `
    <button class="hud-btn" data-h="help" title="What can I touch?" aria-label="Help">?</button>
    <button class="hud-btn" data-h="trophies" title="Achievements" aria-label="Achievements">🏆<em class="hud-count"></em></button>
    <button class="hud-btn" data-h="settings" title="Settings" aria-label="Settings">⚙</button>`;
  room.appendChild(hud);

  const layer = document.createElement('div');
  layer.id = 'help-layer';
  layer.innerHTML = `<div class="help-top"><b>Everything that glows can be touched</b><span>tap a name to go there · tap here to close</span></div>`;
  room.appendChild(layer);

  const setCount = () => { const n = count(); hud.querySelector('.hud-count').textContent = n ? String(n) : ''; };
  loadAchievements().then(setCount);
  window.addEventListener('ourroom:did', () => setTimeout(setCount, 300));

  hud.querySelector('[data-h="help"]').addEventListener('click', () => toggleHelp());
  hud.querySelector('[data-h="trophies"]').addEventListener('click', () => { closeHelp(); openTrophies(); });
  hud.querySelector('[data-h="settings"]').addEventListener('click', () => { closeHelp(); openSettings(); });
  layer.querySelector('.help-top').addEventListener('click', () => closeHelp());

  // opened as an installed app
  if (isInstalled()) setTimeout(() => did('install'), 2500);
  // 3 a.m. in Manila
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (h < 4) setTimeout(() => did('late'), 4000);
  setTimeout(() => did('enter'), 1500);

  /* ---------- help mode ---------- */
  let pins = [];
  let helpOn = false;
  function toggleHelp(){ helpOn ? closeHelp() : openHelp(); }
  function openHelp(){
    if (isBusy()) return;
    closePanel();
    helpOn = true;
    did('help');
    hud.querySelector('[data-h="help"]').classList.add('on');
    layer.querySelectorAll('.help-pin').forEach(p => p.remove());
    pins = spots().map((s, i) => {
      const el = document.createElement('button');
      el.className = 'help-pin';
      el.style.setProperty('--d', (i * 45) + 'ms');
      el.innerHTML = `<span class="hp-dot"></span><span class="hp-txt"><b>${esc(s.label)}</b>${s.sub ? `<i>${esc(s.sub)}</i>` : ''}</span>`;
      el.addEventListener('click', e => { e.stopPropagation(); closeHelp(); try { s.go(); } catch(err){ reportError('help go', err); } });
      layer.appendChild(el);
      return { el, p: new THREE.Vector3(s.x, s.y, s.z) };
    });
    layer.classList.add('show');
    place();
  }
  function closeHelp(){
    if (!helpOn) return;
    helpOn = false;
    hud.querySelector('[data-h="help"]').classList.remove('on');
    layer.classList.remove('show');
  }
  const v = new THREE.Vector3();
  function place(){
    if (!helpOn) return;
    if (isBusy()){ closeHelp(); return; }
    const W = innerWidth, H = innerHeight;
    // place, then nudge labels that would sit on top of each other
    const boxes = [];
    pins.forEach(({ el, p }) => {
      v.copy(p).project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.display = vis ? '' : 'none';
      if (!vis) return;
      let x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      const w = el.offsetWidth || 120, h = el.offsetHeight || 34;
      x = Math.max(8, Math.min(W - w - 8, x - 9));
      for (let k = 0; k < 8; k++){
        const hit = boxes.find(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
        if (!hit) break;
        y = hit.y + hit.h + 4;
      }
      y = Math.max(70, Math.min(H - h - 70, y - 9));
      boxes.push({ x, y, w, h });
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
  }
  onFrame(() => { if (helpOn) place(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeHelp(); });

  /* ---------- settings ---------- */
  async function openSettings(){
    const el = openPanel({ className: 'settings-panel', html: `
      <p class="rp-eyebrow">just for this device</p>
      <h2 class="rp-title">Settings</h2>
      <div class="set-row" data-s="push"><div><b>Notifications</b><i class="set-sub">checking…</i></div><button class="ui-btn primary set-act" hidden>Turn on</button></div>
      <div class="set-row" data-s="sound"><div><b>Sound effects</b><i>the light switch, the computer, the cork</i></div><button class="ui-btn set-act"></button></div>
      <div class="set-row" data-s="install"><div><b>Put it on your home screen</b><i class="set-sub"></i></div><button class="ui-btn set-act" hidden>Install</button></div>
      <div class="set-row" data-s="cat"><div><b>Our cat</b><i>name, look, lock it in — or adopt one</i></div><button class="ui-btn set-act">Open</button></div>
      <div class="set-row" data-s="guide"><div><b>The guide</b><i>what everything in the room does</i></div><button class="ui-btn set-act">Show</button></div>` });

    // sound
    const sb = el.querySelector('[data-s="sound"] .set-act');
    const paintSound = () => { sb.textContent = soundOn() ? 'On' : 'Off'; sb.classList.toggle('primary', soundOn()); };
    sb.addEventListener('click', () => { setSoundOn(!soundOn()); paintSound(); });
    paintSound();

    el.querySelector('[data-s="cat"] .set-act').addEventListener('click', () => window.dispatchEvent(new CustomEvent('ourroom:cat-panel')));
    // guide
    el.querySelector('[data-s="guide"] .set-act').addEventListener('click', () => {
      closePanel();
      document.getElementById('guide-card')?.classList.add('show');
    });

    // install
    const ir = el.querySelector('[data-s="install"]');
    const ib = ir.querySelector('.set-act'), isub = ir.querySelector('.set-sub');
    if (isInstalled()){ isub.textContent = 'done — you opened it from your home screen'; }
    else if (installPrompt){ isub.textContent = 'opens full screen, like an app'; ib.hidden = false; }
    else if (isIOS()){ isub.innerHTML = 'Safari: tap <b>Share</b> <span class="ios-share">⬆︎</span> → <b>Add to Home Screen</b>'; }
    else { isub.textContent = 'in your browser menu: “Install app” or “Add to Home screen”'; }
    ib.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch(_){}
      installPrompt = null; ib.hidden = true;
    });

    // notifications
    const pr = el.querySelector('[data-s="push"]');
    const pb = pr.querySelector('.set-act'), psub = pr.querySelector('.set-sub');
    const paintPush = async () => {
      const s = await pushStatus();
      pb.hidden = !['on', 'off'].includes(s);
      pb.textContent = s === 'on' ? 'Turn off' : 'Turn on';
      pb.classList.toggle('primary', s !== 'on');
      psub.innerHTML = {
        on: 'on — you’ll hear when something’s left for you, even with the room closed',
        off: 'get told when a note, a letter or a time capsule is left for you',
        blocked: 'blocked in this browser’s settings — allow notifications for this site there',
        'needs-install': 'on iPhone, first put the room on your home screen (below), then open it from there',
        'not-set-up': 'not set up yet (see START-HERE.md → notifications)',
        unsupported: 'needs syncing on, in a browser that supports them',
      }[s] || '';
    };
    pb.addEventListener('click', async () => {
      pb.disabled = true;
      try {
        if (pb.textContent === 'Turn off'){ await disablePush(); toast('notifications off on this device'); }
        else { await enablePush(); did('push'); toast('notifications on 🔔'); }
      } catch(e){ toast(e.message || "couldn't turn them on", 6000); }
      pb.disabled = false;
      paintPush();
    });
    paintPush();
  }

  return { closeHelp, openHelp };
}