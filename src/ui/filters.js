// Category filter chips, pinned along the top, plus an optional "Day" picker that limits
// the map to one day of the plan. Home base is always shown, so it has no chip.
import { CATEGORIES } from '../config.js';
import { ICON_SVG } from '../pins.js';

export const FILTER_KEYS = Object.keys(CATEGORIES).filter((k) => k !== 'home');

// days: [{ value: '3', label: 'Day 3 · Sat, Feb 15' }]; day: the selected value or null.
export function createFilters({ active, onChange, days = [], day = null, onDayChange }) {
  const bar = document.createElement('nav');
  bar.className = 'filters';
  bar.setAttribute('aria-label', 'Show categories');

  const chips = new Map();
  for (const key of FILTER_KEYS) {
    const cat = CATEGORIES[key];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.style.setProperty('--cat', cat.color);
    // Icons are our own bundled SVG files, not Sheet data.
    chip.innerHTML = `<span class="chip-icon" aria-hidden="true">${ICON_SVG[cat.icon]}</span>`;
    chip.append(document.createTextNode(cat.label));
    chip.addEventListener('click', () => {
      if (active.has(key)) active.delete(key);
      else active.add(key);
      sync();
      onChange(new Set(active));
    });
    chips.set(key, chip);
    bar.append(chip);
  }

  // Day picker: only when the plan links spots to days.
  let select = null;
  if (days.length) {
    const wrap = document.createElement('label');
    wrap.className = 'chip chip-day';
    select = document.createElement('select');
    select.setAttribute('aria-label', 'Show one day of the plan');
    select.append(new Option('All days', ''));
    for (const d of days) select.append(new Option(d.label, d.value));
    select.value = day ?? '';
    select.addEventListener('change', () => {
      day = select.value || null;
      sync();
      onDayChange?.(day);
    });
    wrap.append(select);
    bar.append(wrap);
  }

  // "Reset filters": only shown while a category is off or a day is picked.
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'filters-reset';
  reset.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>';
  reset.append(document.createTextNode('Reset filters'));
  reset.addEventListener('click', () => {
    active = new Set(FILTER_KEYS);
    const hadDay = day != null;
    day = null;
    sync();
    onChange(new Set(active));
    if (hadDay) onDayChange?.(null);
  });

  function sync() {
    for (const [key, chip] of chips) {
      const on = active.has(key);
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', String(on));
    }
    if (select) {
      select.value = day ?? '';
      select.parentElement.classList.toggle('on', day != null);
    }
    reset.hidden = active.size === FILTER_KEYS.length && day == null;
  }

  sync();
  const host = document.querySelector('.top-bar') || document.body;
  host.append(bar, reset);
  return {
    set(next) {
      active = new Set(next);
      sync();
    },
    setDay(next) {
      day = next ?? null;
      sync();
    },
  };
}
