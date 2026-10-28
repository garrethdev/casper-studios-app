import { beforeAll, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { createDb, type Db } from '@leanplate/platform';
import { generateKeyPairSync } from 'node:crypto';
import { signAccessToken, signServiceToken, newId, type AuthEnv } from '@leanplate/security';
import { sumTotals, type Analysis, type FoodItem } from '@leanplate/contracts';
import { buildApp } from '../src/app';
import type { Intelligence } from '../src/application/ports';

const SECRET = 'x'.repeat(40);
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const chicken: FoodItem = {
  name: 'Grilled chicken salad', grams: 350, kcal: 420, proteinG: 38, carbsG: 22, fatG: 18, fiberG: 7, sugarG: 6,
  confidence: 0.9, source: 'text', allergens: [], needsReview: false,
};
const calls: string[] = [];
const fakeAi: Intelligence = {
  async analyze(input) {
    calls.push('analyze');
    const items = [{ ...chicken, allergens: input.text?.includes('peanut') ? (['peanut'] as const) : [] }] as FoodItem[];
    return { items, totals: sumTotals(items), warnings: [], citations: [], provider: 'fake' } satisfies Analysis;
  },
  async feedback() {
    calls.push('feedback');
    return { headline: 'Nice protein.', tips: ['Add a fruit.'], citations: [] };
  },
};

const profile = {
  sex: 'female', age: 34, heightCm: 165, weightKg: 82, targetWeightKg: 68, activity: 'light', pace: 'steady',
  diet: 'none', allergens: ['peanut'], acceptedDisclaimer: true,
};

let app: Hono<AuthEnv>;
let db: Db;
const NOW = new Date('2026-10-26T18:00:00Z');

async function req(path: string, o: { user?: string; method?: string; body?: unknown; service?: string | null; key?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.service !== null) headers['x-service-token'] = o.service ?? (await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals' }));
  if (o.user) headers.authorization = `Bearer ${await signAccessToken({ privateKeyPem: o.key ?? PRIV, userId: o.user, sessionId: newId() })}`;
  return app.request(path, { method: o.method ?? 'GET', headers, body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)) });
}

const alice = newId();
const bob = newId();
const save = (user: string, over: Record<string, unknown> = {}) =>
  req('/v1/meals', {
    user, method: 'POST',
    body: { mealType: 'lunch', eatenAt: '2026-10-26T16:00:00Z', items: [chicken], idempotencyKey: newId(), tzOffsetMinutes: 240, ...over },
  });

beforeAll(async () => {
  db = await createDb({ service: 'meals', dataDir: null });
  app = await buildApp({ db, intelligence: fakeAi, clock: { now: () => NOW }, publicKey: () => PUB, serviceSecret: () => SECRET, analysesPerHour: 3 });
  for (const u of [alice, bob]) expect((await req('/v1/profile', { user: u, method: 'PUT', body: profile })).status).toBe(200);
});

