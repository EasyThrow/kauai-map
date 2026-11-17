/* global Papa */
import { DATA_URL, PLAN_URL, STAY_URL, INTEREST_URL, FETCH_TIMEOUT_MS } from './config.js';

// Snapshots of the Sheet tabs downloaded by `npm run snapshot` at deploy time and
// bundled inside the (encrypted) page. Missing locally until a snapshot has been taken.
const SNAPSHOTS = import.meta.glob('../data/{spots,plan,stay,interest}.csv', { query: '?raw', import: 'default', eager: true });
const snapshot = (name) => SNAPSHOTS[`../data/${name}.csv`];

// Rows as plain objects keyed by trimmed header, each with its Sheet row number
// (header is row 1) so warnings point at the right line.
export function parseCsvRows(text) {
  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return data.map((r, i) => ({ ...r, __row: i + 2 }));
}

// A Sheet error page or sign-in page comes back as HTML, not our CSV, so each tab is
// checked for its expected first column.
export const FIRST_COLUMN = { spots: 'id', plan: 'id', stay: 'name', interest: 'timestamp' };
const looksLikeOurCsv = (text, first) => new RegExp(`^\\uFEFF?\\s*"?${first}"?\\s*(,|\\r?\\n|$)`, 'i').test(text);

async function fetchLive(url, first) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!looksLikeOurCsv(text, first)) throw new Error(`Response is not a CSV starting with a ${first} column`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Live tab first, saved snapshot second. Returns { rows, source: 'live' | 'saved' | 'none' }.
export async function loadTab(url, name, { saved = true } = {}) {
  if (url) {
    try {
      return { rows: parseCsvRows(await fetchLive(url, FIRST_COLUMN[name] || 'id')), source: 'live' };
    } catch (err) {
      console.warn(`Live ${name} data unavailable, using saved snapshot.`, err.message);
    }
  }
  const copy = saved && snapshot(name);
  return copy ? { rows: parseCsvRows(copy), source: 'saved' } : { rows: [], source: 'none' };
}

// Returns { spots, source } where source is 'live' (Sheet) or 'saved' (snapshot).
export async function loadSpots(url = DATA_URL) {
  const { rows, source } = await loadTab(url, 'spots');
  if (source === 'none') throw new Error('No spot data: the Sheet could not be loaded and no saved snapshot exists.');
  return { spots: rows.map((r) => ({ ...parseRow(r), row: r.__row })), source };
}

// Raw Plan rows; src/plan.js turns them into events. An unset Plan tab is simply empty.
export async function loadPlanRows(url = PLAN_URL) {
  return loadTab(url, 'plan');
}

export const loadStayRows = (url = STAY_URL) => loadTab(url, 'stay');

// Re-fetched when the Who's in tab opens; the saved copy is only used on first load.
export const loadInterestRows = ({ saved = true } = {}) => loadTab(INTEREST_URL, 'interest', { saved });

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

// A Google Maps copy pasted whole into the lat cell, e.g. "21.88156, -159.47586",
// is split into lat and lng. Returns null when the cell holds a single number.
export function splitCoordPair(text) {
  const m = String(text).match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: m[1], lng: m[2] } : null;
}

export function parseRow(row) {
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '').trim()]));
  const pair = splitCoordPair(r.lat ?? '');
  if (pair) Object.assign(r, pair);
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
    verifiedRaw: get('verified'),
    driveMin: num(get('drive_min')),
    driveRaw: get('drive_min'),
    priceRaw: get('price_pp'),
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
