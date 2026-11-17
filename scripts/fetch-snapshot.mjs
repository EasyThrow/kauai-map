// Download the published Google Sheet CSV to data/spots.csv (gitignored).
// The build bundles it as the fallback the map shows if the live Sheet can't be reached.
//
// The URL comes from SHEET_CSV_URL (deploy workflow secret) or, locally, from
// VITE_SHEET_CSV_URL in .env.local. The URL itself is never printed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function urlFromEnvFile() {
  const file = resolve(root, '.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('VITE_SHEET_CSV_URL='));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
}

const url = process.env.SHEET_CSV_URL || process.env.VITE_SHEET_CSV_URL || urlFromEnvFile();
if (!url) {
  console.error('No Sheet URL. Set SHEET_CSV_URL, or VITE_SHEET_CSV_URL in .env.local.');
  process.exit(1);
}

// Expected first column of each tab (same as src/data.js); anything else is an error page.
const FIRST_COLUMN = { spots: 'id', plan: 'id', stay: 'name', interest: 'timestamp' };

async function download(tabUrl, name) {
  const res = await fetch(tabUrl, { redirect: 'follow' });
  const text = await res.text();
  const first = FIRST_COLUMN[name] || 'id';
  return res.ok && new RegExp(`^\\uFEFF?\\s*"?${first}"?\\s*(,|\\r?\\n|$)`, 'i').test(text) ? text : null;
}

function save(name, text) {
  const out = resolve(root, `data/${name}.csv`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`Saved snapshot: ${text.trim().split(/\r?\n/).length - 1} rows -> data/${name}.csv`);
}

// Spots: required; the deploy stops if it can't be read.
const spots = await download(url, 'spots');
if (!spots) {
  console.error('Sheet download failed or did not return the spots CSV.');
  console.error('Check the Sheet is published to the web as CSV, for the Spots tab.');
  process.exit(1);
}
save('spots', spots);

// Other tabs (src/sheet-tabs.json): optional; a missing one just has no backup copy.
const tabs = JSON.parse(readFileSync(resolve(root, 'src/sheet-tabs.json'), 'utf8'));
for (const [name, gid] of Object.entries(tabs)) {
  if (!gid) continue;
  const u = new URL(url);
  u.searchParams.set('gid', gid);
  u.searchParams.set('single', 'true');
  u.searchParams.set('output', 'csv');
  const text = await download(u.href, name);
  if (text) save(name, text);
  else console.warn(`::warning::The ${name} tab (gid ${gid}) could not be read; is it published?`);
}
