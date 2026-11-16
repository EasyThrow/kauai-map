// MapLibre style matched to the reference image.
// Base data: OpenFreeMap (OpenMapTiles schema). Elevation: AWS Terrain Tiles (Terrarium).
import { TILES } from './config.js';

export const PALETTE = {
  deepWater: '#a9d8f2',
  midWater: '#c6e7f7',
  shoreWater: '#e8f6fc',
  coastLand: '#4f9a62',
  midLand: '#7fb487',
  highLand: '#c7ddc1',
  sand: '#eadfb4',
  mainRoad: '#e0603f',
  minorRoad: '#6e6e6e',
  river: '#3da2d8',
  parkLabel: '#1e6b3a',
  waterLabel: '#2479b8',
  townLabel: '#1a1a1a',
  accent: '#1ba684',
};

const P = PALETTE;
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name']];
const REGULAR = ['Noto Sans Regular'];
const BOLD = ['Noto Sans Bold'];
const ITALIC = ['Noto Sans Italic'];

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const TERRAIN_ATTRIBUTION =
  'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>';

const terrainSource = (attribution) => ({
  type: 'raster-dem',
  tiles: [TILES.terrain],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  ...(attribution ? { attribution } : {}),
});

// Flat color bands with a short blend at each edge, from [[startElevation, color], ...].
// Each color runs from its start elevation up to the next band's start.
function bands(stops, blend = 15) {
  const expr = ['interpolate', ['linear'], ['elevation']];
  stops.forEach(([start, color], i) => {
    if (i > 0) expr.push(start - blend, stops[i - 1][1]);
    expr.push(start, color);
  });
  return expr;
}

function parkLabel(id, minzoom, nameFilter, sizeLow, sizeHigh) {
  return {
    id,
    type: 'symbol',
    source: 'omt',
    'source-layer': 'park',
    minzoom,
    filter: ['all', ['has', 'name'], nameFilter],
    layout: {
      'text-field': NAME,
      'text-font': BOLD,
      'text-size': ['interpolate', ['linear'], ['zoom'], minzoom, sizeLow, 15, sizeHigh],
      'text-max-width': 7,
    },
    paint: {
      'text-color': P.parkLabel,
      'text-halo-color': 'rgba(255,255,255,0.75)',
      'text-halo-width': 1.2,
    },
  };
}

const roadWidth = (min, max) => [
  'interpolate', ['exponential', 1.5], ['zoom'],
  9, min,
  16, max,
];

