/**
 * The two computers on the desk, as real-feeling PCs.
 *
 * Each computer keeps its own state while you're away: walk back to the room
 * ("Back to room" on the taskbar, or Esc) and everything you had open stays
 * open — the monitor in the room shows it, like the TV shows what's playing.
 * "Shut down" closes everything and turns the screen off; the next visit
 * boots it up again.
 *
 *   off     screen dark; clicking the desk boots it
 *   locked  lock screen (wallpaper + clock); the state after loading the site
 *   on      signed in, desktop as you left it
 */
import './pc.css';
import * as sfx from '../sfx.js';
import * as store from '../store.js';
import { subscribe } from '../room-data.js';
import { getMe, shortOf, nameOf, isAdmin } from '../who.js';
import { toast, showConfirm } from '../ui.js';
import { reportError } from '../errors.js';
import { esc } from '../room-kit.js';
import { icon, startMark } from './icons.js';
import { wallpaperUrl } from './wallpapers.js';
import * as fs from './fs.js';
import { APPS, PINNED, openItem, itemMenu, desktopMenu } from './apps.js';
import { music } from '../feat-music.js';
import { onActivate, longPressMenus, narrowScreen } from './touch.js';

let onExitCb = null;
const pcs = {};
let active = null;
const listeners = new Set();

/** Monitors in the room listen here: fn(owner) whenever a PC's screen changes. */
export function onPcChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }
const notify = owner => listeners.forEach(fn => { try { fn(owner); } catch(e){ reportError('pc listener', e); } });

export const pcState = owner => (pcs[owner]?.state) || (localStorage.getItem('ourroom_pc_off_' + owner) ? 'off' : 'locked');
export const pcSnapshot = owner => pcs[owner]?.snapshot || null;
export const pcWallpaper = owner => wallpaperUrl(store.getPcSettings(owner).wallpaper, owner);

const PC_NAME = owner => owner === 'cherryl' ? 'CHE-PC' : 'ANDREI-PC';
const timeStr = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateStr = d => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* =================================================================== */
export function initDesktop({ onExit }){
  onExitCb = onExit;

  window.addEventListener('keydown', e => {
    if (!active || !overlay().classList.contains('show')) return;
    active.onKey(e);
  });

  // a change on one computer shows up on the other
  ['pc_folders', 'pc_photos', 'letters', 'pc_settings'].forEach(t => subscribe(t, () => store.refreshPc()));

  let t = null;
  const wpKeys = {};
  store.onChange(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      // a new wallpaper: the PC (if it's been opened) and the room's monitor
      ['andrei', 'cherryl'].forEach(owner => {
        const key = JSON.stringify(store.getPcSettings(owner).wallpaper || null);
        if (wpKeys[owner] !== undefined && wpKeys[owner] !== key){
          if (pcs[owner]) pcs[owner].applyWallpaper(); else notify(owner);
        }
        wpKeys[owner] = key;
      });
      Object.values(pcs).forEach(pc => pc.refresh());
    }, 120);
  });

  // turning the phone or resizing the window: icons and windows follow
  addEventListener('resize', () => {
    Object.values(pcs).forEach(pc => {
      if (pc.state !== 'on') return;
      pc.renderIcons();
      pc.windows.forEach(w => { if (narrowScreen()) w.el.classList.add('maximized'); });
    });
  });

  // the clock on the taskbar and lock screen
  setInterval(() => Object.values(pcs).forEach(pc => pc.tick()), 15000);
}

const overlay = () => document.getElementById('desktop-overlay');

/**
 * Sit down at a computer.
 * @param {string} userName  the greeting name (unused: identity comes from the login)
 * @param {'andrei'|'cherryl'} owner  which desk
 */
export function bootDesktop(userName, owner = 'andrei'){
  const ov = overlay();
  if (!ov){ reportError('bootDesktop', new Error('#desktop-overlay missing')); return; }
  if (!pcs[owner]) pcs[owner] = new PC(owner);
  Object.values(pcs).forEach(pc => pc.root.classList.toggle('active', pc.owner === owner));
  active = pcs[owner];
  ov.classList.add('show');
  document.body.classList.add('in-pc');
  active.enter();
}

/* =================================================================== */
class PC {
  constructor(owner){
    this.owner = owner;
    this.state = pcState(owner);
    this.windows = new Map();
    this.z = 10;
    this.seq = 0;
    this.snapshot = null;
    this.selected = new Set();
    this.layoutKey = 'ourroom_pc_layout_' + owner;
    this.build();
  }

  get mine(){ return this.owner === getMe(); }
  openApp(id, args = {}){ return APPS[id]?.open(this, args); }
  get canEdit(){ return this.mine || isAdmin(); }
  get name(){ return PC_NAME(this.owner); }

