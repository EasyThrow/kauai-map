// "Before you go" card: add the site to the Home Screen, save the map for offline use,
// and download Kauai in Apple Maps or Google Maps for offline directions.
import { TILES, KAUAI_BOUNDS } from '../config.js';
import { isApplePlatform } from '../format.js';
import { toast } from './toast.js';

const APPLE = isApplePlatform();
const STANDALONE =
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const SAVED_KEY = 'kauai-map:offline-saved';
const MIN_ZOOM = 8;
const MAX_ZOOM = 14; // the map's data stops here; closer zooms reuse these tiles
const FONTS = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
const GLYPH_RANGES = ['0-255', '256-511', '512-767']; // Latin, macrons (ā), ʻokina

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function steps(items) {
  const ol = el('ol', 'offline-steps');
  for (const s of items) ol.append(el('li', null, s));
  return ol;
}

// Web Mercator tile numbers covering a lng/lat box.
const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
export function tileList([[w, s], [e, n]], minZ = MIN_ZOOM, maxZ = MAX_ZOOM) {
  const out = [];
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = tileX(w, z); x <= tileX(e, z); x++) {
      for (let y = tileY(n, z); y <= tileY(s, z); y++) out.push([z, x, y]);
    }
  }
  return out;
}

async function saveMap(onProgress) {
  const tilejson = await (await fetch(TILES.openFreeMap)).json();
  const template = tilejson.tiles[0];
  const urls = [
    ...tileList(KAUAI_BOUNDS).map(([z, x, y]) => template.replace('{z}', z).replace('{x}', x).replace('{y}', y)),
    ...FONTS.flatMap((f) => GLYPH_RANGES.map((r) => TILES.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r))),
  ];
  let done = 0;
  let failed = 0;
  const queue = [...urls];
  // A few at a time, to be gentle on the free tile server and on phones.
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetch(url);
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { total: urls.length, failed };
}

export function offlineCard() {
  const card = el('section', 'cond-section offline-card');
  card.append(el('h2', 'cond-h2', 'Before you go'));

  // 1. Home Screen
  if (!STANDALONE) {
    card.append(el('h3', 'offline-h3', 'Add this map to your Home Screen'));
    card.append(
      steps(
        APPLE
          ? ['In Safari, tap the Share button.', 'Tap Add to Home Screen, then Add.', 'Open it from the new icon and enter the trip password once. Tick Remember this device.']
          : ['In Chrome, tap the ⋮ menu.', 'Tap Add to Home screen (or Install app).', 'Open it from the new icon and enter the trip password once. Tick Remember this device.'],
      ),
    );
  }

  // 2. Save the map
  card.append(el('h3', 'offline-h3', 'Save the map for no-signal areas'));
  card.append(
    el(
      'p',
      null,
      'Parts of the island (Waimea Canyon, the north shore past Hanalei) have little or no signal. This saves the whole island map (about 5 MB) so it works anyway.',
    ),
  );
  const status = el('p', 'offline-status');
  let saved = null;
  try {
    saved = Number(localStorage.getItem(SAVED_KEY)) || null;
  } catch {
    /* fine */
  }
  if (saved) status.textContent = `Saved on this device on ${new Date(saved).toLocaleDateString()}.`;
  const supported = 'serviceWorker' in navigator && 'caches' in window;
  const button = el('button', 'btn btn-primary', saved ? 'Save again' : 'Save map for offline');
  button.type = 'button';
  button.disabled = !supported;
  if (!supported) status.textContent = 'This browser can’t save the map. The Apple Maps or Google Maps download below still works.';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      // The service worker stores what passes through it; wait until it's in charge.
      await navigator.serviceWorker.ready;
      const { total, failed } = await saveMap((done, all) => {
        status.textContent = `Saving… ${Math.round((done / all) * 100)}%`;
      });
      if (failed > total * 0.05) {
        status.textContent = `Saved most of it, but ${failed} pieces failed. Try again on better Wi-Fi.`;
      } else {
        try {
          localStorage.setItem(SAVED_KEY, String(Date.now()));
        } catch {
          /* fine */
        }
        status.textContent = 'Saved. The map, spots, plan and stay info now work with no signal.';
        toast('Map saved for offline use');
      }
    } catch (err) {
      console.warn(err);
      status.textContent = 'Saving failed. Check the connection and try again.';
    } finally {
      button.disabled = false;
      button.textContent = 'Save again';
    }
  });
  card.append(button, status);

  // 3. Offline directions
  card.append(el('h3', 'offline-h3', APPLE ? 'Download Kauai in Apple Maps' : 'Download Kauai in Google Maps'));
  card.append(el('p', null, 'For turn-by-turn directions with no signal (the map above can show where you are going, but can’t give directions).'));
  if (APPLE) {
    card.append(
      steps([
        'Open Apple Maps (iOS 17 or later) and tap your profile picture or initials.',
        'Tap Offline Maps, then Download New Map.',
        'Search for Kauai, adjust the box to cover the whole island, and tap Download.',
      ]),
    );
    const a = el('a', 'btn', 'Open Kauai in Apple Maps');
    a.href = 'https://maps.apple.com/?ll=22.05,-159.52&z=10';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    card.append(a);
  } else {
    card.append(
      steps([
        'Open Google Maps and search for Kauai.',
        'Tap your profile picture, then Offline maps, then Select your own map.',
        'Fit the whole island in the box and tap Download.',
      ]),
    );
  }
  return card;
}
