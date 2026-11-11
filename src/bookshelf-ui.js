import { getYears, createBook, getBook, getCover, addPage, suggestNextLabel, COVER_MATERIALS } from './books.js';
import { openEditor } from './editor.js';
import { initCoverUI, openCover } from './cover-ui.js';
import { showPrompt, showAlert, toast } from './ui.js';
import { buildBookcase, fitBookcase } from './shelf-render.js';
import { createShelf3D } from './shelf3d.js';
import { reportError } from './errors.js';

let onExitToRoom = null;

export function initBookshelfUI({ onExit }){
  onExitToRoom = onExit;

  const leave = () => { closeBookshelf(); onExitToRoom && onExitToRoom(); };
  document.getElementById('bookshelf-close').addEventListener('click', leave);
  document.getElementById('shelf-back').addEventListener('click', leave);

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' &&
        document.getElementById('bookshelf-overlay').classList.contains('show')) leave();
  });

  initCoverUI({
    onOpen: (year, pageId) => openEditor(year, pageId, { onExitToShelf: () => openCover(year) }),
    onBack: () => openBookshelf()
  });

  document.getElementById('add-book-btn').addEventListener('click', async () => {
    const existing = getYears();
    let y = new Date().getFullYear();
    while (existing.includes(y)) y++;
    const input = await showPrompt('Which year is this book for?', String(y), 'New book');
    if (!input) return;
    const parsed = parseInt(input, 10);
    if (isNaN(parsed) || parsed < 1900 || parsed > 2200){
      await showAlert("That doesn't look like a year.", 'Hmm');
      return;
    }
    createBook(parsed);
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'book-new' }));
    renderShelf();
    toast(`${parsed} added to the shelf`);
  });
}

export function openBookshelf(){
  document.getElementById('bookshelf-overlay').classList.add('show');
  renderShelf();
}

function closeBookshelf(){
  document.getElementById('bookshelf-overlay').classList.remove('show');
  if (shelf3d) shelf3d.hide();
}

let bookcaseEl = null;
let shelf3d = null;          // the real 3D bookcase, when WebGL is available
let shelf3dFailed = false;   // after one failure, stay on the CSS bookcase

function shelfBooks(){
  return getYears().map((year, i) => {
    const cover = getCover(year);
    const mat = COVER_MATERIALS.find(m => m.id === cover.material) || COVER_MATERIALS[i % COVER_MATERIALS.length];
    const book = getBook(year);
    return { year, cover, count: book ? book.pages.length : 0, palette: { a:mat.a, b:mat.b } };
  });
}

function showTip(info){
  const tip = document.getElementById('shelf-tip');
  if (!tip) return;
  if (!info){ tip.classList.remove('show'); return; }
  tip.textContent = info.text;
  tip.style.left = info.x + 'px';
  tip.style.top = info.y + 'px';
  tip.classList.add('show');
}

function ensure3D(){
  if (shelf3d || shelf3dFailed) return shelf3d;
  try {
    shelf3d = createShelf3D(document.getElementById('bookshelf-overlay'), {
      onPick: openBookAnimation,
      onHover: showTip,
    });
  } catch(e){
    // No WebGL here (old GPU, blocked drivers): the flat bookcase still works,
    // so this is a note in the console, not an error in your face.
    shelf3dFailed = true;
    console.warn('3D shelf unavailable — using the flat shelf:', e);
  }
  return shelf3d;
}

/** Big year buttons under the shelf: book spines are too thin to tap on a phone. */
function renderYearButtons(books){
  const row = document.getElementById('shelf-years');
  if (!row) return;
  row.innerHTML = '';
  books.forEach(bk => {
    const b = document.createElement('button');
    b.className = 'shelf-year';
    b.style.setProperty('--a', bk.palette.a);
    b.style.setProperty('--b', bk.palette.b);
    b.innerHTML = `<span class="sy-year">${bk.year}</span><span class="sy-count">${bk.count} page${bk.count === 1 ? '' : 's'}</span>`;
    b.addEventListener('click', () => {
      if (shelf3d) shelf3d.pickYear(bk.year);
      else {
        const el = document.querySelector(`#bookcase-mount [data-year="${bk.year}"]`);
        if (el) el.click(); else openCoverDirect(bk.year);
      }
    });
    row.appendChild(b);
  });
}

