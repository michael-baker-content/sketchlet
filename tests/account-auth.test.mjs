import test from 'node:test';
import assert from 'node:assert/strict';
import { accountConfig, createAccountHandler, createOwnerResolver, verifyAccountSession } from '../backend/account-auth.mjs';
import { guestOwner, guestVisitor } from '../backend/guest-identity.mjs';

const key = 'pk_test_' + Buffer.from('sample.clerk.accounts.dev$').toString('base64');
const config = accountConfig({ CLERK_PUBLISHABLE_KEY:key, CLERK_SECRET_KEY:'sk_test_fixture', APP_ORIGIN:'https://sketchlet.example' });

test('Clerk config accepts dashboard variable aliases and exposes no secret in public config', async () => {
  assert.equal(accountConfig({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:key, CLERK_SECRET_KEY:'sk_test_fixture' }).publishableKey,key);
  assert.equal(accountConfig({}), null);
  assert.throws(() => accountConfig({ CLERK_PUBLISHABLE_KEY:key, CLERK_SECRET_KEY:'sk_live_wrong' }));
  assert.throws(() => accountConfig({ CLERK_PUBLISHABLE_KEY:'pk_test_' + Buffer.from('bad/path$').toString('base64'), CLERK_SECRET_KEY:'sk_test_fixture' }));
  const result = await request('/api/account/config');
  assert.equal(result.status, 200);
  assert.equal(result.json.publishableKey, key);
  assert.equal(result.body.includes('sk_test_fixture'),false);
});

async function request(path, { method='GET', origin='https://sketchlet.example', body={}, authenticated=true, cookie='', rows=[], linkResult={linked:1,hidden:0}, retired=false } = {}) {
  const result = { registrations:[], reads:[], previews:[], links:[], headers:{} };
  const handler = createAccountHandler({ getConfig:() => config,
    verify:async () => { if (!authenticated) throw Object.assign(new Error('please sign in again'),{status:401}); return 'user_verified'; },
    getStore:async () => ({
      find:async (...args) => { result.reads.push(args); return {id:'internal'}; },
      register:async (...args) => { result.registrations.push(args); return {id:'internal'}; },
      preview:async (...args) => { result.previews.push(args); return {drawings:rows,revision:'a'.repeat(32)}; },
      link:async (...args) => { result.links.push(args); return linkResult; },
      retired:async () => retired,
      issueTransfer:async (...args) => { result.links.push(args); return true; },
      transferPreview:async (...args) => { result.previews.push(args); return {drawings:rows,revision:'a'.repeat(32)}; },
      redeemTransfer:async (...args) => { result.links.push(args); return linkResult; },
    }),
  });
  await handler({ method, headers:{origin,cookie,'content-type':'application/json'}, body }, {
    setHeader(name,value) { result.headers[name]=value; },
    writeHead(status,headers) { result.status=status; Object.assign(result.headers,headers); },
    end(body) { result.body=body; result.json=JSON.parse(body); },
  },path);
  return result;
}

test('account registration requires verified identity, exact origin, and no browser ownership fields', async () => {
  const good = await request('/api/account/register',{method:'POST'});
  assert.deepEqual(good.registrations, [['sample.clerk.accounts.dev','user_verified']]);
  assert.equal(good.headers['Cache-Control'],'private, no-store');
  for (const options of [
    {method:'POST',origin:'https://attacker.example'},
    {method:'POST',authenticated:false},
    {method:'POST',body:{userId:'user_victim',owner_hash:'fake'}},
    {method:'GET'},
  ]) {
    const result = await request('/api/account/register',options);
    assert.ok(result.status>=400);
    assert.deepEqual(result.registrations,[]);
  }
  const session = await request('/api/account/session');
  assert.equal(session.json.authenticated,true);
  assert.deepEqual(session.registrations,[]);
});

test('guest cookies and user IDs cannot substitute for a Clerk session token', async () => {
  await assert.rejects(verifyAccountSession({headers:{cookie:'sketchlet_guest=abc', 'x-user-id':'user_victim'}},config), error => error.status===401);
});

test('guest review requires login and uses only the server cookie, without writing ownership', async () => {
  const cookie = 'sketchlet_guest=' + 'a'.repeat(64);
  const rows = [{date:'2026-10-10',prompt:'a singing kite',conflict:true}];
  const result = await request('/api/account/guest-preview',{cookie,rows});
  assert.equal(result.status,200);
  assert.deepEqual(result.json,{drawings:rows,revision:'a'.repeat(32)});
  assert.deepEqual(result.previews,[['internal',guestOwner({headers:{cookie}})]]);
  assert.deepEqual(result.registrations,[]);
  assert.equal(result.headers['Set-Cookie'],undefined);
  for (const cookie of ['', 'sketchlet_guest=invalid', 'sketchlet_guest=' + 'b'.repeat(65)]) {
    const empty = await request('/api/account/guest-preview',{cookie});
    assert.deepEqual(empty.previews,[]);
    assert.deepEqual(empty.json.drawings,[]);
  }
  const denied = await request('/api/account/guest-preview',{cookie,authenticated:false});
  assert.equal(denied.status,401);
  assert.deepEqual(denied.previews,[]);
  const limited = await request('/api/account/guest-preview',{cookie,rows:Array(101).fill(rows[0])});
  assert.equal(limited.json.drawings.length,101);
});

