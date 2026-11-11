/**
 * The real cat: WildMesh 3D's rigged cat (public/models/cat.glb), posed by
 * hand every frame — no baked animations. The model only comes with bones,
 * so walking, sitting, sleeping, eating and the rest are made here.
 *
 *   const rig = await loadCatRig(THREE, '/models/cat.glb');
 *   group.add(rig.root);
 *   rig.pose(P, t)      // P: the pose numbers from feat-cat.js
 *   rig.setLook(look)   // coat colour, eyes, collar, build
 *
 * Bones are turned around the cat's own axes (x: nod / swing, y: turn,
 * z: tilt), relative to how they rest, so the numbers below read naturally:
 * a negative x on a leg swings it forward, a positive x on the head nods it.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ---- coats: the original texture, re-coloured by brightness ----
   Each coat maps the fur's dark→light values onto its own colours, so the
   stripes and spots stay and only the colours change. The original is darker
   on the back and light cream on the belly, chin and legs, so a coat can turn
   the light parts white (tuxedo, "& white") with `at` (where each colour sits
   on the dark→light scale). `patch` paints a second colouring in blotches
   (calico, tortoiseshell). */
const GINGER = ['#3a1806', '#8a3f12', '#c76b2a', '#e7a160', '#f8e1c2'];
const BLACK = ['#040404', '#0a0a0a', '#121212', '#1d1c1b', '#34312e'];
export const COATS = [
  { id: 'tilo',     name: 'Tilo',            stops: ['#30271b', '#4e4334', '#6b5e4c', '#8a7c68', '#c4baa8'] },   // sampled from a photo of Tilo
  { id: 'white',    name: 'Pure white',      stops: ['#dedad3', '#ebe8e2', '#f3f1ec', '#f9f8f5', '#ffffff'] },
  { id: 'cream',    name: 'Cream',           stops: ['#6b5039', '#a8875f', '#d2b48a', '#ead6b4', '#faf2e2'] },
  { id: 'ginger',   name: 'Orange tabby',    stops: GINGER },
  { id: 'gingerW',  name: 'Orange & white',  stops: GINGER, white: true },
  { id: 'brown',    name: 'Brown tabby',     stops: ['#18110b', '#3f2c1d', '#7a5a3c', '#b8936b', '#e8d6bb'] },
  { id: 'silver',   name: 'Silver tabby',    stops: null },                                                      // the model as it comes
  { id: 'blue',     name: 'Grey',            stops: ['#1f2328', '#4b525b', '#7f8790', '#b4bac0', '#e6e8ea'] },
  { id: 'greyW',    name: 'Grey & white',    stops: ['#1f2328', '#454c54', '#6d747c', '#959ca3', '#b8bdc2'], white: true },
  { id: 'black',    name: 'Black',           stops: BLACK },
  { id: 'tuxedo',   name: 'Tuxedo',          stops: BLACK, white: true },
  { id: 'smoke',    name: 'Black smoke',     stops: ['#070707', '#141414', '#262626', '#4a4846', '#9a948c'] },
  { id: 'choc',     name: 'Chocolate',       stops: ['#1e110a', '#3d2416', '#5c3a26', '#7c5440', '#a8826a'] },
  { id: 'lilac',    name: 'Lilac',           stops: ['#4b4248', '#7a6f75', '#a1979c', '#c3babd', '#e8e2e2'] },
  { id: 'calico',   name: 'Calico',          stops: ['#0b0907', '#16120f', '#221c18', '#3a302a', '#5a4c42'], patch: GINGER, white: true },
  { id: 'tortie',   name: 'Tortoiseshell',   stops: ['#070505', '#120d0b', '#1d1512', '#3a2a22', '#6b5444'],
                                             patch: ['#3a1806', '#7d3a12', '#b4622a', '#d48b4c', '#e8b57d'] },
];
const WHITE_FUR = ['#cfcbc4', '#e6e3dd', '#f1efea', '#f8f6f2', '#fefdfb'];
export const EYE_TINTS = { green: '#7fbf4a', amber: '#e3a225', blue: '#6aa8e8', copper: '#c96a2c', hazel: '#a8903f' };

