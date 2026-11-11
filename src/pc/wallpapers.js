/**
 * Desktop backgrounds. The built-in ones are painted in code (no image files
 * to ship), once, then reused as pictures.
 */
import { wallpaperSrc, snapshot, ensurePhotoSrc } from '../store.js';

const W = 1920, H = 1080;

function rand(seed){
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function petals(g, cx, cy, n, r, colors, rot = 0){
  for (let i = 0; i < n; i++){
    const a = rot + (i / n) * Math.PI * 2;
    g.save();
    g.translate(cx, cy); g.rotate(a);
    const grad = g.createLinearGradient(0, 0, r, 0);
    grad.addColorStop(0, colors[i % colors.length][0]);
    grad.addColorStop(1, colors[i % colors.length][1]);
    g.fillStyle = grad;
    g.globalAlpha = 0.78;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(r * 0.35, -r * 0.42, r * 0.95, -r * 0.3, r, 0);
    g.bezierCurveTo(r * 0.95, r * 0.3, r * 0.35, r * 0.42, 0, 0);
    g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
}

function glow(g, x, y, r, color, a = 1){
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a; g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
}

function hills(g, baseY, amp, color, seed, steps = 7){
  const r = rand(seed);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, H);
  let px = 0, py = baseY;
  g.lineTo(0, py);
  for (let i = 1; i <= steps; i++){
    const x = (i / steps) * W, y = baseY - r() * amp;
    g.quadraticCurveTo((px + x) / 2, py - amp * 0.4 * r(), x, y);
    px = x; py = y;
  }
  g.lineTo(W, H); g.closePath(); g.fill();
}

function grain(g, amount = 10, seed = 7){
  const r = rand(seed);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 9000; i++){
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.fillRect(r() * W, r() * H, 1.4, 1.4);
  }
  g.globalAlpha = 1;
}

