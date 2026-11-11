/**
 * The size the 3D room draws at.
 *
 * On phones the browser's address bar slides in and out as you touch the page,
 * which changes the window's height by ~50–60px many times. If the room followed
 * that, the picture would squeeze and stretch sideways each time — a fast
 * left-right wobble that's hard on the eyes. So the room keeps the tallest
 * height it has seen, and only follows real changes: a different width
 * (turning the phone), a taller window, or a big drop (a keyboard, a split screen).
 *
 * Listen for 'ourroom:view' (on window) to hear about real changes.
 */
let W = innerWidth, H = innerHeight;

export function viewSize(){ return { w: W, h: H }; }

addEventListener('resize', () => {
  const w = innerWidth, h = innerHeight;
  const real = w !== W || h > H || H - h > 140;
  if (!real) return;
  W = w; H = h;
  window.dispatchEvent(new CustomEvent('ourroom:view', { detail: { w: W, h: H } }));
});