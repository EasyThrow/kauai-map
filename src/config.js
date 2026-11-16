// Single place for settings. The Sheet URL is injected at build time (see later steps).

export const KAUAI_BOUNDS = [
  [-159.8, 21.85], // southwest
  [-159.28, 22.25], // northeast
];

// Initial frame: the whole island, north and south shores visible on a portrait phone.
export const INITIAL_BOUNDS = [
  [-159.79, 21.87],
  [-159.29, 22.24],
];

// Panning limit, with a margin so the island never feels pinned to an edge.
export const MAX_BOUNDS = [
  [-160.6, 21.4],
  [-158.5, 22.7],
];

export const TILES = {
  openFreeMap: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  terrain: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};
