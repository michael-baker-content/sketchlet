import '../backend/env.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Pull Neon environment settings first.');
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
const directory = new URL('../db/', import.meta.url);
const files = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
const statements = [];
for (const file of files) {
  const source = await readFile(new URL(file, directory), 'utf8');
  statements.push(...source.split(';').map(s => s.trim()).filter(Boolean));
}
try {
  await sql.transaction(statements.map(statement => sql.query(statement)));
  console.log('Sketchlet tables are ready.');
} catch {
  console.error('Migration failed. Check the connection and database permissions. No credentials were printed.');
  process.exitCode = 1;
}
