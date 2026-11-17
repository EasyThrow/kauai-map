// The "Who's in" block on a spot: names of people interested, plus an I'm in / I'm out
// button. Asks for a first name the first time and remembers it on this device.
// Names come from the Sheet, so they always go in as text, never HTML.
import userCheck from '../../icons/user-check.svg?raw';
import { toast } from './toast.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Small inline "Your first name" form. Calls onSave(name).
export function nameForm({ onSave, onCancel, initial = '', label = 'Your first name' }) {
  const form = el('form', 'name-form');
  const input = el('input');
  input.type = 'text';
  input.name = 'given-name';
  input.autocomplete = 'given-name';
  input.maxLength = 40;
  input.required = true;
  input.placeholder = label;
  input.value = initial;
  input.setAttribute('aria-label', label);
  const save = el('button', 'btn btn-primary', 'Save');
  save.type = 'submit';
  form.append(input, save);
  if (onCancel) {
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', onCancel);
    form.append(cancel);
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) onSave(input.value);
  });
  requestAnimationFrame(() => input.focus());
  return form;
}

export function peopleList(people, myName) {
  const ul = el('ul', 'people');
  const me = (myName || '').toLowerCase();
  for (const p of people) {
    const li = el('li', p.key === me ? 'person me' : 'person', p.key === me ? `${p.name} (you)` : p.name);
    ul.append(li);
  }
  return ul;
}

// store: from createInterestStore. compact: popup layout (heading + names on one line).
export function interestBlock(spotId, store, { compact = false } = {}) {
  const box = el('div', compact ? 'interest interest-compact' : 'interest');

  function draw() {
    const people = store.who(spotId);
    const children = [];
    if (compact) {
      const head = el('p', 'interest-head');
      head.append(el('span', 'interest-label', "Who's in"));
      head.append(el('span', null, people.length ? people.map((p) => p.name).join(', ') : 'Nobody yet'));
      children.push(head);
    } else if (people.length) children.push(peopleList(people, store.myName()));

    if (store.canSend()) {
      const row = el('div', 'interest-actions');
      const going = store.amIn(spotId);
      const b = el('button', going ? 'btn btn-in on' : 'btn btn-in');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(going));
      b.innerHTML = `<span class="btn-icon" aria-hidden="true">${userCheck}</span>`;
      b.append(document.createTextNode(going ? "You're in" : "I'm in"));
      b.addEventListener('click', () => {
        if (!store.myName()) {
          box.replaceChildren(
            el('p', 'interest-ask', 'What should friends see as your name?'),
            nameForm({
              onSave: (name) => {
                store.setName(name);
                toggle(true);
              },
              onCancel: () => draw(),
            }),
          );
          return;
        }
        toggle(!going);
      });
      row.append(b);
      if (going) row.append(el('span', 'interest-hint', 'Tap again if you change your mind'));
      children.push(row);
    }
    box.replaceChildren(...children);
  }

  async function toggle(going) {
    const ok = await store.send(spotId, going);
    draw();
    if (ok) {
      toast(going ? "You're in. Everyone sees it within about 5 minutes." : 'Removed. Everyone sees it within about 5 minutes.');
      return;
    }
    // Offline or blocked: hand over the pre-filled form instead.
    const href = store.formLink(spotId, going);
    toast("Couldn't send that.", { error: true, link: href ? { label: 'Open the form instead', href } : null });
  }

  draw();
  return box;
}
