// HomeGo portal stability release 2026-09-16. No database or browser storage migration.
const CACHE_PREFIX = 'homego-erp-portal-';
const CACHE_NAME = CACHE_PREFIX + 'v13-stability-20260916';
const ASSETS = ['./', './index.html', './manifest.json'].map(path => new URL(path, self.registration.scope).href);
const ALLOWED = new Set(ASSETS);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.search || !ALLOWED.has(url.href)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') {
        try { const cache = await caches.open(CACHE_NAME); await cache.put(event.request, response.clone()); } catch { /* A full cache must not discard a valid response. */ }
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const saved = await cache.match(event.request);
      if (saved) return saved;
      throw error;
    }
  })());
});
