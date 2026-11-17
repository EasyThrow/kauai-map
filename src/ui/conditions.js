// Conditions tab: alerts, sunrise/sunset, forecast (home base or north shore), surf by
// shore, tides, an on-demand Windy weather map, and the "Before you go" offline card.
// Data text goes in through textContent; icons are our own bundled SVGs.
import { loadConditions, savedConditions, isFresh, sunTimes, clock, TIDE_STATION } from '../conditions.js';
import { offlineCard } from './offline.js';
import sun from '../../icons/sun.svg?raw';
import moon from '../../icons/moon.svg?raw';
import cloud from '../../icons/cloud.svg?raw';
import cloudRain from '../../icons/cloud-rain.svg?raw';
import cloudStorm from '../../icons/cloud-storm.svg?raw';
import wind from '../../icons/wind.svg?raw';
import sunrise from '../../icons/sunrise.svg?raw';
import sunset from '../../icons/sunset.svg?raw';
import alertIcon from '../../icons/alert-triangle.svg?raw';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
const icon = (svg, className = 'cond-icon') => {
  const s = el('span', className);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = svg;
  return s;
};

function weatherIcon(text, isDay) {
  const t = (text || '').toLowerCase();
  if (/thunder/.test(t)) return cloudStorm;
  if (/rain|shower|drizzle/.test(t)) return cloudRain;
  if (/wind|breezy|blustery/.test(t)) return wind;
  if (/cloud|overcast|fog/.test(t) && !/partly|mostly sunny|mostly clear/.test(t)) return cloud;
  return isDay ? sun : moon;
}

function ago(at) {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

function section(title, ...children) {
  const s = el('section', 'cond-section');
  s.append(el('h2', 'cond-h2', title), ...children);
  return s;
}

function staleNote(part) {
  if (part.stale) return el('p', 'cond-stale', `Couldn't refresh. Showing the copy from ${ago(part.at)}.`);
  return null;
}
const failed = (what) => el('p', 'cond-error', `${what} couldn't be loaded. Check the connection and tap Refresh.`);

// "2026-11-16" -> "Mon, Nov 16"
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
};
const todayHst = () => new Date(Date.now() - 10 * 3600000).toISOString().slice(0, 10);

const WINDY_LAYERS = [
  { id: 'rain', label: 'Rain' },
  { id: 'wind', label: 'Wind' },
  { id: 'waves', label: 'Waves' },
];
const windyUrl = (overlay) =>
  `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&metricWind=mph&zoom=8&overlay=${overlay}&product=ecmwf&level=surface&lat=22.05&lon=-159.52&message=true`;

