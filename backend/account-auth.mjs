import { allowedOrigins, httpError, readJson } from './http.mjs';
import { guestOwner, guestVisitor } from './guest-identity.mjs';
import { createHash, randomBytes } from 'node:crypto';

function validChoices(value) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key,id]) => uuid.test(key) && typeof id === 'string' && uuid.test(id));
}

export function accountConfig(env = process.env) {
  // The dashboard's framework selector changes the suggested variable name,
  // not the key. Accept its existing Next.js/Vite labels during setup.
  const publishableKey = env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY;
  const secretKey = env.CLERK_SECRET_KEY;
  if (!publishableKey && !secretKey) return null;
  const match = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey || '');
  if (!match || !secretKey?.startsWith(`sk_${match[1]}_`)) throw new Error('Invalid Clerk configuration');
  const decoded = Buffer.from(match[2], 'base64').toString('utf8');
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}\$$/i.test(decoded)) throw new Error('Invalid Clerk host');
  return { publishableKey, secretKey, frontendHost:decoded.slice(0, -1), origins:allowedOrigins(env) };
}

let client, clientKey;
export async function verifyAccountSession(req, config) {
  // This API accepts explicit browser session tokens only. Never trust a
  // browser-provided user ID, email, display name, or guest identity as login.
  if (!/^Bearer [^\s]+$/.test(req.headers.authorization || '')) throw httpError(401, 'please sign in again');
  if (!client || clientKey !== config.secretKey) {
    const { createClerkClient } = await import('@clerk/backend');
    client = createClerkClient({ secretKey:config.secretKey, publishableKey:config.publishableKey });
    clientKey = config.secretKey;
  }
  const origin = [...config.origins][0];
  if (!origin) throw new Error('Missing application origin');
  const request = new Request(new URL('/api/account/session', origin), {
    headers:{ Authorization:req.headers.authorization },
  });
  const state = await client.authenticateRequest(request, {
    authorizedParties:[...config.origins], acceptsToken:'session_token',
  });
  const auth = state.isAuthenticated ? state.toAuth() : null;
  if (!auth?.userId || !auth.sessionId) throw httpError(401, 'please sign in again');
  return auth.userId;
}

