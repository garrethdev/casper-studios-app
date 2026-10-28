import { LoginBody, TokenPair } from '@leanplate/contracts';
import { AppError } from '@leanplate/security';
import { isProduction, sessionCookies } from '@/lib/cookies';
import { api, ok } from '@/lib/server/bff';
import { limits } from '@/lib/server/limits';
import { expectShape, identity } from '@/lib/server/upstream';

export const dynamic = 'force-dynamic';

export const POST = api({ limit: { scope: 'login', limiter: limits.login } }, async ({ body, ipHash }) => {
  const input = await body(LoginBody);
  try {
    const pair = expectShape(TokenPair, await identity('/v1/login', { method: 'POST', body: input, ipHash }), 'identity');
    return { ...ok({ ok: true }), cookies: sessionCookies(pair, isProduction()) };
  } catch (e) {
    // Whatever identity says about a failed sign-in, the browser only learns "wrong email or password".
    // Lockout (429) and outages (5xx) stay distinct because the person needs to act differently.
    if (e instanceof AppError && (e.status === 400 || e.status === 401 || e.status === 403 || e.status === 404 || e.status === 409 || e.status === 422)) {
      throw new AppError(401, 'invalid_credentials', 'That email and password do not match.');
    }
    throw e;
  }
});
