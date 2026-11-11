/**
 * The programs on the computers: File Explorer (with This PC and the Recycle
 * Bin), Notepad, Photos, Settings, plus Command Prompt and the browser from
 * their own files.
 */
import * as store from '../store.js';
import * as fs from './fs.js';
import { icon } from './icons.js';
import { PRESET_IDS, presetName, presetUrl, defaultWallpaper } from './wallpapers.js';
import { openTerminal } from './terminal.js';
import { openBrowser } from './browser.js';
import { openMusic } from '../feat-music.js';
import { listTracks } from '../room-data.js';
import { toast, showPrompt, showConfirm } from '../ui.js';
import { reportError } from '../errors.js';
import { esc } from '../room-kit.js';
import { shortOf, nameOf, getMe } from '../who.js';
import { fileToCompressedDataUrl } from '../imgutil.js';
import { onActivate } from './touch.js';
import { notifyOther } from '../push.js';

export const PINNED = ['explorer', 'browser', 'terminal', 'notepad', 'settings', 'music'];

export const APPS = {
  explorer: { name: 'File Explorer', icon: 'explorer', keywords: 'files folders this pc recycle bin documents pictures',
    open: (pc, a) => openExplorer(pc, a), emptyBin: pc => emptyBin(pc) },
  browser:  { name: 'Browser', icon: 'browser', keywords: 'internet web search google chrome brave',
    open: (pc, a) => openBrowser(pc, a) },
  terminal: { name: 'Command Prompt', icon: 'terminal', keywords: 'cmd terminal console shell',
    open: (pc, a) => openTerminal(pc, a) },
  notepad:  { name: 'Notepad', icon: 'notepad', keywords: 'text txt letter write',
    open: (pc, a) => openNotepad(pc, a) },
  photos:   { name: 'Photos', icon: 'photos', keywords: 'pictures images viewer',
    open: (pc, a) => openPhotos(pc, a) },
  settings: { name: 'Settings', icon: 'settings', keywords: 'wallpaper background personalize storage about',
    open: (pc, a) => openSettings(pc, a) },
  music:    { name: 'Music', icon: 'music', keywords: 'songs spotify player speakers',
    open: () => openMusic() },
};

/* =================================================================== */
/*  shared bits                                                         */
/* =================================================================== */

/** Double-click on an item, wherever it is. */
export function openItem(pc, item){
  if (item.kind === 'folder') return APPS.explorer.open(pc, { loc: 'folder:' + item.id });
  if (item.kind === 'letter') return APPS.notepad.open(pc, { letter: store.getLetter(item.id) || item.letter });
  if (item.kind === 'photo') return APPS.photos.open(pc, { folderId: item.folderId, photoId: item.id });
}

async function askRename(pc, item){
  const v = await showPrompt('Rename', item.name, 'Rename');
  if (v && v.trim() && v.trim() !== item.name) fs.rename(item, v);
}

function moveMenu(pc, letters){
  const here = letters[0]?.folderId || null;
  return [
    { label: 'Desktop', icon: 'desktop', disabled: here === null, action: () => letters.forEach(l => fs.moveText(l.id, null)) },
    ...fs.folders(pc.owner).map(f => ({ label: f.name, icon: 'folder', disabled: here === f.id,
      action: () => { letters.forEach(l => fs.moveText(l.id, f.id)); toast(`moved into ${f.name}`, 1600); } })),
  ];
}

/** The right-click menu for a file, folder or photo. */
export function itemMenu(pc, item, { many = [item], onRename } = {}){
  const list = many.length ? many : [item];
  const edit = pc.canEdit;
  const m = [{ label: 'Open', icon: item.icon, bold: true, action: () => list.forEach(i => openItem(pc, i)) }];
  if (item.kind === 'letter') m.push({ label: 'Open in Command Prompt', icon: 'terminal', action: () => APPS.terminal.open(pc, { run: `type "${item.name}"`, cwd: item.folderId ? 'folder:' + item.folderId : 'desktop' }) });
  if (item.kind === 'photo') m.push({ label: 'Set as desktop background', icon: 'photos', disabled: !edit, action: () => setPhotoWallpaper(pc, item.photo) });
  m.push({ sep: true });
  if (item.kind === 'letter') m.push({ label: 'Move to', icon: 'folder', disabled: !edit, sub: moveMenu(pc, list.filter(i => i.kind === 'letter')) });
  m.push({ label: 'Rename', icon: 'rename', hint: 'F2', disabled: !edit || list.length > 1 || item.kind === 'photo', action: () => onRename ? onRename() : askRename(pc, item) });
  m.push({ label: 'Delete', icon: 'trash', hint: 'Del', disabled: !edit, action: () => pc.deleteItems(list) });
  m.push({ sep: true });
  m.push({ label: 'Properties', icon: 'settings', action: () => properties(pc, item) });
  return m;
}

function properties(pc, item){
  const rows = [['Name', item.name]];
  if (item.kind === 'folder'){
    const f = fs.folder(pc.owner, item.id);
    rows.push(['Type', 'File folder'], ['Contains', `${f?.photos.length || 0} photos, ${fs.texts(pc.owner).filter(l => l.folderId === item.id).length} text files`]);
  }
  if (item.kind === 'letter'){
    const l = store.getLetter(item.id);
    rows.push(['Type', 'Text Document (.txt)'], ['Size', fs.fmtBytes(new Blob([l?.text || '']).size)],
      ['Words', String((l?.text || '').trim().split(/\s+/).filter(Boolean).length)], ['Location', fs.pathOf(pc.owner, l?.folderId ? 'folder:' + l.folderId : 'desktop')]);
    if (l?.updatedAt) rows.push(['Modified', fs.fmtDate(l.updatedAt)]);
  }
  if (item.kind === 'photo'){
    rows.push(['Type', 'Picture']);
    if (item.addedAt) rows.push(['Added', fs.fmtDate(item.addedAt)]);
  }
  rows.push(['Computer', `${shortOf(pc.owner)}'s`]);
  pc.openWindow({ app: 'explorer', title: `${item.name} Properties`, iconName: item.icon, width: 380, height: 300,
    build(w){ w.body.innerHTML = `<div class="os-props">${icon(item.icon)}<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></div>`; } });
}

