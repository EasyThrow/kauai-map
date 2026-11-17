// Spot details: bottom sheet on phones (drag up to full height, swipe down to close),
// side panel on desktop. All Sheet text goes in through textContent, never innerHTML.
import { CATEGORIES } from '../config.js';
import {
  formatDrive,
  formatPrice,
  tagLabel,
  CAUTION_TAGS,
  directionsUrl,
  appleMapsUrl,
  coordText,
  isApplePlatform,
  safeUrl,
} from '../format.js';
import { copyText, shareButton, siteLink } from '../share.js';
import { formatDate, formatTime } from '../plan.js';

const APPLE = isApplePlatform();

function copyButton(spot) {
  const text = coordText(spot.lat, spot.lng);
  const b = el('button', 'btn', 'Copy location');
  b.type = 'button';
  b.title = text;
  b.addEventListener('click', async () => {
    const ok = await copyText(text);
    // If copying is blocked, show the coordinates so they can be selected by hand.
    b.textContent = ok ? 'Copied' : text;
    b.classList.toggle('btn-done', ok);
    if (ok) {
      setTimeout(() => {
        b.textContent = 'Copy location';
        b.classList.remove('btn-done');
      }, 1800);
    }
  });
  return b;
}

const DESKTOP = window.matchMedia('(min-width: 900px)');
const HALF = 0.55; // share of the viewport the sheet covers when it first opens

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function linkButton(label, href, primary) {
  const a = el('a', primary ? 'btn btn-primary' : 'btn', label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

// planned: [{ event, dayNumber }] for plan items at this spot; onPlanEvent opens one.
// interest: optional () => element with who's in and the I'm in button.
function renderSpot(spot, { planned = [], onPlanEvent, interest } = {}) {
  const frag = document.createDocumentFragment();

  if (spot.photo) {
    const src = safeUrl(spot.photo.url);
    if (src) {
      const fig = el('figure', 'sheet-photo');
      const img = el('img');
      img.src = src;
      img.alt = spot.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => fig.remove());
      fig.append(img);
      const credit = [spot.photo.credit, spot.photo.license].filter(Boolean).join(' · ');
      if (credit) fig.append(el('figcaption', null, `Photo: ${credit}`));
      frag.append(fig);
    }
  }

  const body = el('div', 'sheet-body');
  body.append(el('h2', 'sheet-title', spot.name));

  const badges = el('div', 'badges');
  for (const c of spot.categories) {
    const cat = CATEGORIES[c];
    if (!cat) continue;
    const b = el('span', 'badge', cat.label);
    b.style.setProperty('--cat', cat.color);
    badges.append(b);
  }
  body.append(badges);

  if (spot.tags.length) {
    const tags = el('div', 'tags');
    for (const t of spot.tags) tags.append(el('span', CAUTION_TAGS.has(t) ? 'tag tag-caution' : 'tag', tagLabel(t)));
    body.append(tags);
  }

  const drive = formatDrive(spot.driveMin);
  if (drive) {
    const row = el('p', 'drive');
    row.append(el('span', 'drive-label', 'Drive from home base'), el('span', 'drive-value', drive));
    body.append(row);
  }

  // "In the plan: Day 3 · Sat, Feb 15 · 9:00 AM · Tunnels snorkel"
  for (const { event, dayNumber } of planned) {
    const when = [`Day ${dayNumber}`, formatDate(event.date), event.start && formatTime(event.start)]
      .filter(Boolean)
      .join(' · ');
    const b = el('button', 'planned');
    b.type = 'button';
    b.append(el('span', 'planned-label', 'In the plan'), el('span', null, `${when} · ${event.title}`));
    b.addEventListener('click', () => onPlanEvent?.(event.id));
    body.append(b);
  }

  if (interest) body.append(interest());

  if (spot.notes.length) {
    const ul = el('ul', 'notes');
    for (const n of spot.notes) ul.append(el('li', null, n));
    body.append(ul);
  }

  const price = spot.primary === 'restaurant' ? formatPrice(spot.pricePp) : null;
  if (price) body.append(el('p', 'price', price));

  const actions = el('div', 'actions');
  if (spot.primary !== 'home') {
    // Apple devices: Apple Maps first, Google as the alternative. Everyone else: Google.
    if (APPLE) {
      actions.append(
        linkButton('Apple Maps', appleMapsUrl(spot.lat, spot.lng), true),
        linkButton('Google Maps', directionsUrl(spot.lat, spot.lng), false),
      );
    } else {
      actions.append(linkButton('Directions', directionsUrl(spot.lat, spot.lng), true));
    }
    actions.append(copyButton(spot));
  }
  actions.append(
    shareButton(() => ({ title: spot.name, text: `${spot.name} (Kauai trip map)`, url: siteLink(`#spot=${encodeURIComponent(spot.id)}`) })),
  );
  for (const link of spot.links) {
    const href = safeUrl(link.url);
    if (href) actions.append(linkButton(link.label || 'Link', href, false));
  }
  if (actions.childElementCount) body.append(actions);

  frag.append(body);
  return frag;
}

export function createSheet({ onClose }) {
  const sheet = el('aside', 'sheet');
  sheet.setAttribute('aria-hidden', 'true');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Spot details');

  const grip = el('div', 'sheet-grip');
  grip.append(el('span', 'grip-bar'));
  const close = el('button', 'sheet-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>';
  const content = el('div', 'sheet-content');
  sheet.append(grip, close, content);
  document.body.append(sheet);

  let state = 'closed'; // closed | half | full
  let currentId = null;

  const vh = () => window.innerHeight;
  const offsetFor = (s) => {
    if (DESKTOP.matches) return 0;
    const h = sheet.offsetHeight;
    if (s === 'full') return 0;
    if (s === 'half') return Math.max(0, h - vh() * HALF);
    return h + 24;
  };

  function apply(s, animate = true) {
    state = s;
    sheet.classList.toggle('no-anim', !animate);
    sheet.classList.toggle('open', s !== 'closed');
    sheet.classList.toggle('full', s === 'full');
    sheet.setAttribute('aria-hidden', String(s === 'closed'));
    if (!DESKTOP.matches) sheet.style.transform = `translateY(${offsetFor(s)}px)`;
    else sheet.style.transform = '';
  }

  function open(spot, extras) {
    currentId = spot.id;
    content.replaceChildren(renderSpot(spot, extras));
    content.scrollTop = 0;
    apply(state === 'full' ? 'full' : 'half');
  }

  function hide({ silent = false } = {}) {
    if (state === 'closed') return;
    apply('closed');
    currentId = null;
    if (!silent) onClose?.();
  }

  close.addEventListener('click', () => hide());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  // Drag on the grip: up to expand, down to shrink or close. A tap toggles half/full.
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    if (DESKTOP.matches || state === 'closed') return;
    grip.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, start: offsetFor(state), moved: 0, t: performance.now() };
    sheet.classList.add('no-anim');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.moved = e.clientY - drag.y;
    const y = Math.max(0, drag.start + drag.moved);
    sheet.style.transform = `translateY(${y}px)`;
  });
  const endDrag = (e) => {
    if (!drag) return;
    const { moved, start, t } = drag;
    drag = null;
    sheet.classList.remove('no-anim');
    if (Math.abs(moved) < 6) {
      apply(state === 'full' ? 'half' : 'full');
      return;
    }
    const velocity = moved / Math.max(1, performance.now() - t); // px per ms
    const y = start + moved;
    if (velocity > 0.6 || y > offsetFor('half') + 80) {
      if (state === 'full' && y < offsetFor('half') + 80) apply('half');
      else hide();
    } else if (velocity < -0.6 || y < offsetFor('half') / 2) apply('full');
    else apply('half');
    e.preventDefault();
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // Scrolling the content up while half open expands the sheet first.
  content.addEventListener(
    'wheel',
    (e) => {
      if (!DESKTOP.matches && state === 'half' && e.deltaY > 0) apply('full');
    },
    { passive: true },
  );
  let touchY = null;
  content.addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true });
  content.addEventListener(
    'touchmove',
    (e) => {
      if (touchY == null || DESKTOP.matches) return;
      const dy = e.touches[0].clientY - touchY;
      if (state === 'half' && dy < -12) {
        apply('full');
        touchY = null;
      } else if (state === 'full' && content.scrollTop <= 0 && dy > 60) {
        apply('half');
        touchY = null;
      }
    },
    { passive: true },
  );

  window.addEventListener('resize', () => apply(state, false));
  DESKTOP.addEventListener('change', () => apply(state, false));
  apply('closed', false);

  return {
    open,
    hide,
    get currentId() {
      return currentId;
    },
    // Space the map should keep clear so the selected pin stays visible.
    obscured() {
      if (state === 'closed') return { bottom: 0, right: 0 };
      if (DESKTOP.matches) return { bottom: 0, right: sheet.offsetWidth + 24 };
      return { bottom: Math.min(vh() * HALF, sheet.offsetHeight), right: 0 };
    },
  };
}
