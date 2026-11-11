import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  woodCanvases, plasterCanvas, clothCanvas, pageEdgeCanvas,
  spineCanvases, glowCanvas, photoCanvas, leafCanvas, aoCanvas
} from './shelf-textures.js';

/**
 * The bookshelf as a real 3D bookcase.
 *
 * Units are centimetres, so proportions are the proportions of real furniture
 * and real books. Everything is lit physically: a warm key light from above
 * casting soft shadows, warm LED strips under each shelf, a candle, and a room
 * environment for reflections on the varnish and the gold foil.
 *
 *   const shelf = createShelf3D(overlayEl, { onPick, onHover });
 *   shelf.show(books)     // books: [{ year, cover, count, palette:{a,b} }]
 *   shelf.hide()
 */

export const PER_SHELF = 12;
export const MIN_SHELVES = 3;

// the furniture, in cm
const IN_W   = 112;    // clear width between the sides
const SIDE   = 3.2;    // side panel thickness
const DEPTH  = 32;     // carcass depth
const PLANK  = 2.6;    // shelf thickness
const CLEAR  = 37;     // clear height of one shelf (scrapbooks are tall)
const PLINTH = 8;      // kick at the bottom
const BACK   = 1.2;    // back panel thickness

const FRONT = DEPTH / 2;                    // z of the carcass front
const BACK_Z = -DEPTH / 2 + BACK;           // z of the back panel's face

/* ---------------- shared materials ---------------- */

let shared = null;
function sharedMaterials(){
  if (shared) return shared;

  const tex = (canvas, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const walnut = woodCanvases({ seed: 7, figure: 0.75 });
  const backWood = woodCanvases({ seed: 19, dark:'#2a170c', mid:'#3a2212', light:'#4e321d' });
  const floorWood = woodCanvases({ seed: 31, dark:'#2b1c11', mid:'#3d2a1b', light:'#533924', figure: 0.28 });

  const varnish = (w, extra = {}) => new THREE.MeshPhysicalMaterial({
    map: tex(w.color), bumpMap: tex(w.bump, false), bumpScale: 0.35,
    roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.32,
    envMapIntensity: 0.55, ...extra
  });

  shared = {
    tex,
    wood:   varnish(walnut),
    back:   varnish(backWood, { roughness: 0.62, clearcoat: 0.12, envMapIntensity: 0.3 }),
    floor:  varnish(floorWood, { roughness: 0.55, clearcoat: 0.25 }),
    wall:   new THREE.MeshStandardMaterial({ map: tex(plasterCanvas({ base:'#3e3832' })), roughness: 0.95, envMapIntensity: 0.2 }),
    ao:     tex(aoCanvas(), false),
    cloth:  tex(clothCanvas(), false),
    pages:  tex(pageEdgeCanvas()),
    brass:  new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 }),
    paper:  new THREE.MeshStandardMaterial({ color: 0xece0c4, roughness: 0.9 }),
    glow:   tex(glowCanvas()),
  };
  shared.cloth.repeat.set(6, 6);
  return shared;
}

/**
 * Rewrite a box's UVs in world units so grain is the same scale on every face,
 * and runs along the part's long axis. Without this a 2.6cm plank edge gets
 * the whole texture squashed into it and reads as dense stripes.
 */
function woodUV(geo, longAxis, scale = 1){
  const offU = Math.random() * 3, offV = Math.random() * 3;
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const U = 110 * scale, V = 110 * scale * 256 / 1024;   // one repeat covers 110 x 27.5 cm at scale 1
  const axes = ['x', 'y', 'z'];
  for (let i = 0; i < pos.count; i++){
    const p = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const k = n.indexOf(Math.max(...n));
    const face = axes.filter((_, j) => j !== k);
    const u = face.includes(longAxis) ? longAxis : face[0];
    const v = face.find(a => a !== u);
    uv.setXY(i, p[u] / U + offU, p[v] / V + offV);
  }
  uv.needsUpdate = true;
  return geo;
}

