import { RegisterBody, TokenPair, UserDto } from '@leanplate/contracts';
import { isProduction, sessionCookies } from '@/lib/cookies';
import { api, ok } from '@/lib/server/bff';
import { limits } from '@/lib/server/limits';
import { expectShape, identity } from '@/lib/server/upstream';

export const dynamic = 'force-dynamic';

/** Creates the account, then signs in with the same credentials so the new user lands inside the app. */
export const POST = api({ limit: { scope: 'register', limiter: limits.register } }, async ({ body, ipHash }) => {
  const input = await body(RegisterBody);
  const created = await identity<{ user: unknown }>('/v1/register', { method: 'POST', body: input, ipHash });
  const user = expectShape(UserDto, created?.user, 'identity');
  const pair = expectShape(TokenPair, await identity('/v1/login', { method: 'POST', body: input, ipHash }), 'identity');
  return { ...ok({ user }, 201), cookies: sessionCookies(pair, isProduction()) };
});
