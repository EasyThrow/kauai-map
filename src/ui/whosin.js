// Who's in tab: one card per spot that has interested people, most popular first.
// Helps decide what to book: each card says whether the spot is in the plan yet.
import { CATEGORIES } from '../config.js';
import { formatDate } from '../plan.js';
import { interestBlock, nameForm } from './interest.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createWhosInPanel({ onShowSpot }) {
  const panel = el('section', 'tab-panel whosin');
  panel.dataset.tab = 'who';
  panel.hidden = true;
  panel.setAttribute('aria-label', "Who's in");
  const inner = el('div', 'plan-inner');
  panel.append(inner);
  document.body.append(panel);

  let state = null;
  let editingName = false;

  function nameLine(store) {
    const line = el('div', 'whosin-me');
    if (editingName || (!store.myName() && store.canSend())) {
      line.append(
        el('p', null, store.myName() ? 'Change your name' : 'Add your first name so friends know who is in.'),
        nameForm({
          initial: store.myName(),
          onSave: (name) => {
            editingName = false;
            store.setName(name);
          },
          onCancel: store.myName()
            ? () => {
                editingName = false;
                render();
              }
            : null,
        }),
      );
      return line;
    }
    if (!store.myName()) return null;
    line.append(el('span', null, 'You are '), el('strong', null, store.myName()));
    const change = el('button', 'link-button', 'Change');
    change.type = 'button';
    change.addEventListener('click', () => {
      editingName = true;
      render();
    });
    line.append(change);
    return line;
  }

  function card(spotId, { store, spotsById, plannedBySpot }) {
    const spot = spotsById.get(spotId);
    const people = store.who(spotId);
    const c = el('article', 'plan-card whosin-card');
    const cat = CATEGORIES[spot.primary];
    if (cat) c.style.borderLeftColor = cat.color;

    const head = el('div', 'plan-card-head');
    head.append(el('span', 'plan-time', cat?.label || ''));
    head.append(el('span', 'whosin-count', `${people.length} in`));
    c.append(head, el('h3', 'plan-title', spot.name));

    const planned = plannedBySpot.get(spotId) || [];
    c.append(
      el(
        'p',
        planned.length ? 'whosin-plan planned-yes' : 'whosin-plan',
        planned.length
          ? `In the plan: ${planned.map(({ event, dayNumber }) => `Day ${dayNumber} (${formatDate(event.date)})`).join(', ')}`
          : 'Not in the plan yet',
      ),
    );
    c.append(interestBlock(spotId, store));

    const actions = el('div', 'actions');
    const show = el('button', 'btn', 'Show on map');
    show.type = 'button';
    show.addEventListener('click', () => onShowSpot(spotId));
    actions.append(show);
    c.append(actions);
    return c;
  }

  function render() {
    if (!state) return;
    const { store } = state;
    const frag = document.createDocumentFragment();
    frag.append(el('h1', 'plan-heading', "Who's in"));
    const me = nameLine(store);
    if (me) frag.append(me);

    const spots = store.all().filter(([id]) => state.spotsById.has(id));
    if (!spots.length) {
      const empty = el('div', 'plan-empty');
      empty.append(
        el('p', 'plan-empty-title', 'No picks yet'),
        el(
          'p',
          null,
          store.canSend()
            ? "Open any spot on the map and tap I'm in. Everyone's picks show up here."
            : "Picks show up here once the interest form is set up.",
        ),
      );
      frag.append(empty);
    } else {
      frag.append(el('p', 'whosin-intro', 'Most popular first. New picks take about 5 minutes to show for everyone.'));
      const list = el('div', 'plan-day-list');
      for (const [id] of spots) list.append(card(id, state));
      frag.append(list);
    }
    inner.replaceChildren(frag);
  }

  return {
    render(next) {
      state = next;
      render();
    },
    refresh: render,
  };
}
