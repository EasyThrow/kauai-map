// Calendar files (.ics) for "Add to my calendar". Times are written in UTC, so every
// phone shows them correctly in its own time zone.
import { hstEpoch, eventEnd } from './plan.js';

const pad = (n) => String(n).padStart(2, '0');
const utcStamp = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
};
const dateStamp = (date) => `${date.y}${pad(date.m)}${pad(date.d)}`;
const nextDayStamp = (date) => {
  const d = new Date((date.utcDay + 1) * 86400000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};

const escape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines over 75 characters are folded, as the calendar format requires.
const fold = (line) => {
  const parts = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  parts.push(rest);
  return parts.join('\r\n');
};

function vevent(e, { spotsById, siteUrl }) {
  const spot = e.spotId ? spotsById.get(e.spotId) : null;
  const where = e.meetingPoint || spot?.name || '';
  const details = [
    e.who && `Who: ${e.who}`,
    e.costPp != null && `Cost: ${typeof e.costPp === 'number' ? `~$${e.costPp} per person` : e.costPp}`,
    e.bring && `Bring: ${e.bring}`,
    e.bookedBy && `Booked by: ${e.bookedBy}`,
    ...e.notes,
    `Trip map: ${siteUrl}#tab=plan&event=${encodeURIComponent(e.id)}`,
  ].filter(Boolean);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.id}@kauai-trip-map`,
    `DTSTAMP:${utcStamp(Date.now())}`,
    ...(e.start
      ? [`DTSTART:${utcStamp(hstEpoch(e.date, e.start))}`, `DTEND:${utcStamp(eventEnd(e))}`]
      : [`DTSTART;VALUE=DATE:${dateStamp(e.date)}`, `DTEND;VALUE=DATE:${nextDayStamp(e.date)}`]),
    `SUMMARY:${escape(e.title)}`,
    where && `LOCATION:${escape(where)}`,
    spot && `GEO:${spot.lat};${spot.lng}`,
    `DESCRIPTION:${escape(details.join('\n'))}`,
    'END:VEVENT',
  ];
  return lines.filter(Boolean).map(fold);
}

export function buildIcs(events, opts) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kauai Trip Map//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Kauai Trip',
    ...events.flatMap((e) => vevent(e, opts)),
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(filename, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
