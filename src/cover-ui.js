import { getBook, getCover, saveCover, COVER_MATERIALS, COVER_TEXTURES, addPage, suggestNextLabel, storageUsage } from './books.js';
import { Surface } from './surface.js';
import { STICKERS } from './elements.js';
import { PAPERS } from './books.js';
import { showPrompt, showChoice, toast } from './ui.js';
import { reportError, guard } from './errors.js';
import { fileToCompressedDataUrl } from './imgutil.js';

const FRONT_W = 300, FRONT_H = 400;
const SPINE_W = 120, SPINE_H = 400;

const NOTE_STYLES = [
  { value:'hand',  label:'Handwritten', hint:'Caveat' },
  { value:'type',  label:'Typewriter',  hint:'Special Elite' },
  { value:'serif', label:'Printed',     hint:'Playfair' },
  { value:'card',  label:'Index card',  hint:'raised paper' },
];

let currentYear = null;
let onOpenBook = null, onBackToShelf = null;
let wired = false;

let rotY = -32, rotX = 10;
let dragging = false, lastX = 0, lastY = 0;
let idle = true, idleT = 0, idleRaf = null;

let frontSurface = null, spineSurface = null;
let editing = null;            // null | 'front' | 'spine'

export function initCoverUI({ onOpen, onBack }){
  onOpenBook = onOpen;
  onBackToShelf = onBack;
  if (wired) return;
  wired = true;

  try {
    const stage = document.getElementById('cover-stage');

    let downAt = null;
    stage.addEventListener('pointerdown', e => {
      if (editing || e.target.closest('button')) return;
      dragging = true; idle = false;
      lastX = e.clientX; lastY = e.clientY;
      downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('grabbing');
    });
    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.5;
      rotX = Math.max(-46, Math.min(46, rotX - (e.clientY - lastY) * 0.3));
      lastX = e.clientX; lastY = e.clientY;
      applyRotation();
    });
    const stop = e => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('grabbing');
      try { stage.releasePointerCapture(e.pointerId); } catch(_){}
      // a quick tap on the book (not a drag to turn it) opens it
      if (e.type === 'pointerup' && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8
          && Date.now() - downAt.t < 400 && e.target.closest('#cover-book')) playOpenSafe();
      downAt = null;
    };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);

    document.getElementById('cover-back').addEventListener('click', () => {
      closeCover(); onBackToShelf && onBackToShelf();
    });
    const playOpenSafe = guard('cover.open', () => { if (currentYear != null && !opening) playOpen(); });
    document.getElementById('cover-open').addEventListener('click', playOpenSafe);
    document.getElementById('cover-open-main')?.addEventListener('click', playOpenSafe);
    document.getElementById('cover-reset').addEventListener('click', () => {
      rotY = -32; rotX = 10; idle = true; applyRotation();
    });
    document.getElementById('cover-edit-toggle').addEventListener('click', () => {
      const ov = document.getElementById('cover-overlay');
      const open = ov.classList.toggle('panel-open');
      document.getElementById('cover-edit-toggle').classList.toggle('active', open);
      document.getElementById('cover-edit-toggle').innerHTML = open ? '✓ Done' : '✎ Edit';
      if (open) renderStorage();
    });

    document.getElementById('cover-edit-front').addEventListener('click', () => startEdit('front'));
    document.getElementById('cover-edit-spine').addEventListener('click', () => startEdit('spine'));
    document.getElementById('ce-done').addEventListener('click', guard('cover.done', finishEdit));

    buildEditToolbar();

    window.addEventListener('keydown', e => {
      if (!document.getElementById('cover-overlay').classList.contains('show')) return;
      if (e.key === 'Escape'){
        if (editing) finishEdit();
        else { closeCover(); onBackToShelf && onBackToShelf(); }
      }
    });
  } catch(e){ reportError('initCoverUI', e); }
}

/* ================= 3D view ================= */
function applyRotation(){
  const book = document.getElementById('cover-book');
  if (book) book.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
}

function idleSpin(){
  cancelAnimationFrame(idleRaf);
  const tick = () => {
    if (idle && !dragging && !editing){
      idleT += 0.0035;                       // slower, calmer drift
      rotY = -32 + Math.sin(idleT) * 10;
      rotX = 10 + Math.sin(idleT * 0.7) * 3.5;
      applyRotation();
    }
    idleRaf = requestAnimationFrame(tick);
  };
  idleRaf = requestAnimationFrame(tick);
}

