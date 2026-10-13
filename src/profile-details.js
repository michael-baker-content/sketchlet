import { formatPromptDate } from './prompts.js';
import { accountHeaders } from './account-client.js';

const photoKey = 'sketchlet.profilePhoto';
function readPhoto() {
  try { const value = localStorage.getItem(photoKey) || ''; return value.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : ''; } catch { return ''; }
}
export function mountProfilePhoto() {
  const nav = document.querySelector('.site-header nav');
  const image = document.createElement('img');
  image.className = 'nav-profile-photo'; image.alt = 'your local profile photo'; image.width = image.height = 32;
  nav.append(image);
  let revision = 0;
  const update = async () => {
    const current = ++revision;
    image.hidden = true; image.removeAttribute('src');
    try {
      const headers = await accountHeaders();
      let photo = readPhoto();
      if (headers.Authorization) {
        const response = await fetch('/api/profile/avatar',{headers,credentials:'same-origin',cache:'no-store'});
        if (!response.ok) return;
        photo = (await response.json()).photo;
      }
      if (current !== revision) return;
      image.alt = 'your profile photo'; image.hidden = !photo;
      if (photo) image.src = photo;
    } catch { /* Expired sessions never fall back to another identity's photo. */ }
  };
  image.onerror = () => { image.hidden = true; };
  window.addEventListener('storage', update);
  window.addEventListener('sketchlet:photo', update);
  update();
}

