/**
 * The computer's "file system": folders, photos and text files from the
 * database, arranged the way a real PC shows them.
 *
 *   Desktop   folders + text files that aren't in a folder
 *   a folder  its photos + its text files
 *   Documents every text file on this computer
 *   Pictures  every folder
 *   This PC   the drives (real storage use)
 *   Recycle Bin
 */
import * as store from '../store.js';
import { getPcFolders, getLetters, addPcPhoto, ensurePhotoSrc } from '../books.js';
import { fileToCompressedDataUrl } from '../imgutil.js';

export const LOCATIONS = {
  desktop:   { name: 'Desktop',     icon: 'desktop' },
  documents: { name: 'Documents',   icon: 'docs' },
  pictures:  { name: 'Pictures',    icon: 'pictures' },
  music:     { name: 'Music',       icon: 'music' },
  thispc:    { name: 'This PC',     icon: 'thispc' },
  bin:       { name: 'Recycle Bin', icon: 'binEmpty' },
};

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export const folderItem = f => ({
  kind: 'folder', id: f.id, name: f.name, icon: f.photos.length ? 'folderPhotos' : 'folder',
  count: f.photos.length + store.getLettersCached().filter(l => l.folderId === f.id).length,
});
export const letterItem = l => ({
  kind: 'letter', id: l.id, name: l.filename, icon: 'text', folderId: l.folderId || null,
  size: new Blob([l.text || '']).size, updatedAt: l.updatedAt || null, letter: l,
});
export const photoItem = (p, folderId) => ({
  kind: 'photo', id: p.id, name: p.caption || 'untitled', icon: 'photo', folderId, photo: p, addedAt: p.addedAt || null,
});

export function folders(owner){ return getPcFolders(owner); }
export function folder(owner, id){ return folders(owner).find(f => f.id === id) || null; }
export function texts(owner){ return getLetters(owner); }

/** What a location holds, as items. */
export function list(owner, loc){
  if (loc === 'desktop'){
    return [
      ...folders(owner).map(folderItem).sort(byName),
      ...texts(owner).filter(l => !l.folderId || !folder(owner, l.folderId)).map(letterItem).sort(byName),
    ];
  }
  if (loc === 'documents') return texts(owner).map(letterItem).sort(byName);
  if (loc === 'pictures') return folders(owner).map(folderItem).sort(byName);
  if (loc.startsWith('folder:')){
    const id = loc.slice(7);
    const f = folder(owner, id);
    if (!f) return [];
    return [
      ...texts(owner).filter(l => l.folderId === id).map(letterItem).sort(byName),
      ...f.photos.map(p => photoItem(p, id)),
    ];
  }
  return [];
}

export function locationName(owner, loc){
  if (loc.startsWith('folder:')) return folder(owner, loc.slice(7))?.name || 'Folder';
  return LOCATIONS[loc]?.name || loc;
}

/** A Windows-style path for the address bar and the terminal. */
export function pathOf(owner, loc){
  const home = `C:\\Users\\${owner}`;
  if (loc === 'desktop') return home + '\\Desktop';
  if (loc === 'documents') return home + '\\Documents';
  if (loc === 'pictures') return home + '\\Pictures';
  if (loc === 'music') return home + '\\Music';
  if (loc === 'thispc') return 'This PC';
  if (loc === 'bin') return 'Recycle Bin';
  if (loc.startsWith('folder:')) return home + '\\Desktop\\' + locationName(owner, loc);
  return home;
}

/** A name that isn't taken yet: "New folder", "New folder (2)" … */
export function freeName(taken, base, ext = ''){
  const set = new Set(taken.map(t => t.toLowerCase()));
  let n = 1, name = base + ext;
  while (set.has(name.toLowerCase())) name = `${base} (${++n})${ext}`;
  return name;
}

/* ---------------- changes ---------------- */
export function newFolder(owner, name){
  const taken = folders(owner).map(f => f.name);
  const f = store.addFolderLocal(name || freeName(taken, 'New folder'), owner);
  return f;
}

export function newTextFile(owner, folderId = null, name){
  const taken = texts(owner).filter(l => (l.folderId || null) === folderId).map(l => l.filename);
  let filename = (name || freeName(taken, 'New Text Document', '.txt')).trim();
  if (!/\.[a-z0-9]{1,5}$/i.test(filename)) filename += '.txt';
  const letter = { id: 'l_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), filename, text: '', owner, folderId };
  store.saveLetter(letter);
  return store.getLetter(letter.id);
}

export function rename(item, name){
  name = String(name || '').trim();
  if (!name) return;
  if (item.kind === 'folder') store.renameFolder(item.id, name);
  if (item.kind === 'letter'){
    if (!/\.[a-z0-9]{1,5}$/i.test(name)) name += '.txt';
    store.saveLetter({ id: item.id, filename: name });
  }
}

/** Put a text file into a folder (or back on the desktop with null). */
export function moveText(id, folderId){
  store.saveLetter({ id, folderId: folderId || null });
}

export const toBin = item => store.trash(item);
export const binWorks = () => store.binWorks();

export async function uploadPhotos(folderId, files, onEach){
  let ok = 0;
  for (const file of files){
    try {
      const url = await fileToCompressedDataUrl(file);
      await addPcPhoto(folderId, url, file.name.replace(/\.[^.]+$/, ''));
      ok++; onEach && onEach(ok);
    } catch(e){ console.error(e); }
  }
  return ok;
}

export { ensurePhotoSrc };

/* ---------------- sizes ---------------- */
export function fmtBytes(n){
  if (!n) return '0 bytes';
  const u = ['bytes', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1){ n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
}

export function fmtDate(iso){
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}