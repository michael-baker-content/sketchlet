// Read-only recovery inventory. Never prints credentials, tokens, or owner hashes.
import '../backend/env.mjs';
import { neon } from '@neondatabase/serverless';

const names = process.argv.slice(2).map(name => name.trim().toLowerCase()).filter(Boolean);
if (!names.length) {
  console.error('Provide one or more profile display names to inspect. No changes will be made.');
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing.');
  process.exitCode = 1;
} else {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const accounts = await sql`SELECT a.id,a.clerk_instance,p.display_name,
      (SELECT count(*)::int FROM sketchlet_drawings d WHERE d.owner_hash=a.owner_hash) AS drawing_count
      FROM sketchlet_accounts a LEFT JOIN sketchlet_profiles p ON p.owner_hash=a.owner_hash
      WHERE lower(p.display_name)=ANY(${names}::text[]) ORDER BY a.created_at`;
    if (!accounts.length) console.log('No matching signed-in accounts in this database. No changes made.');
    for (const account of accounts) {
      const drawings = await sql`SELECT d.id,d.prompt_day::text AS date,p.title AS prompt,
        EXISTS(SELECT 1 FROM sketchlet_public_drawings visible WHERE visible.id=d.id) AS public
        FROM sketchlet_drawings d JOIN sketchlet_accounts a ON a.owner_hash=d.owner_hash
        JOIN sketchlet_prompts p ON p.day=d.prompt_day WHERE a.id=${account.id}
        ORDER BY d.prompt_day DESC,d.id`;
      console.log(JSON.stringify({...account,drawings},null,2));
    }
    console.log('Read-only inspection complete. Display names are not unique; confirm the account IDs and drawing lists before any transfer.');
  } catch {
    console.error('Could not inspect accounts. Check the database connection and migrations. No changes were made.');
    process.exitCode = 1;
  }
}
