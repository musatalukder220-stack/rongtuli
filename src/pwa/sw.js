/* RongTuli service worker: lets the installed app open without internet.
   Network first (so a new version always wins), saved copy only when offline.
   The big AI files (engine and models, folder "ai") never change, so they are kept once and served from the copy. */
const CACHE = 'rongtuli-__VERSION__';
const AI_CACHE = 'rongtuli-ai-1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AI_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/ai\/[^/]+\.(onnx|wasm)$/.test(url.pathname) || /\/ai\/ort\.wasm\.min\.js$/.test(url.pathname)) {
    e.respondWith(caches.open(AI_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
