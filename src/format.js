// Display formatting for spot fields.

// 5 -> "~5 min (+/- 15 min)"; 90 -> "~1 hr 30 min (+/- 15 min)"; 60 -> "~1 hr (+/- 15 min)"
export function formatDrive(min) {
  if (min == null || min <= 0) return null;
  const m = Math.round(min);
  let core;
  if (m < 60) core = `${m} min`;
  else {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    core = rest ? `${h} hr ${rest} min` : `${h} hr`;
  }
  return `~${core} (+/- 15 min)`;
}

export const TAG_LABELS = {
  'reservation-required': 'Reservation required',
  'winter-caution': 'Winter: big surf possible',
  'calm-days-only': 'Calm days only',
  'go-early': 'Go early',
  fee: 'Fee',
  'check-status': 'Check status first',
  lifeguard: 'Lifeguard',
};

// Tags that are warnings get the caution styling.
export const CAUTION_TAGS = new Set(['winter-caution', 'calm-days-only', 'check-status']);

export const tagLabel = (tag) => TAG_LABELS[tag] || tag;

export const formatPrice = (pp) => (pp == null ? null : `~$${Math.round(pp)} per person`);

export const directionsUrl = (lat, lng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

// Only allow web links from the Sheet.
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
