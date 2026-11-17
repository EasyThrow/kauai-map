// Conditions data from free public sources (no keys, no sign-up):
// - National Weather Service (api.weather.gov): forecast, alerts, the Hawaii surf forecast
// - NOAA Tides & Currents: high and low tides
// - Sunrise and sunset are calculated here (NOAA solar formulas), no request needed.
// The last good copy is kept on this device, so the tab still shows something offline.

const NWS = 'https://api.weather.gov';
const TIDES = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
export const TIDE_STATION = { id: '1611400', name: 'Nawiliwili' };
const CACHE_KEY = 'kauai-map:conditions';
const TIMEOUT_MS = 10000;

const HOUR = 3600000;
const HST = -10; // Hawaii has no daylight saving time

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/geo+json, application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// --- Forecast ------------------------------------------------------------------------

// NWS periods come as day/night halves; pair them into days.
export function forecastDays(periods) {
  const days = [];
  for (const p of periods) {
    const date = p.startTime.slice(0, 10);
    let day = days.find((d) => d.date === date);
    if (!day) days.push((day = { date, name: p.isDaytime ? p.name : p.name.replace(/ ?(Night|Tonight)$/i, '') || 'Tonight' }));
    const half = {
      name: p.name,
      temp: p.temperature,
      short: p.shortForecast,
      detail: p.detailedForecast,
      rain: p.probabilityOfPrecipitation?.value ?? null,
      wind: [p.windDirection, p.windSpeed].filter(Boolean).join(' '),
    };
    if (p.isDaytime) day.day = half;
    else day.night = half;
  }
  return days;
}

async function forecastFor(lat, lng) {
  const point = await getJson(`${NWS}/points/${lat.toFixed(4)},${lng.toFixed(4)}`);
  const fc = await getJson(point.properties.forecast);
  return {
    place: point.properties.relativeLocation?.properties?.city || '',
    updated: fc.properties.updateTime || fc.properties.generatedAt,
    days: forecastDays(fc.properties.periods || []).slice(0, 7),
  };
}

// --- Alerts (high surf, flood, wind...) ---------------------------------------------

async function kauaiAlerts() {
  const data = await getJson(`${NWS}/alerts/active?area=HI`);
  return (data.features || [])
    .map((f) => f.properties)
    .filter((p) => /kauai/i.test(p.areaDesc || ''))
    .map((p) => ({
      event: p.event,
      headline: p.headline || p.event,
      description: p.description || '',
      instruction: p.instruction || '',
      ends: p.ends || p.expires,
      severity: p.severity,
    }));
}

// --- Surf (the Kauai table of the Honolulu "Surf Zone Forecast") --------------------

// Returns { issued, days: ['Tonight', 'Tuesday'], shores: [{ shore, ranges: ['7-12', '6-10'] }], discussion }
export function parseSurf(text) {
  const start = text.search(/^Kauai-\s*$/m);
  if (start < 0) return null;
  const end = text.indexOf('$$', start);
  const block = text.slice(start, end < 0 ? undefined : end);
  const lines = block.split(/\r?\n/);
  const issued = (lines[1] || '').trim();

  const shoresIdx = lines.findIndex((l) => /^\s*Shores\s/.test(l));
  if (shoresIdx < 1) return null;
  const days = lines[shoresIdx - 2]?.trim().split(/\s{2,}/).filter(Boolean) || [];

  const shores = [];
  for (const line of lines) {
    const m = line.match(/^\s*(North|South|East|West) Facing\s+(.+)$/);
    if (!m) continue;
    const values = m[2].trim().split(/\s+/);
    // Two values (AM/PM) per day; summarize each day as its overall range.
    const perDay = Math.max(1, Math.round(values.length / Math.max(1, days.length)));
    const ranges = [];
    for (let i = 0; i < values.length; i += perDay) {
      const nums = values
        .slice(i, i + perDay)
        .flatMap((v) => v.split('-').map(Number))
        .filter((n) => Number.isFinite(n));
      if (nums.length) {
        const lo = Math.min(...nums);
        const hi = Math.max(...nums);
        ranges.push(lo === hi ? `${lo}` : `${lo}–${hi}`);
      }
    }
    shores.push({ shore: m[1], ranges });
  }
  if (!shores.length) return null;

  const disc = text.match(/\.DISCUSSION\.\.\.\s*([\s\S]*?)(?:\n\s*\n[A-Z]{3}\d|\n\$\$|$)/);
  return {
    issued,
    days,
    shores,
    discussion: disc ? disc[1].replace(/\s*\n\s*/g, ' ').trim() : '',
  };
}