const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function grad(l, rgb, at){
  let k = 0;
  while (k < at.length - 2 && l > at[k + 1]) k++;
  const u = Math.max(0, Math.min(1, (l - at[k]) / ((at[k + 1] - at[k]) || 1)));
  const a = rgb[k], b = rgb[k + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
// soft blotches for calico / tortie patches
const blotch = (x, y) => 0.5 + 0.28 * Math.sin(x * 9.1 + Math.sin(y * 6.3) * 2.2) + 0.22 * Math.sin(y * 10.7 + Math.sin(x * 7.9) * 2.6);

function gradientRecolor(img, coat){
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  if (!coat?.stops) return c;
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data, W = c.width, H = c.height;
  const at = coat.at || [0, 0.25, 0.5, 0.75, 1];
  const main = coat.stops.map(hexRGB), patch = coat.patch?.map(hexRGB), white = WHITE_FUR.map(hexRGB);
  // where the fur is white on two-tone coats: the light belly, chest, muzzle and paws of the
  // original, found by blurring its brightness (so single light hairs on the back don't count)
  let area = null;
  const G = 128;
  if (coat.white){
    const sum = new Float32Array(G * G), cnt = new Float32Array(G * G);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const k = (y * W + x) * 4, cell = Math.floor(y * G / H) * G + Math.floor(x * G / W);
      sum[cell] += (0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2]) / 255; cnt[cell]++;
    }
    let m = sum.map((v, i) => cnt[i] ? v / cnt[i] : 0);
    const blur = (src) => {                     // a box blur, across then down
      const out = new Float32Array(G * G), r = 2;
      for (let pass = 0; pass < 2; pass++){
        const a = pass ? out.slice() : src;
        for (let y = 0; y < G; y++) for (let x = 0; x < G; x++){
          let t = 0, n = 0;
          for (let d = -r; d <= r; d++){
            const xx = pass ? x : x + d, yy = pass ? y + d : y;
            if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
            t += a[yy * G + xx]; n++;
          }
          out[y * G + x] = t / n;
        }
      }
      return out;
    };
    area = blur(blur(m));
  }
  const areaAt = (x, y) => {                    // smooth, between the grid cells
    const gx = Math.min(G - 1.001, Math.max(0, x * G - 0.5)), gy = Math.min(G - 1.001, Math.max(0, y * G - 0.5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const v = area[y0 * G + x0] * (1 - fx) * (1 - fy) + area[y0 * G + x0 + 1] * fx * (1 - fy) + area[(y0 + 1) * G + x0] * (1 - fx) * fy + area[(y0 + 1) * G + x0 + 1] * fx * fy;
    const l = (v - 0.04) / 0.86;
    return Math.max(0, Math.min(1, (l - 0.5) / 0.1));          // 0 coloured … 1 white
  };
  for (let i = 0; i < px.length; i += 4){
    // brightness, stretched a little so the darkest stripes and lightest belly use the whole range
    let l = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.04) / 0.86));
    const p = i / 4, x = (p % W) / W, y = Math.floor(p / W) / H;
    let rgb = main;
    if (patch && blotch(x, y) > 0.56) rgb = patch;
    let col = grad(l, rgb, at);
    if (area){
      const w = areaAt(x, y);
      if (w > 0){ const c2 = grad(l, white, at); col = [col[0] + (c2[0] - col[0]) * w, col[1] + (c2[1] - col[1]) * w, col[2] + (c2[2] - col[2]) * w]; }
    }
    // keep a hint of the original's warmth (pink nose, inner ears, paw pads)
    const warm = Math.max(0, px[i] - px[i + 2]) / 255;
    px[i] = col[0] + warm * 40; px[i + 1] = col[1]; px[i + 2] = col[2];
  }
  g.putImageData(d, 0, 0);
  return c;
}

