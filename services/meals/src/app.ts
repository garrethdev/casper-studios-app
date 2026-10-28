import type { Hono } from 'hono';
import { createApp, createDb, migrate, type Db } from '@leanplate/platform';
import { jwtPublicKey, serviceAuth, serviceSecret, userAuth, type AuthEnv } from '@leanplate/security';
import { MealService } from './application/service';
import type { Clock, Intelligence } from './application/ports';
import { httpIntelligence } from './infrastructure/intelligence-client';
import { SCHEMA, migrations } from './infrastructure/migrations';
import { PgMealRepo, PgProfileRepo, PgUsageRepo } from './infrastructure/repos';
import { mealRoutes } from './http/routes';

export interface Deps {
  db: Db;
  intelligence: Intelligence;
  clock: Clock;
  publicKey: () => string;
  serviceSecret: () => string;
  /** AI analyses allowed per user per hour. They cost money, so they are capped, in the database. */
  analysesPerHour: number;
}

export async function buildApp(overrides: Partial<Deps> = {}): Promise<Hono<AuthEnv>> {
  const db = overrides.db ?? (await createDb({ service: 'meals' }));
  await migrate(db, SCHEMA, migrations);

  const intelligence = overrides.intelligence ?? httpIntelligence(process.env.INTELLIGENCE_URL ?? 'http://localhost:4003');
  const clock = overrides.clock ?? { now: () => new Date() };
  const svc = new MealService(new PgProfileRepo(db), new PgMealRepo(db), intelligence, clock, new PgUsageRepo(db), overrides.analysesPerHour ?? 30);

  const app = createApp('meals');
  app.use('/v1/*', serviceAuth({ secret: overrides.serviceSecret ?? (() => serviceSecret('meals')), audience: 'meals', allowedIssuers: ['web'] }));
  app.route('/v1', mealRoutes(svc, userAuth({ publicKey: overrides.publicKey ?? jwtPublicKey })));
  return app;
}