async function surf() {
  const list = await getJson(`${NWS}/products/types/SRF/locations/HFO`);
  const latest = list['@graph']?.[0]?.['@id'];
  if (!latest) throw new Error('No surf forecast');
  const product = await getJson(latest);
  return parseSurf(product.productText || '');
}

// --- Tides ------------------------------------------------------------------------------

async function tides() {
  const u = new URL(TIDES);
  const params = {
    product: 'predictions',
    application: 'trip_map',
    station: TIDE_STATION.id,
    datum: 'MLLW',
    interval: 'hilo',
    units: 'english',
    time_zone: 'lst_ldt',
    format: 'json',
    // Today in Hawaii, then 3 days ("date=today" ignores range).
    begin_date: new Date(Date.now() + HST * HOUR).toISOString().slice(0, 10).replace(/-/g, ''),
    range: '72',
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const data = await getJson(u.href);
  return (data.predictions || []).map((p) => ({ t: p.t, ft: Number(p.v), high: p.type === 'H' }));
}

// --- Sunrise / sunset (NOAA solar position, accurate to about a minute) ---------------

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Minutes after local (Hawaii) midnight, or null in polar day/night (never on Kauai).
export function sunTimes(year, month, day, lat, lng) {
  const jd = Date.UTC(year, month - 1, day, 12 - HST) / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * m)) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(l0)) -
        2 * e * Math.sin(rad(m)) +
        4 * e * y * Math.sin(rad(m)) * Math.cos(2 * rad(l0)) -
        0.5 * y * y * Math.sin(4 * rad(l0)) -
        1.25 * e * e * Math.sin(2 * rad(m)),
    );
  const cosH =
    Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
  if (cosH < -1 || cosH > 1) return null;
  const ha = deg(Math.acos(cosH));
  const noon = 720 - 4 * lng - eqTime + HST * 60;
  return { rise: Math.round(noon - ha * 4), set: Math.round(noon + ha * 4) };
}

export const clock = (minutes) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// --- Everything ---------------------------------------------------------------------------

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}
function writeCache(value) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* fine */
  }
}

export const savedConditions = readCache;

// places: [{ key, label, lat, lng }]. Each part loads on its own; a failed part keeps
// its last saved copy (marked stale) instead of blanking the tab.
export async function loadConditions(places) {
  const saved = readCache() || {};
  const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));
  const [forecasts, alerts, surfData, tideData] = await Promise.all([
    Promise.all(places.map((pl) => settle(forecastFor(pl.lat, pl.lng)))),
    settle(kauaiAlerts()),
    settle(surf()),
    settle(tides()),
  ]);
  const now = Date.now();
  const pick = (result, key) =>
    result.value != null ? { data: result.value, at: now } : saved[key] ? { ...saved[key], stale: true } : { error: true };

  const out = {
    forecast: Object.fromEntries(
      places.map((pl, i) => {
        const r = forecasts[i];
        const prev = saved.forecast?.[pl.key];
        return [pl.key, r.value ? { data: r.value, at: now } : prev ? { ...prev, stale: true } : { error: true }];
      }),
    ),
    alerts: pick(alerts, 'alerts'),
    surf: pick(surfData, 'surf'),
    tides: pick(tideData, 'tides'),
  };
  // Save only fresh parts (don't re-save stale flags).
  const toSave = { ...saved, forecast: { ...(saved.forecast || {}) } };
  for (const [k, v] of Object.entries(out.forecast)) if (!v.stale && !v.error) toSave.forecast[k] = v;
  for (const k of ['alerts', 'surf', 'tides']) if (!out[k].stale && !out[k].error) toSave[k] = out[k];
  writeCache(toSave);
  return out;
}

export const isFresh = (at, maxAgeMs = HOUR / 4) => at && Date.now() - at < maxAgeMs;
