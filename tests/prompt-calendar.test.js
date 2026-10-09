import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_START, DAILY_PROMPTS, PROMPT_WEEKS } from '../src/prompt-calendar.js';
import { easternDate, promptForDate } from '../src/prompts.js';
import { drawingCaption } from '../src/text-format.js';

test('curated calendar has 26 complete weeks of distinct shareable prompts', () => {
  assert.equal(PROMPT_WEEKS.length,26);
  assert.ok(PROMPT_WEEKS.every(week=>week.length===7));
  assert.equal(new Set(DAILY_PROMPTS).size,182);
  for (const prompt of DAILY_PROMPTS) {
    assert.equal(drawingCaption('Michael',prompt),`Michael drew ${prompt}`);
    assert.ok(prompt.length<=60);
  }
});
test('calendar starts at Eastern midnight and preserves historical prompts', () => {
  assert.equal(promptForDate('2026-10-02'),'singing kite');
  assert.equal(easternDate(new Date('2026-10-10T03:59:59Z')),'2026-10-09');
  assert.equal(promptForDate(easternDate(new Date('2026-10-10T04:00:00Z'))),DAILY_PROMPTS[0]);
  const start=Date.parse(CALENDAR_START+'T12:00:00Z');
  for(let i=0;i<182;i++)assert.equal(promptForDate(new Date(start+i*86400000).toISOString().slice(0,10)),DAILY_PROMPTS[i]);
  assert.equal(promptForDate(new Date(start+182*86400000).toISOString().slice(0,10)),DAILY_PROMPTS[0]);
  assert.equal(drawingCaption('Michael','singing kite'),'Michael drew a singing kite');
});
