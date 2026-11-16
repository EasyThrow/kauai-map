import { buildStyle, addShieldImage } from './style.js';
import { INITIAL_BOUNDS, MAX_BOUNDS } from './config.js';

/* global maplibregl */

// Room for the title bar on top and for edge town labels (Kapaa, Kekaha) on the sides.
const FIT_PADDING = { top: 64, bottom: 24, left: 36, right: 36 };

export function createMap(container) {
  const map = new maplibregl.Map({
    container,
    style: buildStyle(),
    bounds: INITIAL_BOUNDS,
    fitBoundsOptions: { padding: FIT_PADDING },
    maxBounds: MAX_BOUNDS,
    minZoom: 8,
    maxZoom: 17,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });

  map.touchZoomRotate.disableRotation();

  map.on('styleimagemissing', (e) => {
    if (e.id === 'shield' && !map.hasImage('shield')) addShieldImage(map);
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  return map;
}

export function recenter(map) {
  map.fitBounds(INITIAL_BOUNDS, { padding: FIT_PADDING });
}
