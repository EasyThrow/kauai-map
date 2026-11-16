// "Suggest a spot": friends pick a point on the map and a pre-filled Google Form opens.
// Ways in: the Suggest button (then tap the map), a long-press on phones, or a
// right-click on desktop. Answers land in a private tab of the Sheet for review.

/* global maplibregl */

const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE_PX = 10;

// Swap the LAT / LNG placeholder answers in the pre-filled link for real values.
export function buildFormUrl(template, lngLat) {
  let url;
  try {
    url = new URL(template);
  } catch {
    return null;
  }
  const okHost = url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/');
  if (!okHost || url.protocol !== 'https:') return null;
  let replaced = 0;
  for (const [key, value] of [...url.searchParams]) {
    const v = value.trim().toUpperCase();
    if (v === 'LAT') url.searchParams.set(key, lngLat.lat.toFixed(5)), replaced++;
    if (v === 'LNG') url.searchParams.set(key, lngLat.lng.toFixed(5)), replaced++;
  }
  return replaced === 2 ? url.href : null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createSuggest(map, { formUrl, onStart }) {
  if (!formUrl) return { isBusy: () => false };
  if (!buildFormUrl(formUrl, { lat: 0, lng: 0 })) {
    console.warn('Suggest form link is not a Google Form pre-filled link with LAT and LNG answers; Suggest is off.');
    return { isBusy: () => false };
  }

  let picking = false;
  let suppressClickUntil = 0;
  const popup = new maplibregl.Popup({ className: 'suggest-popup', maxWidth: '280px', closeOnClick: false });
  const marker = new maplibregl.Marker({ element: el('div', 'suggest-marker') });

  // Button + "tap the map" banner
  const button = el('button', 'suggest-button');
  button.type = 'button';
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  button.append(document.createTextNode('Suggest'));
  const banner = el('div', 'suggest-banner');
  banner.setAttribute('role', 'status');
  const bannerText = el('span', null, 'Tap the map where the spot is');
  const cancel = el('button', 'suggest-cancel', 'Cancel');
  cancel.type = 'button';
  banner.append(bannerText, cancel);
  document.body.append(button, banner);

  function setPicking(on) {
    picking = on;
    document.body.classList.toggle('suggest-picking', on);
    map.getCanvas().style.cursor = on ? 'crosshair' : '';
  }

  function close() {
    popup.remove();
    marker.remove();
  }

  function offer(lngLat) {
    // The same tap also reaches the pin handler; make it stand aside.
    suppressClickUntil = Math.max(suppressClickUntil, performance.now() + 350);
    setPicking(false);
    onStart?.();
    const href = buildFormUrl(formUrl, lngLat);
    if (!href) return;
    const box = el('div', 'suggest-box');
    box.append(el('strong', null, 'Suggest a spot here?'));
    box.append(el('div', 'suggest-coords', `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`));
    // At island zoom one finger-width is several hundred meters.
    if (map.getZoom() < 13) {
      box.append(el('div', 'suggest-hint', 'Tip: zoom in first to drop it on the exact spot.'));
    }
    const go = el('a', 'btn btn-primary', 'Open suggestion form');
    go.href = href;
    go.target = '_blank';
    go.rel = 'noopener noreferrer';
    go.addEventListener('click', () => setTimeout(close, 300));
    const no = el('button', 'btn', 'Cancel');
    no.type = 'button';
    no.addEventListener('click', close);
    const actions = el('div', 'actions');
    actions.append(go, no);
    box.append(actions);
    marker.setLngLat(lngLat).addTo(map);
    popup.setLngLat(lngLat).setDOMContent(box).addTo(map);
  }

  button.addEventListener('click', () => {
    close();
    onStart?.();
    setPicking(true);
  });
  cancel.addEventListener('click', () => setPicking(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setPicking(false);
      close();
    }
  });

  map.on('click', (e) => {
    if (picking) offer(e.lngLat);
  });

  // Desktop: right-click
  map.on('contextmenu', (e) => {
    e.preventDefault();
    offer(e.lngLat);
  });

  // Phones: long-press with one finger, cancelled by moving, pinching or lifting early.
  let timer = null;
  let start = null;
  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };
  map.on('touchstart', (e) => {
    clear();
    if (e.originalEvent.touches.length !== 1) return;
    start = e.point;
    const lngLat = e.lngLat;
    timer = setTimeout(() => {
      timer = null;
      suppressClickUntil = performance.now() + 600;
      navigator.vibrate?.(15);
      offer(lngLat);
    }, LONG_PRESS_MS);
  });
  map.on('touchmove', (e) => {
    if (!timer || !start) return;
    if (e.originalEvent.touches.length !== 1 || e.point.dist(start) > MOVE_TOLERANCE_PX) clear();
  });
  map.on('touchend', clear);
  map.on('touchcancel', clear);
  map.on('movestart', clear);

  return {
    // True while the map tap belongs to the suggest tool.
    isBusy: () => picking || performance.now() < suppressClickUntil,
  };
}
