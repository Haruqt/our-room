import * as store from './store.js';
import { getMe } from './who.js';

/**
 * Public data API for the app. Everything else imports from here and doesn't
 * care whether the bytes end up in localStorage or Supabase — store.js decides
 * that based on whether the Supabase env vars are present.
 */

export const PAPERS = [
  { id:'kraft',   label:'Kraft',        css:'#c2a077', pattern:'none'  },
  { id:'kraftdk', label:'Dark kraft',   css:'#a8835a', pattern:'none'  },
  { id:'cream',   label:'Cream',        css:'#f2e7d2', pattern:'none'  },
  { id:'ruled',   label:'Ruled',        css:'#f6efdd', pattern:'ruled' },
  { id:'grid',    label:'Grid',         css:'#f1ecdc', pattern:'grid'  },
  { id:'dotted',  label:'Dotted',       css:'#f4eede', pattern:'dots'  },
  { id:'linen',   label:'Linen',        css:'#e6ddca', pattern:'weave' },
  { id:'blush',   label:'Blush',        css:'#eed4d2', pattern:'none'  },
  { id:'sage',    label:'Sage',         css:'#d2dac6', pattern:'none'  },
  { id:'denim',   label:'Denim',        css:'#aebbcd', pattern:'weave' },
  { id:'charcoal',label:'Charcoal',     css:'#35312b', pattern:'none'  },
];

/* ---- Book covers ---- */
export const COVER_MATERIALS = [
  { id:'leather', label:'Leather',   a:'#7b3f3f', b:'#5c2a2a' },
  { id:'forest',  label:'Forest',    a:'#3f5a4a', b:'#2a3d32' },
  { id:'navy',    label:'Navy',      a:'#3f4a6b', b:'#2a3249' },
  { id:'tan',     label:'Tan',       a:'#8a6b43', b:'#5e4529' },
  { id:'plum',    label:'Plum',      a:'#5a3f5c', b:'#3e2a40' },
  { id:'cognac',  label:'Cognac',    a:'#6b4a33', b:'#4a3222' },
  { id:'slate',   label:'Slate',     a:'#40525c', b:'#2c3940' },
  { id:'blush',   label:'Blush',     a:'#a8707a', b:'#7d4e57' },
];

export const COVER_TEXTURES = [
  { id:'plain',   label:'Plain'      },
  { id:'grain',   label:'Leather grain' },
  { id:'linen',   label:'Book cloth' },
  { id:'marble',  label:'Marbled'    },
];

export function defaultCover(year){
  const m = COVER_MATERIALS[Math.abs(Number(year)) % COVER_MATERIALS.length];
  return {
    material: m.id,
    texture: 'grain',
    title: String(year),
    subtitle: 'our year',
    signature: '',
    emblem: '❤',
  };
}

export function getCover(year){
  const book = getBook(year);
  if (!book) return defaultCover(year);
  return { ...defaultCover(year), ...(book.cover || {}) };
}

export function saveCover(year, cover){ return store.saveCoverLocal(year, cover); }

export function getYears(){
  return Object.keys(store.getBooks()).map(Number).sort((a,b)=>a-b);
}
export function getBook(year){ return store.getBooks()[year] || null; }

export function createBook(year){
  const existing = store.getBooks()[year];
  if (existing) return existing;
  return store.createBookLocal(Number(year), defaultCover(year));
}

export function addPage(year, label){
  return store.addPageLocal(Number(year), label || 'Untitled');
}

export function deletePage(year, pageId){ store.deletePageLocal(Number(year), pageId); }

export function renamePage(year, pageId, label){
  store.updatePageLocal(Number(year), pageId, { label });
}

export function getPage(year, pageId){
  return getBook(year)?.pages.find(p => p.id === pageId) || null;
}

export function savePage(year, pageId, updates){
  return store.updatePageLocal(Number(year), pageId, updates);
}

export function suggestNextLabel(year){
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const used = new Set((getBook(year)?.pages || []).map(p => p.label));
  return months.find(m => !used.has(m)) || `Page ${(getBook(year)?.pages.length || 0) + 1}`;
}

/* ---- Photos for the in-room PC (separate from scrapbook pages) ---- */
/**
 * One computer's folders. A computer with none gets three starters — but only
 * when its owner turns it on; the database won't let anyone else create them.
 */
export function getPcFolders(owner = 'andrei'){
  const folders = store.getFolders(owner);
  if (folders.length || owner !== getMe()) return folders;
  // only ever once: deleting every folder must not bring the starters back
  const key = 'ourroom_folders_seeded_' + owner;
  const hadAny = store.snapshot().folders.some(f => (f.owner || 'andrei') === owner);
  if (hadAny || localStorage.getItem(key)){ try { localStorage.setItem(key, '1'); } catch(_){} return folders; }
  try { localStorage.setItem(key, '1'); } catch(_){}
  ['us', 'trips', 'random'].forEach(n => store.addFolderLocal(n, owner));
  return store.getFolders(owner);
}


export function addPcPhoto(folderId, dataUrl, caption){
  return store.addPhoto(folderId, dataUrl, caption);
}

export function addPcFolder(name, owner = getMe()){
  store.addFolderLocal(name, owner);
  return store.getFolders(owner);
}

/* ---- Letters sitting on the PC desktop ----
   Edit the text below to make them yours — they're just strings. */

const DEFAULT_LETTERS = [
  {
    id: 'l_first',
    filename: 'for_my_baby.txt',
    text:
`hi baby,

i built you a room.

it isn't much — some wood, a lamp,
a shelf that only holds us.
but everything on it is ours,
and nobody else has the key.

put your photos anywhere you want.
mess it up. that's the point.

i'd pick you again
every single time.

— yours,
A`
  },
  {
    id: 'l_rules',
    filename: 'house_rules.txt',
    text:
`OUR HOUSE RULES

1. no bad days go unmentioned
2. the lamp stays on if you're scared
3. every year gets its own book
4. no page has to be pretty
5. come back whenever you miss me

that's it. that's the whole list.`
  }
];

const CHE_LETTERS = [
  {
    id: 'l_che_readme',
    filename: 'readme.txt',
    text:
`this one's yours, baby.

the left desk, the one monitor, the glowing fans —
all yours. your folders, your photos.

and we're both admins of this whole room:
either of us can change anything, on both computers.

write me letters here (📝 new letter)
and they'll sit on your desktop for me to find.

— A`
  }
];

/**
 * One computer's letters. A computer gets its starter letters the first time
 * its owner turns it on (Andrei's: the two above; Che's: readme.txt). They're
 * real files after that — they stay until someone deletes them.
 */
export function getLetters(owner = 'andrei'){
  if (owner === getMe()){
    const key = 'ourroom_letters_seeded_' + owner;
    const have = store.getLettersCached(owner);
    if (!have.length && !localStorage.getItem(key)){
      try { localStorage.setItem(key, '1'); } catch(_){}
      return store.seedLetters(owner === 'cherryl' ? CHE_LETTERS : DEFAULT_LETTERS, owner);
    }
    if (have.length) { try { localStorage.setItem(key, '1'); } catch(_){} }
  }
  return store.getLettersCached(owner);
}
export const saveLetter = letter => store.saveLetter(letter);
export const deleteLetter = id => store.deleteLetter(id);


export const removePcPhoto = (folderId, photoId) => store.removePhoto(folderId, photoId);
export const ensurePhotoSrc = photo => store.ensurePhotoSrc(photo);
export const storeMode = () => store.mode;
export { storageUsage } from './storage-usage.js';