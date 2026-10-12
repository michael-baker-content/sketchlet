let loading;
const accountHint = 'sketchlet.account-session';
let signedIn = false;
export function rememberAccount(value) {
  signedIn = value;
  try { if (value) localStorage.setItem(accountHint,'1'); else localStorage.removeItem(accountHint); } catch {}
  // A non-authenticating hint also works when localStorage is unavailable.
  try { document.cookie = `sketchlet_account_hint=${value ? '1' : ''}; Path=/; SameSite=Lax; Max-Age=${value ? 31536000 : 0}${location.protocol === 'https:' ? '; Secure' : ''}`; } catch {}
}

export async function accountHeaders() {
  let remembered = signedIn;
  try { remembered ||= localStorage.getItem(accountHint) === '1'; } catch {}
  try { remembered ||= /(?:^|;\s*)sketchlet_account_hint=1(?:;|$)/.test(document.cookie); } catch {}
  if (!remembered) return {};
  const clerk = await loadAccountClient();
  const token = await clerk?.session?.getToken();
  // Never silently submit as a guest after an expired account session.
  if (!token) throw Object.assign(new Error('please visit profile to sign in again or continue as a guest'),{code:'account_session'});
  return {Authorization:`Bearer ${token}`};
}
export const accountReturnUrl = () => location.origin + '/profile';
function script(src, key) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = src; element.async = true; element.crossOrigin = 'anonymous';
    if (key) element.setAttribute('data-clerk-publishable-key', key);
    const timeout = setTimeout(() => reject(new Error('sign-in is taking too long. please reload to retry.')), 20000);
    element.onload = () => { clearTimeout(timeout); resolve(); };
    element.onerror = () => { clearTimeout(timeout); reject(new Error('could not load sign-in. please reload to retry.')); };
    document.head.append(element);
  });
}

export async function accountRequest(path, clerk, data) {
  const token = await clerk.session?.getToken();
  if (!token) throw new Error('please sign in again');
  const response = await fetch(path, {
    method:data ? 'POST' : 'GET', credentials:'same-origin',
    headers:{ Authorization:`Bearer ${token}`, ...(data ? { 'Content-Type':'application/json' } : {}) },
    body:data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'could not verify your account'),{status:response.status});
  return result;
}

export function loadAccountClient() {
  if (!loading) loading = (async () => {
    const response = await fetch('/api/account/config', { credentials:'same-origin' });
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'could not load sign-in');
    if (!config.enabled) return null;
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(config.frontendHost)) throw new Error('invalid sign-in configuration');
    const base = `https://${config.frontendHost}/npm/`;
    await script(base + '@clerk/ui@1/dist/ui.browser.js');
    await script(base + '@clerk/clerk-js@6/dist/clerk.browser.js', config.publishableKey);
    await window.Clerk.load({
      ui:{ ClerkUI:window.__internal_ClerkUICtor },
      signInForceRedirectUrl:accountReturnUrl(),
      signUpForceRedirectUrl:accountReturnUrl(),
    });
    return window.Clerk;
  })();
  return loading;
}
