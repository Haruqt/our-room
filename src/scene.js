import * as THREE from 'three';
import * as sfx from './sfx.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initBookshelfUI, openBookshelf } from './bookshelf-ui.js';
import { initDesktop, bootDesktop, pcState } from './desktop-ui.js';
import { subtitle, clearSubtitle, showConfirm } from './ui.js';
import { reportError } from './errors.js';
import { getMe, shortOf } from './who.js';
import { installHud } from './room-hud.js';
import './achievements.js';
import { loadShared, getShared, setShared, onShared, lastSixOClock } from './room-live.js';
import { installPresence } from './feat-presence.js';
import { installBottle } from './feat-bottle.js';
import { installFrames } from './feat-frames.js';
import { installTv } from './feat-tv.js';
import { installMusic } from './feat-music.js';
import { installCapsule } from './feat-capsule.js';
import { installMonitors } from './feat-monitors.js';
import { installCat } from './feat-cat.js';

/**
 * Everything room-specific lives here, so swapping the model later means
 * editing this block rather than hunting through the file.
 *
 * This model's nodes have generic names (Object_96, Plane.002_106 …), so each
 * object was identified by measuring its size, position and material name.
 */
const ROOM = {
  model: '/models/room.glb',
  credit: '"Isometric room, house, game-ready, low poly." by gbarzu — CC-BY-4.0, via Sketchfab',
  camera: { pos: [7.4, 6.0, 7.6], target: [0, 1.5, 0] },
  hotspots: {
    // the tall book cabinets on the left wall
    bookshelf: ['Plane.002_106', 'Plane.003_107', 'Plane.004_108'],
    // the whole desk: monitors, keyboards, mice, both towers. Which computer you
    // clicked is decided by where you clicked (see PC_SPLIT_X).
    pc: ['Plane.008_56', 'Cylinder.001_57', 'Cube.004_3', 'Cube.005_5',
         'Cube.006_6', 'Cube.009_12', 'Cube.007_8'],
    door: ['Plane.001_85', 'Plane.012_87'],
    // the wall clock: changes the time of day
    lamp: ['Circle_16'],
    tv: ['Object_4', 'Object_5'],
    tvScreen: 'Object_5',
    bottle: ['Object_224', 'Object_225'],
    slippers: ['Object_96', 'Object_97'],
    // the four pictures, in slot order, with their frames
    frames: [
      { picture: 'Object_241', frame: 'Object_240' },   // back wall, small portrait
      { picture: 'Object_244', frame: 'Object_243' },   // back wall, tall portrait
      { picture: 'Object_234', frame: 'Object_233' },   // back wall, landscape
      { picture: 'Object_247', frame: 'Object_246' },   // left wall
    ],
    // the four little speakers: two on each desk
    speakers: ['Object_66', 'Object_67', 'Object_69', 'Object_70', 'Object_72', 'Object_73', 'Object_75', 'Object_76'],
    speakerCones: ['Object_67', 'Object_70', 'Object_73', 'Object_76'],
    // the two wall lamps (by the door, above Che's chair): they're the light switch
    wallLamps: ['Object_115', 'Object_117'],
    // the monitor screens on each desk, main one first
    monitors: { cherryl: ['Object_10'], andrei: ['Object_15', 'Object_22'] },
  },
  // left of this x is Cherryl's desk (one monitor); right of it, Andrei's (two)
  PC_SPLIT_X: -1.1,
  // the time capsule sits on top of the corner cabinet: up high, out of reach
  // until it's time (the TV console top is all TV)
  capsuleSpot: [-2.43, 2.762, 2.42],
  glow: {
    screens: [-0.84, 1.55, -2.15],
    tv:      [-2.05, 1.58, 1.30],
    ceiling: [0, 3.6, 0],
    lamp:    [-0.2, 3.25, 0.1],     // the night light, up near the ceiling
  },
};

const MANILA = 'Asia/Manila';
/** Night in Manila: 6pm to 6am. */
function manilaIsNight(){
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: MANILA, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h >= 18 || h < 6;
}

