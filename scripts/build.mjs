import { mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { PUBLIC_FILES } from '../backend/public-files.mjs';
import { renderPageShell } from '../backend/page-shell.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Clean only this project's fixed build output, never a configurable path.
if (dirname(output) !== resolve(root)) throw new Error('Invalid output directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of PUBLIC_FILES) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  const html = renderPageShell(file);
  if (html !== null) await writeFile(target, html);
  else await copyFile(resolve(root, file), target);
}
console.log(`Built ${PUBLIC_FILES.length} public files in dist. No environment files or server code were copied.`);
