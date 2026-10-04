import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayName, profileDrawingCursor } from '../backend/profile.mjs';

test('profile drawing pagination accepts actual date cursors only', () => {
  assert.equal(profileDrawingCursor(null), null);
  assert.equal(profileDrawingCursor('2026-10-04'), '2026-10-04');
  assert.equal(profileDrawingCursor('2024-02-29'), '2024-02-29');
  for (const value of ['', '2026-02-29', '2026-04-31', '2026-13-01', '2026-10-04 OR true', 'yesterday']) {
    assert.throws(() => profileDrawingCursor(value), error => error.status === 400);
  }
});

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
