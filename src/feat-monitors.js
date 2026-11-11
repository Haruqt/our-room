/**
 * The monitors on the desk show what each computer is doing, the way the TV
 * shows what's playing:
 *
 *   locked  the lock screen: that PC's wallpaper with the time
 *   on      exactly what was on screen when you walked away (windows and all)
 *   off     dark
 *
 * Andrei's second monitor shows the wallpaper with a clock while his PC is on.
 */
import { onPcChange, pcState, pcSnapshot, pcWallpaper } from './desktop-ui.js';
import { fillQuadUV, loadImage } from './room-kit.js';
import { reportError } from './errors.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

/** Like quadInfo, but steady on curved screens: faces the average normal. */
function screenInfo(THREE, mesh, roomCenter){
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.attributes.position;
  const nor = mesh.geometry.attributes.normal;
  const pts = [];
  for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  const center = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  const normal = new THREE.Vector3();
  if (nor){
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const toRoom = new THREE.Vector3().subVectors(roomCenter, center);
    for (let i = 0; i < nor.count; i++){
      const n = new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm);
      if (n.dot(toRoom) > 0) normal.add(n);           // only the side facing the room
    }
  }
  if (normal.lengthSq() < 1e-6) normal.subVectors(roomCenter, center);
  normal.y = 0; normal.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  let w = 0, h = 0;
  pts.forEach(p => {
    const d = new THREE.Vector3().subVectors(p, center);
    w = Math.max(w, Math.abs(d.dot(right)) * 2);
    h = Math.max(h, Math.abs(d.dot(up)) * 2);
  });
  return { center, normal, right, up, width: w, height: h, aspect: w / h };
}

function cover(g, img, W, H, alignBottom = false){
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  if (!iw || !ih) return;
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s, dh = ih * s;
  g.drawImage(img, (W - dw) / 2, alignBottom ? H - dh : (H - dh) / 2, dw, dh);
}

export function installMonitors(ctx){
  const { THREE, scene, one, roomCenter, ROOM, nightAmount, onFrame } = ctx;
  RectAreaLightUniformsLib.init();
  const spec = ROOM.hotspots.monitors || {};
  const screens = [];
  Object.entries(spec).forEach(([owner, names]) => names.forEach((name, i) => {
    const mesh = one(name);
    if (!mesh || !mesh.isMesh) return;
    const info = screenInfo(THREE, mesh, roomCenter);
    fillQuadUV(mesh, info);
    const W = 1024, H = Math.round(W / Math.max(0.5, info.aspect));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    mesh.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });

    // the light this screen throws onto the desk, keyboard and wall: a soft
    // panel the size of the screen plus a little spill, coloured like the picture
    const panel = new THREE.RectAreaLight(0xbfd8ff, 0, info.width, info.height);
    panel.position.copy(info.center).addScaledVector(info.normal, 0.02);
    panel.lookAt(info.center.clone().addScaledVector(info.normal, 2));
    scene.add(panel);
    const spill = new THREE.PointLight(0xbfd8ff, 0, 2.6, 1.8);
    spill.position.copy(info.center).addScaledVector(info.normal, 0.45);
    scene.add(spill);

    screens.push({ owner, main: i === 0, mesh, canvas, g: canvas.getContext('2d', { willReadFrequently: true }), tex, W, H,
      panel, spill, level: 0, target: 0, color: new THREE.Color(0xbfd8ff) });
  }));
  if (!screens.length) return null;

  const wallImg = {};
  async function wallpaper(owner){
    try {
      const url = await pcWallpaper(owner);
      if (wallImg[owner]?.url === url) return wallImg[owner].img;
      const img = await loadImage(url);
      wallImg[owner] = { url, img };
      return img;
    } catch(e){ reportError('monitor wallpaper', e); return null; }
  }

  function drawOff(s){
    const { g, W, H } = s;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#07080b'); grad.addColorStop(0.55, '#0d0f14'); grad.addColorStop(1, '#050608');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // a faint reflection, so it still reads as glass
    g.fillStyle = 'rgba(255,255,255,.035)';
    g.beginPath(); g.moveTo(W * 0.1, 0); g.lineTo(W * 0.42, 0); g.lineTo(W * 0.22, H); g.lineTo(0, H); g.lineTo(0, H * 0.4); g.closePath(); g.fill();
  }

  function clockText(g, W, H, big, y){
    const d = new Date();
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18;
    g.font = `600 ${big}px "Segoe UI", system-ui, sans-serif`;
    g.fillText(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), W / 2, y);
    g.font = `400 ${Math.round(big * 0.2)}px "Segoe UI", system-ui, sans-serif`;
    g.fillText(d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), W / 2, y + big * 0.42);
    g.shadowBlur = 0;
  }

  /** What the screen looks like now -> how much light, and what colour. */
  function measure(s, state){
    if (state === 'off'){ s.target = 0; return; }
    try {
      const d = s.g.getImageData(0, 0, s.W, s.H).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 97){ r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      r /= n * 255; gg /= n * 255; b /= n * 255;
      const luma = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      const m = Math.max(r, gg, b, 0.001);
      s.color.setRGB(0.5 + 0.5 * r / m, 0.5 + 0.5 * gg / m, 0.5 + 0.5 * b / m, THREE.SRGBColorSpace);
      s.target = Math.min(1, 0.35 + luma * 1.5) * (state === 'locked' ? 0.75 : 1);
    } catch(_){ s.target = 0.6; }
  }

  async function draw(s){
    const state = pcState(s.owner);
    const { g, W, H } = s;
    if (state === 'off'){ drawOff(s); s.tex.needsUpdate = true; measure(s, state); return; }
    const snap = s.main && state === 'on' ? pcSnapshot(s.owner) : null;
    if (snap){
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      cover(g, snap, W, H, true);
    } else {
      const img = await wallpaper(s.owner);
      g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
      if (img) cover(g, img, W, H);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, W, H);
      clockText(g, W, H, Math.round(H * (s.main ? 0.24 : 0.2)), H * (s.main ? 0.36 : 0.42));
      if (s.main && state === 'locked'){
        g.font = `400 ${Math.round(H * 0.035)}px "Segoe UI", system-ui, sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.fillText('locked', W / 2, H * 0.9);
      }
    }
    s.tex.needsUpdate = true;
    measure(s, state);
  }

  // ease each screen's light toward what's on it; strong at night, faint by day
  onFrame?.((t, dt) => {
    const night = nightAmount();
    const k = Math.min(1, dt * 4);
    screens.forEach(s => {
      s.level += (s.target - s.level) * k;
      const L = s.level * (1 + Math.sin(t * 2.1 + s.W) * 0.015);
      s.panel.color.copy(s.color); s.spill.color.copy(s.color);
      s.panel.intensity = L * (0.4 + night * 5.5);
      s.spill.intensity = L * (0.1 + night * 1.6);
    });
  });

  const redraw = owner => screens.filter(s => !owner || s.owner === owner).forEach(s => draw(s).catch(e => reportError('monitor', e)));
  onPcChange(redraw);
  redraw();
  // keep the clocks right (snapshots stay as they were left)
  setInterval(() => screens.filter(s => !(s.main && pcState(s.owner) === 'on' && pcSnapshot(s.owner))).forEach(s => draw(s)), 30000);
  return null;
}