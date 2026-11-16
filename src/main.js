import { createMap } from './map.js';
import { DATA_URL } from './config.js';
import { loadSpots } from './data.js';
import { addPinImages, addSpotLayers, wireSpotClicks } from './pins.js';

const map = createMap('map');

// Exposed only for local debugging in the browser console.
if (import.meta.env.DEV) window.__map = map;

map.on('load', async () => {
  try {
    const [spots] = await Promise.all([loadSpots(DATA_URL), addPinImages(map)]);
    const placeable = spots.filter((s) => s.lat != null && s.lng != null && s.id);
    addSpotLayers(map, placeable);
    wireSpotClicks(map, {
      // The popup / bottom sheet arrives in the next step.
      onSpot: (id) => console.info('spot tapped:', id),
    });
    if (import.meta.env.DEV) window.__spots = placeable;
  } catch (err) {
    console.error(err);
  }
});
