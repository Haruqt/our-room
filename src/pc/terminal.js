/**
 * Command Prompt. Real commands on your real files (dir, cd, type, mkdir,
 * del, ren, move, echo > file …) plus a few of our own.
 */
import * as store from '../store.js';
import * as fs from './fs.js';
import { shortOf, nameOf, getMe, other } from '../who.js';

const HELP = [
  ['help', 'this list'],
  ['dir  (or ls)', 'list what\'s here'],
  ['cd <folder>', 'go into a folder · cd .. goes back · cd \\ goes to the desktop'],
  ['type <file>  (or cat)', 'print a text file'],
  ['notepad <file>', 'open a file in Notepad (makes it if it\'s new)'],
  ['echo <text> > <file>', 'write text into a file ( >> adds to the end )'],
  ['mkdir <name>', 'make a folder'],
  ['ren <old> <new>', 'rename a file or folder'],
  ['move <file> <folder>', 'move a text file into a folder ( .. = desktop )'],
  ['del <file>', 'move a file or folder to the Recycle Bin'],
  ['find "<words>"', 'search inside every text file'],
  ['tree', 'show every folder and file'],
  ['start <app>', 'open explorer, browser, notepad, settings, photos, music'],
  ['color <0-6>', 'change the colours (it remembers)'],
  ['cls  (or clear)', 'clear the screen'],
  ['whoami · hostname · date · time · ver · systeminfo · ipconfig', ''],
  ['ping <name>', 'is she/he there?'],
  ['love', ''],
  ['exit', 'close this window'],
];

const KNOWN = ['help', 'dir', 'ls', 'cd', 'chdir', 'type', 'cat', 'notepad', 'edit', 'mkdir', 'md', 'ren', 'rename',
  'move', 'mv', 'del', 'erase', 'rm', 'rd', 'rmdir', 'find', 'findstr', 'grep', 'tree', 'start', 'open', 'explorer',
  'cls', 'clear', 'color', 'whoami', 'hostname', 'date', 'time', 'ver', 'systeminfo', 'ipconfig', 'ping', 'love',
  'heart', 'exit', 'shutdown', 'sudo', 'echo'];

/** The known command one or two letters away from what was typed (hepl -> help). */
function closest(word){
  if (word.length < 3) return null;
  const dist = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++){
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  };
  let best = null, bd = 3;
  KNOWN.forEach(k => { const x = dist(word, k); if (x < bd && x <= (word.length > 4 ? 2 : 1)){ bd = x; best = k; } });
  return best;
}

const THEMES = [
  ['#0c0c0c', '#cccccc'], ['#0b1a0b', '#5ef38c'], ['#0b1022', '#7fc4ff'], ['#1f0a14', '#ff9cc4'],
  ['#1c1408', '#ffcc66'], ['#f5f5f5', '#202020'], ['#012456', '#eeedf0'],
];

