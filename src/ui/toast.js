// Short status message above the tab bar. Stays put when the panel behind it redraws.
let box = null;
let timer = null;

// link: optional { label, href } shown after the text.
export function toast(text, { link, error = false, ms = 3500 } = {}) {
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.replaceChildren(document.createTextNode(text));
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.label;
    box.append(' ', a);
  }
  box.classList.toggle('toast-error', error);
  box.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove('show'), link ? ms * 2 : ms);
}