/** Right-click on the empty desktop. */
export function desktopMenu(pc){
  const edit = pc.canEdit;
  return [
    { label: 'View', icon: 'grid', sub: [
      { label: 'Auto arrange icons', icon: 'grid', action: () => { pc.saveLayout({}); pc.renderIcons(); } },
    ] },
    { label: 'Sort by name', icon: 'list', action: () => { pc.saveLayout({}); pc.renderIcons(); } },
    { label: 'Refresh', icon: 'reload', action: () => { store.refreshPc(); pc.renderIcons(); } },
    { sep: true },
    { label: 'New', icon: 'plus', disabled: !edit, sub: [
      { label: 'Folder', icon: 'folder', action: () => { fs.newFolder(pc.owner); } },
      { label: 'Text Document', icon: 'text', action: () => { const l = fs.newTextFile(pc.owner, null); APPS.notepad.open(pc, { letter: l }); } },
    ] },
    { sep: true },
    { label: 'Open in Command Prompt', icon: 'terminal', action: () => APPS.terminal.open(pc, {}) },
    { label: 'Personalize', icon: 'settings', action: () => APPS.settings.open(pc, { page: 'personalize' }) },
  ];
}

async function emptyBin(pc){
  const n = store.binItems(pc.owner).length;
  if (!n) return;
  if (!await showConfirm(`Permanently delete ${n === 1 ? 'this item' : `these ${n} items`}? This can't be undone.`, 'Empty Recycle Bin', 'Delete')) return;
  await store.emptyBin(pc.owner);
  toast('Recycle Bin emptied', 1800);
  window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'bin-empty' }));
}

async function setPhotoWallpaper(pc, photo){
  try {
    const wp = photo.path ? { kind: 'image', path: photo.path } : { kind: 'photo', photoId: photo.id };
    await store.setWallpaper(pc.owner, wp);
    toast('desktop background changed', 1800);
    window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'wallpaper' }));
  } catch(e){ toast(e.message || "couldn't set it"); reportError('wallpaper', e); }
}

/* =================================================================== */
/*  File Explorer                                                       */
/* =================================================================== */
const NAV = ['desktop', 'documents', 'pictures', 'music', 'thispc', 'bin'];