function openCoverDirect(year){
  document.getElementById('bookshelf-overlay').classList.remove('show');
  if (shelf3d) shelf3d.hide();
  if (!getBook(year)) createBook(year);
  openCover(year);
}

function renderShelf(){
  const overlay = document.getElementById('bookshelf-overlay');
  const books = shelfBooks();
  renderYearButtons(books);
  const s3 = ensure3D();
  overlay.classList.toggle('is-3d', Boolean(s3));
  if (s3){
    s3.show(books).catch(e => { reportError('3D shelf', e); });
    document.getElementById('bookcase-mount').innerHTML = '';
    bookcaseEl = null;
    return;
  }
  bookcaseEl = buildBookcase(document.getElementById('bookcase-mount'), books, openBookAnimation);
  fitShelf();
}

function fitShelf(){
  if (bookcaseEl) fitBookcase(document.getElementById('shelf-stage'), bookcaseEl);
}
window.addEventListener('resize', () => {
  if (document.getElementById('bookshelf-overlay')?.classList.contains('show')) fitShelf();
});

/**
 * Plays the cover-swings-open transition, anchored to the clicked book,
 * then hands off to the editor.
 */
function openBookAnimation(bookEl, pal, year){
  const stage  = document.getElementById('book-open-stage');
  const wrap   = document.getElementById('boc-wrap');
  const cover  = document.getElementById('boc-cover');
  const rect   = bookEl.getBoundingClientRect();

  // Start: sitting exactly where the spine is on the shelf
  wrap.style.left   = rect.left + 'px';
  wrap.style.top    = rect.top + 'px';
  wrap.style.width  = rect.width + 'px';
  wrap.style.height = rect.height + 'px';
  wrap.style.transition = 'none';
  wrap.style.transform = 'none';

  // show whatever this book's front actually looks like, not a plain slab
  const art = getCover(year);
  const grad = `linear-gradient(100deg, ${pal.a} 0%, ${pal.b} 62%, ${pal.a} 100%)`;
  if (art.frontImage){
    cover.style.backgroundImage = `url(${art.frontImage}), ${grad}`;
    cover.style.backgroundSize = '100% 100%, cover';
  } else {
    cover.style.backgroundImage = grad;
    cover.style.backgroundSize = 'cover';
  }
  cover.style.transition = 'none';
  cover.style.transform = 'rotateY(0deg)';
  cover.querySelector('.boc-year').textContent = '';
  cover.classList.toggle('has-art', !!art.frontImage);

  stage.classList.add('show');
  bookEl.style.visibility = 'hidden';
  void wrap.offsetWidth; // force reflow

  // Phase 1 — the book lifts off the shelf and grows to book size, centered
  const targetW = Math.min(window.innerWidth * 0.30, 330);
  const targetH = targetW * 1.32;
  const targetL = window.innerWidth / 2 - targetW / 2;
  const targetT = window.innerHeight / 2 - targetH / 2;

  requestAnimationFrame(() => {
    stage.classList.add('dim');
    wrap.style.transition = 'left .95s cubic-bezier(.3,.9,.3,1), top .95s cubic-bezier(.3,.9,.3,1), width .95s cubic-bezier(.3,.9,.3,1), height .95s cubic-bezier(.3,.9,.3,1)';
    wrap.style.left   = targetL + 'px';
    wrap.style.top    = targetT + 'px';
    wrap.style.width  = targetW + 'px';
    wrap.style.height = targetH + 'px';
    if (!art.frontImage) cover.querySelector('.boc-year').textContent = art.title || year;
  });

  // Phase 2 — hand off to the 3D cover view, which owns the opening swing
  setTimeout(() => {
    stage.style.transition = 'opacity .55s ease';
    stage.style.opacity = '0';
  }, 1050);

  setTimeout(() => {
    stage.classList.remove('show','dim');
    stage.style.opacity = '';
    stage.style.transition = '';
    bookEl.style.visibility = '';
    document.getElementById('bookshelf-overlay').classList.remove('show');
    if (shelf3d) shelf3d.hide();
    if (!getBook(year)) createBook(year);
    openCover(year);
  }, 1620);
}