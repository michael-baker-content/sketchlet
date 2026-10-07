import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPoint, appendPointerSamples } from '../src/pointer-input.js';

test('pointer coordinates follow current canvas position and dimensions', () => {
  const event = { clientX: 110, clientY: 220 };
  assert.deepEqual(canvasPoint(event, { left: 10, top: 20, width: 400, height: 400 }, 1200), [300,600]);
  assert.deepEqual(canvasPoint(event, { left: 60, top: 120, width: 200, height: 200 }, 1200), [300,600]);
  assert.deepEqual(canvasPoint({ clientX: -10, clientY: 500 }, { left: 0, top: 0, width: 200, height: 200 }, 1200), [0,1200]);
});

test('coalesced samples retain order, filtering and event fallback', () => {
  const rect = { left: 0, top: 0, width: 1200, height: 1200 };
  const points = [[0,0]];
  appendPointerSamples(points, { getCoalescedEvents: () => [
    { clientX: .2, clientY: .2 }, { clientX: 5, clientY: 6 },
    { clientX: 5, clientY: 6 }, { clientX: 10, clientY: 20 },
  ] }, rect, 1200);
  assert.deepEqual(points, [[0,0],[5,6],[10,20]]);
  appendPointerSamples(points, { clientX: 30, clientY: 40, getCoalescedEvents: () => [] }, rect, 1200);
  appendPointerSamples(points, { clientX: 50, clientY: 60 }, rect, 1200);
  assert.deepEqual(points.slice(-2), [[30,40],[50,60]]);
});
