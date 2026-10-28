import { beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '@leanplate/security';
import { GOOD_PASSWORD, makeHarness, uniqueEmail, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
});

const MIN = 60_000;

describe('POST /v1/login', () => {
  it('returns a token pair for correct credentials', async () => {
    const u = await h.register();
    const r = await h.login(u.email, u.password);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['accessToken', 'expiresIn', 'refreshToken']);
    expect(r.json.expiresIn).toBe(600);
    expect(r.json.accessToken.split('.')).toHaveLength(3);
    expect(r.json.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('issues an access token that lasts 600 seconds and names the user', async () => {
    const u = await h.register();
    const r = await h.login(u.email, u.password);
    const payload = JSON.parse(Buffer.from(r.json.accessToken.split('.')[1], 'base64url').toString());
    expect(payload.sub).toBe(u.id);
    expect(payload.exp - payload.iat).toBe(600);
    expect(typeof payload.sid).toBe('string');
  });

  it('stores the refresh token only as its SHA-256 and gives it a 14 day life', async () => {
    const u = await h.register();
    const r = await h.login(u.email, u.password);
    const rows = await h.db.query<{ token_hash: string; created_at: Date; expires_at: Date }>(
      'select token_hash, created_at, expires_at from identity.sessions where user_id = $1',
      [u.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(sha256Hex(r.json.refreshToken));
    expect(JSON.stringify(rows)).not.toContain(r.json.refreshToken);
    const days = (new Date(rows[0]!.expires_at).getTime() - new Date(rows[0]!.created_at).getTime()) / 86_400_000;
    expect(days).toBe(14);
  });

  it('gives each login its own refresh token and family', async () => {
    const u = await h.register();
    const a = await h.login(u.email, u.password);
    const b = await h.login(u.email, u.password);
    expect(a.json.refreshToken).not.toBe(b.json.refreshToken);
    const fam = await h.db.query<{ family_id: string }>('select distinct family_id from identity.sessions where user_id = $1', [u.id]);
    expect(fam).toHaveLength(2);
  });

  it('answers unknown user and wrong password with the identical 401 body', async () => {
    const u = await h.register();
    const wrong = await h.login(u.email, 'not the right password');
    const unknown = await h.login(uniqueEmail('ghost'), 'not the right password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.error.code).toBe('invalid_credentials');
    // Same code and message; only the per-request id may differ.
    const strip = (j: any) => ({ code: j.error.code, message: j.error.message });
    expect(strip(unknown.json)).toEqual(strip(wrong.json));
    expect(Object.keys(unknown.json.error).sort()).toEqual(Object.keys(wrong.json.error).sort());
    expect([...unknown.headers.keys()].filter((k) => k !== 'x-request-id').sort()).toEqual([...wrong.headers.keys()].filter((k) => k !== 'x-request-id').sort());
  });

  it('spends comparable time on an unknown user and a wrong password', async () => {
    const u = await h.register();
    await h.login(uniqueEmail('warm'), 'x'); // warm the dummy hash
    const time = async (email: string) => {
      const t = performance.now();
      await h.login(email, 'wrong password here');
      return performance.now() - t;
    };
    const known = Math.min(await time(u.email), await time(u.email));
    const unknown = Math.min(await time(uniqueEmail('ghost')), await time(uniqueEmail('ghost')));
    // Both run a full scrypt; an early return would be orders of magnitude faster.
    expect(unknown).toBeGreaterThan(known * 0.4);
    expect(unknown).toBeGreaterThan(20);
  });

  it('rejects empty password and malformed emails with 400', async () => {
    expect((await h.call('POST', '/v1/login', { body: { email: 'a@example.com', password: '' } })).status).toBe(400);
    expect((await h.call('POST', '/v1/login', { body: { email: 'nope', password: 'x' } })).status).toBe(400);
  });

  it('does not accept a stored hash as a password', async () => {
    const u = await h.register();
    const [row] = await h.db.query<{ password_hash: string }>('select password_hash from identity.users where id = $1', [u.id]);
    expect((await h.login(u.email, row!.password_hash)).status).toBe(401);
  });

  it('is not fooled by SQL metacharacters in the email', async () => {
    const r = await h.login("x'--@example.com", GOOD_PASSWORD);
    expect([400, 401]).toContain(r.status);
    expect((await h.db.query('select count(*)::int as n from identity.users'))[0]!.n).toBeGreaterThan(0);
  });

  it('records login_success and login_failure audit events with no secrets', async () => {
    const u = await h.register();
    await h.login(u.email, 'wrong password here');
    await h.login(u.email, u.password);
    const rows = await h.db.query<{ event: string; detail: unknown }>('select event, detail from identity.audit_log where user_id = $1 order by id', [u.id]);
    expect(rows.map((r) => r.event)).toEqual(['register', 'login_failure', 'login_success']);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(u.password);
    expect(dump).not.toContain('wrong password here');
    expect(dump).not.toContain('scrypt$');
  });
});

describe('account lockout', () => {
  it('locks after 5 consecutive failures for 15 minutes and refuses even the right password', async () => {
    const u = await h.register();
    for (let i = 0; i < 5; i++) expect((await h.login(u.email, 'wrong password here')).status).toBe(401);
    const locked = await h.login(u.email, u.password);
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe('account_locked');
    expect(Number(locked.headers.get('retry-after'))).toBe(900);

    h.clock.advance(10 * MIN);
    const still = await h.login(u.email, u.password);
    expect(still.status).toBe(429);
    expect(Number(still.headers.get('retry-after'))).toBe(300);
  });

  it('keeps the lock fixed: attempts while locked do not extend it', async () => {
    const u = await h.register();
    for (let i = 0; i < 5; i++) await h.login(u.email, 'wrong password here');
    h.clock.advance(14 * MIN);
    for (let i = 0; i < 5; i++) expect((await h.login(u.email, 'wrong password here')).status).toBe(429);
    h.clock.advance(1 * MIN + 1000);
    expect((await h.login(u.email, u.password)).status).toBe(200);
  });

  it('unlocks once 15 minutes have passed', async () => {
    const u = await h.register();
    for (let i = 0; i < 5; i++) await h.login(u.email, 'wrong password here');
    expect((await h.login(u.email, u.password)).status).toBe(429);
    h.clock.advance(15 * MIN + 1000);
    const r = await h.login(u.email, u.password);
    expect(r.status).toBe(200);
    const [row] = await h.db.query<{ failed_attempts: number; locked_until: unknown }>('select failed_attempts, locked_until from identity.users where id = $1', [u.id]);
    expect(row!.failed_attempts).toBe(0);
    expect(row!.locked_until).toBeNull();
  });

  it('starts the count over after an unlock instead of relocking on one typo', async () => {
    const u = await h.register();
    for (let i = 0; i < 5; i++) await h.login(u.email, 'wrong password here');
    h.clock.advance(16 * MIN);
    expect((await h.login(u.email, 'wrong password here')).status).toBe(401);
    expect((await h.login(u.email, u.password)).status).toBe(200);
  });

  it('resets the counter on success so failures must be consecutive', async () => {
    const u = await h.register();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) await h.login(u.email, 'wrong password here');
      expect((await h.login(u.email, u.password)).status).toBe(200);
    }
    expect((await h.login(u.email, 'wrong password here')).status).toBe(401);
  });

  it('does not lock other accounts', async () => {
    const a = await h.register();
    const b = await h.register();
    for (let i = 0; i < 6; i++) await h.login(a.email, 'wrong password here');
    expect((await h.login(b.email, b.password)).status).toBe(200);
  });

  it('counts failures across app instances that share the database', async () => {
    const other = await makeHarness({ db: h.db, clock: h.clock });
    const u = await h.register();
    for (let i = 0; i < 5; i++) await (i % 2 ? h : other).login(u.email, 'wrong password here');
    expect((await h.login(u.email, u.password)).status).toBe(429);
    expect((await other.login(u.email, u.password)).status).toBe(429);
  });

  it('writes one lockout audit event when the lock trips', async () => {
    const u = await h.register();
    for (let i = 0; i < 7; i++) await h.login(u.email, 'wrong password here');
    const rows = await h.db.query<{ event: string }>("select event from identity.audit_log where user_id = $1 and event = 'lockout'", [u.id]);
    expect(rows).toHaveLength(1);
  });

  it('serializes parallel wrong guesses so none are lost', async () => {
    const u = await h.register();
    await Promise.all(Array.from({ length: 5 }, () => h.login(u.email, 'wrong password here')));
    expect((await h.login(u.email, u.password)).status).toBe(429);
  });
});
