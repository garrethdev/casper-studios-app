import { Hono } from 'hono';
import { AnalyzeMealBody, AnalyzeMealResult, DaySummary, MealRecord, Profile, ProfileInput, SaveMealBody, Targets } from '@leanplate/contracts';
import { parseBody } from '@leanplate/platform';
import { AppError, userAuth, type AuthEnv } from '@leanplate/security';
import type { MealService } from '../application/service';
import type { Caller } from '../application/ports';

const tzOf = (raw: string | undefined) => {
  const n = Number(raw ?? '0');
  if (!Number.isInteger(n) || n < -840 || n > 840) throw new AppError(400, 'invalid_request', 'tz must be minutes between -840 and 840');
  return n;
};

/**
 * Everything here runs behind serviceAuth and userAuth (mounted in app.ts).
 * Responses are parsed through the shared contracts before they leave, so a
 * drift between this service and the web app fails here, loudly, not in a browser.
 */
export function mealRoutes(svc: MealService, auth: ReturnType<typeof userAuth>) {
  const r = new Hono<AuthEnv>();
  r.use('*', auth);

  const who = (c: { get: (k: 'userId' | 'caller' | 'requestId') => any }): Caller => ({
    userId: c.get('userId'),
    clientIpHash: c.get('caller')?.clientIpHash,
    requestId: c.get('requestId'),
  });

  r.get('/profile', async (c) => c.json(Profile.parse(await svc.getProfile(c.get('userId')))));
  r.put('/profile', async (c) => {
    const { profile, targets } = await svc.saveProfile(c.get('userId'), await parseBody(c, ProfileInput));
    return c.json({ profile: Profile.parse(profile), targets: Targets.parse(targets) });
  });
  r.get('/targets', async (c) => c.json(Targets.parse(await svc.getTargets(c.get('userId')))));

  r.post('/meals/analyze', async (c) => {
    const body = await parseBody(c, AnalyzeMealBody); // malformed requests are rejected before they touch the quota
    return c.json(AnalyzeMealResult.parse(await svc.analyze(who(c), body)));
  });
  r.post('/meals', async (c) => {
    const { meal, created } = await svc.save(who(c), await parseBody(c, SaveMealBody));
    return c.json({ meal: MealRecord.parse(meal) }, created ? 201 : 200);
  });
  r.get('/meals', async (c) => c.json({ meals: MealRecord.array().parse(await svc.list(c.get('userId'), c.req.query('date') ?? '', tzOf(c.req.query('tz')))) }));
  r.delete('/meals/:id', async (c) => {
    await svc.remove(c.get('userId'), c.req.param('id'));
    return c.body(null, 204);
  });
  r.get('/summary', async (c) => c.json(DaySummary.parse(await svc.summary(c.get('userId'), c.req.query('date') ?? '', tzOf(c.req.query('tz'))))));
  r.delete('/data', async (c) => {
    await svc.eraseAll(c.get('userId'));
    return c.body(null, 204);
  });
  return r;
}