function openExplorer(pc, { loc = 'thispc' } = {}){
  const st = {
    loc, back: [], fwd: [], sel: new Set(), q: '',
    view: localStorage.getItem('ourroom_pc_view') || 'grid',
  };
  return pc.openWindow({
    app: 'explorer', title: fs.locationName(pc.owner, loc), iconName: fs.LOCATIONS[loc]?.icon || 'folder', width: 860, height: 540,
    build(win){
      win.body.innerHTML = `
        <div class="ex">
          <div class="ex-cmd"></div>
          <div class="ex-addr">
            <button class="ex-nb" data-n="back" title="Back">${icon('left')}</button>
            <button class="ex-nb" data-n="fwd" title="Forward">${icon('right')}</button>
            <button class="ex-nb" data-n="up" title="Up">${icon('up')}</button>
            <button class="ex-nb" data-n="reload" title="Refresh">${icon('reload')}</button>
            <div class="ex-crumbs"></div>
            <label class="ex-search">${icon('search')}<input spellcheck="false"></label>
          </div>
          <div class="ex-main">
            <nav class="ex-nav"></nav>
            <div class="ex-content" tabindex="0"></div>
          </div>
          <div class="ex-status"></div>
        </div>`;
      const $ = s => win.body.querySelector(s);
      const go = (to, push = true) => {
        if (to === st.loc) return render();
        if (push){ st.back.push(st.loc); st.fwd = []; }
        st.loc = to; st.sel.clear(); st.q = ''; $('.ex-search input').value = '';
        render();
      };
      win.body.querySelectorAll('.ex-nb').forEach(b => b.addEventListener('click', () => {
        const n = b.dataset.n;
        if (n === 'back' && st.back.length){ st.fwd.push(st.loc); go(st.back.pop(), false); }
        if (n === 'fwd' && st.fwd.length){ st.back.push(st.loc); go(st.fwd.pop(), false); }
        if (n === 'up'){ const up = st.loc.startsWith('folder:') ? 'desktop' : (st.loc === 'thispc' ? null : 'thispc'); if (up) go(up); }
        if (n === 'reload'){ store.refreshPc(); render(); }
      }));
      $('.ex-search input').addEventListener('input', e => { st.q = e.target.value.trim().toLowerCase(); renderContent(); });
      $('.ex-search input').addEventListener('keydown', e => e.stopPropagation());

      const content = $('.ex-content');
      content.addEventListener('keydown', e => {
        if (e.target !== content) return;
        const items = currentItems().filter(i => st.sel.has(i.kind + i.id));
        if (e.key === 'Delete' && items.length && pc.canEdit){ e.preventDefault(); e.stopPropagation(); st.loc === 'bin' ? purge(items) : pc.deleteItems(items); }
        if (e.key === 'F2' && items.length === 1 && pc.canEdit && items[0].kind !== 'photo'){ e.preventDefault(); askRename(pc, items[0]); }
        if (e.key === 'Enter' && items.length){ e.preventDefault(); items.forEach(i => st.loc === 'bin' ? null : openItem(pc, i)); }
        if ((e.key === 'a' || e.key === 'A') && e.ctrlKey){ e.preventDefault(); currentItems().forEach(i => st.sel.add(i.kind + i.id)); markSel(); }
      });
      content.addEventListener('pointerdown', e => {
        if (e.target === content || e.target.classList.contains('ex-grid') || e.target.classList.contains('ex-list-body')){ st.sel.clear(); markSel(); }
      });
      content.addEventListener('contextmenu', e => {
        if (e.target.closest('.ex-item')) return;
        e.preventDefault();
        pc.menu(e.clientX, e.clientY, backgroundMenu());
      });
      // drop photos or .txt files from your real computer straight in
      content.addEventListener('dragover', e => { if (canDropFiles()) { e.preventDefault(); content.classList.add('dropping'); } });
      content.addEventListener('dragleave', () => content.classList.remove('dropping'));
      content.addEventListener('drop', e => {
        content.classList.remove('dropping');
        if (!canDropFiles()) return;
        e.preventDefault();
        importFiles([...e.dataTransfer.files]);
      });

      function canDropFiles(){ return pc.canEdit && (st.loc === 'desktop' || st.loc === 'documents' || st.loc.startsWith('folder:')); }

      async function importFiles(files){
        const folderId = st.loc.startsWith('folder:') ? st.loc.slice(7) : null;
        const images = files.filter(f => f.type.startsWith('image/'));
        const texts = files.filter(f => f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name));
        for (const t of texts){
          const l = fs.newTextFile(pc.owner, folderId, t.name);
          store.saveLetter({ id: l.id, text: await t.text() });
        }
        if (images.length){
          if (!folderId){ toast('photos go inside a folder — open one, then drop them in', 3200); }
          else { toast(`adding ${images.length} photo${images.length > 1 ? 's' : ''}…`, 2000); await fs.uploadPhotos(folderId, images); toast('added', 1500); }
        }
      }

      function backgroundMenu(){
        const edit = pc.canEdit;
        const inFolder = st.loc.startsWith('folder:');
        const m = [
          { label: 'View', icon: st.view === 'grid' ? 'grid' : 'list', sub: [
            { label: 'Large icons', icon: 'grid', action: () => setView('grid') },
            { label: 'Details', icon: 'list', action: () => setView('list') },
          ] },
          { label: 'Refresh', icon: 'reload', action: () => { store.refreshPc(); render(); } },
        ];
        if (st.loc === 'bin'){
          m.push({ sep: true },
            { label: 'Restore all items', icon: 'restore', disabled: !edit || !currentItems().length, action: () => restore(currentItems()) },
            { label: 'Empty Recycle Bin', icon: 'trash', disabled: !edit || !currentItems().length, action: () => emptyBin(pc) });
        }
        if (['desktop', 'documents', 'pictures'].includes(st.loc) || inFolder){
          m.push({ sep: true }, { label: 'New', icon: 'plus', disabled: !edit, sub: [
            ...(inFolder ? [] : [{ label: 'Folder', icon: 'folder', action: () => fs.newFolder(pc.owner) }]),
            { label: 'Text Document', icon: 'text', action: () => newText() },
          ] });
          if (inFolder) m.push({ label: 'Add photos…', icon: 'upload', disabled: !edit, action: () => pickPhotos() });
        }
        m.push({ sep: true }, { label: 'Open in Command Prompt', icon: 'terminal', action: () => APPS.terminal.open(pc, { cwd: st.loc.startsWith('folder:') || st.loc === 'desktop' ? st.loc : 'desktop' }) });
        return m;
      }

      function setView(v){ st.view = v; try { localStorage.setItem('ourroom_pc_view', v); } catch(_){} renderContent(); renderCmd(); }

      function newText(){
        const folderId = st.loc.startsWith('folder:') ? st.loc.slice(7) : null;
        const l = fs.newTextFile(pc.owner, folderId);
        APPS.notepad.open(pc, { letter: l });
      }

      function pickPhotos(){
        const folderId = st.loc.slice(7);
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
        input.addEventListener('change', async () => {
          const files = [...(input.files || [])];
          if (!files.length) return;
          toast(`adding ${files.length} photo${files.length > 1 ? 's' : ''}…`, 2500);
          const n = await fs.uploadPhotos(folderId, files);
          toast(n === files.length ? 'added' : `${n} of ${files.length} added`, 1800);
        });
        input.click();
      }

      async function restore(items){ for (const i of items) await store.restore(i); st.sel.clear(); }
      async function purge(items){
        if (!await showConfirm(`Permanently delete ${items.length === 1 ? `"${items[0].name}"` : items.length + ' items'}?`, 'Delete', 'Delete')) return;
        for (const i of items) await store.purge(i);
        st.sel.clear();
      }

      function currentItems(){
        if (st.loc === 'bin') return store.binItems(pc.owner).map(i => ({ ...i, icon: i.kind === 'folder' ? 'folder' : i.kind === 'photo' ? 'photo' : 'text' }));
        let items = fs.list(pc.owner, st.loc);
        if (st.q) items = items.filter(i => i.name.toLowerCase().includes(st.q) || (i.letter?.text || '').toLowerCase().includes(st.q));
        return items;
      }

      function renderCmd(){
        const cmd = $('.ex-cmd');
        const edit = pc.canEdit;
        const inFolder = st.loc.startsWith('folder:');
        const selItems = currentItems().filter(i => st.sel.has(i.kind + i.id));
        const btn = (id, ic, label, dis) => `<button class="ex-cb" data-c="${id}" ${dis ? 'disabled' : ''}>${icon(ic)}<span>${label}</span></button>`;
        let h = '';
        if (st.loc === 'bin'){
          h += btn('restoreSel', 'restore', 'Restore', !edit || !selItems.length);
          h += btn('restoreAll', 'restore', 'Restore all', !edit || !currentItems().length);
          h += btn('purge', 'trash', 'Delete', !edit || !selItems.length);
          h += btn('empty', 'trash', 'Empty Recycle Bin', !edit || !currentItems().length);
        } else if (st.loc === 'thispc' || st.loc === 'music'){
          h += `<span class="ex-cmd-note">${st.loc === 'thispc' ? 'Your drives — real space used in your storage' : 'Songs on the speakers in the room'}</span>`;
        } else {
          h += btn('new', 'plus', 'New', !edit);
          if (inFolder) h += btn('upload', 'upload', 'Add photos', !edit);
          h += '<i class="ex-sep"></i>';
          h += btn('rename', 'rename', 'Rename', !edit || selItems.length !== 1 || selItems[0]?.kind === 'photo');
          h += btn('delete', 'trash', 'Delete', !edit || !selItems.length);
        }
        h += `<span class="ex-flex"></span>`;
        if (!['thispc'].includes(st.loc)) h += `<button class="ex-cb ex-view" data-c="view" title="Change view">${icon(st.view === 'grid' ? 'list' : 'grid')}<span>${st.view === 'grid' ? 'Details' : 'Icons'}</span></button>`;
        cmd.innerHTML = h;
        cmd.querySelectorAll('.ex-cb').forEach(b => b.addEventListener('click', e => {
          const c = b.dataset.c;
          if (c === 'new'){
            const r = b.getBoundingClientRect();
            pc.menu(r.left, r.bottom + 4, [
              ...(inFolder ? [] : [{ label: 'Folder', icon: 'folder', action: () => fs.newFolder(pc.owner) }]),
              { label: 'Text Document', icon: 'text', action: newText },
            ]);
          }
          if (c === 'upload') pickPhotos();
          if (c === 'rename') askRename(pc, selItems[0]);
          if (c === 'delete') pc.deleteItems(selItems);
          if (c === 'restoreSel') restore(selItems);
          if (c === 'restoreAll') restore(currentItems());
          if (c === 'purge') purge(selItems);
          if (c === 'empty') emptyBin(pc);
          if (c === 'view') setView(st.view === 'grid' ? 'list' : 'grid');
          e.stopPropagation();
        }));
      }

      function renderNav(){
        const nav = $('.ex-nav');
        const binFull = store.binItems(pc.owner).length > 0;
        nav.innerHTML = NAV.map(l => {
          const ic = l === 'bin' ? (binFull ? 'binFull' : 'binEmpty') : fs.LOCATIONS[l].icon;
          return `<button class="ex-nav-i ${st.loc === l ? 'on' : ''}" data-l="${l}">${icon(ic)}<span>${fs.LOCATIONS[l].name}</span></button>`
            + (l === 'pictures' ? fs.folders(pc.owner).map(f =>
              `<button class="ex-nav-i sub ${st.loc === 'folder:' + f.id ? 'on' : ''}" data-l="folder:${f.id}">${icon('folder')}<span>${esc(f.name)}</span></button>`).join('') : '')
            + (l === 'music' ? '<i class="ex-nav-sep"></i>' : '');
        }).join('');
        nav.querySelectorAll('.ex-nav-i').forEach(b => b.addEventListener('click', () => go(b.dataset.l)));
      }

      function renderCrumbs(){
        const c = $('.ex-crumbs');
        const parts = st.loc.startsWith('folder:')
          ? [['thispc', 'This PC'], ['desktop', 'Desktop'], [st.loc, fs.locationName(pc.owner, st.loc)]]
          : st.loc === 'thispc' ? [['thispc', 'This PC']] : st.loc === 'bin' ? [['bin', 'Recycle Bin']]
          : [['thispc', 'This PC'], [st.loc, fs.locationName(pc.owner, st.loc)]];
        c.innerHTML = icon(fs.LOCATIONS[st.loc]?.icon || 'folder') + parts.map(([l, n]) => `<button data-l="${l}">${esc(n)}</button>`).join('<span class="ex-chev">›</span>');
        c.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.l)));
        c.title = fs.pathOf(pc.owner, st.loc);
        $('.ex-search input').placeholder = 'Search ' + fs.locationName(pc.owner, st.loc);
        win.body.querySelector('[data-n="back"]').disabled = !st.back.length;
        win.body.querySelector('[data-n="fwd"]').disabled = !st.fwd.length;
      }

      function markSel(){
        content.querySelectorAll('.ex-item').forEach(el => el.classList.toggle('sel', st.sel.has(el.dataset.k)));
        renderCmd(); renderStatus();
      }

      function renderStatus(){
        const n = st.loc === 'thispc' ? 0 : currentItems().length;
        $('.ex-status').textContent = st.loc === 'thispc' ? '' : `${n} item${n === 1 ? '' : 's'}${st.sel.size ? `   |   ${st.sel.size} selected` : ''}`;
      }

      async function renderThisPc(){
        content.innerHTML = `<div class="ex-pc">
          <h4>Drives</h4><div class="ex-drives"><p class="os-muted">checking…</p></div>
          <h4>Folders</h4><div class="ex-quick"></div></div>`;
        const quick = content.querySelector('.ex-quick');
        ['desktop', 'documents', 'pictures', 'music', 'bin'].forEach(l => {
          const b = document.createElement('button');
          b.className = 'ex-q';
          b.innerHTML = `${icon(fs.LOCATIONS[l].icon)}<span>${fs.LOCATIONS[l].name}</span>`;
          onActivate(b, () => go(l));
          b.addEventListener('click', () => { quick.querySelectorAll('.ex-q').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); });
          quick.appendChild(b);
        });
        const drives = await driveRows();
        const d = content.querySelector('.ex-drives');
        if (d) d.innerHTML = drives;
      }

      async function renderMusic(){
        content.innerHTML = '<p class="os-muted pad">loading…</p>';
        let tracks = [];
        try { tracks = await listTracks(); } catch(e){ /* not set up yet */ }
        if (st.loc !== 'music') return;
        if (!tracks.length){
          content.innerHTML = `<div class="ex-empty">${icon('music')}<p>No songs yet.</p><button class="os-btn">Open the music player</button></div>`;
          content.querySelector('button').addEventListener('click', () => openMusic());
          return;
        }
        content.innerHTML = `<div class="ex-list"><div class="ex-lh"><span>Name</span><span>Artist</span><span>Type</span><span></span></div><div class="ex-list-body"></div></div>`;
        const body = content.querySelector('.ex-list-body');
        tracks.forEach(t => {
          const r = document.createElement('div');
          r.className = 'ex-item ex-row';
          r.innerHTML = `<span class="ex-name">${icon('music')}<b>${esc(t.title || 'Untitled')}</b></span><span>${esc(t.artist || '')}</span><span>${t.kind === 'spotify' ? 'Spotify' : 'Audio file'}</span><span></span>`;
          onActivate(r, () => { openMusic(); toast('pick it in the player', 1600); });
          body.appendChild(r);
        });
        renderStatus();
      }

      function renderContent(){
        if (st.loc === 'thispc') return renderThisPc();
        if (st.loc === 'music') return renderMusic();
        const items = currentItems();
        const inBin = st.loc === 'bin';
        if (!items.length){
          content.innerHTML = `<div class="ex-empty">${icon(inBin ? 'binEmpty' : 'folder')}<p>${st.q ? 'No items match your search.' : inBin ? 'The Recycle Bin is empty.' : 'This folder is empty.'}</p>${
            !inBin && !st.q && pc.canEdit && st.loc.startsWith('folder:') ? '<p class="os-muted">Drop photos or .txt files here, or right-click → New.</p>' : ''}</div>`;
          renderStatus(); return;
        }
        const list = st.view === 'list' || inBin;
        content.innerHTML = list
          ? `<div class="ex-list ${inBin ? 'bin' : ''}"><div class="ex-lh"><span>Name</span><span>${inBin ? 'Original location' : 'Date modified'}</span><span>${inBin ? 'Date deleted' : 'Type'}</span><span>${inBin ? '' : 'Size'}</span></div><div class="ex-list-body"></div></div>`
          : `<div class="ex-grid"></div>`;
        const holder = content.querySelector(list ? '.ex-list-body' : '.ex-grid');
        items.forEach(it => {
          const k = it.kind + it.id;
          const el = document.createElement('div');
          el.className = 'ex-item ' + (list ? 'ex-row' : 'ex-tile') + (st.sel.has(k) ? ' sel' : '');
          el.dataset.k = k;
          const type = it.kind === 'folder' ? 'File folder' : it.kind === 'letter' ? 'Text Document' : 'Picture';
          if (list){
            el.innerHTML = inBin
              ? `<span class="ex-name">${icon(it.icon)}<b>${esc(it.name)}</b></span><span>${esc(it.kind === 'folder' ? 'Desktop' : (it.from || 'Desktop'))}</span><span>${fs.fmtDate(it.deletedAt)}</span><span></span>`
              : `<span class="ex-name">${icon(it.icon)}<b>${esc(it.name)}</b></span><span>${fs.fmtDate(it.updatedAt || it.addedAt)}</span><span>${type}</span><span>${it.kind === 'letter' ? fs.fmtBytes(it.size) : it.kind === 'folder' ? `${it.count} item${it.count === 1 ? '' : 's'}` : ''}</span>`;
          } else {
            el.innerHTML = it.kind === 'photo'
              ? `<span class="ex-thumb"><img alt=""></span><span class="ex-label">${esc(it.name)}</span>`
              : `<span class="ex-big">${icon(it.icon)}</span><span class="ex-label">${esc(it.name)}</span>`;
            if (it.kind === 'photo') fs.ensurePhotoSrc(it.photo).then(src => { const img = el.querySelector('img'); if (src && img) img.src = src; });
          }
          el.addEventListener('pointerdown', e => {
            content.focus({ preventScroll: true });
            if (e.ctrlKey){ st.sel.has(k) ? st.sel.delete(k) : st.sel.add(k); }
            else if (e.shiftKey && st.sel.size){
              const keys = items.map(i => i.kind + i.id);
              const last = keys.indexOf([...st.sel].pop()), me = keys.indexOf(k);
              keys.slice(Math.min(last, me), Math.max(last, me) + 1).forEach(x => st.sel.add(x));
            } else if (!st.sel.has(k) || e.button === 0){ st.sel = new Set([k]); }
            markSel();
          });
          onActivate(el, () => { if (!inBin) openItem(pc, it); });
          el.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (!st.sel.has(k)){ st.sel = new Set([k]); markSel(); }
            const sel = items.filter(i => st.sel.has(i.kind + i.id));
            if (inBin){
              pc.menu(e.clientX, e.clientY, [
                { label: 'Restore', icon: 'restore', bold: true, disabled: !pc.canEdit, action: () => restore(sel) },
                { sep: true },
                { label: 'Delete permanently', icon: 'trash', disabled: !pc.canEdit, action: () => purge(sel) },
              ]);
            } else pc.menu(e.clientX, e.clientY, itemMenu(pc, it, { many: sel }));
          });
          holder.appendChild(el);
        });
        renderStatus();
      }

      function render(){
        if (st.loc.startsWith('folder:') && !fs.folder(pc.owner, st.loc.slice(7))){ st.loc = 'desktop'; }
        win.setTitle(fs.locationName(pc.owner, st.loc));
        renderNav(); renderCrumbs(); renderCmd(); renderContent();
      }
      win.refresh = () => { if (st.loc !== 'thispc') render(); else renderNav(); };
      render();
    },
  });
}

