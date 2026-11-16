/* global Papa */

// Fetch the spots CSV and turn each row into a spot object.
export async function loadSpots(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Spot data request failed: ${res.status}`);
  const text = await res.text();
  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return data.map(parseRow);
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

export function parseRow(row) {
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, (v ?? '').trim()]));
  const primary = r.primary_category.toLowerCase();
  const categories = list(r.categories.toLowerCase(), '|');
  if (primary && !categories.includes(primary)) categories.unshift(primary);
  return {
    id: r.id,
    name: r.name,
    primary,
    categories,
    region: r.region.toLowerCase(),
    lat: num(r.lat),
    lng: num(r.lng),
    coordPoint: r.coord_point,
    verified: r.verified.toUpperCase() === 'Y',
    driveMin: num(r.drive_min),
    notes: list(r.notes, '//'),
    tags: list(r.tags.toLowerCase(), '|'),
    pricePp: num(r.price_pp),
    links: list(r.links, ';;')
      .map((pair) => {
        const i = pair.indexOf('|');
        return i < 0 ? null : { label: pair.slice(0, i).trim(), url: pair.slice(i + 1).trim() };
      })
      .filter(Boolean),
    photo: r.photo_url ? { url: r.photo_url, credit: r.photo_credit, license: r.photo_license } : null,
    sort: num(r.sort),
  };
}