// A separate instance is mounted for each identity; disposal rejects late responses.
export function mountProfileDetails(root, request, {account = false} = {}) {
  let active = true, busy = false, photoRevision = 0;
  let savedPhoto = account ? '' : readPhoto(), pendingPhoto = savedPhoto;
  root.innerHTML = `<div class="profile-editor"><h2>your profile</h2><form id="profile-edit-form">
    <label class="name-field">name (optional)<input id="profile-name" maxlength="32" autocomplete="nickname" disabled></label>
    <p>Your name appears on your drawings. Leave it blank to appear as anonymous.</p>
    <div class="profile-photo"><img id="profile-photo-preview" alt="your profile photo" hidden>
    <label class="name-field">photo (optional)<input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <button type="button" class="web-button site-button danger" id="remove-profile-photo">remove photo</button>
    <button type="button" class="web-button site-button utility" id="use-local-photo" hidden>use this browser’s photo for my account</button>
    <p>${account ? 'Your account photo syncs across your signed-in devices. Only you can see it; it is not shown on drawings, galleries, or to other users.' : 'Your photo stays in this browser. It is not uploaded or visible to others.'}</p></div>
    <p id="profile-edit-status" role="status">loading profile…</p>
    <button class="web-button site-button primary" id="save-name" disabled>save profile</button></form>
    <button class="web-button site-button utility" id="profile-load-retry" hidden>retry profile</button></div>
    <section class="profile-drawings" aria-labelledby="profile-drawings-heading"><h2 id="profile-drawings-heading">your drawings</h2>
    <p>Your five most recent drawings appear here. See the full collection in <a href="/gallery?view=mine">your gallery</a>.</p>
    <div class="profile-drawing-list"></div><p class="profile-drawing-status" role="status"></p>
    <button class="web-button site-button utility profile-drawings-more" hidden>try again</button></section>`;
  const $ = selector => root.querySelector(selector);
  const form = $('#profile-edit-form'), name = $('#profile-name'), status = $('#profile-edit-status'), save = $('#save-name');
  const fileInput = $('#profile-photo-file'), remove = $('#remove-profile-photo');
  const list = $('.profile-drawing-list'), more = $('.profile-drawings-more'), drawingStatus = $('.profile-drawing-status');
  function showPhoto() { const image = $('#profile-photo-preview'); image.hidden = !pendingPhoto; if (pendingPhoto) image.src = pendingPhoto; else image.removeAttribute('src'); remove.hidden = !pendingPhoto; }
  function controls(disabled) { for (const element of form.elements) element.disabled = disabled; }
  async function loadName() {
    $('#profile-load-retry').hidden = true;
    try {
      const [profile, avatar] = await Promise.all([request('/api/profile'),account ? request('/api/profile/avatar') : null]);
      if (!active) return;
      if (account) { savedPhoto = pendingPhoto = avatar.photo || ''; showPhoto(); }
      $('#use-local-photo').hidden = !account || !readPhoto();
      name.value = profile.displayName || ''; status.textContent = ''; controls(false);
    }
    catch (error) { if (active) { status.textContent = error.message; $('#profile-load-retry').hidden = false; } }
  }
  async function drawings() {
    more.hidden = true; drawingStatus.textContent = 'loading your drawings…';
    try {
      const result = await request('/api/profile/drawings?preview=1');
      if (!active) return;
      list.replaceChildren();
      for (const drawing of result.drawings.slice(0,5)) {
        const card = document.createElement(drawing.removed ? 'article' : 'a'); card.className = 'profile-drawing-card';
        if (!drawing.removed) {
          card.href = drawing.url;
          const image = document.createElement('img'); image.width = image.height = 72; image.src = drawing.image; image.alt = drawing.prompt; image.loading = 'lazy'; card.append(image);
        }
        const caption = document.createElement('span'), title = document.createElement('strong'), date = document.createElement('time');
        title.textContent = drawing.prompt; date.dateTime = drawing.date; date.textContent = formatPromptDate(drawing.date);
        caption.append(title,date);
        if (drawing.removed) { const reason = document.createElement('small'); reason.textContent = drawing.reason; caption.append(reason); }
        card.append(caption); list.append(card);
      }
      drawingStatus.textContent = list.children.length ? '' : 'no drawings yet. save your first drawing to the gallery to see it here.';
    } catch (error) { if (active) { drawingStatus.textContent = error.message; more.hidden = false; } }
  }
  fileInput.onchange = async () => {
    const file = fileInput.files[0], version = ++photoRevision;
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > 10*1024*1024) { status.textContent = 'choose a jpg, png, webp, or gif under 10 mb.'; return; }
    busy = true; controls(true); status.textContent = 'preparing photo…';
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (!active || version !== photoRevision) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth*image.naturalHeight > 40000000) throw new Error('choose a smaller photo.');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d'), edge = Math.min(image.naturalWidth,image.naturalHeight);
      context.fillStyle = '#fff'; context.fillRect(0,0,256,256);
      context.drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,256,256);
      const photo = canvas.toDataURL('image/jpeg',.85);
      if (photo.length > 200000) throw new Error('choose a smaller photo.');
      pendingPhoto = photo; showPhoto(); status.textContent = 'photo ready — save profile to keep it.';
    } catch { if (active) status.textContent = 'could not read this photo. try a smaller jpg or png.'; }
    finally { URL.revokeObjectURL(url); busy = false; if (active) controls(false); }
  };
  remove.onclick = () => { pendingPhoto = ''; fileInput.value = ''; showPhoto(); status.textContent = 'save profile to remove your photo.'; };
  $('#use-local-photo').onclick = () => {
    pendingPhoto = readPhoto(); showPhoto();
    status.textContent = 'browser photo selected — save profile to upload it to your account.';
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return; busy = true; controls(true);
    try {
      const profile = await request('/api/profile',{displayName:name.value});
      if (!active) return;
      name.value = profile.displayName;
      try { localStorage.setItem('sketchlet.displayName',profile.displayName); } catch {}
      if (pendingPhoto !== savedPhoto) {
        try {
          if (account) {
            const result = await request('/api/profile/avatar',{photo:pendingPhoto || null});
            if (!active) return;
            pendingPhoto = result.photo || ''; showPhoto();
          } else if (pendingPhoto) localStorage.setItem(photoKey,pendingPhoto); else localStorage.removeItem(photoKey);
        }
        catch { throw new Error(account ? 'name saved, but the account photo could not be saved. please try again.' : 'name saved, but the photo could not be saved in this browser.'); }
        savedPhoto = pendingPhoto; window.dispatchEvent(new Event('sketchlet:photo'));
      }
      status.textContent = 'profile saved';
    } catch (error) { if (active) status.textContent = error.message; }
    finally { busy = false; if (active) controls(false); }
  };
  $('#profile-load-retry').onclick = loadName; more.onclick = drawings;
  controls(true); showPhoto();
  const dispose = () => { active = false; photoRevision++; root.replaceChildren(); };
  // Initial content (or its retry state) is ready together; thumbnails stay lazy.
  dispose.ready = Promise.all([loadName(), drawings()]);
  return dispose;
}
