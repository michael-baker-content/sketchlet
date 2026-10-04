import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRatingName, validateVote, networkLimitKey, parseSkipped, balanceRatingQueue } from '../backend/ratings.mjs';
import { createRatingSkips } from '../src/rating-session.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('rating requires a nonempty server profile and rejects invalid votes and self-votes', () => {
  for (const name of [null, undefined, '', '   ']) assert.throws(() => requireRatingName(name), error => error.status === 403 && error.code === 'name_required');
  for (const stars of [0, 6, 2.5, '5', null]) assert.throws(() => validateVote('artist','visitor','author',stars), error => error.status === 400);
  assert.throws(() => validateVote('artist','same','same',5), error => error.status === 403);
  for (const stars of [1,2,3,4,5]) assert.doesNotThrow(() => validateVote('artist','visitor','author',stars));
});

test('network limiter ignores spoofed forwarding outside Vercel and canonicalizes IPs', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.5' }, socket: { remoteAddress: '127.0.0.1' } };
  const local = networkLimitKey(req, {});
  assert.equal(local, networkLimitKey({ ...req, headers: { 'x-forwarded-for': '192.0.2.7' } }, {}));
  assert.notEqual(local, networkLimitKey(req, { VERCEL: '1' }));
  assert.equal(networkLimitKey({ headers: { 'x-forwarded-for': 'invalid' } }, { VERCEL:'1' }), null);
  assert.equal(networkLimitKey({ headers:{},socket:{remoteAddress:'::ffff:127.0.0.1'} }, {}), local);
  const ipv6 = value => networkLimitKey({ headers:{'x-forwarded-for':value} },{VERCEL:'1'});
  assert.equal(ipv6('2001:db8::1'), ipv6('2001:0db8:0:0:0:0:0:1'));
  assert.ok(!local.includes('127.0.0.1'));
});

test('queue reserves archive exposure, includes favorites, and never repeats an item', () => {
  const today = '2026-10-04';
  const items = Array.from({length:250},(_,n)=>({id:id(n),date:today,count:0,average:null,lottery:n/300}));
  items.push({id:id(999),date:'2026-01-01',count:0,average:null,lottery:.1});
  items.push({id:id(998),date:'2026-01-01',count:30,average:5,lottery:.2});
  const result = balanceRatingQueue(items,today);
  assert.equal(result[1].id,id(999));
  assert.equal(result[3].id,id(998));
  assert.equal(new Set(result.map(item=>item.id)).size,items.length);
  assert.equal(balanceRatingQueue(items.filter(item=>item.date!==today),today).length,2);
  assert.equal(balanceRatingQueue(items.filter(item=>item.date===today),today).length,250);
  assert.deepEqual(balanceRatingQueue([],today),[]);
});

test('skip memory survives reload, expires after 30 minutes, and is bounded', () => {
  let value = '', time = 10000000;
  const storage = { getItem:()=>value, setItem:(_,next)=>{value=next;} };
  const skips = createRatingSkips(storage,()=>time);
  skips.add(id(1));skips.add(id(1));
  assert.deepEqual(createRatingSkips(storage,()=>time).ids(),[id(1)]);
  time += 30*60*1000;
  assert.deepEqual(skips.ids(),[]);
  for(let n=0;n<110;n++)skips.add(id(n));
  assert.equal(skips.ids().length,100);
  assert.deepEqual(parseSkipped(skips.ids().join(',')),skips.ids());
  skips.clear();assert.deepEqual(skips.ids(),[]);
  value='not json';assert.deepEqual(createRatingSkips(storage).ids(),[]);
  const blocked = createRatingSkips({ getItem(){throw new Error();},setItem(){throw new Error();} },()=>time);
  blocked.add(id(1));assert.deepEqual(blocked.ids(),[id(1)]);
  assert.throws(()=>parseSkipped('bad-id'), error=>error.status===400);
  assert.throws(()=>parseSkipped(Array.from({length:101},(_,n)=>id(n)).join(',')), error=>error.status===400);
});
