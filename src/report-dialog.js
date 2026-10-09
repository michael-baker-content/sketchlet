import { api } from './api-client.js';
import { reportReasons } from './moderation-options.js';

export function openReport(drawing, trigger) {
  const dialog = document.createElement('dialog'); dialog.className = 'submission-dialog';
  dialog.setAttribute('aria-labelledby','report-heading');
  dialog.innerHTML = `<form><h2 id="report-heading">report drawing</h2><p class="report-prompt"></p><label class="name-field"><span id="report-reason-label">reason</span><select name="category" aria-labelledby="report-reason-label" required><option value="">choose a reason</option></select></label><label class="name-field">explanation (optional)<textarea name="explanation" maxlength="1000" rows="4"></textarea></label><p class="muted">reports are reviewed by the site administrator. reporting does not automatically remove a drawing.</p><p role="status"></p><div class="dialog-actions"><button class="web-button" type="button">cancel</button><button class="web-button primary" type="submit">send report</button></div></form>`;
  dialog.querySelector('.report-prompt').textContent = drawing.prompt;
  const form = dialog.querySelector('form'), cancel = form.querySelector('[type="button"]'), send = form.querySelector('[type="submit"]');
  for (const [key,label] of Object.entries(reportReasons)) form.elements.category.add(new Option(label,key));
  let pending = false;
  cancel.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (trigger.isConnected) trigger.focus(); }, { once:true });
  form.onsubmit = async event => {
    event.preventDefault(); if (pending) return;
    pending = true; send.disabled = cancel.disabled = true;
    const status = form.querySelector('[role="status"]'); status.textContent = 'sending report…';
    try {
      await api(`/api/drawings/${drawing.id}/report`, { category:form.elements.category.value, explanation:form.elements.explanation.value });
      status.textContent = 'thank you. your report is ready for review.';
      send.hidden = true; cancel.textContent = 'close';
    } catch (error) { status.textContent = error.message; }
    finally { pending = false; send.disabled = cancel.disabled = false; if (send.hidden) cancel.focus(); }
  };
  document.body.append(dialog); dialog.showModal();
}
