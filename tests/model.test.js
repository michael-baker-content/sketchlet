import test from 'node:test';
import assert from 'node:assert/strict';
import { History, createDocument, validDocument, draftKey, restoreDraft } from '../src/model.js';

test('clear and background changes can be undone without losing strokes', () => {
  const h = new History();
  const stroke = { tool: 'brush', color: '#343044', size: 14, points: [[10, 10], [30, 30]] };
  h.commit({ ...h.document, strokes: [stroke] });
  h.commit({ ...h.document, background: '#B39ADB' });
  h.commit({ ...h.document, strokes: [] });
  h.undo(); assert.equal(h.document.strokes[0], stroke); assert.equal(h.document.background, '#B39ADB');
  h.undo(); assert.equal(h.document.background, '#FFFFFF'); assert.equal(h.document.strokes[0], stroke);
  h.redo(); assert.equal(h.document.background, '#B39ADB');
});
test('a new edit after undo discards the redo branch', () => {
  const h = new History(); h.commit({ ...h.document, background: '#B39ADB' }); h.undo();
  h.commit({ ...h.document, background: '#EAA3B7' }); assert.equal(h.redo(), false);
});
test('saved drafts reject corrupt geometry and unsupported tools', () => {
  assert.equal(validDocument(createDocument()), true);
  assert.equal(validDocument({ background: '#FFFFFF', strokes: [{ tool: 'brush', color: '#343044', size: 14, points: [[NaN, 4]] }] }), false);
  assert.equal(validDocument({ background: '#FFFFFF', strokes: [{ tool: 'other', color: '#343044', size: 14, points: [[4, 4]] }] }), false);
});
test('free draw storage stays isolated from daily drafts', () => {
  const document = {background:'#B39ADB',strokes:[]};
  assert.equal(draftKey('free-draw'),'free-draw-v1');
  assert.notEqual(draftKey('free-draw'),draftKey('2026-10-12'));
  assert.deepEqual(restoreDraft({day:'free-draw',document},'free-draw'),document);
  assert.deepEqual(restoreDraft({day:'free-draw',document},'2026-10-12'),createDocument());
  assert.deepEqual(restoreDraft({day:'2026-10-12',document},'free-draw'),createDocument());
});

test('image seeds must be bounded PNG data and the first stroke', () => {
  const image = {tool:'image',image:'data:image/png;base64,AAAA'};
  assert.equal(validDocument({background:'#FFFFFF',strokes:[image]}),true);
  assert.equal(validDocument({background:'#FFFFFF',strokes:[image,image]}),false);
  assert.equal(validDocument({background:'#FFFFFF',strokes:[{...image,image:'https://example.com/image.png'}]}),false);
});

test('daily drafts restore only for their original prompt date', () => {
  const document = { background: '#B39ADB', strokes: [{ tool: 'brush', color: '#343044', size: 14, points: [[10,10]] }] };
  const saved = { day: '2026-10-02', document };
  assert.deepEqual(restoreDraft(saved, '2026-10-02'), document);
  assert.deepEqual(restoreDraft(saved, '2026-10-03'), createDocument());
  assert.notEqual(draftKey('2026-10-02'), draftKey('2026-10-03'));
  assert.deepEqual(restoreDraft(document, '2026-10-03'), createDocument(), 'undated legacy drafts must not become today’s entry');
  assert.deepEqual(restoreDraft(undefined, '2026-10-03'), createDocument());
});