/** The drives, with real space used. */
async function driveRows(){
  const u = await store.driveUsage();
  const bar = (used, total, label, sub, ic = 'drive') => {
    const pct = total ? Math.min(100, used / total * 100) : 0;
    return `<div class="ex-drive">${icon(ic)}<div><b>${esc(label)}</b>
      <div class="ex-dbar ${pct > 85 ? 'full' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>
      <small>${esc(sub)}</small></div></div>`;
  };
  if (u.mode === 'local'){
    const LS = 5 * 1024 * 1024;
    return bar(u.localStorage, LS, 'This browser (C:)', `${fs.fmtBytes(LS - u.localStorage)} free of ${fs.fmtBytes(LS)} · not syncing`)
      + (u.browserQuota ? bar(u.browserUsed, u.browserQuota, 'Browser storage (D:)', `${fs.fmtBytes(u.browserUsed)} used of ${fs.fmtBytes(u.browserQuota)}`) : '');
  }
  if (u.unknown) return `<p class="os-muted">Run supabase-migration-004.sql to see how much space you've used.</p>`;
  // Supabase's free plan: 1 GB of files, 500 MB of database
  const FILES = 1024 ** 3, DB = 500 * 1024 ** 2;
  const files = u.photos + u.media;
  return bar(files, FILES, 'Local Disk (C:)', `${fs.fmtBytes(FILES - files)} free of 1 GB  ·  photos ${fs.fmtBytes(u.photos)} · videos & songs ${fs.fmtBytes(u.media)}`, 'cloud')
    + bar(u.database, DB, 'System (D:)', `${fs.fmtBytes(DB - u.database)} free of 500 MB  ·  letters, pages, everything else`);
}