function woodBox(w, h, d, mat, longAxis, { round = 0, shadows = true } = {}){
  const geo = round
    ? new RoundedBoxGeometry(w, h, d, 3, round)
    : new THREE.BoxGeometry(w, h, d);
  woodUV(geo, longAxis);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows; m.receiveShadow = true;
  return m;
}

/* ---------------- the bookcase ---------------- */

function shelfY(i){                       // top surface of shelf i, counted from the bottom
  return PLINTH + PLANK + i * (CLEAR + PLANK);
}

function buildCase(shelves){
  const M = sharedMaterials();
  const g = new THREE.Group();
  const innerTop = shelfY(shelves - 1) + CLEAR;        // underside of the top board
  const totalH = innerTop + PLANK;
  const outerW = IN_W + SIDE * 2;

  // sides
  for (const s of [-1, 1]){
    const side = woodBox(SIDE, totalH, DEPTH, M.wood, 'y', { round: 0.35 });
    side.position.set(s * (IN_W / 2 + SIDE / 2), totalH / 2, 0);
    g.add(side);
  }
  // bottom board, intermediate shelves, top board
  for (let i = 0; i < shelves; i++){
    const p = woodBox(IN_W, PLANK, DEPTH - BACK - 0.6, M.wood, 'x', { round: 0.45 });
    p.position.set(0, shelfY(i) - PLANK / 2, BACK / 2 - 0.3);
    g.add(p);
  }
  const top = woodBox(IN_W, PLANK, DEPTH - BACK, M.wood, 'x', { round: 0.3 });
  top.position.set(0, innerTop + PLANK / 2, BACK / 2);
  g.add(top);

  // back panel: tongue-and-groove boards, each a slightly different tone
  const boards = 8, bw = IN_W / boards;
  for (let b = 0; b < boards; b++){
    const mat = M.back.clone();
    const tone = 0.86 + ((b * 37) % 11) / 60;
    mat.color = new THREE.Color(tone, tone * 0.97, tone * 0.94);
    const board = woodBox(bw - 0.18, innerTop - PLINTH, BACK, mat, 'y', { shadows: false });
    board.position.set(-IN_W / 2 + bw * (b + 0.5), PLINTH + (innerTop - PLINTH) / 2, -DEPTH / 2 + BACK / 2);
    g.add(board);
  }

  // crown: a cap that overhangs, sitting on a set-back cove
  const cove = woodBox(outerW + 1.6, 2.4, DEPTH + 1.2, M.wood, 'x', { round: 0.8 });
  cove.position.set(0, totalH + 1.2, 0.3);
  const cap = woodBox(outerW + 4.4, 2.2, DEPTH + 3, M.wood, 'x', { round: 0.7 });
  cap.position.set(0, totalH + 2.4 + 1.1, 0.8);
  g.add(cove, cap);

  // plinth, set back a little, with a darker kick
  const kick = woodBox(outerW - 1.2, PLINTH, DEPTH - 1.5, M.wood, 'x', { round: 0.4 });
  kick.position.set(0, PLINTH / 2, -0.4);
  kick.material = M.wood.clone(); kick.material.color = new THREE.Color(0.62, 0.6, 0.58);
  g.add(kick);

  // Fake ambient occlusion: soft shading where surfaces meet. A renderer
  // without global illumination leaves these corners as bright as open
  // surfaces, which is the main thing that makes furniture look CG.
  const aoMat = (o) => new THREE.MeshBasicMaterial({
    alphaMap: M.ao, color: 0x000000, transparent: true, opacity: o, depthWrite: false,
  });
  const strip = (w, h, o) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), aoMat(o));
  for (let i = 0; i < shelves; i++){
    const y = shelfY(i);
    // on the back panel, rising from each shelf
    const up = strip(IN_W, 12, 0.6);
    up.position.set(0, y + 6, BACK_Z + 0.06);
    // on the shelf, creeping forward from the back panel
    const flat = strip(IN_W, 9, 0.5);
    flat.rotation.x = -Math.PI / 2; flat.rotation.z = Math.PI;   // dark edge toward the back
    flat.position.set(0, y + 0.04, BACK_Z + 4.5);
    // on the back panel, hanging below the shelf above
    const down = strip(IN_W, 10, 0.5);
    down.rotation.z = Math.PI;
    down.position.set(0, y + CLEAR - 5, BACK_Z + 0.06);
    g.add(up, flat, down);
    // into the two back corners, up each side
    for (const sd of [-1, 1]){
      const c = strip(CLEAR, 8, 0.45);
      c.rotation.z = sd * Math.PI / 2;
      c.position.set(sd * (IN_W / 2 - 4), y + CLEAR / 2, BACK_Z + 0.07);
      g.add(c);
    }
  }

  g.userData = { totalH: totalH + 4.6, outerW: outerW + 4.4, innerTop };
  return g;
}

