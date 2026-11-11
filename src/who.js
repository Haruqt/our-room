/**
 * Who's in the room.
 *
 * Identity comes from the database (who_am_i(), keyed on the email you signed
 * in with), not from the name you click on the "who are you" screen. That
 * screen only sets the greeting. Without this, signing in as Andrei and
 * clicking "Cherryl" would let you write on her computer as her.
 */

export const NAMES = { andrei: 'Andrei', cherryl: 'Cherryl' };
export const SHORT = { andrei: 'Andrei', cherryl: 'Che' };

// the emails that map to each of you, used only if the database can't say
const EMAILS = {
  'andreiventura04@gmail.com': 'andrei',
  'cherrylroana07@gmail.com': 'cherryl',
};

let me = null;
let admin = false;      // both of you: can change anything on both computers

export function setAdmin(v){ admin = Boolean(v); }
export function isAdmin(){ return admin; }

export function idFromName(name){
  const n = String(name || '').toLowerCase();
  if (n.startsWith('che')) return 'cherryl';
  if (n.startsWith('and') || n.startsWith('dre')) return 'andrei';
  return null;
}

export function idFromEmail(email){
  return EMAILS[String(email || '').toLowerCase()] || null;
}

export function setMe(id){ if (id === 'andrei' || id === 'cherryl') me = id; }
export function getMe(){ return me || 'andrei'; }
export function other(id = getMe()){ return id === 'andrei' ? 'cherryl' : 'andrei'; }
export function nameOf(id){ return NAMES[id] || id; }
export function shortOf(id){ return SHORT[id] || nameOf(id); }