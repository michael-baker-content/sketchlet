import { announcementBody } from './announcement-format.js';

export function announcementState(item) {
  if (!item.version) return 'New draft — not saved yet.';
  if (item.status === 'draft') return 'Saved draft — private, with no publication scheduled.';
  const time = new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'long'}).format(new Date(item.published_at));
  return item.status === 'scheduled' ? `Scheduled for ${time}.` : `Published · ${time}.`;
}

export function announcementId(crypto = globalThis.crypto) {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues remains available on HTTP development/test origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes,byte => byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function mountAnnouncements(root,{request,onExpired,onSaved}) {
  root.innerHTML = `<h2 id="announcements-admin-heading">announcements</h2>
    <p>Drafts stay private. Published posts appear on Info, with the latest title on home. Scheduled posts appear when their time arrives and a visitor loads the page.</p>
    <button class="web-button site-button utility" id="announcement-refresh">refresh list</button>
    <div class="announcement-editor-layout"><div><h3>recent announcements</h3><p>The 100 most recently edited posts.</p><ul id="announcement-list"></ul><button class="web-button site-button" id="announcement-new">new announcement</button></div>
    <form id="announcement-form"><label>title<input name="title" required maxlength="120"></label>
    <label>short description (optional)<input name="description" maxlength="240" aria-describedby="announcement-description-help"></label>
    <p id="announcement-description-help">Up to 240 characters of plain text, shown below the title on home. Leave blank to show only the title.</p>
    <label>message<textarea name="body" required maxlength="10000" rows="8" aria-describedby="announcement-help"></textarea></label>
    <div id="announcement-help"><p>Use blank lines for paragraphs, **bold text**, and lines starting with “- ” for a list. Add links with <code>[open your profile](/profile)</code> or <code>[visit a site](https://example.com)</code>.</p><p>To embed a YouTube video, paste its full watch, share, Shorts, or live URL in its own paragraph, with a blank line before and after it. Use a Markdown link instead if you only want a clickable link. Check the preview below; raw HTML and other embeds are displayed as text.</p></div>
    <label>publish time<input name="publishAt" type="datetime-local" aria-describedby="announcement-timezone announcement-schedule-help"></label><p id="announcement-timezone"></p>
    <p id="announcement-schedule-help">To schedule: choose a future date and time, then press “schedule”. Entering a time alone does not schedule a draft. Check the saved status below for confirmation.</p>
    <p id="announcement-state" class="announcement-saved-state"></p><p id="announcement-unsaved" hidden>Unsaved changes — the saved status above has not changed.</p><div class="dialog-actions">
    <button class="web-button site-button primary" type="submit">save draft</button>
    <button class="web-button site-button" type="button" id="announcement-publish">publish now</button>
    <button class="web-button site-button" type="button" id="announcement-schedule">schedule</button>
    <button class="web-button site-button utility" type="button" id="announcement-unpublish" hidden>unpublish to draft</button></div>
    <h3>homepage preview</h3><div class="announcement-home-preview reading-copy"></div>
    <h3>full announcement preview</h3><div class="announcement-preview reading-copy"></div></form></div>
    <p id="announcement-status" role="status"></p>`;
  const $ = selector => root.querySelector(selector), form = $('#announcement-form'), status = $('#announcement-status');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('#announcement-timezone').textContent = `Times use your browser’s time zone: ${zone}.`;
  let current, dirty = false, busy = false;
  function preview() {
    const homeTitle = document.createElement('strong'); homeTitle.textContent = form.elements.title.value;
    const description = document.createElement('p'); description.textContent = form.elements.description.value.trim();
    $('.announcement-home-preview').replaceChildren(homeTitle,...(description.textContent ? [description] : []));
    const heading = document.createElement('h4'); heading.textContent = form.elements.title.value;
    const body = document.createElement('div'); body.innerHTML = announcementBody(form.elements.body.value);
    $('.announcement-preview').replaceChildren(heading,body);
  }
  function edit(item = {id:announcementId(),version:0,title:'',body:'',status:'draft',published_at:null}) {
    if (busy || (dirty && !confirm('Discard unsaved announcement changes?'))) return;
    current = item; dirty = false;
    form.elements.title.value = item.title; form.elements.body.value = item.body;
    form.elements.description.value = item.description || '';
    const date = item.published_at ? new Date(item.published_at) : null;
    form.elements.publishAt.value = date ? new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
    $('#announcement-state').textContent = announcementState(item);
    $('#announcement-unsaved').hidden = true;
    form.querySelector('[type=submit]').textContent = item.status === 'published' ? 'save published changes' : item.status === 'scheduled' ? 'save scheduled changes' : 'save draft';
    $('#announcement-unpublish').hidden = item.status === 'draft';
    preview();
  }
  form.addEventListener('input',() => {dirty=true;$('#announcement-unsaved').hidden=false;preview();});
  async function list() {
    const result = await request('announcements');
    if (!root.isConnected) return;
    $('#announcement-list').replaceChildren();
    for (const item of result.items) {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type='button'; button.className='web-button site-button utility';
      button.textContent = `${item.title} · ${item.status}`;
      const details = document.createElement('p'); details.textContent = announcementState(item);
      button.onclick=()=>edit(item); li.append(button,details); $('#announcement-list').append(li);
    }
    if (!result.items.length) $('#announcement-list').textContent = 'no announcements yet';
  }
  function failure(error) {
    if (!root.isConnected) return;
    if (error.status===401) {onExpired();return;}
    status.textContent=error.message;
  }
  async function save(nextStatus) {
    if (busy || !form.reportValidity()) return;
    let publishAt = null;
    if (nextStatus==='scheduled') {
      const date = new Date(form.elements.publishAt.value);
      if (!Number.isFinite(date.getTime()) || date.getTime()<=Date.now()) {status.textContent='choose a future publishing time';return;}
      publishAt=date.toISOString();
    }
    busy=true; root.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
    status.textContent='saving announcement…';
    try {
      const result=await request('announcements/save',{method:'POST',body:{id:current.id,version:current.version,title:form.elements.title.value,body:form.elements.body.value,description:form.elements.description.value,status:nextStatus,publishAt}});
      if (!root.isConnected) return;
      busy=false;dirty=false;edit(result.item);
      const confirmation = nextStatus==='draft' ? 'draft saved' : announcementState(result.item);
      status.textContent=confirmation;
      try { await list(); await onSaved(); }
      catch { status.textContent=`${confirmation} The save succeeded, but the list or activity could not refresh. Refresh the list to check it.`; }
    } catch(error) {
      if (error.status===401) failure(error);
      else status.textContent=`Save not confirmed: ${error.message}. Your edits are still here. Refresh the list and reopen this post to check its saved status before retrying.`;
    }
    finally {busy=false;if(root.isConnected)root.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);}
  }
  form.onsubmit=event=>{event.preventDefault();save(current.status);};
  $('#announcement-publish').onclick=()=>save('published');
  $('#announcement-schedule').onclick=()=>save('scheduled');
  $('#announcement-unpublish').onclick=()=>save('draft');
  $('#announcement-new').onclick=()=>edit();
  $('#announcement-refresh').onclick=()=>list().catch(failure);
  edit(); await list().catch(failure);
}
