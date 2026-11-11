/**
 * Panels that open over the room: the bottle, the frames, the TV, the music,
 * the time capsule. One at a time; Escape or the × closes it.
 */
let current = null;

export function openPanel({ className = '', html = '', onClose = null }){
  closePanel(true);
  const host = document.getElementById('screen-room');
  const el = document.createElement('div');
  el.className = 'room-panel ' + className;
  el.innerHTML = `<button class="rp-close" aria-label="Close">&times;</button>${html}`;
  host.appendChild(el);
  current = { el, onClose };
  el.querySelector('.rp-close').addEventListener('click', () => closePanel());
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  return el;
}

/** @param {boolean} silent  replace without firing onClose (another panel is taking over) */
export function closePanel(silent = false){
  if (!current) return;
  const { el, onClose } = current;
  current = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 380);
  if (!silent && onClose) onClose();
}

export function panelOpen(){ return !!current; }

window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !current) return;
  // let an open dialog (prompt/confirm) take Escape first
  if (document.querySelector('.ui-backdrop.show')) return;
  e.stopImmediatePropagation();
  closePanel();
}, true);