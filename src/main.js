import { createMap } from './map.js';
import { loadSpots } from './data.js';
import { addPinImages, addSpotLayers, setSpots, wireSpotClicks } from './pins.js';
import { readHash, writeHash, onHashChange } from './hash.js';
import { createSheet } from './ui/sheet.js';
import { wireTooltip } from './ui/tooltip.js';
import { createFilters, FILTER_KEYS } from './ui/filters.js';
import { createList } from './ui/list.js';
import { createSuggest } from './ui/suggest.js';
import { SUGGEST_FORM_URL } from './config.js';

// Zoom at which clusters have broken apart, so a deep-linked pin is visible.
const SPOT_ZOOM = 15;
const DESKTOP = window.matchMedia('(min-width: 900px)');
const SIDEBAR_SPACE = 344; // desktop list width + gap, kept clear on the map

const map = createMap('map');

// Exposed only for local debugging in the browser console.
if (import.meta.env.DEV) window.__map = map;

// Filters from the URL (#cats=beach,hike); all on when absent.
function activeFromHash() {
  const { cats } = readHash();
  if (!cats) return new Set(FILTER_KEYS);
  return new Set(cats.filter((c) => FILTER_KEYS.includes(c)));
}

const isVisible = (spot, active) =>
  spot.primary === 'home' || spot.categories.some((c) => active.has(c));

map.on('load', async () => {
  try {
    const [{ spots, source }] = await Promise.all([loadSpots(), addPinImages(map)]);
    if (source === 'saved') showNote('Showing saved data');
    const placeable = spots.filter((s) => s.lat != null && s.lng != null && s.id);
    const spotsById = new Map(placeable.map((s) => [s.id, s]));
    let active = activeFromHash();
    let visible = placeable.filter((s) => isVisible(s, active));
    addSpotLayers(map, visible);

    const sheet = createSheet({ onClose: () => writeHash({ spot: null }) });

    function select(id, { zoomIn = false, animate = true } = {}) {
      const spot = spotsById.get(id);
      if (!spot) return;
      sheet.open(spot);
      writeHash({ spot: id });
      const { bottom, right } = sheet.obscured();
      const move = {
        center: [spot.lng, spot.lat],
        zoom: zoomIn ? Math.max(map.getZoom(), SPOT_ZOOM) : map.getZoom(),
        // Shift the pin into the part of the map the sheet doesn't cover.
        offset: [-right / 2, -bottom / 2],
      };
      // jumpTo ignores offset, so an instant move is a zero-length easeTo.
      map.easeTo({ ...move, duration: animate ? 600 : 0 });
    }

    const list = createList({
      onPick: (id) => select(id, { zoomIn: true }),
      onToggle: (open) => {
        // Desktop: keep the sidebar's strip of map clear. Phone: drawer replaces the sheet.
        if (DESKTOP.matches) map.easeTo({ padding: { left: open ? SIDEBAR_SPACE : 0 }, duration: 300 });
        else if (open) sheet.hide();
      },
    });

    function applyFilters(next, { updateHash = true } = {}) {
      active = next;
      visible = placeable.filter((s) => isVisible(s, active));
      setSpots(map, visible);
      list.render(visible, active);
      if (sheet.currentId && !visible.some((s) => s.id === sheet.currentId)) sheet.hide();
      if (updateHash) writeHash({ cats: active.size === FILTER_KEYS.length ? null : [...active] });
    }

    const filters = createFilters({ active: new Set(active), onChange: (next) => applyFilters(next) });
    list.render(visible, active);

    const suggest = createSuggest(map, {
      formUrl: SUGGEST_FORM_URL,
      onStart: () => {
        sheet.hide();
        if (!DESKTOP.matches) list.setOpen(false);
      },
    });

    wireSpotClicks(map, {
      onSpot: (id) => select(id),
      onEmpty: () => sheet.hide(),
      isBusy: suggest.isBusy,
    });
    wireTooltip(map, spotsById);

    // Deep links: #spot=koloa-landing&cats=beach,snorkel
    const { spot } = readHash();
    if (spot) select(spot, { zoomIn: true, animate: false });
    onHashChange(({ spot: id }) => {
      const fromHash = activeFromHash();
      if ([...fromHash].join() !== [...active].join()) {
        filters.set(fromHash);
        applyFilters(fromHash, { updateHash: false });
      }
      if (id && id !== sheet.currentId) select(id, { zoomIn: true });
      else if (!id) sheet.hide({ silent: true });
    });

    if (import.meta.env.DEV) window.__spots = placeable;
  } catch (err) {
    console.error(err);
    showNote('Spots could not be loaded. Try refreshing.');
  }
});

// Small status pill under the filter chips.
function showNote(text) {
  const note = document.createElement('div');
  note.className = 'data-note';
  note.setAttribute('role', 'status');
  note.textContent = text;
  (document.querySelector('.top-bar') || document.body).append(note);
}
