import { createMiddleware } from 'hono/factory';
import { AppError } from './errors';
import { verifyAccessToken } from './jwt';
import { verifyServiceToken, type ServiceClaims } from './service-token';

export type AuthEnv = {
  Variables: { caller: ServiceClaims; userId: string; sessionId: string };
};

/** Only a known internal caller holding the right token may reach this service. */
export function serviceAuth(opts: { secret: () => string; audience: string; allowedIssuers: string[] }) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = c.req.header('x-service-token');
    if (!token) throw new AppError(401, 'unauthorized', 'Missing service credentials');
    try {
      c.set('caller', await verifyServiceToken(token, { secret: opts.secret(), audience: opts.audience, allowedIssuers: opts.allowedIssuers }));
    } catch {
      throw new AppError(401, 'unauthorized', 'Invalid service credentials');
    }
    await next();
  });
}

/** Verifies the end user's access token (ES256, pinned issuer and audience). */
export function userAuth(opts: { publicKey: () => string }) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const m = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header);
    if (!m) throw new AppError(401, 'unauthorized', 'Sign in required');
    try {
      const claims = await verifyAccessToken(m[1]!, opts.publicKey());
      c.set('userId', claims.userId);
      c.set('sessionId', claims.sessionId);
    } catch {
      throw new AppError(401, 'unauthorized', 'Your session has expired');
    }
    await next();
  });
}
