// URL hash state, e.g. #spot=koloa-landing&cats=beach,snorkel
// Kept in the hash (not localStorage) so a texted link opens the same view.

function params() {
  return new URLSearchParams(location.hash.replace(/^#/, ''));
}

export function readHash() {
  const p = params();
  const cats = p.get('cats');
  return {
    spot: p.get('spot') || null,
    cats: cats == null ? null : cats.split(',').filter(Boolean),
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
