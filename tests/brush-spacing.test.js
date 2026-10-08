import test from 'node:test';
import assert from 'node:assert/strict';
import { strokeSpacing } from '../src/brushes.js';

test('shared spacing preserves existing brushes, spray versions and eraser behavior', () => {
  for (const size of [5,14,32]) {
    const regular = Math.max(.75, size * .12);
    for (const style of ['brush','pencil','marker','dashed','line']) {
      assert.equal(strokeSpacing({ tool:'brush', style, size }), regular);
    }
    assert.equal(strokeSpacing({ tool:'brush', style:'dotted', size }), size * 1.8);
    for (const sprayVersion of [undefined,2,3,4,5]) {
      assert.equal(strokeSpacing({ tool:'brush', style:'spray', size, sprayVersion }), Math.max(1, size * (sprayVersion >= 3 ? .45 : .3)));
      assert.equal(strokeSpacing({ tool:'eraser', style:'spray', size, sprayVersion }), regular);
    }
  }
});
