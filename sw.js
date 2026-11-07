const CACHE_NAME = 'news-ai-v4.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css?v=4.0',
  './app.js?v=4.0',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Never intercept cross-origin images with JSON fallbacks; let browser handle <img> natively
  if (event.request.destination === 'image' && new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  const url = new URL(event.request.url);

  // Canonicalize ./data/latest.json?t=... so CacheStorage holds only the newest snapshot
  if (url.origin === self.location.origin && url.pathname.endsWith('/data/latest.json')) {
    const canonicalReq = new Request(url.origin + url.pathname);
    event.respondWith(
      fetchWithTimeout(event.request, 4500)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(canonicalReq, clone));
          }
          return response;
        })
        .catch(() => caches.match(canonicalReq).then((r) =>
          r || new Response(JSON.stringify({ error: 'offline', data: {} }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          })
        ))
    );
    return;
  }

  // External API calls (currency, weather, translate, RSS fallback)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetchWithTimeout(event.request, 5000)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }).then((r) =>
          r || new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          })
        ))
    );
    return;
  }

  // Same-origin static shell assets — Network-First with fast fallback to cache
  event.respondWith(
    fetchWithTimeout(event.request, 3500)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((r) =>
        r || caches.match('./index.html')
      ))
  );
});
