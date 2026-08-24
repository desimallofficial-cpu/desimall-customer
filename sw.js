const CACHE_NAME = 'desimall-cache-v0323';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req, {cache:'no-store'})
        .catch(() => caches.match(req))
    );
    return;
  }

  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(req, {cache:'no-store'})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(caches.match(req).then(c => c || fetch(req)));
});
