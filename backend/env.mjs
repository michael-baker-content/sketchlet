import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
for (const path of ['.env.local', '.env']) if (existsSync(path)) loadEnvFile(path);
