const CACHE = 'eg-delivery-v1';
const ASSETS = ['/', '/admin', '/static/js/main.chunk.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/']))));
self.addEventListener('fetch', e => e.respondWith(
  caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/')))
));
