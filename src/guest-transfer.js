import { counted } from './text-format.js';
import { linkingNotice, renderMergeReview } from './merge-review.js';

// Codes stay in memory and form controls, never URLs or persistent browser storage.
export function mountGuestTransfer(root, request = null, onLinked = () => {}) {
  let active = true, reviewed = null, readChoices = () => ({});
  root.innerHTML = `<h2>move guest drawings between addresses</h2>
    <ol class="procedure-steps"><li><strong>Start where you drew.</strong> Open the profile page in the original browser and on the original site address, then create a code.</li>
    <li><strong>Sign in at sketchlet.app/profile.</strong> Enter the code there to review your drawings.</li>
    <li><strong>Choose and confirm.</strong> For overlapping dates, choose which drawing to keep before confirming the transfer.</li></ol>
    <div class="content-notice"><strong>Keep your code private.</strong><p>Anyone with it can claim your guest drawings. Codes expire after <strong>15 minutes</strong>; creating another replaces the previous code.</p></div>
    <button class="web-button site-button transfer-create">create transfer code</button>
    <p class="transfer-output" hidden><label>transfer code <input readonly autocomplete="off" spellcheck="false"></label></p>
    ${request ? `<form class="transfer-review"><label>code from the other address <input name="code" required pattern="[a-f0-9]{64}" maxlength="64" autocomplete="off" spellcheck="false"></label><button class="web-button site-button">review drawings</button></form>
    <ul class="transfer-list"></ul><form class="transfer-confirm" hidden>${linkingNotice}<label><input type="checkbox" required> I understand and want to transfer this guest work to my signed-in account</label><p><button class="web-button site-button danger">confirm transfer</button></p></form>` : '<p>Sign in on the destination address to review and claim a code.</p>'}
    <p class="transfer-status" role="status"></p>`;
  const status = root.querySelector('.transfer-status');
  function guidance(message) { status.classList.add('reading-copy'); status.textContent = message; }
  const create = root.querySelector('.transfer-create');
  create.onclick = async () => {
    create.disabled = true;
    const output = root.querySelector('.transfer-output'); output.hidden = true;
    try {
      const response = await fetch('/api/account/transfer-code',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'could not create a transfer code');
      if (!active) return;
      output.hidden = false; output.querySelector('input').value = result.code;
      output.querySelector('input').select();
      guidance('Code ready. Copy it and enter it on the destination profile within 15 minutes.');
    } catch (error) { if (active) status.textContent = error.message; }
    finally { if (active) create.disabled = false; }
  };
  if (request) {
    const form = root.querySelector('.transfer-review'), confirm = root.querySelector('.transfer-confirm'), list = root.querySelector('.transfer-list');
    const invalidate = () => { reviewed = null; confirm.hidden = true; confirm.reset(); list.replaceChildren(); };
    form.elements.code.oninput = invalidate;
    form.onsubmit = async event => {
      event.preventDefault(); invalidate();
      const code = form.elements.code.value.trim(), button = form.querySelector('button'); button.disabled = true;
      try {
        const result = await request('/api/account/transfer-preview',{code});
        if (!active || form.elements.code.value.trim() !== code) return;
        readChoices = renderMergeReview(list,result.drawings,() => { confirm.querySelector('input[type=checkbox]').checked = false; });
        reviewed = {code,revision:result.revision}; confirm.hidden = !result.drawings.length;
        guidance(result.drawings.length ? 'Review these drawings and any same-day conflicts before confirming.' : 'No guest drawings remain to transfer.');
      } catch (error) { if (active) status.textContent = error.message; }
      finally { if (active) button.disabled = false; }
    };
    confirm.onsubmit = async event => {
      event.preventDefault(); if (!reviewed) return;
      let choices;
      try { choices = readChoices(); } catch (error) { status.textContent = error.message; return; }
      const payload = {...reviewed,choices}; const button = confirm.querySelector('button'); button.disabled = true;
      try {
        const result = await request('/api/account/transfer-confirm',payload);
        if (!active) return;
        invalidate(); form.reset(); status.classList.remove('reading-copy'); status.textContent = `${counted(result.linked,'drawing')} linked; ${counted(result.hidden,'drawing')} hidden. transfer complete.`;
        onLinked();
      } catch (error) { if (active) { invalidate(); status.textContent = error.message + ' review the code again before retrying.'; } }
      finally { if (active) button.disabled = false; }
    };
  }
  return () => { active = false; root.replaceChildren(); };
}
