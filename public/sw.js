/*
 * Our Room — the service worker.
 *
 *  1. Lets the site be installed on a phone's home screen and open fast:
 *     the built files (which never change once built) and the 3D room are
 *     kept in a cache; pages always try the network first so you never get
 *     a stale version.
 *  2. Shows "she left you something" notifications even when the site is
 *     closed (web push), and opens the room when you tap one.
 */
const CACHE = 'ourroom-v1';
const KEEP = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(KEEP)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                // Supabase, YouTube, Spotify: straight to the network

  // built files have a content hash in their name, and the room model rarely changes: cache first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/models/') || url.pathname.startsWith('/icons/')){
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // the page itself: always the newest, the cached copy only when offline
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        (await caches.open(CACHE)).put('/', res.clone());
        return res;
      } catch(_){
        return (await caches.match('/')) || Response.error();
      }
    })());
  }
});

/* ---------- notifications ---------- */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_){ data = { body: e.data && e.data.text() }; }
  const title = data.title || 'Our Room';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Something new is waiting for you.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'ourroom',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins){ if ('focus' in w){ w.focus(); return; } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});