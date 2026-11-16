// Bake Kauai's terrain into two static images, so the map loads 2 files instead of
// dozens of elevation tiles:
//   public/terrain/land.webp  elevation color bands + hillshade (island area, zoom-12 detail)
//   public/terrain/sea.webp   ocean depth bands, transparent near shore (whole pannable area)
//   src/terrain-bounds.json   where each image sits on the map
//
//   npm run bake-terrain     (only needed if the colors or areas change)
//
// Source: AWS Terrain Tiles (Terrarium encoding), free and keyless. Colors come from
// PALETTE in src/style.js, so the baked look matches the old live layers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const UA = 'kauai-trip-map/0.1 (personal static site; generic client)';

// Keep in sync with PALETTE in src/style.js
const P = {
  deepWater: '#a9d8f2',
  midWater: '#c6e7f7',
  coastLand: '#4f9a62',
  midLand: '#7fb487',
  highLand: '#c7ddc1',
};

const AREAS = {
  // The island with a small margin, at the detail the live layers used (zoom 12).
  land: { bounds: [-159.83, 21.84, -159.25, 22.27], zoom: 12 },
  // Everything the map can pan to (MAX_BOUNDS in src/config.js); depth bands are soft, so zoom 10.
  sea: { bounds: [-160.6, 21.4, -158.5, 22.7], zoom: 10 },
};

const LAND_BANDS = [
  [-Infinity, P.coastLand],
  [150, '#62a771'],
  [400, P.midLand],
  [700, '#a2c8a0'],
  [1000, P.highLand],
];
const BLEND_M = 15; // each band fades into the next over this many meters, like the live style

// --- helpers --------------------------------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lngToX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const xToLng = (x, z) => (x / 2 ** z) * 360 - 180;
const yToLat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function bandColor(e, bands) {
  let color = hex(bands[0][1]);
  for (let i = 1; i < bands.length; i++) {
    const [start, c] = bands[i];
    if (e >= start) color = hex(c);
    else if (e > start - BLEND_M) color = mix(hex(bands[i - 1][1]), hex(c), (e - (start - BLEND_M)) / BLEND_M);
  }
  return color;
}

async function fetchTile(z, x, y) {
  const url = TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await sharp(Buffer.from(await res.arrayBuffer()))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return data;
    } catch (err) {
      if (attempt >= 3) throw new Error(`Tile ${z}/${x}/${y} failed: ${err.message}`);
    }
  }
}

// Download and stitch the tiles covering `bounds` into one elevation grid (meters).
async function elevationGrid({ bounds: [w, s, e, n], zoom: z }) {
  const x0 = Math.floor(lngToX(w, z));
  const x1 = Math.floor(lngToX(e, z));
  const y0 = Math.floor(latToY(n, z));
  const y1 = Math.floor(latToY(s, z));
  const nx = x1 - x0 + 1;
  const ny = y1 - y0 + 1;
  const W = nx * 256;
  const H = ny * 256;
  const elev = new Float32Array(W * H);
  const jobs = [];
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) jobs.push([tx, ty]);
  let done = 0;
  const worker = async () => {
    while (jobs.length) {
      const [tx, ty] = jobs.shift();
      const px = await fetchTile(z, x0 + tx, y0 + ty);
      for (let j = 0; j < 256; j++) {
        for (let i = 0; i < 256; i++) {
          const k = (j * 256 + i) * 3;
          elev[(ty * 256 + j) * W + tx * 256 + i] = px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768;
        }
      }
      process.stdout.write(`\r  ${++done}/${nx * ny} tiles`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  process.stdout.write('\n');
  // Tile-aligned corners, so the image lines up exactly with the map's projection.
  const corners = [
    [xToLng(x0, z), yToLat(y0, z)], // top-left
    [xToLng(x1 + 1, z), yToLat(y0, z)], // top-right
    [xToLng(x1 + 1, z), yToLat(y1 + 1, z)], // bottom-right
    [xToLng(x0, z), yToLat(y1 + 1, z)], // bottom-left
  ];
  const midLat = (yToLat(y0, z) + yToLat(y1 + 1, z)) / 2;
  const metersPerPx = (40075016.686 * Math.cos((midLat * Math.PI) / 180)) / (256 * 2 ** z);
  return { elev, W, H, corners, metersPerPx };
}

// --- land: bands + hillshade --------------------------------------------------------
function renderLand({ elev, W, H, metersPerPx }) {
  const out = Buffer.alloc(W * H * 3);
  // Light from the northwest, 45 degrees up (same convention as MapLibre's hillshade).
  const az = (315 * Math.PI) / 180;
  const alt = (45 * Math.PI) / 180;
  const flat = Math.sin(alt);
  const shadow = hex('#143c23');
  const at = (x, y) => elev[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const e = elev[y * W + x];
      let c = bandColor(e, LAND_BANDS);
      if (e > 0) {
        const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * metersPerPx);
        const dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * metersPerPx);
        const slope = Math.atan(Math.hypot(dzdx, dzdy));
        const aspect = Math.atan2(dzdy, -dzdx);
        const lit = Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - Math.PI / 2 - aspect);
        const d = lit - flat;
        // Gentle: shadows up to ~40% toward dark green, highlights up to ~15% toward white.
        c = d < 0 ? mix(c, shadow, Math.min(0.4, -d * 0.9)) : mix(c, [255, 255, 255], Math.min(0.15, d * 0.6));
      }
      const k = (y * W + x) * 3;
      out[k] = c[0];
      out[k + 1] = c[1];
      out[k + 2] = c[2];
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 80, effort: 6 });
}

// --- sea: depth bands, transparent in the shallows (crisp vector water shows there) ---
function renderSea({ elev, W, H }) {
  const out = Buffer.alloc(W * H * 4);
  const deep = hex(P.deepWater);
  const midC = hex(P.midWater);
  for (let i = 0; i < W * H; i++) {
    const e = elev[i];
    let c = deep;
    if (e > -600 - BLEND_M && e < -600) c = mix(deep, midC, (e - (-600 - BLEND_M)) / BLEND_M);
    else if (e >= -600) c = midC;
    // Fully clear from -40 m up to land; fade in over BLEND_M below that.
    const alpha = e >= -40 ? 0 : e > -40 - BLEND_M ? (-40 - e) / BLEND_M : 1;
    out.set([c[0], c[1], c[2], Math.round(alpha * 255)], i * 4);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 85, alphaQuality: 90, effort: 6 });
}

// --- main ---------------------------------------------------------------------------
const outDir = resolve(root, 'public/terrain');
mkdirSync(outDir, { recursive: true });
const bounds = {};
for (const [name, area] of Object.entries(AREAS)) {
  console.log(`${name}: zoom ${area.zoom}`);
  const grid = await elevationGrid(area);
  const img = name === 'land' ? renderLand(grid) : renderSea(grid);
  const file = resolve(outDir, `${name}.webp`);
  const info = await img.toFile(file);
  console.log(`  ${info.width}x${info.height} -> public/terrain/${name}.webp (${Math.round(info.size / 1024)} KB)`);
  bounds[name] = grid.corners.map(([lng, lat]) => [+lng.toFixed(6), +lat.toFixed(6)]);
}
writeFileSync(resolve(root, 'src/terrain-bounds.json'), JSON.stringify(bounds, null, 2) + '\n');
console.log('Wrote src/terrain-bounds.json');
