import { api } from './api-client.js';
import { startHome, startupError, revealPage } from './page-startup.js';
import { startPage } from './gallery.js';
import { openDraftDatabase, readDraft, hasDrawingDraft } from './draft-storage.js';

import { prepareEditor, loadEditor } from './editor-loader.js';

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
