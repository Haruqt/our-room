/**
 * The cats (up to 4).
 *
 * Until someone adopts one, there's a cardboard box on the floor that wiggles
 * now and then. Open it to name the first cat and pick its coat (or "surprise
 * me", or — for Andrei — leave the look for Che to design). More cats can be
 * adopted from the cat bed: they come in through the door.
 *
 * Each cat lives its own day in the room:
 *   · long naps (minutes, not seconds), loafing, sitting, grooming, wandering,
 *     going up on the furniture, the odd case of zoomies
 *   · sleeps when the lights go off at night (one in the bed, the rest wherever)
 *   · gets hungry over real hours: fill the one bowl and they all run over
 *   · pet them (the cursor becomes a hand). Every cat warms to Che. Andrei's
 *     own cat likes him too; the others let him pet them 3 times in 10.
 *   · thinks out loud in little bubbles, meows, purrs, hisses, chases the yarn
 *
 * Shared by both of you: names, looks, hunger and trust live in the shared room
 * state, and each cat's day is worked out from the clock and its own seed, so
 * both screens see the same cats in the same places. Pets and calls go live.
 */
import { openPanel, closePanel } from './room-panel.js';
import { loadShared, getShared, setShared, onShared, send, onMessage, whoIsHere } from './room-live.js';
import { getMe, shortOf } from './who.js';
import { toast, showConfirm } from './ui.js';
import { esc } from './room-kit.js';
import * as sfx from './sfx.js';
import { reportError } from './errors.js';
import { loadCatRig, COATS, EYE_TINTS } from './cat-rig.js';

const did = key => window.dispatchEvent(new CustomEvent('ourroom:did', { detail: key }));

/* ================= the room's floor, measured from the model ================= */
const FLOOR = 0.2;
const CAT_URL = '/models/cat.glb';     // WildMesh 3D's rigged cat, converted (see README)
const CAT_SCALE = 0.85;                // the model is real-cat sized; this suits the room
const BOWL = { x: -1.95, z: 0.1 };
const BED = { x: 2.3, z: -1.25 };
const BOX = { x: 1.15, z: -0.5 };
// furniture footprints (x0, x1, z0, z1), with a little room to spare
const OBSTACLES = [
  [-2.8, 1.12, -2.8, -1.62],   // the long desk
  [-2.6, -1.45, -1.58, -0.42], // Che's chair
  [-0.08, 0.84, -1.72, -0.86], // Andrei's chair
  [-2.8, -1.66, 0.46, 2.18],   // TV cabinet
  [-2.8, -2.1, -0.36, 0.6],    // bookcase
  [-2.8, -2.1, 2.05, 2.8],     // corner bookcase
  [0.32, 1.01, 0.95, 1.8],     // coffee table
  [1.55, 2.8, 0.3, 2.5],       // sofa
  [1.9, 2.5, -0.5, 0.09],      // side table
];
const BOUNDS = [-2.55, 2.62, -2.5, 2.65];
// places it likes to go
const SPOTS = {
  rug:     { x: -0.4, z: 1.35 },
  rugFront:{ x: 0.1, z: 2.3 },
  rugBack: { x: -0.1, z: 0.55 },
  middle:  { x: 0.25, z: -0.15 },
  left:    { x: -1.0, z: -0.15 },
  tv:      { x: -1.25, z: 1.35 },
  corner:  { x: -1.35, z: 2.45 },
  eat:     { x: -1.62, z: 0.1 },
  che:     { x: -1.2, z: -1.0 },
  andrei:  { x: 1.02, z: -1.15 },
  door:    { x: 1.4, z: -2.05 },
  bed:     { x: BED.x, z: BED.z },
  sofaFront:{ x: 1.25, z: 0.85 },
  sofaEnd: { x: 1.25, z: 2.55 },
  side:    { x: 1.5, z: -0.2 },
  // where it stands before jumping up onto something
  sofaApproach:    { x: 1.4, z: 1.45 },
  sofaArmApproach: { x: 1.4, z: 2.3 },
  tableApproach:   { x: 0.0, z: 1.65 },
  tvApproach:      { x: -1.35, z: 1.55 },
  deskApproach:    { x: -1.05, z: -1.3 },
  andreiDeskApproach: { x: 1.0, z: -1.45 },
};
const NAMES = Object.keys(SPOTS);
const WANDER = NAMES.filter(n => n !== 'eat' && !/Approach$/.test(n));

/* Things it can jump onto. h: how high the top is above the floor (measured from
   the room model); from: where it jumps up from (a floor spot or another perch);
   face: which way it settles, roughly towards the camera. */
const PERCH = {
  sofaSeat:    { x: 2.05, z: 1.45, h: 0.30, from: 'sofaApproach', face: -0.6, acts: ['loaf', 'sleep', 'sit', 'loaf'] },
  sofaBack:    { x: 2.6,  z: 1.2,  h: 0.91, from: 'sofaSeat', face: -0.3, acts: ['loaf', 'sit'] },
  sofaArm:     { x: 2.05, z: 2.3,  h: 0.73, from: 'sofaArmApproach', face: -0.9, acts: ['loaf', 'sit'] },
  table:       { x: 0.45, z: 1.65, h: 0.35, from: 'tableApproach', face: 0.9, acts: ['sit', 'groom', 'loaf'] },
  tvTop:       { x: -2.0, z: 1.55, h: 0.91, from: 'tvApproach', face: 1.4, acts: ['loaf', 'sit'] },
  deskChe:     { x: -1.5, z: -1.98, h: 1.04, from: 'deskApproach', face: 0.5, acts: ['sit', 'loaf'] },
  deskAndrei:  { x: 0.3,  z: -1.98, h: 1.04, from: 'andreiDeskApproach', face: 0.3, acts: ['sit', 'loaf'] },
  chairChe:    { x: -2.05, z: -1.0, h: 0.72, from: 'che', face: 1.2, acts: ['sleep', 'loaf'] },
  chairAndrei: { x: 0.33, z: -1.35, h: 0.73, from: 'andrei', face: 0.9, acts: ['loaf', 'sleep'] },
  sideTable:   { x: 2.2,  z: -0.2, h: 0.61, from: 'side', face: -0.8, acts: ['sit', 'loaf'] },
};
const PERCHES = Object.keys(PERCH);
const at = name => PERCH[name] ? { x: PERCH[name].x, z: PERCH[name].z, y: PERCH[name].h } : { x: SPOTS[name].x, z: SPOTS[name].z, y: 0 };
/** The perches under a target, top first, and the floor spot they start from. */
function chainOf(name){ const chain = []; let n = name; while (PERCH[n]){ chain.push(n); n = PERCH[n].from; } return { chain, base: n }; }

/** Every step from where it is (maybe up on something) to a spot or perch: walks and jumps. */
function routeTo(from, fromPerch, name){
  const steps = [];
  let here = { x: from.x, z: from.z }, cur = fromPerch;
  const want = typeof name === 'string' ? chainOf(name) : { chain: [], base: name };
  // jump down until it's on the floor, or on the way to where it's going
  while (cur && !want.chain.includes(cur)){
    const next = PERCH[cur].from;
    steps.push({ ...at(next), jump: true, perch: PERCH[next] ? next : null });
    here = at(next); cur = PERCH[next] ? next : null;
  }
  let up = want.chain.slice().reverse();
  if (cur) up = up.slice(up.indexOf(cur) + 1);
  else for (const s of route(here, want.base)) steps.push({ x: s.x, z: s.z, y: 0 });
  for (const n of up) steps.push({ ...at(n), jump: true, perch: n });
  return steps;
}

const blocked = (x, z) =>
  x < BOUNDS[0] || x > BOUNDS[1] || z < BOUNDS[2] || z > BOUNDS[3] ||
  OBSTACLES.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
function clear(p, q){
  const n = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.05);
  for (let i = 1; i < n; i++){ const t = i / n; if (blocked(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t)) return false; }
  return true;
}
// which spots can see each other in a straight line
const LINKS = Object.fromEntries(NAMES.map(a => [a, NAMES.filter(b => b !== a && clear(SPOTS[a], SPOTS[b]))]));

/** Shortest way from where it is to a spot (a name) or any point {x, z}, around the furniture. */
function route(from, toName){
  const to = typeof toName === 'string' ? SPOTS[toName] : toName;
  if (clear(from, to)) return [{ x: to.x, z: to.z }];
  const dist = {}, prev = {}, done = new Set();
  NAMES.forEach(n => { dist[n] = clear(from, SPOTS[n]) ? Math.hypot(from.x - SPOTS[n].x, from.z - SPOTS[n].z) : Infinity; });
  while (true){
    let u = null;
    for (const n of NAMES) if (!done.has(n) && dist[n] < Infinity && (u === null || dist[n] < dist[u])) u = n;
    if (u === null) break;
    done.add(u);
    for (const v of LINKS[u]){
      const d = dist[u] + Math.hypot(SPOTS[u].x - SPOTS[v].x, SPOTS[u].z - SPOTS[v].z);
      if (d < dist[v]){ dist[v] = d; prev[v] = u; }
    }
  }
  // the reachable spot with the shortest way on to the target
  let best = null, bestD = Infinity;
  for (const n of NAMES){
    if (dist[n] === Infinity || !clear(SPOTS[n], to)) continue;
    const d = dist[n] + Math.hypot(SPOTS[n].x - to.x, SPOTS[n].z - to.z);
    if (d < bestD){ bestD = d; best = n; }
  }
  if (!best) return [{ x: to.x, z: to.z }];
  const path = []; let n = best;
  while (n){ path.unshift({ x: SPOTS[n].x, z: SPOTS[n].z }); n = prev[n]; }
  if (Math.hypot(path[path.length - 1].x - to.x, path[path.length - 1].z - to.z) > 0.01) path.push({ x: to.x, z: to.z });
  return path;
}

