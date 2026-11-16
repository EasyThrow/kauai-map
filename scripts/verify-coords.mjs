// Coordinate check: compare each spot's lat/lng with OpenStreetMap and estimate the
// drive from the home base. Writes data/verification-report.md (gitignored).
//
//   npm run snapshot     (refresh data/spots.csv from the Sheet first)
//   npm run verify
//
// Nothing is written to the Sheet and nothing is marked verified: the report is for you
// to review, then fix rows in the Sheet and flip verified to Y yourself.
//
// Services (free, keyless; requests carry a generic client name and only place names
// and coordinates):
// - Nominatim (OpenStreetMap search), max 1 request per second per its usage policy
// - OSRM public demo router for drive times, used lightly for the same reason
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'kauai-trip-map/0.1 (personal static site; generic client)';
const VIEWBOX = '-159.80,22.25,-159.28,21.85'; // Kauai: west,north,east,south
const OK_M = 150;
const REVIEW_M = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function politeFetchJson(url) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Quote-aware CSV parser (handles commas, quotes and newlines inside quoted cells).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  const keys = head.map((h) => h.replace(/^﻿/, '').trim());
  return body.map((r, i) => ({ row: i + 2, ...Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? '').trim()])) }));
}

function coords(r) {
  const pair = r.lat.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  const lat = Number(pair ? pair[1] : r.lat);
  const lng = Number(pair ? pair[2] : r.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && r.lat !== '' ? { lat, lng } : null;
}

function meters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Search names to try, most specific first:
// "North Beach (Old Pier Beach)" -> full, "North Beach", "Old Pier Beach"
function queries(name) {
  const out = [name];
  const paren = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (paren) out.push(paren[1], paren[2]);
  const to = name.match(/^(.*?)\s+to\s+(.*)$/i); // "Kalalau Trail to Hanakapiai ..."
  if (to) out.push(to[1]);
  const and = name.match(/^(.*?)\s+and\s+(.*)$/i); // "Allerton Garden (NTBG) and Spouting Horn"
  if (and) out.push(and[1].replace(/\s*\(.*?\)/g, ''), and[2]);
  // Looser fallbacks, tried only after the forms above find nothing:
  // drop a leading "The", then trim words off the end ("Brennecke's Beach Broiler" -> "Brennecke's").
  const loose = [];
  for (const s of out) {
    const words = s.replace(/^the\s+/i, '').split(/\s+/);
    for (let n = words.length; n >= 1; n--) {
      const q = words.slice(0, n).join(' ');
      if (q.length >= 5) loose.push(q);
    }
  }
  return [...new Set([...out, ...loose].map((s) => s.replace(/[’']/g, "'").trim()).filter(Boolean))];
}

// Nominatim sometimes answers [] under steady use; one slower second pass catches those.
async function osmLookup(name, near) {
  return (await osmLookupOnce(name, near)) ?? (await sleep(4000), await osmLookupOnce(name, near));
}

async function osmLookupOnce(name, near) {
  for (const q of queries(name)) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&bounded=1' +
      `&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
    const results = await politeFetchJson(url);
    if (results.length) {
      // Prefer the best-ranked result; among near-equal ranks, the one nearest the pin.
      const ranked = results
        .map((r) => ({ name: r.display_name.split(',')[0], type: `${r.category}/${r.type}`, lat: +r.lat, lng: +r.lon, rank: r.importance ?? 0, query: q }))
        .map((r) => ({ ...r, dist: near ? meters(near, r) : 0 }))
        .sort((a, b) => b.rank - a.rank);
      const topRank = ranked[0].rank;
      return ranked.filter((r) => topRank - r.rank < 0.02).sort((a, b) => a.dist - b.dist)[0];
    }
  }
  return null;
}

async function driveMinutes(from, to) {
  const url =
    'https://router.project-osrm.org/route/v1/driving/' +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  try {
    const j = await politeFetchJson(url);
    return j.code === 'Ok' ? j.routes[0].duration / 60 : null;
  } catch {
    return null;
  }
}

// --- main ---------------------------------------------------------------------------
const source = ['data/spots.csv', 'data/seed.csv'].map((p) => resolve(root, p)).find(existsSync);
if (!source) {
  console.error('No data/spots.csv or data/seed.csv. Run `npm run snapshot` first.');
  process.exit(1);
}
const rows = parseCsv(readFileSync(source, 'utf8'));
const home = rows.find((r) => r.primary_category === 'home');
const homeAt = home && coords(home);
console.log(`Checking ${rows.length} rows from ${source.replace(root, '.')} ...`);

const results = [];
for (const r of rows) {
  if (r.primary_category === 'home') continue; // approximate on purpose; never published precisely
  const at = coords(r);
  const match = await osmLookup(r.name, at);
  const dist = at && match ? meters(at, match) : null;
  const status = !at ? 'NO COORDS' : !match ? 'NO MATCH' : dist < OK_M ? 'OK' : dist <= REVIEW_M ? 'REVIEW' : 'WRONG';
  // Drive estimate to the corrected point when the pin is clearly wrong.
  const target = status === 'WRONG' ? match : at;
  const osrm = homeAt && target ? await driveMinutes(homeAt, target) : null;
  // Raw router time already lands close to known Kauai drive times (it is a bit slow on
  // the island's posted limits); round to 5 minutes.
  const estimate = osrm == null ? null : Math.max(5, Math.round(osrm / 5) * 5);
  results.push({ r, at, match, dist, status, estimate });
  console.log(`${status.padEnd(9)} ${r.id || r.name}${dist != null ? ` (${Math.round(dist)} m)` : ''}`);
}

// --- report -------------------------------------------------------------------------
const f5 = (n) => n.toFixed(5);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');
const order = { WRONG: 0, 'NO MATCH': 1, 'NO COORDS': 2, REVIEW: 3, OK: 4 };
results.sort((a, b) => order[a.status] - order[b.status] || a.r.row - b.r.row);
const count = (s) => results.filter((x) => x.status === s).length;

const lines = [
  '# Coordinate verification report',
  '',
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from \`${source.replace(root, '.').replace(/\\/g, '/')}\`.`,
  '',
  `**${count('OK')} OK** (under ${OK_M} m) · **${count('REVIEW')} REVIEW** (${OK_M}–${REVIEW_M} m) · ` +
    `**${count('WRONG')} WRONG** (over ${REVIEW_M} m) · **${count('NO MATCH')} no OSM match** · **${count('NO COORDS')} no coordinates**`,
  '',
  'Distances compare your pin with the OpenStreetMap feature of the same name. OSM often marks the',
  "middle of a beach or park, while your pins mark parking or a trailhead, so REVIEW isn't",
  'necessarily wrong. Check those in `?debug=1`. Nothing here was changed in the Sheet, and',
  'nothing was marked verified.',
  '',
  '## All spots',
  '',
  '| Row | id | Status | Distance | Your pin | OSM match | OSM coordinate | Drive (Sheet) | Drive (estimate) |',
  '|---|---|---|---|---|---|---|---|---|',
  ...results.map(({ r, at, match, dist, status, estimate }) =>
    [
      r.row,
      cell(r.id || r.name),
      status,
      dist == null ? '' : `${Math.round(dist)} m`,
      at ? `${f5(at.lat)}, ${f5(at.lng)}` : '',
      match ? `${cell(match.name)} (${match.type})` : '',
      match ? `${f5(match.lat)}, ${f5(match.lng)}` : '',
      r.drive_min ? `${r.drive_min} min` : '(blank)',
      estimate == null ? '' : `~${estimate} min`,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
  ),
  '',
  '## Paste-ready fixes for WRONG rows',
  '',
  'Paste the pair into the `lat` cell; the map splits it into lat and lng. Check the spot',
  'first: the OSM point can be the middle of a beach rather than its parking.',
  '',
  ...(count('WRONG')
    ? results
        .filter((x) => x.status === 'WRONG')
        .map(({ r, match }) => `- Row ${r.row}, **${r.name}**: \`${f5(match.lat)}, ${f5(match.lng)}\` (OSM: ${match.name})`)
    : ['None.']),
  '',
  '## Drive times to fill in',
  '',
  'Estimates come from OpenStreetMap routing from the home base pin, rounded to 5 minutes.',
  'Treat them as a starting point; the popup already shows +/- 15 min.',
  '',
  ...(results.some((x) => !x.r.drive_min && x.estimate != null)
    ? results
        .filter((x) => !x.r.drive_min && x.estimate != null)
        .map(({ r, estimate }) => `- Row ${r.row}, **${r.name}**: \`${estimate}\``)
    : ['None missing.']),
  '',
];

const out = resolve(root, 'data/verification-report.md');
writeFileSync(out, lines.join('\n'));
console.log(`\nWrote data/verification-report.md`);
