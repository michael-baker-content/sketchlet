import test from 'node:test';
import assert from 'node:assert/strict';
import { validDocument, restoreDraft, validBrushSize } from '../src/model.js';

test('slider sizes and legacy presets survive draft restoration', () => {
  for (const size of [5, 14, 19, 23, 32, 60, 96, 120]) {
    const document = {background:'#FFFFFF', strokes:[{tool:'brush', color:'#343044', size, style:'brush', shape:'circle', points:[[10,10],[20,20]]}]};
    assert.equal(validDocument(document), true);
    assert.deepEqual(restoreDraft({day:'2026-10-26',document},'2026-10-26'),document);
    for (const invalid of [4,121,NaN,Infinity,'19',19.5]) {
      assert.equal(validDocument({...document,strokes:[{...document.strokes[0],size:invalid}]}),false);
    }
  }
});

test('new brush sizes stop at 96 while larger legacy strokes remain valid', () => {
  assert.equal(validBrushSize(96), true);
  assert.equal(validBrushSize(97), false);
  assert.equal(validBrushSize(120), false);
});
