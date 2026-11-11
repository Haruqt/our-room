import {
  getBook, getPage, savePage, addPage, deletePage, renamePage,
  suggestNextLabel, PAPERS
} from './books.js';
import { Surface } from './surface.js';
import { STICKERS, TAPE_COLORS, buildNote, buildTape } from './elements.js';
import { flipPage } from './page-flip.js';
import { showPrompt, showConfirm, showChoice, toast } from './ui.js';
import { reportError, guard } from './errors.js';
import { fileToCompressedDataUrl } from './imgutil.js';

const PAGE_W = 380;
const PAGE_H = 520;

const TEMPLATES = [
  { id:'single',   label:'One big photo',   hint:'photo + caption underneath' },
  { id:'stacked',  label:'Two stacked',     hint:'two photos, notes beside' },
  { id:'triptych', label:'Three in a row',  hint:'little moments' },
  { id:'journal',  label:'Letter page',     hint:'one photo, long note' },
  { id:'collage',  label:'Scattered',       hint:'four taped corners' },
];
const NOTE_STYLES = [
  { value:'hand',  label:'Handwritten', hint:'Caveat' },
  { value:'type',  label:'Typewriter',  hint:'Special Elite' },
  { value:'serif', label:'Printed',     hint:'Playfair' },
  { value:'card',  label:'Index card',  hint:'raised paper' },
];

let L = null, R = null;
let currentYear = null;
let leftIndex = 0;
let active = null;
let onExitCallback = null;
let toolbarReady = false;
let flipping = false;
let locked = true;

/* Phones and narrow windows show one page at a time (side 'L' or 'R' of the
   current spread) instead of the two-page spread, scaled to fit. */
let single = false;
let side = 'L';
const absIndex = () => leftIndex + (side === 'R' ? 1 : 0);

function pages(){ return getBook(currentYear)?.pages || []; }

/* ================= lock ================= */
function setLocked(v){
  locked = v;
  [L,R].forEach(s => s && s.setLocked(v));
  const btn = document.getElementById('lock-toggle');
  if (btn){
    btn.innerHTML = locked ? '✎ Edit' : '✓ Done';
    btn.classList.toggle('active', !locked);
    btn.title = locked ? 'Start editing this spread' : 'Finish and lock everything in place';
  }
  document.getElementById('editor-overlay').classList.toggle('is-locked', locked);
  ['add-photo-btn','add-text-btn','add-sticker-btn','add-tape-btn','template-btn','paper-btn',
   'delete-el-btn','front-btn','back-btn-layer']
    .forEach(id => { const b = document.getElementById(id); if (b) b.disabled = locked; });
  markActive();
}

function markActive(){
  document.getElementById('page-left-wrap').classList.toggle('is-active', !locked && active === L);
  document.getElementById('page-right-wrap').classList.toggle('is-active', !locked && active === R);
}

/* ================= render ================= */
function renderSpread(){
  const ps = pages();
  leftIndex = Math.max(0, Math.min(leftIndex, Math.max(0, ps.length - 1)));
  if (leftIndex % 2 !== 0) leftIndex -= 1;

  const lp = ps[leftIndex] || null;
  const rp = ps[leftIndex+1] || null;

  L.pageId = lp ? lp.id : null;
  R.pageId = rp ? rp.id : null;

  document.getElementById('page-left-wrap').classList.toggle('is-blank', !lp);
  document.getElementById('page-right-wrap').classList.toggle('is-blank', !rp);

  if (lp) L.load(lp.elements, lp.paper); else { L.clear(); L.setPaper(null); }
  if (rp) R.load(rp.elements, rp.paper); else { R.clear(); R.setPaper(null); }

  active = rp ? R : L;
  if (single){
    if (side === 'R' && !rp) side = 'L';
    active = side === 'R' ? R : L;
  }
  document.getElementById('editor-overlay').dataset.side = side;

  document.getElementById('label-left').textContent  = lp ? lp.label : '';
  document.getElementById('label-right').textContent = rp ? rp.label : '';
  document.getElementById('spread-counter').textContent = !ps.length ? ''
    : single ? `page ${absIndex()+1} of ${ps.length}`
    : `${leftIndex+1}–${Math.min(leftIndex+2, ps.length)} of ${ps.length}`;

  updateFlipButtons();
  markActive();
  requestAnimationFrame(fitBook);
}

