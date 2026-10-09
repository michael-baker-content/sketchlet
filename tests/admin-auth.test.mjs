import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adminConfig, createAdminHandler, githubIdentity } from '../backend/admin-auth.mjs';

const env = { ADMIN_ORIGIN:'https://sketchlet.example', ADMIN_GITHUB_ID:'123', GITHUB_CLIENT_ID:'client', GITHUB_CLIENT_SECRET:'secret', DATABASE_URL:'unused' };
const config = adminConfig(env);
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture({ configured = true, account = '123' } = {}) {
  const states = new Map(), sessions = new Map(), actions = [], moderationCalls = [];
  let identityCalls = 0, allowLogin = true, activityReads = 0;
  const store = {
    limit:async () => allowLogin,
    saveState:async (key, verifier, previous) => { states.delete(previous); states.set(key, { verifier }); },
    consumeState:async key => { const value = states.get(key); states.delete(key); return value; },
    createSession:async (key, user, previous) => {
      sessions.delete(previous);
      sessions.set(key, { ...user, expires_at:new Date(Date.now() + 3600000).toISOString() }); actions.push('sign_in');
    },
    session:async key => sessions.get(key),
    logout:async key => { sessions.delete(key); actions.push('sign_out'); },
    activity:async () => { activityReads++; return actions; },
    submissions:async (...args) => { moderationCalls.push(['submissions',...args]); return []; },
    reports:async (...args) => { moderationCalls.push(['reports',...args]); return []; },
    image:async id => { moderationCalls.push(['image',id]); return 'private-key'; },
    moderate:async (...args) => { moderationCalls.push(['moderate',...args]); return true; },
    clearName:async (...args) => { moderationCalls.push(['clearName',...args]); return true; },
    resolveReport:async (...args) => { moderationCalls.push(['resolveReport',...args]); return true; },
  };
  const handler = createAdminHandler({ getConfig:() => configured ? config : null, getStore:async () => store, env:{},
    sendImage:async res => { res.writeHead(200, { 'Content-Type':'image/png' }); res.end(); },
    identity:async () => { identityCalls++; return { id:account, login:'artist' }; } });
  async function request(path, { method = 'GET', cookies = '', headers = {}, body } = {}) {
    const result = { headers:{} };
    const req = { url:path, method, body, socket:{ remoteAddress:'127.0.0.1' },
      headers:{ host:config.host, origin:config.origin, cookie:cookies, 'content-type':'application/json', ...headers } };
    const res = {
      setHeader(name, value) { result.headers[name] = value; },
      getHeader(name) { return result.headers[name]; },
      writeHead(status, values) { result.status = status; Object.assign(result.headers, values); },
      end(body) { result.body = body; if (body) result.json = JSON.parse(body); },
    };
    await handler(req, res, new URL(path, config.origin).pathname);
    return result;
  }
  async function login() {
    const start = await request('/api/admin/login', { method:'POST' });
    const state = new URL(start.headers.Location).searchParams.get('state');
    const cookie = start.headers['Set-Cookie'][0].split(';')[0];
    return { start, state, cookie, callback:'/api/admin/callback?state=' + state + '&code=test-code' };
  }
  async function authenticate() {
    const attempt = await login();
    const result = await request(attempt.callback, { cookies:attempt.cookie });
    const cookie = result.headers['Set-Cookie'].find(value => value.startsWith('__Host-sketchlet_admin_session=')).split(';')[0];
    return { cookie, result, attempt };
  }
  return { request, login, authenticate, states, sessions, actions, store, moderationCalls,
    get identityCalls() { return identityCalls; }, get activityReads() { return activityReads; },
    blockLogin() { allowLogin = false; } };
}

test('admin config fails closed and allows plaintext only on local development origins', () => {
  assert.equal(adminConfig({}), null);
  for (const origin of ['http://example.com', 'https://example.com/path', 'https://example.com/', 'https://user:password@example.com']) {
    assert.throws(() => adminConfig({ ...env, ADMIN_ORIGIN:origin }));
  }
  assert.equal(adminConfig({ ...env, ADMIN_ORIGIN:'http://localhost:5173' }).secure, false);
  assert.throws(() => adminConfig({ ...env, ADMIN_ORIGIN:'http://localhost:5173', VERCEL:'1' }));
  assert.throws(() => adminConfig({ ...env, ADMIN_GITHUB_ID:'artist' }));
});

