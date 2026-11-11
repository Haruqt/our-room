/**
 * The web browser on the computers.
 *
 * Honest limits: most big sites (Google, Facebook, Instagram…) refuse to be
 * shown inside another page, so a search or one of those sites opens in a
 * real tab of your actual browser. YouTube and Spotify links play right
 * here (they're turned into their embeddable players), and many other sites
 * (Wikipedia, blogs, docs) open inside the window.
 */
import { icon } from './icons.js';
import { esc } from '../room-kit.js';

const SHORTCUTS = [
  { name: 'YouTube', url: 'https://www.youtube.com', color: '#ff3b3b', letter: '▶' },
  { name: 'Spotify', url: 'https://open.spotify.com', color: '#1ed760', letter: '♫' },
  { name: 'Messenger', url: 'https://www.messenger.com', color: '#a855f7', letter: 'm' },
  { name: 'Facebook', url: 'https://www.facebook.com', color: '#3b82f6', letter: 'f' },
  { name: 'Maps', url: 'https://www.google.com/maps', color: '#22c55e', letter: '⌖' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page', color: '#9ca3af', letter: 'W', inside: true },
];

// sites known to refuse being shown inside a page: go straight to a real tab
const OUTSIDE = /(^|\.)(google\.[a-z.]+|facebook\.com|messenger\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|reddit\.com|netflix\.com|github\.com|linkedin\.com|shopee\.[a-z.]+|lazada\.[a-z.]+|youtube\.com|open\.spotify\.com|bing\.com|duckduckgo\.com|search\.brave\.com|chatgpt\.com|claude\.ai)$/i;

function normalize(input){
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^[a-z]+:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s) && !/\s/.test(s)) return 'https://' + s;
  return null;                                  // not a URL: a search
}