function updateFlipButtons(){
  const n = pages().length;
  document.getElementById('flip-prev').disabled = single ? absIndex() <= 0 : leftIndex <= 0;
  document.getElementById('flip-next').disabled = single ? absIndex() >= n - 1 : leftIndex + 2 >= n;
}

/* ================= fitting the book to the screen ================= */
function fitBook(){
  const ov = document.getElementById('editor-overlay');
  if (!ov.classList.contains('show')) return;
  const stage = ov.querySelector('.editor-stage');
  const body = ov.querySelector('.book-body');
  const w = body.offsetWidth, h = body.offsetHeight;
  if (!w || !h) return;
  const padW = single ? 16 : 130, padH = single ? 64 : 70;
  const s = Math.max(0.3, Math.min(1, (stage.clientWidth - padW) / w, (stage.clientHeight - padH) / h));
  body.style.transform = s < 0.999 ? `scale(${s})` : '';
  // a scaled element keeps its full size in the layout; pull the edges in so
  // the arrows and the counter sit right against the visible book
  const mx = (w * (s - 1)) / 2, my = (h * (s - 1)) / 2;
  body.style.margin = s < 0.999 ? `${my}px ${mx}px` : '';
}

function setLayout(){
  const ov = document.getElementById('editor-overlay');
  const narrow = window.innerWidth < 900;
  const changed = narrow !== single;
  single = narrow;
  ov.classList.toggle('single', single);
  if (!single) ov.classList.remove('rail-open');
  if (changed){
    if (single) side = active === R && R.pageId ? 'R' : 'L';
    if (L) renderSpread();
  }
  requestAnimationFrame(fitBook);
}
window.addEventListener('resize', () => {
  if (document.getElementById('editor-overlay').classList.contains('show')) setLayout();
});

/** Single-page mode: step to the page before or after, with a little slide. */
function stepPage(dir){
  const n = pages().length;
  const i = absIndex() + (dir === 'next' ? 1 : -1);
  if (i < 0 || i >= n || flipping) return;
  saveSpread(true);
  leftIndex = i - (i % 2);
  side = i % 2 ? 'R' : 'L';
  renderSpread(); renderRail();
  const host = document.getElementById(side === 'R' ? 'page-right-wrap' : 'page-left-wrap');
  host.classList.remove('turn-next', 'turn-prev');
  void host.offsetWidth;
  host.classList.add(dir === 'next' ? 'turn-next' : 'turn-prev');
}

function renderRail(){
  const list = document.getElementById('page-list');
  list.innerHTML = '';
  document.getElementById('editor-title').textContent = currentYear;

  pages().forEach((page, i) => {
    const item = document.createElement('div');
    const onSpread = single ? i === absIndex() : (i === leftIndex || i === leftIndex+1);
    item.className = 'page-item' + (onSpread ? ' active' : '');
    item.innerHTML = `<span class="pnum">${i+1}</span><span class="lbl">${page.label}</span><button class="page-del" title="Delete">✕</button>`;
    item.querySelector('.lbl').addEventListener('click', () => {
      saveSpread(true); leftIndex = i - (i % 2); side = i % 2 ? 'R' : 'L'; renderSpread(); renderRail();
      document.getElementById('editor-overlay').classList.remove('rail-open');
    });
    item.querySelector('.lbl').addEventListener('dblclick', async () => {
      const next = await showPrompt('Rename this page', page.label, 'Page name');
      if (next){ renamePage(currentYear, page.id, next); renderRail(); renderSpread(); }
    });
    item.querySelector('.page-del').addEventListener('click', async e => {
      e.stopPropagation();
      if (!(await showConfirm(`Delete "${page.label}"? This can't be undone.`, 'Delete page', 'Delete'))) return;
      deletePage(currentYear, page.id);
      if (!pages().length) addPage(currentYear, suggestNextLabel(currentYear));
      leftIndex = Math.min(leftIndex, Math.max(0, pages().length-1));
      renderSpread(); renderRail();
      toast('Page deleted');
    });
    list.appendChild(item);
  });
}

