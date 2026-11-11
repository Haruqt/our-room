import { supabase, hasSupabase } from './db.js';

/**
 * Setup diagnostics.
 *
 * "Something broke" with no detail is useless, so this probes each piece of the
 * setup separately and says which one is wrong in words you can act on.
 *
 * The important subtlety: with Row Level Security on and nobody signed in, a
 * select returns an EMPTY ARRAY, not an error. So an error here almost never
 * means "permission denied" — it means the table is missing or the key is bad.
 */

const TABLES = ['books', 'pages', 'pc_folders', 'pc_photos', 'letters'];

export async function diagnose(){
  const result = {
    ok: false,
    reachable: false,
    keyValid: false,
    missingTables: [],
    presentTables: [],
    signedIn: false,
    allowed: null,
    summary: '',
    detail: '',
    fix: '',
  };

  if (!hasSupabase){
    result.summary = 'Running local-only — no .env found';
    result.fix = 'Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.';
    return result;
  }

  // 1. Is anyone signed in?
  try {
    const { data } = await supabase.auth.getUser();
    result.signedIn = Boolean(data?.user);
    if (data?.user?.email) result.email = data.user.email;
  } catch(_){ /* not fatal */ }

  // 2. Probe every table. Missing tables are the usual cause.
  for (const table of TABLES){
    try {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (!error){ result.reachable = true; result.keyValid = true; result.presentTables.push(table); continue; }

      const msg = (error.message || '').toLowerCase();
      const code = error.code || '';

      if (code === '42P01' || msg.includes('does not exist') || msg.includes('could not find the table')){
        result.reachable = true; result.keyValid = true;
        result.missingTables.push(table);
      } else if (msg.includes('invalid api key') || msg.includes('no api key') || error.status === 401){
        result.reachable = true; result.keyValid = false;
        result.detail = error.message;
        break;
      } else if (msg.includes('failed to fetch') || msg.includes('networkerror')){
        result.reachable = false;
        result.detail = error.message;
        break;
      } else {
        // RLS denial or anything else — the table exists and answered
        result.reachable = true; result.keyValid = true;
        result.presentTables.push(table);
      }
    } catch(e){
      result.reachable = false;
      result.detail = e?.message || String(e);
      break;
    }
  }

  // 3. Turn that into one clear sentence.
  if (!result.reachable){
    result.summary = "Can't reach the project";
    result.fix = 'Check VITE_SUPABASE_URL in .env matches your project URL exactly, and that you restarted `npm run dev` after editing .env.';
  } else if (!result.keyValid){
    result.summary = 'The key was rejected';
    result.fix = 'Copy the publishable/anon key again from Supabase → Project Settings → API, put it in .env, and restart the dev server.';
  } else if (result.missingTables.length === TABLES.length){
    result.summary = 'Connected, but the database is empty';
    result.fix = 'Run supabase-schema.sql: Supabase → SQL Editor → New query → paste the whole file → Run. Remember to change the two placeholder emails first.';
  } else if (result.missingTables.length){
    result.summary = `Missing ${result.missingTables.length} table(s): ${result.missingTables.join(', ')}`;
    result.fix = 'Re-run supabase-schema.sql — it looks like it only partly applied.';
  } else if (!result.signedIn){
    result.summary = 'Connected — sign in to load your things';
    result.ok = true;
  } else {
    result.summary = 'Connected and signed in';
    result.ok = true;
  }

  return result;
}

/** Render the result into the sign-in screen's note line. */
export async function showDiagnosis(){
  const note = document.getElementById('auth-note');
  if (!note) return;
  note.classList.remove('bad', 'good');
  note.textContent = 'checking connection…';

  const r = await diagnose();
  note.textContent = r.summary;
  note.classList.add(r.ok ? 'good' : 'bad');

  const fixEl = document.getElementById('auth-fix');
  if (fixEl) fixEl.textContent = r.ok ? '' : r.fix;

  // full picture in the console for copying
  console.log('%c Our Room — setup check ', 'background:#2a3f6b;color:#fff;padding:3px 8px;border-radius:3px');
  console.table({
    reachable: r.reachable,
    keyValid: r.keyValid,
    signedIn: r.signedIn,
    tablesFound: r.presentTables.join(', ') || '(none)',
    tablesMissing: r.missingTables.join(', ') || '(none)',
  });
  if (r.detail) console.log('detail:', r.detail);
  if (r.fix) console.log('fix:', r.fix);

  return r;
}
