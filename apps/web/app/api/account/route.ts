import { clearedCookies, isProduction } from '@/lib/cookies';
import { noContent, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

/** Meal data first, then the identity account, then the browser's cookies. Safe to retry if a step fails. */
export const DELETE = withUser({}, async (c) => {
  await c.meals('/v1/data', { method: 'DELETE' });
  await c.identity('/v1/account', { method: 'DELETE' });
  return { ...noContent(), cookies: clearedCookies(isProduction()) };
});