/* ================= persist ================= */
function saveSpread(quiet){
  let deferred = false;

  [L,R].forEach(s => {
    if (!s || !s.pageId) return;
    const elements = s.serialize();
    // null means images are still decoding. Writing now would store a page with
    // those photos missing and permanently delete them, so wait instead.
    if (elements === null){ deferred = true; return; }
    savePage(currentYear, s.pageId, { elements, paper:s.paper });
  });

  if (deferred){
    setTimeout(() => saveSpread(true), 350);
    if (!quiet) toast('Still loading a photo — saving in a moment');
    return;
  }

  if (!quiet){
    setLocked(true);
    toast('Saved — spread locked');
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'page-save' }));
  }
}

/* ================= flipping ================= */
function doFlip(direction){
  if (single){ stepPage(direction); return; }
  if (flipping) return;
  const ps = pages();
  if (direction === 'next' && leftIndex + 2 >= ps.length) return;
  if (direction === 'prev' && leftIndex <= 0) return;

  flipping = true;
  saveSpread(true);

  const surf  = direction === 'next' ? R : L;
  const hinge = direction === 'next' ? 'left' : 'right';
  const overlay = document.getElementById(direction === 'next' ? 'flip-overlay-right' : 'flip-overlay-left');
  const landing = document.getElementById(direction === 'next' ? 'flip-overlay-left' : 'flip-overlay-right');
  const snapshot = surf.toDataURL(1.6);

  let swapped = false;
  const swap = () => {
    if (swapped) return;
    swapped = true;
    leftIndex += direction === 'next' ? 2 : -2;
    renderSpread(); renderRail();
  };

  flipPage({
    container: overlay, landing, snapshot,
    width:PAGE_W, height:PAGE_H, hinge, duration:1450,   // slower, more deliberate
    onMidpoint: swap,
    onDone: () => { swap(); flipping = false; }
  });
}

/* ================= templates ================= */
function applyTemplate(id){
  if (!active || !active.pageId){ toast('Pick a page first'); return; }
  const surf = active;
  const add = el => {
    const g = el.type === 'note' ? buildNote(el, !locked) : buildTape(el, !locked);
    surf._wire(g); surf.content.add(g);
  };
  const mk = o => ({ id:'x_'+Date.now()+Math.random().toString(36).slice(2,5), ...o });

  if (id === 'single'){
    add(mk({ type:'note', text:'write about this one…', x:44, y:PAGE_H-120, width:280, fontSize:21, noteStyle:'hand', rotation:-1.5 }));
    add(mk({ type:'tape', x:140, y:36, width:96, height:23, rotation:-4, fill:TAPE_COLORS[0] }));
  } else if (id === 'stacked'){
    add(mk({ type:'note', text:'top:', x:40, y:232, width:150, fontSize:17, noteStyle:'hand' }));
    add(mk({ type:'note', text:'bottom:', x:40, y:470, width:150, fontSize:17, noteStyle:'hand' }));
  } else if (id === 'triptych'){
    add(mk({ type:'note', text:'three little moments', x:46, y:PAGE_H-78, width:280, fontSize:22, noteStyle:'hand', rotation:-2 }));
  } else if (id === 'journal'){
    add(mk({ type:'note', text:'Dear you,\n\n', x:38, y:280, width:300, fontSize:17, noteStyle:'type' }));
    add(mk({ type:'tape', x:46, y:30, width:88, height:22, rotation:-6, fill:TAPE_COLORS[1] }));
  } else if (id === 'collage'){
    add(mk({ type:'note', text:'a whole mess of us', x:96, y:PAGE_H-62, width:220, fontSize:22, noteStyle:'hand', rotation:2.5 }));
    [[30,24,-9],[250,100,7],[46,360,5],[228,432,-6]].forEach(([x,y,r],i)=>
      add(mk({ type:'tape', x, y, width:74, height:21, rotation:r, fill:TAPE_COLORS[i%TAPE_COLORS.length] })));
  }
  surf.content.draw();
  closeTrays();
}