export async function loadCatRig(THREE, url){
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  const root = new THREE.Group();          // what the room moves around; the cat faces +z
  const lift = new THREE.Group();          // raises/lowers the body (sitting, lying down)
  root.add(lift); lift.add(model);
  model.updateMatrixWorld(true);

  const bones = {};
  const meshes = [];
  model.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh){ meshes.push(o); o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; }
  });

  // how each bone rests, and how its parent is turned at rest (in the model's own space)
  const rootInv = new THREE.Quaternion();
  model.getWorldQuaternion(rootInv).invert();
  const rest = {};
  for (const [n, b] of Object.entries(bones)){
    const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
    rest[n] = { q: b.quaternion.clone(), p: b.position.clone(), pw, pwInv: pw.clone().invert() };
  }

  /* ---- turning bones ---- */
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const pending = new Map();          // bone -> model-space rotation for this frame
  const tmpQ = new THREE.Quaternion();
  function turn(name, axis, angle){
    if (!angle || !bones[name]) return;
    let q = pending.get(name);
    if (!q){ q = new THREE.Quaternion(); pending.set(name, q); }
    q.premultiply(tmpQ.setFromAxisAngle(axis, angle));
  }
  function flush(){
    for (const [n, b] of Object.entries(bones)){
      const r = rest[n];
      const q = pending.get(n);
      if (!q){ b.quaternion.copy(r.q); continue; }
      // local = parentRest⁻¹ · R · parentRest · rest
      b.quaternion.copy(r.pwInv).multiply(q).multiply(r.pw).multiply(r.q);
    }
    pending.clear();
  }

  // which local axis runs along the tail bone (so puffing it doesn't stretch it)
  let tailAxis = null;
  if (bones.SKEL_Tail0 && bones.SKEL_Tail1){
    const d = bones.SKEL_Tail1.position.clone();
    const a = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)];
    tailAxis = a.indexOf(Math.max(...a));
  }

  /* ---- collar, on the neck ---- */
  const collarMat = new THREE.MeshStandardMaterial({ color: '#c8323a', roughness: 0.6 });
  const collar = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0055, 8, 28), collarMat);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 10), new THREE.MeshStandardMaterial({ color: '#e2b13c', metalness: 0.85, roughness: 0.3 }));
  bell.position.set(0, -0.04, 0.004);
  collar.add(band, bell);
  band.castShadow = bell.castShadow = true;
  (bones.SKEL_Neck1 || model).add(collar);
  // place it around the neck in model space, then hand it to the bone
  {
    const nb = bones.SKEL_Neck1;
    if (nb){
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
      nb.getWorldPosition(wp); nb.getWorldQuaternion(wq);
      const toLocal = new THREE.Matrix4().compose(wp, wq, new THREE.Vector3(1, 1, 1)).invert();
      const want = new THREE.Matrix4().compose(
        model.localToWorld(new THREE.Vector3(0, 0.292, 0.2)),      // around the neck
        model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.89, 0, 0))),
        new THREE.Vector3(1, 1.15, 1));
      toLocal.multiply(want).decompose(collar.position, collar.quaternion, collar.scale);
    }
  }

  /* ---- coats and eyes ---- */
  let furMat = null, eyeMat = null;
  meshes.forEach(m => {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mt => { if (/eye/i.test(mt.name)) eyeMat = mt; else furMat = furMat || mt; });
  });
  if (furMat){ furMat.roughness = 0.85; furMat.metalness = 0; }
  const baseImg = furMat?.map?.image || null;
  const coatCache = {};
  function setCoat(id){
    if (!furMat?.map || !baseImg) return;
    const coat = COATS.find(c => c.id === id) || COATS[0];
    if (!coatCache[coat.id]){
      const tex = new THREE.CanvasTexture(gradientRecolor(baseImg, coat));
      tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = furMat.map.flipY;
      tex.wrapS = furMat.map.wrapS; tex.wrapT = furMat.map.wrapT;
      tex.anisotropy = 4;
      coatCache[coat.id] = tex;
    }
    furMat.map = coatCache[coat.id];
    furMat.needsUpdate = true;
  }
  function setLook(look = {}){
    setCoat(look.coat || 'tilo');
    if (eyeMat) eyeMat.color.set(EYE_TINTS[look.eyes] || '#ffffff');
    const col = look.collar && look.collar !== 'none' ? look.collar : null;
    collar.visible = !!col;
    if (col) collarMat.color.set(col);
    const w = look.build === 'chonk' ? 1.16 : look.build === 'slim' ? 0.92 : 1;
    model.scale.set(w, 1, 1);
  }

  /* ---- the pose ---- */
  // P: y, pitch, tuck, rearFold, headPitch, headYaw, headRoll, tailUp, tailCurl, eyes, ears, arch, puff, paw, side
  // m: { gait, amp, run, t, breathe, purr, chew, mouth }
  function pose(P, m){
    const t = m.t;
    const step = s => Math.sin(m.gait + s);
    lift.position.y = P.y;
    lift.rotation.x = -(P.lean || 0);                    // nose up in a leap, nose down landing

    // breathing
    const br = m.breathe || 0;
    turn('SKEL_Spine1', X, br * 0.6);
    turn('SKEL_Spine2', X, -br * 0.6);

    // sitting: the whole body tips up around the hips (pelvis), front legs stay upright
    turn('SKEL_Pelvis', X, P.pitch);
    // an arched back (hiss): middle up, ends down
    turn('SKEL_Spine0', X, -P.arch * 0.35);
    turn('SKEL_Spine2', X, P.arch * 0.25);
    turn('SKEL_Spine3', X, P.arch * 0.25);
    // curled up (sleep): the spine bends sideways into a ring
    const c = P.curl || 0;
    turn('SKEL_Pelvis', Y, -c * 0.35);                                      // the back half bends one way…
    turn('SKEL_Spine0', Y, c * 0.35);                                       // (undo that for the front half)
    ['SKEL_Spine0', 'SKEL_Spine1', 'SKEL_Spine2', 'SKEL_Spine3'].forEach(n => turn(n, Y, c * 0.38));   // …the front half the other, into a ring

    // walking: diagonal pairs swing together
    const A = m.amp || 0;
    const legs = [['L', true, 0], ['R', true, Math.PI], ['L', false, Math.PI], ['R', false, 0]];
    for (const [s, front, ph] of legs){
      const sw = step(ph) * A;                                   // + = back, - = forward
      const bend = Math.max(0, -Math.cos(m.gait + ph)) * A;      // knee bends while the paw travels forward
      const cr = P.crouch || 0, re = P.reach || 0, rr = P.rearReach || 0;
      if (front){
        // lifts a paw: to lick it (left), or both in turn to knead
        const paw = s === 'L' ? (P.paw || 0) : 0;
        const kn = (P.knead || 0) * Math.max(0, Math.sin(t * 7 + (s === 'L' ? 0 : Math.PI)));
        turn(`SKEL_${s}_UpperArm`, X, (P.fa1 || 0) + sw * 0.9 - P.pitch - P.tuck * 0.35 - P.arch * 0.1 - paw * 0.9 - kn * 0.35 + cr * 0.45 - re * 1.15);
        turn(`SKEL_${s}_Forearm`, X, (P.fa2 || 0) - bend * 1.1 + P.tuck * 1.75 + paw * 1.9 - kn * 0.9 - cr * 0.95 + re * 0.25);
        turn(`SKEL_${s}_Hand`, X, (P.fa3 || 0) + bend * 0.6 + P.tuck * 0.15 - paw * 0.6 + kn * 0.6 + cr * 0.5 + re * 0.4);
      } else {
        turn(`SKEL_${s}_Thigh`, X, (P.ra1 || 0) + sw * 0.8 - P.rearFold * 0.55 - P.tuck * 0.9 + P.arch * 0.15 - cr * 0.55 + rr * 0.9);
        turn(`SKEL_${s}_Calf`, X, (P.ra2 || 0) + bend * 1.0 + P.rearFold * 1.0 + P.tuck * 1.9 + cr * 1.05 - rr * 0.35);
        turn(`SKEL_${s}_Foot`, X, -bend * 0.6 + (P.footFix ?? 0) * P.rearFold - P.tuck * 1.2 - cr * 0.55 + rr * 0.45);
      }
    }
    if (P.wiggle) turn('SKEL_Pelvis', Y, Math.sin(t * 16) * 0.13 * P.wiggle);     // the butt wiggle before a pounce
    if (A){
      turn('SKEL_Spine2', X, Math.sin(m.gait * 2) * 0.03 * (m.run ? 3 : 1));
      turn('SKEL_Pelvis', Y, Math.sin(m.gait) * 0.04);
      turn('SKEL_Spine3', Y, -Math.sin(m.gait) * 0.04);
    }

    // head and neck share the turn, so it bends like a neck and not a hinge
    const hp = P.headPitch - P.pitch * 0.85;              // keep looking ahead when the body tips up
    turn('SKEL_Neck0', X, hp * 0.25);
    turn('SKEL_Neck1', X, hp * 0.3);
    turn('SKEL_Neck2', X, hp * 0.2);
    turn('SKEL_Head', X, hp * 0.25 + (m.chew || 0));
    const hy = P.headYaw + c * 0.6;
    turn('SKEL_Neck1', Y, hy * 0.45);
    turn('SKEL_Neck2', Y, hy * 0.3);
    turn('SKEL_Head', Y, hy * 0.25);
    turn('SKEL_Head', Z, P.headRoll);

    // ears back (hiss, sleepy)
    for (const [s, sg] of [['L', 1], ['R', -1]]){
      turn(`FACIAL_${s}_Ear1`, X, P.ears * 0.9);
      turn(`FACIAL_${s}_Ear1`, Z, -sg * P.ears * 0.7);
    }
    turn('FACIAL_C_Jaw', X, (m.mouth || 0) * 0.45);       // meow, hiss
    const shut = 1 - Math.max(0, Math.min(1, P.eyes));   // blink, sleepy
    turn('FACIAL_L_EyelidUpper', X, shut * 0.9);
    turn('FACIAL_R_EyelidUpper', X, shut * 0.9);
    turn('FACIAL_L_EyelidLower', X, -shut * 0.35);
    turn('FACIAL_R_EyelidLower', X, -shut * 0.35);

    // tail: tailUp is the angle above level at the base; it curls along its length and sways
    const sway = Math.sin(t * (A ? 4 : 1.6));
    const abs = P.tailUp - P.pitch;                       // counting a tipped-up body (pitch < 0 lowers the tail)
    for (let i = 0; i < 6; i++){
      const name = 'SKEL_Tail' + i;
      if (i === 0) turn(name, X, P.tailUp);
      else if (abs >= 0) turn(name, X, 0.05 + abs * 0.07);                     // a gentle question mark
      else turn(name, X, i === 1 ? -abs * 1.0 : 0);                            // lie along the floor
      turn(name, Y, sway * 0.08 * (i / 5) + P.tailCurl * 0.24 - c * 0.42);       // curled up: wrap round towards the nose
    }
    flush();
    // a bottlebrush tail: fatter, not longer
    const f = 1 + (P.puff || 0) * 0.55;
    if (tailAxis){ const t0 = bones.SKEL_Tail0; t0.scale.set(f, f, f); t0.scale.setComponent(tailAxis, 1); }
  }

  return { root, model, bones, meshes, pose, setLook, head: bones.SKEL_Head || model, collar };
}