import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Key handling. In production every secret MUST come from the environment and
 * a missing one is a hard startup failure. In development a throwaway set is
 * generated once into .data/ (which is git-ignored) so `npm run dev` just works.
 */
interface DevKeys {
  jwtPrivateKey: string;
  jwtPublicKey: string;
  serviceSecrets: Record<string, string>;
}

const isProd = () => process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const pem = (v: string) => v.replace(/\\n/g, '\n');

function findRoot(): string {
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

function devKeys(): DevKeys {
  const dir = join(findRoot(), '.data');
  const file = join(dir, 'dev-keys.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as DevKeys;
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keys: DevKeys = {
    jwtPrivateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    jwtPublicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    serviceSecrets: {
      IDENTITY: randomBytes(32).toString('base64url'),
      MEALS: randomBytes(32).toString('base64url'),
      INTELLIGENCE: randomBytes(32).toString('base64url'),
    },
  };
  // Write to a private temp file and rename, so services starting at the same moment never read a half-written file.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(keys, null, 2), { mode: 0o600 });
  if (!existsSync(file)) renameSync(tmp, file);
  return JSON.parse(readFileSync(file, 'utf8')) as DevKeys;
}

export function jwtPublicKey(): string {
  const env = process.env.JWT_PUBLIC_KEY;
  if (env) return pem(env);
  if (isProd()) throw new Error('JWT_PUBLIC_KEY is required in production');
  return devKeys().jwtPublicKey;
}

export function jwtPrivateKey(): string {
  const env = process.env.JWT_PRIVATE_KEY;
  if (env) return pem(env);
  if (isProd()) throw new Error('JWT_PRIVATE_KEY is required in production');
  return devKeys().jwtPrivateKey;
}

/** The shared secret that guards one service (named after the callee: IDENTITY, MEALS, INTELLIGENCE). */
export function serviceSecret(audience: 'identity' | 'meals' | 'intelligence'): string {
  const name = `SERVICE_SECRET_${audience.toUpperCase()}`;
  const env = process.env[name];
  if (env) {
    if (env.length < 32) throw new Error(`${name} must be at least 32 characters`);
    return env;
  }
  if (isProd()) throw new Error(`${name} is required in production`);
  return devKeys().serviceSecrets[audience.toUpperCase()]!;
}