/* ---------------- a book ---------------- */

const bookDims = b => ({
  // scrapbook-album sizes: 26–30 cm tall, 21–24 deep, thicker with more pages
  h: 26.5 + ((b.year * 13) % 40) / 10,
  d: 21 + ((b.year * 7) % 35) / 10,
  t: 3.2 + Math.min(3.6, b.count * 0.12) + ((b.year * 3) % 6) / 10,
});

const loader = new THREE.TextureLoader();

function buildBook(b, fontFamily){
  const M = sharedMaterials();
  const { h, d, t } = bookDims(b);
  const g = new THREE.Group();

  const board = 0.24;                 // cover board thickness
  const over = 0.32;                  // how far boards overhang the pages
  const arc = 1.65;                   // spine curvature, radians
  const r = (t / 2) / Math.sin(arc / 2);
  const bulge = r * (1 - Math.cos(arc / 2));
  const zEdge = d / 2 - bulge;        // where boards meet the spine

  const baseColor = new THREE.Color(b.palette.a).lerp(new THREE.Color(b.palette.b), 0.35);
  const clothMat = new THREE.MeshStandardMaterial({
    color: baseColor, roughness: 0.82, bumpMap: M.cloth, bumpScale: 0.25, envMapIntensity: 0.35
  });

  // boards; the front cover is on the right when the spine faces you
  const boardGeo = new THREE.BoxGeometry(board, h, d - bulge);
  for (const s of [-1, 1]){
    let mats = clothMat;
    if (s === 1 && b.cover.frontImage){
      const art = clothMat.clone();
      art.color = new THREE.Color(1, 1, 1);
      loader.load(b.cover.frontImage, tx => { tx.colorSpace = THREE.SRGBColorSpace; art.map = tx; art.needsUpdate = true; });
      mats = [art, clothMat, clothMat, clothMat, clothMat, clothMat];
    }
    const m = new THREE.Mesh(boardGeo, mats);
    m.position.set(s * (t / 2 - board / 2), h / 2, (zEdge - d / 2) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }

  // the block of pages, set in from the boards on top and at the fore edge
  const pw = t - board * 2 - 0.04, ph = h - over * 2, pd = d - bulge - over - 0.15;
  const pageTop = M.pages.clone(); pageTop.needsUpdate = true;
  pageTop.repeat.set(pw / 2.2, 1);
  const pagesMat = new THREE.MeshStandardMaterial({ map: pageTop, roughness: 0.92 });
  const pages = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd),
    [M.paper, M.paper, pagesMat, pagesMat, M.paper, M.paper]);
  pages.position.set(0, h / 2, -d / 2 + over + pd / 2);
  pages.castShadow = pages.receiveShadow = true;
  g.add(pages);

  // the rounded spine, a shallow arc of cloth with gold foil
  const arcLen = r * arc;
  const cw = 128, ch = Math.max(256, Math.round(cw * h / arcLen));
  let spineMat;
  if (b.cover.spineImage){
    spineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, envMapIntensity: 0.35 });
    loader.load(b.cover.spineImage, tx => { tx.colorSpace = THREE.SRGBColorSpace; spineMat.map = tx; spineMat.needsUpdate = true; });
  } else {
    const sp = spineCanvases({
      w: cw, h: ch, a: b.palette.a, b: b.palette.b,
      title: String(b.cover.title || b.year), emblem: b.cover.emblem || '',
      foot: `${b.count} pg`, font: fontFamily,
    });
    const colorTx = new THREE.CanvasTexture(sp.color); colorTx.colorSpace = THREE.SRGBColorSpace; colorTx.anisotropy = 8;
    const ormTx = new THREE.CanvasTexture(sp.orm); ormTx.anisotropy = 8;
    spineMat = new THREE.MeshStandardMaterial({
      map: colorTx, roughnessMap: ormTx, metalnessMap: ormTx,
      roughness: 1, metalness: 1, bumpMap: M.cloth, bumpScale: 0.15, envMapIntensity: 0.9
    });
  }
  const spineGeo = new THREE.CylinderGeometry(r, r, h, 18, 1, true, -arc / 2, arc);
  const spine = new THREE.Mesh(spineGeo, spineMat);
  spine.position.set(0, h / 2, zEdge - r * Math.cos(arc / 2));
  spine.castShadow = spine.receiveShadow = true;
  g.add(spine);

  g.traverse(o => { if (o.isMesh) o.userData.book = g; });
  g.userData = { year: b.year, palette: b.palette, dims: { h, d, t }, tip:
    `${b.cover.title || b.year} · ${b.count} page${b.count === 1 ? '' : 's'}` };
  return g;
}

