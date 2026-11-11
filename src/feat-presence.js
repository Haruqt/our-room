import { joinPresence } from './room-data.js';
import { setHere } from './room-live.js';
import { getMe, other, shortOf } from './who.js';

/**
 * Slippers by the door show who's home.
 *
 * The model's blue-and-yellow pair is Andrei's; a pink pair beside it is
 * Cherryl's. A pair is by the door only while its owner has the site open,
 * so walking in and seeing hers means she's there right now.
 */
export function installPresence(ctx){
  const { THREE, scene, pick, subtitle, ROOM } = ctx;
  const orig = pick(ROOM.hotspots.slippers);
  if (!orig.length) return null;

  const box = new THREE.Box3();
  orig.forEach(o => box.union(new THREE.Box3().setFromObject(o)));
  const base = box.getCenter(new THREE.Vector3()); base.y = box.min.y;

  // Rebuild a pair as a group pivoting on its own centre, so it can be moved,
  // turned and scaled in and out as one thing.
  function makePair(colors){
    const g = new THREE.Group();
    g.position.copy(base);
    const toLocal = new THREE.Matrix4().makeTranslation(-base.x, -base.y, -base.z);
    orig.forEach((m, i) => {
      m.updateWorldMatrix(true, false);
      const mat = m.material.clone();
      if (colors) mat.color.set(colors[i]);
      const copy = new THREE.Mesh(m.geometry, mat);
      new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld).decompose(copy.position, copy.quaternion, copy.scale);
      copy.castShadow = copy.receiveShadow = true;
      g.add(copy);
    });
    g.scale.setScalar(0.0001);
    scene.add(g);
    return g;
  }

  const pairs = {
    andrei: makePair(null),
    cherryl: makePair(['#e98aa6', '#fff1e8']),
  };
  orig.forEach(m => { m.visible = false; });
  // hers sit just to the left of his, turned a little, the way you'd kick them off
  pairs.cherryl.position.add(new THREE.Vector3(-0.62, 0, 0.1));
  pairs.cherryl.rotation.y = 0.35;
  pairs.andrei.rotation.y = -0.08;
  Object.values(pairs).forEach(p => { p.userData.shown = 0; p.userData.want = 0; });

  const chip = document.getElementById('presence-chip');
  const chipText = document.getElementById('presence-chip-text');
  const me = getMe(), them = other();
  let here = new Set([me]);
  let first = true;

  joinPresence(me, set => {
    setHere(set);
    if (set.has('andrei') && set.has('cherryl')) window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'together' }));
    const was = here;
    here = set;
    pairs.andrei.userData.want = here.has('andrei') ? 1 : 0;
    pairs.cherryl.userData.want = here.has('cherryl') ? 1 : 0;

    const themHere = here.has(them);
    if (chip){
      chip.classList.toggle('show', themHere);
      if (chipText) chipText.textContent = `${shortOf(them)} is here`;
    }
    if (first){
      first = false;
      if (themHere) setTimeout(() => subtitle(`${shortOf(them)} is here too`, 3200), 4200);
      return;
    }
    if (themHere && !was.has(them)) subtitle(`${shortOf(them)} just walked in`, 3600);
    if (!themHere && was.has(them)) subtitle(`${shortOf(them)} left — ${them === 'cherryl' ? 'her' : 'his'} slippers are gone`, 3600);
  });

  const meshesOf = p => p.children;
  return {
    key: 'slippers',
    objects: [...meshesOf(pairs.andrei), ...meshesOf(pairs.cherryl)],
    label: hit => {
      const who = pairs.cherryl.children.includes(hit.object) ? 'cherryl' : 'andrei';
      if (who === me) return { label: 'Your slippers', sub: "you're home" };
      return { label: `${shortOf(who)}'s slippers`, sub: `${who === 'cherryl' ? "she's" : "he's"} here right now` };
    },
    click: hit => {
      const who = pairs.cherryl.children.includes(hit.object) ? 'cherryl' : 'andrei';
      subtitle(who === me
        ? (here.has(them) ? `${shortOf(them)} is here too` : `just you for now — ${shortOf(them)}'s slippers will show up when ${them === 'cherryl' ? 'she' : 'he'} comes in`)
        : `${shortOf(who)} is here — leave something in the bottle?`, 3600);
    },
    update(t, dt){
      for (const p of Object.values(pairs)){
        const u = p.userData;
        u.shown += (u.want - u.shown) * (1 - Math.exp(-dt * 6));
        const s = Math.max(0.0001, u.shown);
        p.scale.setScalar(s);
        p.position.y = base.y + (1 - u.shown) * 0.12 * u.want;   // drop into place on arrival
        p.visible = u.shown > 0.01;
      }
    },
  };
}