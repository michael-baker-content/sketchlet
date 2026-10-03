// One-time correction of the explicitly identified draft-rollover submission.
// Safe to rerun; never deletes a drawing or object, and never replaces an entry.
import '../backend/env.mjs';
import { neon } from '@neondatabase/serverless';

const id = '99b35c57-043a-43f6-87c1-4c94f33ea54b';
const from = '2026-10-03';
const to = '2026-10-02';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
const sql = neon(process.env.DATABASE_URL);
try {
  const [, moved, records] = await sql.transaction([
    sql`INSERT INTO sketchlet_prompts(day,title) VALUES (${to},'singing kite') ON CONFLICT(day) DO NOTHING`,
    sql`UPDATE sketchlet_drawings AS drawing SET prompt_day=${to}::date
      WHERE drawing.id=${id}::uuid AND drawing.prompt_day=${from}::date
      AND EXISTS(SELECT 1 FROM sketchlet_prompts WHERE day=${to}::date AND title='singing kite')
      AND EXISTS(SELECT 1 FROM sketchlet_prompts WHERE day=drawing.prompt_day AND title='jumping house')
      AND NOT EXISTS(SELECT 1 FROM sketchlet_drawings other WHERE other.owner_hash=drawing.owner_hash AND other.prompt_day=${to}::date)
      RETURNING id`,
    sql`SELECT d.id,d.prompt_day::text AS day,p.title,
      (SELECT count(*)::int FROM sketchlet_drawings other WHERE other.owner_hash=d.owner_hash AND other.prompt_day=${from}::date) AS today_entries
      FROM sketchlet_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day WHERE d.id=${id}::uuid`
  ]);
  const record = records[0];
  if (record?.day === to && record.title === 'singing kite') {
    console.log(moved.length ? 'Drawing reassigned to singing kite (2026-10-02).' : 'Drawing is already assigned to singing kite (2026-10-02).');
    console.log('Image, drawing URL, ownership, and ratings are preserved.');
    console.log(record.today_entries === 0 ? 'Today’s submission slot is free. Refresh Sketchlet to draw.' : 'A separate submission still occupies today’s slot; it was not changed.');
  } else {
    console.error('No drawing was moved: it was not found, its prompt changed, or an entry already exists for October 2.');
    process.exitCode = 1;
  }
} catch {
  console.error('Correction could not complete. No images were deleted. Check the Neon connection and retry; this script is safe to rerun.');
  process.exitCode = 1;
}
