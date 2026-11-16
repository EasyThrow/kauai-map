// Checks every spot row on load. Problems go to the console (and the ?debug=1 panel);
// viewers never see anything broken: bad rows are skipped, bad values are dropped.
import { CATEGORIES, TAGS, KAUAI_BOUNDS } from './config.js';
import { safeUrl } from './format.js';

export const REGIONS = ['south', 'west', 'east', 'north', 'central'];

const [[minLng, minLat], [maxLng, maxLat]] = KAUAI_BOUNDS;
const inKauai = (s) => s.lat >= minLat && s.lat <= maxLat && s.lng >= minLng && s.lng <= maxLng;

// Returns { valid, skipped, warnings }.
// - valid: spots safe to show (unknown categories/tags/links removed)
// - skipped: [{ spot, reasons }] rows left off the map
// - warnings: [{ id, row, level: 'skip' | 'warn', msg }]
export function validateSpots(spots) {
  const warnings = [];
  const skipped = [];
  const valid = [];
  const seen = new Map();

  for (const s of spots) {
    const label = s.id || s.name || `row ${s.row}`;
    const warn = (msg) => warnings.push({ id: s.id, row: s.row, label, level: 'warn', msg });
    const reasons = [];

    // Problems that keep a row off the map
    if (!s.name) reasons.push('missing name');
    if (!s.primary) reasons.push('missing primary_category');
    else if (!CATEGORIES[s.primary]) reasons.push(`unknown primary_category "${s.primary}"`);
    if (s.lat == null || s.lng == null) reasons.push('missing or non-numeric lat/lng');
    else if (!inKauai(s)) reasons.push(`lat/lng ${s.lat}, ${s.lng} is outside Kauai`);
    if (!s.id) reasons.push('missing id (and no name to make one from)');
    else if (seen.has(s.id)) reasons.push(`duplicate id "${s.id}" (first used on row ${seen.get(s.id)})`);

    if (s.id && !seen.has(s.id)) seen.set(s.id, s.row);

    // Fixable problems: drop the bad value, keep the spot
    const badCats = s.categories.filter((c) => !CATEGORIES[c]);
    if (badCats.length) warn(`unknown categories dropped: ${badCats.join(', ')}`);
    const badTags = s.tags.filter((t) => !TAGS.includes(t));
    if (badTags.length) warn(`unknown tags dropped: ${badTags.join(', ')}`);
    const badLinks = s.links.filter((l) => !safeUrl(l.url));
    if (badLinks.length) warn(`links that are not web addresses dropped: ${badLinks.map((l) => l.label).join(', ')}`);
    if (s.photo && !safeUrl(s.photo.url)) warn('photo_url is not a web address; photo hidden');
    if (s.photo && safeUrl(s.photo.url) && !(s.photo.credit && s.photo.license)) warn('photo is missing photo_credit or photo_license');
    if (s.region && !REGIONS.includes(s.region)) warn(`unknown region "${s.region}"`);
    if (s.verifiedRaw && !['Y', 'N'].includes(s.verifiedRaw.toUpperCase())) warn(`verified should be Y or N, not "${s.verifiedRaw}"`);
    if (s.priceRaw && s.pricePp == null) warn(`price_pp "${s.priceRaw}" is not a number`);
    if (s.driveRaw && s.driveMin == null) warn(`drive_min "${s.driveRaw}" is not a number`);

    // Allowed blank for freshly approved suggestions, but worth filling in
    if (s.primary !== 'home') {
      if (!s.region) warn('region is blank');
      if (s.driveMin == null && !s.driveRaw) warn('drive_min is blank (popup skips drive time)');
      if (!s.coordPoint) warn('coord_point is blank');
      if (!s.notes.length) warn('notes are blank');
    }

    if (reasons.length) {
      for (const r of reasons) warnings.push({ id: s.id, row: s.row, label, level: 'skip', msg: r });
      skipped.push({ spot: s, reasons });
      continue;
    }

    valid.push({
      ...s,
      categories: s.categories.filter((c) => CATEGORIES[c]),
      tags: s.tags.filter((t) => TAGS.includes(t)),
      links: s.links.filter((l) => safeUrl(l.url)),
      photo: s.photo && safeUrl(s.photo.url) ? s.photo : null,
    });
  }

  return { valid, skipped, warnings };
}

export function logReport({ valid, skipped, warnings }) {
  if (!warnings.length) return;
  console.groupCollapsed(
    `Spot data: ${valid.length} shown, ${skipped.length} skipped, ${warnings.length} note${warnings.length === 1 ? '' : 's'}`,
  );
  for (const w of warnings) {
    (w.level === 'skip' ? console.warn : console.info)(`Row ${w.row} (${w.label}): ${w.msg}`);
  }
  console.groupEnd();
}
