// Desktop-only hover tooltip: name and drive time.
import { formatDrive } from '../format.js';

/* global maplibregl */

export function wireTooltip(map, spotsById) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: [0, -46],
    className: 'spot-tooltip',
    maxWidth: '260px',
  });

  map.on('mousemove', 'spot-pin', (e) => {
    const f = e.features[0];
    const spot = spotsById.get(f.properties.id);
    if (!spot) return;
    const box = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = spot.name;
    box.append(name);
    const drive = formatDrive(spot.driveMin);
    if (drive) {
      const d = document.createElement('div');
      d.textContent = drive;
      box.append(d);
    }
    popup.setLngLat(f.geometry.coordinates).setDOMContent(box).addTo(map);
  });
  map.on('mouseleave', 'spot-pin', () => popup.remove());
}