export function createConditionsPanel() {
  const panel = el('section', 'tab-panel conditions');
  panel.dataset.tab = 'conditions';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Weather and ocean conditions');
  const inner = el('div', 'plan-inner');
  panel.append(inner);
  document.body.append(panel);

  let places = [];
  let placesVersion = 0;
  let placeKey = null;
  let data = savedConditions();
  let loading = null;
  let windyOpen = false;
  let windyLayer = 'rain';

  function alertsSection() {
    const part = data?.alerts;
    if (!part) return null;
    if (part.error) return null; // the forecast error covers "no connection"
    const list = part.data || [];
    if (!list.length) {
      const ok = el('p', 'cond-ok', 'No weather or surf alerts for Kauai right now.');
      return ok;
    }
    const wrap = el('div', 'cond-alerts');
    for (const a of list) {
      const card = el('details', 'cond-alert');
      const sum = el('summary');
      sum.append(icon(alertIcon), el('span', null, a.event));
      card.append(sum, el('p', 'cond-alert-head', a.headline));
      for (const para of a.description.split(/\n\s*\n/)) if (para.trim()) card.append(el('p', null, para.replace(/\s*\n\s*/g, ' ').trim()));
      if (a.instruction) card.append(el('p', 'cond-alert-do', a.instruction.replace(/\s*\n\s*/g, ' ').trim()));
      wrap.append(card);
    }
    const stale = staleNote(part);
    if (stale) wrap.append(stale);
    return wrap;
  }

  function sunSection(place) {
    const [y, m, d] = todayHst().split('-').map(Number);
    const t = sunTimes(y, m, d, place.lat, place.lng);
    if (!t) return null;
    const row = el('div', 'cond-sun');
    const item = (svg, label, value) => {
      const b = el('div', 'cond-sun-item');
      b.append(icon(svg), el('span', 'cond-sun-label', label), el('strong', null, value));
      return b;
    };
    row.append(item(sunrise, 'Sunrise', clock(t.rise)), item(sunset, 'Sunset', clock(t.set)));
    return row;
  }

  function forecastSection() {
    const box = el('div');
    if (places.length > 1) {
      const seg = el('div', 'segmented');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Forecast for');
      for (const pl of places) {
        const b = el('button', pl.key === placeKey ? 'on' : '', pl.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(pl.key === placeKey));
        b.addEventListener('click', () => {
          placeKey = pl.key;
          render();
        });
        seg.append(b);
      }
      box.append(seg);
    }
    const place = places.find((p) => p.key === placeKey) || places[0];
    if (place) {
      const s = sunSection(place);
      if (s) box.append(s);
    }
    const part = data?.forecast?.[placeKey];
    if (!part || part.error) {
      box.append(part?.error ? failed('The forecast') : el('p', 'cond-loading', 'Loading the forecast…'));
      return section('Forecast', box);
    }
    const stale = staleNote(part);
    if (stale) box.append(stale);
    const list = el('div', 'cond-days');
    for (const d of part.data.days) {
      const half = d.day || d.night;
      const row = el('details', 'cond-day');
      const sum = el('summary');
      sum.append(
        el('span', 'cond-day-name', d.date === todayHst() && d.day ? 'Today' : d.name),
        icon(weatherIcon(half.short, !!d.day)),
        el('span', 'cond-day-short', half.short),
      );
      const temps = el('span', 'cond-temps');
      if (d.day) temps.append(el('strong', null, `${d.day.temp}°`));
      if (d.night) temps.append(el('span', null, `${d.night.temp}°`));
      sum.append(temps);
      row.append(sum);
      const facts = el('p', 'cond-day-facts');
      const rain = half.rain;
      facts.textContent = [rain != null ? `Rain ${rain}%` : null, half.wind ? `Wind ${half.wind}` : null].filter(Boolean).join(' · ');
      row.append(facts);
      if (d.day) row.append(el('p', null, `${d.day.name}: ${d.day.detail}`));
      if (d.night) row.append(el('p', null, `${d.night.name}: ${d.night.detail}`));
      list.append(row);
    }
    const issued = Date.parse(part.data.updated);
    const when = Number.isFinite(issued) ? ` · updated ${ago(issued)}` : '';
    box.append(list, el('p', 'cond-source', `National Weather Service forecast for ${part.data.place || place?.label || 'Kauai'}${when} · tap a day for details`));
    return section('Forecast', box);
  }

  function surfSection() {
    const part = data?.surf;
    if (!part || part.error || !part.data) return section('Surf', part?.error ? failed('The surf forecast') : el('p', 'cond-loading', 'Loading…'));
    const s = part.data;
    const table = el('table', 'cond-surf');
    const head = el('tr');
    head.append(el('th', null, 'Shore'));
    for (const d of s.days) head.append(el('th', null, d));
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    const where = { North: 'Hanalei, Tunnels', East: 'Kapaa, Lydgate', South: 'Poipu', West: 'Polihale, Kekaha' };
    for (const row of s.shores) {
      const tr = el('tr');
      const th = el('th');
      th.append(el('span', null, `${row.shore} facing`), el('small', null, where[row.shore] || ''));
      tr.append(th);
      for (const r of row.ranges) tr.append(el('td', null, `${r} ft`));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const wrap = el('div');
    const stale = staleNote(part);
    if (stale) wrap.append(stale);
    wrap.append(table, el('p', 'cond-source', `Wave face heights. Surf Zone Forecast, issued ${s.issued}.`));
    if (s.discussion) {
      const more = el('details', 'cond-more');
      more.append(el('summary', null, "Forecaster's notes"), el('p', null, s.discussion));
      wrap.append(more);
    }
    return section('Surf', wrap);
  }

  function tidesSection() {
    const part = data?.tides;
    if (!part || part.error || !part.data) return section('Tides', part?.error ? failed('Tides') : el('p', 'cond-loading', 'Loading…'));
    const wrap = el('div', 'cond-tides');
    const byDay = new Map();
    for (const t of part.data) {
      const [date, time] = t.t.split(' ');
      if (date < todayHst()) continue;
      if (!byDay.has(date)) byDay.set(date, []);
      const [h, m] = time.split(':').map(Number);
      byDay.get(date).push({ ...t, clock: clock(h * 60 + m) });
    }
    for (const [date, list] of [...byDay].slice(0, 3)) {
      const day = el('div', 'cond-tide-day');
      day.append(el('h3', null, date === todayHst() ? 'Today' : dayLabel(date)));
      const ul = el('ul');
      for (const t of list) {
        const li = el('li', t.high ? 'high' : 'low');
        li.append(el('span', 'cond-tide-kind', t.high ? 'High' : 'Low'), el('span', null, t.clock), el('span', 'cond-tide-ft', `${t.ft.toFixed(1)} ft`));
        ul.append(li);
      }
      day.append(ul);
      wrap.append(day);
    }
    const box = el('div');
    const stale = staleNote(part);
    if (stale) box.append(stale);
    box.append(wrap, el('p', 'cond-source', `NOAA tide predictions for ${TIDE_STATION.name}. Times are within about 30 minutes around the island.`));
    return section('Tides', box);
  }

  function windySection() {
    const box = el('div', 'cond-windy');
    if (!windyOpen) {
      const b = el('button', 'btn btn-primary', 'Show live weather map');
      b.type = 'button';
      b.addEventListener('click', () => {
        windyOpen = true;
        render();
      });
      box.append(b, el('p', 'cond-source', 'Loads an interactive rain, wind and wave map from Windy.com.'));
      return section('Weather map', box);
    }
    const seg = el('div', 'segmented');
    for (const layer of WINDY_LAYERS) {
      const b = el('button', layer.id === windyLayer ? 'on' : '', layer.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(layer.id === windyLayer));
      b.addEventListener('click', () => {
        windyLayer = layer.id;
        render();
      });
      seg.append(b);
    }
    const frame = el('iframe', 'cond-windy-frame');
    frame.src = windyUrl(windyLayer);
    frame.title = 'Windy weather map of Kauai';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer';
    box.append(seg, frame, el('p', 'cond-source', 'Map by Windy.com (ECMWF model).'));
    return section('Weather map', box);
  }

  function render() {
    const scroll = panel.scrollTop;
    const frag = document.createDocumentFragment();
    const head = el('div', 'cond-head');
    head.append(el('h1', 'plan-heading', 'Conditions'));
    const refresh = el('button', 'btn btn-small', loading ? 'Updating…' : 'Refresh');
    refresh.type = 'button';
    refresh.disabled = !!loading;
    refresh.addEventListener('click', () => load({ force: true }));
    head.append(refresh);
    frag.append(head);

    const alerts = alertsSection();
    if (alerts) frag.append(alerts);
    frag.append(forecastSection(), surfSection(), tidesSection(), windySection(), offlineCard());
    inner.replaceChildren(frag);
    panel.scrollTop = scroll;
  }

  async function load({ force = false } = {}) {
    if (loading) return loading;
    const fresh = data?.forecast?.[placeKey]?.at && isFresh(data.forecast[placeKey].at) && !data.forecast[placeKey].stale;
    if (!force && fresh) return null;
    const version = placesVersion;
    loading = loadConditions(places)
      .then((d) => {
        data = d;
      })
      .catch((err) => console.warn('Conditions failed', err))
      .finally(() => {
        loading = null;
        render();
        // The places changed while loading (the Sheet's home base arrived): load those too.
        if (version !== placesVersion && !panel.hidden) load({ force: true });
      });
    render();
    return loading;
  }

  return {
    // places: [{ key, label, lat, lng }], first is the default.
    setPlaces(next) {
      places = next;
      placesVersion++;
      placeKey = placeKey && next.some((p) => p.key === placeKey) ? placeKey : next[0]?.key ?? null;
      render();
      if (!panel.hidden) load();
    },
    show: () => load(),
  };
}
