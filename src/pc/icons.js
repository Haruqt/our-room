/**
 * The computer's icons, drawn as small SVGs so they look the same on every
 * device (emoji differ between Windows, Mac and phones).
 */

const svg = (body, vb = '0 0 48 48') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  folder: svg(`
    <defs><linearGradient id="gf1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#f2b33d"/></linearGradient>
    <linearGradient id="gf2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe49a"/><stop offset="1" stop-color="#f7c451"/></linearGradient></defs>
    <path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v3H4z" fill="url(#gf1)"/>
    <path d="M4 17h40v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="url(#gf2)"/>
    <path d="M4 17h40v2H4z" fill="#fff" opacity=".35"/>`),

  folderPhotos: svg(`
    <defs><linearGradient id="gp1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#f2b33d"/></linearGradient>
    <linearGradient id="gp2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe49a"/><stop offset="1" stop-color="#f7c451"/></linearGradient></defs>
    <path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v3H4z" fill="url(#gp1)"/>
    <rect x="12" y="11" width="24" height="17" rx="1.5" fill="#fff" transform="rotate(-6 24 20)"/>
    <rect x="14" y="13" width="20" height="12" fill="#7fb6e8" transform="rotate(-6 24 20)"/>
    <path d="M4 19h40v18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="url(#gp2)"/>`),

  text: svg(`
    <path d="M11 4h18l10 10v28a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fff" stroke="#b9c3d1" stroke-width="1.2"/>
    <path d="M29 4v8a2 2 0 0 0 2 2h8" fill="#e8edf3" stroke="#b9c3d1" stroke-width="1.2"/>
    <path d="M15 21h18M15 26h18M15 31h18M15 36h11" stroke="#7b8aa0" stroke-width="2" stroke-linecap="round"/>`),

  photo: svg(`
    <rect x="5" y="9" width="38" height="30" rx="3" fill="#fff" stroke="#b9c3d1" stroke-width="1.2"/>
    <rect x="9" y="13" width="30" height="22" rx="1.5" fill="#9cc9f2"/>
    <circle cx="31" cy="19" r="3" fill="#ffe27a"/>
    <path d="M9 35l9-10 6 6 5-4 10 8z" fill="#3f8f5a"/>`),

  thispc: svg(`
    <defs><linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fb3ff"/><stop offset="1" stop-color="#2a6fd6"/></linearGradient></defs>
    <rect x="5" y="7" width="38" height="26" rx="3" fill="#2b3442"/>
    <rect x="7.5" y="9.5" width="33" height="21" rx="1.5" fill="url(#gm)"/>
    <path d="M19 33h10l2 6H17z" fill="#8a96a8"/><rect x="13" y="39" width="22" height="3" rx="1.5" fill="#6d7a8e"/>`),

  binEmpty: svg(`
    <path d="M13 14h22l-2 27a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" fill="#e6edf5" stroke="#9fb0c6" stroke-width="1.4"/>
    <path d="M10 12h28" stroke="#9fb0c6" stroke-width="3" stroke-linecap="round"/>
    <path d="M20 9h8" stroke="#9fb0c6" stroke-width="3" stroke-linecap="round"/>
    <path d="M20 20l1 18M28 20l-1 18M24 20v18" stroke="#b9c7d8" stroke-width="1.6"/>`),

  binFull: svg(`
    <path d="M13 16h22l-2 25a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" fill="#e6edf5" stroke="#9fb0c6" stroke-width="1.4"/>
    <path d="M14 15c2-6 6-3 8-7 3 5 6 0 9 4 2-2 4 0 4 3z" fill="#fff" stroke="#c4cfdc" stroke-width="1"/>
    <rect x="17" y="8" width="9" height="11" rx="1" fill="#fff" stroke="#b9c3d1" transform="rotate(-14 21 13)"/>
    <path d="M10 16h28" stroke="#9fb0c6" stroke-width="3" stroke-linecap="round"/>
    <path d="M20 22l1 16M28 22l-1 16M24 22v16" stroke="#b9c7d8" stroke-width="1.6"/>`),

  explorer: svg(`
    <defs><linearGradient id="ge1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#f0ac2e"/></linearGradient></defs>
    <path d="M4 12a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="url(#ge1)"/>
    <rect x="4" y="19" width="40" height="5" fill="#3d8bfd"/>`),

  browser: svg(`
    <defs><radialGradient id="gb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#2563eb"/></radialGradient></defs>
    <circle cx="24" cy="24" r="19" fill="url(#gb)"/>
    <path d="M24 5c6 5 8 12 8 19s-2 14-8 19c-6-5-8-12-8-19s2-14 8-19z" fill="none" stroke="#e0f2fe" stroke-width="2" opacity=".85"/>
    <path d="M6 24h36M9 15h30M9 33h30" stroke="#e0f2fe" stroke-width="2" opacity=".85"/>`),

  terminal: svg(`
    <rect x="4" y="8" width="40" height="32" rx="4" fill="#1b1f27" stroke="#3a4352" stroke-width="1.4"/>
    <rect x="4" y="8" width="40" height="6" rx="3" fill="#2b313c"/>
    <path d="M11 21l6 5-6 5" fill="none" stroke="#e6edf3" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 32h12" stroke="#e6edf3" stroke-width="2.6" stroke-linecap="round"/>`),

  notepad: svg(`
    <rect x="9" y="7" width="30" height="36" rx="3" fill="#fff" stroke="#9fb0c6" stroke-width="1.4"/>
    <rect x="9" y="7" width="30" height="8" rx="3" fill="#5aa1ef"/>
    <path d="M15 22h18M15 27h18M15 32h12" stroke="#7b8aa0" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 33l9-9 3 3-9 9-4 1z" fill="#f5b942" stroke="#b07a10" stroke-width="1"/>`),

  settings: svg(`
    <circle cx="24" cy="24" r="17" fill="#5b6b82"/>
    <path d="M24 10l3 4 5-1 1 5 4 3-3 3 3 4-4 3-1 5-5-1-3 4-3-4-5 1-1-5-4-3 3-4-3-3 4-3 1-5 5 1z" fill="#c9d3e0"/>
    <circle cx="24" cy="24" r="5" fill="#5b6b82"/>`),

  photos: svg(`
    <defs><linearGradient id="gph" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
    <rect x="5" y="8" width="38" height="32" rx="6" fill="url(#gph)"/>
    <circle cx="32" cy="18" r="4" fill="#fde68a"/>
    <path d="M5 34l11-12 8 8 6-5 13 10v1a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6z" fill="#ffffff" opacity=".9"/>`),

  music: svg(`
    <defs><linearGradient id="gmu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
    <rect x="5" y="5" width="38" height="38" rx="9" fill="url(#gmu)"/>
    <path d="M20 31V15l14-3v16" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="17" cy="31" r="4" fill="#fff"/><circle cx="31" cy="28" r="4" fill="#fff"/>`),

  drive: svg(`
    <rect x="5" y="16" width="38" height="18" rx="3" fill="#cfd8e3" stroke="#8d9bb0" stroke-width="1.2"/>
    <rect x="5" y="16" width="38" height="6" rx="3" fill="#e6ecf3"/>
    <circle cx="36" cy="28" r="2" fill="#22c55e"/>
    <path d="M10 28h14" stroke="#8d9bb0" stroke-width="2" stroke-linecap="round"/>`),

  cloud: svg(`
    <path d="M14 36a9 9 0 0 1-1-18 12 12 0 0 1 23 3 7.5 7.5 0 0 1-1 15z" fill="#93c5fd" stroke="#3b82f6" stroke-width="1.4"/>`),

  desktop: svg(`
    <rect x="5" y="8" width="38" height="26" rx="3" fill="#3b82f6"/>
    <rect x="5" y="30" width="38" height="4" fill="#1e3a8a" opacity=".6"/>
    <rect x="17" y="36" width="14" height="4" rx="1" fill="#6b7a90"/>`),

  docs: svg(`
    <path d="M9 6h20l10 10v26a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="#60a5fa"/>
    <path d="M29 6v8a2 2 0 0 0 2 2h8" fill="#bfdbfe"/>
    <path d="M13 24h20M13 29h20M13 34h14" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),

  pictures: svg(`
    <rect x="6" y="8" width="36" height="32" rx="4" fill="#38bdf8"/>
    <circle cx="31" cy="18" r="4" fill="#fef08a"/>
    <path d="M6 34l11-12 8 8 6-5 11 9v2a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#0f766e"/>`),

  heart: svg(`<path d="M24 41s-15-9.2-15-20a8 8 0 0 1 15-4 8 8 0 0 1 15 4c0 10.8-15 20-15 20z" fill="#f43f5e"/>`),

  power: svg(`<path d="M24 8v14" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M15 13a14 14 0 1 0 18 0" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`),
  back: svg(`<path d="M20 12L8 24l12 12M9 24h31" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  search: svg(`<circle cx="21" cy="21" r="12" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M30 30l10 10" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`),
  wifi: svg(`<path d="M6 19a26 26 0 0 1 36 0M12 25a17 17 0 0 1 24 0M18 31a8 8 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="37" r="3" fill="currentColor"/>`),
  speaker: svg(`<path d="M8 19h8l10-8v26l-10-8H8z" fill="currentColor"/><path d="M32 17a10 10 0 0 1 0 14M36 12a17 17 0 0 1 0 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`),
  up: svg(`<path d="M24 38V10M12 22l12-12 12 12" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  left: svg(`<path d="M30 10L16 24l14 14" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  right: svg(`<path d="M18 10l14 14-14 14" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  reload: svg(`<path d="M38 24a14 14 0 1 1-4-10" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><path d="M36 6v9h-9" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  plus: svg(`<path d="M24 10v28M10 24h28" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>`),
  trash: svg(`<path d="M12 14h24l-2 26a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 13h32M19 8h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  rename: svg(`<path d="M10 38l4-12 18-18 8 8-18 18z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M28 12l8 8" stroke="currentColor" stroke-width="3"/>`),
  upload: svg(`<path d="M24 32V8M14 18l10-10 10 10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 32v6a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3v-6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`),
  restore: svg(`<path d="M10 24a14 14 0 1 0 4-10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M12 6v9h9" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  grid: svg(`<rect x="8" y="8" width="13" height="13" rx="2" fill="currentColor"/><rect x="27" y="8" width="13" height="13" rx="2" fill="currentColor"/><rect x="8" y="27" width="13" height="13" rx="2" fill="currentColor"/><rect x="27" y="27" width="13" height="13" rx="2" fill="currentColor"/>`),
  list: svg(`<path d="M8 12h32M8 24h32M8 36h32" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>`),
  moon: svg(`<path d="M30 6a18 18 0 1 0 12 26A15 15 0 0 1 30 6z" fill="currentColor"/>`),
  restart: svg(`<path d="M38 24a14 14 0 1 1-4-10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M36 6v9h-9" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  star: svg(`<path d="M24 6l5.5 11.6 12.5 1.6-9.2 8.7 2.4 12.5L24 34.3 12.8 40.4l2.4-12.5L6 19.2l12.5-1.6z" fill="currentColor"/>`),
};

/** The start button mark: four tiles with a heart cut into the middle. */
export const START_MARK = svg(`
  <defs><linearGradient id="gsm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#3a7bf0"/></linearGradient></defs>
  <rect x="6" y="6" width="17" height="17" rx="4" fill="url(#gsm)"/>
  <rect x="25" y="6" width="17" height="17" rx="4" fill="url(#gsm)"/>
  <rect x="6" y="25" width="17" height="17" rx="4" fill="url(#gsm)"/>
  <rect x="25" y="25" width="17" height="17" rx="4" fill="url(#gsm)"/>
  <path d="M24 31s-6-3.6-6-7.6a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 4-6 7.6-6 7.6z" fill="#ff5a7a" stroke="#0b1220" stroke-width="1.4"/>`);

// Gradient ids must be unique on the page: an icon inside a hidden window
// would otherwise blank out every other copy that points at its gradient.
let uid = 0;
function uniq(markup){
  const n = ++uid;
  return markup.replace(/id="(\w+)"/g, `id="$1_${n}"`).replace(/url\(#(\w+)\)/g, `url(#$1_${n})`);
}

/** An icon as markup, ready for innerHTML. */
export const icon = name => `<span class="os-ic">${uniq(ICONS[name] || ICONS.text)}</span>`;
export const startMark = () => uniq(START_MARK);