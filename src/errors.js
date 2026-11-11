/**
 * Visible error reporting.
 *
 * Silent exceptions are what made the PC "just get stuck" — something threw
 * inside a timeout and nothing surfaced. Now anything that breaks shows a
 * panel with the real message, so a failure is diagnosable instead of a mystery.
 */

let panel = null;
const seen = new Set();

function ensurePanel(){
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'err-panel';
  panel.innerHTML = `
    <div class="err-head">
      <span>Something broke</span>
      <button id="err-close">×</button>
    </div>
    <div class="err-list" id="err-list"></div>
    <p class="err-foot">Copy this and send it over — it says exactly what failed.</p>`;
  document.body.appendChild(panel);
  panel.querySelector('#err-close').addEventListener('click', () => panel.classList.remove('show'));
  return panel;
}

/**
 * Turn anything into readable text.
 *
 * Supabase/PostgREST errors are plain objects ({ message, code, details, hint }),
 * not Error instances — String() on those gives "[object Object]", which is
 * exactly what the panel used to show instead of the actual cause.
 */
function describe(err){
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.stack || err.message;
  if (typeof err === 'object'){
    const parts = [];
    if (err.message) parts.push(err.message);
    if (err.code)    parts.push('code: ' + err.code);
    if (err.details) parts.push('details: ' + err.details);
    if (err.hint)    parts.push('hint: ' + err.hint);
    if (err.status)  parts.push('status: ' + err.status);
    if (err.error_description) parts.push(err.error_description);
    if (parts.length) return parts.join('\n');
    try { return JSON.stringify(err, null, 2); } catch(_){ /* circular */ }
  }
  return String(err);
}

export function reportError(where, err){
  const msg = describe(err);
  const key = where + msg.slice(0, 120);
  if (seen.has(key)) return;
  seen.add(key);

  console.error(`[${where}]`, err);
  const p = ensurePanel();
  const item = document.createElement('div');
  item.className = 'err-item';
  item.innerHTML = `<b>${where}</b><pre>${msg.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>`;
  p.querySelector('#err-list').appendChild(item);
  p.classList.add('show');
}

/** Wrap a function so a throw inside it is reported instead of vanishing. */
export function guard(where, fn){
  return function(...args){
    try { return fn.apply(this, args); }
    catch (e){ reportError(where, e); }
  };
}

export function installGlobalHandlers(){
  window.addEventListener('error', e => {
    reportError('uncaught', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', e => {
    reportError('promise', e.reason);
  });
}
