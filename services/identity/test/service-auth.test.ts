import { beforeAll, describe, expect, it } from 'vitest';
import { signServiceToken } from '@leanplate/security';
import { GOOD_PASSWORD, SECRET, makeHarness, uniqueEmail, type Harness } from './helpers';

let h: Harness;
let user: Awaited<ReturnType<Harness['signIn']>>;
beforeAll(async () => {
  h = await makeHarness();
  user = await h.signIn();
});

const routes = () => [
  { name: 'register', method: 'POST', path: '/v1/register', body: { email: uniqueEmail(), password: GOOD_PASSWORD } },
  { name: 'login', method: 'POST', path: '/v1/login', body: { email: user.email, password: user.password } },
  { name: 'refresh', method: 'POST', path: '/v1/refresh', body: { refreshToken: user.refreshToken } },
  { name: 'logout', method: 'POST', path: '/v1/logout', body: { refreshToken: user.refreshToken } },
  { name: 'me', method: 'GET', path: '/v1/me', bearer: true },
  { name: 'account', method: 'DELETE', path: '/v1/account', bearer: true },
];

const bad = async (name: string, serviceToken: string | null) => {
  for (const r of routes()) {
    const res = await h.call(r.method, r.path, { body: r.body, bearer: r.bearer ? user.accessToken : undefined, serviceToken });
    expect(res.status, `${name} on ${r.name}`).toBe(401);
    expect(res.json.error.code).toBe('unauthorized');
  }
};

describe('service token on every route', () => {
  it('rejects a missing token', () => bad('missing', null));
  it('rejects an empty token', () => bad('empty', ''));
  it('rejects garbage', () => bad('garbage', 'not-a-token'));

  it('rejects the wrong secret', async () => {
    const t = await signServiceToken({ secret: 'a-different-secret-that-is-long-enough-1234', issuer: 'web', audience: 'identity' });
    await bad('wrong secret', t);
  });

  it('rejects the wrong audience (a token meant for meals)', async () => {
    const t = await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'meals' });
    await bad('wrong audience', t);
  });

  it.each(['meals', 'intelligence', 'identity', 'attacker', ''])('rejects issuer %j', async (issuer) => {
    const t = await signServiceToken({ secret: SECRET, issuer, audience: 'identity' });
    await bad(`issuer ${issuer}`, t);
  });

  it('rejects an expired token', async () => {
    const t = await signServiceToken({ secret: SECRET, issuer: 'web', audience: 'identity', ttlSeconds: -60 });
    await bad('expired', t);
  });

  it('rejects a token with a tampered issuer claim', async () => {
    const t = await signServiceToken({ secret: SECRET, issuer: 'meals', audience: 'identity' });
    const [hd, pl, sig] = t.split('.');
    const payload = JSON.parse(Buffer.from(pl!, 'base64url').toString());
    payload.iss = 'web';
    await bad('tampered', `${hd}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`);
  });

  it('rejects an unsigned (alg none) service token', async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    await bad('none', `${b64({ alg: 'none' })}.${b64({ iss: 'web', aud: 'identity', exp: now + 60 })}.`);
  });

  it('rejects the user access token used as a service token', async () => {
    await bad('user token', user.accessToken);
  });

  it('accepts a correct token, and the user token alone is not enough for /me', async () => {
    expect((await h.call('GET', '/v1/me', { bearer: user.accessToken })).status).toBe(200);
    const noUser = await h.call('GET', '/v1/me');
    expect(noUser.status).toBe(401);
  });

  it('does not require the service token for /health, and /health leaks nothing', async () => {
    const res = await h.app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'identity' });
  });

  it('a request that fails service auth never touches the database', async () => {
    const before = (await h.db.query<{ n: number }>('select count(*)::int as n from identity.audit_log'))[0]!.n;
    await h.call('POST', '/v1/login', { body: { email: user.email, password: 'wrong password here' }, serviceToken: 'garbage' });
    const after = (await h.db.query<{ n: number }>('select count(*)::int as n from identity.audit_log'))[0]!.n;
    expect(after).toBe(before);
  });
});
