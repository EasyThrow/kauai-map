// Share a link through the phone's share sheet (Messages, WhatsApp...), or copy it.

// The site's own address without ?debug or other query bits, plus a hash.
export const siteLink = (hash = '') => `${location.origin}${location.pathname}${hash}`;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / blocked clipboard: fall back to a hidden selection.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// Returns 'shared', 'copied', 'cancelled' or 'failed'.
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

// A button that shares, and briefly says "Link copied" when it falls back to copying.
export function shareButton(getShare, label = 'Share') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = label;
  b.addEventListener('click', async () => {
    const result = await shareLink(getShare());
    if (result === 'copied' || result === 'failed') {
      b.textContent = result === 'copied' ? 'Link copied' : 'Copy failed';
      setTimeout(() => (b.textContent = label), 1800);
    }
  });
  return b;
}