/* ---------------- things on the shelves ---------------- */

function bookend(){
  const M = sharedMaterials();
  const g = new THREE.Group();
  const up = new THREE.Mesh(new RoundedBoxGeometry(1.0, 19, 12, 3, 0.35), M.brass);
  up.position.set(0, 9.5, 0);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(8, 0.7, 12, 3, 0.3), M.brass);
  foot.position.set(4, 0.35, 0);
  g.add(up, foot);
  g.traverse(o => { if (o.isMesh){ o.castShadow = o.receiveShadow = true; } });
  return { group: g, width: 1.0 };
}

function plant(){
  const M = sharedMaterials();
  const g = new THREE.Group();
  const prof = [
    [0, 0], [3.1, 0], [3.3, 0.3], [3.7, 7.6], [4.25, 7.7], [4.3, 8.9], [3.8, 9.0], [3.6, 8.2], [0, 8.2]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(prof, 40),
    new THREE.MeshStandardMaterial({ color: 0xb4643c, roughness: 0.92 }));
  pot.castShadow = pot.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a1b10, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 8.1;
  g.add(pot, soil);

  // snake-plant leaves: long, pointed, slightly cupped and leaning out
  const leafTex = new THREE.CanvasTexture(leafCanvas()); leafTex.colorSpace = THREE.SRGBColorSpace;
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.55, side: THREE.DoubleSide });
  const leaves = [[0, 21, 0], [1.3, 17, 0.35], [2.6, 19, -0.3], [3.9, 15, 0.25], [5.2, 18, -0.2], [0.65, 14, 0.5], [3.2, 12, -0.5]];
  leaves.forEach(([a, len, lean], i) => {
    const s = new THREE.Shape();
    const w = 1.5 + (i % 3) * 0.25;
    s.moveTo(-w / 2, 0);
    s.bezierCurveTo(-w * 0.75, len * 0.45, -w * 0.4, len * 0.85, 0, len);
    s.bezierCurveTo(w * 0.4, len * 0.85, w * 0.75, len * 0.45, w / 2, 0);
    const geo = new THREE.ShapeGeometry(s, 12);
    // cup the leaf and curve it back a touch
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++){
      const x = pos.getX(k), y = pos.getY(k);
      pos.setZ(k, -(x * x) * 0.35 + (y / len) * (y / len) * 1.2);
      uv.setXY(k, x / w + 0.5, y / len);
    }
    geo.computeVertexNormals();
    const leaf = new THREE.Mesh(geo, leafMat);
    leaf.position.set(Math.cos(a) * 1.2, 8.1, Math.sin(a) * 1.2);
    leaf.rotation.set(lean * 0.4, a, lean);
    leaf.castShadow = true;
    g.add(leaf);
  });
  return { group: g, width: 9 };
}

