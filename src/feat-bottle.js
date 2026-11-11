import { listNotes, sendNote, markNotesRead, unsendNote, subscribe } from './room-data.js';
import * as sfx from './sfx.js';
import { notifyOther } from './push.js';
import { getMe, other, shortOf } from './who.js';
import { openPanel, closePanel } from './room-panel.js';
import { esc, ago } from './room-kit.js';
import { toast, showConfirm } from './ui.js';
import { reportError } from './errors.js';

/**
 * The message in a bottle on the coffee table.
 *
 * Leave a note for the other one. When one is waiting for you, a rolled-up
 * letter appears inside the glass and the bottle glows until you open it.
 */
export function installBottle(ctx){
  const { THREE, scene, pick, subtitle, focusOn, goBack, onBack, ROOM } = ctx;
  const parts = pick(ROOM.hotspots.bottle);
  if (!parts.length) return null;

  const box = new THREE.Box3();
  parts.forEach(o => box.union(new THREE.Box3().setFromObject(o)));
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // the glass glows from within
  const glass = parts[0];
  glass.material = glass.material.clone();
  glass.material.emissive = new THREE.Color(0xffc97a);
  glass.material.emissiveIntensity = 0;

  // a rolled letter tied with red thread, inside the bottle
  const scroll = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.CylinderGeometry(size.x * 0.17, size.x * 0.17, size.y * 0.42, 20),
    new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.85, emissive: 0xffd9a0, emissiveIntensity: 0.15 }));
  const tie = new THREE.Mesh(
    new THREE.TorusGeometry(size.x * 0.175, size.x * 0.03, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xb3262e, roughness: 0.6 }));
  tie.rotation.x = Math.PI / 2;
  scroll.add(paper, tie);
  scroll.position.set(c.x, box.min.y + size.y * 0.3, c.z);
  scroll.rotation.z = 0.5;
  scroll.visible = false;
  scene.add(scroll);

  const glow = new THREE.PointLight(0xffc77a, 0, 1.6, 2);
  glow.position.set(c.x, c.y, c.z);
  scene.add(glow);

  const me = getMe(), them = other();
  let notes = [];
  let unread = [];
  let panelEl = null;

  async function refresh(announce = false){
    try {
      notes = await listNotes();
      const before = unread.length;
      unread = notes.filter(n => n.author !== me && !n.read_at);
      scroll.visible = unread.length > 0;
      if (announce && unread.length > before) subtitle(`something washed up in the bottle — from ${shortOf(them)}`, 4200);
      if (panelEl) renderHistory();
    } catch(e){
      if (!e.needsMigration) reportError('bottle', e);
    }
  }
  refresh();
  subscribe('notes', () => refresh(true));
  setInterval(() => refresh(true), 90 * 1000);   // in case live updates aren't on

  function open(){
    focusOn('bottle', parts, () => {
      setTimeout(() => { sfx.cork(); showPanel(); }, 650);
    });
  }

  function showPanel(){
    const waiting = unread.slice();
    if (waiting.length) window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'note-read' }));
    panelEl = openPanel({
      className: 'bottle-panel',
      onClose: () => { panelEl = null; goBack(); },
      html: `
        <p class="rp-eyebrow">message in a bottle</p>
        <h2 class="rp-title">${waiting.length ? `${shortOf(them)} left you ${waiting.length === 1 ? 'a note' : waiting.length + ' notes'}` : `A note for ${shortOf(them)}`}</h2>
        <div class="bp-unread"></div>
        <div class="bp-compose">
          <textarea class="bp-text" maxlength="2000" rows="4" placeholder="write to ${esc(shortOf(them))}…"></textarea>
          <div class="bp-row">
            <span class="bp-count">0 / 2000</span>
            <button class="ui-btn primary bp-send">Put it in the bottle</button>
          </div>
        </div>
        <div class="bp-history">
          <p class="rp-eyebrow">every note so far</p>
          <div class="bp-list"></div>
        </div>`,
    });

    // unrolled letters for whatever was waiting, one after another
    const unreadWrap = panelEl.querySelector('.bp-unread');
    waiting.forEach((n, i) => {
      const card = document.createElement('div');
      card.className = 'bp-letter';
      card.style.animationDelay = (0.25 + i * 0.35) + 's';
      card.innerHTML = `<p class="bp-letter-text">${esc(n.body)}</p><p class="bp-letter-from">— ${esc(shortOf(n.author))} · ${ago(n.created_at)}</p>`;
      unreadWrap.appendChild(card);
    });
    if (waiting.length){
      setTimeout(() => {
        markNotesRead(waiting.map(n => n.id)).then(() => refresh()).catch(e => reportError('markRead', e));
      }, 1400);
    }

    const ta = panelEl.querySelector('.bp-text');
    const count = panelEl.querySelector('.bp-count');
    ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / 2000`; });
    panelEl.querySelector('.bp-send').addEventListener('click', async () => {
      const body = ta.value.trim();
      if (!body){ ta.focus(); return; }
      const btn = panelEl.querySelector('.bp-send');
      btn.disabled = true;
      try {
        await sendNote(body);
        notifyOther('note');
        window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'note' }));
        ta.value = ''; count.textContent = '0 / 2000';
        panelEl.querySelector('.bp-compose').classList.add('sent');
        setTimeout(() => panelEl?.querySelector('.bp-compose')?.classList.remove('sent'), 1300);
        toast(`it's in the bottle — ${shortOf(them)} will see it glow`);
        await refresh();
      } catch(e){
        toast(e.needsMigration ? e.message : (e.message || "couldn't send it"), 6000);
        if (!e.needsMigration) reportError('sendNote', e);
      } finally { btn.disabled = false; }
    });

    renderHistory();
    if (!waiting.length) setTimeout(() => ta.focus(), 400);
  }

  function renderHistory(){
    const list = panelEl?.querySelector('.bp-list');
    if (!list) return;
    if (!notes.length){
      list.innerHTML = `<p class="bp-empty">nothing yet. the first one's yours.</p>`;
      return;
    }
    list.innerHTML = '';
    notes.slice().reverse().forEach(n => {
      const mine = n.author === me;
      const row = document.createElement('div');
      row.className = 'bp-note' + (mine ? ' mine' : '');
      const status = mine
        ? (n.read_at ? `read ${ago(n.read_at)}` : `not read yet · <button class="bp-unsend">take it back</button>`)
        : ago(n.created_at);
      row.innerHTML = `<p class="bp-note-text">${esc(n.body)}</p>
        <p class="bp-note-meta">${mine ? 'you' : esc(shortOf(n.author))} · ${mine ? ago(n.created_at) + ' · ' : ''}${status}</p>`;
      row.querySelector('.bp-unsend')?.addEventListener('click', async () => {
        if (!await showConfirm(`Take this note back before ${shortOf(them)} reads it?`, 'Take it back', 'Take it back')) return;
        try { await unsendNote(n.id); await refresh(); }
        catch(e){ toast(e.message || "couldn't take it back"); }
      });
      list.appendChild(row);
    });
  }

  onBack(was => { if (was === 'bottle') closePanel(true); panelEl = null; });

  return {
    key: 'bottle',
    objects: parts,
    label: () => unread.length
      ? { label: `A note from ${shortOf(them)}`, sub: 'it washed up in the bottle' }
      : { label: 'Message in a bottle', sub: `leave a note for ${shortOf(them)}` },
    click: open,
    update(t){
      const on = unread.length > 0;
      const pulse = on ? 0.55 + Math.sin(t * 2.2) * 0.35 : 0;
      glass.material.emissiveIntensity += (pulse * 0.55 - glass.material.emissiveIntensity) * 0.1;
      glow.intensity += ((on ? 1.1 + Math.sin(t * 2.2) * 0.5 : 0) - glow.intensity) * 0.1;
      if (scroll.visible) scroll.rotation.y = Math.sin(t * 0.8) * 0.25;
    },
  };
}