export function openTerminal(pc, { cwd = 'desktop', run } = {}){
  return pc.openWindow({
    app: 'terminal', title: 'Command Prompt', width: 760, height: 450,
    build(win){
      win.body.innerHTML = `<div class="term" tabindex="0"><div class="term-out"></div><div class="term-line"><span class="term-ps"></span><input class="term-in" spellcheck="false" autocomplete="off"></div></div>`;
      const term = win.body.querySelector('.term');
      const out = win.body.querySelector('.term-out');
      const input = win.body.querySelector('.term-in');
      const ps = win.body.querySelector('.term-ps');
      let loc = cwd;
      // each computer has its own colours: Andrei's green (color 1), Che's pink
      // (color 3); a color you pick with the color command is remembered
      const COLOR_KEY = 'ourroom_cmd_color_' + pc.owner;
      const applyColor = n => { const t = THEMES[n] || THEMES[0]; term.style.background = t[0]; term.style.color = t[1]; };
      let saved = null;
      try { saved = localStorage.getItem(COLOR_KEY); } catch(_){}
      applyColor(saved !== null ? Number(saved) : (pc.owner === 'cherryl' ? 3 : 1));
      const hist = [];
      let hi = 0;

      const prompt = () => fs.pathOf(pc.owner, loc) + '>';
      const setPs = () => { ps.textContent = prompt(); };
      const print = (text = '', cls = '') => {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = text;
        out.appendChild(d);
        term.scrollTop = term.scrollHeight;
      };
      const err = t => print(t, 'term-err');

      print(`Our Room [Version 1.0.${new Date().getFullYear()}]`);
      print(`(c) ${shortOf('andrei')} & ${shortOf('cherryl')}. All rights reserved.`);
      print('');
      print('Type  help  and press Enter for every command. A few to start:', 'term-dim');
      print('  dir   ·   cd us   ·   type readme.txt   ·   echo hi > note.txt   ·   ping che   ·   love', 'term-dim');
      print('');
      setPs();

      term.addEventListener('pointerup', () => { if (!window.getSelection()?.toString()) input.focus(); });
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter'){
          const cmd = input.value;
          input.value = '';
          print(prompt() + cmd);
          if (cmd.trim()){ hist.push(cmd); hi = hist.length; }
          exec(cmd);
          print('');
          setPs();
        } else if (e.key === 'ArrowUp'){ if (hi > 0){ hi--; input.value = hist[hi]; } e.preventDefault(); }
        else if (e.key === 'ArrowDown'){ if (hi < hist.length){ hi++; input.value = hist[hi] || ''; } e.preventDefault(); }
        else if (e.key === 'Tab'){ e.preventDefault(); complete(); }
        else if (e.key === 'l' && e.ctrlKey){ e.preventDefault(); out.innerHTML = ''; }
        else if (e.key === 'Escape'){ input.blur(); }
      });
      setTimeout(() => input.focus(), 150);

      /* ---- helpers on the current folder ---- */
      const folderId = () => loc.startsWith('folder:') ? loc.slice(7) : null;
      const textsHere = () => fs.texts(pc.owner).filter(l => (l.folderId || null) === folderId() || (loc === 'desktop' && l.folderId && !fs.folder(pc.owner, l.folderId)));
      const foldersHere = () => loc === 'desktop' ? fs.folders(pc.owner) : [];
      const photosHere = () => folderId() ? (fs.folder(pc.owner, folderId())?.photos || []) : [];
      const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
      const findText = name => textsHere().find(l => eq(l.filename, name) || eq(l.filename, name + '.txt'));
      const findFolder = name => fs.folders(pc.owner).find(f => eq(f.name, name));
      const needEdit = () => { if (!pc.canEdit){ err('Access is denied.'); return false; } return true; };

      function args(s){
        const a = [];
        s.replace(/"([^"]*)"|(\S+)/g, (_, q, w) => { a.push(q ?? w); return ''; });
        return a;
      }

      function complete(){
        const v = input.value;
        const m = v.match(/^(.*?)(\S*)$/);
        const stem = m[2].replace(/^"/, '').toLowerCase();
        const names = [...foldersHere().map(f => f.name), ...textsHere().map(l => l.filename)];
        const hit = names.filter(n => n.toLowerCase().startsWith(stem));
        if (hit.length === 1) input.value = m[1] + (hit[0].includes(' ') ? `"${hit[0]}"` : hit[0]);
        else if (hit.length > 1){ print(prompt() + v); print(hit.join('    ')); setPs(); }
      }

      function exec(line){
        const redirect = line.match(/^\s*echo\s+(.*?)\s*(>>?)\s*(.+)$/i);
        if (redirect){
          if (!needEdit()) return;
          const [, text, op, target] = redirect;
          const name = target.trim().replace(/^"|"$/g, '');
          let l = findText(name);
          if (!l){ l = fs.newTextFile(pc.owner, folderId(), name); }
          const now = store.getLetter(l.id);
          store.saveLetter({ id: l.id, text: op === '>>' ? (now.text ? now.text + '\n' : '') + text : text });
          return;
        }
        const [cmdRaw, ...a] = args(line.trim());
        if (!cmdRaw) return;
        // forgiving: /help, help/, --help, -h and ? all mean help
        let cmd = cmdRaw.toLowerCase().replace(/^[\/\-]+|[\/\\]+$/g, '');
        if (['?', 'h', 'commands', 'man'].includes(cmd) || cmdRaw === '/?') cmd = 'help';
        // a typo of a known command just runs it, and says so
        if (!KNOWN.includes(cmd)){
          const fix = closest(cmd);
          if (fix){ print(`(did you mean ${fix}? running it)`, 'term-dim'); cmd = fix; }
        }
        const rest = line.trim().slice(cmdRaw.length).trim();
        switch (cmd){
          case 'help':
            HELP.forEach(([c, d]) => print(c.padEnd(30) + d));
            break;
          case 'dir': case 'ls': {
            print(` Directory of ${fs.pathOf(pc.owner, loc)}`); print('');
            let n = 0, bytes = 0;
            if (loc !== 'desktop') print('                 <DIR>          ..');
            foldersHere().forEach(f => { print(`                 <DIR>          ${f.name}`); n++; });
            textsHere().forEach(l => {
              const size = new Blob([l.text || '']).size; bytes += size; n++;
              const d = l.updatedAt ? new Date(l.updatedAt) : null;
              print(`${d ? d.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' }) + '  ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''.padEnd(19)}${String(size).padStart(12)} ${l.filename}`);
            });
            photosHere().forEach(p => { print(`${''.padEnd(19)}${'(photo)'.padStart(12)} ${p.caption || 'untitled'}.jpg`); n++; });
            print(`${String(n).padStart(16)} item(s)  ${fs.fmtBytes(bytes)}`);
            break;
          }
          case 'cd': case 'chdir': {
            const t = rest.replace(/^"|"$/g, '');
            if (!t){ print(fs.pathOf(pc.owner, loc)); break; }
            if (t === '..' || t === '\\' || t === '/' || eq(t, 'desktop') || t === '~'){ loc = 'desktop'; break; }
            const f = findFolder(t);
            if (f) loc = 'folder:' + f.id; else err('The system cannot find the path specified.');
            break;
          }
          case 'type': case 'cat': {
            const l = findText(rest.replace(/^"|"$/g, ''));
            if (!l){ err('The system cannot find the file specified.'); break; }
            (l.text || '').split('\n').forEach(x => print(x));
            break;
          }
          case 'notepad': case 'edit': case 'code': {
            const name = rest.replace(/^"|"$/g, '');
            if (!name){ pc.openApp('notepad', {}); break; }
            let l = findText(name);
            if (!l){ if (!needEdit()) break; l = fs.newTextFile(pc.owner, folderId(), name); }
            pc.openApp('notepad', { letter: l });
            break;
          }
          case 'mkdir': case 'md': {
            if (!needEdit()) break;
            if (loc !== 'desktop'){ err('Folders live on the desktop here — cd .. first.'); break; }
            if (!rest){ err('The syntax of the command is incorrect.'); break; }
            if (findFolder(rest.replace(/^"|"$/g, ''))){ err('A subdirectory or file already exists.'); break; }
            fs.newFolder(pc.owner, rest.replace(/^"|"$/g, ''));
            break;
          }
          case 'ren': case 'rename': {
            if (!needEdit()) break;
            if (a.length < 2){ err('The syntax of the command is incorrect.'); break; }
            const l = findText(a[0]); const f = !l && findFolder(a[0]);
            if (l) fs.rename({ kind: 'letter', id: l.id }, a[1]);
            else if (f) fs.rename({ kind: 'folder', id: f.id }, a[1]);
            else err('The system cannot find the file specified.');
            break;
          }
          case 'move': case 'mv': {
            if (!needEdit()) break;
            if (a.length < 2){ err('The syntax of the command is incorrect.'); break; }
            const l = findText(a[0]);
            if (!l){ err('The system cannot find the file specified.'); break; }
            const dest = a[1] === '..' || eq(a[1], 'desktop') ? null : findFolder(a[1]);
            if (dest === undefined){ err('The system cannot find the path specified.'); break; }
            fs.moveText(l.id, dest ? dest.id : null);
            print('        1 file(s) moved.');
            break;
          }
          case 'del': case 'erase': case 'rm': case 'rd': case 'rmdir': {
            if (!needEdit()) break;
            const name = rest.replace(/^\/[a-z]\s+/i, '').replace(/^"|"$/g, '');
            const l = findText(name); const f = !l && loc === 'desktop' && findFolder(name);
            if (l) pc.deleteItems([{ kind: 'letter', id: l.id, name: l.filename }]);
            else if (f) pc.deleteItems([{ kind: 'folder', id: f.id, name: f.name }]);
            else err('Could Not Find ' + fs.pathOf(pc.owner, loc) + '\\' + name);
            break;
          }
          case 'find': case 'grep': case 'findstr': {
            const q = rest.replace(/^"|"$/g, '').toLowerCase();
            if (!q){ err('FIND: Parameter format not correct'); break; }
            let hits = 0;
            fs.texts(pc.owner).forEach(l => {
              (l.text || '').split('\n').forEach((x, i) => {
                if (x.toLowerCase().includes(q)){ print(`${l.filename}:${i + 1}: ${x}`); hits++; }
              });
            });
            if (!hits) print('no matches');
            break;
          }
          case 'tree': {
            print(fs.pathOf(pc.owner, 'desktop'));
            const fl = fs.folders(pc.owner);
            fl.forEach((f, i) => {
              const last = i === fl.length - 1 && !fs.texts(pc.owner).some(l => !l.folderId);
              print((last ? '└───' : '├───') + f.name);
              const inside = [...fs.texts(pc.owner).filter(l => l.folderId === f.id).map(l => l.filename), ...f.photos.map(p => (p.caption || 'untitled') + '.jpg')];
              inside.forEach(n => print((last ? '    ' : '│   ') + '    ' + n));
            });
            fs.texts(pc.owner).filter(l => !l.folderId).forEach(l => print('    ' + l.filename));
            break;
          }
          case 'start': case 'open': {
            const app = (a[0] || '').toLowerCase();
            const map = { explorer: 'explorer', 'explorer.exe': 'explorer', browser: 'browser', chrome: 'browser', brave: 'browser', edge: 'browser', notepad: 'notepad', settings: 'settings', photos: 'photos', music: 'music', cmd: 'terminal', spotify: 'music' };
            if (map[app]) pc.openApp(map[app], app === 'photos' && folderId() ? { folderId: folderId() } : {});
            else if (/^https?:\/\//.test(a[0] || '') || /\.\w{2,}/.test(a[0] || '')) pc.openApp('browser', { url: a[0] });
            else if (!app) pc.openApp('terminal', { cwd: loc });
            else err(`Windows cannot find '${a[0]}'.`);
            break;
          }
          case 'explorer': pc.openApp('explorer', { loc: loc === 'desktop' ? 'desktop' : loc }); break;
          case 'cls': case 'clear': out.innerHTML = ''; break;
          case 'color': {
            const n = Number(a[0]);
            if (!a.length || !THEMES[n]){
              print('color <number> — 0 grey · 1 green · 2 blue · 3 pink · 4 gold · 5 light · 6 classic blue');
              break;
            }
            applyColor(n);
            try { localStorage.setItem(COLOR_KEY, String(n)); } catch(_){}
            break;
          }
          case 'whoami': print(`${pc.name.toLowerCase()}\\${getMe()}`); break;
          case 'hostname': print(pc.name); break;
          case 'date': print('The current date is: ' + new Date().toLocaleDateString([], { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })); break;
          case 'time': print('The current time is: ' + new Date().toLocaleTimeString()); break;
          case 'ver': print(`Our Room [Version 1.0.${new Date().getFullYear()}]`); break;
          case 'systeminfo': {
            const photos = fs.folders(pc.owner).reduce((n, f) => n + f.photos.length, 0);
            [['Host Name', pc.name], ['OS Name', 'Our Room'], ['Registered Owner', nameOf(pc.owner)], ['Logged on as', nameOf(getMe())],
             ['Folders', fs.folders(pc.owner).length], ['Text files', fs.texts(pc.owner).length], ['Photos', photos],
             ['Recycle Bin', store.binItems(pc.owner).length + ' item(s)'], ['Sync', store.mode === 'supabase' ? 'on (both computers)' : 'off (this browser only)'],
             ['Total Physical Memory', 'every day of us']].forEach(([k, v]) => print((k + ':').padEnd(27) + v));
            break;
          }
          case 'ipconfig':
            print('Ethernet adapter Our Room:'); print('');
            print('   Connection-specific DNS Suffix  . : home');
            print('   IPv4 Address. . . . . . . . . . . : 127.0.0.1  (there\'s no place like it)');
            print('   Default Gateway . . . . . . . . . : the door, top right');
            break;
          case 'ping': {
            const who = (a[0] || '').toLowerCase();
            const target = /che|cherryl|baby|wife/.test(who) ? 'cherryl' : /and|drei|husband/.test(who) ? 'andrei' : null;
            if (!target){ err(`Ping request could not find host ${a[0] || ''}. Please check the name and try again.`); break; }
            const here = (document.getElementById('presence-chip-text')?.textContent || '').toLowerCase().includes(shortOf(target).toLowerCase()) || target === getMe();
            print(`Pinging ${shortOf(target)} with 32 bytes of love:`);
            for (let i = 0; i < 4; i++) print(here ? `Reply from ${shortOf(target)}: bytes=32 time<1ms TTL=forever` : 'Request timed out — probably asleep. Leave a note in the bottle?');
            break;
          }
          case 'love': case 'heart':
            window.dispatchEvent(new CustomEvent('ourroom:did', { detail: 'cmd-love' }));
            ['   ****     ****', ' ******** ********', '******************', ' ****************', '   ************', '     ********', '       ****', '        **',
             '', `   ${shortOf(getMe())} ♡ ${shortOf(other())}`].forEach(x => print(x, 'term-love'));
            break;
          case 'echo': print(rest); break;
          case 'exit': win.close(); break;
          case 'shutdown': pc.shutdown(/\/r/i.test(rest)); break;
          case 'sudo': err('This incident will be reported. (to Che)'); break;
          default:
            err(`'${cmdRaw}' is not recognized as an internal or external command,`);
            err('operable program or batch file. Type help for the list.');
        }
      }

      if (run){ print(prompt() + run); exec(run); print(''); setPs(); }
      win.refresh = () => { if (folderId() && !fs.folder(pc.owner, folderId())){ loc = 'desktop'; setPs(); } };
    },
  });
}