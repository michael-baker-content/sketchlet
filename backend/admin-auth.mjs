import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { networkLimitKey } from './ratings.mjs';
import { readJson } from './http.mjs';
import { drawingIdPattern, moderationInput, moderationNote, drawingCursor, reviewCursor } from './moderation.mjs';
const httpError = (status, message) => Object.assign(new Error(message), { status, adminSafe:true });

const tokenPattern = /^[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function adminConfig(env = process.env) {
  const { ADMIN_ORIGIN, ADMIN_GITHUB_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env;
  if (![ADMIN_ORIGIN, ADMIN_GITHUB_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, env.DATABASE_URL].every(Boolean)) return null;
  const origin = new URL(ADMIN_ORIGIN);
  const local = !env.VERCEL && ['localhost', '127.0.0.1'].includes(origin.hostname);
  if (origin.origin !== ADMIN_ORIGIN || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) ||
      origin.username || origin.password || !/^[1-9]\d*$/.test(ADMIN_GITHUB_ID)) throw new Error('Invalid admin configuration');
  return { origin:origin.origin, host:origin.host, secure:origin.protocol === 'https:',
    githubId:ADMIN_GITHUB_ID, clientId:GITHUB_CLIENT_ID, clientSecret:GITHUB_CLIENT_SECRET,
    callback:origin.origin + '/api/admin/callback' };
}
function cookieName(config, kind) { return `${config.secure ? '__Host-' : ''}sketchlet_admin_${kind}`; }
function cookie(req, config, kind) {
  const name = cookieName(config, kind);
  const matches = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return tokenPattern.test(value) ? value : null;
}
function setCookie(res, config, kind, value, seconds) {
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : [previous]),
    `${cookieName(config, kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`]);
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify(value)); }
function redirect(res, location) { res.writeHead(303, { Location:location }); res.end(); }

export async function githubIdentity(config, code, verifier, fetcher = fetch) {
  const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
    headers:{ Accept:'application/json', 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ client_id:config.clientId, client_secret:config.clientSecret,
      redirect_uri:config.callback, code, code_verifier:verifier }),
  });
  if (!tokenResponse.ok) throw httpError(502, 'github sign-in is unavailable. please try again.');
  const token = await tokenResponse.json();
  if (typeof token.access_token !== 'string' || !token.access_token || token.error) throw httpError(401, 'sign-in expired or was declined. please try again.');
  const response = await fetcher('https://api.github.com/user', {
    redirect:'error', signal:AbortSignal.timeout(10000),
    headers:{ Accept:'application/vnd.github+json', 'User-Agent':'Sketchlet', Authorization:`Bearer ${token.access_token}` },
  });
  if (!response.ok) throw httpError(502, 'github sign-in is unavailable. please try again.');
  const user = await response.json();
  if (!Number.isSafeInteger(user.id) || user.id < 1 || typeof user.login !== 'string' || user.login.length > 100) throw httpError(403, 'administrator access denied');
  // Neither the provider token nor any refresh token is persisted or sent to the browser.
  return { id:String(user.id), login:user.login };
}

export async function requireAdmin(req, config, store) {
  const token = cookie(req, config, 'session');
  const user = token && await store.session(hash(token));
  if (!user || user.id !== config.githubId || !Number.isFinite(Date.parse(user.expires_at)) || Date.parse(user.expires_at) <= Date.now()) throw httpError(401, 'administrator sign-in required');
  return { user, tokenHash:hash(token), csrf:hash('csrf:' + token) };
}

