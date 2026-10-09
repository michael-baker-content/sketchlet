import { neon } from '@neondatabase/serverless';

// Public, read-only queries: no visitor cookie, votes, or editor initialization.
const sql = neon(process.env.DATABASE_URL);
export async function socialDrawing(id) {
  const [row] = await sql`SELECT d.id,d.prompt_day::text AS date,p.title AS prompt,
    profile.display_name AS name
    FROM sketchlet_public_drawings d JOIN sketchlet_prompts p ON p.day=d.prompt_day
    LEFT JOIN sketchlet_profiles profile ON profile.owner_hash=d.owner_hash WHERE d.id=${id}`;
  return row || null;
}
export async function socialPrompt(date) {
  const [row] = await sql`SELECT p.day::text AS date,p.title AS prompt,
    (SELECT count(*)::int FROM sketchlet_public_drawings d WHERE d.prompt_day=p.day) AS count
    FROM sketchlet_prompts p WHERE p.day=${date}::date`;
  return row || null;
}
