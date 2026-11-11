import { listCapsules, sealCapsule, openCapsule, subscribe } from './room-data.js';
import * as sfx from './sfx.js';
import { notifyOther } from './push.js';
import { getMe, other, shortOf, nameOf } from './who.js';
import { openPanel, closePanel } from './room-panel.js';
import { esc } from './room-kit.js';
import { woodCanvases } from './shelf-textures.js';
import { compressDataUrl } from './imgutil.js';
import { toast, showConfirm } from './ui.js';
import { reportError } from './errors.js';

/**
 * The time capsule.
 *
 * Write a letter now, pick the day it opens, seal it. From then on nobody can
 * open, edit or delete it until that day — not either of you, not by changing
 * the clock on your computer. The database holds the contents where no query
 * can reach them, and only hands them over once its own clock says it's time.
 *
 * As Che put it: what's the point of a letter to the future if we can't wait
 * for the future to come?
 */
export function installCapsule(ctx){
  const { THREE, scene, focusOn, goBack, onBack, subtitle, ROOM } = ctx;
  const me = getMe(), them = other();

  /* ================= the keepsake box ================= */
  const chest = new THREE.Group();
  const wood = woodCanvases({ w: 512, h: 128, seed: 23, dark: '#2a160b', mid: '#5a321a', light: '#8a5530' });
  const woodTex = new THREE.CanvasTexture(wood.color); woodTex.colorSpace = THREE.SRGBColorSpace;
  const woodBump = new THREE.CanvasTexture(wood.bump);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, bumpMap: woodBump, bumpScale: 0.002, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.32, emissive: 0xffb84d, emissiveIntensity: 0 });

  const W = 0.30, D = 0.21, BH = 0.12;
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(W, BH, D), woodMat);
  bodyMesh.position.y = BH / 2;
  const lidBase = new THREE.Mesh(new THREE.BoxGeometry(W + 0.008, 0.03, D + 0.008), woodMat);
  lidBase.position.y = BH + 0.015;
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + 0.004, D / 2 + 0.004, W + 0.008, 32, 1, false), woodMat);
  dome.rotation.z = Math.PI / 2;
  dome.scale.set(1, 1, 0.42);                     // flatten into a low curved lid
  dome.position.y = BH + 0.03;
  // brass straps over the lid and down the front, and corner caps
  const straps = [];
  for (const x of [-W * 0.32, W * 0.32]){
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.018, BH + 0.03, D + 0.012), brass);
    s.position.set(x, (BH + 0.03) / 2, 0);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.006, 0.0045, 6, 24, Math.PI), brass);
    arc.rotation.y = Math.PI / 2; arc.scale.set(1, 0.42, 1);
    arc.position.set(x, BH + 0.03, 0);
    straps.push(s, arc);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.012, 0.012, D + 0.012), brass);
  band.position.y = BH + 0.001;

  // the heart-shaped padlock
  const heart = new THREE.Shape();
  const hs = 0.022;
  heart.moveTo(0, -hs * 1.1);
  heart.bezierCurveTo(-hs * 0.2, -hs * 0.7, -hs * 1.2, -hs * 0.3, -hs * 1.05, hs * 0.35);
  heart.bezierCurveTo(-hs * 0.95, hs * 0.95, -hs * 0.2, hs * 1.0, 0, hs * 0.45);
  heart.bezierCurveTo(hs * 0.2, hs * 1.0, hs * 0.95, hs * 0.95, hs * 1.05, hs * 0.35);
  heart.bezierCurveTo(hs * 1.2, -hs * 0.3, hs * 0.2, -hs * 0.7, 0, -hs * 1.1);
  const lockBody = new THREE.Mesh(new THREE.ExtrudeGeometry(heart, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3 }), brass);
  lockBody.position.set(0, BH * 0.62, D / 2 + 0.004);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0032, 8, 20, Math.PI), brass);
  shackle.position.set(0, BH * 0.62 + hs * 0.55, D / 2 + 0.01);
  const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), new THREE.MeshBasicMaterial({ color: 0x1a1008 }));
  keyhole.position.set(0, BH * 0.6, D / 2 + 0.0195);

  chest.add(bodyMesh, lidBase, dome, band, lockBody, shackle, keyhole, ...straps);
  chest.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  chest.position.set(...ROOM.capsuleSpot);
  chest.rotation.y = Math.PI / 2;                 // front faces into the room
  scene.add(chest);

  const glow = new THREE.PointLight(0xffc06a, 0, 1.4, 2);
  glow.position.set(ROOM.capsuleSpot[0] + 0.25, ROOM.capsuleSpot[1] + 0.12, ROOM.capsuleSpot[2]);
  scene.add(glow);

  /* ================= letters ================= */
  let capsules = [];
  const ready = c => !c.opened_at && Date.now() >= new Date(c.unlock_at).getTime();
  const readyForMe = c => ready(c) && (c.recipient === me || c.recipient === 'both');

  async function refresh(){
    try { capsules = await listCapsules(); }
    catch(e){ if (!e.needsMigration) reportError('capsules', e); }
    if (panelEl) render();
  }
  refresh();
  subscribe('capsules', refresh);
  setInterval(refresh, 5 * 60 * 1000);

  /* ================= the panel ================= */
  let panelEl = null, tab = 'sealed', ticker = null;

  function open(){
    focusOn('capsule', [chest], () => setTimeout(showPanel, 650));
  }

  function showPanel(){
    tab = capsules.some(readyForMe) || capsules.some(c => !c.opened_at) ? 'sealed' : (capsules.length ? 'opened' : 'write');
    panelEl = openPanel({
      className: 'capsule-panel',
      onClose: () => { clearInterval(ticker); panelEl = null; goBack(); },
      html: `
        <p class="rp-eyebrow">letters for later</p>
        <h2 class="rp-title">Time capsule</h2>
        <div class="cap-tabs">
          <button data-tab="sealed">Sealed</button>
          <button data-tab="opened">Opened</button>
          <button data-tab="write">✎ Write one</button>
        </div>
        <div class="cap-body"></div>`,
    });
    panelEl.querySelectorAll('.cap-tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    render();
    clearInterval(ticker);
    ticker = setInterval(tickCountdowns, 1000);
  }

  function render(){
    if (!panelEl) return;
    const sealed = capsules.filter(c => !c.opened_at);
    const opened = capsules.filter(c => c.opened_at);
    panelEl.querySelectorAll('.cap-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
      if (b.dataset.tab === 'sealed') b.textContent = `Sealed${sealed.length ? ' · ' + sealed.length : ''}`;
      if (b.dataset.tab === 'opened') b.textContent = `Opened${opened.length ? ' · ' + opened.length : ''}`;
    });
    const body = panelEl.querySelector('.cap-body');
    if (tab === 'write') return renderWrite(body);
    const list = tab === 'sealed' ? sealed : opened.slice().reverse();
    if (!list.length){
      body.innerHTML = tab === 'sealed'
        ? `<p class="cap-empty">No sealed letters yet.<br><button class="ui-btn primary cap-go-write">Write the first one</button></p>`
        : `<p class="cap-empty">Nothing opened yet. Good things take time.</p>`;
      body.querySelector('.cap-go-write')?.addEventListener('click', () => { tab = 'write'; render(); });
      return;
    }
    body.innerHTML = '<div class="cap-grid"></div>';
    const grid = body.querySelector('.cap-grid');
    list.forEach(c => grid.appendChild(envelope(c)));
    tickCountdowns();
  }

  function toLabel(r){ return r === 'both' ? 'both of us' : (r === me ? 'you' : shortOf(r)); }

  function envelope(c){
    const el = document.createElement('div');
    const isReady = ready(c), mine = readyForMe(c);
    el.className = 'cap-env' + (c.opened_at ? ' opened' : '') + (isReady ? ' ready' : '');
    el.dataset.id = c.id;
    const when = new Date(c.unlock_at);
    let action = '';
    if (c.opened_at) action = `<button class="ui-btn cap-read">Read it</button>`;
    else if (mine) action = `<button class="ui-btn primary cap-open">Open it</button>`;
    else if (isReady) action = `<p class="cap-wait">waiting for ${esc(shortOf(c.recipient))} to open it first</p>`;
    el.innerHTML = `
      <div class="cap-flap"></div>
      <div class="cap-seal">${esc((shortOf(c.author) || '?')[0])}</div>
      <p class="cap-to">to ${esc(toLabel(c.recipient))}</p>
      <p class="cap-from">from ${esc(c.author === me ? 'you' : shortOf(c.author))}</p>
      ${c.title ? `<p class="cap-title">“${esc(c.title)}”</p>` : ''}
      <p class="cap-count" data-unlock="${esc(c.unlock_at)}"></p>
      <p class="cap-date">${c.opened_at ? 'opened ' : (isReady ? 'ready since ' : 'opens ')}${(c.opened_at ? new Date(c.opened_at) : when).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      ${action}`;
    el.querySelector('.cap-open')?.addEventListener('click', () => reveal(c, el, true));
    el.querySelector('.cap-read')?.addEventListener('click', () => reveal(c, el, false));
    return el;
  }

  function tickCountdowns(){
    panelEl?.querySelectorAll('.cap-count').forEach(p => {
      const env = p.closest('.cap-env');
      if (env?.classList.contains('opened')){ p.textContent = ''; return; }
      const ms = new Date(p.dataset.unlock).getTime() - Date.now();
      if (ms <= 0){
        p.textContent = 'ready to open';
        if (!env.classList.contains('ready')) refresh();
        return;
      }
      p.textContent = 'opens in ' + countdown(ms);
    });
  }

  /* ---- opening ---- */
  async function reveal(c, el, first){
    let letter;
    try {
      letter = await openCapsule(c.id);
      window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'capsule-open' }));
    } catch(e){
      const msg = String(e.message || '');
      toast(/still sealed/.test(msg) ? "not yet — it's still sealed" : msg || "couldn't open it", 5000);
      return;
    }
    if (first){
      el.classList.add('cracking');
      subtitle('the seal breaks', 2400);
      await new Promise(r => setTimeout(r, 1500));
    }
    const box = document.createElement('div');
    box.className = 'cap-letter-back';
    box.innerHTML = `
      <div class="cap-letter">
        <button class="rp-close cap-letter-close">&times;</button>
        <p class="rp-eyebrow">${letter.title ? esc(letter.title) : 'a letter from the past'}</p>
        <div class="cap-letter-text">${esc(letter.body)}</div>
        ${letter.photo ? `<img class="cap-letter-photo" src="${letter.photo}" alt="">` : ''}
        <p class="cap-letter-foot">
          written by ${esc(nameOf(letter.author))} on ${new Date(letter.created_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
          · opened by ${esc(nameOf(letter.opened_by || me))} on ${new Date(letter.opened_at || Date.now()).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>`;
    panelEl.appendChild(box);
    requestAnimationFrame(() => box.classList.add('show'));
    box.querySelector('.cap-letter-close').addEventListener('click', () => {
      box.classList.remove('show'); setTimeout(() => box.remove(), 400);
    });
    if (first) refresh();
  }

  /* ---- writing ---- */
  let draft = { to: them, title: '', body: '', photo: null, preset: 'anniversary', date: '' };

  function presetDate(p){
    const now = new Date();
    const d = new Date(now);
    if (p === '1y') d.setFullYear(now.getFullYear() + 1);
    else if (p === '5y') d.setFullYear(now.getFullYear() + 5);
    else if (p === '10y') d.setFullYear(now.getFullYear() + 10);
    else if (p === 'anniversary'){
      const a = new Date(now.getFullYear(), 5, 12, 0, 0, 0);     // June 12, local time
      if (a.getTime() - now.getTime() < 2 * 864e5) a.setFullYear(a.getFullYear() + 1);
      return a;
    } else if (p === 'custom' && draft.date){
      return new Date(draft.date + 'T00:00:00');
    } else return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function renderWrite(body){
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    body.innerHTML = `
      <div class="cap-write">
        <div class="cap-field">
          <span class="cap-label">to</span>
          <div class="cap-seg">
            <button data-to="${them}">${esc(shortOf(them))}</button>
            <button data-to="${me}">future me</button>
            <button data-to="both">both of us</button>
          </div>
        </div>
        <label class="cap-field">
          <span class="cap-label">on the envelope</span>
          <input class="cap-title-in" maxlength="120" placeholder="open when we're…" value="${esc(draft.title)}">
        </label>
        <textarea class="cap-text" maxlength="20000" placeholder="dear future ${esc(draft.to === 'both' ? 'us' : draft.to === me ? 'me' : shortOf(them))},">${esc(draft.body)}</textarea>
        <div class="cap-field">
          <span class="cap-label">a photo inside</span>
          <div class="cap-photo-row">
            <button class="ui-btn cap-photo-btn">${draft.photo ? 'Change photo' : 'Add a photo'}</button>
            ${draft.photo ? `<img class="cap-photo-prev" src="${draft.photo}" alt=""><button class="cap-photo-x" title="Remove">&times;</button>` : '<span class="cap-hint">optional</span>'}
          </div>
        </div>
        <div class="cap-field">
          <span class="cap-label">opens on</span>
          <div class="cap-seg wrap">
            <button data-p="1y">a year from now</button>
            <button data-p="anniversary">our next anniversary</button>
            <button data-p="5y">5 years</button>
            <button data-p="10y">10 years</button>
            <button data-p="custom">pick a day</button>
          </div>
          <input type="date" class="cap-date-in" min="${tomorrow}" value="${esc(draft.date)}" ${draft.preset === 'custom' ? '' : 'hidden'}>
          <p class="cap-when"></p>
        </div>
        <button class="ui-btn primary cap-seal-btn">Seal it</button>
        <p class="cap-hint">once it's sealed, nobody can open, change or delete it until that day — not even you.</p>
      </div>`;

    const sync = () => {
      body.querySelectorAll('[data-to]').forEach(b => b.classList.toggle('active', b.dataset.to === draft.to));
      body.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('active', b.dataset.p === draft.preset));
      body.querySelector('.cap-date-in').hidden = draft.preset !== 'custom';
      const d = presetDate(draft.preset);
      body.querySelector('.cap-when').textContent = d
        ? `${d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${countdown(d.getTime() - Date.now(), true)} from now`
        : 'pick a day';
    };
    body.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => { draft.to = b.dataset.to; sync(); }));
    body.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { draft.preset = b.dataset.p; sync(); }));
    body.querySelector('.cap-date-in').addEventListener('input', e => { draft.date = e.target.value; sync(); });
    body.querySelector('.cap-title-in').addEventListener('input', e => { draft.title = e.target.value; });
    body.querySelector('.cap-text').addEventListener('input', e => { draft.body = e.target.value; });
    body.querySelector('.cap-photo-btn').addEventListener('click', pickPhoto);
    body.querySelector('.cap-photo-x')?.addEventListener('click', () => { draft.photo = null; render(); });
    body.querySelector('.cap-seal-btn').addEventListener('click', seal);
    sync();
  }

  function pickPhoto(){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => compressDataUrl(r.result, 1000, 0.8).then(url => { draft.photo = url; render(); });
      r.readAsDataURL(f);
    });
    input.click();
  }

  async function seal(){
    const d = presetDate(draft.preset);
    if (!draft.body.trim()){ toast('the letter is empty'); return; }
    if (!d || d.getTime() < Date.now() + 3600e3){ toast('pick a day in the future'); return; }
    const dateText = d.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    const ok = await showConfirm(
      `Once it's sealed, nobody can open it, change it or delete it until ${dateText} — not ${shortOf(them)}, not you. That's the point.`,
      'Seal it?', 'Seal it');
    if (!ok) return;
    const btn = panelEl.querySelector('.cap-seal-btn');
    btn.disabled = true;
    try {
      await sealCapsule({ recipient: draft.to, title: draft.title.trim(), unlockAt: d, body: draft.body, photo: draft.photo });
      sfx.seal();
      if (draft.to !== me) notifyOther('capsule', d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }));
      window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'capsule-seal' }));
      playSealAnimation();
      draft = { to: them, title: '', body: '', photo: null, preset: 'anniversary', date: '' };
      await refresh();
      setTimeout(() => { tab = 'sealed'; render(); }, 1700);
      subtitle(`sealed until ${dateText}`, 3600);
    } catch(e){
      toast(e.needsMigration ? e.message : (e.message || "couldn't seal it"), 7000);
      if (!e.needsMigration) reportError('seal', e);
      btn.disabled = false;
    }
  }

  function playSealAnimation(){
    const fx = document.createElement('div');
    fx.className = 'cap-seal-fx';
    fx.innerHTML = '<div class="csf-env"><div class="csf-letter"></div><div class="csf-flap"></div><div class="csf-wax"></div></div>';
    panelEl.appendChild(fx);
    setTimeout(() => fx.classList.add('go'), 30);
    setTimeout(() => fx.remove(), 2200);
  }

  onBack(was => { if (was === 'capsule'){ clearInterval(ticker); closePanel(true); panelEl = null; } });

  /* ================= hover + glow ================= */
  return {
    key: 'capsule',
    objects: [chest],
    label: () => {
      if (capsules.some(readyForMe)) return { label: 'Time capsule', sub: 'a letter is ready to open' };
      const sealed = capsules.filter(c => !c.opened_at);
      if (!sealed.length) return { label: 'Time capsule', sub: 'write a letter to the future' };
      const next = sealed.reduce((a, c) => new Date(c.unlock_at) < new Date(a.unlock_at) ? c : a);
      return { label: 'Time capsule', sub: `${sealed.length} sealed · next opens in ${countdown(new Date(next.unlock_at) - Date.now(), true)}` };
    },
    click: open,
    update(t){
      const on = capsules.some(readyForMe);
      const target = on ? 0.9 + Math.sin(t * 2) * 0.4 : 0;
      glow.intensity += (target - glow.intensity) * 0.08;
      brass.emissiveIntensity += ((on ? 0.25 + Math.sin(t * 2) * 0.15 : 0) - brass.emissiveIntensity) * 0.08;
    },
  };
}

