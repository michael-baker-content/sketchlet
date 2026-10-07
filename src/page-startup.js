// Resolve eligibility before loading any editor code or draft storage.
export async function startHome({ loadToday, loadEditor, checkDraft, startPage }) {
  const today = await loadToday();
  if (today.submission) return startPage({ page: 'home', today, editor: null });
  let existingDraft = false, storageUnavailable = false;
  try { existingDraft = await checkDraft(today.date); }
  catch { storageUnavailable = true; }
  if (existingDraft) return startPage({ page: 'home', today, editor: await loadEditor() });
  await startPage({ page: 'home', today, editor: null, loadEditor, storageUnavailable });
}

export function startupError(error) {
  for (const element of document.querySelectorAll('.studio, .intro, .submit-bar')) element.hidden = true;
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
  window.sketchletLoading?.finish();
}

export async function revealPage() {
  // The editor startup already awaits draft restoration. Only the main saved
  // image gates reveal; gallery thumbnails remain independent/lazy.
  const image = document.querySelector('img.finished-drawing');
  if (image) {
    try { await image.decode(); }
    catch { throw new Error('could not load the drawing image. please try again.'); }
  }
  window.sketchletLoading?.finish();
}