/* ================= trays ================= */
function closeTrays(){
  ['sticker-tray','paper-tray'].forEach(id => document.getElementById(id).classList.remove('show'));
  ['add-sticker-btn','paper-btn'].forEach(id => document.getElementById(id).classList.remove('active'));
}
function toggleTray(trayId, btnId){
  const tray = document.getElementById(trayId);
  const open = tray.classList.contains('show');
  closeTrays();
  if (!open){ tray.classList.add('show'); document.getElementById(btnId).classList.add('active'); }
}
function markActivePaper(){
  document.querySelectorAll('#paper-tray .paper-swatch').forEach(s =>
    s.classList.toggle('active', !!active && s.dataset.paper === active.paper));
}

function buildTrays(){
  const st = document.getElementById('sticker-tray');
  st.innerHTML = `<p class="tray-label">Stickers</p><div class="tray-grid">` +
    STICKERS.map(s => `<button class="tray-item" data-s="${s}">${s}</button>`).join('') + `</div>`;
  st.querySelectorAll('.tray-item').forEach(b => b.addEventListener('click', () => {
    if (!active || !active.pageId){ toast('Pick a page first'); return; }
    active.addSticker(b.dataset.s);
    closeTrays();
  }));

  const pt = document.getElementById('paper-tray');
  pt.innerHTML = `<p class="tray-label">Paper — applies to the highlighted page</p><div class="tray-grid">` +
    PAPERS.map(p => `<div class="paper-swatch" data-paper="${p.id}" title="${p.label}" style="background:${p.css}"></div>`).join('') + `</div>`;
  pt.querySelectorAll('.paper-swatch').forEach(s => s.addEventListener('click', () => {
    if (!active || !active.pageId){ toast('Pick a page first'); return; }
    active.setPaper(s.dataset.paper);
    savePage(currentYear, active.pageId, { paper:s.dataset.paper, elements:active.serialize() });
    markActivePaper();
  }));
}

/* ================= setup ================= */
function ensureSurfaces(){
  if (L) return;

  const rings = document.getElementById('rings');
  if (rings && !rings.children.length){
    const count = Math.max(8, Math.round(PAGE_H / 42));
    for (let i = 0; i < count; i++){
      const r = document.createElement('div');
      r.className = 'ring';
      r.style.transform = `rotate(${-6 + Math.random()*4}deg)`;
      rings.appendChild(r);
    }
  }

  const onSelect = surf => { active = surf; markActive(); markActivePaper(); };
  L = new Surface({ containerId:'page-left',  width:PAGE_W, height:PAGE_H, gutter:'left',  onSelect }).mount();
  R = new Surface({ containerId:'page-right', width:PAGE_W, height:PAGE_H, gutter:'right', onSelect }).mount();
  active = R;
}