test('disabled admin and guest cookies never grant access to private activity', async () => {
  const disabled = fixture({ configured:false });
  assert.deepEqual((await disabled.request('/api/admin/status')).json, { configured:false, authenticated:false });
  assert.equal((await disabled.request('/api/admin/login', { method:'POST' })).status, 503);
  const f = fixture();
  const response = await f.request('/api/admin/activity', { cookies:'sketchlet_guest=' + 'a'.repeat(64) });
  assert.equal(response.status, 401); assert.equal(f.activityReads, 0);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers['X-Robots-Tag'], 'noindex, nofollow');
});

test('login enforces origin, host, method, and rate limit before creating a challenge', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/admin/login')).status, 405);
  for (const headers of [{ origin:'https://evil.example' }, { origin:undefined }, { host:'preview.example' }]) {
    assert.equal((await f.request('/api/admin/login', { method:'POST', headers })).status, 403);
  }
  f.blockLogin();
  assert.equal((await f.request('/api/admin/login', { method:'POST' })).status, 429);
  assert.equal(f.states.size, 0);
});

test('OAuth uses PKCE, a browser-bound one-time state, and a fixed callback with no repository scope', async () => {
  const f = fixture(), attempt = await f.login();
  const url = new URL(attempt.start.headers.Location);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('redirect_uri'), config.callback);
  assert.equal(url.searchParams.get('scope'), '');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const verifier = f.states.get(hash(attempt.state)).verifier;
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  assert.match(attempt.start.headers['Set-Cookie'][0], /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  await f.request(attempt.callback); // A callback from another browser cannot consume this challenge.
  assert.equal(f.identityCalls, 0); assert.equal(f.states.size, 1);
  const accepted = await f.request(attempt.callback, { cookies:attempt.cookie });
  assert.equal(accepted.headers.Location, '/admin');
  await f.request(attempt.callback, { cookies:attempt.cookie });
  assert.equal(f.identityCalls, 1); assert.equal(f.sessions.size, 1);
  assert.deepEqual(f.actions, ['sign_in']);
});

test('wrong GitHub account, declined consent, and expired state never create sessions', async () => {
  const wrong = fixture({ account:'456' }), attempt = await wrong.login();
  const denied = await wrong.request(attempt.callback, { cookies:attempt.cookie });
  assert.equal(denied.headers.Location, '/admin?auth=failed'); assert.equal(wrong.sessions.size, 0);
  for (const declined of [false, true]) {
    const f = fixture(), a = await f.login();
    if (!declined) f.states.clear();
    await f.request(a.callback + (declined ? '&error=access_denied' : ''), { cookies:a.cookie });
    assert.equal(f.identityCalls, 0); assert.equal(f.sessions.size, 0);
  }
});

test('sessions are hashed, isolated from guest identity, expire, and require the configured account', async () => {
  const f = fixture(), { cookie, result } = await f.authenticate();
  assert.match(result.headers['Set-Cookie'][1], /HttpOnly; SameSite=Lax; Max-Age=28800; Secure/);
  const raw = cookie.split('=')[1];
  assert.equal(f.sessions.has(raw), false); assert.equal(f.sessions.has(hash(raw)), true);
  const status = (await f.request('/api/admin/status', { cookies:cookie })).json;
  assert.equal(status.authenticated, true); assert.equal(status.login, 'artist');
  assert.notEqual(status.csrf, raw); assert.equal(JSON.stringify(status).includes(raw), false);
  const record = f.sessions.get(hash(raw));
  record.id = '456';
  assert.equal((await f.request('/api/admin/activity', { cookies:cookie })).status, 401);
  record.id = '123'; record.expires_at = new Date(0).toISOString();
  assert.equal((await f.request('/api/admin/activity', { cookies:cookie })).status, 401);
  assert.equal(f.activityReads, 0);
});

