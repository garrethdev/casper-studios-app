import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

/**
 * Service-to-service authentication. Every internal call carries a signed token
 * that names the caller (iss) and the callee (aud) and lives for 60 seconds.
 * A callee only accepts tokens addressed to it, from callers on its allow-list.
 */
export interface ServiceClaims {
  issuer: string;
  userId?: string;
  clientIpHash?: string;
}

const key = (secret: string) => {
  if (secret.length < 32) throw new Error('service secret too short');
  return new TextEncoder().encode(secret);
};

export async function signServiceToken(opts: {
  secret: string;
  issuer: string;
  audience: string;
  userId?: string;
  clientIpHash?: string;
  ttlSeconds?: number;
}) {
  const claims: Record<string, string> = {};
  if (opts.userId) claims.uid = opts.userId;
  if (opts.clientIpHash) claims.cip = opts.clientIpHash;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds ?? 60}s`)
    .setJti(randomUUID())
    .sign(key(opts.secret));
}

export async function verifyServiceToken(
  token: string,
  opts: { secret: string; audience: string; allowedIssuers: string[] },
): Promise<ServiceClaims> {
  const { payload } = await jwtVerify(token, key(opts.secret), {
    algorithms: ['HS256'],
    audience: opts.audience,
    clockTolerance: 5,
  });
  if (!payload.iss || !opts.allowedIssuers.includes(payload.iss)) throw new Error('caller not allowed');
  return {
    issuer: payload.iss,
    userId: typeof payload.uid === 'string' ? payload.uid : undefined,
    clientIpHash: typeof payload.cip === 'string' ? payload.cip : undefined,
  };
}
