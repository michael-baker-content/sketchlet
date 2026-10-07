import { api } from './api-client.js';
import { startHome, startupError, revealPage } from './page-startup.js';
import { startPage } from './gallery.js';
import { openDraftDatabase, readDraft, hasDrawingDraft } from './draft-storage.js';

let editorTemplate;
function prepareEditor() {
  if (!editorTemplate) editorTemplate = fetch('/src/editor.html').then(async response => {
    if (!response.ok) throw new Error('could not load drawing tools. please try again.');
    return response.text();
  }).catch(error => { editorTemplate = null; throw error; });
  return editorTemplate;
}
async function loadEditor() {
  const template = document.createElement('template');
  template.innerHTML = await prepareEditor();
  document.querySelector('#page-content').before(template.content);
  return import('./studio.js');
}

const params = new URLSearchParams(location.search);
if (['gallery', 'rate'].includes(params.get('view'))) {
  window.location.replace('/gallery' + location.search);
} else {
  startHome({
    loadToday: () => api('/api/today'),
    checkDraft: async day => hasDrawingDraft(await readDraft(await openDraftDatabase(), day), day),
    loadEditor,
    startPage,
  }).then(async () => {
    await revealPage();
    if (!document.querySelector('#begin-drawing')) return;
    // Fetch/compile modules without evaluating the editor or creating canvases.
    const preload = document.createElement('link');
    preload.rel = 'modulepreload'; preload.href = '/src/studio.js';
    document.head.append(preload);
    prepareEditor().catch(() => {});
  }).catch(startupError);
}
