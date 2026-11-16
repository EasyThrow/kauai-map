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

// Opens the Maps app with driving directions on iPhone, iPad and Mac.
export const appleMapsUrl = (lat, lng) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;

// "21.88156, -159.47586" pastes straight into Apple or Google Maps search.
export const coordText = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

// iPhone, iPad (which reports itself as "Macintosh") and Mac all have Apple Maps.
export const isApplePlatform = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

// Only allow web links from the Sheet.
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
