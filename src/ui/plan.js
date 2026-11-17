// Plan tab: countdown / "Up next", booking reminders, then a day-by-day agenda.
// All Sheet text goes in through textContent, never innerHTML.
import { STATUSES, formatDate, formatTime, tripSummary, hstDayNumber } from '../plan.js';
import { buildIcs, downloadIcs } from '../ics.js';
import { shareButton, siteLink } from '../share.js';
import { formatDrive, safeUrl } from '../format.js';
import calendarPlus from '../../icons/calendar-plus.svg?raw';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const timeRange = (e) =>
  e.start ? (e.end ? `${formatTime(e.start)} – ${formatTime(e.end)}` : formatTime(e.start)) : 'Any time';

const costText = (c) => (c == null ? '' : typeof c === 'number' ? `~$${c} per person` : c);

export function createPlanPanel({ onShowSpot }) {
  const panel = el('section', 'tab-panel plan');
  panel.dataset.tab = 'plan';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Trip plan');
  const inner = el('div', 'plan-inner');
  panel.append(inner);
  document.body.append(panel);

  let state = null;

  function eventCard(e, { spotsById, trip, highlight }) {
    const card = el('article', `plan-card status-${e.status}`);
    card.id = `event-${e.id}`;
    if (highlight) card.classList.add('highlight');

    const head = el('div', 'plan-card-head');
    head.append(el('span', 'plan-time', timeRange(e)));
    head.append(el('span', `plan-status status-${e.status}`, STATUSES[e.status]));
    card.append(head);
    card.append(el('h3', 'plan-title', e.title));

    const spot = e.spotId ? spotsById.get(e.spotId) : null;
    const facts = el('dl', 'plan-facts');
    const fact = (label, value) => {
      if (!value) return;
      facts.append(el('dt', null, label), el('dd', null, value));
    };
    fact('Where', e.meetingPoint || spot?.name);
    if (spot && formatDrive(spot.driveMin)) fact('Drive', formatDrive(spot.driveMin));
    fact('Who', e.who);
    fact('Cost', costText(e.costPp));
    fact('Bring', e.bring);
    fact('Booked by', e.bookedBy);
    if (e.status === 'to-book' && e.bookBy) fact('Book by', formatDate(e.bookBy));
    if (facts.childElementCount) card.append(facts);

    if (e.notes.length) {
      const ul = el('ul', 'notes');
      for (const n of e.notes) ul.append(el('li', null, n));
      card.append(ul);
    }

    const actions = el('div', 'actions');
    if (spot) actions.append(button('Show on map', 'btn btn-primary', () => onShowSpot(spot.id)));
    const add = button('', 'btn', () =>
      downloadIcs(`${e.id}.ics`, buildIcs([e], { spotsById, siteUrl: siteLink() })),
    );
    add.innerHTML = `<span class="btn-icon" aria-hidden="true">${calendarPlus}</span>`;
    add.append(document.createTextNode('Add to calendar'));
    actions.append(add);
    actions.append(
      shareButton(() => ({
        title: e.title,
        text: `${e.title}, Day ${trip.dayNumber(e.date)} (${formatDate(e.date)}, ${timeRange(e)})`,
        url: siteLink(`#tab=plan&event=${encodeURIComponent(e.id)}`),
      })),
    );
    for (const link of e.links) {
      const href = safeUrl(link.url);
      if (!href) continue;
      const a = el('a', 'btn', link.label || 'Link');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      actions.append(a);
    }
    card.append(actions);
    return card;
  }

  function render({ events, spotsById, now, highlightId }) {
    state = { events, spotsById, now };
    const trip = tripSummary(events, now);
    const frag = document.createDocumentFragment();
    frag.append(el('h1', 'plan-heading', 'Plan'));

    if (!trip) {
      const empty = el('div', 'plan-empty');
      empty.append(
        el('p', 'plan-empty-title', 'Nothing planned yet'),
        el('p', null, 'Activities show up here as soon as they are added to the Plan tab of the trip Sheet.'),
      );
      frag.append(empty);
      inner.replaceChildren(frag);
      return;
    }

    // Countdown before the trip; day count and "Up next" during it.
    const hero = el('div', 'plan-hero');
    if (trip.phase === 'before') {
      const n = trip.daysUntil;
      hero.append(
        el('p', 'plan-hero-big', n === 1 ? 'Tomorrow!' : `${n} days`),
        el('p', 'plan-hero-sub', n === 1 ? `Day 1 is ${formatDate(trip.first)}` : `until Kauai · Day 1 is ${formatDate(trip.first)}`),
      );
    } else if (trip.phase === 'during') {
      hero.append(el('p', 'plan-hero-big', `Day ${trip.dayOfTrip} of ${trip.days}`));
      if (trip.upNext) {
        const e = trip.upNext;
        const isToday = e.date.utcDay === hstDayNumber(now);
        const up = el('button', 'plan-upnext');
        up.type = 'button';
        up.append(
          el('span', 'plan-upnext-label', 'Up next'),
          el('span', 'plan-upnext-title', e.title),
          el('span', 'plan-upnext-when', `${isToday ? 'Today' : formatDate(e.date)} · ${timeRange(e)}`),
        );
        up.addEventListener('click', () => scrollToEvent(e.id));
        hero.append(up);
      } else hero.append(el('p', 'plan-hero-sub', 'Nothing else planned. Free time!'));
    } else {
      hero.append(el('p', 'plan-hero-big', 'Mahalo, Kauai'), el('p', 'plan-hero-sub', 'The trip is over. Hope it was a great one.'));
    }
    const all = button('', 'btn plan-all', () =>
      downloadIcs('kauai-trip.ics', buildIcs(events, { spotsById, siteUrl: siteLink() })),
    );
    all.innerHTML = `<span class="btn-icon" aria-hidden="true">${calendarPlus}</span>`;
    all.append(document.createTextNode('Add whole trip to calendar'));
    hero.append(all);
    frag.append(hero);

    // Booking reminders, soonest deadline first.
    const toBook = events
      .filter((e) => e.status === 'to-book')
      .sort((a, b) => (a.bookBy?.utcDay ?? 1e9) - (b.bookBy?.utcDay ?? 1e9));
    if (toBook.length) {
      const box = el('section', 'plan-tobook');
      box.append(el('h2', null, `Still to book (${toBook.length})`));
      const ul = el('ul');
      const today = hstDayNumber(now);
      for (const e of toBook) {
        const li = el('li');
        const b = button('', 'plan-tobook-item', () => scrollToEvent(e.id));
        b.append(el('span', 'plan-tobook-title', e.title));
        if (e.bookBy) {
          const left = e.bookBy.utcDay - today;
          const urgency = left < 0 ? 'overdue' : left <= 7 ? 'soon' : '';
          b.append(
            el(
              'span',
              `plan-tobook-when ${urgency}`,
              left < 0 ? `Was due ${formatDate(e.bookBy)}` : left === 0 ? 'Book today' : `Book by ${formatDate(e.bookBy)} (${left} days)`,
            ),
          );
        }
        li.append(b);
        ul.append(li);
      }
      box.append(ul);
      frag.append(box);
    }

    // Days
    let currentDay = null;
    let dayList = null;
    for (const e of events) {
      if (e.date.utcDay !== currentDay) {
        currentDay = e.date.utcDay;
        const section = el('section', 'plan-day');
        if (currentDay === hstDayNumber(now)) section.classList.add('today');
        const h = el('h2', 'plan-day-title');
        h.append(el('span', 'plan-day-num', `Day ${trip.dayNumber(e.date)}`), el('span', null, formatDate(e.date)));
        section.append(h);
        dayList = el('div', 'plan-day-list');
        section.append(dayList);
        frag.append(section);
      }
      dayList.append(eventCard(e, { spotsById, trip, highlight: e.id === highlightId }));
    }
    inner.replaceChildren(frag);
  }

  function scrollToEvent(id) {
    const card = document.getElementById(`event-${id}`);
    if (!card) return;
    for (const c of panel.querySelectorAll('.plan-card.highlight')) c.classList.remove('highlight');
    card.classList.add('highlight');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // During the trip, opening the tab starts at today's section (Up next stays one tap away).
  function scrollToToday() {
    const today = panel.querySelector('.plan-day.today');
    if (today) panel.scrollTop = Math.max(0, today.offsetTop - 8);
  }

  return {
    render,
    scrollToEvent,
    scrollToToday,
    // Re-render with a fresh "now" (countdown and Up next move with the clock).
    refresh: (now) => state && render({ ...state, now }),
  };
}
