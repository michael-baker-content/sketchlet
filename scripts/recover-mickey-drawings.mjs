// Targeted, repeat-safe recovery authorized by the site owner. Not an account merger.
import '../backend/env.mjs';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (process.argv.slice(2).join(' ') !== '--apply') {
  console.log('Moves only Snoopy (Oct. 12) and singing kite (Oct. 2) from the identified development account to Michael Baker’s production account.');
  console.log('Run with --apply to perform the transfer. Conflicts or changed ownership abort the entire transaction.');
} else if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing.'); process.exitCode=1;
} else {
  try {
    const sql=neon(process.env.DATABASE_URL);
    const recovery=await readFile(new URL('./recovery/mickey-drawings.sql',import.meta.url),'utf8');
    await sql.transaction([sql.query(recovery)]);
    console.log('Both drawings now belong to Michael Baker’s production account (or were already transferred).');
    console.log('Drawing links, image files, and other people’s ratings are preserved. Any self-ratings by either account on these two drawings were removed.');
    console.log('Refresh your profile at https://sketchlet.app/profile. The older kite drawing will be in your full gallery.');
  } catch (error) {
    const message=typeof error.message==='string' && error.message.startsWith('Recovery stopped:') ? error.message : 'Recovery could not complete. Check the database connection and migrations, then retry. This command is safe to rerun.';
    console.error(message); process.exitCode=1;
  }
}
