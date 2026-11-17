import { createMap } from './map.js';
import { loadSpots, loadPlanRows } from './data.js';
import { addPinImages, addSpotLayers, setSpots, wireSpotClicks } from './pins.js';
import { readHash, writeHash, onHashChange } from './hash.js';
import { createSheet } from './ui/sheet.js';
import { wireTooltip } from './ui/tooltip.js';
import { createFilters, FILTER_KEYS } from './ui/filters.js';
import { createList } from './ui/list.js';
import { createSuggest } from './ui/suggest.js';
import { createTabs } from './ui/tabs.js';
import { createPlanPanel } from './ui/plan.js';
import { SUGGEST_FORM_URL } from './config.js';
import { validateSpots, logReport } from './validate.js';
import { parsePlan, tripSummary, nowEpoch, formatDate } from './plan.js';
import { createDebugPanel } from './ui/debug.js';

// ?debug=1 shows every row (skipped ones in red), dashed unverified pins and a checks panel.
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

// Zoom at which clusters have broken apart, so a deep-linked pin is visible.
const SPOT_ZOOM = 15;
const DESKTOP = window.matchMedia('(min-width: 900px)');
const SIDEBAR_SPACE = 344; // desktop list width + gap, kept clear on the map

const map = createMap('map');

// Exposed only for local debugging in the browser console.
if (import.meta.env.DEV) window.__map = map;

// Start downloading the Sheet tabs right away, alongside the map style.
const dataReady = Promise.all([loadSpots(), loadPlanRows()]);

// Tabs and the plan panel exist from the start; the map stays rendered underneath.
const planPanel = createPlanPanel({ onShowSpot: (id) => showSpotFromPlan?.(id) });
let showSpotFromPlan = null;
let onTabShown = () => {};
const tabs = createTabs({ active: readHash().tab, onChange: (id) => setTab(id) });

function setTab(id, { updateHash = true } = {}) {
  const tab = tabs.set(id);
  if (updateHash) writeHash({ tab: tab === 'map' ? null : tab, ...(tab !== 'map' ? { spot: null } : { event: null }) });
  onTabShown(tab);
}

// Filters from the URL (#cats=beach,hike); all on when absent.
function activeFromHash() {
  const { cats } = readHash();
  if (!cats) return new Set(FILTER_KEYS);
  return new Set(cats.filter((c) => FILTER_KEYS.includes(c)));
}

const isVisible = (spot, active, daySpots) =>
  spot.skipped ||
  spot.primary === 'home' ||
  (spot.categories.some((c) => active.has(c)) && (!daySpots || daySpots.has(spot.id)));

// Spots + plan, checked and cross-linked. Doesn't need the map, so the Plan tab works
// even if the map is slow or can't start.
const prepared = dataReady.then(([{ spots, source }, planTab]) => {
  if (source === 'saved' || planTab.source === 'saved') showNote('Showing saved data');
  const report = validateSpots(spots);
  logReport(report);

  // Debug view also draws skipped rows that have usable coordinates.
  const placeable = DEBUG
    ? [
        ...report.valid,
        ...report.skipped
          .map(({ spot }) => ({ ...spot, skipped: true }))
          .filter((s) => s.lat != null && s.lng != null && s.id),
      ]
    : report.valid;
  const spotsById = new Map();
  for (const s of placeable) if (!spotsById.has(s.id)) spotsById.set(s.id, s);

  const { events, warnings: planWarnings } = parsePlan(planTab.rows, spotsById);
  if (planWarnings.length) {
    console.groupCollapsed(`Plan: ${planWarnings.length} note${planWarnings.length === 1 ? '' : 's'}`);
    for (const w of planWarnings) console.info(`Plan row ${w.row} (${w.label}): ${w.msg}`);
    console.groupEnd();
  }
  const trip = tripSummary(events, nowEpoch());
  // Which spots each day visits, and which plan items each spot is in.
  const spotsByDay = new Map();
  const plannedBySpot = new Map();
  for (const e of events) {
    if (!e.spotId) continue;
    const n = String(trip.dayNumber(e.date));
    if (!spotsByDay.has(n)) spotsByDay.set(n, { set: new Set(), date: e.date });
    spotsByDay.get(n).set.add(e.spotId);
    if (!plannedBySpot.has(e.spotId)) plannedBySpot.set(e.spotId, []);
    plannedBySpot.get(e.spotId).push({ event: e, dayNumber: Number(n) });
  }
  const dayOptions = [...spotsByDay.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([n, { date }]) => ({ value: n, label: `Day ${n} · ${formatDate(date)}` }));

  planPanel.render({ events, spotsById, now: nowEpoch(), highlightId: readHash().event });
  if (readHash().tab === 'plan') {
    if (readHash().event) planPanel.scrollToEvent(readHash().event);
    else planPanel.scrollToToday();
  }
  // The countdown and "Up next" follow the clock.
  setInterval(() => document.body.classList.contains('tab-plan') && planPanel.refresh(nowEpoch()), 60000);

  return { report, placeable, spotsById, events, planWarnings, spotsByDay, plannedBySpot, dayOptions };
});
prepared.catch((err) => {
  console.error(err);
  showNote('Trip data could not be loaded. Try refreshing.');
});

