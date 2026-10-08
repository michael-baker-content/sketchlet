import { api } from './api-client.js';
import { counted } from './text-format.js';
import { easternDate, promptForDate, formatPromptDate } from './prompts.js';
import { createRatingSkips } from './rating-session.js';
import { drawingPath, drawingIdFromPath } from './drawing-links.js';

export async function startPage({ page, today = null, editor = null, loadEditor = null, storageUnavailable = false }) {
const $ = selector => document.querySelector(selector);
const main = $('main');
let studio = $('.studio'), intro = $('.intro');
let editorUI = null;
const panel = $('#page-content');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = today || { date: easternDate(), prompt: promptForDate(easternDate()), submission: null, streak: 0 };
const connected = !!today;
let queue = [], queueIndex = 0, viewGeneration = 0;
let viewController = null;
function beginView() { viewController?.abort(); viewController = new AbortController(); return ++viewGeneration; }
function viewApi(path) { return api(path, undefined, { signal: viewController.signal }); }
window.addEventListener('pagehide', () => { beginView(); });
// A restored document may contain a canceled loading view or yesterday's status.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
let ratingStorage;
try { ratingStorage = sessionStorage; } catch {}
const ratingSkips = createRatingSkips(ratingStorage);
let pendingRating = null, directRating = false;
const nameStorageKey = 'sketchlet.displayName';
let displayName = '';
try { displayName = localStorage.getItem(nameStorageKey) || ''; } catch {}
function rememberName(name) {
  displayName = name;
  try { localStorage.setItem(nameStorageKey, name); } catch {}
}
function authorMarkup(drawing) {
  const name = drawing.mine ? displayName : drawing.displayName;
  return `<span class="drawing-author"${drawing.mine ? ' data-own-author' : ''}>by ${escape(name || 'anonymous')}</span>`;
}
async function saveName(value) {
  const profile = await api('/api/profile', { displayName: value });
  rememberName(profile.displayName);
  if (state.submission) state.submission.displayName = displayName;
  document.querySelectorAll('[data-own-author]').forEach(element => { element.textContent = `by ${displayName || 'anonymous'}`; });
}
const notice = document.createElement('div'); notice.className = 'preview-notice'; notice.setAttribute('role','status'); notice.textContent = 'connecting to the gallery…'; notice.hidden=true; main.prepend(notice);
function prepareIntro() {
  if (intro) intro.innerHTML = '<div class="daily-heading"><div><p class="prompt-date"></p><h1></h1></div></div>';
}
prepareIntro();
const nameButton = document.createElement('button');
nameButton.className = 'name-nav'; nameButton.textContent = 'profile';
nameButton.setAttribute('aria-haspopup', 'dialog');
$('.site-header nav').append(nameButton);
const nameDialog = document.createElement('dialog');
nameDialog.className = 'submission-dialog';
nameDialog.setAttribute('aria-labelledby', 'name-heading');
nameDialog.innerHTML = '<form method="dialog"><h2 id="name-heading">profile</h2><div class="profile-photo"><img id="profile-photo-preview" alt="your local profile photo" hidden><label class="name-field">photo (optional)<input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-describedby="profile-photo-note"></label><button class="web-button" id="remove-profile-photo" type="button" hidden>remove photo</button><p id="profile-photo-note" class="muted">only saved in this browser. your photo is not uploaded or visible to others.</p><p id="profile-photo-status" role="status"></p></div><label class="name-field">name (optional)<input id="profile-name" maxlength="32" autocomplete="nickname" aria-describedby="profile-name-note"></label><p id="profile-name-note" class="muted">your name is shown on all your drawings, including earlier ones. leave blank to appear as anonymous.</p><p id="name-error" role="alert"></p><div class="dialog-actions"><button class="web-button" value="cancel">cancel</button><button class="web-button primary" id="save-name" type="submit">save profile</button></div></form>';
document.body.append(nameDialog);
const profileDrawings = document.createElement('section');
profileDrawings.className = 'profile-drawings';
profileDrawings.setAttribute('aria-labelledby', 'profile-drawings-heading');
profileDrawings.innerHTML = '<h3 id="profile-drawings-heading">your drawings</h3><p class="muted">saved from this browser, newest first.</p><div class="profile-drawing-list"></div><p class="profile-drawing-status" role="status"></p><button class="web-button profile-drawings-more" type="button" hidden>load more</button>';
nameDialog.append(profileDrawings);
let profileDrawingsRevision = 0, profileNext = null;
const profileMore = profileDrawings.querySelector('button');
profileMore.onclick = () => loadProfileDrawings(profileNext);
async function loadProfileDrawings(before = null) {
  const revision = ++profileDrawingsRevision;
  const list = profileDrawings.querySelector('.profile-drawing-list');
  const status = profileDrawings.querySelector('[role="status"]');
  if (!before) list.replaceChildren();
  profileMore.hidden = true;
  status.textContent = 'loading your drawings…';
  try {
    const result = await api(`/api/profile/drawings${before ? `?before=${encodeURIComponent(before)}` : ''}`);
    if (revision !== profileDrawingsRevision || !nameDialog.open) return;
    for (const drawing of result.drawings) {
      const card = document.createElement('a');
      card.className = 'profile-drawing-card';
      card.href = drawing.url;
      card.innerHTML = `<img src="${escape(drawing.image)}" alt="${escape(drawing.prompt)}" loading="lazy" decoding="async"><span><strong>${escape(drawing.prompt)}</strong><time class="display-date" datetime="${escape(drawing.date)}">${escape(formatPromptDate(drawing.date))}</time><small>${escape(ratingText(drawing))}</small></span>`;
      list.append(card);
    }
    profileNext = result.next;
    status.textContent = list.children.length ? '' : 'no drawings yet. save your first drawing to the gallery to see it here.';
    profileMore.textContent = 'load more';
    profileMore.hidden = !profileNext;
  } catch (error) {
    if (revision !== profileDrawingsRevision || !nameDialog.open) return;
    status.textContent = error.message;
    profileNext = before;
    profileMore.textContent = 'try again';
    profileMore.hidden = false;
  }
}
nameDialog.querySelector('[value="cancel"]').type = 'button';
nameDialog.querySelector('[value="cancel"]').onclick = () => { if (!savingName) nameDialog.close(); };
let savingName = false;
const photoStorageKey = 'sketchlet.profilePhoto';
let savedPhoto = '', pendingPhoto = '', photoRevision = 0, processingPhoto = false;
function readProfilePhoto() {
  try {
    const value = localStorage.getItem(photoStorageKey) || '';
    return value.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : '';
  } catch { return ''; }
}
const navPhoto = document.createElement('img');
navPhoto.className = 'nav-profile-photo';
navPhoto.alt = 'your profile photo';
navPhoto.width = navPhoto.height = 32;
navPhoto.hidden = true;
$('.site-header nav').append(navPhoto);
function syncNavPhoto() {
  const photo = readProfilePhoto();
  navPhoto.hidden = !photo;
  if (photo) navPhoto.src = photo; else navPhoto.removeAttribute('src');
}
navPhoto.onerror = () => { navPhoto.hidden = true; };
window.addEventListener('storage', event => {
  if (event.key === photoStorageKey || event.key === null) syncNavPhoto();
});
syncNavPhoto();
function showProfilePhoto() {
  const preview = $('#profile-photo-preview');
  preview.hidden = !pendingPhoto;
  if (pendingPhoto) preview.src = pendingPhoto; else preview.removeAttribute('src');
  $('#remove-profile-photo').hidden = !pendingPhoto;
}
function openProfile(forRating = false) {
  if (!forRating) pendingRating = null;
  $('#profile-name').value = displayName; $('#name-error').textContent = '';
  $('#profile-name').required = forRating;
  $('#profile-name').closest('label').firstChild.textContent = forRating ? 'name' : 'name (optional)';
  $('#profile-name-note').textContent = forRating ? 'a name is required to rate drawings. it also appears on your drawings.' : 'your name is shown on all your drawings, including earlier ones. leave blank to appear as anonymous.';
  $('#name-heading').textContent = forRating ? 'add a name to rate' : 'profile';
  savedPhoto = pendingPhoto = readProfilePhoto();
  $('#profile-photo-file').value = ''; $('#profile-photo-status').textContent = '';
  showProfilePhoto(); nameDialog.showModal();
  profileDrawings.hidden = forRating;
  if (!forRating) loadProfileDrawings();
}
nameButton.onclick = () => openProfile();
nameDialog.addEventListener('close', () => {
  photoRevision++; processingPhoto = false; $('#save-name').disabled = false;
  const canceledRating = pendingRating;
  pendingRating = null;
  if (canceledRating?.generation === viewGeneration) openArchive();
});
nameDialog.addEventListener('close', () => { profileDrawingsRevision++; });
$('#remove-profile-photo').onclick = () => {
  photoRevision++; processingPhoto = false; pendingPhoto = '';
  $('#profile-photo-file').value = ''; $('#profile-photo-status').textContent = '';
  $('#save-name').disabled = false; showProfilePhoto();
};
$('#profile-photo-file').onchange = async event => {
  const revision = ++photoRevision, file = event.target.files[0];
  processingPhoto = false; $('#save-name').disabled = false;
  $('#profile-photo-status').textContent = '';
  if (!file) return;
  $('#name-error').textContent = '';
  if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    $('#name-error').textContent = 'choose a jpg, png, webp, or gif under 10 mb.'; return;
  }
  processingPhoto = true; $('#save-name').disabled = true;
  $('#profile-photo-status').textContent = 'preparing photo…';
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (revision !== photoRevision || !nameDialog.open) return;
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('choose a smaller photo.');
    const thumbnail = document.createElement('canvas'); thumbnail.width = thumbnail.height = 256;
    const context = thumbnail.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, 256, 256);
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, 256, 256);
    const photo = thumbnail.toDataURL('image/jpeg', .85);
    if (photo.length > 200000) throw new Error('choose a smaller photo.');
    pendingPhoto = photo; showProfilePhoto();
    $('#profile-photo-status').textContent = 'photo ready — save profile to keep it.';
  } catch (error) {
    if (revision === photoRevision) { $('#name-error').textContent = error.message === 'choose a smaller photo.' ? error.message : 'could not read this photo. try a jpg or png.'; $('#profile-photo-status').textContent = ''; }
  } finally {
    URL.revokeObjectURL(url);
    if (revision === photoRevision) { processingPhoto = false; $('#save-name').disabled = false; }
  }
};
nameDialog.addEventListener('cancel', event => { if (savingName) event.preventDefault(); });
nameDialog.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault(); if (savingName || processingPhoto) return;
  if (pendingRating && !$('#profile-name').value.trim()) { $('#name-error').textContent='enter a name to rate drawings.'; return; }
  savingName = true;
  const controls = nameDialog.querySelectorAll('button,input'); controls.forEach(control => { control.disabled = true; });
  try {
    if (pendingRating || $('#profile-name').value !== displayName) await saveName($('#profile-name').value);
    if (pendingPhoto !== savedPhoto) {
      try {
        if (pendingPhoto) localStorage.setItem(photoStorageKey, pendingPhoto);
        else localStorage.removeItem(photoStorageKey);
      } catch { throw new Error('could not save the photo in this browser. try freeing some browser storage.'); }
      savedPhoto = pendingPhoto;
      syncNavPhoto();
    }
    const resume = pendingRating;
    pendingRating = null;
    nameDialog.close();
    if (resume) setTimeout(() => { if(resume.generation === viewGeneration)resume.run(); }, 0);
  }
  catch (error) { $('#name-error').textContent = error.message; }
  finally { savingName = false; controls.forEach(control => { control.disabled = false; }); }
});
function header() {
  if (!intro) return;
  $('.prompt-date').textContent=formatPromptDate(state.date);
  $('.daily-heading h1').textContent=`"${state.prompt}"`;
  if ($('.studio-title')) $('.studio-title').textContent=`today's prompt: "${state.prompt}"`;
}
async function adoptDay(next) {
  const changed = next.date !== state.date;
  if (editor && !next.submission) await editor.setPromptDay(next.date);
  state = next; header();
  if (typeof next.displayName === 'string') rememberName(next.displayName);
  if (editorUI) $('#review-drawing').disabled = !connected;
  if (changed) editorUI?.dayChanged();
  return changed;
}
header();
function show(content) { if(intro) intro.hidden=page==='gallery'; hideEditor(); panel.hidden=false; panel.innerHTML=content; const heading=panel.querySelector('h2'); if(heading){document.title=`${heading.textContent} — sketchlet`;heading.tabIndex=-1;heading.focus();} }
function title(text, back = location.pathname.replace(/\/$/,'') === '/gallery' ? 'gallery' : 'home') { return `<div class="panel-title"><h2>${escape(text)}</h2><button class="web-button" id="back-home" data-return="${back}">${back === 'gallery' ? 'back to gallery' : 'back to today'}</button></div>`; }
function wireHome() { const button=$('#back-home'); button.onclick=button.dataset.return==='gallery'?()=>{openArchive();}:home; }
function errorScreen(error) {
  show(title('could not load')+`<div class="empty-state"><p>${escape(error.message)}</p><button class="web-button" id="retry-page">try again</button></div>`);
  $('#retry-page').onclick = () => window.location.reload();
  wireHome();
}
function showLoading(label) {
  if (intro) intro.hidden = true;
  hideEditor();
  panel.hidden = false;
  panel.innerHTML = `<div class="panel-title"><h2>${escape(label)}</h2></div><div class="empty-state" role="status">loading…</div>`;
  document.title = `${label} — sketchlet`;
}
function hideEditor() { if (studio) studio.hidden=true; if (editorUI) editorUI.bar.hidden=true; }
function ratingText(drawing) { return drawing.count ? `${counted(drawing.average.toFixed(1), 'star')} · ${counted(drawing.count, 'rating')}` : 'no ratings yet'; }
function syncHeaderLinks() {
  const galleryPage = location.pathname.startsWith('/gallery') || location.pathname.startsWith('/d/') || ['gallery', 'rate'].includes(new URLSearchParams(location.search).get('view'));
  for (const [id, current] of [['open-home', !galleryPage], ['open-archive', galleryPage]]) {
    const link = $('#' + id);
    if (current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}
syncHeaderLinks();
window.addEventListener('popstate', syncHeaderLinks);
function route(path) { if(location.pathname+location.search!==path) window.history.pushState({},'',path); syncHeaderLinks(); }
function home() { window.location.assign('/'); }
function showDrawing(drawing) {
  show(title(drawing.mine?'your drawing':drawing.prompt)+`<div class="submission-layout"><img class="finished-drawing" alt="${escape(drawing.prompt)}"><div class="submission-info"><h3>${escape(drawing.prompt)}</h3><p><time class="display-date">${escape(formatPromptDate(drawing.date))}</time></p><p class="rating-total">${escape(ratingText(drawing))}</p>${drawing.mine && today?`<div class="streak-box"><strong>${counted(state.streak, 'day')}</strong><span>drawing streak</span></div>`:''}<div class="drawing-actions"><button class="web-button" id="copy-drawing-link" type="button">copy link</button><button class="web-button" id="share-drawing-card" type="button">share card</button><button class="web-button primary" id="start-rating">rate drawings</button></div><p class="muted share-status" id="share-status" role="status"></p>${!drawing.mine && drawing.myVote?`<p>your rating: ${drawing.myVote} / 5</p>`:''}</div></div>`);
  panel.querySelector('img').src=drawing.image;
  panel.querySelector('.submission-info h3').insertAdjacentHTML('afterend', authorMarkup(drawing));
  const copyButton = $('#copy-drawing-link'), shareStatus = $('#share-status');
  const shareUrl = new URL(drawingPath(drawing.id, drawing.prompt), location.origin).href;
  copyButton.onclick = async () => {
    copyButton.disabled = true;
    shareStatus.replaceChildren();
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareStatus.textContent = 'link copied!';
    } catch {
      shareStatus.textContent = 'copying was blocked. you can copy the address from this link: ';
      const link = document.createElement('a');
      link.href = shareUrl; link.textContent = 'drawing link';
      shareStatus.append(link);
    } finally { copyButton.disabled = false; }
  };
  const cardButton = $('#share-drawing-card');
  cardButton.onclick = async () => {
    cardButton.disabled = true;
    try {
      const { openShareCard } = await import('./share-card.js');
      if (cardButton.isConnected) openShareCard(drawing, cardButton);
    } catch {
      if (cardButton.isConnected) shareStatus.textContent = 'could not open the share card. please try again.';
    } finally { cardButton.disabled = false; }
  };
  if (location.pathname.startsWith('/d/')) {
    window.history.replaceState({}, '', drawingPath(drawing.id, drawing.prompt) + location.search);
  }
  wireHome();
  $('#start-rating').textContent = drawing.mine ? 'rate drawings' : drawing.myVote ? 'edit your rating' : 'rate this drawing';
  $('#start-rating').onclick=()=>startRating(drawing.mine ? null : drawing.id);
  // Rating is available independently of submitting a drawing.
}
async function startRating(drawingId = null){
  if (page === 'home') {
    window.location.assign(drawingId ? '/gallery?view=rate&drawing=' + encodeURIComponent(drawingId) : '/gallery?view=rate');
    return;
  }
  const generation=beginView();
  try {
    const profile = await viewApi('/api/profile');
    if(generation!==viewGeneration)return;
    if (!profile.displayName?.trim()) {
      pendingRating={generation,run:()=>startRating(drawingId)};
      openProfile(true); return;
    }
    rememberName(profile.displayName);
    route(drawingId ? `/gallery?view=rate&drawing=${encodeURIComponent(drawingId)}` : '/gallery?view=rate');
    const result = drawingId ? [await viewApi(`/api/drawings/${encodeURIComponent(drawingId)}`)] : await viewApi(`/api/queue?skip=${encodeURIComponent(ratingSkips.ids().join(','))}`);
    if(generation!==viewGeneration)return;
    if(drawingId && result[0].mine){route(result[0].url);showDrawing(result[0]);return;}
    directRating=!!drawingId;queue=result;queueIndex=0;renderRating();
  } catch(error) {
    if(generation!==viewGeneration)return;
    if(error.code==='name_required'){pendingRating={generation,run:()=>startRating(drawingId)};openProfile(true);}
    else errorScreen(error);
  }
}
function renderRating(){
  const drawing=queue[queueIndex];
  if(!drawing){
    show(title('rating break','home')+`<div class="empty-state"><p>you’ve reached the end of this batch.</p><button class="web-button" id="more-ratings">check for more drawings</button>${ratingSkips.ids().length?'<button class="web-button" id="review-skipped">include skipped drawings</button>':''}</div>`);
    const navigation = document.createElement('div');
    navigation.className = 'panel-navigation';
    const backToday = $('#back-home');
    backToday.before(navigation);
    const backGallery = document.createElement('button');
    backGallery.className = 'web-button';backGallery.textContent = 'back to gallery';
    backGallery.onclick = () => { route('/gallery');openArchive(); };
    navigation.append(backGallery, backToday);
    wireHome();$('#more-ratings').onclick=()=>startRating();
    if($('#review-skipped'))$('#review-skipped').onclick=()=>{ratingSkips.clear();startRating();};return;
  }
  show(title('rate a drawing')+`<div class="rating-layout"><p><time class="display-date">${escape(formatPromptDate(drawing.date))}</time> · ${escape(drawing.prompt)}</p><img class="rating-drawing" alt="${escape(drawing.prompt)}"><fieldset class="star-picker"><legend>your rating</legend>${[1,2,3,4,5].map(n=>`<label><input type="radio" name="stars" value="${n}" aria-label="${counted(n, 'star')}"><span aria-hidden="true">☆</span></label>`).join('')}</fieldset><p id="rating-status" class="muted" role="status">choose 1–5 stars</p><div class="rating-actions"><button class="web-button" id="skip-rating">skip</button><button class="web-button primary" id="save-rating" disabled>save rating</button></div></div>`);
  wireHome();let selected=drawing.myVote || 0, imageReady=false, votePending=false;
  const ratingImage=panel.querySelector('.rating-drawing');
  const stars=panel.querySelector('.star-picker');
  const ratingStatus=$('#rating-status'), saveRating=$('#save-rating');
  stars.disabled=true;
  ratingStatus.textContent='loading drawing…';
  if(selected){
    panel.querySelector(`[name="stars"][value="${selected}"]`).checked=true;
    panel.querySelectorAll('.star-picker span').forEach((span,i)=>span.textContent=i<selected?'★':'☆');
    saveRating.textContent='update rating';
  }
  ratingImage.onload=()=>{imageReady=true;stars.disabled=false;saveRating.disabled=!selected;ratingStatus.textContent=selected?`your rating: ${counted(selected, 'star')}`:'choose 1–5 stars';};
  ratingImage.onerror=()=>{imageReady=false;stars.disabled=true;saveRating.disabled=true;ratingStatus.textContent='could not load this drawing. you can skip it.';};
  ratingImage.src=drawing.image;
  panel.querySelector('.rating-drawing').insertAdjacentHTML('beforebegin', authorMarkup(drawing));
  panel.querySelectorAll('[name="stars"]').forEach(radio=>radio.onchange=()=>{if(!imageReady || votePending)return;selected=Number(radio.value);panel.querySelectorAll('.star-picker span').forEach((span,i)=>span.textContent=i<selected?'★':'☆');$('#save-rating').disabled=false;$('#rating-status').textContent=`${counted(selected, 'star')} selected`;});
  $('#skip-rating').textContent=directRating?'back to drawing':'skip';
  $('#skip-rating').onclick=()=>{if(votePending)return;if(directRating){route(drawing.url);showDrawing(drawing);return;}ratingSkips.add(drawing.id);queueIndex++;renderRating();};
  $('#save-rating').onclick=async()=>{
    if(votePending || !imageReady || !selected)return;
    votePending=true;stars.disabled=true;
    const generation=viewGeneration;const button=$('#save-rating'),skip=$('#skip-rating'),status=$('#rating-status');button.disabled=skip.disabled=true;status.textContent='saving rating…';
    try{const updated=await api(`/api/drawings/${drawing.id}/vote`,{stars:selected});if(generation!==viewGeneration)return;if(directRating){route(updated.url);showDrawing(updated);return;}queueIndex++;renderRating();}
    catch(error){if(generation!==viewGeneration)return;votePending=false;stars.disabled=false;status.textContent=error.message;button.disabled=skip.disabled=false;if(error.code==='name_required'){pendingRating={generation,run:()=>startRating(drawing.id)};openProfile(true);}}
  };
}
async function openArchive(){
  if (page === 'home') { window.location.assign('/gallery'); return; }
  route('/gallery');
  const generation=beginView();
  showLoading('gallery');
  try{
    const days=await viewApi('/api/archive');if(generation!==viewGeneration)return;
    show(title('gallery','home')+`<div class="gallery-actions"><button class="web-button primary" id="gallery-rate">rate drawings</button></div><div class="archive-grid">${days.length?days.map(day=>`<button class="archive-card prompt-card" data-date="${escape(day.date)}"><img src="${escape(day.image)}" alt="drawing for ${escape(day.prompt)}" loading="lazy" decoding="async"><span>${escape(day.prompt)}</span><small><time class="display-date">${escape(formatPromptDate(day.date))}</time> · ${counted(day.count, 'drawing')}</small></button>`).join(''):'<p>no drawings yet. yours could be the first.</p>'}</div>`);wireHome();
    $('#gallery-rate').onclick=()=>startRating();
    panel.querySelectorAll('[data-date]').forEach(button=>button.onclick=()=>gallery(button.dataset.date));
  }catch(error){if(generation===viewGeneration)errorScreen(error);}
}
$('#open-archive').onclick=event=>{
  if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
  event.preventDefault();route('/gallery');openArchive();
};

async function gallery(day){
  route(`/gallery?date=${encodeURIComponent(day)}`);
  const generation=beginView();
  showLoading('gallery');
  try{
    const items=await viewApi(`/api/gallery?date=${encodeURIComponent(day)}`);if(generation!==viewGeneration)return;
    show(title(items[0]?.prompt||'gallery')+`<div class="archive-grid">${items.map(d=>`<button class="archive-card" data-id="${escape(d.id)}"><img src="${escape(d.image)}" alt="${escape(d.prompt)}"><span>${d.mine?'your drawing':'view drawing'}</span><small>${escape(ratingText(d))}</small></button>`).join('')||'<p>no drawings for this prompt yet.</p>'}</div>`);wireHome();
    panel.querySelectorAll('[data-id]').forEach(card => {
      const drawing = items.find(item => item.id === card.dataset.id);
      card.querySelector('small').insertAdjacentHTML('afterbegin', authorMarkup(drawing));
    });
    panel.querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>{beginView();const drawing=items.find(d=>d.id===button.dataset.id);route(drawing.url);showDrawing(drawing);});
  }catch(error){if(generation===viewGeneration)errorScreen(error);}
}
async function load() {
  const generation = beginView();
  if (page === 'home') {
    await adoptDay(today);
    if (generation !== viewGeneration) return;
    if (state.submission) { showDrawing(state.submission); return; }
    if (!editor) {
      if (!loadEditor) throw new Error('drawing tools are unavailable. please reload.');
      show(`<div class="panel-title"><h2>today's drawing</h2></div><div class="drawing-welcome"><p class="display-date">${escape(formatPromptDate(state.date))}</p><h3>today's prompt: "${escape(state.prompt)}"</h3><p>draw your interpretation. a quick doodle is welcome.</p><ul><li>your draft saves on this device.</li><li>one drawing per day — final once saved to the gallery.</li><li>a new prompt arrives at midnight eastern.</li></ul>${storageUnavailable ? '<p role="status">local draft storage is unavailable. your drawing may not survive a reload.</p>' : ''}<button class="web-button primary" id="begin-drawing">begin drawing</button><p id="begin-status" role="status"></p></div>`);
      $('#begin-drawing').onclick = async () => {
        const button = $('#begin-drawing'); button.disabled = true; button.textContent = 'opening…';
        try {
          // Reading the introduction can cross midnight or another tab's save.
          const next = await api('/api/today');
          if (next.date !== today.date || next.submission) { today = next; await load(); return; }
          editor = await loadEditor();
          studio = $('.studio'); intro = $('.intro');
          prepareIntro();
          await attachEditor();
          today = next; await load();
          $('#canvas').focus({ preventScroll: true });
        } catch (error) { errorScreen(error); }
      };
      return;
    }
    intro.hidden=false; panel.hidden=true; studio.hidden=false; editorUI.bar.hidden=false;
    editor.showDraftStatus();
    document.title='sketchlet - a little drawing every day';
    return;
  }
  const params = new URLSearchParams(location.search);
  const id = drawingIdFromPath(location.pathname);
  showLoading(id ? 'drawing' : 'gallery');
  try {
    if (location.pathname.startsWith('/d/') && !id) throw new Error('drawing not found');
    if (params.get('view') === 'rate') { await startRating(params.get('drawing')); return; }
    if (id) {
      const drawing = await viewApi('/api/drawings/' + id);
      if (generation === viewGeneration) showDrawing(drawing);
    } else if (params.has('date')) await gallery(params.get('date'));
    else await openArchive();
  } catch (error) { if (generation === viewGeneration) errorScreen(error); }
}
window.addEventListener('popstate', () => { load().catch(errorScreen); });
async function attachEditor() {
  const { createSubmissionControls } = await import('./submission.js');
  editorUI = createSubmissionControls({
    studio, editor, getState: () => state, isConnected: () => connected,
    getDisplayName: () => displayName, saveName, adoptDay, home, showDrawing, notice, api,
    revision: () => viewGeneration, isCurrent: value => value === viewGeneration,
  });
}
if (editor) await attachEditor();
if (typeof today?.displayName === 'string') rememberName(today.displayName);
if (page === 'home') {
  let checkingDay = false;
  async function checkDay(force = false) {
    if (editorUI?.saving || checkingDay || document.hidden || (!force && easternDate() === state.date)) return;
    checkingDay = true;
    try {
      const next = await api('/api/today');
      // A new day or a submission from another tab changes which home page is needed.
      if (next.date !== state.date && editor && !next.submission) {
        // Preserve/finish the old day's draft before changing its canvas.
        await adoptDay(next);
      } else if (next.date !== state.date || next.submission?.id !== state.submission?.id) {
        window.location.reload();
      }
    } catch { /* Submission independently checks the server date. */ }
    finally { checkingDay = false; }
  }
  setInterval(() => checkDay(), 15000);
  window.addEventListener('focus', () => checkDay(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(true); });
}
await load();
}