export function openCover(year){
  try {
    currentYear = year;
    rotY = -32; rotX = 10; idle = true; idleT = 0; editing = null;
    const ov = document.getElementById('cover-overlay');
    ov.classList.add('show');
    ov.classList.remove('is-editing', 'panel-open');   // always open in clean view mode
    const tog = document.getElementById('cover-edit-toggle');
    tog.classList.remove('active');
    tog.innerHTML = '✎ Edit';
    // Snap the hinge shut without animating it, then hand the transition back to
    // the stylesheet. Leaving `transition:none` on the element is what used to
    // make the cover flick open instantly the next time instead of swinging.
    const frontEl = document.getElementById('cover-front');
    if (frontEl){
      frontEl.style.transition = 'none';
      frontEl.style.removeProperty('--open');
      void frontEl.offsetWidth;                                   // force the snap
      requestAnimationFrame(() => frontEl.style.removeProperty('transition'));
    }
    ensureSurfaces();
    renderCover();
    renderPanel();
    applyRotation();
    idleSpin();
  } catch(e){ reportError('openCover', e); }
}

function closeCover(){
  document.getElementById('cover-overlay').classList.remove('show','is-editing');
  cancelAnimationFrame(idleRaf);
}

function textureCss(textureId, a, b){
  if (textureId === 'grain')
    return `repeating-linear-gradient(112deg, rgba(0,0,0,.09) 0 2px, transparent 2px 5px),
            repeating-linear-gradient(28deg, rgba(255,255,255,.05) 0 1px, transparent 1px 4px),
            linear-gradient(145deg, ${a}, ${b})`;
  if (textureId === 'linen')
    return `repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px),
            repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 1px, transparent 1px 3px),
            linear-gradient(145deg, ${a}, ${b})`;
  if (textureId === 'marble')
    return `radial-gradient(ellipse at 22% 28%, rgba(255,255,255,.16), transparent 42%),
            radial-gradient(ellipse at 72% 68%, rgba(0,0,0,.24), transparent 46%),
            linear-gradient(145deg, ${a}, ${b})`;
  return `linear-gradient(145deg, ${a}, ${b})`;
}

function renderCover(){
  const c = getCover(currentYear);
  const mat = COVER_MATERIALS.find(m => m.id === c.material) || COVER_MATERIALS[0];
  const base = textureCss(c.texture, mat.a, mat.b);
  const book = getBook(currentYear);
  const pageCount = book ? book.pages.length : 0;

  const front = document.getElementById('cover-front');
  const spine = document.getElementById('cover-spine');

  // The material goes on the skin layers, not on the faces — see .bk-skin in
  // style.css for why painting a 3D face directly tears the cover apart.
  const frontSkin = document.getElementById('cover-front-skin');
  const spineSkin = document.getElementById('cover-spine-skin');
  const backSkin  = document.getElementById('cover-back-skin');

  // whatever you designed sits on top of the material
  frontSkin.style.backgroundImage = c.frontImage ? `url(${c.frontImage}), ${base}` : base;
  frontSkin.style.backgroundSize = c.frontImage ? '100% 100%, cover' : 'cover';

  spineSkin.style.backgroundImage = c.spineImage
    ? `url(${c.spineImage}), linear-gradient(90deg, rgba(0,0,0,.34), transparent 40%, rgba(0,0,0,.28)), ${base}`
    : `linear-gradient(90deg, rgba(0,0,0,.34), transparent 40%, rgba(0,0,0,.28)), ${base}`;
  spineSkin.style.backgroundSize = c.spineImage ? '100% 100%, cover, cover' : 'cover, cover';

  backSkin.style.backgroundImage = base;
  backSkin.style.backgroundSize = 'cover';

  // With artwork of your own on a face, the printed lettering and the stamped
  // border step aside so they don't sit on top of what you made.
  front.classList.toggle('has-art', Boolean(c.frontImage));
  spine.classList.toggle('has-art', Boolean(c.spineImage));

  document.getElementById('cs-fallback').style.display = c.spineImage ? 'none' : 'flex';
  document.getElementById('cf-fallback').style.display = c.frontImage ? 'none' : 'flex';
  document.getElementById('cf-emblem').textContent   = c.emblem || '';
  document.getElementById('cf-title').textContent    = c.title || currentYear;
  document.getElementById('cf-subtitle').textContent = c.subtitle || '';
  document.getElementById('cf-signature').textContent = c.signature || '';
  document.getElementById('cs-year').textContent     = c.title || currentYear;
  document.getElementById('cb-note').textContent     = `${pageCount} page${pageCount===1?'':'s'}`;

  const thickness = Math.min(52, 20 + pageCount * 1.8);
  document.documentElement.style.setProperty('--book-depth', thickness + 'px');
}

