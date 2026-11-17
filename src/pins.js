// Category pins: colored teardrops with a white Tabler icon, clustered at low zoom,
// and fanned out slightly at high zoom where spots sit almost on top of each other.
import { CATEGORIES } from './config.js';

import beach from '../icons/beach.svg?raw';
import scubaMask from '../icons/scuba-mask.svg?raw';
import mountain from '../icons/mountain.svg?raw';
import ticket from '../icons/ticket.svg?raw';
import kitchen from '../icons/tools-kitchen-2.svg?raw';
import home from '../icons/home.svg?raw';
import cart from '../icons/shopping-cart.svg?raw';

export const ICON_SVG = {
  beach,
  'scuba-mask': scubaMask,
  mountain,
  ticket,
  'tools-kitchen-2': kitchen,
  home,
  'shopping-cart': cart,
};

export const SOURCE = 'spots';
const CLUSTER_MAX_ZOOM = 14;
// Pins closer than this (meters) get fanned out once clusters break apart.
const NEAR_METERS = 120;
const FAN_RADIUS_PX = 22;

// Pin size in CSS pixels; drawn at 2x for sharp rendering on phones.
const PIN_W = 36;
const PIN_H = 46;
const RATIO = 2;

function loadSvg(svg, color) {
  const tinted = svg.replace(/currentColor/g, color).replace(/stroke-width="2"/, 'stroke-width="2.25"');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tinted);
  return img.decode().then(() => img);
}

async function makePinImage({ color, icon }, { dashed = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_W * RATIO;
  canvas.height = PIN_H * RATIO;
  const ctx = canvas.getContext('2d');
  ctx.scale(RATIO, RATIO);

  const pin = new Path2D('M18 44 C14 38 3.5 28 3.5 17.5 A14.5 14.5 0 1 1 32.5 17.5 C32.5 28 22 38 18 44 Z');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.fill(pin);
  ctx.restore();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.stroke(pin);

  const glyph = await loadSvg(ICON_SVG[icon], '#ffffff');
  ctx.drawImage(glyph, 8.5, 8, 19, 19);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function addPinImages(map) {
  await Promise.all(
    Object.entries(CATEGORIES).map(async ([key, cat]) => {
      map.addImage(`pin-${key}`, await makePinImage(cat), { pixelRatio: RATIO });
      map.addImage(`pin-${key}-unverified`, await makePinImage(cat, { dashed: true }), { pixelRatio: RATIO });
    }),
  );
}

function metersBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Group spots that sit within NEAR_METERS of each other and give each member of a
// group a pixel offset around a small circle.
function fanOffsets(spots) {
  const parent = spots.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      if (metersBetween(spots[i], spots[j]) < NEAR_METERS) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  spots.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  const offsets = spots.map(() => [0, 0]);
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Stable order: west to east so the fan matches the real layout.
    members.sort((a, b) => spots[a].lng - spots[b].lng);
    members.forEach((idx, k) => {
      const angle = Math.PI + (k / members.length) * 2 * Math.PI;
      offsets[idx] = [Math.round(Math.cos(angle) * FAN_RADIUS_PX), Math.round(Math.sin(angle) * FAN_RADIUS_PX)];
    });
  }
  return offsets;
}

export function toGeoJSON(spots) {
  const offsets = fanOffsets(spots);
  return {
    type: 'FeatureCollection',
    features: spots.map((s, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name || s.id,
        // Rows with an unknown category only reach the map in debug view; draw them as activity.
        primary: CATEGORIES[s.primary] ? s.primary : 'activity',
        categories: s.categories.join('|'),
        verified: s.verified,
        skipped: Boolean(s.skipped),
        offset: offsets[i],
      },
    })),
  };
}

// debug: dashed outline for unverified pins, red ring on skipped rows, name labels.
export function addSpotLayers(map, spots, { debug = false } = {}) {
  map.addSource(SOURCE, {
    type: 'geojson',
    data: toGeoJSON(spots),
    cluster: true,
    clusterRadius: 34,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    promoteId: 'id',
  });

  // Clusters: white disc with the accent ring and a count. 40px across for easy tapping.
  map.addLayer({
    id: 'cluster',
    type: 'circle',
    source: SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': 20,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#1ba684',
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 15,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#1a1a1a' },
  });

  const pinImage = ['concat', 'pin-', ['get', 'primary']];
  const offset = ['step', ['zoom'], ['literal', [0, 0]], CLUSTER_MAX_ZOOM + 1, ['get', 'offset']];

  if (debug) {
    // Red ring at the real coordinate of rows that viewers don't see.
    map.addLayer({
      id: 'spot-skipped',
      type: 'circle',
      source: SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['get', 'skipped']],
      paint: {
        'circle-radius': 16,
        'circle-color': 'rgba(214, 40, 40, 0.15)',
        'circle-stroke-color': '#d62828',
        'circle-stroke-width': 3,
      },
    });
  }

  map.addLayer({
    id: 'spot-pin',
    type: 'symbol',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': debug
        ? ['case', ['get', 'verified'], pinImage, ['concat', pinImage, '-unverified']]
        : pinImage,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-offset': offset,
      // Home base sits under everything else.
      'symbol-sort-key': ['match', ['get', 'primary'], 'home', 0, 1],
    },
  });

  if (debug) {
    map.addLayer({
      id: 'spot-label',
      type: 'symbol',
      source: SOURCE,
      minzoom: 11,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.3],
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': ['case', ['get', 'skipped'], '#d62828', '#1a1a1a'],
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }
}

// Replace the spots on the map (used by filters). Rebuilding the data, rather than
// hiding layers, keeps cluster counts honest.
export function setSpots(map, spots) {
  map.getSource(SOURCE).setData(toGeoJSON(spots));
}

// Taps hit the nearest pin within a generous box, so small thumbs still land on it.
const TAP_SLOP = 10;

export function wireSpotClicks(map, { onSpot, onEmpty, isBusy }) {
  map.on('click', (e) => {
    // Another tool (e.g. picking a spot to suggest) owns this tap.
    if (isBusy?.()) return;
    const { x, y } = e.point;
    const box = [
      [x - TAP_SLOP, y - TAP_SLOP],
      [x + TAP_SLOP, y + TAP_SLOP],
    ];
    const [cluster] = map.queryRenderedFeatures(box, { layers: ['cluster'] });
    if (cluster) {
      map
        .getSource(SOURCE)
        .getClusterExpansionZoom(cluster.properties.cluster_id)
        .then((zoom) => map.easeTo({ center: cluster.geometry.coordinates, zoom: zoom + 0.5 }));
      return;
    }
    const [pin] = map.queryRenderedFeatures(box, { layers: ['spot-pin'] });
    if (pin) onSpot(pin.properties.id);
    else onEmpty?.();
  });

  for (const layer of ['cluster', 'spot-pin']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
}
