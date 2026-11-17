// Offline support. Keeps copies of what the site uses so it opens with no signal:
// - the (password-protected) page: newest from the network, saved copy when offline
// - map libraries and fonts: saved copy first (their addresses include a version)
// - map tiles: saved copy first, stored under a version-free key so a weekly map data
//   update doesn't make the saved island unusable
// - Sheet tabs and conditions: newest from the network, saved copy when offline
// Nothing here sends data anywhere; form answers (POST) pass straight through.

const VERSION = 'v1';
const PAGE = `page-${VERSION}`;
const STATIC = `static-${VERSION}`;
const TILES = `tiles-${VERSION}`;
const DATA = `data-${VERSION}`;
const KEEP = [PAGE, STATIC, TILES, DATA];
const MAX_TILES = 2500;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(PAGE).then((c) => c.addAll(['./']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// Network first; on failure (or after `timeoutMs`), the saved copy.
async function networkFirst(request, cacheName, { key = request, timeoutMs = 0 } = {}) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  try {
    if (!timeoutMs) return await network;
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), timeoutMs)),
    ]);
  } catch (err) {
    const saved = await cache.match(key);
    if (saved) return saved;
    return network; // still waiting, or the real error
  }
}

async function cacheFirst(request, cacheName, { key = request, limit = 0 } = {}) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(key);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(key, res.clone());
    if (limit) trim(cache, limit);
  }
  return res;
}

let trimming = false;
async function trim(cache, limit) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    // Oldest first; drop a batch so this doesn't run on every tile.
    if (keys.length > limit) for (const k of keys.slice(0, keys.length - limit + 200)) await cache.delete(k);
  } finally {
    trimming = false;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // The site itself (only our own pages, not embedded maps like Windy).
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, PAGE, { key: new URL('./', self.location).href, timeoutMs: 4000 }));
    return;
  }

  // Map tiles: /planet/<data version>/z/x/y.pbf -> keyed without the version.
  if (url.hostname === 'tiles.openfreemap.org') {
    const m = url.pathname.match(/^\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/);
    if (m) {
      event.respondWith(cacheFirst(request, TILES, { key: `https://tiles.openfreemap.org/planet/${m[1]}`, limit: MAX_TILES }));
      return;
    }
    if (url.pathname.startsWith('/fonts/')) {
      event.respondWith(cacheFirst(request, STATIC));
      return;
    }
    // TileJSON (says which data version is current)
    event.respondWith(networkFirst(request, DATA, { timeoutMs: 4000 }));
    return;
  }

  // Versioned libraries and web fonts
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(networkFirst(request, STATIC, { timeoutMs: 3000 }));
    return;
  }

  // Our own files (terrain images, icons, manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, STATIC, { timeoutMs: 4000 }));
    return;
  }

  // Sheet tabs and conditions: always try for fresh data first.
  if (
    url.hostname === 'docs.google.com' ||
    url.hostname === 'api.weather.gov' ||
    url.hostname === 'api.tidesandcurrents.noaa.gov'
  ) {
    event.respondWith(networkFirst(request, DATA, { timeoutMs: 5000 }));
  }
});
