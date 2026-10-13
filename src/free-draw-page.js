import { loadEditor } from './editor-loader.js';
import { revealPage, startupError } from './page-startup.js';
import { mountProfilePhoto } from './profile-details.js';
import { api } from './api-client.js';

async function start() {
  const editor = await loadEditor();
  const $ = selector => document.querySelector(selector);
  mountProfilePhoto();
  $('.intro').innerHTML = '<div class="daily-heading"><div><p class="prompt-date">just for you</p><h1>free draw</h1></div></div>';
  $('#drawing-heading').textContent = 'free draw';
  $('.studio-title').textContent = 'free draw';
  const bar = document.createElement('div');
  bar.className = 'submit-bar';
  bar.innerHTML = '<div class="submit-actions"><div class="save-buttons"></div></div><p class="reading-copy">Experiment with the tools. Your drawing saves on this device, separately from your daily drawing. Download it to keep a copy.</p><a href="/">back to today</a>';
  const download = $('#download');
  download.className = 'web-button site-button'; download.textContent = 'download';
  download.setAttribute('aria-label','download drawing as PNG'); download.hidden = false;
  bar.querySelector('.save-buttons').append(download, $('#save-status'));
  $('.download-note').hidden = true;
  $('.studio').after(bar);
  await editor.setFreeDraw();
  $('#page-content').hidden = true;
  $('.intro').hidden = false; $('.studio').hidden = false;
  editor.showDraftStatus();
  await revealPage();
  $('#drawing-heading').tabIndex = -1;
  $('#drawing-heading').focus({preventScroll:true});
  const params = new URLSearchParams(location.search);
  const drawingId = params.get('drawing');
  if (drawingId || params.get('start') === 'blank') {
    const dialog = document.createElement('dialog'); dialog.className = 'submission-dialog';
    dialog.setAttribute('aria-labelledby','free-start-heading');
    dialog.innerHTML = '<h2 id="free-start-heading">start free drawing</h2><p class="reading-copy" id="free-start-copy"></p><p role="status" id="free-start-status"></p><div class="dialog-actions"><button class="web-button site-button utility" id="free-keep">keep current canvas</button><button class="web-button site-button primary" id="free-start">start drawing</button></div>';
    document.body.append(dialog);
    dialog.querySelector('#free-start-copy').textContent = (drawingId ? 'Start with a copy of your submitted image. Its original strokes and background are flattened together; your gallery submission stays unchanged.' : 'Start with a blank canvas.') + (editor.hasFreeDrawing() ? ' This replaces your saved free-draw canvas. Download it first if you want to keep a copy.' : '');
    const cleanUrl = () => history.replaceState(null,'','/free-draw');
    const keep = dialog.querySelector('#free-keep'), begin = dialog.querySelector('#free-start');
    keep.onclick = () => dialog.close();
    let busy = false;
    dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close',() => { cleanUrl(); $('#canvas').focus({preventScroll:true}); dialog.remove(); });
    begin.onclick = async () => {
      busy = true; keep.disabled = begin.disabled = true;
      const status = dialog.querySelector('#free-start-status'); status.textContent = 'preparing canvas…';
      try {
        let image = null;
        if (drawingId) {
          if (!/^[a-f0-9-]{36}$/i.test(drawingId)) throw new Error('drawing not found');
          const drawing = await api('/api/drawings/' + drawingId);
          if (!drawing.mine || drawing.removed) throw new Error('choose one of your available drawings');
          image = drawing.image;
        }
        await editor.startFreeDrawing(image);
        dialog.close();
      } catch (error) { status.textContent = error.message; }
      finally { busy = false; keep.disabled = begin.disabled = false; }
    };
    dialog.showModal();
  }
}
start().catch(startupError);
