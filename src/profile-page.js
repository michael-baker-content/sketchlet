import { loadAccountClient, accountRequest, accountReturnUrl, rememberAccount } from './account-client.js';
import { revealPage, startupError } from './page-startup.js';
import { counted } from './text-format.js';
import { formatPromptDate } from './prompts.js';
import { mountProfileDetails, mountProfilePhoto } from './profile-details.js';
import { api } from './api-client.js';

async function start() {
  const panel = document.querySelector('#page-content');
  panel.innerHTML = `<div class="panel-title"><h1 id="page-heading">profile</h1></div>
    <div class="information-copy">
      <p id="account-status" class="account-notice" role="status" aria-atomic="true" tabindex="-1">loading sign-in…</p>
      <button class="web-button" id="account-retry" hidden>retry account connection</button>
      <div id="account-sign-in"></div>
      <button class="web-button" id="account-sign-out" hidden>sign out</button>
      <p id="account-sign-out-note" hidden>signing out starts a fresh guest identity in this browser. link any guest work you want to keep access to first.</p>
      <section id="guest-review" aria-labelledby="guest-review-heading" hidden>
        <h2 id="guest-review-heading">drawings from this browser</h2>
        <p>review before linking. your existing account drawing wins if both have the same date.</p>
        <p id="guest-review-status" role="status"></p>
        <ul id="guest-review-list"></ul>
        <button class="web-button" id="guest-review-retry" hidden>retry drawing review</button>
        <form id="guest-link-form" hidden>
          <p>linking is permanent. drawings marked “would be hidden” will leave the public gallery and you will lose access to them. other drawings keep their links and received ratings. your account name applies to linked drawings. duplicate ratings are combined and ratings on your own work are removed.</p>
          <label><input id="guest-link-consent" type="checkbox" required> i understand and want to link this browser’s guest work to my account</label>
          <p><button class="web-button" type="submit">link guest work</button></p>
        </form>
      </section>
      <p>while signed in, new drawings and ratings belong to your account. existing guest work stays separate until you confirm linking. unfinished drafts and profile photos stay on this device.</p>
      <p><a href="/">return to sketchlet</a></p>
    </div>`;
  await revealPage();
  mountProfilePhoto();
  const details = document.createElement('section');
  details.className = 'information-copy profile-details';
  panel.append(details);
  let disposeDetails = () => {};
  function loadDetails(request) { disposeDetails(); disposeDetails = mountProfileDetails(details,request); }
  const status = document.querySelector('#account-status');
  const signIn = document.querySelector('#account-sign-in');
  const signOut = document.querySelector('#account-sign-out');
  const retry = document.querySelector('#account-retry');
  const review = document.querySelector('#guest-review');
  const reviewStatus = document.querySelector('#guest-review-status');
  const reviewList = document.querySelector('#guest-review-list');
  const reviewRetry = document.querySelector('#guest-review-retry');
  const linkForm = document.querySelector('#guest-link-form');
  const consent = document.querySelector('#guest-link-consent');
  const linkButton = linkForm.querySelector('button');
  const clerk = await loadAccountClient();
  if (!clerk) { rememberAccount(false); status.textContent = 'you’re using a guest profile. account sign-in is not available yet.'; loadDetails(api); return; }
  let revision = 0, previousSession, mounted = false, planRevision = null;
  function notice(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }
  async function loadReview(current) {
    review.hidden = false;
    reviewRetry.hidden = true;
    linkForm.hidden = true;
    consent.checked = false;
    planRevision = null;
    reviewList.replaceChildren();
    reviewStatus.textContent = 'checking drawings from this browser…';
    try {
      const result = await accountRequest('/api/account/guest-preview', clerk);
      if (current !== revision) return;
      if (result.claimed) { reviewStatus.textContent = 'this browser’s previous guest identity has already been linked.'; return; }
      planRevision = result.revision;
      linkForm.hidden = !planRevision;
      const conflicts = result.drawings.filter(drawing => drawing.conflict).length;
      reviewStatus.textContent = result.drawings.length
        ? `${counted(result.drawings.length - conflicts, 'drawing')} would be linked; ${counted(conflicts, 'drawing')} would be hidden. when dates overlap, the existing account drawing would be kept.`
        : 'no guest drawings were found for this browser.';
      for (const drawing of result.drawings) {
        const item = document.createElement('li');
        item.textContent = `${formatPromptDate(drawing.date)} — ${drawing.prompt} — ${drawing.conflict ? 'would be hidden' : 'would be linked'}`;
        reviewList.append(item);
      }
    } catch (error) {
      if (current !== revision) return;
      reviewStatus.textContent = error.message;
      reviewRetry.hidden = false;
    }
  }
  async function update(force = false) {
    const session = clerk.session?.id || null;
    if (!force && session === previousSession) return;
    const wasSignedIn = !!previousSession;
    previousSession = session;
    const current = ++revision;
    disposeDetails();
    signOut.hidden = !session;
    document.querySelector('#account-sign-out-note').hidden = !session;
    retry.hidden = true;
    review.hidden = true;
    linkForm.hidden = true;
    reviewList.replaceChildren();
    if (!session) {
      rememberAccount(false);
      loadDetails(api);
      notice(wasSignedIn ? 'you’re signed out. sign in again whenever you’re ready.' : 'sign in or create an account');
      if (!mounted) {
        clerk.mountSignIn(signIn, { routing:'hash', forceRedirectUrl:accountReturnUrl(), signUpForceRedirectUrl:accountReturnUrl() });
        mounted = true;
      }
      return;
    }
    if (mounted) { clerk.unmountSignIn(signIn); mounted = false; }
    notice('verifying your account…');
    try {
      await accountRequest('/api/account/register', clerk, {});
      if (current !== revision) return;
      rememberAccount(true);
      loadDetails((path,data) => accountRequest(path,clerk,data));
      notice('you’re signed in! your account is connected to sketchlet.', 'success');
      status.focus({ preventScroll:true });
      await loadReview(current);
    } catch (error) {
      if (current !== revision) return;
      notice(error.message, 'error');
      retry.hidden = false;
    }
  }
  retry.onclick = () => { update(true).catch(startupError); };
  reviewRetry.onclick = () => { loadReview(revision).catch(startupError); };
  linkForm.onsubmit = async event => {
    event.preventDefault();
    if (!consent.checked || !planRevision || linkButton.disabled) return;
    const current = revision;
    linkButton.disabled = true;
    signOut.disabled = true;
    try {
      const result = await accountRequest('/api/account/link-guest', clerk, {revision:planRevision});
      if (current !== revision) return;
      linkForm.hidden = true;
      reviewList.replaceChildren();
      reviewStatus.textContent = `${counted(result.linked,'drawing')} linked; ${counted(result.hidden,'drawing')} hidden. your guest work is now connected to this account.`;
      planRevision = null;
      loadDetails((path,data) => accountRequest(path,clerk,data));
    } catch (error) {
      if (current !== revision) return;
      // Never automatically repeat a potentially committed link request.
      linkForm.hidden = true;
      consent.checked = false;
      reviewStatus.textContent = error.message + ' reload the review before trying again.';
      reviewRetry.hidden = false;
    } finally { linkButton.disabled = false; signOut.disabled = false; }
  };
  signOut.onclick = async () => {
    signOut.disabled = true;
    linkButton.disabled = true;
    try {
      await accountRequest('/api/account/sign-out',clerk,{});
      await clerk.signOut();
      rememberAccount(false);
      await update();
    }
    catch { notice('could not sign out. please try again.', 'error'); }
    finally { signOut.disabled = false; linkButton.disabled = false; }
  };
  clerk.addListener(() => { update().catch(startupError); });
  await update();
}
start().catch(startupError);
