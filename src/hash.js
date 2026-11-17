// URL hash state, e.g. #spot=example-beach&cats=beach,snorkel, #day=3, #tab=plan&event=x
// Kept in the hash (not localStorage) so a texted link opens the same view.

function params() {
  return new URLSearchParams(location.hash.replace(/^#/, ''));
}

export function readHash() {
  const p = params();
  const cats = p.get('cats');
  return {
    tab: p.get('tab') || 'map',
    spot: p.get('spot') || null,
    cats: cats == null ? null : cats.split(',').filter(Boolean),
    day: p.get('day') || null,
    event: p.get('event') || null,
  };
}

export function writeHash(patch) {
  const p = params();
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) p.delete(key);
    else p.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  // Keep commas readable in the address bar.
  const s = p.toString().replace(/%2C/gi, ',');
  history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
}

export function onHashChange(fn) {
  window.addEventListener('hashchange', () => fn(readHash()));
}
