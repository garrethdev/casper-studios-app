import { beforeAll, describe, expect, it } from 'vitest';
import { GOOD_PASSWORD, makeHarness, uniqueEmail, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
});

const bodyRoutes = ['/v1/register', '/v1/login', '/v1/refresh', '/v1/logout'];

describe('hostile request bodies', () => {
  it.each(bodyRoutes)('%s rejects malformed JSON with 400 invalid_json', async (path) => {
    for (const raw of ['{', '{"email":', 'not json', '', '[', '{"a":1,}', "{'email':'x'}"]) {
      const r = await h.call('POST', path, { raw });
      expect(r.status, raw).toBe(400);
      expect(r.json.error.code).toBe('invalid_json');
    }
  });

  it.each(bodyRoutes)('%s rejects non-object JSON with 400', async (path) => {
    for (const raw of ['null', '123', '"str"', '[]', 'true']) {
      const r = await h.call('POST', path, { raw });
      expect(r.status, raw).toBe(400);
      expect(r.json.error.code).toBe('invalid_request');
    }
  });

  it.each(bodyRoutes)('%s rejects oversize bodies with 413 before parsing them', async (path) => {
    const r = await h.call('POST', path, { raw: JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }) });
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('payload_too_large');
  });

  it('rejects oversize bodies even when they are not valid JSON', async () => {
    const r = await h.call('POST', '/v1/login', { raw: 'A'.repeat(100_000) });
    expect(r.status).toBe(413);
  });

  it('register rejects unknown fields (mass assignment)', async () => {
    for (const extra of [{ id: '00000000-0000-4000-8000-000000000000' }, { role: 'admin' }, { isAdmin: true }, { failed_attempts: 0 }, { password_hash: 'x' }]) {
      const r = await h.call('POST', '/v1/register', { body: { email: uniqueEmail(), password: GOOD_PASSWORD, ...extra } });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('invalid_request');
    }
  });

  it('login, refresh and logout reject unknown fields', async () => {
    const u = await h.register();
    expect((await h.call('POST', '/v1/login', { body: { email: u.email, password: u.password, remember: true } })).status).toBe(400);
    expect((await h.call('POST', '/v1/refresh', { body: { refreshToken: 'x'.repeat(43), userId: u.id } })).status).toBe(400);
    expect((await h.call('POST', '/v1/logout', { body: { refreshToken: 'x'.repeat(43), all: true } })).status).toBe(400);
  });

  it('rejects wrong types instead of coercing them', async () => {
    for (const body of [
      { email: ['a@example.com'], password: GOOD_PASSWORD },
      { email: { $ne: null }, password: GOOD_PASSWORD },
      { email: 'a@example.com', password: { $ne: '' } },
      { email: 'a@example.com', password: 12345678901234 },
      { email: null, password: null },
    ]) {
      expect((await h.call('POST', '/v1/login', { body })).status).toBe(400);
      expect((await h.call('POST', '/v1/register', { body })).status).toBe(400);
    }
  });

  it('login refuses NoSQL-style or boolean-injection passwords without matching anyone', async () => {
    const u = await h.register();
    for (const password of ["' or '1'='1", '" or ""="', "x'; drop table identity.users; --"]) {
      expect((await h.login(u.email, password)).status).toBe(401);
    }
    expect((await h.login(u.email, u.password)).status).toBe(200);
  });

  it('validation errors never echo the offending input or any stack trace', async () => {
    const r = await h.call('POST', '/v1/register', { body: { email: 'bad<script>alert(1)</script>', password: GOOD_PASSWORD, hidden: 'zzz-marker' } });
    expect(r.status).toBe(400);
    expect(r.text).not.toContain('<script>');
    expect(r.text).not.toContain('zzz-marker');
    expect(r.text).not.toMatch(/\bat \S+ \(|node_modules|\.ts:\d+/);
  });

  it('wrong methods and unknown paths do not reach handlers', async () => {
    expect((await h.call('GET', '/v1/login')).status).toBe(404);
    expect((await h.call('PUT', '/v1/register', { body: {} })).status).toBe(404);
    expect((await h.call('GET', '/v1/admin')).status).toBe(404);
    expect((await h.call('GET', '/nothing')).status).toBe(404);
  });

  it('sets hardening and no-store headers and an error body with a request id', async () => {
    const r = await h.call('POST', '/v1/login', { body: { email: 'nobody@example.com', password: 'x' } });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.json.error.requestId).toBeTruthy();
  });

  it('turns internal failures into a generic 500 with no internals', async () => {
    const broken = await makeHarness({
      hasher: {
        hash: async () => {
          throw new Error('SECRET INTERNAL DETAIL postgres://user:pw@host/db');
        },
        verify: async () => false,
        verifyDummy: async () => {},
      },
    });
    const r = await broken.call('POST', '/v1/register', { body: { email: uniqueEmail(), password: GOOD_PASSWORD } });
    expect(r.status).toBe(500);
    expect(r.json.error.code).toBe('internal');
    expect(r.text).not.toContain('SECRET INTERNAL DETAIL');
  });
});
