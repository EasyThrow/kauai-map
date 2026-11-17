// Stay tab: where we're sleeping. One card per row of the Sheet's Stay tab (more than
// one if the trip moves between places). Empty until a place is booked.
//
// Door codes, Wi-Fi and passwords never belong on the site. As a safety net, any
// line that looks like one is dropped here and reported in ?debug=1.
import { parseDate, parseTime, formatDate, formatTime } from '../plan.js';
import { splitCoordPair } from '../data.js';
import { copyText } from '../share.js';
import {
  directionsUrl,
  appleMapsUrl,
  directionsToAddress,
  appleMapsToAddress,
  isApplePlatform,
  safeUrl,
} from '../format.js';

const APPLE = isApplePlatform();
const SECRET = /\b(door|gate|lock|lockbox|key\s*box|keypad|garage|entry|access)\s*(code|combo|pin)\b|\bwi-?fi\b|\bpass(word|code)\b|\bwifi\b/i;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const list = (value, sep) =>
  String(value || '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

export function parseStay(rows) {
  const warnings = [];
  const places = [];
  for (const raw of rows) {
    const r = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '').trim()]),
    );
    if (!r.name && !r.address) continue;
    // Drop anything that looks like a code or password, field by field.
    const safe = (key, value) => {
      if (!SECRET.test(value) && !SECRET.test(key)) return value;
      warnings.push({ row: raw.__row, label: 'Stay', msg: `hid "${key}": looks like a code or password; keep those off the Sheet` });
      return '';
    };
    for (const key of Object.keys(r)) if (key !== 'notes') r[key] = safe(key, r[key]);
    const notes = list(r.notes, '//').filter((n) => safe('notes', n));

    const pair = splitCoordPair(r.lat || '');
    const lat = Number(pair ? pair.lat : r.lat);
    const lng = Number(pair ? pair.lng : r.lng);
    const hasCoords = (r.lat || '') !== '' && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;

    places.push({
      row: raw.__row,
      name: r.name || 'Our place',
      address: r.address,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      checkIn: parseDate(r.check_in),
      checkInTime: parseTime(r.check_in_time),
      checkOut: parseDate(r.check_out),
      checkOutTime: parseTime(r.check_out_time),
      sleeping: r.sleeping,
      parking: r.parking,
      host: r.host,
      notes,
      links: list(r.links, ';;')
        .map((p) => {
          const i = p.indexOf('|');
          return i < 0 ? null : { label: p.slice(0, i).trim(), url: p.slice(i + 1).trim() };
        })
        .filter(Boolean),
      photo: safeUrl(r.photo_url || ''),
    });
  }
  return { places, warnings };
}

function linkButton(label, href, primary) {
  const a = el('a', primary ? 'btn btn-primary' : 'btn', label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function placeCard(p) {
  const card = el('article', 'plan-card stay-card');
  if (p.photo) {
    const fig = el('figure', 'stay-photo');
    const img = el('img');
    img.src = p.photo;
    img.alt = p.name;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => fig.remove());
    fig.append(img);
    card.append(fig);
  }
  card.append(el('h2', 'plan-title stay-name', p.name));
  if (p.address) card.append(el('p', 'stay-address', p.address));

  const facts = el('dl', 'plan-facts');
  const fact = (label, value) => value && facts.append(el('dt', null, label), el('dd', null, value));
  const when = (d, t) => [d && formatDate(d), t && formatTime(t)].filter(Boolean).join(' · ');
  fact('Check-in', when(p.checkIn, p.checkInTime));
  fact('Check-out', when(p.checkOut, p.checkOutTime));
  if (p.checkIn && p.checkOut) {
    const nights = p.checkOut.utcDay - p.checkIn.utcDay;
    if (nights > 0) fact('Nights', String(nights));
  }
  // "Main: Sam + Alex // Loft: Jordan" -> one line each
  if (p.sleeping) {
    const dd = el('dd');
    for (const line of list(p.sleeping, '//')) dd.append(el('span', 'stay-lines', line));
    facts.append(el('dt', null, 'Sleeping'), dd);
  }
  fact('Parking', p.parking);
  fact('Host', p.host);
  if (facts.childElementCount) card.append(facts);

  if (p.notes.length) {
    const ul = el('ul', 'notes');
    for (const n of p.notes) ul.append(el('li', null, n));
    card.append(ul);
  }

  const actions = el('div', 'actions');
  const dest = p.lat != null ? null : p.address;
  if (p.lat != null || dest) {
    const google = p.lat != null ? directionsUrl(p.lat, p.lng) : directionsToAddress(dest);
    const apple = p.lat != null ? appleMapsUrl(p.lat, p.lng) : appleMapsToAddress(dest);
    if (APPLE) actions.append(linkButton('Apple Maps', apple, true), linkButton('Google Maps', google, false));
    else actions.append(linkButton('Directions', google, true));
  }
  if (p.address) {
    const b = el('button', 'btn', 'Copy address');
    b.type = 'button';
    b.addEventListener('click', async () => {
      const ok = await copyText(p.address);
      b.textContent = ok ? 'Copied' : p.address;
      if (ok) setTimeout(() => (b.textContent = 'Copy address'), 1800);
    });
    actions.append(b);
  }
  for (const link of p.links) {
    const href = safeUrl(link.url);
    if (href) actions.append(linkButton(link.label || 'Link', href, false));
  }
  if (actions.childElementCount) card.append(actions);
  return card;
}

export function createStayPanel() {
  const panel = el('section', 'tab-panel stay');
  panel.dataset.tab = 'stay';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Where we are staying');
  const inner = el('div', 'plan-inner');
  panel.append(inner);
  document.body.append(panel);

  return {
    render(places) {
      const frag = document.createDocumentFragment();
      frag.append(el('h1', 'plan-heading', 'Stay'));
      if (!places.length) {
        const empty = el('div', 'plan-empty');
        empty.append(
          el('p', 'plan-empty-title', 'Not booked yet'),
          el('p', null, 'Where we are staying shows up here once it is added to the Stay tab of the trip Sheet.'),
        );
        frag.append(empty);
      } else {
        const listEl = el('div', 'plan-day-list');
        for (const p of places) listEl.append(placeCard(p));
        frag.append(listEl);
      }
      inner.replaceChildren(frag);
    },
  };
}
