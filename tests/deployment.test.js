import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { readJson, allowedOrigins } from '../backend/http.mjs';
import { PUBLIC_FILES, publicFile } from '../backend/public-files.mjs';
import { MAX_REQUEST_BYTES, submissionFits } from '../src/upload-limits.js';

test('local streams and Vercel parsed bodies accept the same JSON', async () => {
  const payload={date:'2026-10-03',image:'data:image/png;base64,test'};
  const req=Readable.from([JSON.stringify(payload)]);req.headers={'content-type':'application/json'};
  assert.deepEqual(await readJson(req),payload);
  for(const body of [payload,JSON.stringify(payload),Buffer.from(JSON.stringify(payload))]){
    assert.deepEqual(await readJson({headers:{'content-type':'application/json'},body}),payload);
  }
});
test('request validation rejects oversized, malformed, or non-object bodies',async()=>{
  const request=body=>({headers:{'content-type':'application/json'},body});
  await assert.rejects(readJson(request({image:'x'.repeat(MAX_REQUEST_BYTES)})),error=>error.status===413);
  const stream=Readable.from(['x'.repeat(MAX_REQUEST_BYTES+1)]);stream.headers={'content-type':'application/json'};
  await assert.rejects(readJson(stream),error=>error.status===413);
  for(const body of ['{','null','[]','true'])await assert.rejects(readJson(request(body)),error=>error.status===400);
  await assert.rejects(readJson({headers:{'content-type':'text/plain'},body:'{}'}),error=>error.status===415);
  assert.equal(submissionFits({image:'x'.repeat(MAX_REQUEST_BYTES)}),false);
  assert.equal(submissionFits({date:'2026-10-03',image:'small'}),true);
});
test('origins permit exact deployment URLs without allowing arbitrary Vercel sites',()=>{
  assert.deepEqual([...allowedOrigins({})],['http://localhost:5173']);
  const origins=allowedOrigins({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_URL:'sketchlet-123.vercel.app',VERCEL_BRANCH_URL:'sketchlet-git-test.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'sketchlet.vercel.app'});
  assert.equal(origins.has('https://sketchlet-123.vercel.app'),true);
  assert.equal(origins.has('https://attacker.vercel.app'),false);
  assert.equal(origins.has('https://sketchlet.vercel.app'),false);
  assert.equal(origins.has('http://localhost:5173'),false);
  assert.equal(allowedOrigins({VERCEL:'1',APP_ORIGIN:'https://draw.example.com/'}).has('https://draw.example.com'),true);
});
test('published assets exist and their relative imports remain public',async()=>{
  for(const file of PUBLIC_FILES){
    const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');
    assert.equal(publicFile('/'+file),file);
    if(file.endsWith('.js'))for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){
      const path=new URL(match[1],`https://sketchlet.test/${file}`).pathname;
      assert.ok(publicFile(path),`${file} imports unpublished ${path}`);
    }
  }
  for(const file of ['.env.local','.neon','local-server.mjs','backend/api.mjs','scripts/correct-singing-kite.mjs','package-lock.json'])assert.equal(PUBLIC_FILES.includes(file),false);
});
test('deployment publishes only dist and routes drawing URLs to the app',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'dist');
  assert.ok(config.rewrites.some(rule=>rule.source==='/d/:id' && rule.destination==='/index.html'));
  assert.ok(config.rewrites.some(rule=>rule.source==='/gallery' && rule.destination==='/index.html'));
  assert.equal(publicFile('/gallery'),'index.html');
  assert.equal(publicFile('/gallery/'),'index.html');
  assert.equal(publicFile('/gallery/private'),null);
  assert.ok(config.rewrites.some(rule=>rule.source==='/api/:path*' && rule.destination.startsWith('/api/index?')));
});
