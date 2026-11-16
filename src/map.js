import { buildStyle, addShieldImage } from './style.js';
import { INITIAL_BOUNDS, MAX_BOUNDS } from './config.js';

/* global maplibregl */

// Room for the title + filter chips on top, the List button below (phone),
// and edge town labels (Kapaa, Kekaha) on the sides.
const FIT_PADDING = window.matchMedia('(min-width: 900px)').matches
  ? { top: 80, bottom: 40, left: 36, right: 36 }
  : { top: 112, bottom: 116, left: 36, right: 36 };

export function createMap(container) {
  const map = new maplibregl.Map({
    container,
    style: buildStyle(),
    bounds: INITIAL_BOUNDS,
    fitBoundsOptions: { padding: FIT_PADDING },
    maxBounds: MAX_BOUNDS,
    minZoom: 8,
    maxZoom: 17,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });

  map.touchZoomRotate.disableRotation();

  map.on('styleimagemissing', (e) => {
    if (e.id === 'shield' && !map.hasImage('shield')) addShieldImage(map);
  });

  map.addControl(new RecenterControl(), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  // Bottom-left keeps the required credits clear of the desktop side panel.
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  return map;
}

export function recenter(map) {
  map.fitBounds(INITIAL_BOUNDS, { padding: FIT_PADDING, duration: 800 });
}

// "Whole island" button, styled like the zoom buttons.
class RecenterControl {
  onAdd(map) {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Show the whole island';
    btn.setAttribute('aria-label', 'Show the whole island');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v2M16 20h2a2 2 0 0 0 2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>';
    btn.addEventListener('click', () => recenter(map));
    this.container.append(btn);
    return this.container;
  }
  onRemove() {
    this.container.remove();
  }
}