test('logout requires both matching origin and session CSRF token and revokes server access', async () => {
  const f = fixture(), { cookie } = await f.authenticate();
  const { csrf } = (await f.request('/api/admin/status', { cookies:cookie })).json;
  assert.equal((await f.request('/api/admin/logout', { method:'POST', cookies:cookie })).status, 403);
  assert.equal((await f.request('/api/admin/logout', { method:'POST', cookies:cookie,
    headers:{ origin:'https://evil.example', 'x-csrf-token':csrf } })).status, 403);
  assert.equal((await f.request('/api/admin/logout', { method:'POST', cookies:cookie,
    headers:{ 'x-csrf-token':csrf } })).status, 200);
  assert.deepEqual(f.actions, ['sign_in', 'sign_out']);
  assert.equal((await f.request('/api/admin/activity', { cookies:cookie })).status, 401);
});

test('database failures do not expose connection details or provider secrets', async () => {
  const f = fixture(), { cookie } = await f.authenticate();
  f.store.session = async () => { throw Object.assign(new Error('postgres://private:secret@database'), { status:500 }); };
  const result = await f.request('/api/admin/status', { cookies:cookie });
  assert.equal(result.status, 503); assert.doesNotMatch(result.body, /postgres|private|secret/);
});

test('GitHub identity exchange sends the verifier and validates the returned identity', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return { ok:true, json:async () => calls.length === 1 ? { access_token:'provider-secret' } : { id:123, login:'artist' } };
  };
  assert.deepEqual(await githubIdentity(config, 'code', 'verifier', fetcher), { id:'123', login:'artist' });
  assert.equal(calls[0].options.body.get('code_verifier'), 'verifier');
  assert.equal(calls[0].options.body.get('redirect_uri'), config.callback);
  assert.equal(calls[1].url, 'https://api.github.com/user');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer provider-secret');
  assert.equal(calls.every(call => call.options.redirect === 'error'), true);
});

test('moderation reads, private images, and writes reject guest sessions before touching content', async () => {
  const f = fixture(), id = '12345678-1234-1234-1234-123456789abc';
  for (const path of ['/api/admin/drawings','/api/admin/reports',`/api/admin/drawings/${id}/image`]) {
    assert.equal((await f.request(path)).status,401);
  }
  assert.equal((await f.request(`/api/admin/drawings/${id}/moderate`, { method:'POST',body:{ action:'hide',reason:'spam' } })).status,401);
  assert.deepEqual(f.moderationCalls,[]);
});

test('moderation validates CSRF and input, records the admin identity, and keeps report resolution separate', async () => {
  const f = fixture(), { cookie } = await f.authenticate(), id = '12345678-1234-1234-1234-123456789abc';
  const { csrf } = (await f.request('/api/admin/status', { cookies:cookie })).json;
  const options = { method:'POST',cookies:cookie,headers:{ 'x-csrf-token':csrf } };
  const path = `/api/admin/drawings/${id}/moderate`;
  assert.equal((await f.request(path,{ ...options,headers:{},body:{action:'hide',reason:'spam'} })).status,403);
  for (const body of [{action:'delete'},{action:'hide',reason:'custom-secret'},{action:'restore',note:'x'.repeat(2001)}]) {
    assert.equal((await f.request(path,{ ...options,body })).status,400);
  }
  assert.deepEqual(f.moderationCalls,[]);
  assert.equal((await f.request(path,{ ...options,body:{action:'hide',reason:'spam',note:'private review'} })).status,200);
  assert.deepEqual(f.moderationCalls[0],['moderate',id,{action:'hide',reason:'removed as spam.',note:'private review'},
    { id:'123',login:'artist',expires_at:f.sessions.values().next().value.expires_at }]);
  assert.equal(f.moderationCalls.some(call => call[0]==='resolveReport'),false);
  assert.equal((await f.request('/api/admin/reports/1/resolve',{ ...options,body:{note:'reviewed'} })).status,200);
  assert.equal(f.moderationCalls.at(-1)[0],'resolveReport');
  assert.equal((await f.request(path,{ ...options,body:{action:'clear_name'} })).status,200);
  assert.equal(f.moderationCalls.at(-1)[0],'clearName');
  assert.equal((await f.request(`/api/admin/drawings/${id}/image`,{cookies:cookie})).status,200);
  assert.equal((await f.request('/api/admin/reports?before=bad',{cookies:cookie})).status,400);
});
