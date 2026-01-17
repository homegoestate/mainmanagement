const CACHE_NAME = 'homego-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  // 如果你有 CSS 或 JS 檔案，請在下面加入路徑
  // './css/style.css',
  // './js/main.js'
];

// 安裝 Service Worker 並儲存靜態資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 攔截請求，優先從快取讀取資料
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // 如果快取有，就用快取；否則就去網路抓
      return response || fetch(event.request);
    })
  );
});

// 激活時清理舊的快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});
