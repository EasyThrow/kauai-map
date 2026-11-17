// "I'm interested": who wants to do what. Answers come from a Google Form whose
// responses tab is published with the Sheet. Each person's latest answer per spot wins.
//
// Tapping "I'm in" sends the form answer straight from the page (one tap, no form to
// fill in). Google doesn't let the page read the reply, so the pick is also kept on
// this device for a few minutes, until the published Sheet catches up.
import { slugify } from './data.js';

const NAME_KEY = 'kauai-map:name';
const PENDING_KEY = 'kauai-map:interest-pending';
// Published Sheet copies refresh about every 5 minutes; keep local picks a bit longer.
const PENDING_MS = 12 * 60 * 1000;

// localStorage can be missing or blocked (private mode); the site works without it.
function readStore(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not saved; fine */
  }
}

const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);
const nameKey = (s) => cleanName(s).toLowerCase();

// The form's "Spot" answer looks like "Koloa Landing [koloa-landing]"; a plain id or
// spot name also works for answers typed by hand.
function spotIdFrom(text, spotsById) {
  const raw = String(text || '').trim();
  const bracket = raw.match(/\[([^\]]+)\]\s*$/);
  if (bracket && spotsById.has(bracket[1].trim())) return bracket[1].trim();
  if (spotsById.has(raw)) return raw;
  const slug = slugify(raw);
  if (spotsById.has(slug)) return slug;
  for (const s of spotsById.values()) if (slugify(s.name) === slug) return s.id;
  return null;
}

// "11/16/2026 19:30:12" (the Sheet's format) -> sortable number; null if unreadable.
function stampOf(text) {
  const m = String(text || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0));
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : t;
}

