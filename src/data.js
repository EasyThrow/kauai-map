/* global Papa */
import { DATA_URL, FETCH_TIMEOUT_MS } from './config.js';

// Snapshot of the Sheet downloaded by `npm run snapshot` at deploy time and bundled
// inside the (encrypted) page. Missing locally until a snapshot has been taken.
const SNAPSHOT = Object.values(
  import.meta.glob('../data/spots.csv', { query: '?raw', import: 'default', eager: true }),
)[0];

function parseCsv(text) {
  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return data.map(parseRow);
}

// A Sheet error page or sign-in page comes back as HTML, not our CSV.
const looksLikeSpotsCsv = (text) => /^﻿?\s*id\s*,/i.test(text);

async function fetchLive(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!looksLikeSpotsCsv(text)) throw new Error('Response is not the spots CSV');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Returns { spots, source } where source is 'live' (Sheet) or 'saved' (snapshot).
export async function loadSpots(url = DATA_URL) {
  if (url) {
    try {
      return { spots: parseCsv(await fetchLive(url)), source: 'live' };
    } catch (err) {
      console.warn('Live spot data unavailable, using saved snapshot.', err.message);
    }
  }
  if (SNAPSHOT) return { spots: parseCsv(SNAPSHOT), source: 'saved' };
  throw new Error('No spot data: the Sheet could not be loaded and no saved snapshot exists.');
}

const list = (value, sep) =>
  (value || '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

const num = (value) => {
  const n = Number(String(value ?? '').trim());
  return String(value ?? '').trim() === '' || Number.isNaN(n) ? null : n;
};

// "Waimea Shrimp Truck!" -> "waimea-shrimp-truck"
export const slugify = (name) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯʻ‘’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function parseRow(row) {
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, (v ?? '').trim()]));
  const get = (k) => r[k] ?? '';
  const primary = get('primary_category').toLowerCase();
  const categories = list(get('categories').toLowerCase(), '|');
  if (primary && !categories.includes(primary)) categories.unshift(primary);
  const name = get('name');
  const photoUrl = get('photo_url');
  return {
    // A blank id (e.g. a freshly approved suggestion) is made from the name.
    id: get('id') || slugify(name),
    idGenerated: !get('id'),
    name,
    primary,
    categories,
    region: get('region').toLowerCase(),
    lat: num(get('lat')),
    lng: num(get('lng')),
    coordPoint: get('coord_point'),
    verified: get('verified').toUpperCase() === 'Y',
    driveMin: num(get('drive_min')),
    notes: list(get('notes'), '//'),
    tags: list(get('tags').toLowerCase(), '|'),
    pricePp: num(get('price_pp')),
    links: list(get('links'), ';;')
      .map((pair) => {
        const i = pair.indexOf('|');
        return i < 0 ? null : { label: pair.slice(0, i).trim(), url: pair.slice(i + 1).trim() };
      })
      .filter(Boolean),
    photo: photoUrl ? { url: photoUrl, credit: get('photo_credit'), license: get('photo_license') } : null,
    sort: num(get('sort')),
  };
}
