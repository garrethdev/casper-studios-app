import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// OWASP-recommended scrypt cost: N=2^15, r=8, p=1. maxmem must exceed 128 * N * r (about 32 MiB).
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const OPTS = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, OPTS);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64!, 'base64');
  const expected = Buffer.from(keyB64!, 'base64');
  const key = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;
/**
 * Burns the same CPU time as a real check so login timing does not reveal
 * whether an account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword('dummy-password-for-timing-equalization');
  await verifyPassword(password, await dummy);
  return false;
}