export function buildStyle() {
  return {
    version: 8,
    name: 'Kauai Trip',
    glyphs: TILES.glyphs,
    sources: {
      omt: { type: 'vector', url: TILES.openFreeMap, attribution: ATTRIBUTION },
      terrain: terrainSource(TERRAIN_ATTRIBUTION),
      // Separate source instance for hillshade avoids a MapLibre warning about shared DEM sources.
      terrainShade: terrainSource(),
    },
    layers: [
      // Ocean blue underneath, so tiles that are still loading read as sea rather than land.
      { id: 'background', type: 'background', paint: { 'background-color': P.deepWater } },

      // Land elevation in flat bands like the reference: dark green coast to pale sage highlands.
      {
        id: 'land-elevation',
        type: 'color-relief',
        source: 'terrain',
        paint: { 'color-relief-color': bands([
          [0, P.coastLand],
          [150, '#62a771'],
          [400, P.midLand],
          [700, '#a2c8a0'],
          [1000, P.highLand],
        ]) },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrainShade',
        paint: {
          'hillshade-exaggeration': 0.2,
          'hillshade-shadow-color': 'rgba(20, 60, 35, 0.45)',
          'hillshade-highlight-color': 'rgba(255, 255, 255, 0.15)',
          'hillshade-accent-color': 'rgba(20, 60, 35, 0.1)',
        },
      },

      // Vector water is opaque so it gives a crisp coastline and hides any land shading
      // that bleeds offshore from the coarser elevation tiles.
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        paint: { 'fill-color': ['match', ['get', 'class'], 'ocean', P.shoreWater, P.midWater] },
      },
      // Ocean depth bands from bathymetry, drawn on top of the water; transparent at or above sea level.
      {
        id: 'sea-depth',
        type: 'color-relief',
        source: 'terrain',
        paint: {
          'color-relief-color': bands([
            [-10000, P.deepWater],
            [-600, P.midWater],
            [-40, 'rgba(0,0,0,0)'],
          ]),
          // Elevation tiles stop at zoom 14 and look blocky beyond it; fade to plain water.
          'color-relief-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 1, 14, 0],
        },
      },

      // Beaches as sand
      {
        id: 'sand',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'sand'],
        paint: { 'fill-color': P.sand, 'fill-opacity': 0.9 },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        filter: ['in', ['get', 'class'], ['literal', ['river', 'stream', 'canal']]],
        minzoom: 10,
        paint: {
          'line-color': P.river,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 2],
          'line-opacity': 0.8,
        },
      },

      // Roads
      {
        id: 'road-path',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
        paint: {
          'line-color': '#f3efe2',
          'line-width': 1,
          'line-dasharray': [2, 2],
          'line-opacity': 0.85,
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.minorRoad, 'line-width': roadWidth(0.4, 3), 'line-opacity': 0.75 },
      },
      {
        id: 'road-main',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': P.mainRoad, 'line-width': roadWidth(1.3, 5) },
      },

      // Labels
      {
        id: 'water-name',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        layout: {
          'text-field': NAME,
          'text-font': ITALIC,
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 13, 14],
          'text-letter-spacing': 0.1,
          'text-max-width': 8,
        },
        paint: {
          'text-color': P.waterLabel,
          'text-halo-color': 'rgba(255,255,255,0.6)',
          'text-halo-width': 1,
        },
      },
      // State parks show from the island view; reserves and preserves only once zoomed in.
      parkLabel('park-name-major', 9, ['in', 'State Park', NAME], 12, 15),
      parkLabel(
        'park-name-minor',
        12,
        ['all', ['!', ['in', 'State Park', NAME]], ['!', ['in', 'Marine', NAME]]],
        11,
        13,
      ),
      {
        id: 'peak',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'mountain_peak',
        minzoom: 11,
        filter: ['has', 'name'],
        layout: {
          'text-field': NAME,
          'text-font': ITALIC,
          'text-size': 11,
          'text-max-width': 8,
        },
        paint: {
          'text-color': P.parkLabel,
          'text-halo-color': 'rgba(255,255,255,0.7)',
          'text-halo-width': 1,
        },
      },
      {
        id: 'road-shield',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 10,
        filter: ['all', ['has', 'ref'], ['<=', ['get', 'ref_length'], 4]],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 400,
          'text-field': ['get', 'ref'],
          'text-font': BOLD,
          'text-size': 10,
          'text-rotation-alignment': 'viewport',
          'icon-image': 'shield',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [2, 6, 2, 6],
          'icon-rotation-alignment': 'viewport',
        },
        paint: { 'text-color': P.townLabel },
      },
      {
        id: 'town-dot',
        type: 'circle',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 13, 4],
          'circle-color': '#ffffff',
          'circle-stroke-color': P.townLabel,
          'circle-stroke-width': 1.2,
        },
        maxzoom: 14,
      },
      {
        id: 'town-name',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'hamlet']]],
        layout: {
          'text-field': NAME,
          'text-font': ['match', ['get', 'class'], ['city', 'town'], ['literal', BOLD], ['literal', REGULAR]],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            8, ['match', ['get', 'class'], ['city', 'town'], 12, 10],
            13, ['match', ['get', 'class'], ['city', 'town'], 15, 13],
          ],
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
          'text-radial-offset': 0.6,
          'text-justify': 'auto',
          'text-max-width': 8,
        },
        paint: {
          'text-color': P.townLabel,
          'text-halo-color': 'rgba(255,255,255,0.85)',
          'text-halo-width': 1.4,
        },
      },
    ],
  };
}

// White oval road-number shield, drawn at runtime so no sprite sheet is needed.
export function addShieldImage(map) {
  const ratio = 2;
  const w = 20 * ratio;
  const h = 16 * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const r = h / 2 - ratio;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.2 * ratio;
  ctx.beginPath();
  ctx.roundRect(ratio, ratio, w - 2 * ratio, h - 2 * ratio, r);
  ctx.fill();
  ctx.stroke();
  const data = ctx.getImageData(0, 0, w, h);
  map.addImage('shield', data, {
    pixelRatio: ratio,
    stretchX: [[r + ratio, w - r - ratio]],
    stretchY: [[h / 2 - 1, h / 2 + 1]],
    content: [r / 2 + ratio, ratio * 2, w - r / 2 - ratio, h - ratio * 2],
  });
}
