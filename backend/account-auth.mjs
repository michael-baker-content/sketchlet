import { allowedOrigins, httpError, readJson } from './http.mjs';
import { guestOwner, guestVisitor } from './guest-identity.mjs';

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
      const methods = {'/api/account/session':'GET','/api/account/register':'POST','/api/account/guest-preview':'GET','/api/account/link-guest':'POST','/api/account/sign-out':'POST'};
      if (!methods[pathname]) throw httpError(404, 'not found');
      if (req.method !== methods[pathname]) throw httpError(405, 'method not allowed');
      if (!config) throw httpError(503, 'account sign-in is not available yet');
      let input;
      if (req.method === 'POST') {
        if (!config.origins.has(req.headers.origin)) throw httpError(403, 'request origin does not match this site');
        input = await readJson(req);
        if (pathname.endsWith('/link-guest')) {
          if (Object.keys(input).length !== 1 || typeof input.revision !== 'string' || !/^[a-f0-9]{32}$/.test(input.revision)) throw httpError(400, 'please review your drawings before linking');
        } else if (Object.keys(input).length) throw httpError(400, 'unexpected account fields');
      }
      const userId = await verify(req, config);
      if (pathname.endsWith('/sign-out')) {
        guestVisitor(req,res,!!process.env.VERCEL || [...config.origins][0].startsWith('https:'),true);
        send(200,{ok:true}); return;
      }
      const store = await getStore();
      if (pathname === '/api/account/guest-preview' || pathname === '/api/account/link-guest') {
        const account = await store.find(config.frontendHost, userId);
        if (!account) throw httpError(409, 'please finish connecting your account first');
        const guest = guestOwner(req);
        if (pathname.endsWith('/link-guest')) {
          if (!guest) throw httpError(409, 'no guest identity remains in this browser. please reload your review');
          const result = await store.link(account.id,guest,input.revision);
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