/* =================================================================== */
/*  Notepad                                                             */
/* =================================================================== */
function openNotepad(pc, { letter = null } = {}){
  if (letter) letter = store.getLetter(letter.id) || letter;
  const id = letter ? 'note:' + letter.id : null;
  return pc.openWindow({
    id, app: 'notepad', title: (letter ? letter.filename : 'Untitled') + ' - Notepad', width: 640, height: 470,
    build(win){
      const edit = pc.canEdit;
      win.body.innerHTML = `
        <div class="np">
          <div class="np-menu">
            <button data-m="file">File</button><button data-m="edit">Edit</button><button data-m="view">View</button>
            ${edit ? '' : '<span class="np-ro">read only</span>'}
          </div>
          <textarea class="np-text" spellcheck="true"></textarea>
          <div class="np-status"><span class="np-pos">Ln 1, Col 1</span><span class="np-count"></span><span class="np-save"></span><span>UTF-8</span></div>
        </div>`;
      const ta = win.body.querySelector('textarea');
      const status = win.body.querySelector('.np-save');
      let saved = letter ? (letter.text || '') : '';
      let zoom = 100, wrap = true, timer = null;
      ta.value = saved;
      ta.readOnly = !edit;
      ta.placeholder = letter ? '' : `dear ${pc.owner === 'cherryl' ? 'Andrei' : 'Che'},`;

      const dirty = () => ta.value !== saved;
      const title = () => win.setTitle((dirty() ? '*' : '') + (letter ? letter.filename : 'Untitled') + ' - Notepad');
      const pos = () => {
        const before = ta.value.slice(0, ta.selectionStart).split('\n');
        win.body.querySelector('.np-pos').textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
        win.body.querySelector('.np-count').textContent = `${ta.value.length} characters`;
      };
      async function save(ask = false){
        clearTimeout(timer);
        if (!edit) return;
        if (!letter){
          if (!ask && !ta.value) return;
          const name = await showPrompt('Save as', 'New Text Document.txt', 'Save');
          if (!name) return;
          letter = fs.newTextFile(pc.owner, null, name);
          win.id = 'note:' + letter.id;
        }
        if (!store.getLetter(letter.id)) return;           // deleted meanwhile
        store.saveLetter({ id: letter.id, text: ta.value });
        saved = ta.value;
        status.textContent = 'Saved';
        title();
        // a real letter (not a two-word stub): tell the other one, once, after you stop writing
        clearTimeout(tellTimer);
        if (ta.value.trim().length >= 20) tellTimer = setTimeout(tell, 45000);
      }
      let tellTimer = null;
      function tell(){
        clearTimeout(tellTimer);
        if (!letter || ta.value.trim().length < 20) return;
        const key = 'ourroom_told_' + letter.id;
        try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch(_){}
        notifyOther('letter', letter.filename);
        window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'letter' }));
      }
      ta.addEventListener('input', () => {
        status.textContent = letter ? 'Editing…' : 'Not saved';
        title(); pos();
        clearTimeout(timer);
        if (letter) timer = setTimeout(() => save(), 1200);
      });
      ta.addEventListener('blur', () => { if (letter && dirty()) save(); });
      ta.addEventListener('keyup', pos); ta.addEventListener('click', pos);
      ta.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 's' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); save(true); }
        if (e.key === 'F5'){ e.preventDefault(); insert(new Date().toLocaleString()); }
        if (e.key === 'Escape') ta.blur();
      });
      function insert(t){
        const s = ta.selectionStart;
        ta.setRangeText(t, s, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
      win.body.saveNow = () => { if (letter && dirty()) save(); if (tellTimer) tell(); };

      const menus = {
        file: () => [
          { label: 'New', icon: 'plus', hint: '', disabled: !edit, action: () => openNotepad(pc, {}) },
          { label: 'Save', icon: 'notepad', hint: 'Ctrl+S', disabled: !edit, action: () => save(true) },
          { label: 'Rename…', icon: 'rename', disabled: !edit || !letter, action: async () => {
            const v = await showPrompt('Rename', letter.filename, 'Rename');
            if (v){ fs.rename({ kind: 'letter', id: letter.id }, v); letter = store.getLetter(letter.id); title(); }
          } },
          { label: 'Move to', icon: 'folder', disabled: !edit || !letter, sub: letter ? moveMenu(pc, [{ id: letter.id, folderId: letter.folderId || null }]) : [] },
          { sep: true },
          { label: 'Delete', icon: 'trash', disabled: !edit || !letter, action: async () => {
            await save();
            await pc.deleteItems([{ kind: 'letter', id: letter.id, name: letter.filename }]);
            win.body.saveNow = null; win.close();
          } },
          { sep: true },
          { label: 'Close', action: () => win.close() },
        ],
        edit: () => [
          { label: 'Select all', hint: 'Ctrl+A', action: () => { ta.focus(); ta.select(); } },
          { label: 'Time/Date', hint: 'F5', disabled: !edit, action: () => insert(new Date().toLocaleString()) },
          { label: 'Insert a heart', disabled: !edit, action: () => insert('♡') },
        ],
        view: () => [
          { label: 'Zoom in', hint: `${zoom}%`, action: () => { zoom = Math.min(250, zoom + 10); ta.style.fontSize = (15 * zoom / 100) + 'px'; } },
          { label: 'Zoom out', action: () => { zoom = Math.max(60, zoom - 10); ta.style.fontSize = (15 * zoom / 100) + 'px'; } },
          { label: 'Restore default zoom', action: () => { zoom = 100; ta.style.fontSize = ''; } },
          { sep: true },
          { label: (wrap ? '✓ ' : '') + 'Word wrap', action: () => { wrap = !wrap; ta.classList.toggle('nowrap', !wrap); } },
        ],
      };
      win.body.querySelectorAll('.np-menu button').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const r = b.getBoundingClientRect();
        pc.menu(r.left, r.bottom + 2, menus[b.dataset.m]());
      }));

      win.refresh = () => {
        if (!letter) return;
        const now = store.getLetter(letter.id);
        if (!now || now.deletedAt){ win.body.saveNow = null; win.close(); return; }
        letter = now;
        // someone else changed it and you haven't typed anything since: show theirs
        if (!dirty() && (now.text || '') !== saved && document.activeElement !== ta){ saved = now.text || ''; ta.value = saved; }
        title();
      };
      title(); pos();
      if (edit){ ta.focus(); setTimeout(() => ta.focus(), 200); }
    },
  });
}