/** YouTube / Spotify links become their players, which may be embedded. */
function embedFor(url){
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let yt = null;
    if (host === 'youtu.be') yt = u.pathname.slice(1);
    if (host === 'youtube.com'){
      if (u.pathname === '/watch') yt = u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      if (m) yt = m[2];
    }
    if (yt) return { url: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`, title: 'YouTube' };
    if (host === 'open.spotify.com'){
      const m = u.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/(\w+)/);
      if (m) return { url: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, title: 'Spotify' };
    }
  } catch(_){}
  return null;
}

const realTab = url => window.open(url, '_blank', 'noopener');

export function openBrowser(pc, { url, search: query } = {}){
  return pc.openWindow({
    app: 'browser', title: 'New tab - Browser', width: 980, height: 620,
    build(win){
      win.body.innerHTML = `
        <div class="br">
          <div class="br-tabs"><button class="br-newtab" title="New tab">${icon('plus')}</button></div>
          <div class="br-bar">
            <button class="br-b" data-b="back" title="Back">${icon('left')}</button>
            <button class="br-b" data-b="fwd" title="Forward">${icon('right')}</button>
            <button class="br-b" data-b="reload" title="Reload">${icon('reload')}</button>
            <form class="br-addr"><span class="br-lock"></span><input spellcheck="false" placeholder="Search or type a web address"></form>
            <button class="br-b br-out" data-b="out" title="Open this page in a real tab">↗</button>
          </div>
          <div class="br-note"><span></span><button class="os-btn">Open in a new tab ↗</button></div>
          <div class="br-pages"></div>
        </div>`;
      const $ = s => win.body.querySelector(s);
      const tabs = [];
      let cur = null;
      let seq = 0;

      function newTab(startUrl){
        const t = { id: ++seq, hist: [], at: -1, title: 'New tab', page: document.createElement('div') };
        t.page.className = 'br-page';
        $('.br-pages').appendChild(t.page);
        t.tabEl = document.createElement('div');
        t.tabEl.className = 'br-tab';
        t.tabEl.innerHTML = `<span class="br-fav"></span><span class="br-tt"></span><button class="br-x" title="Close tab">×</button>`;
        t.tabEl.addEventListener('click', e => { if (!e.target.closest('.br-x')) select(t); });
        t.tabEl.querySelector('.br-x').addEventListener('click', e => { e.stopPropagation(); closeTab(t); });
        $('.br-tabs').insertBefore(t.tabEl, $('.br-newtab'));
        tabs.push(t);
        select(t);
        navigate(t, startUrl || 'newtab', true);
        return t;
      }

      function closeTab(t){
        const i = tabs.indexOf(t);
        tabs.splice(i, 1);
        t.page.remove(); t.tabEl.remove();
        if (!tabs.length){ win.close(); return; }
        if (cur === t) select(tabs[Math.max(0, i - 1)]);
      }

      function select(t){
        cur = t;
        tabs.forEach(x => { x.tabEl.classList.toggle('on', x === t); x.page.classList.toggle('on', x === t); });
        chrome();
      }

      function chrome(){
        if (!cur) return;
        const u = cur.hist[cur.at] || 'newtab';
        $('.br-addr input').value = u === 'newtab' ? '' : u;
        $('.br-lock').textContent = u.startsWith('https://') ? '🔒' : '';
        $('[data-b="back"]').disabled = cur.at <= 0;
        $('[data-b="fwd"]').disabled = cur.at >= cur.hist.length - 1;
        $('[data-b="out"]').disabled = u === 'newtab';
        cur.tabEl.querySelector('.br-tt').textContent = cur.title;
        cur.tabEl.querySelector('.br-fav').textContent = u === 'newtab' ? '✦' : '🌐';
        win.setTitle(cur.title + ' - Browser');
        const note = $('.br-note');
        note.classList.toggle('show', Boolean(cur.note));
        note.querySelector('span').textContent = cur.note || '';
      }

      function navigate(t, target, push){
        if (push){ t.hist = t.hist.slice(0, t.at + 1); t.hist.push(target); t.at = t.hist.length - 1; }
        t.note = '';
        t.page.innerHTML = '';
        if (target === 'newtab'){ t.title = 'New tab'; renderNewTab(t); chrome(); return; }

        const em = embedFor(target);
        let host = '';
        try { host = new URL(target).hostname; } catch(_){}
        if (!em && OUTSIDE.test(host)){
          t.title = host;
          t.page.innerHTML = `<div class="br-out-page">${icon('browser')}<h3>${esc(host)} opened in a new tab</h3>
            <p>This site doesn't allow itself to be shown inside another page, so it opened in a real tab of your browser.</p>
            <button class="os-btn">Open it again ↗</button></div>`;
          t.page.querySelector('button').addEventListener('click', () => realTab(target));
          realTab(target);
          chrome(); return;
        }
        const src = em ? em.url : target;
        t.title = em ? em.title : host || target;
        const f = document.createElement('iframe');
        f.className = 'br-frame';
        f.src = src;
        f.allow = 'autoplay; encrypted-media; picture-in-picture; clipboard-write';
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        t.page.appendChild(f);
        if (!em) t.note = "If this stays blank, the site doesn't allow being shown inside another page.";
        chrome();
      }

      function go(input){
        const url = normalize(input);
        if (url) return navigate(cur, url, true);
        search(input);
      }

      function search(q){
        if (!q.trim()) return;
        realTab('https://www.google.com/search?q=' + encodeURIComponent(q));
        cur.title = q;
        cur.page.innerHTML = `<div class="br-out-page">${icon('search')}<h3>Searching for “${esc(q)}”</h3>
          <p>Search engines won't run inside another page, so the results opened in a real tab of your browser.</p>
          <div class="br-row"><button class="os-btn" data-again>Open results again ↗</button>
          <button class="os-btn ghost" data-wiki>Look it up on Wikipedia here</button></div></div>`;
        cur.page.querySelector('[data-again]').addEventListener('click', () => realTab('https://www.google.com/search?q=' + encodeURIComponent(q)));
        cur.page.querySelector('[data-wiki]').addEventListener('click', () => navigate(cur, 'https://en.m.wikipedia.org/w/index.php?search=' + encodeURIComponent(q), true));
        cur.hist = cur.hist.slice(0, cur.at + 1); cur.hist.push('newtab'); cur.at = cur.hist.length - 1;
        chrome();
        $('.br-addr input').value = q;
      }

      function renderNewTab(t){
        const h = new Date().getHours();
        const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        t.page.innerHTML = `
          <div class="br-home">
            <div class="br-hello">${hello}</div>
            <form class="br-big"><span>${icon('search')}</span><input placeholder="Search the web" spellcheck="false"></form>
            <div class="br-tiles"></div>
            <p class="br-tip">Search opens in a real tab. YouTube and Spotify links play right here.</p>
          </div>`;
        const tiles = t.page.querySelector('.br-tiles');
        SHORTCUTS.forEach(s => {
          const b = document.createElement('button');
          b.className = 'br-tile';
          b.innerHTML = `<span style="background:${s.color}">${esc(s.letter)}</span><b>${esc(s.name)}</b>`;
          b.addEventListener('click', () => s.inside ? navigate(t, s.url, true) : navigate(t, s.url, true));
          tiles.appendChild(b);
        });
        const f = t.page.querySelector('.br-big');
        f.addEventListener('submit', e => { e.preventDefault(); go(f.querySelector('input').value); });
        f.querySelector('input').addEventListener('keydown', e => e.stopPropagation());
        setTimeout(() => { if (cur === t) f.querySelector('input').focus(); }, 200);
      }

      $('.br-addr').addEventListener('submit', e => { e.preventDefault(); go($('.br-addr input').value); });
      $('.br-addr input').addEventListener('keydown', e => e.stopPropagation());
      $('.br-addr input').addEventListener('focus', e => e.target.select());
      $('.br-newtab').addEventListener('click', () => newTab());
      win.body.querySelectorAll('.br-b').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.b;
        if (k === 'back' && cur.at > 0){ cur.at--; navigate(cur, cur.hist[cur.at], false); }
        if (k === 'fwd' && cur.at < cur.hist.length - 1){ cur.at++; navigate(cur, cur.hist[cur.at], false); }
        if (k === 'reload') navigate(cur, cur.hist[cur.at] || 'newtab', false);
        if (k === 'out'){ const u = cur.hist[cur.at]; if (u && u !== 'newtab') realTab(u); }
      }));
      $('.br-note button').addEventListener('click', () => { const u = cur.hist[cur.at]; if (u && u !== 'newtab') realTab(u); });

      newTab(url ? (normalize(url) || url) : 'newtab');
      if (query) go(String(query));
    },
  });
}