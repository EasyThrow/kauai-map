// List of visible spots, grouped by category and sorted by drive time.
// Phone: bottom drawer opened by the List button. Desktop: collapsible left sidebar.
import { CATEGORIES } from '../config.js';
import { ICON_SVG } from '../pins.js';
import { formatDrive } from '../format.js';

const DESKTOP = window.matchMedia('(min-width: 900px)');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const bySpotOrder = (a, b) =>
  (a.driveMin ?? 9999) - (b.driveMin ?? 9999) ||
  (a.sort ?? 9999) - (b.sort ?? 9999) ||
  a.name.localeCompare(b.name);

// A spot is listed under its primary category if that filter is on, otherwise under
// the first of its other categories that is on.
function groupFor(spot, active) {
  if (spot.primary === 'home') return 'home';
  if (active.has(spot.primary)) return spot.primary;
  return spot.categories.find((c) => active.has(c)) || spot.primary;
}

export function createList({ onPick, onToggle }) {
  const panel = el('aside', 'list-panel');
  panel.setAttribute('aria-label', 'List of spots');
  const head = el('div', 'list-head');
  const grip = el('div', 'sheet-grip list-grip');
  grip.append(el('span', 'grip-bar'));
  const title = el('h2', 'list-title', 'Spots');
  const close = el('button', 'list-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close list');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>';
  head.append(title, close);
  const body = el('div', 'list-body');
  panel.append(grip, head, body);

  const button = el('button', 'list-button');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"/></svg>';
  button.append(document.createTextNode('List'));

  document.body.append(panel, button);

  let isOpen = false;
  function setOpen(open) {
    isOpen = open;
    panel.classList.toggle('open', open);
    document.body.classList.toggle('list-open', open);
    button.setAttribute('aria-expanded', String(open));
    onToggle?.(open);
  }
  button.addEventListener('click', () => setOpen(!isOpen));
  close.addEventListener('click', () => setOpen(false));

  // Phone: swipe the drawer down to close.
  let startY = null;
  grip.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointerup', (e) => {
    if (startY != null && e.clientY - startY > 40) setOpen(false);
    startY = null;
  });

  function render(spots, active) {
    title.textContent = `${spots.length} spot${spots.length === 1 ? '' : 's'}`;
    const groups = new Map();
    for (const key of [...Object.keys(CATEGORIES).filter((k) => k !== 'home'), 'home']) groups.set(key, []);
    for (const s of spots) groups.get(groupFor(s, active))?.push(s);

    const frag = document.createDocumentFragment();
    for (const [key, items] of groups) {
      if (!items.length) continue;
      const cat = CATEGORIES[key];
      const section = el('section', 'list-group');
      section.append(el('h3', 'list-group-title', cat.label));
      const ul = el('ul');
      for (const s of items.sort(bySpotOrder)) {
        const li = el('li');
        const item = el('button', 'list-item');
        item.type = 'button';
        const icon = el('span', 'list-icon');
        icon.style.setProperty('--cat', CATEGORIES[s.primary]?.color || cat.color);
        icon.innerHTML = ICON_SVG[CATEGORIES[s.primary]?.icon || cat.icon];
        const text = el('span', 'list-text');
        text.append(el('span', 'list-name', s.name));
        const drive = formatDrive(s.driveMin);
        if (drive) text.append(el('span', 'list-meta', drive));
        item.append(icon, text);
        item.addEventListener('click', () => {
          if (!DESKTOP.matches) setOpen(false);
          onPick(s.id);
        });
        li.append(item);
        ul.append(li);
      }
      section.append(ul);
      frag.append(section);
    }
    if (!spots.length) frag.append(el('p', 'list-empty', 'No categories selected. Turn one on above.'));
    body.replaceChildren(frag);
  }

  // Desktop starts with the sidebar open; phones start with the map.
  setOpen(DESKTOP.matches);

  return {
    render,
    setOpen,
    get isOpen() {
      return isOpen;
    },
  };
}
