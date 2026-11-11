/**
 * Builds the bookcase: a wooden frame, a back panel, planks, books standing on
 * them, and a few things people actually keep on a shelf.
 *
 * Pure DOM, no imports — bookshelf-ui.js hands it the data and a click handler,
 * which also lets the layout be tested on its own.
 */

export const PER_SHELF = 8;     // books per plank
export const MIN_SHELVES = 3;   // a bookcase never looks half-built

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* ---------- things that live on the shelf ---------- */

const PLANT = `
<svg class="sh-decor plant" viewBox="0 0 90 150" width="90" height="150" aria-hidden="true">
  <defs>
    <linearGradient id="potg" x1="0" x2="1">
      <stop offset="0" stop-color="#b9683f"/><stop offset=".55" stop-color="#d98a5a"/><stop offset="1" stop-color="#8f4a2a"/>
    </linearGradient>
    <linearGradient id="leafg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6f9a62"/><stop offset="1" stop-color="#34592f"/>
    </linearGradient>
  </defs>
  <g fill="url(#leafg)" stroke="#27441f" stroke-width=".6">
    <path d="M45 96 C 20 84 12 52 26 26 C 40 40 48 66 45 96Z"/>
    <path d="M45 96 C 70 82 80 50 66 22 C 52 38 42 64 45 96Z"/>
    <path d="M45 98 C 34 70 36 38 46 8 C 58 36 58 70 45 98Z"/>
    <path d="M45 98 C 22 92 6 78 4 58 C 24 60 40 76 45 98Z"/>
    <path d="M45 98 C 68 92 84 78 86 58 C 66 60 50 76 45 98Z"/>
  </g>
  <g stroke="#27441f" stroke-width=".7" fill="none" opacity=".55">
    <path d="M45 96 C 36 70 32 50 26 26"/><path d="M45 96 C 54 70 60 48 66 22"/><path d="M45 98 L46 8"/>
  </g>
  <path d="M22 100 H68 L62 146 Q45 150 28 146Z" fill="url(#potg)" stroke="#6e3a20" stroke-width=".8"/>
  <rect x="19" y="94" width="52" height="10" rx="2" fill="#c9774a" stroke="#6e3a20" stroke-width=".8"/>
  <ellipse cx="45" cy="95.5" rx="23" ry="2.6" fill="#3a2616"/>
</svg>`;

const FRAME = `
<svg class="sh-decor frame" viewBox="0 0 96 110" width="96" height="110" aria-hidden="true">
  <defs>
    <linearGradient id="frg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a5a35"/><stop offset=".5" stop-color="#5e3a20"/><stop offset="1" stop-color="#3d2413"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3c9a0"/><stop offset=".55" stop-color="#e58f6b"/><stop offset="1" stop-color="#9c4f57"/>
    </linearGradient>
  </defs>
  <rect x="26" y="102" width="44" height="8" rx="2" fill="#3d2413"/>
  <rect x="6" y="2" width="84" height="102" rx="2.5" fill="url(#frg)"/>
  <rect x="6" y="2" width="84" height="102" rx="2.5" fill="none" stroke="#c79a62" stroke-opacity=".5" stroke-width=".8"/>
  <rect x="14" y="10" width="68" height="86" fill="#f1e6cf"/>
  <rect x="20" y="16" width="56" height="64" fill="url(#sky)"/>
  <circle cx="48" cy="50" r="10" fill="#ffe7b8" opacity=".92"/>
  <path d="M20 80 L20 62 Q34 50 48 60 Q62 50 76 62 L76 80Z" fill="#5b3a45"/>
  <path d="M48 74 c-7-6-11-10-11-14 a5.5 5.5 0 0 1 11-1 a5.5 5.5 0 0 1 11 1 c0 4-4 8-11 14z" fill="#f4c7c3" opacity=".95" transform="translate(0 -3)"/>
</svg>`;

const CANDLE = `
<div class="sh-decor candle" aria-hidden="true">
  <span class="flame-glow"></span>
  <span class="flame"></span>
  <span class="wick"></span>
  <span class="jar"><span class="wax"></span><span class="label"></span></span>
</div>`;

const FLAT_STACK = `
<div class="sh-decor flat-stack" aria-hidden="true">
  <span style="--c:#40525c; --w:104px; --o:0px"></span>
  <span style="--c:#7b3f3f; --w:94px;  --o:7px"></span>
  <span style="--c:#6b5533; --w:100px; --o:-4px"></span>
</div>`;

const BOOKEND = `<span class="sh-bookend" aria-hidden="true"></span>`;

const DECOR = [
  PLANT,
  FRAME,
  FLAT_STACK + CANDLE,
];

/* ---------- one book ---------- */

