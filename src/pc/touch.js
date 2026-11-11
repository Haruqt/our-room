/**
 * Fingers on the computers.
 *
 * A mouse double-clicks to open and right-clicks for a menu. A finger taps
 * once to open (like a phone or a tablet in tablet mode) and presses and holds
 * for the menu.
 */

/** Open on double-click with a mouse, on a single tap with a finger. */
export function onActivate(el, fn){
  let touch = false;
  el.addEventListener('pointerdown', e => { touch = e.pointerType === 'touch' || e.pointerType === 'pen'; });
  el.addEventListener('dblclick', e => { if (!touch) fn(e); });
  el.addEventListener('click', e => { if (touch && !el._dragged) fn(e); el._dragged = false; });
}

/** Press and hold anywhere inside `root` = right-click there. */
export function longPressMenus(root){
  let lp = null;
  const clear = () => { if (lp) clearTimeout(lp.timer); };
  root.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    clear();
    const x = e.clientX, y = e.clientY, target = e.target;
    lp = { x, y, fired: false, timer: setTimeout(() => {
      lp.fired = true;
      try { navigator.vibrate?.(12); } catch(_){}
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }, 560) };
  }, true);
  root.addEventListener('pointermove', e => {
    if (lp && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) clear();
  }, true);
  root.addEventListener('pointerup', clear, true);
  root.addEventListener('pointercancel', clear, true);
  // Android also fires its own contextmenu on a long press: keep only one menu
  root.addEventListener('contextmenu', e => {
    if (!e.isTrusted || !lp) return;
    if (lp.fired){ e.preventDefault(); e.stopPropagation(); }
    else { clear(); lp.fired = true; }
  }, true);
  // the finger lifting after a long press must not also "click" what's under it
  root.addEventListener('click', e => {
    if (lp && lp.fired){ e.preventDefault(); e.stopPropagation(); lp = null; }
  }, true);
}

export const narrowScreen = () => window.innerWidth <= 720;