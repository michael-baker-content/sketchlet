import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { drawingPath, drawingIdFromPath } from '../src/drawing-links.js';
import { publicFile } from '../backend/public-files.mjs';

test('readable drawing links round-trip the full ID without a database mapping', () => {
  for (let i = 0; i < 100; i++) {
    const id = randomUUID(), path = drawingPath(id, 'Singing Kite');
    assert.match(path, /^\/d\/singing-kite~[A-Za-z0-9_-]{22}$/);
    assert.equal(drawingIdFromPath(path), id);
    assert.equal(drawingIdFromPath(path + '/'), id);
    assert.equal(publicFile(path), 'gallery.html');
  }
});

test('existing UUID links still resolve and prompt labels do not determine identity', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  assert.equal(drawingIdFromPath('/d/' + id), id);
  assert.equal(publicFile('/d/' + id), 'gallery.html');
  const path = drawingPath(id, 'singing kite');
  assert.equal(drawingIdFromPath(path.replace('singing-kite', 'another-prompt')), id);
  assert.equal(drawingIdFromPath(drawingPath(id, '✨')), id);
});

test('invalid drawing paths and noncanonical encoded IDs are rejected', () => {
  for (const path of ['/d/nope', '/d/' + '-'.repeat(36), '/d/kite~' + 'a'.repeat(21), '/d/kite~' + 'a'.repeat(23), '/d/kite~' + 'A'.repeat(21) + 'B', '/d/../secret', '/gallery']) {
    assert.equal(drawingIdFromPath(path), null, path);
  }
  assert.throws(() => drawingPath('not-an-id', 'kite'), /Invalid drawing ID/);
});
