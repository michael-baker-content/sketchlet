import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { handleAvatar } from '../backend/avatar.mjs';

function fixture() {
  const accounts = new Map([['alice',{id:'a',avatar_key:null}],['bob',{id:'b',avatar_key:null}]]);
  const objects = new Map();
  const sql = async (parts,...values) => {
    if (parts.join('').startsWith('SELECT')) return accounts.has(values[0]) ? [ {...accounts.get(values[0])} ] : [];
    const account = [...accounts.values()].find(a => a.id === values[1]); account.avatar_key = values[0]; return [];
  };
  const storage = {send:async command => {
    const {Key,Body} = command.input;
    if (command.constructor.name === 'PutObjectCommand') { objects.set(Key,Body); return {}; }
    if (command.constructor.name === 'DeleteObjectCommand') { objects.delete(Key); return {}; }
    return {Body:{transformToByteArray:async () => objects.get(Key)}};
  }};
  async function request(owner, body, authorization = 'Bearer verified-by-parent') {
    const result = {};
    await handleAvatar({method:body ? 'POST':'GET',body,headers:{authorization,'content-type':'application/json'}}, {
      writeHead:(status,headers) => Object.assign(result,{status,headers}),end:body => {result.body=JSON.parse(body);},
    },{sql,storage,bucket:'private',owner});
    return result;
  }
  return {request,objects};
}
test('private avatar roundtrip is owner-scoped, normalized, removable, and not cached', async () => {
  const f = fixture();
  const bytes = await sharp({create:{width:12,height:8,channels:3,background:'#714488'}}).jpeg().toBuffer();
  const saved = await f.request('alice',{photo:'data:image/jpeg;base64,'+bytes.toString('base64')});
  assert.equal(saved.headers['Cache-Control'],'private, no-store');
  assert.deepEqual(Object.keys(saved.body),['photo']);
  const metadata = await sharp(Buffer.from(saved.body.photo.split(',')[1],'base64')).metadata();
  assert.equal(metadata.width,256); assert.equal(metadata.height,256);
  assert.equal((await f.request('alice')).body.photo,saved.body.photo);
  assert.equal((await f.request('bob')).body.photo,null);
  await f.request('alice',{photo:null});
  assert.equal((await f.request('alice')).body.photo,null);
  assert.equal(f.objects.size,0);
});
test('avatar requests reject guests, unknown owners, and invalid payloads', async () => {
  const f = fixture();
  await assert.rejects(f.request('alice',undefined,''),e => e.status===401);
  await assert.rejects(f.request('guest'),e => e.status===403);
  for (const photo of [undefined,'https://example.com/photo.jpg','data:image/jpeg;base64,AAAA','x'.repeat(200001)]) {
    await assert.rejects(f.request('alice',{photo}),e => e.status===400);
  }
  assert.equal(f.objects.size,0);
});
