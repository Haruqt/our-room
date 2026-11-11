/**
 * Procedural textures for the 3D bookcase, drawn on canvases.
 *
 * Nothing here touches three.js — it only paints pixels — so every texture can
 * be checked on its own. shelf3d.js turns these canvases into materials.
 */

/* ---------- noise ---------- */

function makeNoise(seed = 1){
  // value noise on a hashed lattice, smoothed — enough for wood and plaster
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fade = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash(xi, yi),     b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++){ s += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
  return { noise, fbm };
}

const hex = c => [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function canvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* ---------- wood ---------- */

/**
 * Long-grain wood. The grain runs along the canvas X axis; the 3D code lays
 * that axis along each part's long dimension.
 * Returns { color, bump } canvases painted from the same grain field, so the
 * texture you see and the relief you feel line up.
 */
export function woodCanvases({
  w = 1024, h = 256, seed = 7,
  dark = '#24130a', mid = '#53301a', light = '#8a5a32',
  figure = 1,          // how much the grain wanders: 1 = flat-sawn walnut, ~0.3 = straight floorboard
} = {}){
  const { noise, fbm } = makeNoise(seed);
  const D = hex(dark), M = hex(mid), L = hex(light);

  const color = canvas(w, h), bump = canvas(w, h);
  const cc = color.getContext('2d'), bc = bump.getContext('2d');
  const ci = cc.createImageData(w, h), bi = bc.createImageData(w, h);

  // One sample of the grain: returns [tone 0..1, relief 0..1]
  const field = (nx, ny) => {
    // growth rings: stripes across Y, bent by low-frequency warp so they
    // wander and pinch like real figure
    const warp  = (fbm(nx * 2.2, ny * 1.3, 4) * 7 + fbm(nx * 0.6 + 9, ny * 0.4, 3) * 5) * figure;
    const ring  = ny * 9 + warp;
    const r     = ring - Math.floor(ring);
    // latewood: a soft, broad darker band at the end of each ring, its
    // strength varying along the board so the figure fades in and out
    const vary  = 0.55 + fbm(nx * 3 + 20, ny * 2, 2) * 0.9;
    const late  = smooth(0.4, 0.85, r) * (1 - smooth(0.88, 1.0, r)) * vary;
    // pores and fibres: fine streaks that run along the grain
    const fibre = noise(nx * 9, ny * 210) * 0.55 + noise(nx * 26, ny * 520) * 0.45;
    const pore  = smooth(0.78, 0.95, noise(nx * 60, ny * 380));
    // broad colour drift so a plank isn't one flat tone
    const drift = fbm(nx * 1.4 + 3, ny * 0.9 + 1, 3);
    const t = clamp01(0.58 + (drift - 0.5) * 0.6 - late * 0.26 + (fibre - 0.5) * 0.24 - pore * 0.12);
    const b = clamp01(0.6 - late * 0.22 - pore * 0.4 + (fibre - 0.5) * 0.3);
    return [t, b];
  };

  // Seamless in both directions: near each edge, cross-fade into the field
  // one period earlier, so pixel w meets pixel 0 exactly. Without this every
  // repeat of the texture showed as a hard line across planks and floor.
  const EDGE = 0.18;
  for (let y = 0; y < h; y++){
    const ny = y / h, ay = smooth(1 - EDGE, 1, ny);
    for (let x = 0; x < w; x++){
      const nx = x / w, ax = smooth(1 - EDGE, 1, nx);
      let [t, b] = field(nx, ny);
      if (ax > 0 || ay > 0){
        const fx = ax > 0 ? field(nx - 1, ny) : null;
        const fy = ay > 0 ? field(nx, ny - 1) : null;
        const fxy = ax > 0 && ay > 0 ? field(nx - 1, ny - 1) : null;
        const blend = k => {
          const top = mix(k === 0 ? t : b, fx ? fx[k] : (k === 0 ? t : b), ax);
          const bot = fy ? mix(fy[k], fxy ? fxy[k] : fy[k], ax) : top;
          return mix(top, bot, ay);
        };
        t = blend(0); b = blend(1);
      }

      const i = (y * w + x) * 4;
      const lo = t < 0.5 ? D : M, hi = t < 0.5 ? M : L, k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      ci.data[i]     = mix(lo[0], hi[0], k);
      ci.data[i + 1] = mix(lo[1], hi[1], k);
      ci.data[i + 2] = mix(lo[2], hi[2], k);
      ci.data[i + 3] = 255;
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b * 255;
      bi.data[i + 3] = 255;
    }
  }
  cc.putImageData(ci, 0, 0);
  bc.putImageData(bi, 0, 0);
  return { color, bump };
}

/* ---------- plaster wall ---------- */

export function plasterCanvas({ w = 512, h = 512, seed = 3, base = '#4a382c' } = {}){
  const { fbm, noise } = makeNoise(seed);
  const B = hex(base);
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    // tileable-ish: sample on a torus so repeats don't seam
    const a = x / w * Math.PI * 2, b = y / h * Math.PI * 2;
    const nx = Math.cos(a) * 1.6 + 5, ny = Math.sin(a) * 1.6 + 5;
    const n  = fbm(nx + Math.cos(b) * 1.6, ny + Math.sin(b) * 1.6, 5);
    const fine = noise(x * 0.9, y * 0.9);
    const t = 0.88 + (n - 0.5) * 0.28 + (fine - 0.5) * 0.06;
    const i = (y * w + x) * 4;
    img.data[i] = B[0] * t; img.data[i + 1] = B[1] * t; img.data[i + 2] = B[2] * t; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------- book cloth ---------- */

/** Woven cloth, grey. Used as a bump map so a book's colour stays whatever its cover is. */
export function clothCanvas({ w = 256, h = 256, seed = 11 } = {}){
  const { noise } = makeNoise(seed);
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const warp = Math.sin(x * Math.PI / 2) * 0.5 + 0.5;
    const weft = Math.sin(y * Math.PI / 2) * 0.5 + 0.5;
    const v = 0.5 + (warp * weft - 0.25) * 0.5 + (noise(x * 0.15, y * 0.15) - 0.5) * 0.35;
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp01(v) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------- page edges ---------- */

/** Fine stripes, the stacked edges of paper seen from above. Stripes run along V. */
export function pageEdgeCanvas({ w = 512, h = 32, seed = 5 } = {}){
  const { noise } = makeNoise(seed);
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let x = 0; x < w; x++){
    const sheet = noise(x * 0.9, 0.5);
    const t = 0.86 + sheet * 0.12 - (x % 3 === 0 ? 0.1 : 0);
    for (let y = 0; y < h; y++){
      const i = (y * w + x) * 4;
      img.data[i] = 243 * t; img.data[i + 1] = 232 * t; img.data[i + 2] = 208 * t; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------- a spine ---------- */

const GOLD = '#d8b25e';

/**
 * Paints one spine. Returns { color, orm }:
 *   color — what you see
 *   orm   — G = roughness, B = metalness (three.js reads exactly those channels)
 * The foil is metal in `orm`, so it catches the light like real gold stamping.
 *
 * @param {object} o
 * @param {number} o.w, o.h       canvas size; keep h/w ≈ spine height/width
 * @param {string} o.a, o.b       cover colours
 * @param {string} o.title        printed down the spine
 * @param {string} o.emblem       small mark near the head
 * @param {string} o.foot         small text near the tail
 * @param {string} o.font         CSS font family for the title
 */
export function spineCanvases({ w = 128, h = 1024, a, b, title, emblem = '', foot = '', font = '"Playfair Display", Georgia, serif' }){
  const color = canvas(w, h), orm = canvas(w, h);
  const g = color.getContext('2d'), m = orm.getContext('2d');

  // cloth: colour across the curve, darker at the hinges
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, b); grad.addColorStop(0.5, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  // a little wear and weave
  const { noise } = makeNoise(title.length * 31 + 7);
  const img = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = (y * w + x) * 4;
    const n = 1 + (noise(x * 0.5, y * 0.5) - 0.5) * 0.1 + (noise(x * 0.06, y * 0.012) - 0.5) * 0.12;
    img.data[i] *= n; img.data[i + 1] *= n; img.data[i + 2] *= n;
  }
  g.putImageData(img, 0, 0);

  // roughness/metal base: matte cloth, no metal
  m.fillStyle = 'rgb(0,214,0)'; m.fillRect(0, 0, w, h);

  // everything gold is drawn twice: colour on one canvas, metal on the other
  const both = draw => {
    g.save(); g.fillStyle = GOLD; g.strokeStyle = GOLD; draw(g); g.restore();
    m.save(); m.fillStyle = 'rgb(0,80,255)'; m.strokeStyle = 'rgb(0,80,255)'; draw(m); m.restore();
  };

  // raised bands near head and tail
  const band = y => both(c => { c.fillRect(0, y, w, h * 0.004); c.fillRect(0, y + h * 0.011, w, h * 0.004); });
  band(h * 0.06); band(h * 0.925);

  if (emblem){
    both(c => {
      c.font = `${Math.round(w * 0.36)}px ${font}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(emblem, w / 2, h * 0.13);
    });
  }

  // title, reading top-to-bottom like an English spine
  both(c => {
    c.translate(w / 2, h * 0.47);
    c.rotate(Math.PI / 2);
    let size = Math.round(w * 0.52);
    c.font = `600 ${size}px ${font}`;
    const maxLen = h * 0.58;
    while (c.measureText(title).width > maxLen && size > 10){ size -= 2; c.font = `600 ${size}px ${font}`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if ('letterSpacing' in c) c.letterSpacing = `${Math.round(size * 0.12)}px`;
    c.fillText(title, 0, 0);
  });

  if (foot){
    g.save();
    g.fillStyle = 'rgba(246,232,200,.55)';
    g.font = `500 ${Math.round(w * 0.17)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.translate(w / 2, h * 0.86); g.rotate(Math.PI / 2);
    g.fillText(foot.toUpperCase(), 0, 0);
    g.restore();
  }
  return { color, orm };
}

/* ---------- small things ---------- */

/** A glow sprite: soft warm radial falloff. */
export function glowCanvas(size = 128){
  const c = canvas(size, size), g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0,   'rgba(255,236,190,1)');
  r.addColorStop(0.2, 'rgba(255,190,110,.55)');
  r.addColorStop(0.5, 'rgba(255,150,60,.14)');
  r.addColorStop(1,   'rgba(255,140,50,0)');
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  return c;
}

/** The picture in the frame: a soft painted sunset, no names or dates. */
export function photoCanvas(w = 256, h = 320){
  const c = canvas(w, h), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#f6d3a8'); sky.addColorStop(0.5, '#e99470'); sky.addColorStop(0.85, '#a8545c'); sky.addColorStop(1, '#6a3446');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, w * 0.32);
  sun.addColorStop(0, 'rgba(255,240,205,1)'); sun.addColorStop(0.35, 'rgba(255,224,170,.85)'); sun.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4f2f3d';
  g.beginPath(); g.moveTo(0, h);
  g.lineTo(0, h * 0.7);
  g.quadraticCurveTo(w * 0.25, h * 0.6, w * 0.5, h * 0.68);
  g.quadraticCurveTo(w * 0.75, h * 0.6, w, h * 0.7);
  g.lineTo(w, h); g.fill();
  // two figures, small, side by side on the hill
  g.fillStyle = '#2e1b25';
  const fig = (x, s) => {
    g.beginPath(); g.arc(x, h * 0.6 - 26 * s, 6 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 7 * s, h * 0.66); g.quadraticCurveTo(x, h * 0.6 - 38 * s, x + 7 * s, h * 0.66); g.fill();
  };
  fig(w * 0.46, 1); fig(w * 0.54, 0.92);
  return c;
}

/** Variegated snake-plant leaf: dark green bands with a yellow margin. */
export function leafCanvas(w = 64, h = 256, seed = 2){
  const { noise } = makeNoise(seed);
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const edge = Math.min(x, w - 1 - x) / (w / 2);
    const bands = Math.sin(y * 0.22 + noise(x * 0.2, y * 0.05) * 6) * 0.5 + 0.5;
    let r = 52 + bands * 30, gg = 92 + bands * 40, b = 50 + bands * 18;
    if (edge < 0.14){ r = 196; gg = 182; b = 92; }
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * A soft dark-to-clear gradient, used as fake ambient occlusion: the shading
 * that collects where a shelf meets the back panel or a side. Black at the
 * bottom of the canvas, transparent at the top.
 */
export function aoCanvas(size = 128){
  const c = canvas(4, size), g = c.getContext('2d');
  const r = g.createLinearGradient(0, size, 0, 0);
  r.addColorStop(0, 'rgba(0,0,0,1)');
  r.addColorStop(0.25, 'rgba(0,0,0,.45)');
  r.addColorStop(0.6, 'rgba(0,0,0,.12)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 4, size);
  return c;
}