test('link confirmation requires session, origin, guest proof and a reviewed revision', async () => {
  const options = {method:'POST',cookie:'sketchlet_guest='+'a'.repeat(64),body:{revision:'b'.repeat(32)}};
  const good = await request('/api/account/link-guest',options);
  assert.equal(good.status,200);
  assert.deepEqual(good.links,[['internal',guestOwner({headers:{cookie:options.cookie}}),'b'.repeat(32),{}]]);
  for (const change of [{authenticated:false},{origin:'https://wrong.example'},{cookie:''},{body:{}},{body:{...options.body,owner:'forged'}}]) {
    const denied = await request('/api/account/link-guest',{...options,...change});
    assert.ok(denied.status>=400);
    assert.deepEqual(denied.links,[]);
  }
  for (const error of ['changed','claimed','choices']) {
    assert.equal((await request('/api/account/link-guest',{...options,linkResult:{error}})).status,409);
  }
  const signedOut = await request('/api/account/sign-out',{method:'POST',cookie:options.cookie});
  assert.equal(signedOut.status,200);
  assert.equal(signedOut.headers['Set-Cookie'],undefined);
  const retired = await request('/api/account/sign-out',{method:'POST',cookie:options.cookie,retired:true});
  assert.notEqual(guestOwner({headers:{cookie:retired.headers['Set-Cookie']}}),guestOwner({headers:{cookie:options.cookie}}));
  assert.deepEqual(signedOut.links,[]);
});

test('merge choices are validated and passed intact to the transaction', async () => {
  const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  for (const path of ['/api/account/link-guest','/api/account/transfer-confirm']) {
    const body = {revision:'a'.repeat(32),choices:{[id]:other},...(path.endsWith('transfer-confirm') ? {code:'b'.repeat(64)} : {})};
    const options = {method:'POST',cookie:'sketchlet_guest='+'c'.repeat(64),body};
    const result = await request(path,options);
    assert.equal(result.status,200);
    assert.deepEqual(result.links[0].at(-1),body.choices);
    for (const choices of [null,[],true,{bad:other},{[id]:12}]) {
      const denied = await request(path,{...options,body:{...body,choices}});
      assert.equal(denied.status,400); assert.deepEqual(denied.links,[]);
    }
  }
});

test('transfer issuance proves guest possession without Clerk and redemption requires account consent', async () => {
  const cookie = 'sketchlet_guest='+'a'.repeat(64);
  const issued = await request('/api/account/transfer-code',{method:'POST',origin:'https://sketchlet-blush.vercel.app',cookie,authenticated:false});
  assert.equal(issued.status,200);
  assert.match(issued.json.code,/^[a-f0-9]{64}$/);
  assert.notEqual(issued.links[0][1],issued.json.code);
  for (const changes of [{cookie:''},{origin:'https://evil.example'},{body:{guest:'fake'}}]) {
    const denied = await request('/api/account/transfer-code',{method:'POST',cookie,...changes});
    assert.ok(denied.status>=400); assert.equal(denied.links.length,0);
  }
  const body = {code:issued.json.code,revision:'b'.repeat(32)};
  assert.equal((await request('/api/account/transfer-preview',{method:'POST',body:{code:body.code}})).status,200);
  assert.equal((await request('/api/account/transfer-confirm',{method:'POST',body})).status,200);
  for (const changes of [{authenticated:false},{origin:'https://evil.example'},{body:{code:body.code}},{body:{...body,owner:'fake'}}]) {
    const denied = await request('/api/account/transfer-confirm',{method:'POST',body,...changes});
    assert.ok(denied.status>=400); assert.equal(denied.links.length,0);
  }
  assert.equal((await request('/api/account/transfer-confirm',{method:'POST',body,linkResult:{error:'expired'}})).status,409);
});

test('shared guest identity preserves existing cookies and securely issues missing ones', () => {
  let issued;
  const res = {setHeader(name,value) { assert.equal(name,'Set-Cookie'); issued=value; }};
  const owner = guestVisitor({headers:{}},res,true);
  assert.match(issued,/; HttpOnly; SameSite=Lax; Path=\/; Max-Age=31536000; Secure$/);
  assert.equal(guestOwner({headers:{cookie:issued}}),owner);
  const cookie = issued;
  issued = undefined;
  assert.equal(guestVisitor({headers:{cookie}},res,true),owner);
  assert.equal(issued,undefined);
});

test('gallery ownership uses verified accounts and rotates retired guests without granting account access', async () => {
  let verified = 0, issued;
  const resolver = createOwnerResolver({getConfig:()=>config,
    verify:async req => { verified++; if (req.headers.authorization !== 'Bearer good') throw Object.assign(new Error('invalid session'),{status:401}); return 'verified'; },
    getStore:async () => ({find:async(instance,user) => { assert.equal(user,'verified'); return {owner_hash:'account-owner'}; },retired:async()=>true}),
  });
  const cookie = 'sketchlet_guest='+'a'.repeat(64);
  const res = {setHeader(name,value) { issued=value; }};
  assert.equal(await resolver({headers:{authorization:'Bearer good',cookie}},res,true),'account-owner');
  assert.equal(issued,undefined);
  await assert.rejects(resolver({headers:{authorization:'Bearer bad',cookie}},res,true),e=>e.status===401);
  const guest = await resolver({headers:{cookie}},res,true);
  assert.notEqual(guest,'account-owner');
  assert.notEqual(guest,guestOwner({headers:{cookie}}));
  assert.match(issued,/HttpOnly/);
  assert.equal(verified,2);
});
