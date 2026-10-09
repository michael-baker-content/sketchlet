import { revealPage, startupError } from './page-startup.js';
import { mountModeration } from './admin-moderation.js';

const panel = document.querySelector('#page-content');
let session;
async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch('/api/admin/' + path, { method, credentials:'same-origin', cache:'no-store',
    headers:method === 'POST' ? { 'X-CSRF-Token':session.csrf, 'Content-Type':'application/json' } : {},
    body:body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error || 'admin is unavailable'), { status:response.status });
  return value;
}
function content(markup) {
  panel.innerHTML = '<div class="panel-title"><h1 id="page-heading" tabindex="-1">administration</h1></div>' + markup;
  document.querySelector('#page-heading').focus({ preventScroll:true });
}
function signedOut(configured, message = '') {
  document.querySelectorAll('.admin-review-dialog').forEach(dialog => { dialog.close(); dialog.remove(); });
  session = null;
  content('<div class="admin-content"><p id="admin-message" role="status"></p>' +
    (configured ? '<form action="/api/admin/login" method="post"><button class="web-button primary" type="submit">sign in with github</button></form><p>access is limited to the site administrator.</p>' : '<p>admin sign-in is not available yet.</p>') + '</div>');
  document.querySelector('#admin-message').textContent = message;
}
function decisionState(label, state) {
  const section = document.createElement('div'); section.className = 'admin-decision-state';
  const title = document.createElement('strong'); title.className = 'admin-decision-label'; title.textContent = label;
  section.append(title);
  const fields = document.createElement('dl');
  for (const [key, name] of [['status','visibility / review status'],['reason','removal reason'],['name','display name']]) {
    if (!state || !Object.hasOwn(state,key)) continue;
    const term = document.createElement('dt'), value = document.createElement('dd');
    term.textContent = name;
    value.textContent = state[key] || (key === 'name' ? 'anonymous (no name)' : 'none');
    if (key === 'status') value.className = 'admin-state-value';
    fields.append(term,value);
  }
  if (fields.children.length) section.append(fields);
  else { const empty = document.createElement('p'); empty.textContent = 'not recorded'; section.append(empty); }
  return section;
}
async function loadActivity() {
  const status = document.querySelector('#admin-activity-status');
  const list = document.querySelector('#admin-activity');
  if (!status || !list) return;
  status.textContent = 'loading activity…';
  try {
    const { actions } = await request('activity');
    if (!list.isConnected) return;
    list.replaceChildren();
    for (const action of actions) {
      const item = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = action.created_at;
      time.textContent = new Date(action.created_at).toLocaleString();
      item.append(time, document.createTextNode(` · ${action.actor_login} · ${action.action.replaceAll('_', ' ')}`));
      if (action.target_id || action.private_note || action.before_state || action.after_state) {
        const details = document.createElement('details'), summary = document.createElement('summary');
        details.className = 'admin-decision';
        summary.textContent = 'decision details'; details.append(summary);
        if (action.target_id) {
          const target = document.createElement('p'); target.className = 'admin-decision-target';
          target.textContent = `${action.target_type}: ${action.target_id}`; details.append(target);
        }
        if (action.before_state || action.after_state) {
          const changes = document.createElement('div'); changes.className = 'admin-decision-changes';
          changes.append(decisionState('before',action.before_state),decisionState('after',action.after_state));
          details.append(changes);
        }
        if (action.private_note) {
          const note = document.createElement('div'); note.className = 'admin-decision-note';
          const label = document.createElement('strong'); label.textContent = 'private note';
          const text = document.createElement('p'); text.textContent = action.private_note;
          note.append(label,text); details.append(note);
        }
        item.append(details);
      }
      list.append(item);
    }
    status.textContent = actions.length ? 'most recent activity (up to 50 entries).' : 'no activity yet.';
  } catch (error) {
    if (error.status === 401) { signedOut(true, 'your session has expired. please sign in again.'); return; }
    status.textContent = error.message;
  }
}
async function start() {
  const failed = new URLSearchParams(location.search).get('auth') === 'failed';
  if (failed) history.replaceState({}, '', '/admin');
  session = await request('status');
  if (!session.authenticated) {
    signedOut(session.configured, failed ? 'sign-in was not completed. try again with the authorized github account.' : '');
    await revealPage(); return;
  }
  content('<div class="admin-content"><div class="admin-account"><p id="admin-account-name"></p><button class="web-button" id="admin-logout">sign out</button></div><p id="admin-error" role="alert"></p><section aria-labelledby="admin-activity-heading"><h2 id="admin-activity-heading">recent activity</h2><p id="admin-activity-status" role="status"></p><ol id="admin-activity"></ol><button class="web-button" id="admin-refresh">refresh activity</button></section></div>');
  document.querySelector('#admin-account-name').textContent = `signed in as ${session.login}`;
  const moderation = document.createElement('section'); moderation.setAttribute('aria-labelledby','moderation-heading');
  document.querySelector('#admin-error').after(moderation);
  document.querySelector('#admin-refresh').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await loadActivity(); } finally { button.disabled = false; }
  };
  document.querySelector('#admin-logout').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await request('logout', { method:'POST' }); signedOut(true, 'signed out.'); }
    catch (error) {
      if (error.status === 401) signedOut(true, 'your session has expired.');
      else { document.querySelector('#admin-error').textContent = error.message; button.disabled = false; }
    }
  };
  await Promise.all([loadActivity(), mountModeration(moderation, { request,
    onExpired:() => signedOut(true,'your session has expired. please sign in again.'), onSaved:loadActivity })]);
  await revealPage();
}
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
start().catch(startupError);
