import { counted } from './text-format.js';

// This independent panel must never delay or disable entering the drawing suite.
export function mountHomeHighlights(root, request) {
  const list = root.querySelector('.highlights-grid'), status = root.querySelector('[role=status]');
  const retry = root.querySelector('button');
  let active = true, busy = false, visible = true;
  const controller = new AbortController();
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
  observer.observe(root);
  async function refresh() {
    if (!active || !root.isConnected || busy || document.hidden || !visible || list.contains(document.activeElement)) return;
    busy = true; retry.hidden = true;
    try {
      const drawings = await request('/api/highlights',undefined,{signal:controller.signal});
      if (!active || !root.isConnected) return;
      // Do not replace a link the user is currently navigating with the keyboard.
      if (list.contains(document.activeElement)) return;
      const cards = drawings.map(drawing => {
        const card = document.createElement('a'); card.className = 'highlight-card'; card.href = drawing.url;
        const image = document.createElement('img'); image.src = drawing.image; image.alt = drawing.prompt;
        image.width = image.height = 180; image.loading = 'lazy'; image.decoding = 'async';
        const title = document.createElement('strong'); title.textContent = drawing.prompt;
        const author = document.createElement('span'); author.textContent = `by ${drawing.displayName || 'anonymous'}`;
        const rating = document.createElement('small'); rating.textContent = `${Number(drawing.average).toFixed(1)} / 5 · ${counted(drawing.count,'rating')}`;
        card.append(image,title,author,rating); return card;
      });
      list.replaceChildren(...cards);
      status.textContent = drawings.length ? '' : 'no qualifying drawings yet — the next favorite could be yours.';
    } catch (error) {
      if (!active || error.name === 'AbortError') return;
      // Remove old results rather than retaining potentially removed artwork.
      list.replaceChildren(); status.textContent = 'could not refresh recent favorites.'; retry.hidden = false;
    } finally { busy = false; }
  }
  retry.onclick = refresh;
  const timer = setInterval(refresh,60000);
  document.addEventListener('visibilitychange',refresh);
  refresh();
  return () => { active = false; clearInterval(timer); controller.abort(); observer.disconnect(); document.removeEventListener('visibilitychange',refresh); };
}