function buildBook(b, i, onPick){
  const { year, cover, count, palette: pal } = b;

  // Vary height and thickness the way a real run of books varies. Derived from
  // the year, so a book keeps its size between visits instead of reshuffling.
  const width  = 30 + ((year * 7 + count * 3) % 14) + Math.min(14, Math.round(count * 0.9));
  const height = 158 + ((year * 13) % 34);

  const el = document.createElement('div');
  el.className = 'book3d';
  el.dataset.year = year;
  el.dataset.tip = `${cover.title || year} · ${count} page${count === 1 ? '' : 's'}`;
  el.style.setProperty('--bw', width + 'px');
  el.style.setProperty('--bh', height + 'px');
  el.style.setProperty('--tilt', ((year % 5) - 2) * 0.12 + 'deg');

  const hasSpineArt = Boolean(cover.spineImage);
  const spineBg = hasSpineArt
    ? `url(${cover.spineImage}) center/100% 100% no-repeat, linear-gradient(90deg, ${pal.a}, ${pal.b})`
    : `linear-gradient(90deg, ${pal.a}, ${pal.b} 70%, ${pal.a})`;
  const frontBg = cover.frontImage
    ? `url(${cover.frontImage}) center/100% 100% no-repeat, linear-gradient(120deg, ${pal.b}, ${pal.a})`
    : `linear-gradient(120deg, ${pal.b}, ${pal.a})`;

  el.innerHTML = `
    <div class="b3-inner">
      <div class="b3-spine${hasSpineArt ? ' has-art' : ''}">
        <div class="b3-skin" style="background:${spineBg}"></div>
        <span class="b3-band top"></span>
        <span class="b3-band bottom"></span>
        ${hasSpineArt ? '' : `
          <span class="spine-em">${esc(cover.emblem || '❦')}</span>
          <span class="spine-year">${esc(cover.title || year)}</span>
          <span class="spine-count">${count} pg</span>`}
        <span class="b3-sheen"></span>
      </div>
      <div class="b3-front"><div class="b3-skin" style="background:${frontBg}"></div></div>
      <div class="b3-top"></div>
    </div>`;

  el.addEventListener('click', () => onPick(el, { a:pal.a, b:pal.b }, year));
  return el;
}

/* ---------- the whole bookcase ---------- */

/**
 * @param {HTMLElement} mount   where the bookcase goes (emptied first)
 * @param {Array} books         [{ year, cover, count, palette:{a,b} }]
 * @param {(el:HTMLElement, pal:{a,b}, year:number)=>void} onPick
 */
export function buildBookcase(mount, books, onPick){
  mount.innerHTML = '';

  const shelves = Math.max(MIN_SHELVES, Math.ceil(books.length / PER_SHELF));

  const rows = [];
  for (let s = 0; s < shelves; s++){
    const row = document.createElement('div');
    row.className = 'sh-row';
    row.innerHTML = `<div class="sh-books"></div><div class="sh-plank"></div>`;
    rows.push(row);

    const shelf = row.querySelector('.sh-books');
    const slice = books.slice(s * PER_SHELF, (s + 1) * PER_SHELF);
    slice.forEach((b, i) => shelf.appendChild(buildBook(b, s * PER_SHELF + i, onPick)));

    // a half-empty shelf gets a bookend, so the last book isn't just floating
    if (slice.length){
      const be = document.createElement('div');
      be.innerHTML = BOOKEND;
      shelf.appendChild(be.firstElementChild);
    }

    // whatever room is left holds an ornament, pushed to the right
    if (DECOR[s] && slice.length < PER_SHELF){
      const spacer = document.createElement('div');
      spacer.className = 'sh-spacer';
      shelf.appendChild(spacer);
      const d = document.createElement('div');
      d.className = 'sh-decor-wrap';
      d.innerHTML = DECOR[s];
      shelf.appendChild(d);
    }
  }

  if (!books.length){
    const note = document.createElement('p');
    note.className = 'sh-empty';
    note.textContent = 'Nothing here yet — start your first year below.';
    rows[1].querySelector('.sh-books').prepend(note);
  }

  const frame = document.createElement('div');
  frame.className = 'bookcase';
  frame.innerHTML = `
    <div class="bc-crown"><span class="bc-crown-top"></span></div>
    <div class="bc-frame">
      <div class="bc-side left"></div>
      <div class="bc-interior"><div class="bc-rows"></div><span class="bc-light"></span></div>
      <div class="bc-side right"></div>
    </div>
    <div class="bc-base"><span class="bc-foot left"></span><span class="bc-foot right"></span></div>
    <div class="bc-floor"></div>`;
  const holder = frame.querySelector('.bc-rows');
  rows.forEach(r => holder.appendChild(r));
  mount.appendChild(frame);
  return frame;
}

/**
 * Scale the whole case to fit the space it has. Done with `zoom` rather than a
 * transform so layout shrinks with it and nothing is left overflowing.
 */
export function fitBookcase(stage, frame){
  if (!stage || !frame) return;
  frame.style.zoom = 1;
  const availW = stage.clientWidth  - 40;
  const availH = stage.clientHeight - 24;
  const w = frame.offsetWidth, h = frame.offsetHeight;
  if (!w || !h) return;
  const z = Math.min(1, availW / w, availH / h);
  frame.style.zoom = z.toFixed(3);
}