/* ================= panel ================= */
function renderPanel(){
  const c = getCover(currentYear);

  const mats = document.getElementById('cover-materials');
  mats.innerHTML = COVER_MATERIALS.map(m =>
    `<button class="cov-swatch${m.id===c.material?' active':''}" data-mat="${m.id}" title="${m.label}"
      style="background:linear-gradient(145deg,${m.a},${m.b})"></button>`).join('');
  mats.querySelectorAll('.cov-swatch').forEach(b => b.addEventListener('click', () => {
    saveCover(currentYear, { material:b.dataset.mat }); window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'cover' })); renderCover(); renderPanel();
  }));

  const texes = document.getElementById('cover-textures');
  texes.innerHTML = COVER_TEXTURES.map(t =>
    `<button class="cov-chip${t.id===c.texture?' active':''}" data-tex="${t.id}">${t.label}</button>`).join('');
  texes.querySelectorAll('.cov-chip').forEach(b => b.addEventListener('click', () => {
    saveCover(currentYear, { texture:b.dataset.tex }); window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'cover' })); renderCover(); renderPanel();
  }));

  bindField('edit-title',     'title',     'Cover title', c.title);
  bindField('edit-subtitle',  'subtitle',  'Line under the title', c.subtitle);
  bindField('edit-signature', 'signature', 'Signed by', c.signature);
  renderStorage();

  document.getElementById('cover-edit-front').textContent = c.frontImage ? 'Edit front ✎' : 'Design the front';
  document.getElementById('cover-edit-spine').textContent = c.spineImage ? 'Edit spine ✎' : 'Design the spine';
}

function renderStorage(){
  const { bytes, ratio } = storageUsage();
  const fill = document.getElementById('storage-fill');
  const note = document.getElementById('storage-note');
  if (!fill || !note) return;
  fill.style.width = Math.round(ratio * 100) + '%';
  fill.classList.toggle('warn', ratio > 0.75);
  note.textContent = `${(bytes / 1048576).toFixed(1)} MB of about 5 MB used`;
}

function bindField(btnId, key, label, value){
  const btn = document.getElementById(btnId);
  btn.querySelector('.cov-field-val').textContent = value || '—';
  btn.onclick = async () => {
    const next = await showPrompt(label, value || '', 'Cover');
    if (next === null) return;
    saveCover(currentYear, { [key]: next });
    renderCover(); renderPanel();
  };
}

/* ================= face editing ================= */
function ensureSurfaces(){
  if (!frontSurface){
    frontSurface = new Surface({ containerId:'ce-front-canvas', width:FRONT_W, height:FRONT_H }).mount();
  }
  if (!spineSurface){
    spineSurface = new Surface({ containerId:'ce-spine-canvas', width:SPINE_W, height:SPINE_H }).mount();
  }
}

function activeSurface(){ return editing === 'spine' ? spineSurface : frontSurface; }

function startEdit(which){
  try {
    editing = which;
    ensureSurfaces();
    const c = getCover(currentYear);
    const data = which === 'spine' ? (c.spine || {}) : (c.front || {});
    const surf = activeSurface();

    document.getElementById('cover-overlay').classList.add('is-editing');
    document.getElementById('ce-front-wrap').style.display = which === 'front' ? 'block' : 'none';
    document.getElementById('ce-spine-wrap').style.display = which === 'spine' ? 'block' : 'none';
    document.getElementById('ce-heading').textContent = which === 'spine' ? 'The spine' : 'The front cover';
    document.getElementById('ce-sub').textContent = which === 'spine'
      ? 'this is what shows on the shelf'
      : 'photos, notes, stickers — same as a page';

    surf.setLocked(false);
    surf.load(data.elements || [], data.paper || (which === 'spine' ? 'kraftdk' : 'kraft'));
    markPaperSwatches(surf.paper);
  } catch(e){ reportError('startEdit', e); }
}

