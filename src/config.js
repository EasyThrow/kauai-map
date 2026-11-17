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

// Where spot data comes from: the published Google Sheet (CSV).
// Set VITE_SHEET_CSV_URL in .env.local for local work; the deploy workflow injects it
// from the SHEET_CSV_URL repository secret. It is never committed.
// Local fallback when the Sheet isn't set up: the gitignored seed file.
export const SHEET_CSV_URL = import.meta.env.VITE_SHEET_CSV_URL || '';
export const DATA_URL = SHEET_CSV_URL || (import.meta.env.DEV ? '/data/seed.csv' : '');

// Other tabs of the same published Sheet. Each published tab has the same link with a
// different gid (the number after "gid=" when the tab is open in Google Sheets).
// A gid alone reveals nothing, so these live in the code (src/sheet-tabs.json, which the
// snapshot script reads too).
import SHEET_TABS from './sheet-tabs.json';
export { SHEET_TABS };

export function tabCsvUrl(gid) {
  if (!SHEET_CSV_URL || !gid) return '';
  try {
    const u = new URL(SHEET_CSV_URL);
    u.searchParams.set('gid', gid);
    u.searchParams.set('single', 'true');
    u.searchParams.set('output', 'csv');
    return u.href;
  } catch {
    return '';
  }
}

// Plan tab: live Sheet tab, or a local example file while developing.
export const PLAN_URL = tabCsvUrl(SHEET_TABS.plan) || (import.meta.env.DEV ? '/data/plan-example.csv' : '');

// Google Form "pre-filled link" with the answers to the latitude and longitude
// questions set to LAT and LNG. Same handling as the Sheet URL: .env.local locally,
// SUGGEST_FORM_URL secret at deploy, never committed. No URL = no Suggest button.
export const SUGGEST_FORM_URL = import.meta.env.VITE_SUGGEST_FORM_URL || '';

// Give up on the live Sheet after this long and show the saved snapshot.
export const FETCH_TIMEOUT_MS = 6000;

// One color and one Tabler icon per category. Order here is the order of filter chips.
export const CATEGORIES = {
  beach: { label: 'Beaches', color: '#e39b2d', icon: 'beach' },
  snorkel: { label: 'Snorkel', color: '#1f7fc1', icon: 'scuba-mask' },
  hike: { label: 'Hikes', color: '#8b5e34', icon: 'mountain' },
  activity: { label: 'Activities', color: '#8e4fb5', icon: 'ticket' },
  restaurant: { label: 'Food', color: '#d4473f', icon: 'tools-kitchen-2' },
  home: { label: 'Home base', color: '#23302a', icon: 'home' },
};

export const TAGS = [
  'reservation-required',
  'winter-caution',
  'calm-days-only',
  'go-early',
  'fee',
  'check-status',
  'lifeguard',
];

export const TILES = {
  openFreeMap: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  // Terrain is pre-baked into public/terrain/ by scripts/bake-terrain.mjs.
};