describe('authentication', () => {
  it('rejects missing, wrong-audience and wrong-secret service tokens', async () => {
    expect((await req('/v1/profile', { user: alice, service: null })).status).toBe(401);
    const wrongAud = await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'identity' });
    expect((await req('/v1/profile', { user: alice, service: wrongAud })).status).toBe(401);
    const wrongSecret = await signServiceToken({ secret: 'y'.repeat(40), issuer: 'web', audience: 'meals' });
    expect((await req('/v1/profile', { user: alice, service: wrongSecret })).status).toBe(401);
    const wrongCaller = await signServiceToken({ secret: SECRET, issuer: 'intelligence', audience: 'meals' });
    expect((await req('/v1/profile', { user: alice, service: wrongCaller })).status).toBe(401);
  });

  it('rejects missing, forged and malformed user tokens on every route', async () => {
    const routes: [string, string][] = [['GET', '/v1/profile'], ['PUT', '/v1/profile'], ['GET', '/v1/targets'], ['POST', '/v1/meals/analyze'], ['POST', '/v1/meals'],
      ['GET', '/v1/meals?date=2026-10-26'], ['DELETE', `/v1/meals/${newId()}`], ['GET', '/v1/summary?date=2026-10-26'], ['DELETE', '/v1/data']];
    for (const [method, path] of routes) {
      expect((await req(path, { method })).status, `${method} ${path} no token`).toBe(401);
      expect((await req(path, { method, user: alice, key: other })).status, `${method} ${path} forged`).toBe(401);
    }
    const bad = await app.request('/v1/profile', { headers: { 'x-service-token': await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals' }), authorization: 'Bearer not.a.jwt' } });
    expect(bad.status).toBe(401);
  });

  it('exposes no routes without a service token, only /health', async () => {
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/v1/profile')).status).toBe(401);
  });
});

describe('profile and targets', () => {
  it('returns 404 before onboarding and computes targets after', async () => {
    const fresh = newId();
    expect((await req('/v1/profile', { user: fresh })).status).toBe(404);
    expect((await req('/v1/targets', { user: fresh })).status).toBe(404);
    const t = await (await req('/v1/targets', { user: alice })).json();
    expect(t.mode).toBe('lose');
    expect(t.dailyKcal).toBeGreaterThan(1200);
  });

  it('requires the disclaimer and rejects unknown or out-of-range fields', async () => {
    const f = newId();
    expect((await req('/v1/profile', { user: f, method: 'PUT', body: { ...profile, acceptedDisclaimer: false } })).status).toBe(400);
    expect((await req('/v1/profile', { user: f, method: 'PUT', body: { ...profile, role: 'admin' } })).status).toBe(400);
    expect((await req('/v1/profile', { user: f, method: 'PUT', body: { ...profile, age: 12 } })).status).toBe(400);
    expect((await req('/v1/profile', { user: f, method: 'PUT', body: { ...profile, userId: bob } })).status).toBe(400);
    expect((await req('/v1/profile', { user: f, method: 'PUT', raw: '{not json' })).status).toBe(400);
  });
});

describe('analyze', () => {
  it('returns analysis, verdict and feedback without saving anything', async () => {
    const before = await (await req('/v1/meals?date=2026-10-26&tz=240', { user: alice })).json();
    const r = await req('/v1/meals/analyze', { user: alice, method: 'POST', body: { mealType: 'lunch', text: 'grilled chicken salad', tzOffsetMinutes: 240 } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.verdict.label).toBe('on-track');
    expect(j.feedback.headline).toBe('Nice protein.');
    const after = await (await req('/v1/meals?date=2026-10-26&tz=240', { user: alice })).json();
    expect(after.meals.length).toBe(before.meals.length);
  });

  it('flags the user\'s allergen from the profile, not from the request', async () => {
    const j = await (await req('/v1/meals/analyze', { user: bob, method: 'POST', body: { mealType: 'snack', text: 'peanut butter toast', tzOffsetMinutes: 240 } })).json();
    expect(j.verdict.flags).toContain('allergen');
    expect(j.verdict.label).toBe('off-track');
  });

  it('needs onboarding first, and is rate limited per user', async () => {
    expect((await req('/v1/meals/analyze', { user: newId(), method: 'POST', body: { mealType: 'lunch', text: 'toast' } })).status).toBe(404);
    const u = newId();
    await req('/v1/profile', { user: u, method: 'PUT', body: profile });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await req('/v1/meals/analyze', { user: u, method: 'POST', body: { mealType: 'lunch', text: 'toast' } })).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it('rejects empty input and unknown fields', async () => {
    expect((await req('/v1/meals/analyze', { user: alice, method: 'POST', body: { mealType: 'lunch' } })).status).toBe(400);
    expect((await req('/v1/meals/analyze', { user: alice, method: 'POST', body: { mealType: 'lunch', text: 'toast', userId: bob } })).status).toBe(400);
    expect((await req('/v1/meals/analyze', { user: alice, method: 'POST', body: { mealType: 'brunch', text: 'toast' } })).status).toBe(400);
  });
});

describe('saving meals', () => {
  it('recomputes totals and verdict, ignoring anything the client claims', async () => {
    const r = await save(alice, { totals: { kcal: 1 }, verdict: { score: 100 } });
    expect(r.status).toBe(400); // unknown fields are rejected outright
    const ok = await save(alice, { items: [{ ...chicken, kcal: 20 }] });
    expect(ok.status).toBe(201);
    const { meal } = await ok.json();
    expect(meal.items[0].kcal).toBe(Math.round(4 * 38 + 4 * 22 + 9 * 18));
    expect(meal.totals.kcal).toBe(meal.items[0].kcal);
    expect(meal.verdict.label).toBeDefined();
  });

  it('is idempotent on the key and does not duplicate', async () => {
    const key = newId();
    const a = await save(alice, { idempotencyKey: key, eatenAt: '2026-10-25T16:00:00Z' });
    const b = await save(alice, { idempotencyKey: key, eatenAt: '2026-10-25T16:00:00Z' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect((await b.json()).meal.id).toBe((await a.json()).meal.id);
    const day = await (await req('/v1/meals?date=2026-10-25&tz=240', { user: alice })).json();
    expect(day.meals.filter((m: any) => m.eatenAt === '2026-10-25T16:00:00.000Z').length).toBe(1);
  });

  it('does not let another user replay or read an idempotency key', async () => {
    const key = newId();
    const a = await save(alice, { idempotencyKey: key, eatenAt: '2026-10-24T16:00:00Z' });
    const b = await save(bob, { idempotencyKey: key, eatenAt: '2026-10-24T16:00:00Z' });
    expect(b.status).toBe(201);
    expect((await b.json()).meal.id).not.toBe((await a.json()).meal.id);
  });

  it('rejects future, ancient and implausible meals', async () => {
    expect((await save(alice, { eatenAt: '2026-10-27T18:00:00Z' })).status).toBe(422);
    expect((await save(alice, { eatenAt: '2026-08-01T18:00:00Z' })).status).toBe(422);
    expect((await save(alice, { items: [{ ...chicken, kcal: 9000, proteinG: 200, carbsG: 600, fatG: 200 }] })).status).toBe(400);
    expect((await save(alice, { items: [{ ...chicken, grams: 5, kcal: 200, proteinG: 1, carbsG: 1, fatG: 1 }] })).status).toBe(422);
    expect((await save(alice, { items: [] })).status).toBe(400);
    expect((await save(alice, { idempotencyKey: 'short' })).status).toBe(400);
  });
});

describe('isolation between users', () => {
  it('never shows or deletes another user\'s meals', async () => {
    const mine = await (await save(alice, { eatenAt: '2026-10-23T16:00:00Z' })).json();
    const bobDay = await (await req('/v1/meals?date=2026-10-23&tz=240', { user: bob })).json();
    expect(bobDay.meals.some((m: any) => m.id === mine.meal.id)).toBe(false);
    expect((await req(`/v1/meals/${mine.meal.id}`, { user: bob, method: 'DELETE' })).status).toBe(404);
    expect((await req(`/v1/meals/${mine.meal.id}`, { user: alice, method: 'DELETE' })).status).toBe(204);
    expect((await req(`/v1/meals/${mine.meal.id}`, { user: alice, method: 'DELETE' })).status).toBe(404);
  });

  it('rejects malformed ids without touching the database', async () => {
    expect((await req(`/v1/meals/${encodeURIComponent("x' or '1'='1")}`, { user: alice, method: 'DELETE' })).status).toBe(404);
  });

  it('takes the user from the token even if the body tries to name someone else', async () => {
    const r = await save(alice, { userId: bob });
    expect(r.status).toBe(400);
  });

  it('erasing one user\'s data leaves everyone else intact', async () => {
    const u = newId();
    await req('/v1/profile', { user: u, method: 'PUT', body: profile });
    await save(u, { eatenAt: '2026-10-26T14:00:00Z' });
    expect((await req('/v1/data', { user: u, method: 'DELETE' })).status).toBe(204);
    expect((await req('/v1/profile', { user: u })).status).toBe(404);
    expect((await req('/v1/profile', { user: alice })).status).toBe(200);
    const rows = await db.query(`select count(*)::int as n from meals.meals where user_id = $1`, [u]);
    expect(rows[0]!.n).toBe(0);
  });
});

describe('summary', () => {
  it('adds up the local day and reports seven days', async () => {
    const u = newId();
    await req('/v1/profile', { user: u, method: 'PUT', body: profile });
    await save(u, { eatenAt: '2026-10-26T12:00:00Z', mealType: 'breakfast' });
    await save(u, { eatenAt: '2026-10-26T16:00:00Z', mealType: 'lunch' });
    await save(u, { eatenAt: '2026-10-25T16:00:00Z' });
    const s = await (await req('/v1/summary?date=2026-10-26&tz=240', { user: u })).json();
    expect(s.mealCount).toBe(2);
    expect(s.consumed.kcal).toBe(840);
    expect(s.remainingKcal).toBe(s.targets.dailyKcal - 840);
    expect(s.week).toHaveLength(7);
    expect(s.week.at(-1)).toEqual({ date: '2026-10-26', kcal: 840 });
    expect(s.week.at(-2)).toEqual({ date: '2026-10-25', kcal: 420 });
  });

  it('puts a late-evening meal on the right local day', async () => {
    const u = newId();
    await req('/v1/profile', { user: u, method: 'PUT', body: profile });
    await save(u, { eatenAt: '2026-10-26T02:30:00Z', mealType: 'dinner', tzOffsetMinutes: 240 }); // 10:30pm on the 25th in New York
    const day25 = await (await req('/v1/meals?date=2026-10-25&tz=240', { user: u })).json();
    const day26 = await (await req('/v1/meals?date=2026-10-26&tz=240', { user: u })).json();
    expect(day25.meals).toHaveLength(1);
    expect(day26.meals).toHaveLength(0);
  });

  it('validates date and tz', async () => {
    expect((await req('/v1/summary?date=nope&tz=0', { user: alice })).status).toBe(400);
    expect((await req('/v1/summary?date=2026-10-26&tz=99999', { user: alice })).status).toBe(400);
    expect((await req('/v1/meals?date=2026-13-45&tz=0', { user: alice })).status).toBe(400);
  });
});

describe('AI quota', () => {
  it('is enforced in the database, so a fresh instance still counts earlier analyses', async () => {
    const u = newId();
    await req('/v1/profile', { user: u, method: 'PUT', body: profile });
    for (let i = 0; i < 3; i++) expect((await req('/v1/meals/analyze', { user: u, method: 'POST', body: { mealType: 'lunch', text: 'toast' } })).status).toBe(200);
    const fresh = await buildApp({ db, intelligence: fakeAi, clock: { now: () => NOW }, publicKey: () => PUB, serviceSecret: () => SECRET, analysesPerHour: 3 });
    const h = { 'content-type': 'application/json', 'x-service-token': await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals' }), authorization: `Bearer ${await signAccessToken({ privateKeyPem: PRIV, userId: u, sessionId: newId() })}` };
    const r = await fresh.request('/v1/meals/analyze', { method: 'POST', headers: h, body: JSON.stringify({ mealType: 'lunch', text: 'toast' }) });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('resets in the next hour', async () => {
    const u = newId();
    await req('/v1/profile', { user: u, method: 'PUT', body: profile });
    for (let i = 0; i < 3; i++) await req('/v1/meals/analyze', { user: u, method: 'POST', body: { mealType: 'lunch', text: 'toast' } });
    const later = await buildApp({ db, intelligence: fakeAi, clock: { now: () => new Date(NOW.getTime() + 3_600_000) }, publicKey: () => PUB, serviceSecret: () => SECRET, analysesPerHour: 3 });
    const h = { 'content-type': 'application/json', 'x-service-token': await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals' }), authorization: `Bearer ${await signAccessToken({ privateKeyPem: PRIV, userId: u, sessionId: newId() })}` };
    expect((await later.request('/v1/meals/analyze', { method: 'POST', headers: h, body: JSON.stringify({ mealType: 'lunch', text: 'toast' }) })).status).toBe(200);
  });

  it('never hands the user id to the AI service', async () => {
    const seen: Record<string, unknown>[] = [];
    const spy: Intelligence = {
      analyze: async (input, who) => { seen.push({ ...who }); return fakeAi.analyze(input, who); },
      feedback: async (input, who) => { seen.push({ ...who }); return fakeAi.feedback(input, who); },
    };
    const a2 = await buildApp({ db, intelligence: spy, clock: { now: () => NOW }, publicKey: () => PUB, serviceSecret: () => SECRET });
    const h = { 'content-type': 'application/json', 'x-service-token': await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals', clientIpHash: 'abc' }), authorization: `Bearer ${await signAccessToken({ privateKeyPem: PRIV, userId: alice, sessionId: newId() })}`, 'x-request-id': 'trace-123' };
    await a2.request('/v1/meals/analyze', { method: 'POST', headers: h, body: JSON.stringify({ mealType: 'lunch', text: 'toast' }) });
    expect(seen.length).toBeGreaterThan(0);
    for (const w of seen) {
      expect(w.clientIpHash).toBe('abc');
      expect(w.requestId).toBe('trace-123');
      expect(w).not.toHaveProperty('userToken');
    }
  });
});

describe('resilience', () => {
  it('saves a meal even when the feedback service is down', async () => {
    const down: Intelligence = { analyze: fakeAi.analyze, feedback: async () => { throw new Error('boom'); } };
    const a2 = await buildApp({ db, intelligence: down, clock: { now: () => NOW }, publicKey: () => PUB, serviceSecret: () => SECRET });
    const h = { 'content-type': 'application/json', 'x-service-token': await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals' }), authorization: `Bearer ${await signAccessToken({ privateKeyPem: PRIV, userId: alice, sessionId: newId() })}` };
    const r = await a2.request('/v1/meals', { method: 'POST', headers: h, body: JSON.stringify({ mealType: 'snack', eatenAt: '2026-10-26T15:00:00Z', items: [chicken], idempotencyKey: newId() }) });
    expect(r.status).toBe(201);
    expect((await r.json()).meal.feedback).toBeNull();
  });

  it('never leaks internals in errors', async () => {
    const r = await req('/v1/meals', { user: alice, method: 'POST', body: { mealType: 'lunch', eatenAt: 'garbage' } });
    const text = await r.text();
    expect(r.status).toBe(400);
    expect(text).not.toMatch(/stack|at \w+ \(|node_modules/);
  });
});
