// Site tabs: bottom bar on phones, top-right tabs on desktop.
// Each tab has its own link (#tab=plan); the map is the default and has no tab param.
import mapIcon from '../../icons/map.svg?raw';
import planIcon from '../../icons/calendar-event.svg?raw';

export const TABS = [
  { id: 'map', label: 'Map', icon: mapIcon },
  { id: 'plan', label: 'Plan', icon: planIcon },
];

export function createTabs({ active, onChange }) {
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Sections');
  const buttons = new Map();
  for (const tab of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    // Icons are our own bundled SVG files.
    b.innerHTML = `<span class="tab-icon" aria-hidden="true">${tab.icon}</span>`;
    b.append(document.createTextNode(tab.label));
    b.addEventListener('click', () => onChange(tab.id));
    buttons.set(tab.id, b);
    nav.append(b);
  }
  document.body.append(nav);

  function set(id) {
    const tab = TABS.some((t) => t.id === id) ? id : 'map';
    for (const [key, b] of buttons) {
      const on = key === tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    for (const t of TABS) document.body.classList.toggle(`tab-${t.id}`, t.id === tab);
    for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.dataset.tab !== tab;
    return tab;
  }

  set(active);
  return { set };
}