const PRESETS = {
  bloom: { name: 'Bloom', paint(g){
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b1730'); bg.addColorStop(1, '#1b2550');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    glow(g, W * 0.55, H * 0.55, 700, 'rgba(80,140,255,.45)');
    petals(g, W * 0.55, H * 0.56, 7, 520, [['#5fa8ff', '#1d4fd8'], ['#7c6cff', '#2b3fd1'], ['#9fd2ff', '#3a6df0']], 0.3);
    petals(g, W * 0.55, H * 0.56, 7, 330, [['#cfe6ff', '#4b7cf5'], ['#a99bff', '#4b52e0']], 0.75);
    glow(g, W * 0.55, H * 0.56, 120, 'rgba(255,255,255,.7)');
  } },
  rose: { name: 'Rose', paint(g){
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#ffd9e2'); bg.addColorStop(1, '#ffb8c9');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    glow(g, W * 0.5, H * 0.52, 700, 'rgba(255,120,160,.35)');
    petals(g, W * 0.5, H * 0.54, 8, 520, [['#ff8fab', '#e0466f'], ['#ffb3c6', '#f06292'], ['#ffc2a8', '#f0758a']], 0.2);
    petals(g, W * 0.5, H * 0.54, 8, 300, [['#ffe0ea', '#ff7aa2'], ['#fff0f4', '#f58fb0']], 0.6);
    glow(g, W * 0.5, H * 0.54, 110, 'rgba(255,255,255,.85)');
  } },
  dusk: { name: 'Dusk', paint(g){
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#24123f'); sky.addColorStop(0.45, '#8c3d6b'); sky.addColorStop(0.75, '#f28b5b'); sky.addColorStop(1, '#ffd08a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    glow(g, W * 0.62, H * 0.66, 260, 'rgba(255,230,170,.95)');
    hills(g, H * 0.72, 160, '#5b2a52', 3);
    hills(g, H * 0.8, 120, '#3c1d43', 9);
    hills(g, H * 0.9, 90, '#22122e', 21);
  } },
  aurora: { name: 'Aurora', paint(g){
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#020812'); sky.addColorStop(1, '#0b2233');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const r = rand(42);
    for (let i = 0; i < 380; i++){ g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.fillRect(r() * W, r() * H * 0.7, r() * 2 + 0.5, r() * 2 + 0.5); }
    g.globalCompositeOperation = 'lighter';
    [['rgba(60,255,170,.22)', 0.32], ['rgba(70,200,255,.18)', 0.42], ['rgba(170,90,255,.14)', 0.26]].forEach(([c, y], k) => {
      for (let j = 0; j < 40; j++){
        g.strokeStyle = c; g.lineWidth = 40 - j * 0.8;
        g.beginPath();
        for (let x = 0; x <= W; x += 40){
          const yy = H * y + Math.sin(x / 260 + k * 2 + j * 0.03) * 90 + Math.sin(x / 90 + k) * 18 + j * 2.4;
          x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy);
        }
        g.globalAlpha = 0.05; g.stroke();
      }
    });
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    hills(g, H * 0.86, 110, '#03070c', 5);
  } },
  ocean: { name: 'Ocean', paint(g){
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#9fe3ff'); bg.addColorStop(0.5, '#2bb3c9'); bg.addColorStop(1, '#0a4f73');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    glow(g, W * 0.3, H * 0.18, 420, 'rgba(255,255,255,.55)');
    for (let i = 0; i < 9; i++){
      g.fillStyle = `rgba(255,255,255,${0.05 + i * 0.012})`;
      g.beginPath(); g.moveTo(0, H);
      const base = H * 0.45 + i * 70;
      for (let x = 0; x <= W; x += 30) g.lineTo(x, base + Math.sin(x / 180 + i) * 26 + Math.sin(x / 60 + i * 3) * 6);
      g.lineTo(W, H); g.fill();
    }
  } },
  meadow: { name: 'Meadow', paint(g){
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#bfe6ff'); sky.addColorStop(1, '#fff2d6');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    glow(g, W * 0.78, H * 0.24, 230, 'rgba(255,243,200,1)');
    hills(g, H * 0.62, 120, '#a7d58f', 4);
    hills(g, H * 0.72, 120, '#7cc06b', 13);
    hills(g, H * 0.84, 90, '#4f9e57', 31);
  } },
  graphite: { name: 'Graphite', paint(g){
    const bg = g.createRadialGradient(W * 0.5, H * 0.4, 100, W * 0.5, H * 0.5, W * 0.8);
    bg.addColorStop(0, '#3a414d'); bg.addColorStop(1, '#0f1217');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
    for (let i = -H; i < W; i += 46){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
    grain(g);
  } },
};

export const PRESET_IDS = Object.keys(PRESETS);
export const presetName = id => PRESETS[id]?.name || id;
export const defaultWallpaper = owner => ({ kind: 'preset', id: owner === 'cherryl' ? 'rose' : 'bloom' });

const cache = new Map();
/** A built-in background as a picture (JPEG data URL). */
export function presetUrl(id, small = false){
  const key = id + (small ? ':s' : '');
  if (cache.has(key)) return cache.get(key);
  const p = PRESETS[id] || PRESETS.bloom;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  p.paint(c.getContext('2d'));
  let out = c;
  if (small){
    out = document.createElement('canvas');
    out.width = 320; out.height = 180;
    out.getContext('2d').drawImage(c, 0, 0, 320, 180);
  }
  const url = out.toDataURL('image/jpeg', small ? 0.8 : 0.9);
  cache.set(key, url);
  return url;
}

/** The picture behind a wallpaper setting, whatever kind it is. */
export async function wallpaperUrl(wp, owner){
  const w = wp && wp.kind ? wp : defaultWallpaper(owner);
  if (w.kind === 'preset') return presetUrl(w.id);
  if (w.kind === 'photo'){
    // a photo from a folder, by id (this-browser-only mode)
    const p = snapshot().folders.flatMap(f => f.photos).find(x => x.id === w.photoId && !x.deletedAt);
    const src = p && await ensurePhotoSrc(p);
    if (src) return src;
    return presetUrl(defaultWallpaper(owner).id);
  }
  return (await wallpaperSrc(w)) || presetUrl(defaultWallpaper(owner).id);
}