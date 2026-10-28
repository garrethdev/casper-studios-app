import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Walks up from the working directory to the monorepo root. */
export function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && readFileSync(pkg, 'utf8').includes('"name": "leanplate"')) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

/** Loads <root>/.env.local (git-ignored) into process.env for local development only. */
export function loadDevEnv(): void {
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') return;
  const file = join(findRoot(), '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}