export function initScene(userName){
  const wrap = document.getElementById('canvas-wrap');
  if (wrap.dataset.initialized === 'true') return;
  wrap.dataset.initialized = 'true';

  const scene = new THREE.Scene();

  const DAY = {
    bg:new THREE.Color(0xa5521f), hemiSky:new THREE.Color(0xfff2dd), hemiGround:new THREE.Color(0x8a6a4a),
    hemiI:1.1, sun:new THREE.Color(0xfff0d6), sunI:1.5, lampI:0.0, fogNear:20, fogFar:46
  };
  const NIGHT = {
    bg:new THREE.Color(0x2a1408), hemiSky:new THREE.Color(0x4a3a52), hemiGround:new THREE.Color(0x1a1018),
    hemiI:0.58, sun:new THREE.Color(0x6a5a8a), sunI:0.3, lampI:4.2, fogNear:16, fogFar:44
  };

  scene.background = DAY.bg.clone();
  scene.fog = new THREE.Fog(DAY.bg.getHex(), DAY.fogNear, DAY.fogFar);

  const camera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.05, 220);
  camera.position.set(...ROOM.camera.pos);

  // alpha: the TV cuts a see-through hole in the canvas for the YouTube player
  // that sits behind it (see feat-tv.js). The background colour still fills
  // everything else.
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  wrap.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...ROOM.camera.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2.5;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI * 0.495;

  const hemi = new THREE.HemisphereLight(DAY.hemiSky.getHex(), DAY.hemiGround.getHex(), DAY.hemiI);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(DAY.sun.getHex(), DAY.sunI);
  sun.position.set(7, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // no window in this room, so daylight comes from a soft warm fill up high
  const windowGlow = new THREE.PointLight(0xffe2bc, 0.6, 16, 2);
  windowGlow.position.set(...ROOM.glow.ceiling);
  scene.add(windowGlow);

  const lampLight = new THREE.PointLight(0xffb366, DAY.lampI, 16, 1.7);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.004;
  lampLight.shadow.camera.near = 0.08;
  lampLight.shadow.camera.far = 18;
  scene.add(lampLight);

  const lampBounce = new THREE.PointLight(0xff9a4d, 0, 9, 2.2);
  scene.add(lampBounce);


  const moonLight = new THREE.DirectionalLight(0x8fa4e0, 0);
  moonLight.position.set(6, 6, 6);
  scene.add(moonLight);

  const loader = new GLTFLoader();
  let roomModel = null;
  let roomBox = null;
  const roomCenter = new THREE.Vector3(0, 2, 0);

  /* ---------------- clickable things ----------------
     Every clickable thing is a "feature": the meshes you can hit, a label for
     the hover tip, and what a click does. The nearest hit wins, so a small
     thing in front of a big one (the bottle on the table) gets the click. */
  const features = [];
  const ownerOf = new Map();          // mesh -> feature
  function register(f){
    if (!f || !f.objects?.length) return;
    features.push(f);
    f.objects.forEach(o => o.traverse(m => { if (m.isMesh) ownerOf.set(m, f); }));
  }
  let hitTargets = [];
  function refreshTargets(){ hitTargets = [...ownerOf.keys()]; }

  /* ---------------- camera focus ---------------- */
  let focused = null;
  let returning = false;           // gliding back to where you were standing
  const camPosGoal = camera.position.clone();
  const camTargetGoal = new THREE.Vector3(0, 2, 0);
  const overviewPos = camera.position.clone();
  const overviewTarget = new THREE.Vector3(0, 2, 0);
  const backHooks = [];
  const frameHooks = [];

  function computeFocus(objects){
    const box = new THREE.Box3();
    objects.forEach(o => box.union(new THREE.Box3().setFromObject(o)));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dir = new THREE.Vector3(roomCenter.x - center.x, 0, roomCenter.z - center.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    let dist = Math.max(size.x, size.y, size.z) * 1.65 + 1.2;
    // a phone held upright is narrow: back off until the object's width fits too
    const across = Math.max(size.x, size.z);
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    dist = Math.max(dist, (across * 0.62) / tanH + across * 0.4);
    return {
      pos: center.clone().add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, size.y*0.32 + 0.35, 0)),
      target: center.clone()
    };
  }

  /** Tall screens (phones): panels open from the bottom, so look a little lower
      and the object lands in the upper part of the screen, clear of them. */
  function liftForPanels(pos, target){
    if (camera.aspect >= 0.85) return;
    const d = pos.distanceTo(target);
    const k = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.42;
    pos.y -= k; target.y -= k;
  }

  /** How far back to stand so the whole room fits this screen's shape. */
  function fitRoomDistance(dir){
    if (!roomBox) return 12;
    const corners = [];
    for (const x of [roomBox.min.x, roomBox.max.x]) for (const y of [roomBox.min.y, roomBox.max.y]) for (const z of [roomBox.min.z, roomBox.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const cam = camera.clone();
    const fits = d => {
      cam.position.copy(roomCenter).addScaledVector(dir, d);
      cam.lookAt(roomCenter);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      return corners.every(c => { const v = c.clone().project(cam); return Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.86 && v.z < 1; });
    };
    let lo = 3, hi = 80;
    for (let i = 0; i < 28; i++){ const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    return hi;
  }

  /** Put the overview camera where the room fits — never closer than the designed view. */
  function fitOverview(){
    if (!roomModel || focused || returning) return;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const designed = new THREE.Vector3(...ROOM.camera.pos).distanceTo(roomCenter);
    const dist = Math.max(designed, fitRoomDistance(dir));
    controls.maxDistance = Math.max(26, dist * 1.5);
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    overviewPos.copy(camera.position);
  }

  /** If furniture stands between the camera and what it's looking at (the sofa in front
      of the TV, on a narrow phone that has to stand far back), look over it instead. */
  const occluder = new THREE.Raycaster();
  function clearView(pos, target){
    if (!roomModel) return;
    for (let tries = 0; tries < 10; tries++){
      const dir = pos.clone().sub(target);
      const d = dir.length();
      if (d < 0.6) return;
      dir.normalize();
      occluder.set(target.clone().addScaledVector(dir, 0.45), dir);   // start just in front of the thing itself
      occluder.far = d - 0.45;
      if (!occluder.intersectObject(roomModel, true).some(h => h.object.visible)) return;
      pos.y += 0.35;
    }
  }

  function focusTo(key, pos, target, after){
    // Remember where you were standing the moment you walk up to something,
    // so "back" returns you there. (This used to be re-saved every frame, which
    // made "back" land wherever the camera already was — still zoomed in.)
    if (!focused && !returning){
      overviewPos.copy(camera.position);
      overviewTarget.copy(controls.target);
    }
    returning = false;
    focused = key;
    controls.enabled = false;
    pos = pos.clone(); target = target.clone();
    liftForPanels(pos, target);
    clearView(pos, target);
    camPosGoal.copy(pos);
    camTargetGoal.copy(target);
    document.getElementById('back-btn').classList.add('show');
    document.body.classList.add('room-focused');
    hideTip();
    after && after();
  }

  function focusOn(key, objects, after){
    if (!objects.length) return;
    const { pos, target } = computeFocus(objects);
    focusTo(key, pos, target, after);
  }

  function goBack(){
    const was = focused;
    if (!was) return;
    focused = null;
    returning = true;                // controls come back once we've arrived
    // back to where you were standing; but if that was right up against something
    // (easy after pinching on a phone), back to the whole room instead
    const designed = new THREE.Vector3(...ROOM.camera.pos).distanceTo(roomCenter);
    if (overviewPos.distanceTo(roomCenter) < designed * 0.55){
      const dir = new THREE.Vector3(...ROOM.camera.pos).sub(roomCenter).normalize();
      overviewTarget.copy(roomCenter);
      overviewPos.copy(roomCenter).addScaledVector(dir, Math.max(designed, fitRoomDistance(dir)));
    }
    camPosGoal.copy(overviewPos);
    camTargetGoal.copy(overviewTarget);
    document.getElementById('back-btn').classList.remove('show');
    document.body.classList.remove('room-focused');
    clearSubtitle();
    backHooks.forEach(fn => { try { fn(was); } catch(e){ reportError('back', e); } });
  }
  document.getElementById('back-btn').addEventListener('click', goBack);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && focused && !document.querySelector('.overlay-screen.show, .room-panel.show')) goBack();
  });

  try { initBookshelfUI({ onExit: goBack }); } catch(e){ reportError('initBookshelfUI', e); }
  try { initDesktop({ onExit: goBack }); }    catch(e){ reportError('initDesktop', e); }

  /* ---------------- day / night ----------------
     Follows the clock in Manila on its own: evening at 6pm, morning at 6am.
     Clicking the wall clock (or the badge) still switches it by hand, and that
     choice holds until the next 6 o'clock comes round. */
  let isNight = false;
  let tT = 1;
  let fromP = { ...DAY };
  let toP = DAY;
  let nightAmt = 0;

  // The lights as day/night sets them; the light switch then dims from these.
  const base = { hemi: DAY.hemiI, sun: DAY.sunI, lamp: DAY.lampI, bounce: 0, moon: 0, window: 0.6, exp: 1.05 };
  // the wall lamps are the light switch: off at night = dark, only screens glow
  let lightsOn = localStorage.getItem('ourroom_lights') !== 'off';
  let lightK = lightsOn ? 1 : 0;

  function capture(){
    return {
      bg: scene.background.clone(),
      hemiSky: hemi.color.clone(), hemiGround: hemi.groundColor.clone(), hemiI: base.hemi,
      sun: sun.color.clone(), sunI: base.sun, lampI: base.lamp,
      fogNear: scene.fog.near, fogFar: scene.fog.far
    };
  }

  function setNight(night, { instant = false, quiet = false, manual = false } = {}){
    isNight = night;
    fromP = capture();
    toP = night ? NIGHT : DAY;
    tT = instant ? 0.9999 : 0;

    const badge = document.getElementById('mode-badge');
    badge.innerHTML = (night ? '<span class="mode-icon">☾</span> Evening' : '<span class="mode-icon">☀</span> Morning')
      + `<span class="mode-auto">${manual ? 'set by hand' : 'Manila time'}</span>`;

    if (quiet) return;
    const lines = night
      ? ['the screens light the room', 'everything goes quiet', 'evening settles in']
      : ['morning comes back', 'the light returns', 'the room wakes up'];
    subtitle(lines[Math.floor(Math.random()*lines.length)], 2600);
  }

  let autoPhase = manilaIsNight();
  setNight(autoPhase, { instant: true, quiet: true });
  setInterval(() => {
    const n = manilaIsNight();
    if (n === autoPhase) return;
    autoPhase = n;                       // 6 o'clock came round: follow it again
    if (isNight !== n) setNight(n);
  }, 30000);

  // set by hand: shared, so it turns evening for both of you (until the next 6 o'clock)
  function toggleLamp(){
    setNight(!isNight, { manual: true });
    setShared('night', { night: isNight, at: Date.now() });
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'night' }));
  }

  const wallLamps = [];
  function setLights(on, { remote = false, by = null } = {}){
    if (on === lightsOn && remote) return;
    lightsOn = on;
    sfx.click();
    try { localStorage.setItem('ourroom_lights', on ? 'on' : 'off'); } catch(_){}
    if (!remote) setShared('lights', on);
    if (!remote && !on) window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'lights-off' }));
    window.dispatchEvent(new CustomEvent('ourroom:lights', { detail: { on, remote } }));
    const who = by ? shortOf(by) : null;
    subtitle(remote && who ? `${who} turned the lights ${on ? 'on' : 'off'}`
      : on ? 'lights on' : (nightAmt > 0.5 ? 'lights off — just the screens now' : 'lights off'), 1800);
  }

  /* the same room for both: lights and a hand-set day/night come from the shared state */
  loadShared().then(() => {
    const l = getShared('lights');
    if (typeof l === 'boolean' && l !== lightsOn){
      lightsOn = l; lightK = l ? 1 : 0;
      try { localStorage.setItem('ourroom_lights', l ? 'on' : 'off'); } catch(_){}
      window.dispatchEvent(new CustomEvent('ourroom:lights', { detail: { on: l, remote: true } }));
    }
    const n = getShared('night');
    if (n && n.at > lastSixOClock() && n.night !== isNight) setNight(n.night, { manual: true, quiet: true, instant: true });
  });
  onShared('lights', (v, by) => { if (typeof v === 'boolean') setLights(v, { remote: true, by }); });
  onShared('night', (n, by) => {
    if (!n || n.at <= lastSixOClock() || n.night === isNight) return;
    setNight(n.night, { manual: true, quiet: true });
    subtitle(`${by ? shortOf(by) : 'someone'} made it ${n.night ? 'evening' : 'morning'}`, 2400);
  });

  document.getElementById('mode-badge').addEventListener('click', toggleLamp);

  /* ---------------- the room loads ---------------- */
  loader.load(ROOM.model, gltf => {
    roomModel = gltf.scene;
    roomModel.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
    scene.add(roomModel);

    roomBox = new THREE.Box3().setFromObject(roomModel);
    roomBox.getCenter(roomCenter);
    controls.target.copy(roomCenter);
    overviewTarget.copy(roomCenter);
    camTargetGoal.copy(roomCenter);
    fitOverview();

    // three.js strips  . [ ] : /  from node names when it imports a glTF, so
    // "Plane.002_106" in the file is "Plane002_106" in the scene.
    const clean = n => String(n).replace(/[.\[\]:/]/g, '');
    const byName = new Map();
    roomModel.traverse(o => {
      if (!o.name) return;
      const k = clean(o.name);
      if (!byName.has(k)) byName.set(k, o);
    });
    const one = n => roomModel.getObjectByName(n) || byName.get(clean(n)) || null;
    const pick = names => names.map(one).filter(Boolean);

    const missing = (key, list) => {
      if (list.length) return list;
      reportError('hotspots', new Error(`no meshes matched for "${key}" — the room model may have changed`));
      return list;
    };

    /* --- built-in: shelf, door, clock --- */
    const shelfObjs = missing('bookshelf', pick(ROOM.hotspots.bookshelf));
    register({
      key: 'bookshelf', objects: shelfObjs,
      label: () => ({ label: 'Our books', sub: 'a book for every year' }),
      click: () => focusOn('bookshelf', shelfObjs, () => {
        subtitle('every year has a book', 2400);
        setTimeout(() => { try { openBookshelf(); } catch(err){ reportError('openBookshelf', err); } }, 780);
      }),
    });

    register({
      key: 'door', objects: missing('door', pick(ROOM.hotspots.door)),
      label: () => ({ label: 'Leave', sub: 'lock up & sign out' }),
      click: () => showConfirm('Lock the room and sign out?', 'Leaving', 'Leave').then(ok => { if (ok) leaveRoom(); }),
    });

    /* --- the wall lamps = the light switch --- */
    const lampObjs = missing('wall lamps', pick(ROOM.hotspots.wallLamps));
    lampObjs.forEach(o => o.traverse(m => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.emissive = new THREE.Color(0xffc27a);
      const box = new THREE.Box3().setFromObject(m);
      const c = box.getCenter(new THREE.Vector3());
      const toRoom = new THREE.Vector3(-c.x, 0, -c.z).normalize();
      const light = new THREE.PointLight(0xffc684, 0, 3.4, 1.8);
      light.position.copy(c).addScaledVector(toRoom, 0.22);
      scene.add(light);
      wallLamps.push({ mat: m.material, light });
    }));
    register({
      key: 'switch', objects: lampObjs,
      label: () => ({ label: 'Light switch', sub: lightsOn ? 'turn the lights off' : 'turn the lights on' }),
      click: () => setLights(!lightsOn),
    });

    register({
      key: 'lamp', objects: missing('clock', pick(ROOM.hotspots.lamp)),
      label: () => ({ label: 'The clock', sub: isNight ? 'make it morning' : 'make it evening' }),
      click: toggleLamp,
    });

    /* --- the two computers --- */
    const pcObjs = missing('pc', pick(ROOM.hotspots.pc));
    const pcMeshes = [];
    pcObjs.forEach(o => o.traverse(m => { if (m.isMesh) pcMeshes.push(m); }));
    const sideOf = x => x < ROOM.PC_SPLIT_X ? 'cherryl' : 'andrei';
    // what to frame when you sit down at each: that desk's things, not the
    // long desktop that spans both
    const deskOf = { andrei: [], cherryl: [] };
    pcMeshes.forEach(m => {
      const b = new THREE.Box3().setFromObject(m);
      const size = b.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.z) > 1.5) return;
      deskOf[sideOf(b.getCenter(new THREE.Vector3()).x)].push(m);
    });
    register({
      key: 'pc', objects: pcObjs,
      label: hit => {
        const owner = sideOf(hit.point.x);
        const st = pcState(owner);
        return { label: `${shortOf(owner)}'s computer`,
          sub: st === 'off' ? 'turned off · click to start it' : st === 'on' ? 'left on · pick up where you left off' : 'locked · click to sign in' };
      },
      click: hit => {
        const owner = sideOf(hit.point.x);
        const st = pcState(owner);
        focusOn('pc', deskOf[owner].length ? deskOf[owner] : pcObjs, () => {
          if (st === 'off') subtitle(`${shortOf(owner)}'s computer · starting up…`, 1800);
          setTimeout(() => {
            try { bootDesktop(userName, owner); }
            catch(err){ reportError('bootDesktop', err); }
          }, st === 'on' ? 250 : 600);
        });
      },
    });

    /* --- everything new --- */
    const ctx = {
      THREE, scene, camera, renderer, controls, roomModel, roomCenter, ROOM,
      one, pick, focusOn, focusTo, goBack, subtitle,
      isFocused: () => focused,
      nightAmount: () => nightAmt,
      onBack: fn => backHooks.push(fn),
      onFrame: fn => frameHooks.push(fn),
    };
    const installs = [
      ['presence', installPresence], ['bottle', installBottle], ['frames', installFrames],
      ['tv', installTv], ['music', installMusic], ['capsule', installCapsule],
      ['monitors', installMonitors], ['cat', installCat],
    ];
    for (const [name, install] of installs){
      try {
        const out = install(ctx);
        (Array.isArray(out) ? out : [out]).forEach(register);
      } catch(e){ reportError('room feature: ' + name, e); }
    }
    refreshTargets();

    /* --- the help button, trophies and settings (top left) --- */
    const meshCenter = m => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
    // how close together meshes must be to share one label (per feature)
    const CLUSTER = { slippers: 0.45, frames: 1.6, switch: 0.6, cat: 0.75 };
    function helpSpots(){
      const out = [];
      for (const f of features){
        if (f.enabled && !f.enabled()) continue;
        const meshes = [];
        f.objects.forEach(o => o.traverse(m => { if (m.isMesh && shownInScene(m)) meshes.push(m); }));
        if (!meshes.length) continue;
        let groups;
        if (f.key === 'pc'){
          groups = ['cherryl', 'andrei'].map(w => deskOf[w].filter(m => m.isMesh)).filter(g => g.length);
        } else if (CLUSTER[f.key]){
          groups = [];
          meshes.forEach(m => {
            const c = meshCenter(m);
            const g = groups.find(g => g.c.distanceTo(c) < CLUSTER[f.key]);
            if (g) g.list.push(m); else groups.push({ c, list: [m] });
          });
          groups = groups.map(g => g.list);
        } else groups = [meshes];
        groups.forEach(list => {
          const box = new THREE.Box3();
          list.forEach(m => box.union(new THREE.Box3().setFromObject(m)));
          const c = box.getCenter(new THREE.Vector3());
          const hit = { object: list[0], point: c.clone() };
          let lab = {};
          try { lab = f.label(hit) || {}; } catch(_){}
          out.push({ x: c.x, y: box.max.y - (box.max.y - box.min.y) * 0.25, z: c.z, label: lab.label || f.key, sub: lab.sub || '',
            go: () => { try { f.click(hit); } catch(e){ reportError(f.key, e); } } });
        });
      }
      return out;
    }
    try {
      installHud({ THREE, camera, spots: helpSpots, isBusy: () => !!(focused || returning), onFrame: fn => frameHooks.push(fn) });
    } catch(e){ reportError('hud', e); }

    // the desk is the light source at night in this room
    // At night the room is lit by a warm ceiling light; each monitor and the
    // TV add their own glow (feat-monitors.js, feat-tv.js), so a computer
    // that's switched off no longer lights up the wall behind it.
    lampLight.position.set(...ROOM.glow.lamp);
    lampBounce.position.set(ROOM.glow.lamp[0], ROOM.glow.lamp[1] - 1.4, ROOM.glow.lamp[2] + 0.8);

    // if they're already inside, let "Che is here" be read before the room appears
    const hide = () => { document.getElementById('loading-room').style.display = 'none'; };
    Promise.race([window.__ourroomPeek || Promise.resolve(false), new Promise(r => setTimeout(() => r(false), 2800))])
      .then(found => setTimeout(hide, found ? 1400 : 0), hide);
  }, xhr => {
    if (xhr.lengthComputable){
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      const bar = document.getElementById('room-bar');
      const lbl = document.getElementById('room-pct');
      if (bar) bar.style.width = pct + '%';
      if (lbl) lbl.textContent = pct + '%';
    }
  }, err => {
    console.error('Room model failed to load', err);
    document.getElementById('loading-room').innerHTML =
      '<div class="loading-text">Could not load the room — check that public/models/room.glb exists.</div>';
  });

  /* ---------------- clicks + hover labels ---------------- */
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downPos = null;
  const tip = document.getElementById('hover-tip');
  const tipLabel = document.getElementById('hover-tip-label');
  const tipSub = document.getElementById('hover-tip-sub');

  // the raycaster hits hidden things too; skip anything not actually showing
  function shownInScene(o){
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  function hitTest(e){
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    for (const hit of ray.intersectObjects(hitTargets, false)){
      if (!shownInScene(hit.object)) continue;
      let o = hit.object, f = null;
      while (o && !f){ f = ownerOf.get(o); o = o.parent; }
      if (f && (!f.enabled || f.enabled())) return { feature: f, hit };
    }
    return null;
  }

  function leaveRoom(){
    const overlay = document.getElementById('leave-fade');
    overlay.classList.add('show');
    setTimeout(() => window.dispatchEvent(new CustomEvent('ourroom:leave')), 900);
  }

  renderer.domElement.addEventListener('pointerdown', e => { downPos = { x:e.clientX, y:e.clientY }; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!roomModel || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6) return;       // that was an orbit drag, not a click
    if (focused || returning) return;
    const found = hitTest(e);
    if (!found) return;
    hideTip();
    try { found.feature.click(found.hit); }
    catch(err){ reportError(found.feature.key, err); }
  });

  function hideTip(){ tip.classList.remove('show'); }

  renderer.domElement.addEventListener('pointermove', e => {
    if (focused || returning || !roomModel){ hideTip(); return; }
    const found = hitTest(e);
    if (found){
      const { label, sub } = found.feature.label(found.hit) || {};
      tipLabel.textContent = label || '';
      tipSub.textContent = sub || '';
      tip.classList.add('show');
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      let cur = null;
      try { cur = found.feature.cursor?.(found.hit); } catch(_){}
      renderer.domElement.style.cursor = cur || 'pointer';
    } else {
      hideTip();
      renderer.domElement.style.cursor = 'grab';
    }
  });
  renderer.domElement.addEventListener('pointerleave', hideTip);

  setTimeout(() => subtitle(`welcome back, ${userName}`, 3000), 900);

  /* ---------------- first-visit guide ---------------- */
  const guide = document.getElementById('guide-card');
  if (!localStorage.getItem('ourroom_guide_seen_v2')){
    setTimeout(() => guide.classList.add('show'), 1400);
  }
  document.getElementById('guide-dismiss').addEventListener('click', () => {
    guide.classList.remove('show');
    localStorage.setItem('ourroom_guide_seen_v2', '1');
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    fitOverview();                       // turning the phone sideways re-frames the room
  });

  /* ---------------- the loop ---------------- */
  const clock = new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    // sitting at a computer covers the whole room: don't spend the GPU on it
    if (document.body.classList.contains('in-pc')) return;
    const t = clock.elapsedTime;
    controls.update();

    if (focused || returning){
      const k = 1 - Math.exp(-dt * 2.4);
      camera.position.lerp(camPosGoal, k);
      controls.target.lerp(camTargetGoal, k);
      if (returning && camera.position.distanceTo(camPosGoal) < 0.02 && controls.target.distanceTo(camTargetGoal) < 0.02){
        returning = false;
        controls.enabled = true;
      }
    }

    if (tT < 1){
      tT = Math.min(1, tT + dt * 0.42);
      const e = tT < .5 ? 2*tT*tT : 1 - Math.pow(-2*tT+2, 2)/2;
      scene.background = fromP.bg.clone().lerp(toP.bg, e);
      scene.fog.color.copy(scene.background);
      scene.fog.near = fromP.fogNear + (toP.fogNear - fromP.fogNear) * e;
      scene.fog.far  = fromP.fogFar  + (toP.fogFar  - fromP.fogFar)  * e;
      hemi.color.copy(fromP.hemiSky.clone().lerp(toP.hemiSky, e));
      hemi.groundColor.copy(fromP.hemiGround.clone().lerp(toP.hemiGround, e));
      base.hemi = fromP.hemiI + (toP.hemiI - fromP.hemiI) * e;
      sun.color.copy(fromP.sun.clone().lerp(toP.sun, e));
      base.sun = fromP.sunI + (toP.sunI - fromP.sunI) * e;
      base.lamp = fromP.lampI + (toP.lampI - fromP.lampI) * e;

      nightAmt = isNight ? e : 1 - e;
      base.bounce = 0.8 * nightAmt;
      base.moon   = 0.3 * nightAmt;
      base.window = 0.6 * (1 - nightAmt);
      base.exp    = 1.05 + 0.32 * nightAmt;
    }

    // the light switch: a quick fade, like a real bulb
    lightK += ((lightsOn ? 1 : 0) - lightK) * Math.min(1, dt * 14);
    const dark = (1 - lightK) * nightAmt;            // only matters once it's dark outside
    hemi.intensity = base.hemi * (1 - 0.9 * dark);
    sun.intensity = base.sun * (1 - 0.75 * dark);
    lampLight.intensity = base.lamp * lightK;
    lampBounce.intensity = base.bounce * lightK;
    moonLight.intensity = base.moon * (1 - 0.4 * dark);
    windowGlow.intensity = base.window;
    renderer.toneMappingExposure = base.exp;
    wallLamps.forEach(w => {
      w.mat.emissiveIntensity = 0.15 + lightK * 2.2;
      w.light.intensity = lightK * (0.25 + nightAmt * 1.3);
    });

    for (let i = 0; i < frameHooks.length; i++){
      try { frameHooks[i](t, dt); } catch(e){ reportError('frame', e); frameHooks.splice(i--, 1); }
    }
    for (const f of features){
      if (f.update){ try { f.update(t, dt); } catch(e){ f.update = null; reportError(f.key + '.update', e); } }
    }

    renderer.render(scene, camera);
  }
  animate();

  // for the tests and for poking around in the console
  window.__room = { scene, camera, features, setNight, setLights, goBack, get focused(){ return focused; }, get returning(){ return returning; } };
}