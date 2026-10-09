import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGalleryHandler } from '../backend/gallery-handler.mjs';
import { reportInput, moderationInput, reviewCursor } from '../backend/moderation.mjs';

const id = '12345678-1234-1234-1234-123456789abc';
const token = 'a'.repeat(64), owner = createHash('sha256').update(token).digest('hex');
function fixture(query) {
  const queries = [], images = [], uploads = [];
  const handler = createGalleryHandler({ origins:new Set(['http://sketchlet.test']), bucket:'unused',
    sql:async (parts,...values) => { const text = parts.join('?'); queries.push({text,values}); return query(text,values); },
    storage:{send:async command => { uploads.push(command); throw new Error('unexpected upload'); }},
    sendImage:async (res,key) => { images.push(key); res.writeHead(200,{});res.end(); },
  });
  async function request(path, body) {
    const result = { headers:{} };
    await handler({ method:body ? 'POST' : 'GET',url:path,body,socket:{remoteAddress:'127.0.0.1'},
      headers:{host:'sketchlet.test',origin:'http://sketchlet.test',cookie:`sketchlet_guest=${token}`,'content-type':'application/json'} },
    { setHeader:(key,value) => { result.headers[key]=value; },writeHead:(status,headers) => { result.status=status;Object.assign(result.headers,headers); },
      end:body => { result.body=body; if(body)result.json=JSON.parse(body); } },new URL(path,'http://sketchlet.test').pathname);
    return result;
  }
  return {request,queries,images,uploads};
}
test('reports and removal decisions accept only bounded, predefined inputs', () => {
  assert.deepEqual(reportInput({category:'spam',explanation:'  example  '}),{category:'spam',explanation:'example'});
  for (const input of [{category:'__proto__'},{category:'spam',explanation:123},{category:'spam',explanation:'x'.repeat(1001)}]) {
    assert.throws(() => reportInput(input), error => error.status===400);
  }
  assert.throws(() => moderationInput({action:'hide',reason:'freeform'}));
  assert.equal(moderationInput({action:'restore',reason:'spam'}).reason,'');
  assert.throws(() => reviewCursor('1;delete'));
});
test('unavailable drawings cannot return image bytes or accept a vote or report', async () => {
  for (const [path,body] of [[`/api/drawings/${id}/image`,null],[`/api/drawings/${id}/vote`,{stars:5}],[`/api/drawings/${id}/report`,{category:'spam'}]]) {
    const f = fixture(text => {
      if(text.includes('sketchlet_rate_limits'))return [{request_count:1}];
      if(text.includes('SELECT display_name'))return [{display_name:'tester'}];
      // Both an unknown id and a non-public id are absent from this view.
      assert.match(text,/FROM sketchlet_public_drawings/);
      return [];
    });
    assert.equal((await f.request(path,body)).status,404);
    assert.deepEqual(f.images,[]);
    assert.equal(f.queries.some(q => /INSERT INTO sketchlet_(votes|reports)/.test(q.text)),false);
  }
});
test('reporting needs no name, uses dedicated limits, and cannot duplicate or publish content', async () => {
  const f = fixture(text => {
    if(text.includes('sketchlet_rate_limits'))return [{request_count:1}];
    if(text.startsWith('SELECT id FROM sketchlet_public_drawings'))return [{id}];
    if(text.includes('INSERT INTO sketchlet_reports'))return [];
    throw new Error('unexpected query');
  });
  for(let n=0;n<2;n++)assert.equal((await f.request(`/api/drawings/${id}/report`,{category:'other',explanation:'a concern'})).status,200);
  const writes=f.queries.filter(q=>q.text.includes('INSERT INTO sketchlet_reports'));
  assert.equal(writes.length,2);
  for(const q of writes)assert.match(q.text,/ON CONFLICT\(drawing_id,reporter_hash\) DO NOTHING/);
  assert.equal(f.queries.some(q=>q.text.includes('sketchlet_profiles') || q.text.includes('UPDATE sketchlet_drawing_moderation')),false);
  assert.ok(f.queries.some(q=>q.values.includes('report:'+owner)));
});
test('report limits reject requests before inserting reports', async () => {
  const f=fixture((text,values)=> {
    assert.match(text,/sketchlet_rate_limits/);
    return [{request_count:String(values[0]).startsWith('report:')?11:1}];
  });
  assert.equal((await f.request(`/api/drawings/${id}/report`,{category:'spam'})).status,429);
  assert.equal(f.queries.some(q=>q.text.includes('INSERT INTO sketchlet_reports')),false);
});
test('archive covers, prompt galleries, and rating queues query only public submissions', async () => {
  for (const path of ['/api/archive','/api/gallery?date=2026-10-08','/api/queue']) {
    const f=fixture(text=> {
      if(text.includes('sketchlet_rate_limits'))return [{request_count:1}];
      if(text.includes('SELECT display_name'))return [{display_name:'tester'}];
      if(path.startsWith('/api/gallery')) {
        assert.match(text,/EXISTS\(SELECT 1 FROM sketchlet_public_drawings/);
        assert.match(text,/\?::uuid IS NOT NULL AND d.owner_hash=\?/);
      } else {
        assert.doesNotMatch(text,/(?:FROM|JOIN) sketchlet_drawings\b/);
        assert.match(text,/sketchlet_public_drawings/);
      }
      return [];
    });
    const result=await f.request(path);assert.equal(result.status,200,path);assert.deepEqual(result.json,[]);
  }
});
test('a removed daily submission stays completed and returns only an owner notice', async () => {
  const f=fixture(text=> {
    if(text.includes('sketchlet_rate_limits'))return [{request_count:1}];
    if(text.includes('INSERT INTO sketchlet_prompts'))return [{day:'2026-10-08',title:'singing kite'}];
    if(text.startsWith('SELECT id FROM sketchlet_drawings'))return [{id}];
    if(text.includes('p.title, d.owner_hash')) {
      assert.match(text,/AND d.owner_hash=\?/);
      return [{id,day:'2026-10-08',title:'singing kite',owner_hash:owner,status:'hidden',public_reason:'removed as spam.',private_note:'never public'}];
    }
    if(text.startsWith('SELECT prompt_day'))return [{day:'2026-10-08'}];
    if(text.includes('SELECT display_name'))return [{display_name:'tester'}];
    throw new Error('unexpected query');
  });
  const today=await f.request('/api/today');
  assert.equal(today.status,200);assert.equal(today.json.submission.removed,true);
  assert.equal(today.json.submission.reason,'removed as spam.');
  assert.doesNotMatch(today.body,/private_note|never public|owner_hash|image/);
  const res=await f.request('/api/drawings',{date:'2026-10-08',image:'must not upload'});
  assert.equal(res.status,200);assert.equal(res.json.removed,true);assert.deepEqual(f.uploads,[]);
});