function frame(){
  const M = sharedMaterials();
  const g = new THREE.Group();
  const W = 13, H = 16.5, T = 1.4;
  const wood = M.wood.clone(); wood.color = new THREE.Color(0.7, 0.66, 0.62);
  // four mitred-looking rails
  const rail = (w, h, x, y, axis) => {
    const m = woodBox(w, h, T, wood, axis, { round: 0.35 });
    m.position.set(x, y, 0); g.add(m);
  };
  rail(W, 1.6, 0, H - 0.8, 'x'); rail(W, 1.6, 0, 0.8, 'x');
  rail(1.6, H, -W / 2 + 0.8, H / 2, 'y'); rail(1.6, H, W / 2 - 0.8, H / 2, 'y');
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(W - 3.2, H - 3.2), M.paper);
  mat.position.set(0, H / 2, -0.2);
  const photoTx = new THREE.CanvasTexture(photoCanvas()); photoTx.colorSpace = THREE.SRGBColorSpace;
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(W - 6, H - 7),
    new THREE.MeshStandardMaterial({ map: photoTx, roughness: 0.35, envMapIntensity: 0.6 }));
  photo.position.set(0, H / 2 + 0.4, -0.15);
  // the glass: barely there, but it catches the light
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 3.2, H - 3.2),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 1.5 }));
  glass.position.set(0, H / 2, 0.3);
  g.add(mat, photo, glass);
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  g.rotation.x = -0.13;                 // leaning back on its stand
  g.position.z = -3;
  return { group: g, width: W };
}

function stackWithCandle(){
  const M = sharedMaterials();
  const g = new THREE.Group();
  const lying = [
    { w: 21, h: 2.6, d: 15, c: '#40525c', r: 0.03 },
    { w: 19, h: 2.2, d: 14, c: '#7b3f3f', r: -0.08 },
    { w: 20, h: 2.9, d: 14.5, c: '#8a6b43', r: 0.05 },
  ];
  let y = 0;
  lying.forEach(l => {
    const cloth = new THREE.MeshStandardMaterial({ color: l.c, roughness: 0.82, bumpMap: M.cloth, bumpScale: 0.25 });
    const pageTx = M.pages.clone(); pageTx.needsUpdate = true; pageTx.rotation = Math.PI / 2; pageTx.repeat.set(1, l.h);
    const edge = new THREE.MeshStandardMaterial({ map: pageTx, roughness: 0.9 });
    // spine faces left, fore edge (pages) faces right and toward you on the front
    const m = new THREE.Mesh(new THREE.BoxGeometry(l.w, l.h, l.d), [edge, cloth, cloth, cloth, cloth, cloth]);
    m.position.set(0, y + l.h / 2, 0); m.rotation.y = l.r;
    m.castShadow = m.receiveShadow = true;
    g.add(m); y += l.h;
  });

  // a candle in a glass, sitting on the stack
  const c = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.0, 7, 32, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, transparent: true, opacity: 0.18, side: THREE.DoubleSide, envMapIntensity: 1.6 }));
  glass.position.y = 3.5;
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.75, 5.2, 32),
    new THREE.MeshStandardMaterial({ color: 0xf0e2c0, roughness: 0.6, emissive: 0xff9a40, emissiveIntensity: 0.18 }));
  wax.position.y = 2.6;
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6),
    new THREE.MeshBasicMaterial({ color: 0x1a120a }));
  wick.position.y = 5.6;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdf9a }));
  flame.scale.set(1, 2.3, 1); flame.position.y = 6.6;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: M.glow, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(9, 9, 1); halo.position.y = 6.6;
  const light = new THREE.PointLight(0xffa850, 60, 55, 2);
  light.position.y = 7.4;
  c.add(glass, wax, wick, flame, halo, light);
  c.position.set(3, y, 1);
  g.add(c);
  g.userData.flicker = { flame, halo, light };
  return { group: g, width: 22 };
}

