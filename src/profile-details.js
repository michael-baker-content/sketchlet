import { formatPromptDate } from './prompts.js';

const photoKey = 'sketchlet.profilePhoto';
function readPhoto() {
  try { const value = localStorage.getItem(photoKey) || ''; return value.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value) ? value : ''; } catch { return ''; }
}
export function mountProfilePhoto() {
  const nav = document.querySelector('.site-header nav');
  const image = document.createElement('img');
  image.className = 'nav-profile-photo'; image.alt = 'your local profile photo'; image.width = image.height = 32;
  nav.append(image);
  const update = () => { const photo = readPhoto(); image.hidden = !photo; if (photo) image.src = photo; else image.removeAttribute('src'); };
  image.onerror = () => { image.hidden = true; };
  window.addEventListener('storage', update);
  window.addEventListener('sketchlet:photo', update);
  update();
}

// A separate instance is mounted for each identity; disposal rejects late responses.
export function mountProfileDetails(root, request) {
  let active = true, busy = false, photoRevision = 0, next = null;
  let savedPhoto = readPhoto(), pendingPhoto = savedPhoto;
  root.innerHTML = `<h2>your profile</h2><form id="profile-edit-form">
    <label class="name-field">name (optional)<input id="profile-name" maxlength="32" autocomplete="nickname" disabled></label>
    <p>your name appears on your drawings. leave it blank to appear as anonymous.</p>
    <div class="profile-photo"><img id="profile-photo-preview" alt="your local profile photo" hidden>
    <label class="name-field">photo (optional)<input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <button type="button" class="web-button" id="remove-profile-photo">remove photo</button>
    <p>your photo stays in this browser. it is not uploaded or visible to others.</p></div>
    <p id="profile-edit-status" role="status">loading profile…</p>
    <button class="web-button" id="save-name" disabled>save profile</button></form>
    <button class="web-button" id="profile-load-retry" hidden>retry profile</button>
    <section class="profile-drawings" aria-labelledby="profile-drawings-heading"><h2 id="profile-drawings-heading">your drawings</h2>
    <div class="profile-drawing-list"></div><p class="profile-drawing-status" role="status"></p>
    <button class="web-button profile-drawings-more" hidden>load more</button></section>`;
  const $ = selector => root.querySelector(selector);
  const form = $('#profile-edit-form'), name = $('#profile-name'), status = $('#profile-edit-status'), save = $('#save-name');
  const fileInput = $('#profile-photo-file'), remove = $('#remove-profile-photo');
  const list = $('.profile-drawing-list'), more = $('.profile-drawings-more'), drawingStatus = $('.profile-drawing-status');
  function showPhoto() { const image = $('#profile-photo-preview'); image.hidden = !pendingPhoto; if (pendingPhoto) image.src = pendingPhoto; else image.removeAttribute('src'); remove.hidden = !pendingPhoto; }
  function controls(disabled) { for (const element of form.elements) element.disabled = disabled; }
  async function loadName() {
    $('#profile-load-retry').hidden = true;
    try { const profile = await request('/api/profile'); if (!active) return; name.value = profile.displayName || ''; status.textContent = ''; controls(false); }
    catch (error) { if (active) { status.textContent = error.message; $('#profile-load-retry').hidden = false; } }
  }
  async function drawings(before = null) {
    more.hidden = true; drawingStatus.textContent = 'loading your drawings…';
    try {
      const result = await request('/api/profile/drawings' + (before ? '?before=' + encodeURIComponent(before) : ''));
      if (!active) return;
      if (!before) list.replaceChildren();
      for (const drawing of result.drawings) {
        const card = document.createElement(drawing.removed ? 'article' : 'a'); card.className = 'profile-drawing-card';
        if (!drawing.removed) {
          card.href = drawing.url;
          const image = document.createElement('img'); image.src = drawing.image; image.alt = drawing.prompt; image.loading = 'lazy'; card.append(image);
        }
        const caption = document.createElement('span'), title = document.createElement('strong'), date = document.createElement('time');
        title.textContent = drawing.prompt; date.dateTime = drawing.date; date.textContent = formatPromptDate(drawing.date);
        caption.append(title,date);
        if (drawing.removed) { const reason = document.createElement('small'); reason.textContent = drawing.reason; caption.append(reason); }
        card.append(caption); list.append(card);
      }
      next = result.next; more.textContent = 'load more'; more.hidden = !next;
      drawingStatus.textContent = list.children.length ? '' : 'no drawings yet. save your first drawing to the gallery to see it here.';
    } catch (error) { if (active) { drawingStatus.textContent = error.message; next = before; more.textContent = 'try again'; more.hidden = false; } }
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
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return; busy = true; controls(true);
    try {
      const profile = await request('/api/profile',{displayName:name.value});
      if (!active) return;
      name.value = profile.displayName;
      try { localStorage.setItem('sketchlet.displayName',profile.displayName); } catch {}
      if (pendingPhoto !== savedPhoto) {
        try { if (pendingPhoto) localStorage.setItem(photoKey,pendingPhoto); else localStorage.removeItem(photoKey); }
        catch { throw new Error('name saved, but the photo could not be saved in this browser.'); }
        savedPhoto = pendingPhoto; window.dispatchEvent(new Event('sketchlet:photo'));
      }
      status.textContent = 'profile saved';
    } catch (error) { if (active) status.textContent = error.message; }
    finally { busy = false; if (active) controls(false); }
  };
  $('#profile-load-retry').onclick = loadName; more.onclick = () => drawings(next);
  controls(true); showPhoto(); loadName(); drawings();
  return () => { active = false; photoRevision++; root.replaceChildren(); };
}
