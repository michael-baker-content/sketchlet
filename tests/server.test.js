import test from 'node:test';
import assert from 'node:assert/strict';
import { publicFile } from '../backend/public-files.mjs';
import { easternDate, promptForDate } from '../src/prompts.js';
test('server denies credentials, source internals, and traversal',()=>{
  for(const path of ['/.env.local','/.env','/.neon','/.git/config','/server.mjs','/backend/api.mjs','/package-lock.json','/../.env.local','/src/../../.env.local']) assert.equal(publicFile(path),null,path);
  assert.equal(publicFile('/'),'index.html');
  assert.equal(publicFile('/src/gallery.js'),'src/gallery.js');
  assert.equal(publicFile('/d/12345678-1234-1234-1234-123456789abc'),'index.html');
});
test('prompt date changes at Eastern midnight including daylight saving',()=>{
  assert.equal(easternDate(new Date('2026-10-03T03:59:59Z')),'2026-10-02');
  assert.equal(easternDate(new Date('2026-10-03T04:00:00Z')),'2026-10-03');
  assert.equal(easternDate(new Date('2026-12-03T04:59:59Z')),'2026-12-02');
  assert.equal(easternDate(new Date('2026-12-03T05:00:00Z')),'2026-12-03');
  assert.equal(promptForDate('2026-10-02'),'singing kite');
});
