import { listFrames, setFrame, clearFrame, subscribe } from './room-data.js';
import { getPcFolders, ensurePhotoSrc } from './books.js';
import { quadInfo, fillQuadUV, coverCanvas, loadImage, frontView } from './room-kit.js';
import { openPanel, closePanel } from './room-panel.js';
import { toast } from './ui.js';
import { reportError } from './errors.js';

const SLOT_NAMES = ['the small one', 'the tall one', 'the wide one', 'the one by the shelf'];

/**
 * The four pictures on the wall become yours. Click one to change it.
 * A frame you haven't set keeps the model's original painting.
 */
export function installFrames(ctx){
  const { THREE, one, roomCenter, camera, focusTo, goBack, onBack, subtitle, ROOM } = ctx;

  const slots = ROOM.hotspots.frames.map((f, i) => {
    const picture = one(f.picture);
    if (!picture) return null;
    const info = quadInfo(picture, roomCenter);
    return {
      slot: i + 1, picture, frame: one(f.frame), info,
      originalGeo: picture.geometry, originalMat: picture.material,
      filledGeo: null, current: null,
    };
  }).filter(Boolean);
  if (!slots.length) return null;

  const texLoaderCanvas = canvas => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  async function show(s, src){
    if (!src){
      s.picture.geometry = s.originalGeo;
      s.picture.material = s.originalMat;
      s.current = null;
      return;
    }
    if (s.current === src) return;
    const img = await loadImage(src);
    if (!s.filledGeo){
      fillQuadUV(s.picture, s.info);           // rewrites UVs on a private copy
      s.filledGeo = s.picture.geometry;
    }
    s.picture.geometry = s.filledGeo;
    const mat = s.originalMat.clone();
    mat.map = texLoaderCanvas(coverCanvas(img, s.info.aspect, 1024));
    mat.color = new THREE.Color(1, 1, 1);
    mat.needsUpdate = true;
    s.picture.material = mat;
    s.current = src;
  }

  async function loadAll(){
    try {
      const map = await listFrames();
      await Promise.all(slots.map(s => show(s, map[s.slot] || null).catch(e => reportError('frame ' + s.slot, e))));
    } catch(e){
      if (!e.needsMigration) reportError('frames', e);
    }
  }
  loadAll();
  subscribe('frames', loadAll);

  /* ---- choosing a photo ---- */
  async function useImage(s, src){
    const img = await loadImage(src);
    const canvas = coverCanvas(img, s.info.aspect, 1400);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    toast('hanging it…', 1500);
    const url = await setFrame(s.slot, dataUrl);
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'frame' }));
    await show(s, url || dataUrl);
    subtitle('on the wall now', 2400);
  }

  function pickFile(s){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      useImage(s, url)
        .then(() => closePanel())
        .catch(e => { toast(e.needsMigration ? e.message : "couldn't hang that one", 6000); if (!e.needsMigration) reportError('frame upload', e); })
        .finally(() => URL.revokeObjectURL(url));
    });
    input.click();
  }

  function open(s){
    const view = frontView(s.info, camera, 0.42);
    // stand a little to the side so the panel doesn't cover the picture
    view.pos.addScaledVector(s.info.right, s.info.width * 0.55);
    view.target.addScaledVector(s.info.right, s.info.width * 0.55);
    focusTo('frame', view.pos, view.target, () => setTimeout(() => showPanel(s), 700));
  }

  function showPanel(s){
    const el = openPanel({
      className: 'frame-panel',
      onClose: () => goBack(),
      html: `
        <p class="rp-eyebrow">on the wall · ${SLOT_NAMES[s.slot - 1] || 'frame ' + s.slot}</p>
        <h2 class="rp-title">${s.current ? 'Change this photo' : 'Put one of yours here'}</h2>
        <div class="fp-actions">
          <button class="ui-btn primary fp-upload">Upload a photo</button>
          ${s.current ? '<button class="ui-btn fp-reset">Put the painting back</button>' : ''}
        </div>
        <p class="rp-eyebrow fp-sub">or pick one from our computers</p>
        <div class="fp-grid"><p class="fp-empty">looking…</p></div>`,
    });
    el.querySelector('.fp-upload').addEventListener('click', () => pickFile(s));
    el.querySelector('.fp-reset')?.addEventListener('click', async () => {
      try { await clearFrame(s.slot); await show(s, null); closePanel(); subtitle('the painting is back', 2200); }
      catch(e){ toast(e.message || "couldn't change it"); }
    });

    const grid = el.querySelector('.fp-grid');
    const photos = [...getPcFolders('andrei'), ...getPcFolders('cherryl')].flatMap(f => f.photos);
    if (!photos.length){
      grid.innerHTML = '<p class="fp-empty">no photos on the computers yet</p>';
      return;
    }
    grid.innerHTML = '';
    photos.slice(0, 60).forEach(ph => {
      const b = document.createElement('button');
      b.className = 'fp-thumb';
      b.title = ph.caption || '';
      b.innerHTML = '<img alt="">';
      ensurePhotoSrc(ph).then(src => { if (src) b.querySelector('img').src = src; });
      b.addEventListener('click', async () => {
        const src = await ensurePhotoSrc(ph);
        if (!src) return;
        b.classList.add('busy');
        try { await useImage(s, src); closePanel(); }
        catch(e){ toast(e.needsMigration ? e.message : "couldn't hang that one", 6000); if (!e.needsMigration) reportError('frame pick', e); }
        finally { b.classList.remove('busy'); }
      });
      grid.appendChild(b);
    });
  }

  onBack(was => { if (was === 'frame') closePanel(true); });

  const bySlotMesh = new Map();
  slots.forEach(s => { bySlotMesh.set(s.picture, s); if (s.frame) bySlotMesh.set(s.frame, s); });
  const slotOf = hit => bySlotMesh.get(hit.object) || slots[0];

  return {
    key: 'frames',
    objects: slots.flatMap(s => [s.picture, s.frame].filter(Boolean)),
    label: hit => ({ label: 'On the wall', sub: slotOf(hit).current ? 'click to change this photo' : 'put one of our photos here' }),
    click: hit => open(slotOf(hit)),
  };
}