/* =================================================================== */
/*  Photos                                                              */
/* =================================================================== */
function openPhotos(pc, { folderId, photoId } = {}){
  return pc.openWindow({
    id: 'photos', app: 'photos', title: 'Photos', width: 820, height: 580,
    build(win){
      win.body.innerHTML = `
        <div class="ph">
          <div class="ph-stage"><img alt=""><button class="ph-nav prev">${icon('left')}</button><button class="ph-nav next">${icon('right')}</button></div>
          <div class="ph-bar"><span class="ph-cap"></span><span class="ph-n"></span><span class="ex-flex"></span>
            <button class="os-btn ghost" data-a="zoom">Actual size</button>
            <button class="os-btn ghost" data-a="wall">Set as background</button>
            <button class="os-btn ghost danger" data-a="del">Delete</button></div>
        </div>`;
      const img = win.body.querySelector('img');
      let fId = folderId, idx = 0, photos = [];
      const load = () => {
        photos = fs.folder(pc.owner, fId)?.photos || [];
        if (photoId){ idx = Math.max(0, photos.findIndex(p => p.id === photoId)); photoId = null; }
        idx = Math.min(idx, Math.max(0, photos.length - 1));
      };
      const show = () => {
        const p = photos[idx];
        win.body.querySelector('.ph-n').textContent = photos.length ? `${idx + 1} / ${photos.length}` : '';
        win.body.querySelector('.ph-cap').textContent = p ? (p.caption || 'untitled') : 'no photos here';
        win.setTitle((p ? (p.caption || 'untitled') + ' - ' : '') + 'Photos');
        img.removeAttribute('src');
        if (p) fs.ensurePhotoSrc(p).then(src => { if (src && photos[idx] === p) img.src = src; });
        win.body.querySelector('[data-a="wall"]').disabled = !p || !pc.canEdit;
        win.body.querySelector('[data-a="del"]').disabled = !p || !pc.canEdit;
      };
      win.open = (fid, pid) => { fId = fid; photoId = pid; load(); show(); };
      win.body.querySelector('.prev').addEventListener('click', () => { if (photos.length){ idx = (idx - 1 + photos.length) % photos.length; show(); } });
      win.body.querySelector('.next').addEventListener('click', () => { if (photos.length){ idx = (idx + 1) % photos.length; show(); } });
      win.body.querySelector('[data-a="zoom"]').addEventListener('click', e => {
        const on = win.body.querySelector('.ph-stage').classList.toggle('actual');
        e.target.textContent = on ? 'Fit' : 'Actual size';
      });
      win.body.querySelector('[data-a="wall"]').addEventListener('click', () => setPhotoWallpaper(pc, photos[idx]));
      win.body.querySelector('[data-a="del"]').addEventListener('click', async () => {
        const p = photos[idx];
        if (p) await pc.deleteItems([{ kind: 'photo', id: p.id, folderId: fId, name: p.caption || 'untitled' }]);
      });
      win.el.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') win.body.querySelector('.prev').click();
        if (e.key === 'ArrowRight') win.body.querySelector('.next').click();
      });
      win.el.tabIndex = 0;
      win.refresh = () => { const cur = photos[idx]?.id; load(); const i = photos.findIndex(p => p.id === cur); if (i >= 0) idx = i; show(); };
      load(); show();
    },
  }).open?.(folderId, photoId);
}

