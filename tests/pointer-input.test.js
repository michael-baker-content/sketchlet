import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPoint, appendPointerSamples } from '../src/pointer-input.js';
import { validDocument, restoreDraft } from '../src/model.js';

test('extended strokes retain outside coordinates across sampling and draft restoration', () => {
  const rect = { left:10,top:10,width:300,height:300 };
  const points = [canvasPoint({clientX:5,clientY:160},rect,1200,true)];
  assert.deepEqual(points,[[-20,600]]);
  appendPointerSamples(points,{clientX:320,clientY:160},rect,1200,true);
  const [x,y] = points.at(-1);
  assert.ok(Math.abs(x - 1240) < 1e-9, 'outside x coordinate stays accurate to a fraction of a pixel');
  assert.ok(Math.abs(y - 600) < 1e-9, 'outside y coordinate stays accurate to a fraction of a pixel');
  const document = {background:'#FFFFFF',strokes:[{tool:'brush',style:'line',shape:'circle',size:14,color:'#343044',extended:true,points}]};
  assert.equal(validDocument(document),true);
  assert.deepEqual(restoreDraft({day:'2026-10-09',document},'2026-10-09'),document);
  delete document.strokes[0].extended;
  assert.equal(validDocument(document),false);
});

test('finger targets sit 24 screen pixels above contact; pen and mouse stay direct', () => {
  const rect = { left:0, top:0, width:300, height:300 };
  for (const pointerType of ['mouse','pen']) assert.deepEqual(canvasPoint({ clientX:150, clientY:300, pointerType },rect,1200), [600,1200]);
  assert.deepEqual(canvasPoint({ clientX:150, clientY:300, pointerType:'touch' },rect,1200), [600,1104]);
  assert.deepEqual(canvasPoint({ clientX:150, clientY:324, pointerType:'touch' },rect,1200), [600,1200]);
  const points = [[600,1000]];
  appendPointerSamples(points, { pointerType:'touch', getCoalescedEvents:() => [{clientX:150,clientY:300}] },rect,1200);
  assert.deepEqual(points.at(-1),[600,1104]);
});

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
