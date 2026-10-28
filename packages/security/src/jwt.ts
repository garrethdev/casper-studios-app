import { SignJWT, importPKCS8, importSPKI, jwtVerify, type KeyLike } from 'jose';
import { randomUUID } from 'node:crypto';

const ISSUER = 'leanplate-identity';
const AUDIENCE = 'leanplate';
export const ACCESS_TTL_SECONDS = 600; // short on purpose: a stolen token dies in 10 minutes

const privCache = new Map<string, KeyLike>();
const pubCache = new Map<string, KeyLike>();

async function privateKey(pem: string) {
  let k = privCache.get(pem);
  if (!k) privCache.set(pem, (k = await importPKCS8(pem, 'ES256')));
  return k;
}
async function publicKey(pem: string) {
  let k = pubCache.get(pem);
  if (!k) pubCache.set(pem, (k = await importSPKI(pem, 'ES256')));
  return k;
}

export async function signAccessToken(opts: { privateKeyPem: string; userId: string; sessionId: string; ttlSeconds?: number }) {
  return new SignJWT({ sid: opts.sessionId })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setSubject(opts.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds ?? ACCESS_TTL_SECONDS}s`)
    .setJti(randomUUID())
    .sign(await privateKey(opts.privateKeyPem));
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Pins the algorithm, issuer and audience so a token minted for anything else is refused. */
export async function verifyAccessToken(token: string, publicKeyPem: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, await publicKey(publicKeyPem), {
    algorithms: ['ES256'],
    issuer: ISSUER,
    audience: AUDIENCE,
    clockTolerance: 5,
  });
  if (!payload.sub || typeof payload.sid !== 'string') throw new Error('malformed claims');
  return { userId: payload.sub, sessionId: payload.sid };
}
