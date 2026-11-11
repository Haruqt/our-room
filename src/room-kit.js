import * as THREE from 'three';

/**
 * Small 3D helpers shared by the room features.
 */

/**
 * Measure a flat 4-corner surface (a picture, a screen) in the world:
 * its centre, the way it faces, its width and height as you'd see it.
 * `roomCenter` decides which side counts as the front.
 */
export function quadInfo(mesh, roomCenter){
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.attributes.position;
  const pts = [];
  for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  const center = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);

  // the face normal, pointed into the room
  const normal = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
  if (normal.dot(new THREE.Vector3().subVectors(roomCenter, center)) < 0) normal.negate();
  normal.y = 0; normal.normalize();                      // pictures and screens hang upright

  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  let w = 0, h = 0;
  pts.forEach(p => {
    const d = new THREE.Vector3().subVectors(p, center);
    w = Math.max(w, Math.abs(d.dot(right)) * 2);
    h = Math.max(h, Math.abs(d.dot(up)) * 2);
  });
  return { center, normal, right, up, width: w, height: h, aspect: w / h, corners: pts };
}

/**
 * Rewrite a surface's UVs so a texture fills it exactly and upright.
 * The model's own UVs point into a shared texture sheet at odd crops and
 * orientations; a new photo laid on them would come out cropped or sideways.
 */
export function fillQuadUV(mesh, info){
  const geo = mesh.geometry.clone();          // the model may share geometry between meshes
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++){
    const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const d = p.sub(info.center);
    uv.setXY(i, d.dot(info.right) / info.width + 0.5, d.dot(info.up) / info.height + 0.5);
  }
  geo.setAttribute('uv', uv);
  uv.needsUpdate = true;
  mesh.geometry = geo;
}

/** Draw an image into a canvas of the given aspect, cropping to fill (like CSS object-fit: cover). */
export function coverCanvas(img, aspect, longSide = 1024){
  const w = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const iw = img.naturalWidth || img.videoWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  g.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
  return c;
}

/** Load an image (data URL, blob URL or signed URL) ready for canvas use. */
export function loadImage(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load image'));
    img.src = src;
  });
}

/** A camera spot straight in front of a surface, far enough to frame it. */
export function frontView(info, camera, fill = 0.8){
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const distH = (info.height / fill / 2) / Math.tan(vfov / 2);
  const distW = (info.width / fill / 2) / (Math.tan(vfov / 2) * camera.aspect);
  const dist = Math.max(distH, distW);
  return {
    pos: info.center.clone().addScaledVector(info.normal, dist),
    target: info.center.clone(),
  };
}

/** Where a surface's corners land on screen, as a CSS rect. */
export function screenRect(info, camera, el){
  const r = el.getBoundingClientRect();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const half = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  half.forEach(([sx, sy]) => {
    const p = info.center.clone()
      .addScaledVector(info.right, sx * info.width / 2)
      .addScaledVector(info.up, sy * info.height / 2)
      .project(camera);
    const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

/** Escape text for innerHTML. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "3 hours ago", "yesterday", "Mar 4" */
export function ago(iso){
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 172800) return 'yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}