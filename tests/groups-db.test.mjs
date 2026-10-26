import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
import {sqlStatements} from '../scripts/sql-statements.mjs';
import {createGroupStore} from '../backend/groups.mjs';

// Uses a disposable schema, never .env.local or the application's DATABASE_URL.
test('group database enforces approval, privacy, roles and ownership under concurrent changes',{
  skip:!process.env.SKETCHLET_TEST_DATABASE_URL,
},async()=>{
  const sql=neon(process.env.SKETCHLET_TEST_DATABASE_URL),schema='groups_test_'+randomBytes(10).toString('hex');
  const tx=queries=>sql.transaction([sql.query(`SET LOCAL search_path TO "${schema}"`),...queries]);
  const one=async query=>(await tx([query])).at(-1);
  const wrap=raw=>({raw,then:(resolve,reject)=>one(raw).then(resolve,reject)});
  const scoped=(...args)=>wrap(sql(...args));
  scoped.transaction=async queries=>(await tx(queries.map(q=>q.raw))).slice(1);
  const store=createGroupStore(scoped),owner=randomUUID(),member=randomUUID(),outsider=randomUUID();
  await sql.query(`CREATE SCHEMA "${schema}"`);
  try {
    const dir=new URL('../db/',import.meta.url),migrations=[];
    for(const name of (await readdir(dir)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort())migrations.push(...sqlStatements(await readFile(new URL(name,dir),'utf8')).map(s=>sql.query(s)));
    await tx(migrations);await tx(migrations);
    for(const id of [owner,member,outsider])await one(sql`INSERT INTO sketchlet_accounts(id,clerk_instance,clerk_user_id,owner_hash) VALUES(${id},'fixture',${id},${randomBytes(32).toString('hex')})`);
    const results=await Promise.all([store.create(owner,{name:'Dogs',description:'Friends',listed:false}),store.create(member,{name:'dogs',description:'Other',listed:true})]);
    assert.equal(results.filter(Boolean).length,1);
    // Use a known-owner group for the remaining permission checks.
    const {id}=await store.create(owner,{name:'Birds',description:'Friends',listed:false});
    assert.equal((await store.search('Bird')).length,0);
    const publicDetail=await store.detail(id,outsider);assert.equal(publicDetail.members,undefined);assert.equal(publicDetail.listed,undefined);
    assert.equal((await store.action(outsider,id,'settings',{description:'Attack',listed:true})).error,'permission');
    await store.action(member,id,'request',{});
    assert.equal((await store.detail(id,member)).status,'pending');assert.equal((await store.detail(id,member)).members,undefined);
    assert.equal((await store.action(member,id,'approve',{target:member})).error,'permission');
    await store.action(owner,id,'approve',{target:member});await store.action(owner,id,'grant',{target:member});
    await store.action(outsider,id,'request',{});
    await store.action(member,id,'approve',{target:outsider});
    assert.equal((await store.detail(id,outsider)).status,'active');
    assert.equal((await store.action(member,id,'grant',{target:outsider})).error,'permission');
    await store.action(member,id,'settings',{description:'Listed now',listed:true});assert.equal((await store.search('Bird')).length,1);
    assert.equal((await store.action(owner,id,'leave',{})).error,'owner');
    await store.action(owner,id,'transfer',{target:member});
    assert.equal((await store.detail(id,member)).role,'owner');
    assert.equal((await store.action(owner,id,'remove',{target:outsider})).error,'permission');
    await store.action(owner,id,'leave',{});assert.equal((await store.detail(id,owner)).members,undefined);
    await store.action(member,id,'grant',{target:outsider});
    await Promise.all([store.action(member,id,'revoke',{target:outsider}),store.action(outsider,id,'settings',{description:'Concurrent edit',listed:false})]);
    assert.equal((await store.action(outsider,id,'settings',{description:'After revocation',listed:false})).error,'permission');
    assert.equal((await store.detail(id,member)).members.find(row=>row.id===outsider).role,'member');
    assert.ok((await one(sql`SELECT count(*)::int AS count FROM sketchlet_group_events WHERE group_id=${id}`))[0].count>0);
  } finally { await sql.query(`DROP SCHEMA "${schema}" CASCADE`); }
});
