import { describe, expect, it } from 'vitest';
import { GOOD_PASSWORD, makeHarness, uniqueEmail } from './helpers';
import { LOGIN_RATE, REGISTER_RATE } from '../src/domain';

// These tests use the production limits and the limiter's real clock, with cheap invalid bodies so no hashing happens.
const prod = { rateLimits: { register: REGISTER_RATE, login: LOGIN_RATE } };

describe('per-IP rate limits', () => {
  it('limits register to 5 per minute per client IP hash', async () => {
    const h = await makeHarness(prod);
    for (let i = 0; i < 5; i++) expect((await h.call('POST', '/v1/register', { body: {}, ip: 'ip-a' })).status).toBe(400);
    const sixth = await h.call('POST', '/v1/register', { body: {}, ip: 'ip-a' });
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.code).toBe('rate_limited');
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0);
    // A different client is unaffected.
    expect((await h.call('POST', '/v1/register', { body: {}, ip: 'ip-b' })).status).toBe(400);
  });

  it('limits login to 10 per minute per client IP hash, even when the account is unknown', async () => {
    const h = await makeHarness(prod);
    for (let i = 0; i < 10; i++) expect((await h.call('POST', '/v1/login', { body: {}, ip: 'ip-a' })).status).toBe(400);
    expect((await h.call('POST', '/v1/login', { body: {}, ip: 'ip-a' })).status).toBe(429);
    expect((await h.call('POST', '/v1/login', { body: {}, ip: 'ip-c' })).status).toBe(400);
  });

  it('keeps register and login budgets separate', async () => {
    const h = await makeHarness(prod);
    for (let i = 0; i < 5; i++) await h.call('POST', '/v1/register', { body: {}, ip: 'ip-a' });
    expect((await h.call('POST', '/v1/register', { body: {}, ip: 'ip-a' })).status).toBe(429);
    expect((await h.call('POST', '/v1/login', { body: {}, ip: 'ip-a' })).status).toBe(400);
  });

  it('is applied after service auth: bad service tokens cannot burn a victim IP budget', async () => {
    const h = await makeHarness(prod);
    for (let i = 0; i < 20; i++) expect((await h.call('POST', '/v1/login', { body: {}, serviceToken: 'garbage' })).status).toBe(401);
    expect((await h.call('POST', '/v1/login', { body: {}, ip: 'ip-a' })).status).toBe(400);
  });

  it('puts callers with no client IP hash in one shared bucket instead of skipping the limit', async () => {
    const h = await makeHarness(prod);
    const { signServiceToken } = await import('@leanplate/security');
    const { SECRET } = await import('./helpers');
    const token = await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'identity' });
    for (let i = 0; i < 5; i++) expect((await h.call('POST', '/v1/register', { body: {}, serviceToken: token })).status).toBe(400);
    expect((await h.call('POST', '/v1/register', { body: {}, serviceToken: token })).status).toBe(429);
  });

  it('honors injected limits', async () => {
    const h = await makeHarness({ rateLimits: { register: { windowMs: 60_000, max: 1 }, login: { windowMs: 60_000, max: 1 } } });
    expect((await h.call('POST', '/v1/register', { body: { email: uniqueEmail(), password: GOOD_PASSWORD }, ip: 'ip-z' })).status).toBe(201);
    expect((await h.call('POST', '/v1/register', { body: { email: uniqueEmail(), password: GOOD_PASSWORD }, ip: 'ip-z' })).status).toBe(429);
  });
});
