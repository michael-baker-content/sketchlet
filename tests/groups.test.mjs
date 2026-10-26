import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupsHandler, groupInput } from '../backend/groups.mjs';
const actor='11111111-1111-4111-8111-111111111111',group='22222222-2222-4222-8222-222222222222',target='33333333-3333-4333-8333-333333333333';
function fixture() {
  const calls=[];
  const store={account:async()=>({id:actor}),limit:async()=>true,mine:async()=>[],search:async()=>[],detail:async()=>null,
    create:async(a,input)=>{calls.push({a,input});return {id:group};},action:async(...args)=>{calls.push(args);return {ok:true};},nameTaken:async()=>true,suggestion:async()=> 'dogs-1'};
  const handle=createGroupsHandler({getConfig:()=>({frontendHost:'fixture',origins:new Set(['https://sketchlet.test'])}),getStore:async()=>store,
    verify:async req=>{if(req.headers.authorization!=='Bearer valid')throw Object.assign(new Error('sign in'),{status:401});return 'verified-user';}});
  async function request(path,body,headers={}) {
    const result={};
    await handle({url:path,method:body===undefined?'GET':'POST',body,headers:{authorization:'Bearer valid',origin:'https://sketchlet.test','content-type':'application/json',...headers}},
      {setHeader(){},writeHead(status){result.status=status;},end(value){result.body=JSON.parse(value);}},path.split('?')[0]);
    return result;
  }
  return {store,calls,request};
}
test('group input normalizes names and rejects role injection and invalid settings',()=>{
  assert.deepEqual(groupInput({name:' Dog   people ',description:' Hi ',listed:false},true),{name:'Dog people',description:'Hi',listed:false});
  for(const patch of [{name:'a'},{name:'<script>'},{description:'x'.repeat(401)},{listed:'true'},{owner:actor}])assert.throws(()=>groupInput({name:'Dogs',listed:true,...patch},true));
});
test('group actions require sign-in, a registered account and an allowed origin',async()=>{
  const f=fixture();
  assert.equal((await f.request('/api/groups',undefined,{authorization:''})).status,401);
  assert.equal((await f.request('/api/groups',{name:'Dogs',listed:true},{origin:'https://evil.example'})).status,403);
  f.store.account=async()=>null;
  assert.equal((await f.request('/api/groups')).status,409);
  assert.equal(f.calls.length,0);
});
test('create and action handlers use verified identities and return name suggestions',async()=>{
  const f=fixture();
  assert.equal((await f.request('/api/groups',{name:'Dogs',listed:true})).status,201);
  assert.equal(f.calls[0].a,actor);
  assert.equal((await f.request(`/api/groups/${group}/approve`,{target})).status,200);
  assert.deepEqual(f.calls[1].slice(0,3),[actor,group,'approve']);
  assert.equal((await f.request(`/api/groups/${group}/grant`,{target,role:'owner'})).status,400);
  f.store.action=async()=>({error:'permission'});
  assert.equal((await f.request(`/api/groups/${group}/approve`,{target})).status,403);
  f.store.create=async()=>null;
  const conflict=await f.request('/api/groups',{name:'Dogs',listed:true});
  assert.equal(conflict.status,409);assert.equal(conflict.body.suggestion,'dogs-1');
});
test('group failures stay local and do not disclose database errors',async()=>{
  const f=fixture();f.store.mine=async()=>{throw new Error('secret connection string');};
  const result=await f.request('/api/groups');assert.equal(result.status,503);assert.doesNotMatch(result.body.error,/secret/);
  f.store.limit=async()=>false;
  assert.equal((await f.request('/api/groups',{name:'Dogs',listed:true})).status,429);
});
