// HomeGo ERP Portal Service Worker v11
const CACHE_NAME = 'homego-erp-portal-v11';
const ASSETS_TO_CACHE = ['./','./index.html','./manifest.json'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.href.includes('script.google.com') || url.href.includes('firebase') || url.href.includes('googleapis') || url.href.includes('allorigins') || url.href.includes('corsproxy')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
