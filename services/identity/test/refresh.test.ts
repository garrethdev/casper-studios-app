import { beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '@leanplate/security';
import { makeHarness, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
});

const DAY = 86_400_000;
const GRACE = 10_000;
const refresh = (token: string) => h.call('POST', '/v1/refresh', { body: { refreshToken: token } });
const strip = (j: any) => ({ code: j.error.code, message: j.error.message });

describe('POST /v1/refresh', () => {
  it('rotates: returns a new pair, marks the old token used, keeps one family', async () => {
    const s = await h.signIn();
    const r = await refresh(s.refreshToken);
    expect(r.status).toBe(200);
    expect(r.json.refreshToken).not.toBe(s.refreshToken);
    expect(r.json.accessToken).not.toBe(s.accessToken);
    expect(r.json.expiresIn).toBe(600);

    const rows = await h.db.query<{ token_hash: string; family_id: string; used_at: unknown }>(
      'select token_hash, family_id, used_at from identity.sessions where user_id = $1 order by created_at, used_at nulls last',
      [s.id],
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((x) => x.family_id)).size).toBe(1);
    const old = rows.find((x) => x.token_hash === sha256Hex(s.refreshToken))!;
    const next = rows.find((x) => x.token_hash === sha256Hex(r.json.refreshToken))!;
    expect(old.used_at).not.toBeNull();
    expect(next.used_at).toBeNull();
  });

  it('issues a working access token after rotation', async () => {
    const s = await h.signIn();
    const r = await refresh(s.refreshToken);
    const me = await h.call('GET', '/v1/me', { bearer: r.json.accessToken });
    expect(me.status).toBe(200);
    expect(me.json.email).toBe(s.email);
  });

  it('chains through many rotations', async () => {
    const s = await h.signIn();
    let token = s.refreshToken;
    for (let i = 0; i < 4; i++) {
      const r = await refresh(token);
      expect(r.status).toBe(200);
      token = r.json.refreshToken;
    }
  });

  it('treats replay of a used token as theft: the whole family dies, including the newest token', async () => {
    const s = await h.signIn();
    const first = await refresh(s.refreshToken);
    const second = await refresh(first.json.refreshToken);
    expect(second.status).toBe(200);

    h.clock.advance(GRACE); // well after any honest duplicate could arrive
    const replay = await refresh(s.refreshToken); // the thief presents the stolen, already used token
    expect(replay.status).toBe(401);
    expect(replay.json.error.code).toBe('invalid_refresh');

    // Both the middle and the newest tokens are now dead.
    expect((await refresh(second.json.refreshToken)).status).toBe(401);
    expect((await refresh(first.json.refreshToken)).status).toBe(401);

    const live = await h.db.query('select id from identity.sessions where user_id = $1 and revoked_at is null', [s.id]);
    expect(live).toHaveLength(0);
  });

  it('refuses a seconds-old duplicate without killing the family (two tabs racing on one cookie)', async () => {
    const s = await h.signIn();
    const first = await refresh(s.refreshToken);
    h.clock.advance(2_000);
    const dup = await refresh(s.refreshToken); // the other tab, a moment later, still holding the old cookie
    expect(dup.status).toBe(401);
    expect((await refresh(first.json.refreshToken)).status).toBe(200); // the family lives on
    const reuse = await h.db.query("select 1 from identity.audit_log where user_id = $1 and event = 'refresh_reuse'", [s.id]);
    expect(reuse).toHaveLength(0);
  });

  it('writes a refresh_reuse audit event with no token material', async () => {
    const s = await h.signIn();
    await refresh(s.refreshToken);
    h.clock.advance(GRACE);
    await refresh(s.refreshToken);
    const rows = await h.db.query<{ event: string; detail: unknown }>("select event, detail from identity.audit_log where user_id = $1 and event = 'refresh_reuse'", [s.id]);
    expect(rows).toHaveLength(1);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(s.refreshToken);
    expect(dump).not.toContain(sha256Hex(s.refreshToken));
  });

  it('kills access tokens of the revoked family at /me', async () => {
    const s = await h.signIn();
    const first = await refresh(s.refreshToken);
    h.clock.advance(GRACE);
    await refresh(s.refreshToken); // replay
    expect((await h.call('GET', '/v1/me', { bearer: first.json.accessToken })).status).toBe(401);
    expect((await h.call('GET', '/v1/me', { bearer: s.accessToken })).status).toBe(401);
  });

  it('does not touch the user\'s other login families on replay', async () => {
    const s = await h.signIn();
    const other = await h.login(s.email, s.password);
    await refresh(s.refreshToken);
    h.clock.advance(GRACE);
    await refresh(s.refreshToken); // replay in family one
    expect((await refresh(other.json.refreshToken)).status).toBe(200);
  });

  it('only one of two parallel uses of the same token wins, and the family is revoked', async () => {
    const s = await h.signIn();
    const [a, b] = await Promise.all([refresh(s.refreshToken), refresh(s.refreshToken)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const winner = a.status === 200 ? a : b;
    expect((await refresh(winner.json.refreshToken)).status).toBe(401);
  });

  it('rejects an expired refresh token after 14 days, with the same body as an unknown one', async () => {
    const s = await h.signIn();
    h.clock.advance(14 * DAY - 1000);
    const nearly = await refresh(s.refreshToken);
    expect(nearly.status).toBe(200); // still inside the window

    const s2 = await h.signIn();
    h.clock.advance(14 * DAY + 1000);
    const stale = await refresh(s2.refreshToken);
    const unknown = await refresh('u'.repeat(43));
    expect(stale.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(strip(stale.json)).toEqual(strip(unknown.json));
  });

  it('rotated tokens get a fresh 14 day life', async () => {
    const s = await h.signIn();
    h.clock.advance(10 * DAY);
    const r = await refresh(s.refreshToken);
    h.clock.advance(10 * DAY);
    expect((await refresh(r.json.refreshToken)).status).toBe(200);
  });

  it('rejects unknown tokens without revoking anything', async () => {
    const s = await h.signIn();
    expect((await refresh('A'.repeat(43))).status).toBe(401);
    expect((await refresh(s.refreshToken)).status).toBe(200);
  });

  it('never accepts the stored hash as a refresh token', async () => {
    const s = await h.signIn();
    const r = await refresh(sha256Hex(s.refreshToken));
    expect(r.status).toBe(401);
  });

  it('rejects tokens that are too short, too long, or the wrong type', async () => {
    for (const body of [{ refreshToken: 'short' }, { refreshToken: 'x'.repeat(201) }, { refreshToken: 12345 }, { refreshToken: null }, {}]) {
      expect((await h.call('POST', '/v1/refresh', { body })).status).toBe(400);
    }
  });

  it('a refresh token cannot be used as a bearer token, nor an access token as a refresh token', async () => {
    const s = await h.signIn();
    expect((await h.call('GET', '/v1/me', { bearer: s.refreshToken })).status).toBe(401);
    expect([400, 401]).toContain((await refresh(s.accessToken)).status);
  });
});

describe('POST /v1/logout', () => {
  const logout = (token: string) => h.call('POST', '/v1/logout', { body: { refreshToken: token } });

  it('revokes the family and returns 204', async () => {
    const s = await h.signIn();
    const r = await logout(s.refreshToken);
    expect(r.status).toBe(204);
    expect(r.text).toBe('');
    expect((await refresh(s.refreshToken)).status).toBe(401);
  });

  it('revokes rotated descendants too, so the newest token stops working', async () => {
    const s = await h.signIn();
    const next = await refresh(s.refreshToken);
    expect((await logout(next.json.refreshToken)).status).toBe(204);
    expect((await refresh(next.json.refreshToken)).status).toBe(401);
  });

  it('also invalidates the access token at /me', async () => {
    const s = await h.signIn();
    await logout(s.refreshToken);
    expect((await h.call('GET', '/v1/me', { bearer: s.accessToken })).status).toBe(401);
  });

  it('returns 204 for unknown, repeated and expired tokens alike', async () => {
    const s = await h.signIn();
    expect((await logout('Z'.repeat(43))).status).toBe(204);
    expect((await logout(s.refreshToken)).status).toBe(204);
    expect((await logout(s.refreshToken)).status).toBe(204);
  });

  it('leaves the user\'s other sessions alone', async () => {
    const s = await h.signIn();
    const other = await h.login(s.email, s.password);
    await logout(s.refreshToken);
    expect((await refresh(other.json.refreshToken)).status).toBe(200);
  });

  it('one user cannot log out another by guessing: unknown tokens change nothing', async () => {
    const a = await h.signIn();
    await logout(sha256Hex(a.refreshToken));
    expect((await refresh(a.refreshToken)).status).toBe(200);
  });

  it('writes a logout audit event', async () => {
    const s = await h.signIn();
    await logout(s.refreshToken);
    const rows = await h.db.query("select id from identity.audit_log where user_id = $1 and event = 'logout'", [s.id]);
    expect(rows).toHaveLength(1);
  });

  it('rejects a malformed body with 400', async () => {
    expect((await h.call('POST', '/v1/logout', { body: { refreshToken: 'short' } })).status).toBe(400);
    expect((await h.call('POST', '/v1/logout', { body: {} })).status).toBe(400);
  });
});
