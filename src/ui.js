/**
 * In-app dialogs, toasts and cinematic subtitles.
 * Replaces native alert/prompt/confirm — those show "localhost:5173 says"
 * and break the illusion completely.
 */

let root = null;

function ensureRoot(){
  if (root) return root;
  root = document.createElement('div');
  root.id = 'ui-root';
  document.body.appendChild(root);
  return root;
}

function buildModal({ title, body, fields, actions }){
  ensureRoot();
  const back = document.createElement('div');
  back.className = 'ui-backdrop';

  const box = document.createElement('div');
  box.className = 'ui-modal';

  let html = '';
  if (title) html += `<h3 class="ui-modal-title">${title}</h3>`;
  if (body)  html += `<p class="ui-modal-body">${body}</p>`;
  if (fields) html += fields;
  html += `<div class="ui-modal-actions"></div>`;
  box.innerHTML = html;

  const actionWrap = box.querySelector('.ui-modal-actions');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'ui-btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '');
    b.textContent = a.label;
    b.addEventListener('click', () => a.onClick(box, back));
    actionWrap.appendChild(b);
  });

  back.appendChild(box);
  root.appendChild(back);
  requestAnimationFrame(() => back.classList.add('show'));
  return { back, box };
}

function close(back){
  back.classList.remove('show');
  setTimeout(() => back.remove(), 240);
}

export function showAlert(body, title = ''){
  return new Promise(resolve => {
    const { back } = buildModal({
      title, body, fields:'',
      actions:[{ label:'OK', primary:true, onClick:(b, bk) => { close(bk); resolve(); } }]
    });
    back.addEventListener('click', e => { if (e.target === back){ close(back); resolve(); } });
  });
}

export function showConfirm(body, title = '', okLabel = 'Yes'){
  return new Promise(resolve => {
    const { back } = buildModal({
      title, body, fields:'',
      actions:[
        { label:'Cancel', onClick:(b, bk) => { close(bk); resolve(false); } },
        { label:okLabel, primary:true, onClick:(b, bk) => { close(bk); resolve(true); } }
      ]
    });
    back.addEventListener('click', e => { if (e.target === back){ close(back); resolve(false); } });
  });
}

export function showPrompt(body, defaultValue = '', title = ''){
  return new Promise(resolve => {
    const { back, box } = buildModal({
      title, body,
      fields:`<input class="ui-input" type="text" value="${String(defaultValue).replace(/"/g,'&quot;')}">`,
      actions:[
        { label:'Cancel', onClick:(b, bk) => { close(bk); resolve(null); } },
        { label:'OK', primary:true, onClick:(b, bk) => {
            const v = box.querySelector('.ui-input').value.trim();
            close(bk); resolve(v || null);
          } }
      ]
    });
    const input = box.querySelector('.ui-input');
    setTimeout(() => { input.focus(); input.select(); }, 60);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ const v = input.value.trim(); close(back); resolve(v || null); }
      if (e.key === 'Escape'){ close(back); resolve(null); }
    });
    back.addEventListener('click', e => { if (e.target === back){ close(back); resolve(null); } });
  });
}

/** A choice list — nicer than prompting for a word. */
export function showChoice(body, options, title = ''){
  return new Promise(resolve => {
    ensureRoot();
    const back = document.createElement('div');
    back.className = 'ui-backdrop';
    const box = document.createElement('div');
    box.className = 'ui-modal';
    box.innerHTML =
      (title ? `<h3 class="ui-modal-title">${title}</h3>` : '') +
      (body ? `<p class="ui-modal-body">${body}</p>` : '') +
      `<div class="ui-choices"></div>`;
    const wrap = box.querySelector('.ui-choices');
    options.forEach(o => {
      const b = document.createElement('button');
      b.className = 'ui-choice';
      b.innerHTML = `<b>${o.label}</b>${o.hint ? `<i>${o.hint}</i>` : ''}`;
      b.addEventListener('click', () => { close(back); resolve(o.value); });
      wrap.appendChild(b);
    });
    back.appendChild(box);
    root.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    back.addEventListener('click', e => { if (e.target === back){ close(back); resolve(null); } });
  });
}

/* ---------------- toast ---------------- */
export function toast(msg, ms = 2200){
  ensureRoot();
  const t = document.createElement('div');
  t.className = 'ui-toast';
  t.textContent = msg;
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ---------------- cinematic subtitle ---------------- */
let subEl = null, subTimer = null;

export function subtitle(text, ms = 3400){
  if (!subEl){
    subEl = document.getElementById('subtitle');
    if (!subEl) return;
  }
  clearTimeout(subTimer);
  subEl.textContent = text;
  subEl.classList.add('show');
  subTimer = setTimeout(() => subEl.classList.remove('show'), ms);
}

export function clearSubtitle(){
  if (subEl) subEl.classList.remove('show');
  clearTimeout(subTimer);
}