/** "9 years, 11 months, 29 days · 04:12:33", or a short form. */
export function countdown(ms, short = false){
  if (ms <= 0) return 'now';
  // Split off the hours:minutes:seconds first, then count whole calendar
  // years/months/days on what's left. Counting calendar dates directly said a
  // letter opening at midnight a year from now was "1 year" away at 10am —
  // it's really 11 months, 30 days and 14 hours.
  const rem = ms % 864e5;
  const now = new Date(), end = new Date(now.getTime() + ms - rem);
  let y = end.getFullYear() - now.getFullYear();
  let m = end.getMonth() - now.getMonth();
  let d = end.getDate() - now.getDate();
  if (d < 0){ m -= 1; d += new Date(end.getFullYear(), end.getMonth(), 0).getDate(); }
  if (m < 0){ y -= 1; m += 12; }
  const parts = [];
  if (y) parts.push(`${y} year${y > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} month${m > 1 ? 's' : ''}`);
  if (d && (!short || !y)) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (short) return parts.slice(0, 2).join(', ') || (ms < 3600e3 ? `${Math.ceil(ms / 60000)} min` : `${Math.floor(ms / 3600e3)} hours`);
  const s = Math.floor(rem / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${parts.join(', ')}${parts.length ? ' · ' : ''}${hh}:${mm}:${ss}`;
}