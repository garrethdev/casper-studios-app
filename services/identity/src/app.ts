import { createPublicKey } from 'node:crypto';
import type { Hono } from 'hono';
import { createApp, createDb, migrate, type Db } from '@leanplate/platform';
import { jwtPrivateKey, rateLimit, serviceAuth, serviceSecret, userAuth, type AuthEnv } from '@leanplate/security';
import { createUseCases, type Clock, type PasswordHasher, type TokenIssuer } from './application';
import { LOGIN_RATE, REGISTER_RATE } from './domain';
import { identityRoutes } from './http/routes';
import {
  JoseTokenIssuer,
  PgAuditLog,
  PgSessionRepo,
  PgUserRepo,
  ScryptHasher,
  identityMigrations,
} from './infrastructure';

export interface RateSetting {
  windowMs: number;
  max: number;
}

export interface Deps {
  db: Db;
  clock: Clock;
  /** ES256 private key (PKCS8 PEM) that signs access tokens. Defaults to JWT_PRIVATE_KEY. */
  privateKeyPem: string;
  /** Verifies access tokens. Defaults to the public half of the private key. */
  publicKeyPem: string;
  /** Secret that guards this service. Defaults to SERVICE_SECRET_IDENTITY. */
  serviceSecret: string;
  rateLimits: { register: RateSetting; login: RateSetting };
  hasher: PasswordHasher;
  tokens: TokenIssuer;
}

const systemClock: Clock = { now: () => new Date() };

export async function buildApp(deps: Partial<Deps> = {}): Promise<Hono<AuthEnv>> {
  const db = deps.db ?? (await createDb({ service: 'identity' }));
  await migrate(db, 'identity', identityMigrations);

  const privateKeyPem = deps.privateKeyPem ?? jwtPrivateKey();
  const publicKeyPem = deps.publicKeyPem ?? createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
  const secret = deps.serviceSecret ?? serviceSecret('identity');
  const limits = deps.rateLimits ?? { register: REGISTER_RATE, login: LOGIN_RATE };

  const useCases = createUseCases({
    users: new PgUserRepo(db),
    sessions: new PgSessionRepo(db),
    audit: new PgAuditLog(db),
    clock: deps.clock ?? systemClock,
    hasher: deps.hasher ?? new ScryptHasher(),
    tokens: deps.tokens ?? new JoseTokenIssuer(privateKeyPem),
  });

  // Requests with no client IP hash share one bucket rather than skipping the limit.
  const ipKey = (name: string) => (c: { get: (k: 'caller') => { clientIpHash?: string } | undefined }) => `${name}:${c.get('caller')?.clientIpHash ?? 'unknown'}`;

  const app = createApp('identity', { maxBodyBytes: 8 * 1024 });
  app.route(
    '/',
    identityRoutes({
      useCases,
      serviceAuth: serviceAuth({ secret: () => secret, audience: 'identity', allowedIssuers: ['web'] }),
      userAuth: userAuth({ publicKey: () => publicKeyPem }),
      registerLimit: rateLimit({ ...limits.register, key: ipKey('register') }),
      loginLimit: rateLimit({ ...limits.login, key: ipKey('login') }),
    }),
  );
  return app;
}
