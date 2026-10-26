import { rememberAccount } from './account-client.js';

// Resolve eligibility before loading the editor or opening draft storage.
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
  if (error.code === 'account_session') {
    panel.innerHTML = `<div class="panel-title"><h1 id="page-heading" tabindex="-1">welcome back</h1></div>
      <div class="session-welcome reading-copy"><h2>Pick up where you left off.</h2>
      <p>Your sign-in session has ended. Sign in again to see your drawing collection and today’s progress.</p>
      <div class="gallery-actions"><a class="web-button site-button primary" href="/profile">sign in again</a><button class="web-button site-button utility" id="continue-guest">continue as guest</button></div>
      <p>Your account drawings are still saved. If you continue as a guest, new submissions won’t be attached to your account.</p></div>`;
    panel.querySelector('#continue-guest').onclick = () => {
      rememberAccount(false);
      window.location.reload();
    };
    window.sketchletLoading?.finish();
    panel.querySelector('h1').focus({preventScroll:true});
    return;
  }
  const heading = document.createElement('h1');
  heading.id = 'page-heading'; heading.textContent = 'could not load'; heading.tabIndex = -1;
  panel.replaceChildren(heading);
  const message = document.createElement('p');
  message.className = 'empty-state';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'could not load this page.';
  const retry = document.createElement('button');
  retry.className = 'web-button site-button utility';
  retry.textContent = 'try again';
  retry.onclick = () => window.location.reload();
  panel.append(message, retry);
  window.sketchletLoading?.finish();
  heading.focus();
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
  // Initial headings cannot receive focus while the loading screen hides them.
  if (!document.querySelector('dialog[open]')) {
    const heading = document.querySelector('#page-content:not([hidden]) #page-heading');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll:true }); }
  }
  document.dispatchEvent(new Event('sketchlet:page-ready'));
}