function finishEdit(){
  if (!editing) return;
  const surf = activeSurface();
  const key = editing === 'spine' ? 'spine' : 'front';
  const imgKey = editing === 'spine' ? 'spineImage' : 'frontImage';

  surf.select(null);

  // Same rule as a page: null means photos are still decoding, and saving now
  // would drop them. Wait rather than write an incomplete cover.
  const elements = surf.serialize();
  if (elements === null){
    toast('Still loading a photo — try Done again in a second');
    return;
  }

  // JPEG at 1.4x, not PNG at 2x — same look on screen, a fraction of the bytes
  const snap = surf.toDataURL(1.4, 'image/jpeg', 0.85);

  saveCover(currentYear, {
    [key]: { elements, paper: surf.paper },
    [imgKey]: snap
  });

  editing = null;
  document.getElementById('cover-overlay').classList.remove('is-editing');
  renderCover(); renderPanel();
  toast('Cover saved');
}

function buildEditToolbar(){
  const stickerTray = document.getElementById('ce-sticker-tray');
  stickerTray.innerHTML = `<p class="tray-label">Stickers</p><div class="tray-grid">` +
    STICKERS.map(s => `<button class="tray-item" data-s="${s}">${s}</button>`).join('') + `</div>`;
  stickerTray.querySelectorAll('.tray-item').forEach(b => b.addEventListener('click', () => {
    activeSurface().addSticker(b.dataset.s);
    stickerTray.classList.remove('show');
  }));

  const paperTray = document.getElementById('ce-paper-tray');
  paperTray.innerHTML = `<p class="tray-label">Backing</p><div class="tray-grid">` +
    PAPERS.map(p => `<div class="paper-swatch" data-paper="${p.id}" title="${p.label}" style="background:${p.css}"></div>`).join('') + `</div>`;
  paperTray.querySelectorAll('.paper-swatch').forEach(s => s.addEventListener('click', () => {
    activeSurface().setPaper(s.dataset.paper);
    markPaperSwatches(s.dataset.paper);
  }));

  document.getElementById('ce-sticker').addEventListener('click', () => {
    paperTray.classList.remove('show');
    stickerTray.classList.toggle('show');
  });
  document.getElementById('ce-paper').addEventListener('click', () => {
    stickerTray.classList.remove('show');
    paperTray.classList.toggle('show');
  });
  document.getElementById('ce-tape').addEventListener('click', () => activeSurface().addTape());
  document.getElementById('ce-note').addEventListener('click', async () => {
    const style = await showChoice('How should it look?', NOTE_STYLES, 'Add a note');
    if (style) activeSurface().addNote(style);
  });
  document.getElementById('ce-delete').addEventListener('click', () => {
    if (!activeSurface().deleteSelected()) toast('Nothing selected');
  });

  const input = document.getElementById('ce-photo-input');
  document.getElementById('ce-photo').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const surf = activeSurface();
    Array.from(input.files || []).forEach((file, i) => {
      fileToCompressedDataUrl(file)
        .then(url => surf.addPhotoFromDataUrl(url, i))
        .catch(err => reportError('coverPhoto', err));
    });
    input.value = '';
  });
}

function markPaperSwatches(paperId){
  document.querySelectorAll('#ce-paper-tray .paper-swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.paper === paperId));
}

/* ================= opening ================= */
let opening = false;
function playOpen(){
  opening = true;
  setTimeout(() => { opening = false; }, 2600);
  const book = document.getElementById('cover-book');
  const front = document.getElementById('cover-front');
  const overlay = document.getElementById('cover-overlay');
  idle = false;

  book.style.transition = 'transform .75s cubic-bezier(.3,.9,.3,1)';
  rotX = 4; rotY = -16; applyRotation();

  setTimeout(() => {
    // Drive the hinge angle only. Overwriting `transform` here used to wipe the
    // translateZ that holds the board on the front of the block, so the cover
    // detached from the book as it swung.
    front.style.setProperty('--open', '-152deg');
  }, 720);

  setTimeout(() => {
    overlay.style.transition = 'opacity .55s ease';
    overlay.style.opacity = '0';
  }, 1750);

  setTimeout(() => {
    front.style.transition = 'none';
    front.style.removeProperty('--open');
    book.style.transition = '';
    overlay.style.opacity = '';
    overlay.style.transition = '';
    closeCover();

    let b = getBook(currentYear);
    if (!b.pages.length){ addPage(currentYear, suggestNextLabel(currentYear)); b = getBook(currentYear); }
    onOpenBook && onOpenBook(currentYear, b.pages[0].id);
  }, 2320);
}