#!/usr/bin/env node
/**
 * Bundles one service into a self-contained Vercel project folder:
 *   dist/<service>/api/index.mjs   the whole service as one Node function
 *   dist/<service>/vercel.json     routes every path to that function
 *   dist/<service>/package.json    only the native packages that cannot be bundled
 *
 * Usage: node scripts/bundle.mjs identity|meals|intelligence
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = process.argv[2];
if (!['identity', 'meals', 'intelligence'].includes(service ?? '')) {
  console.error('usage: node scripts/bundle.mjs identity|meals|intelligence');
  process.exit(1);
}

const out = join(root, 'dist', service);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'api'), { recursive: true });

// Native or large packages stay external and are installed by Vercel from the generated package.json.
const external = { sharp: '^0.35.5' };

const entry = `
import { buildApp } from ${JSON.stringify(join(root, 'services', service, 'src', 'app.ts'))};
let app;
const ready = () => (app ??= buildApp());
export default {
  async fetch(request) {
    return (await ready()).fetch(request);
  },
};
`;

await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'entry.ts', loader: 'ts' },
  outfile: join(out, 'api', 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  external: [...Object.keys(external), '@electric-sql/pglite'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});

const needsSharp = service === 'intelligence';
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: `leanplate-${service}`, private: true, type: 'module', engines: { node: '22.x' }, dependencies: needsSharp ? external : {} }, null, 2));
writeFileSync(join(out, 'vercel.json'), JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/api' }], functions: { 'api/index.mjs': { maxDuration: needsSharp ? 60 : 30 } } }, null, 2));
console.log(`built dist/${service}`);
