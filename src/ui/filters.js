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

  function sync() {
    for (const [key, chip] of chips) {
      const on = active.has(key);
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', String(on));
    }
  }

  sync();
  (document.querySelector('.top-bar') || document.body).append(bar);
  return {
    set(next) {
      active = new Set(next);
      sync();
    },
  };
}