function setupToolbar(){
  if (toolbarReady) return;
  toolbarReady = true;
  buildTrays();

  document.getElementById('lock-toggle').addEventListener('click', () => {
    if (!locked){ saveSpread(false); }
    else { setLocked(false); toast('Editing — drag things around'); }
  });

  document.getElementById('add-sticker-btn').addEventListener('click', () => toggleTray('sticker-tray','add-sticker-btn'));
  document.getElementById('paper-btn').addEventListener('click', () => { toggleTray('paper-tray','paper-btn'); markActivePaper(); });

  document.getElementById('template-btn').addEventListener('click', async () => {
    closeTrays();
    const pick = await showChoice('Adds notes and tape to the highlighted page. Your existing items stay.',
      TEMPLATES.map(t => ({ value:t.id, label:t.label, hint:t.hint })), 'Page layout');
    if (pick) applyTemplate(pick);
  });

  document.getElementById('add-text-btn').addEventListener('click', async () => {
    if (!active || !active.pageId){ toast('Pick a page first'); return; }
    const style = await showChoice('How should it look?', NOTE_STYLES, 'Add a note');
    if (style) active.addNote(style);
  });

  document.getElementById('add-tape-btn').addEventListener('click', () => {
    if (!active || !active.pageId){ toast('Pick a page first'); return; }
    active.addTape();
  });

  const input = document.getElementById('photo-input');
  document.getElementById('add-photo-btn').addEventListener('click', () => {
    if (!active || !active.pageId){ toast('Pick a page first'); return; }
    input.click();
  });
  input.addEventListener('change', () => {
    const surf = active;
    const files = Array.from(input.files || []);
    if (files.length) toast(files.length > 1 ? `adding ${files.length} photos…` : 'adding photo…', 1200);
    files.forEach((file, i) => {
      fileToCompressedDataUrl(file)
        .then(url => surf.addPhotoFromDataUrl(url, i))
        .catch(err => reportError('addPhoto', err));
    });
    input.value = '';
  });

  document.getElementById('front-btn').addEventListener('click', () => {
    if (!active || !active.bringToFront()) toast('Select something first');
  });
  document.getElementById('back-btn-layer').addEventListener('click', () => {
    if (!active || !active.sendToBack()) toast('Select something first');
  });

  document.getElementById('delete-el-btn').addEventListener('click', () => {
    if (!active || !active.deleteSelected()) toast('Nothing selected');
  });

  document.getElementById('save-page-btn').addEventListener('click', () => saveSpread(false));

  document.getElementById('add-page-btn').addEventListener('click', async () => {
    saveSpread(true);
    const label = await showPrompt('Name this page', suggestNextLabel(currentYear), 'New page');
    if (!label) return;
    addPage(currentYear, label);
    const ps = pages();
    leftIndex = (ps.length-1) - ((ps.length-1) % 2);
    side = (ps.length-1) % 2 ? 'R' : 'L';
    renderSpread(); renderRail();
    toast(`"${label}" added`);
  });

  // phones: the page list slides in from the side
  document.getElementById('pages-btn')?.addEventListener('click', () =>
    document.getElementById('editor-overlay').classList.toggle('rail-open'));
  document.querySelector('#editor-overlay .editor-stage').addEventListener('pointerdown', () =>
    document.getElementById('editor-overlay').classList.remove('rail-open'));

  // phones: swipe the page to turn it (only while locked, so dragging photos still works)
  let sw = null;
  const stageEl = document.querySelector('#editor-overlay .editor-stage');
  stageEl.addEventListener('touchstart', e => {
    if (!locked || e.touches.length !== 1) { sw = null; return; }
    sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  stageEl.addEventListener('touchend', e => {
    if (!sw) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    const quick = Date.now() - sw.t < 600;
    sw = null;
    if (quick && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) doFlip(dx < 0 ? 'next' : 'prev');
  }, { passive: true });

  document.getElementById('flip-next').addEventListener('click', () => doFlip('next'));
  document.getElementById('flip-prev').addEventListener('click', () => doFlip('prev'));

  document.getElementById('editor-back').addEventListener('click', () => {
    saveSpread(true); closeTrays();
    document.getElementById('editor-overlay').classList.remove('show');
    onExitCallback && onExitCallback();
  });

  window.addEventListener('keydown', e => {
    if (!document.getElementById('editor-overlay').classList.contains('show')) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && active && !locked){
      e.preventDefault(); active.deleteSelected();
    }
    if (e.key === 'ArrowRight') doFlip('next');
    if (e.key === 'ArrowLeft')  doFlip('prev');
    if ((e.ctrlKey||e.metaKey) && e.key === 's'){ e.preventDefault(); saveSpread(false); }
    if (e.key === 'e' || e.key === 'E') document.getElementById('lock-toggle').click();
  });
}

export const openEditor = guard('openEditor', function(year, pageId, { onExitToShelf }){
  currentYear = year;
  onExitCallback = onExitToShelf;
  ensureSurfaces(); setupToolbar();

  const idx = pages().findIndex(p => p.id === pageId);
  leftIndex = idx > 0 ? idx - (idx % 2) : 0;

  document.getElementById('editor-overlay').classList.add('show');
  setLayout();
  side = idx > 0 && idx % 2 ? 'R' : 'L';
  renderSpread(); renderRail(); setLocked(true);
});