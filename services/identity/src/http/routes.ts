import { Hono, type MiddlewareHandler } from 'hono';
import { LoginBody, LogoutBody, RefreshBody, RegisterBody, TokenPair, UserDto } from '@leanplate/contracts';
import { parseBody } from '@leanplate/platform';
import type { AuthEnv } from '@leanplate/security';
import type { UseCases } from '../application';

export interface RouteDeps {
  useCases: UseCases;
  /** Runs on every /v1 route: only the web app, holding the identity service secret, gets through. */
  serviceAuth: MiddlewareHandler<AuthEnv>;
  userAuth: MiddlewareHandler<AuthEnv>;
  registerLimit: MiddlewareHandler;
  loginLimit: MiddlewareHandler;
}

export function identityRoutes({ useCases, serviceAuth, userAuth, registerLimit, loginLimit }: RouteDeps) {
  const r = new Hono<AuthEnv>();
  r.use('/v1/*', serviceAuth);

  r.post('/v1/register', registerLimit, async (c) => {
    const body = await parseBody(c, RegisterBody);
    const user = await useCases.register.execute(body);
    return c.json({ user: UserDto.parse(user) }, 201);
  });

  r.post('/v1/login', loginLimit, async (c) => {
    const body = await parseBody(c, LoginBody);
    return c.json(TokenPair.parse(await useCases.login.execute(body)));
  });

  r.post('/v1/refresh', async (c) => {
    const body = await parseBody(c, RefreshBody);
    return c.json(TokenPair.parse(await useCases.refresh.execute(body)));
  });

  r.post('/v1/logout', async (c) => {
    const body = await parseBody(c, LogoutBody);
    await useCases.logout.execute(body);
    return c.body(null, 204);
  });

  r.get('/v1/me', userAuth, async (c) => {
    const user = await useCases.me.execute({ userId: c.get('userId'), sessionId: c.get('sessionId') });
    return c.json(UserDto.parse(user));
  });

  r.delete('/v1/account', userAuth, async (c) => {
    await useCases.deleteAccount.execute({ userId: c.get('userId'), sessionId: c.get('sessionId') });
    return c.body(null, 204);
  });

  return r;
}
