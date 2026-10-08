import test from 'node:test';
import assert from 'node:assert/strict';
import { counted, drawingCaption } from '../src/text-format.js';

test('count labels handle singular values and preserve formatted averages', () => {
  for (const word of ['drawing', 'rating', 'day', 'star']) {
    assert.equal(counted(0, word), `0 ${word}s`);
    assert.equal(counted(1, word), `1 ${word}`);
    assert.equal(counted(2, word), `2 ${word}s`);
  }
  assert.equal(counted('1.0', 'star'), '1.0 star');
  assert.equal(counted('1.5', 'star'), '1.5 stars');
});

test('drawing captions credit the creator with an anonymous fallback', () => {
  assert.equal(drawingCaption('Michael', 'singing kite'), 'Michael drew a singing kite');
  assert.equal(drawingCaption('', 'singing kite'), 'someone drew a singing kite');
  assert.equal(drawingCaption(null, 'singing kite'), 'someone drew a singing kite');
});
