import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrokeCache, createActivePencilCache, watchCanvasRecovery } from '../src/canvas-cache.js';
import { History } from '../src/model.js';

test('active pencil reuses its base and rebuilds after invalidation or history changes', () => {
  let copies = 0, count = 0;
  const cache = createActivePencilCache({ clearRect() {}, drawImage() { copies++; } }, 1200,
    (_, stroke, samples) => { count += [...samples].length; });
  const stroke = { tool: 'brush', shape: 'circle', style: 'pencil', seed: 1, size: 5, points: [[0,0]] };
  const base = [];
  cache.sync(stroke, base, {});
  stroke.points.push([30,0]); cache.sync(stroke, base, {});
  assert.equal(count, 41);
  cache.sync(stroke, base, {});
  assert.equal(count, 41);
  assert.equal(copies, 1);
  cache.invalidate(); cache.sync(stroke, base, {});
  assert.equal(count, 82);
  cache.sync(stroke, [], {});
  assert.equal(copies, 3);
  for (const unsupported of [null, { ...stroke, tool: 'eraser' }, { ...stroke, style: 'marker' }, { ...stroke, seed: undefined }]) {
    assert.equal(cache.sync(unsupported, base, {}), false);
  }
});

function fixture() {
  const pixels = new Set(), painted = [];
  let clears = 0;
  const cache = createStrokeCache({ clearRect() { pixels.clear(); clears++; } }, 1200, (_, stroke) => {
    painted.push(stroke);
    if (stroke.erase) pixels.delete(stroke.mark); else pixels.add(stroke.mark);
  });
  return { cache, pixels, painted, get clears() { return clears; } };
}

test('adding shading keeps completed pixels and renders only the new stroke', () => {
  const f = fixture(), texture = { mark: 'texture' }, shading = { mark: 'shading' };
  const first = [texture], second = [...first, shading];
  f.cache.sync(first);
  f.cache.sync(first);
  f.cache.sync(second);
  assert.deepEqual(f.painted, [texture, shading]);
  assert.equal(f.clears, 1);
  assert.deepEqual([...f.pixels], ['texture', 'shading']);
});

test('erase, undo, redo, clear and a replacement history branch produce correct pixels', () => {
  const f = fixture(), base = { mark: 'base' }, erase = { mark: 'base', erase: true };
  const history = new History({ background: '#FFFFFF', strokes: [base] });
  const sync = () => f.cache.sync(history.document.strokes);
  sync();
  history.commit({ ...history.document, strokes: [base, erase] }); sync();
  assert.equal(f.pixels.size, 0);
  history.undo(); sync();
  assert.deepEqual([...f.pixels], ['base']);
  history.redo(); sync();
  assert.equal(f.pixels.size, 0);
  history.undo(); sync();
  const shade = { mark: 'shade' };
  history.commit({ ...history.document, strokes: [base, shade] }); sync();
  assert.deepEqual([...f.pixels], ['base', 'shade']);
  history.commit({ ...history.document, strokes: [] }); sync();
  assert.equal(f.pixels.size, 0);
  history.undo(); sync();
  assert.deepEqual([...f.pixels], ['base', 'shade']);
  f.cache.sync([{ mark: 'different draft' }]);
  assert.deepEqual([...f.pixels], ['different draft']);
});

test('invalidation rebuilds the same document and failed drawing never leaves a valid cache', () => {
  let fail = false, clears = 0;
  const painted = [];
  const cache = createStrokeCache({ clearRect() { clears++; } }, 1200, (_, stroke) => {
    if (fail) throw new Error('interrupted');
    painted.push(stroke);
  });
  const first = [{}], second = [...first, {}];
  cache.sync(first);
  cache.invalidate(); cache.sync(first);
  assert.equal(clears, 2);
  fail = true;
  assert.throws(() => cache.sync(second), /interrupted/);
  fail = false; cache.sync(second);
  assert.equal(clears, 3);
  assert.deepEqual(painted, [first[0], first[0], ...second]);
});

test('buffer recovery waits for all canvases then reconstructs unchanged stroke data', () => {
  const f = fixture(), strokes = [{ mark: 'texture' }, { mark: 'shade' }];
  const contexts = Array.from({ length: 3 }, () => ({ canvas: new EventTarget(), lost: false,
    isContextLost() { return this.lost; } }));
  let redraws = 0;
  const available = watchCanvasRecovery(contexts, () => f.cache.invalidate(), () => {
    redraws++; f.cache.sync(strokes);
  });
  f.cache.sync(strokes); f.pixels.clear();
  for (const context of contexts.slice(0, 2)) {
    context.lost = true; context.canvas.dispatchEvent(new Event('contextlost'));
  }
  assert.equal(available(), false);
  contexts[0].lost = false; contexts[0].canvas.dispatchEvent(new Event('contextrestored'));
  assert.equal(redraws, 0);
  contexts[1].lost = false; contexts[1].canvas.dispatchEvent(new Event('contextrestored'));
  assert.equal(redraws, 1);
  assert.equal(available(), true);
  assert.deepEqual([...f.pixels], ['texture', 'shade']);
  // Also detect loss before its asynchronous event has been delivered.
  contexts[2].lost = true;
  assert.equal(available(), false);
  contexts[2].lost = false;
  f.pixels.clear(); f.cache.sync(strokes);
  assert.deepEqual([...f.pixels], ['texture', 'shade']);
});
