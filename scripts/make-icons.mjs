// Home Screen icons (public/icons/): Kauai cut from the baked terrain image.
//   npm run make-icons     (only needed if the terrain changes)
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/icons');
mkdirSync(out, { recursive: true });

const bounds = JSON.parse(readFileSync(resolve(root, 'src/terrain-bounds.json'), 'utf8'));
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// Kauai only (not Niihau), as a geographic box.
const ISLAND = { west: -159.8, east: -159.28, south: 21.86, north: 22.25 };

// Cut a lng/lat box out of one baked image (Web Mercator), padding with transparency
// where the box runs past the image, at size x size pixels.
async function cut(name, box, size) {
  const c = bounds[name];
  const [west, north] = c[0];
  const east = c[1][0];
  const south = c[2][1];
  const file = resolve(root, `public/terrain/${name}.webp`);
  const { width, height } = await sharp(file).metadata();
  const px = (lng) => ((lng - west) / (east - west)) * width;
  const py = (lat) => ((mercY(north) - mercY(lat)) / (mercY(north) - mercY(south))) * height;
  const left = Math.round(px(box.west));
  const top = Math.round(py(box.north));
  const w = Math.round(px(box.east)) - left;
  const h = Math.round(py(box.south)) - top;
  const pad = Math.max(w, h);
  // Two steps: sharp runs extend after extract within one pipeline.
  const padded = await sharp(file)
    .ensureAlpha()
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(padded)
    .extract({ left: left + pad, top: top + pad, width: w, height: h })
    .resize(size, size, { fit: 'fill' })
    .png()
    .toBuffer();
}

// Square box (in Mercator terms) around the island with `pad` share of empty margin.
function squareBox(pad) {
  const cx = (ISLAND.west + ISLAND.east) / 2;
  const cyM = (mercY(ISLAND.north) + mercY(ISLAND.south)) / 2;
  const spanX = ((ISLAND.east - ISLAND.west) * Math.PI) / 180;
  const spanY = mercY(ISLAND.north) - mercY(ISLAND.south);
  const half = Math.max(spanX, spanY) / (1 - 2 * pad) / 2;
  const lat = (m) => ((2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180) / Math.PI;
  const halfDeg = (half * 180) / Math.PI;
  return { west: cx - halfDeg, east: cx + halfDeg, north: lat(cyM + half), south: lat(cyM - half) };
}

async function make(pad, size, name) {
  const box = squareBox(pad);
  const [landImg, seaImg] = await Promise.all([cut('land', box, size), cut('sea', box, size)]);
  // Same order as the map: sea color, land, then the sea image on top draws the coastline.
  await sharp({ create: { width: size, height: size, channels: 4, background: '#a9d8f2' } })
    .composite([{ input: landImg }, { input: seaImg }])
    .flatten({ background: '#a9d8f2' })
    .png({ compressionLevel: 9 })
    .toFile(resolve(out, name));
}

await Promise.all([
  make(0.06, 192, 'icon-192.png'),
  make(0.06, 512, 'icon-512.png'),
  make(0.06, 180, 'apple-touch-icon.png'),
  make(0.18, 512, 'maskable-512.png'), // maskable icons get cropped to a circle
]);
console.log('Wrote public/icons/');
