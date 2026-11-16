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

const res = await fetch(url, { redirect: 'follow' });
const text = await res.text();
if (!res.ok || !/^﻿?\s*id\s*,/i.test(text)) {
  console.error(`Sheet download failed (HTTP ${res.status}) or did not return the spots CSV.`);
  console.error('Check the Sheet is published to the web as CSV, for the Spots tab.');
  process.exit(1);
}

const rows = text.trim().split(/\r?\n/).length - 1;
const out = resolve(root, 'data/spots.csv');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.log(`Saved snapshot: ${rows} rows -> data/spots.csv`);
