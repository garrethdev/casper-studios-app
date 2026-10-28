import { isProduction, cookieNames, clearedCookies } from '@/lib/cookies';
import { api, noContent } from '@/lib/server/bff';
import { identity } from '@/lib/server/upstream';

export const dynamic = 'force-dynamic';

/** Revokes the refresh token's session family (best effort) and always clears both cookies. */
export const POST = api({}, async ({ req, ipHash }) => {
  const prod = isProduction();
  const rt = req.cookies.get(cookieNames(prod).refresh)?.value;
  if (rt) {
    try {
      await identity('/v1/logout', { method: 'POST', body: { refreshToken: rt }, ipHash });
    } catch {
      // The cookies are cleared either way; an expired token has nothing left to revoke.
    }
  }
  return { ...noContent(), cookies: clearedCookies(prod) };
});
