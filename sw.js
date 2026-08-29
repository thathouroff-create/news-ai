const CACHE_NAME = 'news-ai-v3.1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css?v=3.1',
  './app.js?v=3.1',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

// Install — cache shell, skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge ALL old caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // External API calls (RSS, currency, weather, translate) — Network First with timeout
  if (url.origin !== location.origin) {
    event.respondWith(
      new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('timeout')), 5000);
        fetch(event.request)
          .then(response => {
            clearTimeout(timeoutId);
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            }
            resolve(response);
          })
          .catch(err => {
            clearTimeout(timeoutId);
            reject(err);
          });
      }).catch(() => caches.match(event.request, { ignoreSearch: true }).then(r =>
        r || new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      ))
    );
    return;
  }

  // Static assets — Network First with timeout (ensures updates arrive on phones quickly or fallbacks to cache)
  event.respondWith(
    new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('timeout')), 4000); // 4 sec timeout for static assets
      fetch(event.request)
        .then(response => {
          clearTimeout(timeoutId);
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          resolve(response);
        })
        .catch(err => {
          clearTimeout(timeoutId);
          reject(err);
        });
    }).catch(() => caches.match(event.request, { ignoreSearch: true })) // ignoreSearch for PWA parameters
  );
});
