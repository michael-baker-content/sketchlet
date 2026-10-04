import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayName } from '../backend/profile.mjs';

test('display names normalize whitespace and unicode, and can be cleared', () => {
  assert.equal(normalizeDisplayName('  singing   kite  '), 'singing kite');
  assert.equal(normalizeDisplayName('Jose\u0301'), 'José');
  assert.equal(normalizeDisplayName('   '), '');
  assert.equal(normalizeDisplayName('a'.repeat(32)), 'a'.repeat(32));
});

test('display names reject non-text, oversized names and hidden controls', () => {
  for (const value of [null, {}, 123, 'a'.repeat(33), 'name\u0000', 'name\u202E']) {
    assert.throws(() => normalizeDisplayName(value), error => error.status === 400);
  }
});
