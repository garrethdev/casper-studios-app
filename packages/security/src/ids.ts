import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const newId = () => randomUUID();
/** URL-safe random token with `bytes` of entropy (default 256 bits). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
