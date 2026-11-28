const PREFIX = 'soul-rush:' + self.registration.scope + ':';
const CACHE = PREFIX + '0.15.0';
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./assets/CREDITS.html","./assets/art/meadow.jpg","./assets/art/desert.png","./assets/art/mountain.png","./assets/art/swamp.png","./assets/art/tower.png","./assets/art/parchment.png","./assets/art/golden-border.png","./assets/icons/might.svg","./assets/icons/haste.svg","./assets/icons/spark.svg","./assets/icons/burst.svg","./assets/icons/feast.svg","./assets/icons/pierce.svg","./assets/icons/pulse.svg","./assets/icons/moss.svg","./assets/icons/fang.svg","./assets/icons/golem.svg","./assets/icons/wyrm.svg","./assets/icons/world.svg","./assets/icons/build.svg","./assets/icons/shop.svg","./assets/icons/codex.svg","./assets/icons/mission.svg","./assets/portraits/moss.webp","./assets/portraits/fang.webp","./assets/portraits/golem.webp","./assets/portraits/wyrm.webp","./assets/audio/guild.ogg","./assets/audio/battle.ogg"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => { const cache = await caches.open(CACHE); const saved = await cache.match(req,{ignoreSearch:true}); if(saved)return saved; const url=new URL(req.url); if(url.pathname===new URL('./',self.registration.scope).pathname||url.pathname===new URL('./index.html',self.registration.scope).pathname)return cache.match('./index.html'); return new Response('Offline: page not cached',{status:503}); }));
  } else {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(req)).then(async cached => {
      if(!cached)return fetch(req);
      const range=req.headers.get('Range');
      if(range&&new URL(req.url).pathname.endsWith('.ogg')){
        const m=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(!m||(!m[1]&&!m[2]))return cached;
        const data=await cached.arrayBuffer(),size=data.byteLength;
        const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
        const end=m[1]&&m[2]?Math.min(size-1,Number(m[2])):size-1;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
        return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/ogg','Accept-Ranges':'bytes','Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':String(end-start+1)}});
      }
      return cached;
    }));
  }
});
