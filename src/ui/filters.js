// Category filter chips, pinned along the top. Home base is always shown, so it has no chip.
import { CATEGORIES } from '../config.js';
import { ICON_SVG } from '../pins.js';

export const FILTER_KEYS = Object.keys(CATEGORIES).filter((k) => k !== 'home');

export function createFilters({ active, onChange }) {
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

  // "Reset filters": only shown while at least one category is off.
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'filters-reset';
  reset.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>';
  reset.append(document.createTextNode('Reset filters'));
  reset.addEventListener('click', () => {
    active = new Set(FILTER_KEYS);
    sync();
    onChange(new Set(active));
  });

  function sync() {
    for (const [key, chip] of chips) {
      const on = active.has(key);
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', String(on));
    }
    reset.hidden = active.size === FILTER_KEYS.length;
  }

  sync();
  const host = document.querySelector('.top-bar') || document.body;
  host.append(bar, reset);
  return {
    set(next) {
      active = new Set(next);
      sync();
    },
  };
}
