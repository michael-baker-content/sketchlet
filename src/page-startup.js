// Resolve eligibility before loading any editor code or draft storage.
export async function startHome({ loadToday, loadEditor, startPage }) {
  const today = await loadToday();
  const editor = today.submission ? null : await loadEditor();
  await startPage({ page: 'home', today, editor });
}

export function startupError(error) {
  const panel = document.querySelector('#page-content');
  panel.hidden = false;
  panel.replaceChildren();
  const message = document.createElement('p');
  message.className = 'empty-state';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'could not load this page.';
  const retry = document.createElement('button');
  retry.className = 'web-button';
  retry.textContent = 'try again';
  retry.onclick = () => window.location.reload();
  panel.append(message, retry);
}