  /* ---------------- building the screen ---------------- */
  build(){
    const r = document.createElement('div');
    r.className = 'os';
    r.dataset.owner = this.owner;
    r.innerHTML = `
      <div class="os-wall"></div>
      <div class="os-icons"></div>
      <div class="os-windows"></div>
      <div class="os-banner"></div>
      <div class="os-taskbar">
        <div class="os-tb-center">
          <button class="os-tb-btn os-start-btn" title="Start">${startMark()}</button>
          <button class="os-tb-btn os-search-btn" title="Search">${icon('search')}</button>
          <div class="os-tb-apps"></div>
        </div>
        <div class="os-tb-right">
          <button class="os-room-btn" title="Leave everything open and go back to the room (Esc)">${icon('back')}<span>Back to room</span></button>
          <button class="os-tray os-tray-music" title="Sound">${icon('speaker')}</button>
          <span class="os-tray" title="Connected">${icon('wifi')}</span>
          <button class="os-clock" title="Calendar"><b></b><small></small></button>
          <span class="os-peek" title="Show desktop"></span>
        </div>
      </div>
      <div class="os-start">
        <div class="os-start-search">${icon('search')}<input placeholder="Search for apps and files" spellcheck="false"></div>
        <div class="os-start-body">
          <div class="os-start-h"><span>Pinned</span></div>
          <div class="os-start-pinned"></div>
          <div class="os-start-h"><span>Recommended</span></div>
          <div class="os-start-rec"></div>
          <div class="os-start-results"></div>
        </div>
        <div class="os-start-foot">
          <div class="os-user"><span class="os-avatar"></span><span class="os-user-name"></span></div>
          <button class="os-power-btn" title="Power">${icon('power')}</button>
          <div class="os-power-menu">
            <button data-p="sleep">${icon('back')} Back to room <small>leave it on</small></button>
            <button data-p="restart">${icon('restart')} Restart</button>
            <button data-p="shutdown">${icon('power')} Shut down</button>
          </div>
        </div>
      </div>
      <div class="os-ctx"></div>
      <div class="os-fly"></div>
      <div class="os-lock">
        <div class="os-lock-bg"></div>
        <div class="os-lock-time"><b></b><span></span></div>
        <div class="os-lock-hint">${matchMedia('(pointer: coarse)').matches ? 'tap to sign in' : 'click or press any key'}</div>
        <div class="os-signin">
          <span class="os-avatar big"></span>
          <h2 class="os-signin-name"></h2>
          <p class="os-signin-note"></p>
          <button class="os-signin-btn">Sign in</button>
          <div class="os-welcome"><div class="os-dots"><i></i><i></i><i></i><i></i><i></i></div><span>Welcome</span></div>
        </div>
      </div>
      <div class="os-boot">
        <div class="os-boot-mark">${startMark()}</div>
        <div class="os-dots"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="os-boot-msg"></div>
      </div>`;
    overlay().appendChild(r);
    this.root = r;
    // clicking a button doesn't leave it focused (so Space/Enter typed next
    // can't press it again), same as Windows' own taskbar and menus
    r.addEventListener('mousedown', e => { if (e.target.closest('button') && !e.target.closest('.os-signin')) e.preventDefault(); });
    longPressMenus(r);
    this.$ = s => r.querySelector(s);

    const initial = shortOf(this.owner)[0];
    r.querySelectorAll('.os-avatar').forEach(a => { a.textContent = initial; });
    this.$('.os-user-name').textContent = nameOf(this.owner);
    this.$('.os-signin-name').textContent = shortOf(this.owner);

    this.applyWallpaper();
    this.tick();
    this.wireTaskbar();
    this.wireStart();
    this.wireDesktop();
    this.wireLock();
  }

  async applyWallpaper(){
    try {
      const url = await pcWallpaper(this.owner);
      const css = `url("${url}")`;
      this.$('.os-wall').style.backgroundImage = css;
      this.$('.os-lock-bg').style.backgroundImage = css;
      this.wallUrl = url;
      notify(this.owner);
    } catch(e){ reportError('wallpaper', e); }
  }

