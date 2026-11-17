// Plan tab: Sheet rows -> events, all in Hawaii time (HST, UTC-10, no daylight saving).
import { slugify } from './data.js';

const HST_OFFSET_MS = 10 * 3600 * 1000;
const DAY_MS = 86400 * 1000;

export const STATUSES = {
  booked: 'Booked',
  'to-book': 'Need to book',
  tentative: 'Tentative',
};

function normalizeStatus(value) {
  const v = value.toLowerCase().replace(/[\s_]+/g, '-');
  if (!v) return 'tentative';
  if (/^(booked|confirmed|done|yes)$/.test(v)) return 'booked';
  if (/(to-book|need|book-by|todo|not-booked)/.test(v)) return 'to-book';
  return 'tentative';
}

// Sheets publishes dates as they're displayed: "2027-02-14", "2/14/2027" or "Feb 14, 2027".
export function parseDate(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  let y, m, d;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [, y, m, d] = match.map(Number);
  else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    [, m, d, y] = match.map(Number);
    if (y < 100) y += 2000;
  } else {
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return null;
    [y, m, d] = [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
  }
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const utcDay = Date.UTC(y, m - 1, d) / DAY_MS;
  return { y, m, d, utcDay, key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

// "9:30", "09:30", "9:30 AM", "2pm", "14:00"
export function parseTime(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/\./g, '');
  if (!s) return null;
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const min = Number(match[2] || 0);
  const ap = match[3];
  if (ap?.startsWith('p') && h < 12) h += 12;
  if (ap?.startsWith('a') && h === 12) h = 0;
  return h <= 23 && min <= 59 ? { h, min } : null;
}

export const formatTime = ({ h, min }) =>
  `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;

const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
export const formatDate = (date) => dateFmt.format(new Date(date.utcDay * DAY_MS));

// Epoch ms of a Hawaii-time date + time.
export const hstEpoch = (date, time) =>
  date.utcDay * DAY_MS + ((time?.h ?? 0) * 60 + (time?.min ?? 0)) * 60000 + HST_OFFSET_MS;

// "Now", overridable with ?now=2027-02-14T10:00 (Hawaii time) in dev or ?debug=1, for testing.
export function nowEpoch() {
  const params = new URLSearchParams(location.search);
  const override = params.get('now');
  if (override && (import.meta.env.DEV || params.get('debug') === '1')) {
    const [d, t] = override.split('T');
    const date = parseDate(d);
    if (date) return hstEpoch(date, parseTime(t || '0:00'));
  }
  return Date.now();
}

// Today's Hawaii date as a day number comparable with date.utcDay.
export const hstDayNumber = (epoch) => Math.floor((epoch - HST_OFFSET_MS) / DAY_MS);

const list = (value, sep) =>
  String(value ?? '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

export function parsePlan(rows, spotsById) {
  const warnings = [];
  const events = [];
  const seen = new Set();
  for (const raw of rows) {
    const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '').trim()]));
    const row = raw.__row;
    const warn = (msg) => warnings.push({ row, label: r.title || `row ${row}`, msg });
    const date = parseDate(r.date);
    if (!r.title) {
      if (Object.values(r).some((v) => v && v !== String(row))) warn('missing title; row skipped');
      continue;
    }
    if (!date) {
      warn(r.date ? `date "${r.date}" not understood (use 2027-02-14); row skipped` : 'missing date; row skipped');
      continue;
    }
    const start = parseTime(r.start);
    const end = parseTime(r.end);
    if (r.start && !start) warn(`start "${r.start}" not understood (use 9:30 AM)`);
    if (r.end && !end) warn(`end "${r.end}" not understood (use 11:00 AM)`);
    let id = r.id || slugify(`${date.key}-${r.title}`);
    if (seen.has(id)) id = `${id}-${row}`;
    seen.add(id);
    const spotId = r.spot_id;
    if (spotId && !spotsById.has(spotId)) warn(`spot_id "${spotId}" is not on the map`);
    const bookBy = parseDate(r.book_by);
    if (r.book_by && !bookBy) warn(`book_by "${r.book_by}" not understood`);
    const cost = r.cost_pp.replace(/^\$/, '');
    events.push({
      id,
      row,
      date,
      start,
      end: start && end ? end : null,
      title: r.title,
      spotId: spotsById.has(spotId) ? spotId : null,
      meetingPoint: r.meeting_point,
      who: r.who,
      costPp: cost === '' ? null : Number.isNaN(Number(cost)) ? r.cost_pp : Number(cost),
      bring: r.bring,
      status: normalizeStatus(r.status),
      bookBy,
      bookedBy: r.booked_by,
      notes: list(r.notes, '//'),
      links: list(r.links, ';;')
        .map((pair) => {
          const i = pair.indexOf('|');
          return i < 0 ? null : { label: pair.slice(0, i).trim(), url: pair.slice(i + 1).trim() };
        })
        .filter(Boolean),
    });
  }
  events.sort(
    (a, b) =>
      a.date.utcDay - b.date.utcDay ||
      (a.start ? a.start.h * 60 + a.start.min : -1) - (b.start ? b.start.h * 60 + b.start.min : -1) ||
      a.title.localeCompare(b.title),
  );
  return { events, warnings };
}

// When an event ends; untimed events last the whole day, timed ones without an end 2 hours.
export const eventEnd = (e) =>
  e.end ? hstEpoch(e.date, e.end) : e.start ? hstEpoch(e.date, e.start) + 2 * 3600e3 : hstEpoch(e.date) + DAY_MS;

export function tripSummary(events, now) {
  if (!events.length) return null;
  const first = events[0].date;
  const last = events[events.length - 1].date;
  const today = hstDayNumber(now);
  const days = last.utcDay - first.utcDay + 1;
  const dayOfTrip = today - first.utcDay + 1;
  const phase = today < first.utcDay ? 'before' : today > last.utcDay ? 'after' : 'during';
  return {
    first,
    last,
    days,
    dayOfTrip,
    daysUntil: first.utcDay - today,
    phase,
    // During the trip: the next thing that hasn't finished yet.
    upNext: phase === 'during' ? events.find((e) => eventEnd(e) > now && e.date.utcDay >= today) || null : null,
    dayNumber: (date) => date.utcDay - first.utcDay + 1,
  };
}
