const CACHE_NAME = 'leanpay-v1';
const assets = ['/login.html', '/icon.png', '/echange.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(response => response || fetch(e.request)));
});