  tick(){
    const d = new Date();
    this.$('.os-clock b').textContent = timeStr(d);
    this.$('.os-clock small').textContent = d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
    this.$('.os-lock-time b').textContent = timeStr(d);
    this.$('.os-lock-time span').textContent = dateStr(d);
    if (this.fly === 'calendar'){ const t = this.$('.os-cal-today small'); if (t) t.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
  }

  /* ---------------- coming and going ---------------- */
  async enter(){
    this.closeMenus();
    if (this.state === 'on'){
      this.root.classList.add('waking');
      setTimeout(() => this.root.classList.remove('waking'), 500);
      this.renderAll();
      return;
    }
    if (this.state === 'off') await this.boot();
    this.showLock();
  }

  async boot(){
    const b = this.$('.os-boot');
    b.classList.add('show');
    this.$('.os-boot-msg').textContent = '';
    // the real loading happens during the spinner
    const work = (async () => {
      try { fs.folders(this.owner); fs.texts(this.owner); await this.applyWallpaper(); } catch(e){ reportError('boot', e); }
    })();
    await Promise.all([work, wait(2300)]);
    b.classList.add('fade');
    await wait(450);
    b.classList.remove('show', 'fade');
    this.setState('locked');
    try { localStorage.removeItem('ourroom_pc_off_' + this.owner); } catch(_){}
  }

  showLock(){
    const l = this.$('.os-lock');
    l.classList.remove('signin', 'welcome', 'gone');
    l.classList.add('show');
    this.tick();
    this.$('.os-signin-note').textContent = this.mine ? ''
      : `signing in to ${shortOf(this.owner)}'s computer${this.canEdit ? ' · you\'re both admins' : ''}`;
  }

  wireLock(){
    const l = this.$('.os-lock');
    const toSignin = () => {
      if (!l.classList.contains('show') || l.classList.contains('signin')) return;
      l.classList.add('signin');
      setTimeout(() => this.$('.os-signin-btn').focus(), 350);
    };
    l.addEventListener('click', e => { if (!e.target.closest('.os-signin')) toSignin(); });
    this.lockKey = toSignin;
    this.$('.os-signin-btn').addEventListener('click', () => this.signIn());
  }

  async signIn(){
    const l = this.$('.os-lock');
    if (l.classList.contains('welcome')) return;
    l.classList.add('welcome');
    sfx.chime();
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: this.mine ? 'pc-boot' : 'pc-visit' }));
    this.setState('on');
    this.renderAll();
    await wait(1100);
    l.classList.add('gone');
    await wait(450);
    l.classList.remove('show', 'signin', 'welcome', 'gone');
    this.welcomeOnce();
    // like Windows: things in the bin for over 30 days are emptied
    if (this.canEdit) store.emptyBin(this.owner, 30).catch(e => reportError('bin cleanup', e));
  }

  /** Che's readme opens itself the first time she signs in. */
  welcomeOnce(){
    if (this.owner !== 'cherryl' || !this.mine) return;
    const key = 'ourroom_che_readme_opened';
    if (localStorage.getItem(key)) return;
    const readme = fs.texts('cherryl').find(l => l.filename === 'readme.txt');
    if (!readme) return;
    try { localStorage.setItem(key, '1'); } catch(_){}
    APPS.notepad.open(this, { letter: readme });
  }

  setState(s){
    this.state = s;
    notify(this.owner);
  }

  /** Back to the room, leaving everything as it is. */
  async leave(){
    if (this.leaving) return;
    this.leaving = true;
    this.closeMenus();
    this.windows.forEach(w => { try { w.body.saveNow?.(); } catch(_){} });
    if (this.state === 'on') await this.takeSnapshot();
    this.hide();
    this.leaving = false;
  }

  async shutdown(restart = false){
    if (this.leaving) return;
    this.leaving = true;
    this.closeMenus();
    [...this.windows.values()].forEach(w => w.close());
    const b = this.$('.os-boot');
    this.$('.os-boot-msg').textContent = restart ? 'Restarting' : 'Shutting down';
    b.classList.add('show', 'down');
    await wait(1500);
    b.classList.remove('show', 'down');
    this.snapshot = null;
    if (restart){
      this.setState('off');
      this.leaving = false;
      await this.boot();
      this.showLock();
      return;
    }
    this.setState('off');
    try { localStorage.setItem('ourroom_pc_off_' + this.owner, '1'); } catch(_){}
    this.hide();
    this.leaving = false;
  }

  hide(){
    overlay().classList.remove('show');
    document.body.classList.remove('in-pc');
    active = null;
    onExitCb && onExitCb();
  }

  /** A picture of the screen right now, for the monitor in the room. */
  async takeSnapshot(){
    try {
      const { default: html2canvas } = await import('../vendor/html2canvas.js');
      const scale = Math.min(1, 1280 / this.root.clientWidth);
      const job = html2canvas(this.root, {
        scale, backgroundColor: '#000', useCORS: true, logging: false,
        ignoreElements: el => el.classList?.contains('os-lock') || el.classList?.contains('os-boot')
          || el.classList?.contains('os-ctx') || el.tagName === 'IFRAME',
      });
      this.snapshot = await Promise.race([job, wait(4000).then(() => null)]) || this.snapshot;
    } catch(e){ reportError('pc snapshot', e); }
    notify(this.owner);
  }

  onKey(e){
    const lock = this.$('.os-lock');
    if (lock.classList.contains('show')){
      if (e.key === 'Escape'){ e.preventDefault(); this.hide(); return; }
      if (!lock.classList.contains('signin')){ this.lockKey(); e.preventDefault(); return; }
      if (e.key === 'Enter'){ this.signIn(); e.preventDefault(); }
      return;
    }
    if (this.$('.os-boot').classList.contains('show')) return;
    const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
    if (e.key === 'Escape'){
      e.preventDefault();
      if (this.menuOpen()){ this.closeMenus(); return; }
      if (typing){ e.target.blur(); return; }
      this.leave();
      return;
    }
    if (typing) return;
    if (e.key === 'Meta' || (e.key === 'Escape' && e.ctrlKey)){ this.toggleStart(); return; }
    // keys for the selected desktop icons
    if (!this.focusedDesktop) return;
    const items = this.desktopItems().filter(i => this.selected.has(i.key));
    if (e.key === 'Delete' && items.length){ e.preventDefault(); this.deleteItems(items.filter(i => i.item).map(i => i.item)); }
    if (e.key === 'F2' && items.length === 1 && items[0].item){ e.preventDefault(); this.renameIcon(items[0]); }
    if (e.key === 'Enter' && items.length){ e.preventDefault(); items.forEach(i => i.open()); }
  }

  /* ---------------- refreshing ---------------- */
  renderAll(){
    this.renderBanner();
    this.renderIcons();
    this.renderTaskbar();
  }

  refresh(){
    if (!this.root || this.state !== 'on') return;
    this.renderIcons();
    this.windows.forEach(w => { try { w.refresh?.(); } catch(e){ reportError('window refresh', e); } });
  }

  renderBanner(){
    const b = this.$('.os-banner');
    const note = !this.mine
      ? (this.canEdit ? `${shortOf(this.owner)}'s computer — you're both admins, you can change anything here`
                      : `${shortOf(this.owner)}'s computer — you can look and read`)
      : '';
    const pending = store.mode === 'supabase' && !store.binWorks()
      ? 'Recycle Bin and wallpaper sync are off until supabase-migration-004.sql is run — deleting is permanent for now' : '';
    b.textContent = [note, pending].filter(Boolean).join('  ·  ');
    b.classList.toggle('show', Boolean(b.textContent));
  }

  /* ---------------- desktop icons ---------------- */
  desktopItems(){
    const out = [
      { key: 'sys:thispc', name: 'This PC', icon: 'thispc', open: () => APPS.explorer.open(this, { loc: 'thispc' }) },
      { key: 'sys:bin', name: 'Recycle Bin', icon: store.binItems(this.owner).length ? 'binFull' : 'binEmpty',
        open: () => APPS.explorer.open(this, { loc: 'bin' }), isBin: true },
    ];
    fs.list(this.owner, 'desktop').forEach(item => out.push({
      key: item.kind + ':' + item.id, name: item.name, icon: item.icon, item,
      open: () => openItem(this, item),
    }));
    out.push({ key: 'sys:browser', name: 'Browser', icon: 'browser', open: () => APPS.browser.open(this, {}) });
    out.push({ key: 'sys:songs', name: 'our songs', icon: 'music', open: () => APPS.music.open(this, {}) });
    return out;
  }

  layout(){ try { return JSON.parse(localStorage.getItem(this.layoutKey)) || {}; } catch(_){ return {}; } }
  saveLayout(l){ try { localStorage.setItem(this.layoutKey, JSON.stringify(l)); } catch(_){} }
  gridSize(){
    const area = this.$('.os-icons').getBoundingClientRect();
    return { cw: 92, ch: 100, rows: Math.max(3, Math.floor((area.height - 8) / 100)), cols: Math.max(3, Math.floor(area.width / 92)) };
  }

  renderIcons(){
    const wrap = this.$('.os-icons');
    const items = this.desktopItems();
    const { cw, ch, rows, cols } = this.gridSize();
    const saved = this.layout();
    const used = new Set();
    const pos = {};
    // remembered spots first, then fill the free cells column by column
    items.forEach(it => {
      const p = saved[it.key];
      if (p && p.c < cols && p.r < rows && !used.has(p.c + ',' + p.r)){ pos[it.key] = p; used.add(p.c + ',' + p.r); }
    });
    let c = 0, r = 0;
    items.forEach(it => {
      if (pos[it.key]) return;
      while (used.has(c + ',' + r)){ r++; if (r >= rows){ r = 0; c++; } }
      pos[it.key] = { c, r }; used.add(c + ',' + r);
    });
    this.iconPos = pos;

    wrap.innerHTML = '';
    items.forEach(it => {
      const el = document.createElement('div');
      el.className = 'os-dicon' + (this.selected.has(it.key) ? ' sel' : '');
      el.dataset.key = it.key;
      el.style.left = (pos[it.key].c * cw + 6) + 'px';
      el.style.top = (pos[it.key].r * ch + 6) + 'px';
      el.innerHTML = `${icon(it.icon)}<span class="os-dlabel">${esc(it.name)}</span>`;
      el.title = it.name;
      this.wireIcon(el, it);
      wrap.appendChild(el);
    });
    this._items = items;
  }

  wireIcon(el, it){
    let down = null, dragging = false;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      this.focusedDesktop = true;
      if (e.ctrlKey){ this.selected.has(it.key) ? this.selected.delete(it.key) : this.selected.add(it.key); }
      else if (!this.selected.has(it.key)){ this.selected = new Set([it.key]); }
      this.markSelected();
      down = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true;
      el._dragged = true;
      el.classList.add('dragging');
      el.style.left = (down.l + dx) + 'px';
      el.style.top = (down.t + dy) + 'px';
      const target = this.iconAt(e.clientX, e.clientY, it.key);
      this.$('.os-icons').querySelectorAll('.os-dicon').forEach(x => x.classList.toggle('drop', x === target?.el && this.canDrop(it, target.it)));
    });
    const end = e => {
      if (!down) return;
      const wasDrag = dragging;
      down = null; dragging = false;
      el.classList.remove('dragging');
      this.$('.os-icons').querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
      if (!wasDrag) return;
      const target = this.iconAt(e.clientX, e.clientY, it.key);
      if (target && this.canDrop(it, target.it)){ this.dropOn(it, target.it); return; }
      // snap to the nearest free cell
      const { cw, ch, rows, cols } = this.gridSize();
      const c = Math.max(0, Math.min(cols - 1, Math.round((el.offsetLeft - 6) / cw)));
      const r = Math.max(0, Math.min(rows - 1, Math.round((el.offsetTop - 6) / ch)));
      const taken = Object.entries(this.iconPos).find(([k, p]) => k !== it.key && p.c === c && p.r === r);
      const layout = { ...this.iconPos };
      if (taken) layout[taken[0]] = this.iconPos[it.key];      // swap places
      layout[it.key] = { c, r };
      this.saveLayout(layout);
      this.renderIcons();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    onActivate(el, () => it.open());
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      if (!this.selected.has(it.key)){ this.selected = new Set([it.key]); this.markSelected(); }
      const sel = this._items.filter(i => this.selected.has(i.key));
      this.menu(e.clientX, e.clientY, it.item ? itemMenu(this, it.item, { many: sel.filter(s => s.item).map(s => s.item), onRename: () => this.renameIcon(it) })
        : it.isBin ? [
            { label: 'Open', action: it.open, bold: true },
            { label: 'Empty Recycle Bin', icon: 'trash', disabled: !store.binItems(this.owner).length || !this.canEdit, action: () => APPS.explorer.emptyBin(this) },
          ]
        : [{ label: 'Open', action: it.open, bold: true }]);
    });
  }

  markSelected(){
    this.$('.os-icons').querySelectorAll('.os-dicon').forEach(x => x.classList.toggle('sel', this.selected.has(x.dataset.key)));
  }

  iconAt(x, y, exceptKey){
    for (const el of this.$('.os-icons').querySelectorAll('.os-dicon')){
      if (el.dataset.key === exceptKey) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { el, it: this._items.find(i => i.key === el.dataset.key) };
    }
    return null;
  }

  canDrop(dragged, target){
    if (!this.canEdit || !dragged.item || !target) return false;
    if (target.isBin) return true;
    return dragged.item.kind === 'letter' && target.item?.kind === 'folder';
  }

  async dropOn(dragged, target){
    const items = this._items.filter(i => this.selected.has(i.key) && i.item).map(i => i.item);
    const list = items.length ? items : [dragged.item];
    if (target.isBin){ await this.deleteItems(list); return; }
    list.filter(i => i.kind === 'letter').forEach(i => fs.moveText(i.id, target.item.id));
    toast(`moved into ${target.item.name}`, 1800);
  }

  async deleteItems(items){
    if (!items.length || !this.canEdit) return;
    const forGood = !fs.binWorks();
    if (forGood && !await showConfirm(`Delete ${items.length === 1 ? `"${items[0].name}"` : items.length + ' items'} for good? (The Recycle Bin turns on after migration 004.)`, 'Delete', 'Delete')) return;
    for (const it of items){
      try { await fs.toBin(it); }
      catch(e){ toast(e.message || "couldn't delete that"); reportError('delete', e); }
    }
    this.selected.clear();
    if (!forGood) toast(items.length === 1 ? `"${items[0].name}" moved to the Recycle Bin` : `${items.length} items moved to the Recycle Bin`, 2200);
  }

  renameIcon(it){
    if (!this.canEdit || !it.item) return;
    const el = this.$(`.os-dicon[data-key="${CSS.escape(it.key)}"]`);
    if (!el) return;
    const label = el.querySelector('.os-dlabel');
    const input = document.createElement('textarea');
    input.className = 'os-rename';
    input.value = it.name;
    label.replaceWith(input);
    input.focus();
    // select the name without its extension, like Windows does
    const dot = it.item.kind === 'letter' ? it.name.lastIndexOf('.') : -1;
    input.setSelectionRange(0, dot > 0 ? dot : it.name.length);
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      const v = input.value.replace(/[\r\n]+/g, ' ').trim();
      if (ok && v && v !== it.name) fs.rename(it.item, v);
      this.renderIcons();
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
      if (e.key === 'Escape'){ e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', e => e.stopPropagation());
  }

  wireDesktop(){
    const icons = this.$('.os-icons');
    icons.addEventListener('pointerdown', e => {
      if (e.target !== icons) return;
      this.focusedDesktop = true;
      this.selected.clear(); this.markSelected();
      this.closeMenus();
      this.boxSelect(e);
    });
    icons.addEventListener('contextmenu', e => {
      if (e.target !== icons) return;
      e.preventDefault();
      this.menu(e.clientX, e.clientY, desktopMenu(this));
    });
    this.$('.os-windows').addEventListener('pointerdown', () => { this.focusedDesktop = false; }, true);
  }

  /** Drag on empty desktop to select several icons. */
  boxSelect(e){
    const icons = this.$('.os-icons');
    const r0 = icons.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'os-box';
    icons.appendChild(box);
    const sx = e.clientX, sy = e.clientY;
    const move = ev => {
      const x0 = Math.min(sx, ev.clientX), y0 = Math.min(sy, ev.clientY);
      const x1 = Math.max(sx, ev.clientX), y1 = Math.max(sy, ev.clientY);
      Object.assign(box.style, { left: (x0 - r0.left) + 'px', top: (y0 - r0.top) + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
      this.selected = new Set();
      icons.querySelectorAll('.os-dicon').forEach(el => {
        const b = el.getBoundingClientRect();
        if (b.right > x0 && b.left < x1 && b.bottom > y0 && b.top < y1) this.selected.add(el.dataset.key);
      });
      this.markSelected();
    };
    const up = () => { box.remove(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ---------------- menus ---------------- */
  menu(x, y, items){
    const m = this.$('.os-ctx');
    this.closeMenus();
    m.innerHTML = '';
    const build = (list, parent) => {
      list.forEach(it => {
        if (it.sep){ const s = document.createElement('div'); s.className = 'os-ctx-sep'; parent.appendChild(s); return; }
        const b = document.createElement('button');
        b.className = 'os-ctx-item' + (it.bold ? ' bold' : '') + (it.sub ? ' has-sub' : '');
        b.disabled = Boolean(it.disabled);
        // menu items never take keyboard focus: a Space or Enter typed right
        // after choosing one must not choose it again
        b.tabIndex = -1;
        b.addEventListener('mousedown', ev => ev.preventDefault());
        b.innerHTML = `${it.icon ? icon(it.icon) : '<span class="os-ic"></span>'}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}`;
        if (it.sub){
          const sub = document.createElement('div');
          sub.className = 'os-ctx-sub';
          build(it.sub, sub);
          b.appendChild(sub);
          // fingers can't hover: a tap opens the sub-menu in place
          b.addEventListener('click', ev => { if (ev.target.closest('.os-ctx-sub')) return; ev.stopPropagation(); b.classList.toggle('open'); });
        } else {
          b.addEventListener('click', ev => { ev.stopPropagation(); this.closeMenus(); try { it.action?.(); } catch(err){ reportError('menu', err); } });
        }
        parent.appendChild(b);
      });
    };
    build(items, m);
    m.classList.add('show');
    const rr = this.root.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(x - rr.left, rr.width - w - 6) + 'px';
    m.style.top = Math.min(y - rr.top, rr.height - h - 54) + 'px';
    m.classList.toggle('flip', x - rr.left + w * 2 > rr.width);
    setTimeout(() => {
      const off = ev => { if (!m.contains(ev.target)){ this.closeMenus(); } };
      this._ctxOff = off;
      window.addEventListener('pointerdown', off, true);
    }, 0);
  }

  menuOpen(){
    return this.$('.os-ctx').classList.contains('show') || this.$('.os-start').classList.contains('show') || Boolean(this.fly);
  }

  closeMenus(){
    if (this.$('.os-ctx').contains(document.activeElement)) document.activeElement.blur();
    this.$('.os-ctx').classList.remove('show');
    if (this._ctxOff){ window.removeEventListener('pointerdown', this._ctxOff, true); this._ctxOff = null; }
    this.$('.os-start').classList.remove('show');
    this.$('.os-power-menu').classList.remove('show');
    this.closeFly();
  }

  /* ---------------- taskbar flyouts: sound and calendar ----------------
     Click the icon to open, click it again (or anywhere else, or Esc) to close. */
  toggleFly(kind){
    if (this.fly === kind){ this.closeFly(); return; }
    this.$('.os-start').classList.remove('show');
    this.$('.os-ctx').classList.remove('show');
    this.fly = kind;
    const f = this.$('.os-fly');
    f.className = 'os-fly show ' + kind;
    if (kind === 'sound') this.renderSound();
    if (kind === 'calendar'){ this.calMonth = new Date(); this.calMonth.setDate(1); this.renderCalendar(); }
    this.$('.os-tray-music').classList.toggle('on', kind === 'sound');
    this.$('.os-clock').classList.toggle('on', kind === 'calendar');
  }

  closeFly(){
    if (!this.fly) return;
    this.fly = null;
    this.$('.os-fly').className = 'os-fly';
    this.$('.os-tray-music').classList.remove('on');
    this.$('.os-clock').classList.remove('on');
  }

  renderSound(){
    const f = this.$('.os-fly');
    const st = music.state() || { title: null, playing: false, hasTracks: false, volume: 0.8 };
    f.innerHTML = `
      <div class="os-fly-h">Sound</div>
      <div class="os-np">
        <div class="os-np-art">${icon('music')}</div>
        <div class="os-np-meta"><b>${esc(st.title || (st.hasTracks ? 'Nothing playing' : 'No songs yet'))}</b><small>${esc(st.title ? (st.artist || 'our songs') : 'through the speakers in the room')}</small></div>
      </div>
      <div class="os-np-ctl">
        <button data-a="prev" title="Previous" ${st.hasTracks ? '' : 'disabled'}>⏮</button>
        <button data-a="play" class="big" title="Play / pause" ${st.hasTracks ? '' : 'disabled'}>${st.playing ? '⏸' : '▶'}</button>
        <button data-a="next" title="Next" ${st.hasTracks ? '' : 'disabled'}>⏭</button>
      </div>
      <label class="os-vol">${icon('speaker')}<input type="range" min="0" max="1" step="0.01" value="${st.volume}"><span>${Math.round(st.volume * 100)}</span></label>
      <button class="os-fly-link" data-a="open">Open our songs</button>`;
    f.querySelector('[data-a="prev"]').addEventListener('click', () => music.step(-1));
    f.querySelector('[data-a="next"]').addEventListener('click', () => music.step(1));
    f.querySelector('[data-a="play"]').addEventListener('click', () => { music.toggle(); setTimeout(() => this.fly === 'sound' && this.renderSound(), 250); });
    f.querySelector('[data-a="open"]').addEventListener('click', () => { this.closeFly(); APPS.music.open(this, {}); });
    const range = f.querySelector('input');
    range.addEventListener('input', () => { music.setVolume(Number(range.value)); f.querySelector('.os-vol span').textContent = Math.round(range.value * 100); });
  }

  renderCalendar(){
    const f = this.$('.os-fly');
    const now = new Date();
    const m = this.calMonth;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());      // weeks start on Sunday
    const days = [];
    for (let i = 0; i < 42; i++){ const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
    const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const wd = [...Array(7)].map((_, i) => new Date(2023, 0, 1 + i).toLocaleDateString([], { weekday: 'short' }).slice(0, 2));
    f.innerHTML = `
      <div class="os-cal-today">${esc(dateStr(now))}<small>${esc(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }))}</small></div>
      <div class="os-cal-head">
        <b>${esc(m.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</b>
        <span><button data-a="prev" title="Previous month">${icon('up')}</button><button data-a="next" title="Next month" class="down">${icon('up')}</button></span>
      </div>
      <div class="os-cal-grid">
        ${wd.map(w => `<span class="wd">${esc(w)}</span>`).join('')}
        ${days.map(d => `<button class="${d.getMonth() !== m.getMonth() ? 'out' : ''} ${same(d, now) ? 'today' : ''}" title="${esc(d.toDateString())}">${d.getDate()}</button>`).join('')}
      </div>
      <button class="os-fly-link" data-a="today">Today</button>`;
    f.querySelector('[data-a="prev"]').addEventListener('click', () => { m.setMonth(m.getMonth() - 1); this.renderCalendar(); });
    f.querySelector('[data-a="next"]').addEventListener('click', () => { m.setMonth(m.getMonth() + 1); this.renderCalendar(); });
    f.querySelector('[data-a="today"]').addEventListener('click', () => { this.calMonth = new Date(); this.calMonth.setDate(1); this.renderCalendar(); });
    f.querySelectorAll('.os-cal-grid button').forEach(b => b.addEventListener('click', () => {
      f.querySelectorAll('.os-cal-grid button.sel').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    }));
  }

  /* ---------------- taskbar ---------------- */
  wireTaskbar(){
    this.$('.os-start-btn').addEventListener('click', e => { e.stopPropagation(); this.toggleStart(); });
    this.$('.os-search-btn').addEventListener('click', e => { e.stopPropagation(); this.toggleStart(true); });
    this.$('.os-room-btn').addEventListener('click', () => this.leave());
    this.$('.os-tray-music').addEventListener('click', e => { e.stopPropagation(); this.toggleFly('sound'); });
    this.$('.os-peek').addEventListener('click', () => {
      const all = [...this.windows.values()];
      const anyUp = all.some(w => !w.el.classList.contains('minimized'));
      all.forEach(w => anyUp ? w.minimize() : w.restore());
    });
    this.$('.os-clock').addEventListener('click', e => { e.stopPropagation(); this.toggleFly('calendar'); });
    this.$('.os-fly').addEventListener('pointerdown', e => e.stopPropagation());
    this.root.addEventListener('pointerdown', e => {
      if (this.fly && !e.target.closest('.os-fly, .os-tray-music, .os-clock')) this.closeFly();
    });
    music.onChange(() => { if (this.fly === 'sound') this.renderSound(); });
  }

  renderTaskbar(){
    const wrap = this.$('.os-tb-apps');
    wrap.innerHTML = '';
    const running = [...this.windows.values()];
    const ids = [...PINNED, ...running.map(w => w.app).filter(a => !PINNED.includes(a))];
    [...new Set(ids)].forEach(appId => {
      const app = APPS[appId];
      if (!app) return;
      const wins = running.filter(w => w.app === appId);
      const b = document.createElement('button');
      const focused = wins.some(w => w.el.classList.contains('focused') && !w.el.classList.contains('minimized'));
      b.className = 'os-tb-btn os-tb-app' + (wins.length ? ' running' : '') + (focused ? ' focused' : '');
      b.title = wins.length ? wins.map(w => w.title).join('\n') : app.name;
      b.innerHTML = icon(app.icon) + (wins.length > 1 ? `<em>${wins.length}</em>` : '');
      b.addEventListener('click', () => {
        if (!wins.length){ app.open(this, {}); return; }
        // cycle through this app's windows, minimizing the top one when it's in front
        const top = wins.reduce((a, w) => (+w.el.style.zIndex > +a.el.style.zIndex ? w : a), wins[0]);
        if (wins.length === 1 && focused) top.minimize();
        else if (focused){ const next = wins[(wins.indexOf(top) + 1) % wins.length]; next.restore(); }
        else top.restore();
      });
      b.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.menu(e.clientX, e.clientY - 10, [
          { label: app.name, icon: app.icon, action: () => app.open(this, { fresh: true }) },
          ...(wins.length ? [{ sep: true }, { label: wins.length > 1 ? 'Close all windows' : 'Close window', icon: 'trash', action: () => wins.forEach(w => w.close()) }] : []),
        ]);
      });
      wrap.appendChild(b);
    });
  }

  /* ---------------- start menu ---------------- */
  wireStart(){
    const s = this.$('.os-start');
    const input = this.$('.os-start-search input');
    input.addEventListener('input', () => this.renderStartResults());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ this.$('.os-start-results .os-start-row')?.click(); }
      e.stopPropagation();
      if (e.key === 'Escape'){ input.blur(); this.closeMenus(); }
    });
    this.$('.os-power-btn').addEventListener('click', e => { e.stopPropagation(); this.$('.os-power-menu').classList.toggle('show'); });
    this.$('.os-power-menu').addEventListener('click', e => {
      const p = e.target.closest('button')?.dataset.p;
      if (!p) return;
      this.closeMenus();
      if (p === 'sleep') this.leave();
      if (p === 'restart') this.shutdown(true);
      if (p === 'shutdown') this.shutdown(false);
    });
    s.addEventListener('pointerdown', e => e.stopPropagation());
    this.root.addEventListener('pointerdown', e => {
      if (!s.classList.contains('show')) return;
      if (e.target.closest('.os-start, .os-start-btn, .os-search-btn')) return;
      this.closeMenus();
    });
  }

  toggleStart(focusSearch = false){
    const s = this.$('.os-start');
    if (s.classList.contains('show')){ this.closeMenus(); return; }
    this.closeMenus();
    const pinned = this.$('.os-start-pinned');
    pinned.innerHTML = '';
    Object.entries(APPS).filter(([, a]) => !a.hidden).forEach(([id, a]) => {
      const b = document.createElement('button');
      b.className = 'os-start-app';
      b.innerHTML = `${icon(a.icon)}<span>${esc(a.name)}</span>`;
      b.addEventListener('click', () => { this.closeMenus(); a.open(this, {}); });
      pinned.appendChild(b);
    });
    const rec = this.$('.os-start-rec');
    rec.innerHTML = '';
    const recent = fs.texts(this.owner).slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 4);
    if (!recent.length) rec.innerHTML = '<p class="os-muted">Files you open will show up here.</p>';
    recent.forEach(l => {
      const b = document.createElement('button');
      b.className = 'os-start-row';
      b.innerHTML = `${icon('text')}<span><b>${esc(l.filename)}</b><small>${l.updatedAt ? fs.fmtDate(l.updatedAt) : 'on the desktop'}</small></span>`;
      b.addEventListener('click', () => { this.closeMenus(); APPS.notepad.open(this, { letter: l }); });
      rec.appendChild(b);
    });
    const input = this.$('.os-start-search input');
    input.value = '';
    this.renderStartResults();
    s.classList.add('show');
    if (focusSearch) setTimeout(() => input.focus(), 60);
  }

  renderStartResults(){
    const q = this.$('.os-start-search input').value.trim().toLowerCase();
    const s = this.$('.os-start');
    s.classList.toggle('searching', Boolean(q));
    const out = this.$('.os-start-results');
    out.innerHTML = '';
    if (!q) return;
    const rows = [];
    Object.values(APPS).filter(a => !a.hidden && (a.name.toLowerCase().includes(q) || (a.keywords || '').includes(q)))
      .forEach(a => rows.push({ icon: a.icon, name: a.name, sub: 'App', open: () => a.open(this, {}) }));
    fs.folders(this.owner).filter(f => f.name.toLowerCase().includes(q))
      .forEach(f => rows.push({ icon: 'folder', name: f.name, sub: 'Folder', open: () => APPS.explorer.open(this, { loc: 'folder:' + f.id }) }));
    fs.texts(this.owner).filter(l => l.filename.toLowerCase().includes(q) || (l.text || '').toLowerCase().includes(q))
      .forEach(l => rows.push({ icon: 'text', name: l.filename, sub: 'Text document', open: () => APPS.notepad.open(this, { letter: l }) }));
    rows.push({ icon: 'browser', name: `Search the web for "${q}"`, sub: 'opens in a new tab', open: () => APPS.browser.open(this, { search: q }) });
    rows.slice(0, 9).forEach(r => {
      const b = document.createElement('button');
      b.className = 'os-start-row';
      b.innerHTML = `${icon(r.icon)}<span><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></span>`;
      b.addEventListener('click', () => { this.closeMenus(); r.open(); });
      out.appendChild(b);
    });
  }

  /* ---------------- windows ---------------- */
  /**
   * Open (or bring forward) a window.
   * @returns the window: { el, body, title, setTitle(t), close(), focus(), minimize(), restore(), refresh }
   */
  openWindow({ id, app, title, iconName, width = 760, height = 500, build, onClose }){
    if (id && this.windows.has(id)){
      const w = this.windows.get(id);
      w.restore();
      return w;
    }
    id = id || app + ':' + (++this.seq);
    const area = this.$('.os-windows').getBoundingClientRect();
    width = Math.min(width, area.width - 20);
    height = Math.min(height, area.height - 20);
    const n = this.windows.size;
    const el = document.createElement('div');
    el.className = 'os-win';
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.style.left = Math.max(8, (area.width - width) / 2 - 80 + (n % 5) * 34) + 'px';
    el.style.top = Math.max(8, (area.height - height) / 2 - 40 + (n % 5) * 30) + 'px';
    el.innerHTML = `
      <div class="os-win-bar">
        ${icon(iconName || APPS[app]?.icon || 'text')}
        <span class="os-win-title"></span>
        <div class="os-win-ctl">
          <button class="os-wbtn min" title="Minimize"><svg viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor"/></svg></button>
          <button class="os-wbtn max" title="Maximize"><svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor"/></svg></button>
          <button class="os-wbtn close" title="Close"><svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor"/></svg></button>
        </div>
      </div>
      <div class="os-win-body"></div>
      <i class="os-grip e"></i><i class="os-grip s"></i><i class="os-grip se"></i><i class="os-grip w"></i>`;
    this.$('.os-windows').appendChild(el);
    if (narrowScreen()) el.classList.add('maximized');     // a phone: every window fills the screen

    const pc = this;
    const win = {
      id, app, el, body: el.querySelector('.os-win-body'), title,
      setTitle(t){ win.title = t; el.querySelector('.os-win-title').textContent = t; pc.renderTaskbar(); },
      focus(){ pc.focusWindow(win); },
      minimize(){ el.classList.add('minimized'); el.classList.remove('focused'); pc.renderTaskbar(); },
      restore(){ el.classList.remove('minimized'); pc.focusWindow(win); },
      close(){
        try { win.body.saveNow?.(); } catch(e){ reportError('save on close', e); }
        try { onClose?.(); } catch(e){ reportError('close', e); }
        el.classList.add('closing');
        setTimeout(() => el.remove(), 160);
        pc.windows.delete(id);
        pc.renderTaskbar();
      },
      toggleMax(){ if (!narrowScreen()) el.classList.toggle('maximized'); },
      refresh: null,
    };
    win.setTitle(title);
    this.windows.set(id, win);

    el.addEventListener('pointerdown', () => this.focusWindow(win));
    el.querySelector('.min').addEventListener('click', e => { e.stopPropagation(); win.minimize(); });
    el.querySelector('.max').addEventListener('click', e => { e.stopPropagation(); win.toggleMax(); });
    el.querySelector('.close').addEventListener('click', e => { e.stopPropagation(); win.close(); });
    el.querySelector('.os-win-bar').addEventListener('dblclick', e => { if (!e.target.closest('.os-wbtn')) win.toggleMax(); });
    this.dragWindow(el);

    try { build(win); } catch(e){ reportError('open ' + app, e); }
    void el.offsetWidth;                 // start the fade-in from the closed state
    el.classList.add('open');
    this.focusWindow(win);
    return win;
  }

  focusWindow(win){
    if (win.el.classList.contains('focused') && +win.el.style.zIndex === this.z) return;
    win.el.style.zIndex = ++this.z;
    this.windows.forEach(w => w.el.classList.toggle('focused', w === win));
    this.focusedDesktop = false;
    this.renderTaskbar();
  }

  dragWindow(el){
    const bar = el.querySelector('.os-win-bar');
    const bounds = () => this.$('.os-windows').getBoundingClientRect();
    let st = null;
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('.os-wbtn') || e.button !== 0 || narrowScreen()) return;
      const b = bounds();
      if (el.classList.contains('maximized')){
        // pulling a maximized window down un-maximizes it under the cursor
        const ratio = (e.clientX - b.left) / b.width;
        el.classList.remove('maximized');
        el.style.left = (e.clientX - b.left - el.offsetWidth * ratio) + 'px';
        el.style.top = '0px';
      }
      st = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      bar.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    bar.addEventListener('pointermove', e => {
      if (!st) return;
      const b = bounds();
      el.style.left = Math.max(-el.offsetWidth + 120, Math.min(b.width - 120, st.l + e.clientX - st.x)) + 'px';
      el.style.top = Math.max(0, Math.min(b.height - 40, st.t + e.clientY - st.y)) + 'px';
    });
    const end = e => {
      if (!st) return;
      st = null; el.classList.remove('dragging');
      // dropped against the top edge: maximize, like Windows
      if (e.clientY - bounds().top < 6) el.classList.add('maximized');
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);

    el.querySelectorAll('.os-grip').forEach(g => {
      let s = null;
      g.addEventListener('pointerdown', e => {
        e.stopPropagation();
        s = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight, l: el.offsetLeft };
        g.setPointerCapture(e.pointerId);
      });
      g.addEventListener('pointermove', e => {
        if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (g.classList.contains('e') || g.classList.contains('se')) el.style.width = Math.max(340, s.w + dx) + 'px';
        if (g.classList.contains('s') || g.classList.contains('se')) el.style.height = Math.max(220, s.h + dy) + 'px';
        if (g.classList.contains('w')){
          const w = Math.max(340, s.w - dx);
          el.style.width = w + 'px'; el.style.left = (s.l + s.w - w) + 'px';
        }
      });
      const done = () => { s = null; };
      g.addEventListener('pointerup', done);
      g.addEventListener('pointercancel', done);
    });
  }
}