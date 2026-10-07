import test from 'node:test';
import assert from 'node:assert/strict';
import { fillRuns, validFillRuns } from '../src/fill.js';
import { validDocument, restoreDraft, History } from '../src/model.js';

function image(rows) {
  return { width: rows[0].length, height: rows.length,
    data: Uint8ClampedArray.from(rows.flatMap(row => [...row].flatMap(c => c === '#' ? [0,0,0,255] : [255,255,255,255]))) };
}
test('fill respects connected boundaries, includes openings and clamps edge taps', () => {
  const closed = image(['.....','.###.','.#.#.','.###.','.....']);
  assert.deepEqual(fillRuns(closed,2,2,'#CE4949'), [2,2,1]);
  const open = image(['.....','.###.','.#...','.###.','.....']);
  const runs = fillRuns(open,2,2,'#CE4949');
  assert.deepEqual(runs.slice(0,3), [0,0,5]);
  assert.deepEqual(fillRuns(open,5,5,'#CE4949'), runs);
  assert.deepEqual(fillRuns(open,2,2,'#FFFFFF'), []);
});
test('fill tolerance accepts nearby edge colors without crossing a contrasting boundary', () => {
  const pixels = { width: 4, height: 1, data: Uint8ClampedArray.from([255,255,255,255,240,240,240,255,0,0,0,255,255,255,255,255]) };
  assert.deepEqual(fillRuns(pixels,0,0,'#CE4949'), [0,0,2]);
});
test('fill and line actions survive draft restoration and one-step undo', () => {
  const fill = { tool: 'fill', color: '#CE4949', runs: [0,0,1200,1,0,1200] };
  const line = { tool: 'brush', style: 'line', shape: 'square', size: 14, color: '#343044', points: [[0,0],[1200,1200]] };
  const doc = { background: '#FFFFFF', strokes: [line,fill] };
  assert.equal(validDocument(doc), true);
  assert.deepEqual(restoreDraft(JSON.parse(JSON.stringify({ day:'2026-10-07', document:doc })), '2026-10-07'), doc);
  const history = new History({ ...doc, strokes: [line] });
  history.commit(doc); history.undo(); assert.deepEqual(history.document.strokes,[line]);
  history.redo(); assert.deepEqual(history.document,doc);
  for (const runs of [[0,-1,2],[1200,0,1],[0,1199,2],[0,0,2,0,1,2],[0,0,0],[0,0],[]]) assert.equal(validFillRuns(runs,1200), false);
  assert.equal(validDocument({ ...doc, strokes: [{ ...line, points: [[0,0],[1,1],[2,2]] }] }), false);
});
