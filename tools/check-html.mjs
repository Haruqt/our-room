/**
 * Structural check for index.html.
 *
 * A single missing </div> once nested the whole PC desktop inside the editor
 * overlay, which is display:none — so the computer silently never appeared and
 * nothing threw. This catches that class of bug before it ships.
 *
 *   node tools/check-html.mjs
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const lines = html.split('\n');
const VOID = new Set(['br','img','input','meta','link','hr','source','area','col']);

let depth = 0;
const stack = [];
const problems = [];

lines.forEach((line, n) => {
  for (const m of line.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)){
    const [, close, tag, attrs, self] = m;
    const t = tag.toLowerCase();
    if (VOID.has(t) || self) continue;
    if (!['div','section','aside','main','body','html','head'].includes(t)) continue;

    if (close){
      const open = stack.pop();
      if (!open) problems.push(`line ${n+1}: stray </${t}>`);
      else if (open.tag !== t) problems.push(`line ${n+1}: </${t}> closes <${open.tag}> opened on line ${open.line}`);
      depth--;
    } else {
      const id = /id="([^"]+)"/.exec(attrs)?.[1];
      const cls = /class="([^"]+)"/.exec(attrs)?.[1] || '';
      if (cls.includes('overlay-screen')){
        const parent = stack[stack.length - 1];
        if (!parent || parent.tag !== 'section'){
          problems.push(
            `line ${n+1}: overlay #${id} sits inside <${parent ? parent.tag : 'nothing'}` +
            `${parent && parent.id ? ' #'+parent.id : ''}> — it must be a direct child of a <section> screen, ` +
            `or it inherits that parent's display:none`);
        }
      }
      stack.push({ tag:t, line:n+1, id });
      depth++;
    }
  }
});

stack.forEach(o => problems.push(`<${o.tag}${o.id ? ' #'+o.id : ''}> opened on line ${o.line} is never closed`));

// Every full-page screen must be painted. A screen missing from the background
// rule renders cream text on the browser's default white — invisible, and with
// nothing thrown to notice it. That happened to #screen-auth once already.
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
for (const m of html.matchAll(/id="(screen-[a-z-]+)"/g)){
  const id = m[1];
  const painted = new RegExp(`#${id}[^{]*\\{[^}]*background`, 's').test(css)
               || new RegExp(`#${id}\\s*[,{]`).test(css.replace(/\n/g, ' '))
                  && /background/.test(
                       (css.split(new RegExp(`#${id}\\s*[,{]`))[1] || '').slice(0, 260));
  if (!painted) problems.push(`#${id} has no background rule in style.css — it will render on white`);
}

if (problems.length){
  console.error('index.html structure problems:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('index.html structure OK — tags balanced, overlays are siblings');
