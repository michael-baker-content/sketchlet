import { loadAccountClient, accountRequest, accountReturnUrl, rememberAccount } from './account-client.js';
import { revealPage, startupError } from './page-startup.js';
import { counted } from './text-format.js';
import { mountProfileDetails } from './profile-details.js';
import { api } from './api-client.js';
import { mountGuestTransfer } from './guest-transfer.js';
import { linkingNotice, renderMergeReview } from './merge-review.js';

async function start() {
  const panel = document.querySelector('#page-content');
  panel.classList.add('profile-page');
  panel.innerHTML = `<div class="panel-title"><h1 id="page-heading">profile</h1></div>
    <div class="information-copy profile-account">
      <div class="profile-session-row">
        <p id="account-status" class="account-notice" role="status" aria-atomic="true" tabindex="-1">loading sign-in…</p>
        <button class="web-button site-button utility" id="account-sign-out" hidden>sign out</button>
      </div>
      <button class="web-button site-button utility" id="account-retry" hidden>retry account connection</button>
      <div id="account-sign-in"></div>
      <p id="account-sign-out-note" hidden>Signing out preserves access to unlinked guest drawings on this address. Linked drawings belong to your account.</p>
      <section id="guest-review" aria-labelledby="guest-review-heading" hidden>
        <h2 id="guest-review-heading">drawings from this browser</h2>
        <p>Review before linking. If two drawings have the same date, choose which one to keep.</p>
        <p id="guest-review-status" role="status"></p>
        <ul id="guest-review-list"></ul>
        <button class="web-button site-button utility" id="guest-review-retry" hidden>retry drawing review</button>
        <form id="guest-link-form" hidden>
          ${linkingNotice}
          <label><input id="guest-link-consent" type="checkbox" required> I understand and want to link this browser’s guest work to my account</label>
          <p><button class="web-button site-button danger" type="submit">link guest work</button></p>
        </form>
      </section>
      <p id="guest-link-help">While signed in, new drawings and ratings belong to your account. Existing guest work stays separate until you confirm linking. Unfinished drafts stay on this device. Account photos sync privately; browser photos are uploaded only when you choose to save them to your account.</p>
    </div>`;
  const details = document.createElement('section');
  details.className = 'information-copy profile-details';
  panel.append(details);
  const recovery = document.createElement('section'); recovery.className = 'information-copy profile-recovery';
  recovery.setAttribute('aria-labelledby','profile-recovery-heading');
  recovery.innerHTML = '<h2 id="profile-recovery-heading">bring drawings from another browser or address</h2><div class="recovery-content"></div>';
  const recoveryContent = recovery.querySelector('.recovery-content');
  recoveryContent.append(document.querySelector('#guest-link-help'),document.querySelector('#account-sign-out-note'),document.querySelector('#guest-review'));
  panel.append(recovery);
  const transfer = document.createElement('section'); transfer.className = 'guest-transfer'; recoveryContent.append(transfer);
  let disposeTransfer = mountGuestTransfer(transfer);
  let disposeDetails = () => {};
  function loadDetails(request, account = false) { disposeDetails(); disposeDetails = mountProfileDetails(details,request,{account}); return disposeDetails.ready; }
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
  let clerk;
  try { clerk = await loadAccountClient(); }
  catch (error) {
    // Ownership proof for a transfer is the old site's cookie, not Clerk.
    // Keep that flow available when production Clerk rejects the legacy host.
    status.textContent = error.message + ' you can still create a guest transfer code below.';
    retry.hidden = false; retry.onclick = () => location.reload();
    await revealPage();
    return;
  }
  if (!clerk) { rememberAccount(false); status.textContent = 'you’re using a guest profile. account sign-in is not available yet.'; await loadDetails(api); await revealPage(); return; }
  let revision = 0, previousSession, mounted = false, planRevision = null, readChoices = () => ({});
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
    reviewStatus.classList.remove('reading-copy','terminal-output');
    reviewStatus.textContent = 'checking drawings from this browser…';
    try {
      const result = await accountRequest('/api/account/guest-preview', clerk);
      if (current !== revision) return;
      reviewStatus.classList.add('reading-copy');
      if (result.claimed) { reviewStatus.textContent = 'This browser’s previous guest identity has already been linked.'; return; }
      planRevision = result.revision;
      linkForm.hidden = !planRevision;
      const conflicts = result.drawings.filter(drawing => drawing.conflict).length;
      reviewStatus.classList.toggle('terminal-output',result.drawings.length === 0);
      reviewStatus.textContent = result.drawings.length
        ? `${counted(result.drawings.length - conflicts, 'drawing')} can be linked without a conflict; ${counted(conflicts, 'date')} ${conflicts === 1 ? 'requires' : 'require'} a choice. Unselected drawings will be hidden.`
        : 'No guest drawings were found on this address in this browser. Drawings from the old site or another browser stay separate; use a transfer code from the original address to bring them here.';
      readChoices = renderMergeReview(reviewList,result.drawings,() => { consent.checked = false; });
    } catch (error) {
      if (current !== revision) return;
      reviewStatus.classList.remove('terminal-output');
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
    disposeTransfer(); disposeTransfer = mountGuestTransfer(transfer);
    signOut.hidden = !session;
    document.querySelector('#account-sign-out-note').hidden = !session;
    retry.hidden = true;
    review.hidden = true;
    linkForm.hidden = true;
    reviewList.replaceChildren();
    if (!session) {
      rememberAccount(false);
      const detailsReady = loadDetails(api);
      notice(wasSignedIn ? 'you’re signed out. sign in again whenever you’re ready.' : 'sign in or create an account');
      if (!mounted) {
        clerk.mountSignIn(signIn, { routing:'hash', forceRedirectUrl:accountReturnUrl(), signUpForceRedirectUrl:accountReturnUrl() });
        mounted = true;
      }
      await detailsReady;
      return;
    }
    if (mounted) { clerk.unmountSignIn(signIn); mounted = false; }
    notice('verifying your account…');
    try {
      await accountRequest('/api/account/register', clerk, {});
      if (current !== revision) return;
      rememberAccount(true);
      const detailsReady = loadDetails((path,data) => accountRequest(path,clerk,data),true);
      disposeTransfer();
      disposeTransfer = mountGuestTransfer(transfer,(path,data) => accountRequest(path,clerk,data),() => {
        loadDetails((path,data) => accountRequest(path,clerk,data),true); loadReview(current);
      });
      notice('you’re signed in! your account is connected to sketchlet.', 'success');
      status.focus({ preventScroll:true });
      await Promise.all([detailsReady, loadReview(current)]);
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
    let choices;
    try { choices = readChoices(); } catch (error) { reviewStatus.textContent = error.message; return; }
    const current = revision;
    linkButton.disabled = true;
    signOut.disabled = true;
    try {
      const result = await accountRequest('/api/account/link-guest', clerk, {revision:planRevision,choices});
      if (current !== revision) return;
      linkForm.hidden = true;
      reviewList.replaceChildren();
      reviewStatus.classList.add('reading-copy');
      reviewStatus.classList.remove('terminal-output');
      reviewStatus.textContent = `${counted(result.linked,'drawing')} linked; ${counted(result.hidden,'drawing')} hidden. Your guest work is now connected to this account.`;
      planRevision = null;
      loadDetails((path,data) => accountRequest(path,clerk,data),true);
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
  await update();
  await revealPage();
  clerk.addListener(() => { update().catch(startupError); });
}
start().catch(startupError);
