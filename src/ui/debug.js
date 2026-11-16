// ?debug=1 panel: what the data checks found, for QA-ing the Sheet.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createDebugPanel({ report, onPick }) {
  const { valid, skipped, warnings } = report;
  const unverified = valid.filter((s) => !s.verified);
  const skips = warnings.filter((w) => w.level === 'skip');
  const notes = warnings.filter((w) => w.level === 'warn');

  const toggle = el('button', 'debug-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = `Debug · ${skipped.length} skipped · ${notes.length} notes`;
  toggle.classList.toggle('has-skips', skipped.length > 0);

  const panel = el('section', 'debug-panel');
  panel.setAttribute('aria-label', 'Data check results');
  panel.append(
    el(
      'p',
      'debug-summary',
      `${valid.length + skipped.length} rows: ${valid.length} on the map, ${skipped.length} skipped, ` +
        `${unverified.length} unverified (dashed outline).`,
    ),
  );

  function section(title, items, render) {
    if (!items.length) return;
    const wrap = el('div', 'debug-section');
    wrap.append(el('h3', null, `${title} (${items.length})`));
    const ul = el('ul');
    for (const item of items) {
      const li = el('li');
      const { text, id } = render(item);
      if (id) {
        const b = el('button', 'debug-item', text);
        b.type = 'button';
        b.addEventListener('click', () => onPick(id));
        li.append(b);
      } else li.append(el('span', 'debug-item', text));
      ul.append(li);
    }
    wrap.append(ul);
    panel.append(wrap);
  }

  const canPick = (w) => skipped.some((x) => x.spot.id === w.id && x.spot.lat != null) || valid.some((s) => s.id === w.id);
  section('Skipped (not shown to viewers)', skips, (w) => ({
    text: `Row ${w.row} · ${w.label}: ${w.msg}`,
    id: canPick(w) ? w.id : null,
  }));
  section('Notes', notes, (w) => ({ text: `Row ${w.row} · ${w.label}: ${w.msg}`, id: w.id }));
  section('Unverified pins', unverified, (s) => ({ text: `Row ${s.row} · ${s.name}`, id: s.id }));
  if (!warnings.length) panel.append(el('p', 'debug-summary', 'No problems found.'));

  toggle.addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  document.body.append(toggle, panel);
}