const isIn = (text) => /^\s*(in|yes|i'?m in|interested)\b/i.test(String(text || ''));

// Responses tab rows -> { bySpot: Map(spotId -> [{ key, name }]), warnings }
export function parseInterest(rows, spotsById) {
  const warnings = [];
  if (!rows.length) return { bySpot: new Map(), warnings };
  const headers = Object.keys(rows[0]).filter((h) => h !== '__row');
  const col = (re) => headers.find((h) => re.test(h));
  const spotCol = col(/spot/i);
  const nameCol = col(/name/i);
  const statusCol = col(/in or out|going|in\/out|status|interested/i);
  const timeCol = col(/timestamp/i);
  if (!spotCol || !nameCol || !statusCol) {
    warnings.push({ row: 1, label: 'Who\'s in', msg: 'Responses tab needs Spot, First name and In or out questions' });
    return { bySpot: new Map(), warnings };
  }

  // Oldest first; rows without a readable timestamp keep their Sheet order.
  const ordered = rows
    .map((r, i) => ({ r, i, t: timeCol ? stampOf(r[timeCol]) : null }))
    .sort((a, b) => (a.t != null && b.t != null ? a.t - b.t : a.i - b.i));

  const latest = new Map(); // `${spot}\n${nameKey}` -> { spot, key, name, in }
  for (const { r } of ordered) {
    const name = cleanName(r[nameCol]);
    if (!name) continue;
    const spot = spotIdFrom(r[spotCol], spotsById);
    if (!spot) {
      warnings.push({ row: r.__row, label: 'Who\'s in', msg: `unknown spot "${String(r[spotCol]).trim()}"` });
      continue;
    }
    latest.set(`${spot}\n${nameKey(name)}`, { spot, key: nameKey(name), name, in: isIn(r[statusCol]) });
  }
  return { bySpot: groupIn(latest.values()), warnings };
}

function groupIn(answers) {
  const bySpot = new Map();
  for (const a of answers) {
    if (!a.in) continue;
    if (!bySpot.has(a.spot)) bySpot.set(a.spot, []);
    bySpot.get(a.spot).push({ key: a.key, name: a.name });
  }
  for (const list of bySpot.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return bySpot;
}

// Pre-filled link -> where and how to send an answer. Null if the link isn't usable.
export function parseFormTemplate(template) {
  let url;
  try {
    url = new URL(template);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/forms/')) return null;
  const fields = {};
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith('entry.')) continue;
    const v = value.trim().toUpperCase();
    if (v === 'SPOT') fields.spot = key;
    else if (v === 'NAME') fields.name = key;
    else if (v === 'IN') fields.status = key;
  }
  if (!fields.spot || !fields.name || !fields.status) return null;
  return {
    fields,
    action: url.origin + url.pathname.replace(/\/viewform$/, '/formResponse'),
    viewUrl: (values) => {
      const u = new URL(url.href);
      for (const [k, v] of Object.entries(values)) u.searchParams.set(fields[k], v);
      return u.href;
    },
  };
}

// Shared state for the popup buttons and the Who's in tab.
export function createInterestStore({ formUrl, spotsById, rows, onChange }) {
  const form = formUrl ? parseFormTemplate(formUrl) : null;
  if (formUrl && !form) {
    console.warn('Interest form link needs pre-filled answers SPOT, NAME and In; the "I\'m in" buttons are off.');
  }
  let live = parseInterest(rows, spotsById);
  let myName = cleanName(readStore(NAME_KEY, ''));

  // Live answers with this device's recent picks laid on top.
  function current() {
    const now = Date.now();
    const pending = readStore(PENDING_KEY, []).filter((p) => now - p.t < PENDING_MS && spotsById.has(p.spot));
    writeStore(PENDING_KEY, pending);
    const merged = new Map();
    for (const [spot, list] of live.bySpot) {
      for (const p of list) merged.set(`${spot}\n${p.key}`, { spot, key: p.key, name: p.name, in: true });
    }
    for (const p of pending) merged.set(`${p.spot}\n${nameKey(p.name)}`, { spot: p.spot, key: nameKey(p.name), name: p.name, in: p.in });
    return groupIn(merged.values());
  }
  let bySpot = current();

  return {
    canSend: () => !!form,
    get warnings() {
      return live.warnings;
    },
    who: (spotId) => bySpot.get(spotId) || [],
    // [[spotId, people]] with the most people first.
    all: () =>
      [...bySpot.entries()].sort(
        (a, b) => b[1].length - a[1].length || (spotsById.get(a[0])?.name || '').localeCompare(spotsById.get(b[0])?.name || ''),
      ),
    myName: () => myName,
    setName(name) {
      myName = cleanName(name);
      writeStore(NAME_KEY, myName);
      bySpot = current();
      onChange?.();
    },
    amIn: (spotId) => !!myName && (bySpot.get(spotId) || []).some((p) => p.key === nameKey(myName)),
    // Fresh rows from the Sheet (the Who's in tab re-reads it when opened).
    update(newRows) {
      live = parseInterest(newRows, spotsById);
      bySpot = current();
      onChange?.();
    },
    // Send an answer. Resolves true when it left the device; the Sheet shows it a few
    // minutes later. Network failures resolve false so the caller can offer the form.
    async send(spotId, going) {
      const spot = spotsById.get(spotId);
      if (!form || !spot || !myName) return false;
      const values = { spot: `${spot.name} [${spot.id}]`, name: myName, status: going ? 'In' : 'Out' };
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(values)) body.set(form.fields[k], v);
      try {
        // no-cors: Google accepts the answer but the page can't read the reply.
        await fetch(form.action, { method: 'POST', mode: 'no-cors', body });
      } catch {
        return false;
      }
      const pending = readStore(PENDING_KEY, []).filter((p) => !(p.spot === spotId && nameKey(p.name) === nameKey(myName)));
      pending.push({ spot: spotId, name: myName, in: going, t: Date.now() });
      writeStore(PENDING_KEY, pending);
      bySpot = current();
      onChange?.();
      return true;
    },
    // The pre-filled form, for when sending from the page didn't work.
    formLink(spotId, going) {
      const spot = spotsById.get(spotId);
      if (!form || !spot) return null;
      return form.viewUrl({ spot: `${spot.name} [${spot.id}]`, name: myName || '', status: going ? 'In' : 'Out' });
    },
  };
}
