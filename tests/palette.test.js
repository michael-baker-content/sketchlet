import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, BACKGROUND_COLORS, colorEntry, validDocument } from '../src/model.js';

test('background ordering contains every selectable color exactly once', () => {
  assert.equal(COLORS.length,24);
  assert.equal(new Set(BACKGROUND_COLORS.map(entry => entry.value)).size,COLORS.length);
  assert.deepEqual(BACKGROUND_COLORS.map(entry=>entry.value).sort(),COLORS.map(entry=>entry.value).sort());
});
test('retired palette colors still restore in backgrounds, strokes, and fills', () => {
  for (const color of ['#F3D77F','#4B4854','#792D43','#738244','#DC853C','#B69435','#B5B0BC']) {
    assert.ok(colorEntry(color));
    assert.equal(COLORS.some(entry=>entry.value===color),false);
    assert.equal(validDocument({background:color,strokes:[
      {tool:'brush',style:'brush',shape:'circle',size:14,color,points:[[10,10]]},
      {tool:'fill',color,runs:[0,0,1]},
    ]}),true);
  }
});