/* =================================================================== */
/*  Settings                                                            */
/* =================================================================== */
function openSettings(pc, { page = 'personalize' } = {}){
  return pc.openWindow({
    id: 'settings', app: 'settings', title: 'Settings', width: 860, height: 560,
    build(win){
      win.body.innerHTML = `
        <div class="st">
          <nav class="st-nav">
            <div class="st-me"><span class="os-avatar"></span><div><b></b><small></small></div></div>
            <button data-p="personalize">${icon('photos')}<span>Personalization</span></button>
            <button data-p="storage">${icon('drive')}<span>Storage</span></button>
            <button data-p="about">${icon('thispc')}<span>About</span></button>
          </nav>
          <div class="st-page"></div>
        </div>`;
      win.body.querySelector('.os-avatar').textContent = shortOf(pc.owner)[0];
      win.body.querySelector('.st-me b').textContent = nameOf(pc.owner);
      win.body.querySelector('.st-me small').textContent = pc.owner === getMe() ? 'your computer' : `${shortOf(pc.owner)}'s computer`;
      const pageEl = win.body.querySelector('.st-page');
      const go = p => {
        page = p;
        win.body.querySelectorAll('.st-nav button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
        ({ personalize, storage, about })[p]();
      };
      win.body.querySelectorAll('.st-nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.p)));

      function current(){ return store.getPcSettings(pc.owner).wallpaper || defaultWallpaper(pc.owner); }

      async function setWp(wp){
        if (!pc.canEdit) return;
        try { await store.setWallpaper(pc.owner, wp); window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'wallpaper' })); }
        catch(e){ toast(e.message || "couldn't change it", 4000); reportError('wallpaper', e); }
      }

      function personalize(){
        const cur = current();
        pageEl.innerHTML = `
          <h2>Personalization <span>› Background</span></h2>
          <div class="st-preview"><div class="st-mon"><i></i></div></div>
          <h3>Pick a background</h3>
          <div class="st-walls"></div>
          <h3>Your photos</h3>
          <div class="st-photos"></div>
          <div class="st-row"><span>Choose a photo from your real computer</span><button class="os-btn" ${pc.canEdit ? '' : 'disabled'}>Browse photos</button></div>`;
        pc.$('.os-wall').style.backgroundImage && (pageEl.querySelector('.st-mon i').style.backgroundImage = pc.$('.os-wall').style.backgroundImage);
        const walls = pageEl.querySelector('.st-walls');
        PRESET_IDS.forEach(id => {
          const b = document.createElement('button');
          b.className = 'st-wall' + (cur.kind === 'preset' && cur.id === id ? ' on' : '');
          b.style.backgroundImage = `url("${presetUrl(id, true)}")`;
          b.title = presetName(id);
          b.disabled = !pc.canEdit;
          b.addEventListener('click', () => setWp({ kind: 'preset', id }));
          walls.appendChild(b);
        });
        const ph = pageEl.querySelector('.st-photos');
        const all = [...fs.folders('andrei'), ...fs.folders('cherryl')].flatMap(f => f.photos).slice(-24).reverse();
        if (!all.length) ph.innerHTML = '<p class="os-muted">Photos you add to your folders show up here.</p>';
        all.forEach(p => {
          const b = document.createElement('button');
          b.className = 'st-wall' + ((cur.path && cur.path === p.path) || (cur.photoId && cur.photoId === p.id) ? ' on' : '');
          b.disabled = !pc.canEdit;
          fs.ensurePhotoSrc(p).then(src => { if (src) b.style.backgroundImage = `url("${src}")`; });
          b.addEventListener('click', () => setPhotoWallpaper(pc, p));
          ph.appendChild(b);
        });
        pageEl.querySelector('.st-row button').addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*';
          input.addEventListener('change', async () => {
            const f = input.files?.[0];
            if (!f) return;
            toast('setting it…', 2000);
            try {
              const url = await fileToCompressedDataUrl(f, 1920, 0.85);
              await setWp(await store.storeWallpaperImage(pc.owner, url));
            } catch(e){ toast(e.message || "couldn't use that picture", 4000); reportError('wallpaper upload', e); }
          });
          input.click();
        });
      }

      async function storage(){
        const n = store.binItems(pc.owner).length;
        pageEl.innerHTML = `<h2>Storage</h2><div class="ex-drives"><p class="os-muted">checking…</p></div>
          <h3>Recycle Bin</h3><div class="st-row"><span>${n ? `${n} item${n === 1 ? '' : 's'} in the Recycle Bin` : 'The Recycle Bin is empty'}</span>
          <button class="os-btn" ${n && pc.canEdit ? '' : 'disabled'}>Empty Recycle Bin</button></div>
          <p class="os-muted">Things in the bin still take up space until it's emptied. Anything older than 30 days is emptied automatically.</p>`;
        pageEl.querySelector('.st-row button').addEventListener('click', async () => { await emptyBin(pc); storage(); });
        const rows = await driveRows();
        const d = pageEl.querySelector('.ex-drives');
        if (d && page === 'storage') d.innerHTML = rows;
      }

      function about(){
        const rows = [
          ['Device name', pc.name],
          ['Belongs to', nameOf(pc.owner)],
          ['Signed in as', nameOf(getMe()) + (pc.canEdit ? ' (admin)' : '')],
          ['Files', store.mode === 'supabase' ? 'synced between both computers' : 'only on this browser'],
          ['Folders', String(fs.folders(pc.owner).length)],
          ['Text files', String(fs.texts(pc.owner).length)],
          ['Photos', String(fs.folders(pc.owner).reduce((n, f) => n + f.photos.length, 0))],
        ];
        pageEl.innerHTML = `<h2>About</h2><div class="st-about">${icon('thispc')}<div><b>${esc(pc.name)}</b><small>Our Room · this desk</small></div></div>
          <table class="st-table">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
      }

      win.refresh = () => { if (page === 'personalize') personalize(); };
      go(page);
    },
  });
}