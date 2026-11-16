import { createMap } from './map.js';
import { DATA_URL } from './config.js';
import { loadSpots } from './data.js';
import { addPinImages, addSpotLayers, wireSpotClicks } from './pins.js';
import { readHash, writeHash, onHashChange } from './hash.js';
import { createSheet } from './ui/sheet.js';
import { wireTooltip } from './ui/tooltip.js';

// Zoom at which clusters have broken apart, so a deep-linked pin is visible.
const SPOT_ZOOM = 15;

const map = createMap('map');

// Exposed only for local debugging in the browser console.
if (import.meta.env.DEV) window.__map = map;

map.on('load', async () => {
  try {
    const [spots] = await Promise.all([loadSpots(DATA_URL), addPinImages(map)]);
    const placeable = spots.filter((s) => s.lat != null && s.lng != null && s.id);
    const spotsById = new Map(placeable.map((s) => [s.id, s]));
    addSpotLayers(map, placeable);

    const sheet = createSheet({ onClose: () => writeHash({ spot: null }) });

    function select(id, { zoomIn = false, animate = true } = {}) {
      const spot = spotsById.get(id);
      if (!spot) return;
      sheet.open(spot);
      writeHash({ spot: id });
      const { bottom, right } = sheet.obscured();
      const move = {
        center: [spot.lng, spot.lat],
        zoom: zoomIn ? Math.max(map.getZoom(), SPOT_ZOOM) : map.getZoom(),
        // Shift the pin into the part of the map the sheet doesn't cover.
        offset: [-right / 2, -bottom / 2],
      };
      // jumpTo ignores offset, so an instant move is a zero-length easeTo.
      map.easeTo({ ...move, duration: animate ? 600 : 0 });
    }

    wireSpotClicks(map, {
      onSpot: (id) => select(id),
      onEmpty: () => sheet.hide(),
    });
    wireTooltip(map, spotsById);

    // Deep links: #spot=koloa-landing
    const { spot } = readHash();
    if (spot) select(spot, { zoomIn: true, animate: false });
    onHashChange(({ spot: id }) => {
      if (id && id !== sheet.currentId) select(id, { zoomIn: true });
      else if (!id) sheet.hide({ silent: true });
    });

    if (import.meta.env.DEV) window.__spots = placeable;
  } catch (err) {
    console.error(err);
  }
});
