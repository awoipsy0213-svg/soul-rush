const PREFIX = 'soul-rush:' + self.registration.scope + ':';
const CACHE = PREFIX + '0.4.2';
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./assets/CREDITS.html","./assets/art/meadow.jpg","./assets/art/desert.png","./assets/art/mountain.png","./assets/art/swamp.png","./assets/art/tower.png","./assets/art/parchment.png","./assets/art/golden-border.png","./assets/icons/might.svg","./assets/icons/haste.svg","./assets/icons/spark.svg","./assets/icons/burst.svg","./assets/icons/feast.svg","./assets/icons/pierce.svg","./assets/icons/pulse.svg","./assets/icons/moss.svg","./assets/icons/fang.svg","./assets/icons/golem.svg","./assets/icons/wyrm.svg","./assets/icons/world.svg","./assets/icons/build.svg","./assets/icons/shop.svg","./assets/icons/codex.svg","./assets/icons/mission.svg"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => { const cache = await caches.open(CACHE); const saved = await cache.match(req,{ignoreSearch:true}); if(saved)return saved; const url=new URL(req.url); if(url.pathname===new URL('./',self.registration.scope).pathname||url.pathname===new URL('./index.html',self.registration.scope).pathname)return cache.match('./index.html'); return new Response('Offline: page not cached',{status:503}); }));
  } else {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(req)).then(cached => cached || fetch(req)));
  }
});
