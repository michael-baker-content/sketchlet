import { reportReasons, removalReasons } from './moderation-options.js';

// User-supplied names, explanations, and notes are inserted as text only.
export function mountModeration(root, { request, onExpired, onSaved }) {
  root.innerHTML = `<h2 id="moderation-heading">moderation</h2><div class="admin-filters"><label><span id="review-kind-label">review</span><select id="review-kind" aria-labelledby="review-kind-label"><option value="reports">reports</option><option value="drawings">submissions</option></select></label><label><span id="review-filter-label">show</span><select id="review-filter" aria-labelledby="review-filter-label"></select></label><button class="web-button site-button utility" id="review-refresh">refresh list</button></div><p id="review-status" role="status"></p><div class="admin-review-list"></div><button class="web-button site-button utility" id="review-more" hidden>load more</button>`;
  const kind = root.querySelector('#review-kind'), filter = root.querySelector('#review-filter');
  const list = root.querySelector('.admin-review-list'), status = root.querySelector('#review-status');
  const more = root.querySelector('#review-more'), refresh = root.querySelector('#review-refresh');
  let next = null, revision = 0;
  function filters() {
    filter.replaceChildren();
    for (const value of kind.value === 'reports' ? ['open','resolved'] : ['all','public','hidden','pending']) {
      filter.add(new Option(value,value));
    }
  }
  async function load(before = null) {
    if (!root.isConnected) return;
    const version = ++revision;
    more.hidden = true; refresh.disabled = true; status.textContent = 'loading review queue…';
    if (!before) list.replaceChildren();
    try {
      const result = await request(`${kind.value}?filter=${filter.value}${before ? '&before=' + encodeURIComponent(before) : ''}`);
      if (version !== revision || !root.isConnected) return;
      for (const item of result.items) {
        const card = document.createElement('details'); card.className = 'admin-review-card';
        const id = item.drawing_id || item.id;
        const summary = document.createElement('summary');
        const content = document.createElement('div'); content.className = 'admin-review-details';
        const image = document.createElement('img');
        image.alt = item.prompt; image.loading = 'lazy'; image.width = image.height = 160;
        // Collapsed queue rows must not fetch or reveal potentially sensitive artwork.
        card.addEventListener('toggle',() => {
          if (card.open && !image.hasAttribute('src')) image.src = `/api/admin/drawings/${id}/image`;
        });
        const heading = document.createElement('strong'); heading.textContent = item.prompt;
        const details = document.createElement('span'); details.className = 'admin-review-meta';
        details.textContent = `${item.date} · ${item.display_name || 'anonymous'} · ${item.drawing_status || item.status}`;
        summary.append(heading,details);
        content.append(image);
        if (item.category) {
          const reason = document.createElement('span'); reason.className = 'admin-review-meta'; reason.textContent = `${item.status} report: ${reportReasons[item.category] || item.category}`;
          const explanation = document.createElement('p'); explanation.className = 'report-explanation'; explanation.textContent = item.explanation || 'no additional explanation.';
          summary.append(reason); content.append(explanation);
        } else {
          const count = document.createElement('span'); count.className = 'admin-review-meta'; count.textContent = `open reports: ${item.reports}`; summary.append(count);
        }
        for (const field of summary.children) field.title = field.textContent;
        const identifier = document.createElement('p'); identifier.textContent = `drawing ID: ${id}`; content.append(identifier);
        if (item.reason) { const reason = document.createElement('p'); reason.textContent = `removal reason: ${removalReasons[item.reason] || item.reason}`; content.append(reason); }
        const button = document.createElement('button'); button.className = 'web-button site-button'; button.textContent = 'review drawing';
        button.onclick = () => review(item,button); content.append(button); card.append(summary,content); list.append(card);
      }
      next = result.next; more.hidden = !next;
      status.textContent = list.children.length ? '' : 'nothing to review here.';
    } catch (error) {
      if (version !== revision || !root.isConnected) return;
      if (error.status === 401) onExpired(); else {
        status.textContent = error.message;
        if (before) { next = before; more.hidden = false; }
      }
    } finally { if (version === revision) refresh.disabled = false; }
  }
  function review(item, trigger) {
    const id = item.drawing_id || item.id;
    const dialog = document.createElement('dialog'); dialog.className = 'submission-dialog admin-review-dialog';
    dialog.setAttribute('aria-labelledby','review-dialog-heading');
    dialog.innerHTML = `<h2 id="review-dialog-heading">review drawing</h2><p class="review-caption"></p><img class="admin-review-image" alt=""><p class="review-explanation"></p><form><label class="name-field"><span id="review-action-label">action</span><select name="action" aria-labelledby="review-action-label"><option value="hide">hide drawing</option><option value="restore">restore drawing</option><option value="clear_name">clear creator's display name</option></select></label><label class="name-field" id="reason-field"><span id="review-reason-label">removal reason (visible to creator)</span><select name="reason" aria-labelledby="review-reason-label"></select></label><label class="name-field">private note (optional)<textarea name="note" maxlength="2000" rows="3"></textarea></label><p class="muted">Hiding keeps the day's submission. Restoring makes it public again. Clearing a name applies to all of this creator's drawings; they can choose a new name.</p><p role="status" id="review-result"></p><div class="dialog-actions"><button type="button" class="web-button site-button utility" id="review-close">close</button><button type="submit" class="web-button site-button primary">apply action</button></div></form>`;
    dialog.querySelector('.review-caption').textContent = `${item.prompt} · ${item.date} · ${item.display_name || 'anonymous'}`;
    dialog.querySelector('.review-explanation').textContent = item.explanation || item.reason || '';
    const image = dialog.querySelector('img'); image.src = `/api/admin/drawings/${id}/image`; image.alt = item.prompt;
    const form = dialog.querySelector('form'), action = form.elements.action, reason = form.elements.reason;
    for (const [key,label] of Object.entries(removalReasons)) reason.add(new Option(label,key));
    if ((item.drawing_status || item.status) !== 'public') action.value = 'restore';
    if (item.link_conflict) {
      action.querySelector('[value="restore"]').remove();
      action.querySelector('[value="clear_name"]').remove();
      action.value = 'hide';
      dialog.querySelector('form .muted').textContent = 'This drawing was excluded during account linking. Its merge reason is retained separately from moderation. Moderation cannot restore it.';
    }
    if (item.drawing_id && item.status === 'open') action.add(new Option('resolve this report','resolve'));
    function sync() {
      dialog.querySelector('#reason-field').hidden = action.value !== 'hide';
      const destructive = ['hide','clear_name'].includes(action.value);
      const submit = form.querySelector('[type="submit"]');
      submit.classList.toggle('danger',destructive);
      submit.classList.toggle('primary',!destructive);
    }
    action.onchange = sync; sync();
    let pending = false;
    dialog.querySelector('#review-close').onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (trigger.isConnected) trigger.focus(); else if (refresh.isConnected) refresh.focus(); }, { once:true });
    form.onsubmit = async event => {
      event.preventDefault(); if (pending) return;
      pending = true;
      const controls = [...form.querySelectorAll('button,select,textarea')];
      const chosen = action.value, note = form.elements.note.value;
      controls.forEach(control => { control.disabled = true; });
      const result = dialog.querySelector('#review-result'); result.textContent = 'saving…';
      try {
        await request(chosen === 'resolve' ? `reports/${item.id}/resolve` : `drawings/${id}/moderate`, {
          method:'POST', body:{ action:chosen,reason:reason.value,note },
        });
        result.textContent = chosen === 'resolve' ? 'report resolved.' : 'saved. reports remain open until you resolve them.';
        if (chosen === 'resolve') { action.querySelector('[value="resolve"]').remove(); action.value = 'restore'; }
        if (chosen === 'hide' || chosen === 'restore') item.drawing_status = chosen === 'hide' ? 'hidden' : 'public';
        await load(); await onSaved();
      } catch (error) {
        if (error.status === 401) { dialog.close(); onExpired(); }
        else result.textContent = error.message;
      } finally { pending = false; controls.forEach(control => { control.disabled = false; }); sync(); }
    };
    document.body.append(dialog); dialog.showModal();
  }
  kind.onchange = () => { filters(); load(); };
  filter.onchange = () => load(); refresh.onclick = () => load(); more.onclick = () => load(next);
  filters(); return load();
}
