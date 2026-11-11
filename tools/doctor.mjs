/**
 * Setup doctor — run with:  npm run doctor
 *
 * Talks to your Supabase project straight from the terminal and says exactly
 * which part of the setup is wrong. Faster than opening the browser and reading
 * an error panel, and it works even when the app won't start.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const c = {
  ok:   s => `\x1b[32m${s}\x1b[0m`,
  bad:  s => `\x1b[31m${s}\x1b[0m`,
  warn: s => `\x1b[33m${s}\x1b[0m`,
  dim:  s => `\x1b[2m${s}\x1b[0m`,
  head: s => `\x1b[1m${s}\x1b[0m`,
};

function readEnv(){
  const path = join(root, '.env');
  if (!existsSync(path)) return null;
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')){
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const TABLES = ['books', 'pages', 'pc_folders', 'pc_photos', 'letters', 'allowed_emails'];

console.log(c.head('\n  Our Room — setup doctor\n'));

const env = readEnv();
if (!env){
  console.log(c.bad('  ✗ No .env file'));
  console.log(c.dim('    Copy .env.example to .env and fill in your project URL and key.\n'));
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
         || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key){
  console.log(c.bad('  ✗ .env is missing the URL or the key'));
  console.log(c.dim(`    Found: ${Object.keys(env).join(', ') || '(nothing)'}`));
  console.log(c.dim('    Needs: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY\n'));
  process.exit(1);
}

console.log(`  url  ${c.dim(url)}`);
console.log(`  key  ${c.dim(key.slice(0, 22) + '…')}\n`);

async function probe(table){
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  let body = null;
  try { body = await res.json(); } catch(_){ }
  return { status: res.status, body };
}

let reachable = false, keyOk = true;
const missing = [], present = [], unclear = [];

for (const table of TABLES){
  let r;
  try {
    r = await probe(table);
  } catch(e){
    console.log(c.bad(`  ✗ can't reach the project — ${e.message}`));
    console.log(c.dim('    Check VITE_SUPABASE_URL is exactly your project URL.\n'));
    process.exit(1);
  }
  reachable = true;

  if (r.status === 200){
    present.push(table);
    console.log(`  ${c.ok('✓')} ${table.padEnd(16)} ${c.dim('exists')}`);
  } else if (r.status === 401 || /invalid api key/i.test(r.body?.message || '')){
    keyOk = false;
    console.log(`  ${c.bad('✗')} ${table.padEnd(16)} ${c.bad('key rejected')}`);
    break;
  } else if (r.status === 404 || r.body?.code === '42P01'
             || /could not find the table/i.test(r.body?.message || '')){
    missing.push(table);
    console.log(`  ${c.bad('✗')} ${table.padEnd(16)} ${c.bad('missing')}`);
  } else if (r.body && (r.body.code || r.body.message)){
    // a real PostgREST reply (RLS denial and the like) — the table answered
    present.push(table);
    console.log(`  ${c.ok('✓')} ${table.padEnd(16)} ${c.dim(`exists (${r.status})`)}`);
  } else {
    // A status with no PostgREST body isn't Supabase talking — usually a
    // corporate proxy or network appliance in the way. Don't call that a pass.
    unclear.push(table);
    console.log(`  ${c.warn('?')} ${table.padEnd(16)} ${c.warn(`unclear (HTTP ${r.status}, no API response)`)}`);
  }
}

console.log('');

if (!keyOk){
  console.log(c.bad('  The key was rejected.'));
  console.log('  Copy it again from Supabase → Project Settings → API,');
  console.log('  paste into .env, then restart the dev server.\n');
  process.exit(1);
}

if (unclear.length){
  console.log(c.warn('  Could not verify — something between you and Supabase is'));
  console.log(c.warn('  intercepting the requests (a proxy, VPN or firewall).'));
  console.log(c.dim('  The replies had no Supabase API body, so this says nothing about'));
  console.log(c.dim('  your setup either way. Try again off the VPN, or check in the browser.\n'));
  process.exit(1);
}

if (missing.length === TABLES.length){
  console.log(c.warn('  Connected, but the database is empty — the schema has not been run.'));
  console.log('');
  console.log('  1. Open Supabase → SQL Editor → New query');
  console.log('  2. Paste all of ' + c.head('supabase-schema.sql'));
  console.log('  3. ' + c.warn('Change the two placeholder emails near the top first'));
  console.log('  4. Run it, then run ' + c.head('npm run doctor') + ' again\n');
  process.exit(1);
}

if (missing.length){
  console.log(c.warn(`  Partly set up — missing: ${missing.join(', ')}`));
  console.log('  Re-run supabase-schema.sql; it looks like it only partly applied.\n');
  process.exit(1);
}

console.log(c.ok('  Everything is in place.'));
console.log(c.dim('  Sign-in still happens in the browser — the email must be in allowed_emails.\n'));