/* ================= how it can look ================= */
// The cat is WildMesh 3D's realistic rigged cat; coats re-colour its fur (see cat-rig.js).
export { COATS };
export const EYES = Object.entries(EYE_TINTS).map(([id, c]) => ({ id, c }));
export const COLLARS = [
  { id: 'none', c: 'transparent' }, { id: 'red', c: '#c8323a' }, { id: 'pink', c: '#ec7fa6' },
  { id: 'blue', c: '#3a6fd0' }, { id: 'gold', c: '#d4a52c' }, { id: 'green', c: '#3c9a5c' }, { id: 'purple', c: '#7d4cc2' },
];
export const BUILDS = [{ id: 'slim', name: 'Slim' }, { id: 'normal', name: 'Just right' }, { id: 'chonk', name: 'Chonky' }];
const coatSwatch = c => c.patch ? `linear-gradient(135deg, ${c.stops[2]} 0 33%, ${c.patch[2]} 33% 66%, ${c.white ? '#f4f2ee' : c.stops[3]} 66%)` : c.white ? `linear-gradient(135deg, ${c.stops[1]} 0 30%, ${c.stops[2]} 30% 55%, #f4f2ee 55%)` : c.stops ? `linear-gradient(135deg, ${c.stops[1]} 0 30%, ${c.stops[2]} 30% 62%, ${c.stops[3]} 62%)` : 'linear-gradient(135deg, #2a2a2a 0 30%, #8d8d8d 30% 62%, #d9d6cf 62%)';
const collarHex = id => (COLLARS.find(c => c.id === id) || COLLARS[0]).c;

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
export function randomLook(r = Math.random){
  return {
    coat: pick(COATS, r).id,
    eyes: pick(EYES, r).id,
    collar: pick(COLLARS, r).id,
    build: r() < 0.2 ? 'chonk' : r() < 0.3 ? 'slim' : 'normal',
  };
}
/** Older saves used fur/pattern (the drawn cat); give them a coat. */
function normalLook(look){
  const L = { ...(look || {}) };
  if (!L.coat) L.coat = L.pending ? 'blue' : ({ black: 'smoke', white: 'cream', grey: 'blue', ginger: 'ginger', cream: 'cream', brown: 'brown', choc: 'brown', lilac: 'blue' }[L.fur] || 'tilo');
  if (!EYE_TINTS[L.eyes]) L.eyes = 'green';
  if (!COLLARS.some(c => c.id === L.collar)) L.collar = 'none';
  if (!L.build) L.build = 'normal';
  return L;
}

/* ================= what it thinks ================= */
const THOUGHTS = {
  idle: ['mrrp?', '…', '*stares at the wall*', '*tail swish*', 'this is my room now', 'hm.', '*listens to nothing*'],
  hungry: ['FOOD. 🐟', 'meow. (it’s been hours)', 'the bowl is empty. tragic.', '*stares at the bowl*', 'i am wasting away'],
  sleep: ['z z z', 'zzz…', '*tiny snore*', 'z z'],
  dark: ['the dark is my kingdom', '*eyes glowing*', 'who turned off the sun'],
  che: ['Che!! ♥', '*slow blink at Che*', 'Che is here :3', 'mrrrp ♥'],
  andrei: ['*side-eyes Andrei*', 'you may look. not touch.', '*judging*', 'hmph.'],
  full: ['*licks lips*', 'that was acceptable.', 'more?', '*happy loaf*'],
  zoom: ['ZOOMIES', 'nyoom', '!!!'],
  groom: ['*lick lick*', 'must. be. perfect.'],
  // up on things
  deskChe: ['*sits on Che’s keyboard*', 'asdfghjkl;', 'this is my desk now', '*blocks the screen*'],
  deskAndrei: ['*walks across Andrei’s keyboard*', 'ctrl + alt + meow', 'your code has bugs. i found one.', '*sits on the mouse*'],
  tvTop: ['it’s warm up here', '*tail over the screen*', 'i am the TV now'],
  sofaBack: ['i can see everything from here', '*surveys the kingdom*'],
  sofaSeat: ['this is the good spot', '*sheds on the sofa*', 'soft.'],
  sofaArm: ['*perched*', 'king of the sofa'],
  table: ['*eyes the bottle*', 'what if i… pushed it', '*paw on the table*'],
  chairChe: ['Che’s chair. mine now.', 'it smells like Che ♥'],
  chairAndrei: ['*sheds on Andrei’s chair*', 'warm chair. thanks.'],
  sideTable: ['*sniffs the remote*', 'what does this button do'],
  yawn: ['*big yawn*', '*yaaawn*'],
  stretch: ['*streeetch*', '*the big stretch*'],
  pounce: ['!!', '*wiggle wiggle*', 'gotcha'],
};


/* ================= cardboard box (before adoption) ================= */
function makeBox(THREE){
  const g = new THREE.Group();
  const card = new THREE.MeshStandardMaterial({ color: '#b98a55', roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: '#8a6338', roughness: 0.95 });
  const tape = new THREE.MeshStandardMaterial({ color: '#d9c39a', roughness: 0.6 });
  const W = 0.36, H = 0.26, D = 0.3;
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), card); box.position.y = H / 2; g.add(box);
  const flaps = [];
  [[0, D / 2, 0], [0, -D / 2, Math.PI], [W / 2, 0, -Math.PI / 2], [-W / 2, 0, Math.PI / 2]].forEach(([x, z, ry], i) => {
    const hinge = new THREE.Group(); hinge.position.set(x, H, z); hinge.rotation.y = ry;
    const w = i < 2 ? W : D;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, i < 2 ? D / 2 : W / 2), i % 2 ? dark : card);
    flap.position.z = -(i < 2 ? D / 4 : W / 4);
    hinge.add(flap); g.add(hinge); flaps.push(hinge);
  });
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, D + 0.004), tape); t.position.y = H + 0.006; g.add(t);
  // a few air holes
  for (let i = 0; i < 3; i++){
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), new THREE.MeshBasicMaterial({ color: '#2a1c10' }));
    h.position.set(-0.08 + i * 0.08, H * 0.62, D / 2 + 0.001); g.add(h);
  }
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  return { g, flaps, tape: t };
}

/* ================= the toy: a ball of yarn ================= */
function makeYarn(THREE){
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#d64f6e'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = 'rgba(255,190,205,.75)'; x.lineWidth = 3;
  for (let i = 0; i < 40; i++){ x.beginPath(); const y = Math.random() * 128; x.moveTo(0, y); x.bezierCurveTo(80, y + (Math.random() - 0.5) * 90, 170, y + (Math.random() - 0.5) * 90, 256, y + (Math.random() - 0.5) * 40); x.stroke(); }
  x.strokeStyle = 'rgba(120,20,45,.5)'; x.lineWidth = 2;
  for (let i = 0; i < 25; i++){ x.beginPath(); const y = Math.random() * 128; x.moveTo(0, y); x.bezierCurveTo(90, y + 50, 160, y - 50, 256, y); x.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  ball.position.y = 0.075; ball.castShadow = true;
  // a loose strand trailing on the floor
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.03, 0.02, 0.04), new THREE.Vector3(0.1, 0.004, 0.09), new THREE.Vector3(0.2, 0.004, 0.05), new THREE.Vector3(0.27, 0.004, 0.12)]);
  const strand = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.004, 5), new THREE.MeshStandardMaterial({ color: '#d64f6e', roughness: 1 }));
  g.add(ball, strand);
  // a bigger invisible shape, so it's easy to grab on a phone
  const grab = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  grab.position.y = 0.06; g.add(grab);
  return { g, ball, grab };
}

/* ================= bowl and bed ================= */
function makeBowl(THREE){
  const g = new THREE.Group();
  const pts = [[0.0, 0], [0.085, 0], [0.1, 0.012], [0.11, 0.05], [0.098, 0.055], [0.085, 0.02], [0, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: '#d9546a', roughness: 0.45 }));
  g.add(bowl);
  // the kibble: one instanced mesh, 26 little pieces
  const food = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.012, 0), new THREE.MeshStandardMaterial({ color: '#8a5528', roughness: 0.8 }), 26);
  const o = new THREE.Object3D();
  for (let i = 0; i < 26; i++){
    const a = i * 2.4, r = 0.012 + (i % 7) * 0.01;
    o.position.set(Math.cos(a) * r, 0.03 + (i % 3) * 0.006, Math.sin(a) * r); o.rotation.set(i, i * 2, i * 3); o.updateMatrix();
    food.setMatrixAt(i, o.matrix);
  }
  g.add(food);
  // a little paper mat with a fish on it
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const x = c.getContext('2d'); x.fillStyle = '#f2d9a8'; x.fillRect(0, 0, 128, 96);
  x.fillStyle = '#e08a5a'; x.beginPath(); x.ellipse(70, 74, 22, 9, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(48, 74); x.lineTo(36, 66); x.lineTo(36, 82); x.fill();
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0.02, 0.002, 0); g.add(mat);
  bowl.castShadow = true; bowl.receiveShadow = true; mat.receiveShadow = true;
  return { g, food };
}
function makeBed(THREE){
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 12, 32), new THREE.MeshStandardMaterial({ color: '#c9a7b8', roughness: 0.95 }));
  outer.rotation.x = Math.PI / 2; outer.scale.set(1, 1.2, 1); outer.position.y = 0.05; g.add(outer);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.04, 32), new THREE.MeshStandardMaterial({ color: '#efe3d6', roughness: 1 }));
  base.position.y = 0.02; base.scale.z = 1.2; g.add(base);
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  return { g };
}

/* ================= the feature ================= */
const MAX_CATS = 4;
// where each cat eats around the one bowl (all clear floor), and where the others sleep when the bed's taken
const EAT_AT = [{ x: -1.62, z: 0.1 }, { x: -1.72, z: 0.4 }, { x: -1.72, z: -0.2 }, { x: -1.42, z: 0.36 }];
const NIGHT_BEDS = ['bed', 'sofaSeat', 'chairChe', 'chairAndrei'];