/* ---------------- the controller ---------------- */

export function createShelf3D(host, { onPick, onHover } = {}){
  // will throw when WebGL is unavailable; the caller falls back to the CSS shelf
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvasEl = renderer.domElement;
  canvasEl.className = 'shelf3d-canvas';
  host.prepend(canvasEl);

  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x140c07);
  scene.fog = new THREE.Fog(0x140c07, 330, 620);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(26, 1, 10, 2000);

  // the room: a plaster wall and a wooden floor
  const M = sharedMaterials();
  const wallMat = M.wall; wallMat.map.repeat.set(4, 3);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(700, 420), wallMat);
  wall.position.set(0, 160, -DEPTH / 2 - 0.4);
  wall.receiveShadow = true;
  // floorboards running toward you, merged into one mesh (one draw call),
  // each board tinted a little differently through vertex colours
  const boardGeos = [];
  const BOARD = 14;
  for (let i = -30; i <= 30; i++){
    const geo = woodUV(new THREE.BoxGeometry(BOARD - 0.25, 1, 520), 'z', 0.55);
    const tone = 0.8 + ((((i * 53) % 17) + 17) % 17) / 70;
    const cols = new Float32Array(geo.attributes.position.count * 3);
    for (let k = 0; k < cols.length; k += 3){ cols[k] = tone; cols[k + 1] = tone * 0.97; cols[k + 2] = tone * 0.93; }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.translate(i * BOARD, -0.5, 240);
    boardGeos.push(geo);
  }
  const floorMat = M.floor.clone(); floorMat.vertexColors = true;
  const floor = new THREE.Mesh(mergeGeometries(boardGeos), floorMat);
  floor.receiveShadow = true;
  // skirting board where wall meets floor
  const skirt = woodBox(900, 9, 1.6, M.wood, 'x', { round: 0.4 });
  skirt.position.set(0, 4.5, -DEPTH / 2 + 0.6);
  scene.add(wall, floor, skirt);

  // lights
  scene.add(new THREE.HemisphereLight(0xffe6c8, 0x1a0f08, 0.35));
  const key = new THREE.SpotLight(0xffd6a0, 4.2, 0, 0.55, 0.75, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.camera.near = 50; key.shadow.camera.far = 600;
  scene.add(key, key.target);
  const fill = new THREE.SpotLight(0xcfd8ff, 0.7, 0, 0.7, 1, 0);
  scene.add(fill, fill.target);

  const world = new THREE.Group();
  scene.add(world);

  let caseGroup = null, rowLights = [], books = [], flickers = [], caseInfo = null;
  let hovered = null, running = false, raf = 0, fontFamily = '"Playfair Display", Georgia, serif';
  const mouse = new THREE.Vector2(9, 9), look = { x: 0, y: 0 };
  const ray = new THREE.Raycaster();
  const camBase = new THREE.Vector3(), target = new THREE.Vector3();

  function clearWorld(){
    world.traverse(o => {
      if (o.isMesh){
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if (m === M.wood || m === M.back || m === M.paper || m === M.brass) return;
          if (m.map && m.map.isCanvasTexture && m.map !== M.pages) m.map.dispose();
          m.dispose();
        });
      }
    });
    world.clear();
    rowLights = []; books = []; flickers = []; hovered = null;
  }

  function build(list){
    clearWorld();
    const shelves = Math.max(MIN_SHELVES, Math.ceil(list.length / PER_SHELF));
    caseGroup = buildCase(shelves);
    caseInfo = caseGroup.userData;
    world.add(caseGroup);

    const decor = [plant, frame, stackWithCandle];
    for (let row = 0; row < shelves; row++){
      const i = shelves - 1 - row;                      // row 0 is the top shelf
      const y = shelfY(i);
      const slice = list.slice(row * PER_SHELF, (row + 1) * PER_SHELF);

      let x = -IN_W / 2 + 3;
      slice.forEach(b => {
        const book = buildBook(b, fontFamily);
        const { t, d } = book.userData.dims;
        const zFront = FRONT - 3.2;                     // spines set back from the edge
        book.position.set(x + t / 2, y, zFront - d / 2);
        book.rotation.z = ((b.year % 5) - 2) * 0.004;
        book.userData.base = book.position.clone();
        book.userData.pull = 0;
        world.add(book); books.push(book);
        x += t + 0.12;
      });
      if (slice.length){
        const be = bookend();
        be.group.position.set(x + 0.3, y, FRONT - 3.2 - 8);
        world.add(be.group);
        x += 9;
      }
      if (decor[row] && slice.length < PER_SHELF){
        const d = decor[row]();
        const dx = IN_W / 2 - 4 - d.width / 2;
        if (dx - d.width / 2 > x){
          d.group.position.set(dx, y, row === 1 ? -2 : -1);
          world.add(d.group);
          if (d.group.userData.flicker) flickers.push(d.group.userData.flicker);
        }
      }

      // a warm LED strip under the shelf above, washing down over the spines
      const led = new THREE.RectAreaLight(0xffcf96, 12, IN_W - 6, 1.6);
      led.position.set(0, y + CLEAR - 0.6, FRONT - 2);
      led.lookAt(0, y + 6, FRONT - 16);       // angled back across the spines
      world.add(led); rowLights.push(led);
    }

    if (!list.length){
      const note = host.querySelector('.shelf3d-empty');
      if (note) note.hidden = false;
    } else {
      const note = host.querySelector('.shelf3d-empty');
      if (note) note.hidden = true;
    }
    frameCamera();
  }

  function frameCamera(){
    if (!caseInfo) return;
    const rect = host.getBoundingClientRect();
    const w = rect.width || 1, h = rect.height || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    // leave room for the header above and the buttons below
    const usable = Math.max(0.5, (h - 220) / h);
    const fovV = THREE.MathUtils.degToRad(camera.fov);
    const needH = caseInfo.totalH * 1.04 / usable;
    // a tall phone screen is limited by width: use nearly all of it
    const needW = caseInfo.outerW * (camera.aspect < 0.8 ? 1.03 : 1.16);
    const distH = (needH / 2) / Math.tan(fovV / 2);
    const distW = (needW / 2) / (Math.tan(fovV / 2) * camera.aspect);
    const dist = Math.max(distH, distW);
    // the fog follows the camera, so a far-back phone view doesn't hide the shelf in it
    scene.fog.near = dist + 40;
    scene.fog.far = dist + 330;

    const cy = caseInfo.totalH / 2 - 2;
    target.set(0, cy, 0);
    camBase.set(0, cy + dist * 0.09, dist);
    camera.position.copy(camBase);
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    key.position.set(-dist * 0.32, cy + dist * 0.62, dist * 0.6);
    key.target.position.set(0, cy - 8, 0);
    fill.position.set(dist * 0.5, cy + 10, dist * 0.8);
    fill.target.position.set(0, cy, 0);
  }

  /* ---- interaction ---- */

  function pickAt(ev){
    const r = canvasEl.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    look.x = mouse.x; look.y = mouse.y;
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(books, true)[0];
    return hit ? hit.object.userData.book : null;
  }

  function screenRect(book){
    const box = new THREE.Box3().setFromObject(book);
    const r = canvasEl.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]){
      const v = new THREE.Vector3(x, y, z).project(camera);
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0, right: x1, bottom: y1 };
  }

  function onMove(ev){
    const b = pickAt(ev);
    if (b !== hovered){
      hovered = b;
      canvasEl.style.cursor = b ? 'pointer' : '';
    }
    if (onHover){
      if (!b) onHover(null);
      else {
        const top = new THREE.Vector3(b.position.x, b.position.y + b.userData.dims.h + 1.5, b.position.z + b.userData.dims.d / 2).project(camera);
        const r = canvasEl.getBoundingClientRect();
        onHover({ text: b.userData.tip, x: r.left + (top.x + 1) / 2 * r.width, y: r.top + (1 - top.y) / 2 * r.height });
      }
    }
  }
  function onLeave(){ hovered = null; look.x = look.y = 0; canvasEl.style.cursor = ''; onHover && onHover(null); }
  function onClick(ev){
    openBook(pickAt(ev));
  }
  function openBook(b){
    if (!b || !onPick) return;
    const rect = screenRect(b);
    // A stand-in for the DOM book the open animation expects: it measures
    // the book on screen and hides it while the cover flies out.
    const proxy = {
      getBoundingClientRect: () => rect,
      style: { set visibility(v){ b.visible = v !== 'hidden'; }, get visibility(){ return b.visible ? '' : 'hidden'; } },
    };
    onHover && onHover(null);
    onPick(proxy, b.userData.palette, b.userData.year);
  }
  canvasEl.addEventListener('pointermove', onMove);
  canvasEl.addEventListener('pointerleave', onLeave);
  canvasEl.addEventListener('click', onClick);
  const ro = new ResizeObserver(() => frameCamera());
  ro.observe(host);

  /* ---- loop ---- */

  const clock = new THREE.Clock();
  function tick(){
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    // time-based easing: the same speed at 30fps or 144fps
    const ease = rate => 1 - Math.exp(-dt * rate);

    // a book you point at slides out and turns to show its cover
    for (const b of books){
      const want = b === hovered ? 1 : 0;
      b.userData.pull += (want - b.userData.pull) * ease(9);
      const p = b.userData.pull;
      b.position.set(b.userData.base.x, b.userData.base.y + p * 0.6, b.userData.base.z + p * 7);
      b.rotation.y = -p * 0.32;
    }

    // candlelight never sits still
    for (const f of flickers){
      const n = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 13.7 + 1.3) * 0.3 + Math.sin(t * 23.3) * 0.2;
      f.light.intensity = 60 + n * 9;
      f.flame.scale.set(1 + n * 0.05, 2.3 - n * 0.18, 1 + n * 0.05);
      f.halo.material.opacity = 0.85 + n * 0.1;
    }

    // a little parallax: the room answers the mouse
    camera.position.x += (camBase.x + look.x * 6 - camera.position.x) * ease(3);
    camera.position.y += (camBase.y + look.y * 3.5 - camera.position.y) * ease(3);
    camera.lookAt(target);

    renderer.render(scene, camera);
  }

  return {
    async show(list){
      try { await document.fonts.load('600 64px "Playfair Display"'); } catch(_){}
      build(list);
      if (!running){ running = true; clock.start(); tick(); }
    },
    hide(){
      running = false;
      cancelAnimationFrame(raf);
      onHover && onHover(null);
    },
    resize: frameCamera,
    /** Open a year's book as if its spine was tapped (the big buttons on phones). */
    pickYear(year){ openBook(books.find(b => String(b.userData.year) === String(year))); },
    /** for tests: render one frame now */
    renderOnce(){ frameCamera(); renderer.render(scene, camera); },
    _debug: { scene, camera, get books(){ return books; } },
  };
}