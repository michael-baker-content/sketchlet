import { submissionFits } from './upload-limits.js';

export function createSubmissionControls({ studio, editor, getState, isConnected, getDisplayName, saveName, adoptDay, home, showDrawing, notice, api, isCurrent, revision }) {
const $ = selector => document.querySelector(selector);
const captureDraft = day => editor.captureDraft(day);
let reviewedDraft = null;
const bar = document.createElement('div'); bar.className='submit-bar'; bar.innerHTML='<div class="submit-actions"><div class="save-buttons"><button class="web-button primary" id="review-drawing" disabled>save to gallery</button></div></div><footer class="drawing-footer">one drawing per day · final once saved<br>new prompt at midnight eastern</footer>'; studio.after(bar);
bar.hidden = true;
// Keep the studio's existing PNG export handler when moving the download button.
const downloadButton = $('#download');
downloadButton.className = 'web-button';
downloadButton.textContent = 'download';
downloadButton.setAttribute('aria-label', 'download drawing as PNG');
downloadButton.hidden = false;
downloadButton.disabled = true;
bar.querySelector('.save-buttons').append(downloadButton);
bar.querySelector('.save-buttons').append($('#save-status'));
$('.download-note').hidden = true;
const dialog = document.createElement('dialog'); dialog.className='submission-dialog';
dialog.innerHTML='<form method="dialog"><h2>save to the gallery?</h2><p>your drawing will be visible to others and final for this prompt.</p><img alt="your drawing before submission"><p id="submission-error" role="alert"></p><div class="dialog-actions"><button class="web-button" value="cancel">keep drawing</button><button class="web-button primary" id="confirm-submit" type="button">save to gallery</button></div></form>';
document.body.append(dialog);
dialog.querySelector('[value="cancel"]').type = 'button';
dialog.querySelector('[value="cancel"]').onclick = () => { if (!saving) dialog.close(); };
$('#confirm-submit').type = 'submit';
const submissionName = document.createElement('label');
submissionName.className = 'name-field';
submissionName.innerHTML = 'your name (optional)<input id="submission-name" maxlength="32" autocomplete="nickname" aria-describedby="submission-name-note"><small id="submission-name-note">shown on all your drawings, including earlier ones.</small>';
dialog.querySelector('img').after(submissionName);

$('#review-drawing').onclick=async()=>{
  $('#review-drawing').disabled=true;
  const generation = revision();
  try {
    const next=await api('/api/today');
    if (!isCurrent(generation)) return;
    const changed = await adoptDay(next);
    if (!isCurrent(generation)) return;
    if(changed) { await home(); return; }
    if(getState().submission){showDrawing(getState().submission);return;}
    reviewedDraft=captureDraft(getState().date);
    if(!submissionFits(reviewedDraft))throw new Error('drawing is too large to upload. your draft is still saved on this device.');
    dialog.querySelector('img').src=reviewedDraft.image;
    $('#submission-error').textContent='';
    dialog.querySelector('h2').textContent=`save “${getState().prompt}”?`;
    $('#submission-name').value=getDisplayName();
    dialog.showModal();
  } catch(error){notice.hidden=false;notice.textContent=error.message;}
  finally{$('#review-drawing').disabled=!isConnected();}
};
let saving=false;
dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();
  if(saving || !reviewedDraft)return;saving=true;
  const submittedDraft=reviewedDraft;
  const submittedName=$('#submission-name').value;
  $('#submission-name').disabled=true;
  const buttons=dialog.querySelectorAll('button');buttons.forEach(button=>button.disabled=true);$('#confirm-submit').textContent='saving…';
  try {
    const next=await api('/api/today');
    if(next.date!==submittedDraft.date){await adoptDay(next);dialog.close();await home();return;}
    await saveName(submittedName);
    // Keep the snapshot's original date; never relabel it using mutable page state.
    const drawing=await api('/api/drawings',submittedDraft);
    getState().submission=drawing;getState().streak=Math.max(1,getState().streak+1);
    try { await adoptDay(await api('/api/today')); } catch {}
    dialog.close();window.location.assign('/');
  } catch(error){$('#submission-error').textContent=error.message;}
  finally{saving=false;buttons.forEach(button=>button.disabled=false);$('#submission-name').disabled=false;$('#confirm-submit').textContent='save to gallery';}
};

return { bar, dialog, get saving() { return saving; }, dayChanged() { reviewedDraft = null; if (dialog.open && !saving) dialog.close(); } };
}