/* How long each kind of activity lasts (seconds): real cats nap for minutes, not seconds. */
const MOODS = [
  { id: 'sleep',  p: 0.2,  min: 240, max: 600 },
  { id: 'nap',    p: 0.17, min: 120, max: 300 },     // a loaf with heavy eyes
  { id: 'perch',  p: 0.22, min: 90,  max: 240 },     // up on something
  { id: 'sit',    p: 0.2,  min: 45,  max: 120 },     // sit, groom, look around
  { id: 'wander', p: 0.16, min: 25,  max: 60 },      // walk somewhere and stand
  { id: 'zoom',   p: 0.05, min: 12,  max: 16 },      // the zoomies
];
const hash = n => { let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const seedOf = id => [...String(id)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 17);
const at2 = t => typeof t === 'string' ? at(t) : { x: t.x, z: t.z, y: 0 };
const same = (a, b) => a && b && (typeof a === 'string' ? a === b : (typeof b !== 'string' && Math.hypot(a.x - b.x, a.z - b.z) < 0.2));

export function installCat(ctx){
  const { THREE, scene, camera, renderer, controls, nightAmount, onFrame, roomModel } = ctx;
  const me = getMe();

  /* ---- the shared things: the box, one bowl, one bed, the yarn ---- */
  const box = makeBox(THREE);
  const bowl = makeBowl(THREE);
  const bed = makeBed(THREE);
  const yarn = makeYarn(THREE);
  scene.add(box.g, bowl.g, bed.g, yarn.g);
  box.g.position.set(BOX.x, FLOOR, BOX.z); box.g.rotation.y = 0.5;
  bowl.g.position.set(BOWL.x, FLOOR, BOWL.z);
  bed.g.position.set(BED.x, FLOOR, BED.z); bed.g.rotation.y = 0.3;
  const toy = { x: 0.75, z: 0.3, vx: 0, vz: 0, moved: 0, dragging: false, sentAt: 0 };
  let playUntil = 0, bats = 0;              // a play session: started by you moving the toy, over after a few bats

  /* ---- the shared record: { list: [cat, …], fedAt, fedBy, toy } ---- */
  let S = { list: [], fedAt: 0 };
  const save = () => setShared('cats', S);
  const blankCat = () => ({ id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name: '', nameLocked: false, look: null,
    trust: { andrei: 0, cherryl: 0 }, born: Date.now(), adoptedBy: me, owner: me });
  let lights = (() => { try { return localStorage.getItem('ourroom_lights') !== 'off'; } catch(_){ return true; } })();
  window.addEventListener('ourroom:lights', e => { lights = !!e.detail?.on; });
  const fullness = () => S.fedAt ? Math.max(0, 1 - (Date.now() - S.fedAt) / (10 * 3600e3)) : 0.3;
  const bowlHasFood = () => S.fedAt && Date.now() - S.fedAt < 90e3;
  const cheHere = () => whoIsHere().has('cherryl');
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const isIn = (obj, group) => { for (let o = obj; o; o = o.parent) if (o === group) return true; return false; };
  const HAND = (closed) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text x='2' y='26' font-size='24'>${closed ? '✊' : '🖐'}</text></svg>`)}") 14 14, grab`;
  const v3 = new THREE.Vector3();

  /* ================= one cat ================= */
  function makeSlot(index){
    const self = { index, rec: null, rig: null, rigLoading: false };
    const root = new THREE.Group();
    root.scale.setScalar(CAT_SCALE);
    root.visible = false;
    // an invisible shape to click and hover (cheaper than testing the skinned fur, and it follows any pose)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.2, 0.04);
    root.add(hit);
    scene.add(root);
    self.root = root; self.hit = hit;
    const R = () => self.rec;
    const trustOf = who => R()?.trust?.[who] || 0;
    const ownedByAndrei = () => R()?.owner === 'andrei' || R()?.owner === 'both';

    const currentLook = () => {
      const L = normalLook(R()?.look);
      return { ...L, coat: L.pending ? 'blue' : L.coat, collar: L.collar === 'none' ? 'none' : collarHex(L.collar) };
    };
    function ensureRig(){
      if (self.rig || self.rigLoading) return;
      self.rigLoading = true;
      loadCatRig(THREE, CAT_URL).then(rig => {
        self.rig = rig; root.add(rig.root);
        if (R()) rig.setLook(currentLook());
      }).catch(e => reportError('cat model (' + CAT_URL + ')', e)).finally(() => { self.rigLoading = false; });
    }
    self.refreshLook = () => { if (R()) self.rig?.setLook(currentLook()); };

    /* ---- where it is and what it's doing ---- */
    const pos = { x: SPOTS.middle.x, z: SPOTS.middle.z };
    let frozen = false;
    let heading = 0, path = [], speed = 0, act = 'stand', actName = '', segNow = null;
    let posY = 0, perch = null;
    let jumpT = -1, jumpFrom = null, jumpDur = 0, jumpPhase = null;
    let extra = null, nextExtra = performance.now() + 9000 + index * 3000;
    let holdUntil = 0, faceCam = false;
    let chasing = false, chaseAt = 0, playedAt = 0;
    self.target = null;                          // where its plan is taking it (so two cats don't pick the same spot)

    /* ---- its day, worked out from the clock: the same on both screens ----
       The day is cut into stretches of different lengths (a long nap, a short wander…),
       picked from the cat's own seed, so each cat keeps its own rhythm. */
    let dayCache = { day: -1, list: [] };
    function segmentAt(time){
      const DAY = 864e5, day = Math.floor(time / DAY);
      if (dayCache.day !== day){
        const seed = seedOf(R()?.id || 'cat'), list = [];
        let t = day * DAY, i = 0;
        while (t < (day + 1) * DAY){
          const r = hash(seed + day * 7919 + i * 104729);
          let acc = 0, mood = MOODS[MOODS.length - 1];
          for (const m of MOODS){ acc += m.p; if (r < acc){ mood = m; break; } }
          const len = (mood.min + hash(seed ^ (i * 2654435761 + day)) * (mood.max - mood.min)) * 1000;
          list.push({ i, key: day * 10000 + i, start: t, end: t + len, mood: mood.id });
          t += len; i++;
        }
        dayCache = { day, list };
      }
      const L = dayCache.list;
      let lo = 0, hi = L.length - 1;
      while (lo < hi){ const mid = (lo + hi + 1) >> 1; if (L[mid].start <= time) lo = mid; else hi = mid - 1; }
      return L[lo];
    }
    const taken = () => slots.filter(o => o !== self && o.rec).map(o => o.target);
    function free(list, r){
      // the first spot (starting from a random one) that no other cat is heading for
      const used = taken();
      const start = Math.floor(r * list.length);
      for (let k = 0; k < list.length; k++){ const n = list[(start + k) % list.length]; if (!used.some(u => same(u, n))) return n; }
      return list[start];
    }

    /** What it does in this stretch of its day. */
    function planFor(seg){
      const key = seg.key + seedOf(R()?.id || '') * 13;
      const r1 = hash(key * 7 + 1), r2 = hash(key * 13 + 5), r3 = hash(key * 3 + 11);
      const night = nightAmount() > 0.5;
      if (night && !lights) return { to: free(NIGHT_BEDS, 0), act: 'sleep' };
      if (fullness() < 0.3 && r1 < 0.45) return { to: EAT_AT[index], act: 'beg' };
      if (cheHere() && trustOf('cherryl') >= 80 && r1 < 0.25) return { to: free(['chairChe', 'che'], 0), act: 'loaf' };
      if (me === 'andrei' && ownedByAndrei() && trustOf('andrei') >= 60 && r1 < 0.2) return { to: free(['chairAndrei', 'andrei'], 0), act: 'loaf' };
      switch (seg.mood){
        case 'sleep': {
          const to = free(night ? ['bed', 'sofaSeat', 'chairChe', 'chairAndrei', 'rug'] : ['bed', 'sofaSeat', 'chairChe', 'chairAndrei', 'tvTop', 'rug', 'corner'], r2);
          return { to, act: 'sleep' };
        }
        case 'nap': return { to: free(['sofaSeat', 'rug', 'rugFront', 'tvTop', 'sofaBack', 'corner', 'bed', 'chairChe'], r2), act: 'loaf' };
        case 'perch': { const n = free(PERCHES, r2); return { to: n, act: pick(PERCH[n].acts.filter(a => a !== 'sleep'), () => r3) || 'sit' }; }
        case 'sit': return { to: free(WANDER, r2), act: pick(['sit', 'sit', 'groom', 'loaf'], () => r3) };
        case 'zoom': return { to: free(WANDER, r2), act: 'zoom' };
        default: return { to: free(WANDER, r2), act: 'stand' };
      }
    }

    function goTo(name, a, { run = false } = {}){
      if (jumpT >= 0 && path[0]?.jump){
        // in the middle of a leap: land first, then go (never change course in the air)
        const leap = path[0];
        path = [leap, ...routeTo({ x: leap.x, z: leap.z }, leap.perch || null, name)];
      } else {
        path = routeTo(pos, perch, name); jumpT = -1; jumpPhase = null;
      }
      self.target = name;
      extra = null;
      speed = run ? 1.25 : 0.42;
      act = 'walk'; actName = a;
    }

    // arriving in the room: be wherever its plan says, right away
    function settleAtPlan(){
      const seg = segmentAt(Date.now());
      segNow = seg.key;
      const p = planFor(seg);
      const s = at2(p.to);
      pos.x = s.x; pos.z = s.z; posY = s.y; perch = typeof p.to === 'string' && PERCH[p.to] ? p.to : null;
      self.target = p.to;
      heading = perch ? PERCH[perch].face : hash(seg.key) * Math.PI * 2;
      path = []; act = p.act === 'zoom' ? 'stand' : p.act; actName = act;
    }
    self.settle = settleAtPlan;

    /* ---- the pose: everything eases toward a target ---- */
    const P = { y: 0, pitch: 0, tuck: 0, rearFold: 0, headPitch: 0, headYaw: 0, headRoll: 0, tailUp: 0.35, tailCurl: 0, eyes: 1, ears: 0, arch: 0, puff: 0, paw: 0, curl: 0,
      crouch: 0, reach: 0, rearReach: 0, lean: 0, knead: 0, wiggle: 0, fa1: 0, fa2: 0 };
    const T = { ...P };
    let gait = 0, blinkT = 2, blink = 1, lookYaw = 0, lookT = 0, purring = 0, hissT = 0, bob = 0, mouthT = 0;
    // measured on the model so all four paws rest on the floor (front legs straight under the chest)
    const SIT = { pitch: -0.5, rearFold: 2.2, y: -0.17, fa1: -0.1, fa2: -0.2, headPitch: 0, tailUp: 0.1, tailCurl: 0.9 };
    function poseFor(a){
      Object.assign(T, { y: 0, pitch: 0, tuck: 0, rearFold: 0, headPitch: 0.05, headYaw: lookYaw, headRoll: 0, tailUp: 0.35, tailCurl: 0, eyes: 1, ears: 0, arch: 0, puff: 0, paw: 0, curl: 0,
        crouch: 0, reach: 0, rearReach: 0, lean: 0, knead: 0, wiggle: 0, fa1: 0, fa2: 0 });
      if (a === 'sit' || a === 'beg') Object.assign(T, SIT);
      if (a === 'groom') Object.assign(T, SIT, { headPitch: 0.7, headYaw: 0.4, paw: 1, eyes: 0.3 });
      if (a === 'purr') Object.assign(T, SIT, { eyes: 0.15, tailUp: 0.6, tailCurl: 0.2 });
      if (a === 'loaf') Object.assign(T, { y: -0.13, tuck: 1, tailUp: -0.2, tailCurl: 0.9, eyes: 0.55 });
      if (a === 'sleep') Object.assign(T, { y: -0.135, tuck: 1, curl: 1, headPitch: 0.6, headYaw: 0, headRoll: 0.3, tailUp: -0.2, eyes: 0, ears: 0.3 });
      if (a === 'eat') Object.assign(T, { headPitch: 0.95, pitch: 0.12, y: -0.02, tailUp: 0.55 });
      if (a === 'walk') Object.assign(T, { tailUp: speed > 1 ? 0.3 : 0.65, headPitch: 0 });
      if (a === 'hiss') Object.assign(T, { arch: 1, puff: 1, ears: 1, tailUp: 1.2, headPitch: -0.1, y: 0.02 });
      if (a === 'play') Object.assign(T, { crouch: 0.6, y: -0.04, headPitch: 0.35, tailUp: 0.8, ears: 0.1 });
    }
    // the end of a pounce: a quick hop forward (if there's floor there)
    function pounceHop(){
      if (perch || act === 'walk') return;
      const tx = pos.x + Math.sin(heading) * 0.38, tz = pos.z + Math.cos(heading) * 0.38;
      if (blocked(tx, tz) || !clear(pos, { x: tx, z: tz })) return;
      path = [{ x: tx, z: tz, y: 0, jump: true, small: true, perch: null }];
      act = 'walk'; jumpT = -1;
    }
    const meow = (o = {}) => { sfx.meow(o); mouthT = (o.len || 0.55) + 0.1; };

    /* ---- talk ---- */
    const bubble = document.createElement('div');
    bubble.className = 'cat-thought';
    document.getElementById('screen-room').appendChild(bubble);
    let bubbleUntil = 0;
    function say(text, ms = 3200, kind = ''){
      bubble.textContent = text;
      bubble.className = 'cat-thought show ' + kind;
      bubbleUntil = performance.now() + ms;
    }
    self.say = say;
    const hearts = [];
    function heart(ch = '♥'){
      const h = document.createElement('span'); h.className = 'cat-heart'; h.textContent = ch;
      document.getElementById('screen-room').appendChild(h);
      hearts.push({ el: h, t: 0, dx: (Math.random() - 0.5) * 40 });
    }

    /* ---- petting ---- */
    function petChance(who){
      if (who === 'cherryl') return Math.min(1, 0.55 + trustOf('cherryl') * 0.0045);         // she's a cat person: everyone warms to her
      return ownedByAndrei() ? Math.min(1, 0.6 + trustOf('andrei') * 0.004) : 0.3;          // his own cat likes him; the others: 3 in 10
    }
    self.petChance = petChance;
    function reactPet(ok, by, fleeTo){
      if (jumpT >= 0) return;                      // mid-leap: no time for that
      if (ok){
        act = 'purr'; actName = 'purr'; path = []; purring = 3.2;
        sfx.purr(2.6);
        const strong = trustOf(by) >= 85;
        const lines = by === 'cherryl'
          ? (strong ? ['purrrr ♥ Che ♥', '*headbutts Che*', '*slow blink* ♥'] : ['purrr…', 'mrrp ♥', '*leans into it*'])
          : ownedByAndrei() ? (strong ? ['*headbutts Andrei* ♥', 'my human ♥', 'purrrrr'] : ['purr…', '*leans into Andrei*', 'mrrp'])
          : ['…fine. just this once.', '*tolerates it*', 'purr (don’t tell anyone)'];
        say(pick(lines, Math.random), 3200, 'love');
        for (let i = 0; i < (strong ? 6 : 3); i++) setTimeout(() => heart(), i * 220);
      } else {
        act = 'hiss'; actName = 'hiss'; path = []; hissT = 0.9;
        sfx.hiss();
        say(pick(['HSSS!', 'nope.', by === 'andrei' ? 'not you. NOT YOU.' : 'not now.', by === 'andrei' ? '*zooms away from Andrei*' : '*zooms away*'], Math.random), 2600, 'angry');
        setTimeout(() => { goTo(fleeTo, 'sit', { run: true }); holdUntil = Date.now() + 40000; }, 700);
      }
    }
    self.reactPet = reactPet;
    function farthestSpot(){
      // cats escape upwards: half the time the highest thing far away, else the far side of the room
      const pool = Math.random() < 0.5 ? ['tvTop', 'sofaBack', 'deskChe', 'deskAndrei'] : WANDER;
      let best = pool[0], d = -1;
      for (const n of pool){ const q = at(n); const dd = Math.hypot(q.x - pos.x, q.z - pos.z); if (dd > d){ d = dd; best = n; } }
      return best;
    }
    self.pet = function(){
      if (!R()) return;
      if (act === 'hiss' || (act === 'walk' && speed > 1) || jumpT >= 0) return;
      const who = me;
      const ok = Math.random() < petChance(who);
      const fleeTo = ok ? null : farthestSpot();
      reactPet(ok, who, fleeTo);
      send('cat', { t: 'pet', id: R().id, ok, by: who, fleeTo });
      did(ok ? 'cat-pet' : 'cat-flee');
      if (ok && (who === 'cherryl' || ownedByAndrei())){
        R().trust = { ...(R().trust || {}), [who]: Math.min(100, trustOf(who) + 4) };
        save();
        if (trustOf(who) >= 100) did('cat-trust');
      }
    };

    /* ---- eating ---- */
    self.startEating = function(){
      if (!R()) return;
      setTimeout(() => meow({ pitch: 1.1 + index * 0.06, len: 0.35 }), 400 + index * 350);
      if (index === 0 || Math.random() < 0.5) say(pick(['FOOD!!', '!!! 🐟', 'dinner!'], Math.random), 1800);
      goTo(EAT_AT[index], 'eat', { run: true });
    };

    /* ---- thinking out loud ---- */
    let nextThought = performance.now() + 9000 + index * 6000;
    function think(){
      if (!R()) return;
      let pool = THOUGHTS.idle;
      const tc = trustOf('cherryl');
      if (actName === 'sleep') pool = THOUGHTS.sleep;
      else if (fullness() < 0.3) pool = THOUGHTS.hungry;
      else if (nightAmount() > 0.5 && !lights) pool = THOUGHTS.dark;
      else if (perch && THOUGHTS[perch] && Math.random() < 0.65) pool = THOUGHTS[perch];
      else if (actName === 'groom') pool = THOUGHTS.groom;
      else if (act === 'walk' && speed > 1) pool = THOUGHTS.zoom;
      else if (me === 'cherryl' && tc >= 40 && Math.random() < 0.5) pool = THOUGHTS.che;
      else if (me === 'andrei' && !ownedByAndrei() && Math.random() < 0.3) pool = THOUGHTS.andrei;
      else if (Date.now() - (S.fedAt || 0) < 20 * 60e3) pool = THOUGHTS.full;
      say(pick(pool, Math.random), 3600);
      if (pool === THOUGHTS.hungry || (pool !== THOUGHTS.sleep && Math.random() < 0.3)) meow({ pitch: 0.9 + Math.random() * 0.3 + index * 0.05, sad: pool === THOUGHTS.hungry });
    }
    self.think = think;

    /* ---- being called: come to the floor nearest your screen, and look at you ---- */
    self.comeTo = function(p){
      chasing = false;
      goTo(p, 'sit');
      speed = 0.75;
      faceCam = true;
      holdUntil = Date.now() + 45000;
      say(pick(['coming…', 'mrrp?', '*trots over*', 'you called?'], Math.random), 2200);
      setTimeout(() => meow({ pitch: 1.1, len: 0.4 }), 300);
    };

    /* ---- arriving: out of the box (the first cat) or in through the door ---- */
    self.arrive = function(fromBox, after){
      ensureRig();
      if (fromBox){ pos.x = BOX.x; pos.z = BOX.z + 0.05; heading = 0.5; }
      else { pos.x = SPOTS.door.x; pos.z = SPOTS.door.z; heading = Math.PI * 0.9; }
      posY = 0; perch = null; path = []; jumpT = -1; jumpPhase = null;
      act = actName = 'stand';
      root.visible = true;
      holdUntil = Date.now() + 20000;
      setTimeout(() => {
        meow({ pitch: 1.25, len: 0.4 });
        say(`hi. i’m ${R()?.name || 'new here'}.`, 3600, 'love');
        setTimeout(() => goTo(fromBox ? 'rug' : 'middle', 'sit'), 1600);
        after && after();
      }, fromBox ? 900 : 300);
    };

    /** Give this slot a cat (or none). */
    self.assign = function(rec){
      const was = R()?.id;
      self.rec = rec;
      if (!rec){ root.visible = false; self.target = null; bubble.classList.remove('show'); return; }
      ensureRig();
      if (was !== rec.id){ dayCache.day = -1; root.visible = true; settleAtPlan(); }
      self.refreshLook();
    };

    /* ---- every frame ---- */
    self.update = function(t, dt, now){
      if (!R() || !root.visible || !self.rig) return;

      // chasing the toy
      const toyFresh = now < playUntil && bats < 5;
      const toyDist = Math.hypot(toy.x - pos.x, toy.z - pos.z);
      const hungryBusy = actName === 'eat' && bowlHasFood();
      if (toyFresh && !hungryBusy && act !== 'hiss' && purring <= 0 && !frozen){
        // asleep, it only wakes up for a toy that lands close by
        if (act !== 'sleep' || toyDist < 1.0){
          if (!chasing){ chasing = true; holdUntil = 0; faceCam = false; extra = null; if (act === 'sleep') say('*one eye opens*', 1500); }
          if (now - chaseAt > 380 + index * 60){
            chaseAt = now;
            if (toyDist > 0.32 || perch){
              const was = path.length && path[path.length - 1];
              if (!was || Math.hypot(was.x - toy.x, was.z - toy.z) > 0.15 || perch){
                if (!(act === 'walk' && path[0]?.jump && jumpT >= 0)){      // don't change course mid-leap
                  // the others hang back a little, so they don't all pile onto it
                  const back = 0.22 + index * 0.12;
                  path = routeTo(pos, perch, { x: toy.x - (toy.x - pos.x) / (toyDist || 1) * back, z: toy.z - (toy.z - pos.z) / (toyDist || 1) * back });
                  speed = 1.3 - index * 0.1; act = 'walk'; actName = 'play';
                }
              }
            } else if (now - playedAt > 900 && act !== 'walk'){
              // close enough: pounce on it and bat it away
              playedAt = now;
              path = [{ x: pos.x + (toy.x - pos.x) * 0.5, z: pos.z + (toy.z - pos.z) * 0.5, y: 0, jump: true, small: true, perch: null }];
              act = 'walk'; actName = 'play'; jumpT = -1;
              setTimeout(() => batToy(self, pos), 380);
            }
          }
        }
      } else if (chasing){
        chasing = false;
        holdUntil = Date.now() + 30000;
        if (act === 'play' || actName === 'play'){
          if (jumpT >= 0 && path[0]?.jump){ path = [path[0]]; actName = 'sit'; }
          else { act = actName = 'sit'; path = []; }
        }
        if (Math.random() < 0.5) say(pick(['that was fun', '*proud*', '*pants*', 'again?'], Math.random), 2200);
      }

      // its plan changes when the stretch of its day changes (unless it's busy with you)
      const seg = segmentAt(Date.now());
      if (seg.key !== segNow && !frozen){
        const busy = (actName === 'eat' && bowlHasFood()) || purring > 0 || act === 'hiss' || chasing || Date.now() < holdUntil || jumpT >= 0;
        if (!busy){
          segNow = seg.key;
          faceCam = false;
          const p = planFor(seg);
          if (p.act === 'zoom'){
            // three quick dashes
            const a = p.to, b = pick(WANDER, () => hash(seg.key + 99)), c = pick(WANDER, () => hash(seg.key + 77));
            path = [...routeTo(pos, perch, a), ...route(SPOTS[a], b), ...route(SPOTS[b], c)];
            jumpT = -1; jumpPhase = null; extra = null;
            speed = 1.35; act = 'walk'; actName = 'stand'; self.target = c;
          } else goTo(p.to, p.act);
        }
      }

      // walking and jumping
      const angTo = (want) => ((want - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (act === 'walk'){
        const n = path[0];
        if (!n){
          act = actName === 'eat' && !bowlHasFood() ? 'stand' : actName; actName = act;
        } else if (n.jump){
          // crouch, leap in an arc, land
          if (jumpT < 0){
            jumpT = 0; jumpFrom = { x: pos.x, z: pos.z, y: posY };
            const dist = Math.hypot(n.x - pos.x, n.z - pos.z);
            jumpDur = 0.34 + dist * 0.22 + Math.abs(n.y - posY) * 0.18;
            if (n.y < posY) perch = null;
          }
          jumpT += dt;
          heading += angTo(Math.atan2(n.x - jumpFrom.x, n.z - jumpFrom.z) || heading) * Math.min(1, dt * 10);
          const C = n.small ? 0.12 : 0.32, L = 0.24;
          if (jumpT < C) jumpPhase = 'crouch';
          else if (jumpT < C + jumpDur){
            const u = (jumpT - C) / jumpDur;
            const arc = 0.12 + Math.max(0, n.y - jumpFrom.y) * 0.22 + (n.small ? -0.05 : 0);
            pos.x = jumpFrom.x + (n.x - jumpFrom.x) * u;
            pos.z = jumpFrom.z + (n.z - jumpFrom.z) * u;
            posY = jumpFrom.y + (n.y - jumpFrom.y) * u + arc * 4 * u * (1 - u);
            jumpPhase = u < 0.5 ? 'up' : 'down';
          } else if (jumpT < C + jumpDur + L){
            if (jumpPhase !== 'land') sfx.thump?.(n.small ? 0.5 : 1);
            pos.x = n.x; pos.z = n.z; posY = n.y; jumpPhase = 'land';
          } else {
            perch = n.perch || null; path.shift(); jumpT = -1; jumpPhase = null;
          }
        } else {
          const dx = n.x - pos.x, dz = n.z - pos.z, d = Math.hypot(dx, dz);
          const diff = angTo(Math.atan2(dx, dz));
          heading += diff * Math.min(1, dt * (speed > 1 ? 12 : 6));
          const step = speed * dt * (Math.abs(diff) > 1.2 ? 0.3 : 1);
          if (d <= step){ pos.x = n.x; pos.z = n.z; path.shift(); }
          else { pos.x += dx / d * step; pos.z += dz / d * step; }
          gait += dt * speed * 17;
        }
      } else if (act === 'eat' || act === 'beg'){
        heading += angTo(Math.atan2(BOWL.x - pos.x, BOWL.z - pos.z)) * Math.min(1, dt * 4);     // face the bowl
      } else if (faceCam){
        heading += angTo(Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z)) * Math.min(1, dt * 3);
      } else if (chasing){
        heading += angTo(Math.atan2(toy.x - pos.x, toy.z - pos.z)) * Math.min(1, dt * 6);
      } else if (perch && act !== 'purr' && act !== 'hiss'){
        heading += angTo(PERCH[perch].face) * Math.min(1, dt * 2.5);
      }

      // safety net: whenever it isn't leaping, its paws are on whatever it's standing on
      if (jumpT < 0){
        const ground = perch ? PERCH[perch].h : 0;
        if (Math.abs(posY - ground) > 0.002){
          posY += (ground - posY) * Math.min(1, dt * 10);
          if (Math.abs(posY - ground) < 0.004) posY = ground;
        }
      }

      // little things now and then (only on this screen; they don't move it anywhere)
      if (extra){ extra.t += dt; if (extra.t > extra.dur){ if (extra.kind === 'pounce') pounceHop(); extra = null; } }
      else if (now > nextExtra){
        nextExtra = now + 14000 + Math.random() * 16000;
        const calm = act !== 'walk' && act !== 'eat' && act !== 'purr' && act !== 'hiss' && act !== 'sleep' && act !== 'play' && !chasing;
        if (calm){
          const opts = act === 'loaf' ? ['knead', 'yawn', 'look'] : act === 'stand' && !perch ? ['yawn', 'stretch', 'sniff', 'pounce', 'look'] : ['yawn', 'look', 'look'];
          const kind = pick(opts, Math.random);
          extra = { kind, t: 0, dur: { yawn: 2.2, stretch: 3.2, sniff: 2.4, knead: 5, pounce: 1.6, look: 3.5 }[kind] };
          if (kind === 'yawn' || kind === 'stretch'){ mouthT = 1.3; if (Math.random() < 0.4) say(pick(THOUGHTS[kind], Math.random), 1800); }
          if (kind === 'pounce' && Math.random() < 0.5) say(pick(THOUGHTS.pounce, Math.random), 1400);
          if (kind === 'look') lookYaw = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.4);
        }
      }
      if (act === 'eat'){
        if (!bowlHasFood()){ act = 'sit'; actName = 'sit'; holdUntil = Date.now() + 40000; if (index === 0) say(pick(THOUGHTS.full, Math.random), 3000); }
        else { bob += dt; if (Math.floor(bob * 2) !== Math.floor((bob - dt) * 2) && bob % 2 < 0.5) sfx.crunch(); }
      }
      if (purring > 0){ purring -= dt; if (purring <= 0){ act = 'sit'; actName = 'sit'; holdUntil = Date.now() + 25000; } }
      if (hissT > 0){ hissT -= dt; }

      // pose
      poseFor(act);
      if (extra){
        const e = extra.kind, f = Math.sin(Math.min(1, extra.t / extra.dur) * Math.PI);    // ease in and out
        if (e === 'yawn') Object.assign(T, { eyes: 0.1, headPitch: T.headPitch - 0.4 * f });
        if (e === 'stretch') Object.assign(T, { reach: f, pitch: 0.35 * f, y: -0.05 * f, tailUp: 0.9, eyes: 0.25, rearFold: 0, tuck: 0 });
        if (e === 'sniff') Object.assign(T, { headPitch: 0.75 * f, pitch: 0.08 * f });
        if (e === 'knead') Object.assign(T, { knead: f, tuck: T.tuck * 0.4, crouch: 0.4, eyes: 0.3 });
        if (e === 'pounce') Object.assign(T, { crouch: 1, y: -0.06, wiggle: f, headPitch: -0.1, tailUp: -0.1, ears: 0.15, rearFold: 0, pitch: 0, tuck: 0 });
      }
      if (jumpPhase === 'crouch') Object.assign(T, { crouch: 1, y: -0.06, tailUp: 0.1, rearFold: 0, pitch: 0, tuck: 0, curl: 0 });
      if (jumpPhase === 'up') Object.assign(T, { reach: 1, rearReach: 1, lean: 0.35, tailUp: 0.2, crouch: 0 });
      if (jumpPhase === 'down') Object.assign(T, { reach: 0.6, rearReach: 0.3, lean: -0.25, tailUp: 0.4, crouch: 0 });
      if (jumpPhase === 'land') Object.assign(T, { crouch: 0.7, lean: -0.1, y: -0.04, tailUp: 0.5 });
      if (act === 'purr' || (faceCam && act !== 'walk')){
        v3.copy(camera.position).sub(root.position);
        T.headYaw = Math.max(-1, Math.min(1, ((Math.atan2(v3.x, v3.z) - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      }
      lookT -= dt;
      if (lookT < 0){ lookT = 3 + Math.random() * 6; lookYaw = (Math.random() - 0.5) * 1.2; }
      // slower, softer changes from one pose to the next (quicker only in a leap)
      const k = Math.min(1, dt * (jumpPhase ? 16 : act === 'walk' ? 6 : 3.2));
      for (const key in P) P[key] += (T[key] - P[key]) * k;
      // a tipped-up body always sits on folded back legs (no half-standing, half-sitting in between)
      if (P.pitch < 0){
        const f = Math.min(1, -P.pitch / 0.5);
        P.rearFold = Math.max(P.rearFold, 2.2 * f);
        P.y = Math.min(P.y, -0.17 * f);
      }

      blinkT -= dt;
      if (blinkT < 0){ blinkT = 2.5 + Math.random() * 5; blink = 0; }
      blink = Math.min(1, blink + dt * 7);

      // apply
      root.position.set(pos.x, FLOOR + posY, pos.z);
      root.rotation.y = heading;
      const walking = act === 'walk' && path.length > 0 && !path[0].jump;
      if (mouthT > 0) mouthT -= dt;
      self.rig.pose({ ...P, eyes: Math.min(P.eyes, blink) }, {
        t: t + index * 1.7, gait,
        amp: walking ? (speed > 1 ? 0.75 : 0.45) : 0,
        run: walking && speed > 1,
        breathe: Math.sin((t + index) * (act === 'sleep' ? 1.4 : 2.4)) * 0.02 + (purring > 0 ? Math.sin(t * 150) * 0.004 : 0),
        chew: act === 'eat' ? Math.sin(t * 9) * 0.08 : extra?.kind === 'sniff' ? Math.sin(t * 22) * 0.04 : 0,
        mouth: act === 'hiss' && hissT > 0 ? 1 : mouthT > 0 ? Math.sin(Math.min(1, mouthT / 0.6) * Math.PI) : 0,
      });

      // speech bubble and hearts follow the head
      const visible = !document.body.classList.contains('in-pc') && !document.querySelector('.overlay-screen.show');
      (self.rig.head || root).getWorldPosition(v3); v3.y += 0.12;
      v3.project(camera);
      const sx = (v3.x + 1) / 2 * innerWidth, sy = (1 - v3.y) / 2 * innerHeight;
      if (now > bubbleUntil || !visible || v3.z > 1) bubble.classList.remove('show');
      bubble.style.transform = `translate(${sx}px, ${sy}px)`;
      for (let i = hearts.length - 1; i >= 0; i--){
        const h = hearts[i]; h.t += dt;
        h.el.style.transform = `translate(${sx + h.dx * h.t}px, ${sy - h.t * 70}px) scale(${1 + h.t * 0.3})`;
        h.el.style.opacity = String(Math.max(0, 1 - h.t / 1.6));
        if (h.t > 1.6){ h.el.remove(); hearts.splice(i, 1); }
      }
      // one cat talks at a time
      if (now > nextThought){
        nextThought = now + 22000 + Math.random() * 26000;
        if (visible && !slots.some(o => o !== self && o.talking?.())) think();
      }
    };
    self.talking = () => bubble.classList.contains('show');

    self.label = () => {
      const r = R(); if (!r) return null;
      const c = petChance(me);
      const sub = actName === 'sleep' ? 'asleep — pet gently'
        : me === 'andrei' && !ownedByAndrei() ? 'pet? (it might run…)'
        : trustOf(me) >= 85 ? 'adores you ♥' : c >= 0.7 ? 'likes you · pet them' : 'still shy · pet them';
      return { label: r.name || 'A cat', sub };
    };
    // for testing
    self.debug = {
      place(name, a = 'sit', h = 0){ const sp = at2(name); pos.x = sp.x; pos.z = sp.z; posY = sp.y; perch = typeof name === 'string' && PERCH[name] ? name : null; heading = h; path = []; jumpT = -1; jumpPhase = null; act = actName = a; frozen = true; },
      go(name, a = 'sit'){ frozen = true; goTo(name, a); },
      extra(kind){ extra = { kind, t: 0, dur: 2.5 }; },
      free(){ frozen = false; },
      segment: () => segmentAt(Date.now()),
      get state(){ return { pos: { ...pos }, posY, perch, jumpPhase, act, actName, heading, steps: path.length, chasing, faceCam, target: self.target, name: R()?.name }; },
    };
    return self;
  }

  const slots = [];
  for (let i = 0; i < MAX_CATS; i++) slots.push(makeSlot(i));
  const catSlots = () => slots.filter(s => s.rec);
  const slotOf = id => slots.find(s => s.rec?.id === id);

  /** Line up the slots with the shared list of cats. */
  let boxOpening = false, boxT = 0, boxWiggle = 0;
  function sync(){
    const list = S.list || [];
    slots.forEach((s, i) => { const r = list[i] || null; if (s.rec?.id !== r?.id) s.assign(r); else { s.rec = r; s.refreshLook(); } });
    const any = list.length > 0;
    bowl.g.visible = bed.g.visible = yarn.g.visible = any;
    box.g.visible = !any || boxOpening;
    if (S.toy && !toy.dragging && performance.now() - toy.moved > 8000){ toy.x = S.toy.x; toy.z = S.toy.z; }
  }

  /* ---- feeding (one bowl for everyone) ---- */
  function feed(){
    if (!catSlots().length) return;
    if (bowlHasFood()){ toast('the bowl is already full', 2200); return; }
    S.fedAt = Date.now(); S.fedBy = me;
    S.list.forEach(c => { if (me === 'cherryl' || c.owner === 'andrei' || c.owner === 'both') c.trust = { ...(c.trust || {}), [me]: Math.min(100, (c.trust?.[me] || 0) + 6) }; });
    save();
    sfx.pour();
    did('cat-feed');
    catSlots().forEach(s => s.startEating());
    if (S.list.some(c => (c.trust?.[me] || 0) >= 100)) did('cat-trust');
  }

  /* ---- adopting ---- */
  function openAdopt(){
    const list = S.list || [];
    if (list.length >= MAX_CATS){ toast(`${MAX_CATS} cats is a full house 🐾`, 2400); return; }
    const first = list.length === 0;
    const isAndrei = me === 'andrei';
    let coat = null, owner = me;
    const el = openPanel({ className: 'cat-panel adopt', html: `
      <p class="rp-eyebrow">${first ? 'a cardboard box' : 'adopt a cat'}</p>
      <h2 class="rp-title">${first ? 'Something is in the box…' : 'Someone new is at the door…'}</h2>
      <p class="cat-lead">${first ? 'It’s warm. It just went <i>mew</i>.' : 'Pick their coat, or let it be a surprise.'}</p>
      <label class="cat-field"><span>What’s their name?</span><input class="ui-input cat-name-in" maxlength="24" placeholder="Mochi, Snow, Ube…"></label>
      <div class="cat-group"><span>Whose cat?</span><div class="cat-chips adopt-owner">
        <button data-v="${me}" class="on">Mine</button><button data-v="${me === 'andrei' ? 'cherryl' : 'andrei'}">${me === 'andrei' ? 'Che’s' : 'Andrei’s'}</button><button data-v="both">Ours</button>
      </div></div>
      <div class="cat-group"><span>Coat</span><div class="cat-coats adopt-coats">${COATS.map(c => `<button data-v="${c.id}"><i style="background:${coatSwatch(c)}"></i>${esc(c.name)}</button>`).join('')}</div></div>
      <div class="cat-choices">
        <button class="ui-btn primary" data-c="pick">Adopt</button>
        <button class="ui-btn" data-c="random">Surprise me</button>
        ${isAndrei ? `<button class="ui-btn" data-c="che">Let Che design it</button>` : ''}
      </div>
      <p class="cat-note">Eyes, collar and build can be changed any time from the cat bed.</p>` });
    el.querySelectorAll('.adopt-owner button').forEach(b => b.addEventListener('click', () => {
      owner = b.dataset.v;
      el.querySelectorAll('.adopt-owner button').forEach(x => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('.adopt-coats button').forEach(b => b.addEventListener('click', () => {
      coat = b.dataset.v;
      el.querySelectorAll('.adopt-coats button').forEach(x => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      const name = el.querySelector('.cat-name-in').value.trim() || pick(['Mochi', 'Tofu', 'Ube', 'Snow', 'Biscuit', 'Miso'], Math.random);
      const c = b.dataset.c;
      const look = c === 'che' ? { ...randomLook(), coat: 'blue', pending: true }
        : c === 'pick' && coat ? { ...randomLook(), coat } : randomLook();
      const rec = { ...blankCat(), name, look, owner, trust: { andrei: owner !== 'cherryl' ? 10 : 0, cherryl: 10 } };
      S = { ...S, list: [...list, rec] };
      if (first){ boxOpening = true; boxT = 0; }
      save();
      sync();
      closePanel(true);
      did('cat-adopt');
      if (S.list.length >= 2) did('cat-family');
      const slot = slotOf(rec.id);
      slot?.arrive(first);
    }));
    setTimeout(() => el.querySelector('.cat-name-in')?.focus(), 300);
  }

  /* ---- the panel: every cat, its name, look and how it's doing ---- */
  let panel = null, tab = 'about', selId = null;
  function openCatPanel({ tab: t, id } = {}){
    if (!(S.list || []).length){ openAdopt(); return; }
    if (t) tab = t;
    if (id) selId = id;
    panel = openPanel({ className: 'cat-panel', onClose: () => { panel = null; }, html: '<div class="cat-body"></div>' });
    render();
  }
  function render(){
    if (!panel) return;
    const list = S.list || [];
    if (!list.length){ closePanel(); return; }
    const rec = list.find(c => c.id === selId) || list[0];
    selId = rec.id;
    const slot = slotOf(rec.id);
    const locked = !!rec.nameLocked;
    const look = normalLook(rec.look || randomLook());
    const tf = Math.round(fullness() * 100);
    const tc = rec.trust?.cherryl || 0, ta = rec.trust?.andrei || 0;
    const hearts = n => '♥♥♥♥♥'.slice(0, Math.round(n / 20)).padEnd(5, '♡');
    const andreiRow = rec.owner === 'andrei' || rec.owner === 'both'
      ? `<div class="cat-meter"><span>Trusts Andrei</span><i class="pink"><b style="width:${ta}%"></b></i><em class="hearts">${hearts(ta)}</em></div>`
      : `<div class="cat-meter"><span>Trusts Andrei</span><i class="grey"><b style="width:30%"></b></i><em>lets you pet 3 in 10</em></div>`;
    const body = panel.querySelector('.cat-body');
    body.innerHTML = `
      <p class="rp-eyebrow">${list.length > 1 ? 'our cats' : 'our cat'}</p>
      <div class="cat-picker">
        ${list.map(c => `<button data-id="${c.id}" class="${c.id === rec.id ? 'on' : ''}"><i style="background:${coatSwatch(COATS.find(x => x.id === normalLook(c.look).coat) || COATS[0])}"></i>${esc(c.name || 'cat')}</button>`).join('')}
        ${list.length < MAX_CATS ? `<button class="add" data-a="adopt">＋ Adopt</button>` : ''}
      </div>
      <h2 class="rp-title">${esc(rec.name || 'our cat')} ${locked ? '<span class="cat-lockmark" title="Name and look are locked">🔒</span>' : ''}</h2>
      <div class="cap-tabs cat-tabs"><button data-t="about">How they’re doing</button><button data-t="look">Name &amp; look</button></div>
      <div class="cat-tab" data-tab="about">
        <div class="cat-meter"><span>Fullness</span><i><b style="width:${tf}%"></b></i><em>${tf < 30 ? 'hungry' : tf < 70 ? 'okay' : 'full'}</em></div>
        <div class="cat-meter"><span>Trusts Che</span><i class="pink"><b style="width:${tc}%"></b></i><em class="hearts">${hearts(tc)}</em></div>
        ${andreiRow}
        <div class="cat-row"><button class="ui-btn primary" data-a="feed">🐟 Fill the bowl</button><button class="ui-btn" data-a="call">Call ${esc(rec.name || 'them')}</button></div>
        <p class="cat-note">${S.fedAt ? `bowl last filled ${ago(S.fedAt)}${S.fedBy ? ' by ' + esc(shortOf(S.fedBy)) : ''}` : 'never fed yet'} · ${rec.owner === 'both' ? 'both of yours' : esc(shortOf(rec.owner || 'cherryl')) + '’s'} · adopted by ${esc(shortOf(rec.adoptedBy || 'andrei'))}</p>
      </div>
      <div class="cat-tab" data-tab="look">
        ${look.pending ? `<p class="cat-banner">${me === 'cherryl' ? 'Andrei left this one for you: make it look however you like ♥' : 'Waiting for Che to design them.'}</p>` : ''}
        <label class="cat-field"><span>Name</span><input class="ui-input cat-name-in" maxlength="24" value="${esc(rec.name || '')}" ${locked ? 'disabled' : ''}></label>
        <div class="cat-group"><span>Coat</span><div class="cat-coats" data-k="coat">${COATS.map(c => `<button data-v="${c.id}" class="${look.coat === c.id ? 'on' : ''}"><i style="background:${coatSwatch(c)}"></i>${esc(c.name)}</button>`).join('')}</div></div>
        <div class="cat-group"><span>Eyes</span><div class="cat-swatches" data-k="eyes">${EYES.map(e => `<button style="background:${e.c}" title="${e.id}" data-v="${e.id}" class="${look.eyes === e.id ? 'on' : ''}"></button>`).join('')}</div></div>
        <div class="cat-group"><span>Collar</span><div class="cat-swatches" data-k="collar">${COLLARS.map(c => `<button style="background:${c.c}" title="${c.id}" data-v="${c.id}" class="${look.collar === c.id ? 'on' : ''} ${c.id === 'none' ? 'none' : ''}"></button>`).join('')}</div></div>
        <div class="cat-group"><span>Build</span><div class="cat-chips" data-k="build">${BUILDS.map(b => `<button data-v="${b.id}" class="${look.build === b.id ? 'on' : ''}">${b.name}</button>`).join('')}</div></div>
        <div class="cat-row">
          <button class="ui-btn" data-a="random" ${locked ? 'disabled' : ''}>🎲 Surprise me</button>
          <button class="ui-btn ${locked ? '' : 'primary'}" data-a="lock">${locked ? '🔓 Unlock' : '🔒 Lock name & look'}</button>
        </div>
        <p class="cat-note">${locked ? 'Locked — nobody can change the name or look until it’s unlocked.' : 'Changes save as you pick them. Lock it once it’s just right.'}</p>
        ${!locked && list.length > 1 ? `<button class="cat-rehome" data-a="rehome">Rehome ${esc(rec.name || 'this cat')}…</button>` : ''}
      </div>`;
    body.querySelectorAll('.cat-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.t === tab);
      b.addEventListener('click', () => { tab = b.dataset.t; render(); });
    });
    body.querySelectorAll('.cat-tab').forEach(x => { x.hidden = x.dataset.tab !== tab; });
    body.querySelectorAll('.cat-picker [data-id]').forEach(b => b.addEventListener('click', () => { selId = b.dataset.id; render(); }));
    body.querySelector('[data-a="adopt"]')?.addEventListener('click', () => { closePanel(true); setTimeout(openAdopt, 250); });
    const nameIn = body.querySelector('.cat-name-in');
    nameIn?.addEventListener('change', () => {
      if (rec.nameLocked) return;
      const v = nameIn.value.trim().slice(0, 24);
      if (v && v !== rec.name){ rec.name = v; save(); render(); }
    });
    nameIn?.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
    body.querySelectorAll('[data-k] button').forEach(b => b.addEventListener('click', () => {
      if (rec.nameLocked){ toast('it’s locked — unlock it first', 2000); return; }
      const k = b.parentElement.dataset.k;
      const was = !!rec.look?.pending;
      rec.look = { ...normalLook(rec.look || randomLook()), [k]: b.dataset.v, pending: false };
      save(); slot?.refreshLook();
      if (was || me === 'cherryl') did('cat-design');
      render();
    }));
    body.querySelector('[data-a="random"]')?.addEventListener('click', () => {
      if (rec.nameLocked) return;
      rec.look = { ...randomLook(), pending: false };
      save(); slot?.refreshLook(); render();
      sfx.meow({ pitch: 1.2, len: 0.3 });
    });
    body.querySelector('[data-a="lock"]')?.addEventListener('click', async () => {
      if (rec.nameLocked){
        if (!await showConfirm(`Unlock ${rec.name}’s name and look so they can be changed?`, 'Unlock', 'Unlock')) return;
        rec.nameLocked = false;
      } else rec.nameLocked = true;
      save(); render();
    });
    body.querySelector('[data-a="rehome"]')?.addEventListener('click', async () => {
      if (!await showConfirm(`Rehome ${rec.name}? They’ll leave the room for good.`, 'Rehome', 'Keep them')) return;
      S = { ...S, list: S.list.filter(c => c.id !== rec.id) };
      selId = null; save(); sync(); render();
    });
    body.querySelector('[data-a="feed"]')?.addEventListener('click', () => { feed(); setTimeout(render, 200); });
    body.querySelector('[data-a="call"]')?.addEventListener('click', () => {
      if (!slot) return;
      if (me === 'andrei' && rec.owner !== 'andrei' && Math.random() < 0.3){ slot.say('*pretends not to hear Andrei*', 2600); closePanel(); return; }
      const p = nearestToScreen();
      slot.comeTo(p);
      send('cat', { t: 'call', id: rec.id, x: p.x, z: p.z });
      closePanel();
    });
  }
  /** The clear bit of floor closest to your screen that you can see right now. */
  function nearestToScreen(){
    const v = new THREE.Vector3();
    const cx = camera.position.x, cz = camera.position.z;
    let best = null, bestD = Infinity;
    for (let x = BOUNDS[0] + 0.15; x < BOUNDS[1]; x += 0.15){
      for (let z = BOUNDS[2] + 0.15; z < BOUNDS[3]; z += 0.15){
        if (blocked(x, z) || blocked(x + 0.15, z) || blocked(x - 0.15, z) || blocked(x, z + 0.15) || blocked(x, z - 0.15)) continue;
        v.set(x, FLOOR + 0.2, z).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 0.7 || v.y < -0.75 || v.y > 0.6) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (d < 0.9) continue;
        if (d < bestD){ bestD = d; best = { x, z }; }
      }
    }
    return best || { x: SPOTS.middle.x, z: SPOTS.middle.z };
  }
  window.addEventListener('ourroom:cat-panel', () => openCatPanel());

  /* ---- the other screen ---- */
  onMessage('cat', m => {
    if (!m) return;
    const slot = m.id ? slotOf(m.id) : slots[0];
    if (m.t === 'pet' && slot?.rec) slot.reactPet(m.ok, m.by, m.fleeTo);
    if (m.t === 'call' && slot?.rec && typeof m.x === 'number') slot.comeTo({ x: m.x, z: m.z });
    if (m.t === 'toy'){ toy.x = m.x; toy.z = m.z; toy.vx = m.vx || 0; toy.vz = m.vz || 0; toy.moved = performance.now(); if (performance.now() > playUntil - 19000) startPlay(); }
  });
  onShared('cats', (v, by) => {
    const before = new Set((S.list || []).map(c => c.id));
    const wasFed = S.fedAt;
    const hadNone = !(S.list || []).length;
    S = { list: [], fedAt: 0, ...(v || {}) };
    const added = (S.list || []).filter(c => !before.has(c.id));
    if (added.length && hadNone){ boxOpening = true; boxT = 0; }
    sync();
    added.forEach(c => { slotOf(c.id)?.arrive(hadNone); toast(`${shortOf(by)} adopted ${c.name} 🐈`, 3200); });
    if (S.fedAt && S.fedAt !== wasFed && Date.now() - S.fedAt < 60e3) catSlots().forEach(s => s.startEating());
    render();
  });

  /* ---- start (moving an older single-cat save over to the list) ---- */
  loadShared().then(() => {
    const saved = getShared('cats');
    if (saved?.list){ S = { list: [], fedAt: 0, ...saved }; }
    else {
      const old = getShared('cat');
      if (old?.adopted){
        const { adopted, fedAt, fedBy, toy: oldToy, ...rest } = old;
        // the first cat was always Tilo, Che's: it keeps its 3-in-10 for Andrei
        S = { list: [{ ...blankCat(), ...rest, id: 'c1', owner: 'cherryl' }], fedAt: fedAt || 0, fedBy, toy: oldToy };
        save();
      }
    }
    sync();
    if (bowlHasFood()) catSlots().forEach(s => s.startEating());
    const pending = (S.list || []).find(c => c.look?.pending);
    if (me === 'cherryl' && pending) setTimeout(() => toast(`Andrei left ${pending.name} for you to design ♥ — tap the cat bed`, 5200), 4000);
  }).catch(e => reportError('cat', e));

  /* ---- the toy: drag it around (or flick it), and the cats go after it ---- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(FLOOR + 0.05));
  const hitPt = new THREE.Vector3();
  const trail = [];
  function pointerFloor(e){
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray;
  }
  function placeToy(x, z){
    x = Math.max(BOUNDS[0] + 0.1, Math.min(BOUNDS[1] - 0.1, x));
    z = Math.max(BOUNDS[2] + 0.1, Math.min(BOUNDS[3] - 0.1, z));
    if (blocked(x, z)) return false;
    toy.x = x; toy.z = z; return true;
  }
  function shareToy(force){
    const n = performance.now();
    if (!force && n - toy.sentAt < 140) return;
    toy.sentAt = n;
    send('cat', { t: 'toy', x: +toy.x.toFixed(3), z: +toy.z.toFixed(3), vx: +toy.vx.toFixed(3), vz: +toy.vz.toFixed(3) });
  }
  function saveToy(){
    if (!catSlots().length) return;
    S.toy = { x: +toy.x.toFixed(2), z: +toy.z.toFixed(2) };
    save();
  }
  function startPlay(){ playUntil = performance.now() + 20000; bats = 0; }
  window.addEventListener('pointerdown', e => {
    if (e.target !== renderer.domElement || !yarn.g.visible || document.body.classList.contains('room-focused')) return;
    pointerFloor(e);
    if (!ray.intersectObject(yarn.grab, false).length) return;
    e.stopPropagation(); e.preventDefault();
    toy.dragging = true; toy.vx = toy.vz = 0; trail.length = 0;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch(_){}
  }, { capture: true });
  window.addEventListener('pointermove', e => {
    if (!toy.dragging) return;
    pointerFloor(e);
    if (!ray.ray.intersectPlane(floorPlane, hitPt)) return;
    if (placeToy(hitPt.x, hitPt.z)){
      trail.push({ x: toy.x, z: toy.z, t: performance.now() });
      if (trail.length > 6) trail.shift();
      toy.moved = performance.now();
      playUntil = Math.max(playUntil, performance.now() + 20000); bats = 0;
      shareToy(false);
    }
  }, { capture: true });
  const endDrag = () => {
    if (!toy.dragging) return;
    toy.dragging = false;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    if (trail.length < 2){ tossToy(); return; }
    const a = trail[0], b = trail[trail.length - 1];
    if (a && b && b.t - a.t > 10){
      const s2 = 1000 / (b.t - a.t);
      toy.vx = Math.max(-3, Math.min(3, (b.x - a.x) * s2));
      toy.vz = Math.max(-3, Math.min(3, (b.z - a.z) * s2));
    }
    toy.moved = performance.now();
    startPlay();
    shareToy(true);
    setTimeout(saveToy, 2500);
    did('cat-play');
  };
  window.addEventListener('pointerup', endDrag, { capture: true });
  window.addEventListener('pointercancel', endDrag, { capture: true });
  function tossToy(){
    const a = Math.random() * Math.PI * 2;
    toy.vx = Math.cos(a) * 1.6; toy.vz = Math.sin(a) * 1.6;
    toy.moved = performance.now();
    startPlay();
    shareToy(true); setTimeout(saveToy, 2500);
    did('cat-play');
  }
  function rollToy(dt){
    const sp = Math.hypot(toy.vx, toy.vz);
    if (!toy.dragging && sp > 0.01){
      const nx = toy.x + toy.vx * dt, nz = toy.z + toy.vz * dt;
      const out = (x, z) => blocked(x, z) || x < BOUNDS[0] + 0.1 || x > BOUNDS[1] - 0.1 || z < BOUNDS[2] + 0.1 || z > BOUNDS[3] - 0.1;
      if (!out(nx, nz)){ toy.x = nx; toy.z = nz; }
      else {
        if (out(nx, toy.z)) toy.vx *= -0.6;
        if (out(toy.x, nz)) toy.vz *= -0.6;
      }
      const f = Math.exp(-1.7 * dt); toy.vx *= f; toy.vz *= f;
      if (Math.hypot(toy.vx, toy.vz) < 0.03){ toy.vx = toy.vz = 0; }
      toy.moved = performance.now();
      yarn.ball.rotation.x += toy.vz * dt / 0.075;
      yarn.ball.rotation.z -= toy.vx * dt / 0.075;
    }
    yarn.g.position.set(toy.x, FLOOR, toy.z);
  }
  // a cat bats it away
  function batToy(slot, from){
    const ang = Math.atan2(toy.z - from.z, toy.x - from.x) + (Math.random() - 0.5) * 1.6;
    const power = 0.9 + Math.random() * 1.2;
    toy.vx = Math.cos(ang) * power; toy.vz = Math.sin(ang) * power;
    toy.moved = performance.now();
    bats++;
    sfx.pop();
    if (Math.random() < 0.35) slot.say(pick(['*bap*', 'gotcha!', '*pounce*', 'mine!!', '*tail flick*'], Math.random), 1300);
  }

  /* ---- every frame ---- */
  onFrame((t, dt) => {
    const now = performance.now();
    if (box.g.visible){
      boxWiggle -= dt;
      if (boxWiggle < -4 - hash(Math.floor(t)) * 5) boxWiggle = 0.8;
      const w = boxWiggle > 0 ? Math.sin(t * 28) * 0.05 * boxWiggle : 0;
      box.g.rotation.z = w; box.g.rotation.x = w * 0.5;
      box.flaps.forEach((f, i) => { f.rotation.x = boxOpening ? Math.min(2.2, boxT * 4) : (boxWiggle > 0 ? Math.abs(Math.sin(t * 20 + i)) * 0.15 : 0); });
      if (boxOpening){ boxT += dt; if (boxT > 1.2){ box.g.visible = false; boxOpening = false; } }
    }
    if (!catSlots().length) return;
    rollToy(dt);
    bowl.food.visible = !!bowlHasFood();
    for (const s of slots) s.update(t, dt, now);
  });

  // for testing: the first cat, plus every slot
  window.__ourroomCat = {
    get slots(){ return slots; },
    get state(){ return { ...slots[0].debug.state, toy: { x: toy.x, z: toy.z, vx: toy.vx, vz: toy.vz }, cats: S.list }; },
    place: (...a) => slots[0].debug.place(...a),
    go: (...a) => slots[0].debug.go(...a),
    extra: k => slots[0].debug.extra(k),
    free: () => slots.forEach(s => s.debug.free()),
    pet: () => slots[0].pet(), feed, route,
    screenSpot: () => nearestToScreen(),
    adopt: (name, coat, owner = me) => { const rec = { ...blankCat(), name, owner, look: { ...randomLook(), coat } }; S = { ...S, list: [...(S.list || []), rec] }; save(); sync(); slotOf(rec.id)?.arrive(false); },
    probe(x, z){ const rc = new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)); const h = rc.intersectObject(roomModel, true)[0]; return h ? +h.point.y.toFixed(3) : null; },
  };

  /* ---- what you can click ---- */
  const slotByHit = obj => slots.find(s => s.rec && obj === s.hit);
  return {
    key: 'cat',
    objects: [...slots.map(s => s.hit), bowl.g, bed.g, box.g, yarn.g],
    cursor: h => slotByHit(h.object) ? HAND(false) : isIn(h.object, yarn.g) ? 'grab' : null,
    label: h => {
      const names = (S.list || []).map(c => c.name).filter(Boolean);
      const who = names.length > 1 ? 'the cats' : names[0] || 'the cat';
      if (isIn(h.object, box.g)) return { label: 'A cardboard box', sub: 'something inside just moved…' };
      if (isIn(h.object, yarn.g)) return { label: 'Ball of yarn', sub: `drag it or tap it — ${who} will chase it` };
      if (isIn(h.object, bowl.g)) return { label: names.length > 1 ? 'The cats’ bowl' : `${names[0] || 'The cat'}’s bowl`, sub: bowlHasFood() ? 'full of food' : fullness() < 0.3 ? 'empty — and someone is hungry' : 'tap to fill it' };
      if (isIn(h.object, bed.g)) return { label: 'The cat bed', sub: 'names, looks, adopt another' };
      return slotByHit(h.object)?.label() || { label: 'A cat', sub: '' };
    },
    click: h => {
      if (isIn(h.object, box.g)) return openAdopt();
      if (isIn(h.object, yarn.g)) return tossToy();
      if (isIn(h.object, bowl.g)) return feed();
      if (isIn(h.object, bed.g)) return openCatPanel();
      const slot = slotByHit(h.object);
      if (!slot) return;
      renderer.domElement.style.cursor = HAND(true);
      setTimeout(() => { if (renderer.domElement.style.cursor.includes('svg')) renderer.domElement.style.cursor = HAND(false); }, 650);
      slot.pet();
    },
    enabled: () => true,
  };
}