export function createAccountHandler({ getConfig = accountConfig, verify = verifyAccountSession, getStore }) {
  return async (req, res, pathname) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const send = (status, data) => { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const config = getConfig();
      if (pathname === '/api/account/config' && req.method === 'GET') {
        send(200, config ? { enabled:true, publishableKey:config.publishableKey, frontendHost:config.frontendHost } : { enabled:false }); return;
      }
      const methods = {'/api/account/session':'GET','/api/account/register':'POST','/api/account/guest-preview':'GET','/api/account/link-guest':'POST','/api/account/sign-out':'POST','/api/account/transfer-code':'POST','/api/account/transfer-preview':'POST','/api/account/transfer-confirm':'POST'};
      if (!methods[pathname]) throw httpError(404, 'not found');
      if (req.method !== methods[pathname]) throw httpError(405, 'method not allowed');
      if (!config) throw httpError(503, 'account sign-in is not available yet');
      let input;
      if (req.method === 'POST') {
        const legacyTransfer = pathname === '/api/account/transfer-code' && req.headers.origin === 'https://sketchlet-blush.vercel.app';
        if (!config.origins.has(req.headers.origin) && !legacyTransfer) throw httpError(403, 'request origin does not match this site');
        input = await readJson(req);
        if (pathname.endsWith('/link-guest') || pathname.endsWith('/transfer-confirm')) {
          if ('choices' in input && !validChoices(input.choices)) throw httpError(400,'choose a drawing for each overlapping date');
        }
        if (pathname.endsWith('/transfer-preview') || pathname.endsWith('/transfer-confirm')) {
          const confirm = pathname.endsWith('/transfer-confirm');
          if (Object.keys(input).some(key => !(confirm ? ['code','revision','choices'] : ['code']).includes(key)) || !/^[a-f0-9]{64}$/.test(input.code || '') || typeof input.code !== 'string'
            || (confirm && (typeof input.revision !== 'string' || !/^[a-f0-9]{32}$/.test(input.revision)))) throw httpError(400,'enter a valid transfer code and review before confirming');
        } else if (pathname.endsWith('/link-guest')) {
          if (Object.keys(input).some(key => !['revision','choices'].includes(key)) || typeof input.revision !== 'string' || !/^[a-f0-9]{32}$/.test(input.revision)) throw httpError(400, 'please review your drawings before linking');
        } else if (Object.keys(input).length) throw httpError(400, 'unexpected account fields');
      }
      if (pathname.endsWith('/transfer-code')) {
        const guest = guestOwner(req);
        if (!guest) throw httpError(409,'no guest drawings are available on this address');
        const code = randomBytes(32).toString('hex');
        const store = await getStore();
        if (!await store.issueTransfer(guest,createHash('sha256').update(code).digest('hex'))) throw httpError(409,'no unlinked guest drawings are available on this address');
        send(200,{code}); return;
      }
      const userId = await verify(req, config);
      if (pathname.endsWith('/transfer-preview') || pathname.endsWith('/transfer-confirm')) {
        const store = await getStore();
        const account = await store.find(config.frontendHost,userId);
        if (!account) throw httpError(409,'please finish connecting your account first');
        const hash = createHash('sha256').update(input.code).digest('hex');
        const result = pathname.endsWith('/transfer-preview') ? await store.transferPreview(account.id,hash) : await store.redeemTransfer(account.id,hash,input.revision,input.choices || {});
        if (result.error === 'choices') throw httpError(409,'choose a drawing for each overlapping date before confirming');
        if (result.error || result.claimed) throw httpError(409,result.error === 'changed' ? 'drawings changed. review the code again before confirming.' : 'this code has expired or its guest work has already been transferred.');
        send(200,result); return;
      }
      if (pathname.endsWith('/sign-out')) {
        const guest = guestOwner(req);
        const store = await getStore();
        guestVisitor(req,res,!!process.env.VERCEL || [...config.origins][0].startsWith('https:'),guest ? await store.retired(guest) : false);
        send(200,{ok:true}); return;
      }
      const store = await getStore();
      if (pathname === '/api/account/guest-preview' || pathname === '/api/account/link-guest') {
        const account = await store.find(config.frontendHost, userId);
        if (!account) throw httpError(409, 'please finish connecting your account first');
        const guest = guestOwner(req);
        if (pathname.endsWith('/link-guest')) {
          if (!guest) throw httpError(409, 'no guest identity remains in this browser. please reload your review');
          const result = await store.link(account.id,guest,input.revision,input.choices || {});
          if (result.error === 'choices') throw httpError(409,'choose a drawing for each overlapping date before confirming');
          if (result.error === 'changed') throw httpError(409, 'your drawings changed. review the updated list before confirming again');
          if (result.error === 'claimed') throw httpError(409, 'this guest identity has already been linked to an account');
          send(200,result); return;
        }
        send(200, guest ? await store.preview(account.id, guest) : {drawings:[],revision:null});
        return;
      }
      const account = pathname.endsWith('/register')
        ? await store.register(config.frontendHost, userId)
        : await store.find(config.frontendHost, userId);
      send(200, { authenticated:true, registered:!!account });
    } catch (error) {
      send(error.status || 503, { error:error.status ? error.message : 'account sign-in is temporarily unavailable. please try again.' });
    }
  };
}

export function createOwnerResolver({ getStore, getConfig = accountConfig, verify = verifyAccountSession }) {
  return async (req,res,secure) => {
    const store = await getStore();
    if (req.headers.authorization) {
      const config = getConfig();
      if (!config) throw httpError(503,'account sign-in is unavailable');
      const user = await verify(req,config);
      const account = await store.find(config.frontendHost,user);
      if (!account) throw httpError(409,'please connect your account on the profile page');
      return account.owner_hash;
    }
    const guest = guestOwner(req);
    return guestVisitor(req,res,secure,guest ? await store.retired(guest) : false);
  };
}
