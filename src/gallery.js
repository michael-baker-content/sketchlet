import { easternDate, promptForDate } from './prompts.js';
import { setPromptDay, captureDraft } from './studio.js';
import { submissionFits } from './upload-limits.js';

const $ = selector => document.querySelector(selector);
const main = $('main'), studio = $('.studio'), intro = $('.intro');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = { date: easternDate(), prompt: promptForDate(easternDate()), submission: null, streak: 0 };
let connected = false, queue = [], queueIndex = 0, viewGeneration = 0, reviewedDraft = null;
const notice = document.createElement('div'); notice.className = 'preview-notice'; notice.setAttribute('role','status'); notice.textContent = 'connecting to the gallery…'; main.prepend(notice);
intro.innerHTML = '<div class="daily-heading"><div><p class="prompt-date"></p><h1></h1></div><button class="web-button" id="open-archive">gallery & archive</button></div><p class="prompt-caption">new prompt at midnight eastern</p>';
const bar = document.createElement('div'); bar.className='submit-bar'; bar.innerHTML='<span>one drawing per day · final once saved</span><button class="web-button primary" id="review-drawing" disabled>save to gallery</button>'; studio.after(bar);
// The primary save action submits to the gallery, rather than downloading a file.
$('#download').hidden = true; $('.download-note').hidden = true;
const panel = document.createElement('section'); panel.className='flow-panel'; panel.hidden=true; main.append(panel);
const dialog = document.createElement('dialog'); dialog.className='submission-dialog';
dialog.innerHTML='<form method="dialog"><h2>save to the gallery?</h2><p>your drawing will be visible to others and final for this prompt.</p><img alt="your drawing before submission"><p id="submission-error" role="alert"></p><div class="dialog-actions"><button class="web-button" value="cancel">keep drawing</button><button class="web-button primary" id="confirm-submit" type="button">save to gallery</button></div></form>';
document.body.append(dialog);
function header() { $('.prompt-date').textContent=`${state.date} · today's prompt`; $('.daily-heading h1').textContent=state.prompt; }
async function adoptDay(next) {
  const changed = next.date !== state.date;
  $('#review-drawing').disabled = true;
  await setPromptDay(next.date);
  state = next; header();
  $('#review-drawing').disabled = !connected;
  if (changed) {
    reviewedDraft = null;
    if (dialog.open && !saving) dialog.close();
    notice.hidden = false;
    notice.textContent = 'new prompt, fresh canvas. your previous draft is kept separately on this device.';
  }
  return changed;
}
header();
async function api(path, data) {
  const response = await fetch(path, { credentials:'same-origin', headers:data ? {'Content-Type':'application/json'} : {}, method:data ? 'POST' : 'GET', body:data ? JSON.stringify(data) : undefined });
  const result = await response.json().catch(()=>({error:response.status===413?'drawing is too large to upload. your draft is still saved.':'the gallery is unavailable. your draft is safe.'}));
  if (!response.ok) throw new Error(result.error || 'the gallery is unavailable');
  return result;
}
function show(content) { studio.hidden=true; bar.hidden=true; panel.hidden=false; panel.innerHTML=content; const heading=panel.querySelector('h2'); if(heading){heading.tabIndex=-1;heading.focus();} }
function title(text) { return `<div class="panel-title"><h2>${escape(text)}</h2><button class="web-button" id="back-home">back to today</button></div>`; }
function wireHome() { $('#back-home').onclick=home; }
function errorScreen(error) { show(title('could not load')+`<div class="empty-state"><p>${escape(error.message)}</p></div>`); wireHome(); }
function ratingText(drawing) { return drawing.count ? `${drawing.average.toFixed(1)} stars · ${drawing.count} ${drawing.count===1?'rating':'ratings'}` : 'no ratings yet'; }
function route(path) { if(location.pathname!==path) window.history.pushState({},'',path); }
async function home() {
  const generation=++viewGeneration; route('/');
  if (connected) { try { const latest=await api('/api/today'); if(generation!==viewGeneration)return; await adoptDay(latest); } catch(error) { notice.hidden=false;notice.textContent=error.message; } }
  if(state.submission){showDrawing(state.submission);return;}
  panel.hidden=true;studio.hidden=false;bar.hidden=false;$('#review-drawing').disabled=!connected;
}
function showDrawing(drawing) {
  show(title(drawing.mine?'your drawing':drawing.prompt)+`<div class="submission-layout"><img class="finished-drawing" alt="${escape(drawing.prompt)}"><div class="submission-info"><h3>${escape(drawing.prompt)}</h3><p>${escape(drawing.date)}</p><p class="rating-total">${escape(ratingText(drawing))}</p>${drawing.mine?`<div class="streak-box"><strong>${state.streak} ${state.streak===1?'day':'days'}</strong><span>drawing streak</span></div>`:''}<label class="share-label">drawing link<input class="share-link" readonly aria-label="drawing link"></label><p class="muted share-note"></p><button class="web-button primary" id="start-rating">rate drawings</button>${!drawing.mine && drawing.myVote?`<p>your rating: ${drawing.myVote} / 5</p>`:''}</div></div>`);
  panel.querySelector('img').src=drawing.image; $('.share-link').value=new URL(drawing.url,location.origin).href;
  $('.share-link').onclick=event=>event.target.select();
  $('.share-note').textContent=['localhost','127.0.0.1'].includes(location.hostname)?'this link works locally until sketchlet is hosted.':'copy this link to share your drawing.';
  wireHome();$('#start-rating').onclick=startRating;
  // Direct links currently show the drawing; the main rating flow follows submission.
}
$('#review-drawing').onclick=async()=>{
  $('#review-drawing').disabled=true;
  try {
    const next=await api('/api/today');
    if(await adoptDay(next)) { await home(); return; }
    if(state.submission){showDrawing(state.submission);return;}
    reviewedDraft=captureDraft(state.date);
    if(!submissionFits(reviewedDraft))throw new Error('drawing is too large to upload. your draft is still saved on this device.');
    dialog.querySelector('img').src=reviewedDraft.image;
    $('#submission-error').textContent='';
    dialog.querySelector('h2').textContent=`save “${state.prompt}”?`;
    dialog.showModal();
  } catch(error){notice.hidden=false;notice.textContent=error.message;}
  finally{$('#review-drawing').disabled=!connected;}
};
let saving=false;
dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
$('#confirm-submit').onclick=async()=>{
  if(saving || !reviewedDraft)return;saving=true;
  const submittedDraft=reviewedDraft;
  const buttons=dialog.querySelectorAll('button');buttons.forEach(button=>button.disabled=true);$('#confirm-submit').textContent='saving…';
  try {
    const next=await api('/api/today');
    if(next.date!==submittedDraft.date){await adoptDay(next);dialog.close();await home();return;}
    // Keep the snapshot's original date; never relabel it using mutable page state.
    const drawing=await api('/api/drawings',submittedDraft);
    state.submission=drawing;state.streak=Math.max(1,state.streak+1);
    try { await adoptDay(await api('/api/today')); } catch {}
    dialog.close();route(drawing.url);showDrawing(drawing);
  } catch(error){$('#submission-error').textContent=error.message;}
  finally{saving=false;buttons.forEach(button=>button.disabled=false);$('#confirm-submit').textContent='save to gallery';}
};
async function startRating(){
  if(!state.submission){notice.hidden=false;notice.textContent='save today’s drawing to start rating.';await home();return;}
  const generation=++viewGeneration;
  try{const result=await api('/api/queue');if(generation!==viewGeneration)return;queue=result;queueIndex=0;renderRating();}catch(error){if(generation===viewGeneration)errorScreen(error);}
}
function renderRating(){
  const drawing=queue[queueIndex];
  if(!drawing){show(title('all caught up')+'<div class="empty-state"><p>no more drawings to rate right now. check back later.</p></div>');wireHome();return;}
  show(title('rate a drawing')+`<div class="rating-layout"><p>${escape(drawing.date)} · ${escape(drawing.prompt)}</p><img class="rating-drawing" alt="${escape(drawing.prompt)}"><fieldset class="star-picker"><legend>your rating</legend>${[1,2,3,4,5].map(n=>`<label><input type="radio" name="stars" value="${n}" aria-label="${n} ${n===1?'star':'stars'}"><span aria-hidden="true">☆</span></label>`).join('')}</fieldset><p id="rating-status" class="muted" role="status">choose 1–5 stars</p><div class="rating-actions"><button class="web-button" id="skip-rating">skip</button><button class="web-button primary" id="save-rating" disabled>save rating</button></div></div>`);
  panel.querySelector('img').src=drawing.image;wireHome();let selected=0;
  panel.querySelectorAll('[name="stars"]').forEach(radio=>radio.onchange=()=>{selected=Number(radio.value);panel.querySelectorAll('.star-picker span').forEach((span,i)=>span.textContent=i<selected?'★':'☆');$('#save-rating').disabled=false;$('#rating-status').textContent=`${selected} stars selected`;});
  $('#skip-rating').onclick=()=>{queueIndex++;renderRating();};
  $('#save-rating').onclick=async()=>{
    const generation=viewGeneration;const button=$('#save-rating'),skip=$('#skip-rating'),status=$('#rating-status');button.disabled=skip.disabled=true;
    try{await api(`/api/drawings/${drawing.id}/vote`,{stars:selected});if(generation!==viewGeneration)return;queueIndex++;renderRating();}
    catch(error){status.textContent=error.message;button.disabled=skip.disabled=false;}
  };
}
$('#open-archive').onclick=async()=>{
  const generation=++viewGeneration;
  try{
    const days=await api('/api/archive');if(generation!==viewGeneration)return;
    show(title('gallery & archive')+`<div class="archive-grid">${days.length?days.map(day=>`<button class="archive-card prompt-card" data-date="${escape(day.date)}"><span>${escape(day.prompt)}</span><small>${escape(day.date)} · ${day.count} drawings</small></button>`).join(''):'<p>no drawings yet. yours could be the first.</p>'}</div>`);wireHome();
    panel.querySelectorAll('[data-date]').forEach(button=>button.onclick=()=>gallery(button.dataset.date));
  }catch(error){if(generation===viewGeneration)errorScreen(error);}
};
async function gallery(day){
  const generation=++viewGeneration;
  try{
    const items=await api(`/api/gallery?date=${encodeURIComponent(day)}`);if(generation!==viewGeneration)return;
    show(title(items[0]?.prompt||'gallery')+`<div class="archive-grid">${items.map(d=>`<button class="archive-card" data-id="${escape(d.id)}"><img src="${escape(d.image)}" alt="${escape(d.prompt)}"><span>${d.mine?'your drawing':'view drawing'}</span><small>${escape(ratingText(d))}</small></button>`).join('')||'<p>no drawings for this prompt yet.</p>'}</div>`);wireHome();
    panel.querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>{viewGeneration++;const drawing=items.find(d=>d.id===button.dataset.id);route(drawing.url);showDrawing(drawing);});
  }catch(error){if(generation===viewGeneration)errorScreen(error);}
}
async function load(){
  const generation=++viewGeneration;
  try{
    const next=await api('/api/today');if(generation!==viewGeneration)return;connected=true;notice.hidden=true;await adoptDay(next);
    const id=location.pathname.match(/^\/d\/([0-9a-f-]{36})$/)?.[1];
    if(id){const drawing=await api(`/api/drawings/${id}`);if(generation===viewGeneration)showDrawing(drawing);}else if(state.submission)showDrawing(state.submission);
  }catch(error){if(generation!==viewGeneration)return;notice.hidden=false;notice.textContent=error.message;}
}
window.addEventListener('popstate',()=>{if(location.pathname==='/')home();else load();});
let checkingDay=false;
async function checkDay(force=false){
  if(!connected || saving || checkingDay || document.hidden || (!force && easternDate()===state.date))return;
  checkingDay=true;
  try{
    const next=await api('/api/today');
    if(next.date!==state.date){
      const wasDrawing=!studio.hidden || dialog.open;
      await adoptDay(next);
      if(wasDrawing){route('/');if(state.submission)showDrawing(state.submission);else{panel.hidden=true;studio.hidden=false;bar.hidden=false;}}
    }
  }catch{/* Recheck before submission; never relabel the existing draft on failure. */}
  finally{checkingDay=false;}
}
setInterval(()=>checkDay(),15000);
window.addEventListener('focus',()=>checkDay(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDay(true);});
load();