map.on('load', async () => {
  try {
    const [{ report, placeable, spotsById, events, planWarnings, spotsByDay, plannedBySpot, dayOptions }] =
      await Promise.all([prepared, addPinImages(map)]);

    // --- Map ------------------------------------------------------------------------
    let active = activeFromHash();
    let day = spotsByDay.has(readHash().day) ? readHash().day : null;
    const daySpots = () => (day ? spotsByDay.get(day)?.set : null);
    let visible = placeable.filter((s) => isVisible(s, active, daySpots()));
    addSpotLayers(map, visible, { debug: DEBUG });

    const sheet = createSheet({ onClose: () => writeHash({ spot: null }) });

    function select(id, { zoomIn = false, animate = true } = {}) {
      const spot = spotsById.get(id);
      if (!spot) return;
      sheet.open(spot, {
        planned: plannedBySpot.get(id) || [],
        onPlanEvent: (eventId) => {
          setTab('plan');
          writeHash({ event: eventId });
          planPanel.scrollToEvent(eventId);
        },
      });
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

    function applyFilters({ updateHash = true } = {}) {
      visible = placeable.filter((s) => isVisible(s, active, daySpots()));
      setSpots(map, visible);
      list.render(visible, active);
      if (sheet.currentId && !visible.some((s) => s.id === sheet.currentId)) sheet.hide();
      if (updateHash) writeHash({ cats: active.size === FILTER_KEYS.length ? null : [...active], day });
    }

    const filters = createFilters({
      active: new Set(active),
      onChange: (next) => {
        active = next;
        applyFilters();
      },
      days: dayOptions,
      day,
      onDayChange: (next) => {
        day = next;
        applyFilters();
      },
    });
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
    if (DEBUG) {
      createDebugPanel({
        report: {
          ...report,
          warnings: [
            ...report.warnings,
            ...planWarnings.map((w) => ({ ...w, id: null, level: 'warn', label: `Plan: ${w.label}` })),
          ],
        },
        onPick: (id) => select(id, { zoomIn: true }),
      });
    }

    // "Show on map" from a plan card: make sure the pin isn't filtered out, then open it.
    showSpotFromPlan = (id) => {
      if (!visible.some((s) => s.id === id)) {
        active = new Set(FILTER_KEYS);
        day = null;
        filters.set(active);
        filters.setDay(null);
        applyFilters();
      }
      setTab('map');
      select(id, { zoomIn: true });
    };

    // Leaving the map closes its panels; the desktop list sidebar comes back with it.
    onTabShown = (tab) => {
      if (tab !== 'map') {
        sheet.hide({ silent: true });
        if (!DESKTOP.matches) list.setOpen(false);
      } else map.resize();
      if (tab === 'plan') {
        planPanel.refresh(nowEpoch());
        if (!readHash().event) planPanel.scrollToToday();
      }
    };

    // Deep links: #spot=..., #cats=..., #day=3, #tab=plan&event=...
    const initial = readHash();
    if (initial.tab === 'map' && initial.spot) select(initial.spot, { zoomIn: true, animate: false });
    onHashChange((h) => {
      if (document.body.classList.contains(`tab-${h.tab}`) === false) setTab(h.tab, { updateHash: false });
      const fromHash = activeFromHash();
      const nextDay = spotsByDay.has(h.day) ? h.day : null;
      if ([...fromHash].join() !== [...active].join() || nextDay !== day) {
        active = fromHash;
        day = nextDay;
        filters.set(active);
        filters.setDay(day);
        applyFilters({ updateHash: false });
      }
      if (h.tab === 'plan' && h.event) planPanel.scrollToEvent(h.event);
      if (h.tab !== 'map') return;
      if (h.spot && h.spot !== sheet.currentId) select(h.spot, { zoomIn: true });
      else if (!h.spot) sheet.hide({ silent: true });
    });

    if (import.meta.env.DEV) Object.assign(window, { __spots: placeable, __events: events });
  } catch (err) {
    // Data problems are reported by `prepared`; this is a map-side failure.
    console.error(err);
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
