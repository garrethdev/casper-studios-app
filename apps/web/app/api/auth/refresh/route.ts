import { AppError } from '@leanplate/security';
import { cookieNames, clearedCookies, isProduction, sessionCookies } from '@/lib/cookies';
import { api, noContent, ok } from '@/lib/server/bff';
import { limits } from '@/lib/server/limits';
import { refreshShared } from '@/lib/server/refresh';

export const dynamic = 'force-dynamic';

/**
 * The refresh cookie is scoped to /api/auth, so this is the one endpoint the browser can use to renew
 * an expired access token. Concurrent calls with the same cookie share one rotation.
 */
export const POST = api({ limit: { scope: 'refresh', limiter: limits.refresh } }, async ({ req, ipHash }) => {
  const prod = isProduction();
  const rt = req.cookies.get(cookieNames(prod).refresh)?.value;
  // ?soft=1 is the landing page's quiet "am I still signed in?" probe: a 200 with refreshed:false instead of a 401,
  // so ordinary visitors do not get an error line in their console.
  const soft = req.nextUrl.searchParams.get('soft') === '1';
  if (!rt) {
    if (soft) return ok({ refreshed: false });
    throw new AppError(401, 'unauthorized', 'Please sign in again');
  }
  try {
    const pair = await refreshShared(rt, ipHash);
    return { ...(soft ? ok({ refreshed: true }) : noContent()), cookies: sessionCookies(pair, prod) };
  } catch (e) {
    if (e instanceof AppError && e.status === 401) {
      if (soft) return { ...ok({ refreshed: false }), cookies: clearedCookies(prod) };
      return { status: 401, json: { error: { code: 'unauthorized', message: 'Please sign in again' } }, cookies: clearedCookies(prod) };
    }
    throw e;
  }
});
