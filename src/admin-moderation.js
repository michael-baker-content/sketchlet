import { reportReasons, removalReasons } from './moderation-options.js';

// User-supplied names, explanations, and notes are inserted as text only.
export function mountModeration(root, { request, onExpired, onSaved }) {
  root.innerHTML = `<h2 id="moderation-heading">moderation</h2><div class="admin-filters"><label><span id="review-kind-label">review</span><select id="review-kind" aria-labelledby="review-kind-label"><option value="reports">reports</option><option value="drawings">submissions</option></select></label><label><span id="review-filter-label">show</span><select id="review-filter" aria-labelledby="review-filter-label"></select></label><button class="web-button" id="review-refresh">refresh list</button></div><p id="review-status" role="status"></p><div class="admin-review-list"></div><button class="web-button" id="review-more" hidden>load more</button>`;
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
        const card = document.createElement('article'); card.className = 'admin-review-card';
        const id = item.drawing_id || item.id;
        const image = document.createElement('img'); image.src = `/api/admin/drawings/${id}/image`;
        image.alt = item.prompt; image.loading = 'lazy'; image.width = image.height = 160;
        const heading = document.createElement('h3'); heading.textContent = item.prompt;
        const details = document.createElement('p');
        details.textContent = `${item.date} · ${item.display_name || 'anonymous'} · ${item.drawing_status || item.status}`;
        card.append(image,heading,details);
        if (item.category) {
          const reason = document.createElement('p'); reason.textContent = `report: ${reportReasons[item.category] || item.category}`;
          const explanation = document.createElement('p'); explanation.className = 'report-explanation'; explanation.textContent = item.explanation || 'no additional explanation.';
          card.append(reason,explanation);
        } else {
          const count = document.createElement('p'); count.textContent = `open reports: ${item.reports}`; card.append(count);
        }
        const button = document.createElement('button'); button.className = 'web-button'; button.textContent = 'review drawing';
        button.onclick = () => review(item,button); card.append(button); list.append(card);
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
    dialog.innerHTML = `<h2 id="review-dialog-heading">review drawing</h2><p class="review-caption"></p><img class="admin-review-image" alt=""><p class="review-explanation"></p><form><label class="name-field"><span id="review-action-label">action</span><select name="action" aria-labelledby="review-action-label"><option value="hide">hide drawing</option><option value="restore">restore drawing</option><option value="clear_name">clear creator's display name</option></select></label><label class="name-field" id="reason-field"><span id="review-reason-label">removal reason (visible to creator)</span><select name="reason" aria-labelledby="review-reason-label"></select></label><label class="name-field">private note (optional)<textarea name="note" maxlength="2000" rows="3"></textarea></label><p class="muted">hiding keeps the day's submission. restoring makes it public again. clearing a name applies to all of this creator's drawings; they can choose a new name.</p><p role="status" id="review-result"></p><div class="dialog-actions"><button type="button" class="web-button" id="review-close">close</button><button type="submit" class="web-button primary">apply action</button></div></form>`;
    dialog.querySelector('.review-caption').textContent = `${item.prompt} · ${item.date} · ${item.display_name || 'anonymous'}`;
    dialog.querySelector('.review-explanation').textContent = item.explanation || item.reason || '';
    const image = dialog.querySelector('img'); image.src = `/api/admin/drawings/${id}/image`; image.alt = item.prompt;
    const form = dialog.querySelector('form'), action = form.elements.action, reason = form.elements.reason;
    for (const [key,label] of Object.entries(removalReasons)) reason.add(new Option(label,key));
    if ((item.drawing_status || item.status) !== 'public') action.value = 'restore';
    if (item.drawing_id && item.status === 'open') action.add(new Option('resolve this report','resolve'));
    function sync() { dialog.querySelector('#reason-field').hidden = action.value !== 'hide'; }
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