export function createAdminHandler({ getConfig = () => adminConfig(), getStore, identity = githubIdentity, sendImage, env = process.env }) {
  return async function handleAdmin(req, res, pathname) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let config;
    try {
      const routes = { '/api/admin/status':'GET', '/api/admin/login':'POST', '/api/admin/callback':'GET',
        '/api/admin/logout':'POST', '/api/admin/activity':'GET', '/api/admin/drawings':'GET', '/api/admin/reports':'GET' };
      const drawingRoute = pathname.match(/^\/api\/admin\/drawings\/([^/]+)\/(image|moderate)$/);
      const reportRoute = pathname.match(/^\/api\/admin\/reports\/([1-9]\d{0,18})\/resolve$/);
      if (drawingRoute && drawingIdPattern.test(drawingRoute[1])) routes[pathname] = drawingRoute[2] === 'image' ? 'GET' : 'POST';
      if (reportRoute) routes[pathname] = 'POST';
      if (!Object.hasOwn(routes, pathname)) throw httpError(404, 'not found');
      if (req.method !== routes[pathname]) {
        res.setHeader('Allow', routes[pathname]); throw httpError(405, 'method not allowed');
      }
      config = getConfig();
      if (!config) {
        if (pathname === '/api/admin/status') return json(res, 200, { configured:false, authenticated:false });
        throw httpError(503, 'administrator sign-in is not configured');
      }
      // Do not accept production sessions on preview deployments or alternative hosts.
      if (req.headers.host !== config.host) throw httpError(403, 'open the configured admin site to sign in');
      if (req.method === 'POST' && req.headers.origin !== config.origin) throw httpError(403, 'request origin does not match the admin site');
      const store = await getStore();
      if (pathname === '/api/admin/login') {
        const network = networkLimitKey(req, env);
        if (!network || !await store.limit('admin-login:' + network)) throw httpError(429, 'please wait a minute before trying again');
        const state = randomToken(), verifier = randomBytes(32).toString('base64url');
        const previous = cookie(req, config, 'state');
        await store.saveState(hash(state), verifier, previous ? hash(previous) : null);
        setCookie(res, config, 'state', state, 600);
        const url = new URL('https://github.com/login/oauth/authorize');
        url.search = new URLSearchParams({ client_id:config.clientId, redirect_uri:config.callback, state,
          scope:'', allow_signup:'false', code_challenge:createHash('sha256').update(verifier).digest('base64url'), code_challenge_method:'S256' });
        return redirect(res, url.href);
      }
      if (pathname === '/api/admin/callback') {
        const url = new URL(req.url, config.origin), state = url.searchParams.get('state');
        const expected = cookie(req, config, 'state');
        setCookie(res, config, 'state', '', 0);
        if (!state || !tokenPattern.test(state) || !equal(state, expected)) throw httpError(403, 'invalid sign-in request');
        const attempt = await store.consumeState(hash(state));
        const code = url.searchParams.get('code');
        if (!attempt || url.searchParams.has('error') || !code || code.length > 1024) throw httpError(401, 'sign-in expired or was declined');
        const user = await identity(config, code, attempt.verifier);
        if (user.id !== config.githubId) throw httpError(403, 'administrator access denied');
        const token = randomToken(), previous = cookie(req, config, 'session');
        await store.createSession(hash(token), user, previous ? hash(previous) : null);
        setCookie(res, config, 'session', token, 8 * 60 * 60);
        return redirect(res, '/admin');
      }
      let session;
      try { session = await requireAdmin(req, config, store); }
      catch (error) {
        if (pathname === '/api/admin/status' && error.status === 401) return json(res, 200, { configured:true, authenticated:false });
        throw error;
      }
      if (req.method === 'POST' && !equal(req.headers['x-csrf-token'], session.csrf)) throw httpError(403, 'invalid request token');
      // All moderation reads, image bytes, and writes require the same session.
      // Validate client input here, then let database failures remain redacted.
      const validate = run => { try { return run(); } catch (error) { throw httpError(400,error.message); } };
      const inputBody = async () => { try { return await readJson(req); } catch (error) { throw httpError(error.status || 400,'invalid moderation request'); } };
      const url = new URL(req.url, config.origin);
      if (pathname === '/api/admin/drawings' || pathname === '/api/admin/reports') {
        const isDrawings = pathname.endsWith('/drawings');
        const filter = url.searchParams.get('filter') || (isDrawings ? 'all' : 'open');
        if (!(isDrawings ? ['all','public','hidden','pending'] : ['open','resolved']).includes(filter)) throw httpError(400,'invalid review filter');
        const before = validate(() => (isDrawings ? drawingCursor : reviewCursor)(url.searchParams.get('before')));
        const rows = await (isDrawings ? store.submissions(before,filter) : store.reports(before,filter));
        const items = rows.slice(0,24);
        return json(res,200,{ items,next:rows.length>24 ? items.at(-1).id : null });
      }
      if (drawingRoute?.[2] === 'image') {
        const key = await store.image(drawingRoute[1]);
        if (!key) throw httpError(404,'drawing not found');
        return await sendImage(res,key);
      }
      if (drawingRoute?.[2] === 'moderate') {
        const raw = await inputBody(), input = validate(() => moderationInput(raw));
        const changed = input.action === 'clear_name'
          ? await store.clearName(drawingRoute[1],input.note,session.user)
          : await store.moderate(drawingRoute[1],input,session.user);
        if (!changed) throw httpError(404,'drawing or profile not found');
        return json(res,200,{ saved:true });
      }
      if (reportRoute) {
        validate(() => reviewCursor(reportRoute[1]));
        const raw = await inputBody();
        const note = validate(() => moderationNote(raw.note));
        const changed = await store.resolveReport(reportRoute[1],note,session.user);
        if (!changed) throw httpError(409,'this report was already resolved or is no longer available');
        return json(res,200,{ saved:true });
      }
      if (pathname === '/api/admin/status') return json(res, 200, {
        configured:true, authenticated:true, login:session.user.login, csrf:session.csrf, expiresAt:session.user.expires_at,
      });
      if (pathname === '/api/admin/activity') return json(res, 200, { actions:await store.activity() });
      if (pathname === '/api/admin/logout') {
        await store.logout(session.tokenHash, session.user);
        setCookie(res, config, 'session', '', 0);
        return json(res, 200, { signedOut:true });
      }
    } catch (error) {
      // Never return database/provider responses, codes, tokens, or configuration values.
      if (pathname === '/api/admin/callback') return redirect(res, '/admin?auth=failed');
      const status = error.adminSafe ? error.status : 503;
      json(res, status, { error:error.adminSafe ? error.message : 'admin is temporarily unavailable. please try again.' });
    }
  };
}
