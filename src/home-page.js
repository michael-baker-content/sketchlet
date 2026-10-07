import { api } from './api-client.js';
import { startHome, startupError } from './page-startup.js';
import { startPage } from './gallery.js';

const params = new URLSearchParams(location.search);
if (['gallery', 'rate'].includes(params.get('view'))) {
  window.location.replace('/gallery' + location.search);
} else {
  startHome({
    loadToday: () => api('/api/today'),
    loadEditor: async () => {
      const response = await fetch('/src/editor.html');
      if (!response.ok) throw new Error('could not load drawing tools. please try again.');
      const template = document.createElement('template');
      template.innerHTML = await response.text();
      document.querySelector('#page-content').before(template.content);
      return import('./studio.js');
    },
    startPage,
  }).catch(startupError);
}
