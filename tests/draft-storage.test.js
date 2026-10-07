import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDrawingDraft } from '../src/draft-storage.js';

test('daily draft detection includes background-only edits but excludes empty, old and invalid drafts', () => {
  const day = '2026-10-07';
  const record = { day, document: { background: '#FFFFFF', strokes: [] } };
  assert.equal(hasDrawingDraft(record, day), false);
  assert.equal(hasDrawingDraft(null, day), false);
  record.document.background = '#FFF3D2';
  assert.equal(hasDrawingDraft(record, day), true);
  assert.equal(hasDrawingDraft(record, '2026-10-08'), false);
  record.document.background = 'invalid';
  assert.equal(hasDrawingDraft(record, day), false);
});
