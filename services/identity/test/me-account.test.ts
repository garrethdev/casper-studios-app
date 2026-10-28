import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex, signAccessToken } from '@leanplate/security';
import { KEYS, makeHarness, newKeyPair, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const me = (bearer?: string) => h.call('GET', '/v1/me', { bearer });

describe('GET /v1/me', () => {
  it('returns the signed-in user and nothing else', async () => {
    const s = await h.signIn();
    const r = await me(s.accessToken);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ id: s.id, email: s.email });
  });

  it('requires a bearer token', async () => {
    const r = await me();
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('unauthorized');
  });

  it.each(['', 'Bearer', 'Bearer ', 'Basic abc', 'bearer abc.def.ghi', 'Bearer a b', 'Bearer not.a.jwt', 'Bearer ../../etc/passwd'])(
    'rejects malformed Authorization header %j',
    async (value) => {
      const r = await h.call('GET', '/v1/me', { headers: { authorization: value } });
      expect(r.status).toBe(401);
    },
  );

  it('rejects an expired access token', async () => {
    const s = await h.signIn();
    const sid = JSON.parse(Buffer.from(s.accessToken.split('.')[1]!, 'base64url').toString()).sid;
    const expired = await signAccessToken({ privateKeyPem: KEYS.privateKeyPem, userId: s.id, sessionId: sid, ttlSeconds: -60 });
    expect((await me(expired)).status).toBe(401);
    // Control: the same claims with a normal life work.
    const fresh = await signAccessToken({ privateKeyPem: KEYS.privateKeyPem, userId: s.id, sessionId: sid });
    expect((await me(fresh)).status).toBe(200);
  });

  it('rejects a token with a tampered payload (swapped user id)', async () => {
    const victim = await h.signIn();
    const attacker = await h.signIn();
    const [hd, pl, sig] = attacker.accessToken.split('.');
    const payload = JSON.parse(Buffer.from(pl!, 'base64url').toString());
    payload.sub = victim.id;
    const forged = `${hd}.${b64(payload)}.${sig}`;
    expect((await me(forged)).status).toBe(401);
  });

  it('rejects a token with a flipped signature byte', async () => {
    const s = await h.signIn();
    const parts = s.accessToken.split('.');
    const sig = Buffer.from(parts[2]!, 'base64url');
    sig[0] = sig[0]! ^ 0xff;
    expect((await me(`${parts[0]}.${parts[1]}.${sig.toString('base64url')}`)).status).toBe(401);
  });

  it('rejects a token signed with a different key', async () => {
    const s = await h.signIn();
    const sid = JSON.parse(Buffer.from(s.accessToken.split('.')[1]!, 'base64url').toString()).sid;
    const evil = await signAccessToken({ privateKeyPem: newKeyPair().privateKeyPem, userId: s.id, sessionId: sid });
    expect((await me(evil)).status).toBe(401);
  });

  it('rejects an unsigned token (alg none)', async () => {
    const s = await h.signIn();
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: s.id, sid: 'x', iss: 'leanplate-identity', aud: 'leanplate', exp: now + 600 })}.`;
    expect((await me(token)).status).toBe(401);
  });

  it('rejects algorithm confusion: HS256 signed with the public key as the secret', async () => {
    const s = await h.signIn();
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ sub: s.id, sid: 'x', iss: 'leanplate-identity', aud: 'leanplate', iat: now, exp: now + 600 });
    const sig = createHmac('sha256', KEYS.publicKeyPem).update(`${head}.${body}`).digest('base64url');
    expect((await me(`${head}.${body}.${sig}`)).status).toBe(401);
  });

  it('rejects a service token presented as the user token', async () => {
    const svc = await h.serviceToken();
    expect((await me(svc)).status).toBe(401);
  });

  it('rejects a correctly signed token with the wrong issuer or audience', async () => {
    const s = await h.signIn();
    const key = await (await import('jose')).importPKCS8(KEYS.privateKeyPem, 'ES256');
    const make = (iss: string, aud: string) =>
      new SignJWT({ sid: 'x' }).setProtectedHeader({ alg: 'ES256' }).setSubject(s.id).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(key);
    expect((await me(await make('someone-else', 'leanplate'))).status).toBe(401);
    expect((await me(await make('leanplate-identity', 'another-app'))).status).toBe(401);
  });

  it('rejects a valid-looking token whose session never existed', async () => {
    const s = await h.signIn();
    const orphan = await signAccessToken({ privateKeyPem: KEYS.privateKeyPem, userId: s.id, sessionId: '00000000-0000-4000-8000-000000000000' });
    expect((await me(orphan)).status).toBe(401);
  });

  it('does not let one user read another through the token subject', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    // A session id from user A paired with user B's id must not authenticate B.
    const sidA = JSON.parse(Buffer.from(a.accessToken.split('.')[1]!, 'base64url').toString()).sid;
    const mixed = await signAccessToken({ privateKeyPem: KEYS.privateKeyPem, userId: b.id, sessionId: sidA });
    const r = await me(mixed);
    expect(r.status === 401 || r.json.id === b.id).toBe(true);
    expect(r.json?.email).not.toBe(a.email);
  });

  it('never leaks password material', async () => {
    const s = await h.signIn();
    const r = await me(s.accessToken);
    expect(r.text).not.toMatch(/scrypt|password|hash/i);
  });
});

describe('DELETE /v1/account', () => {
  it('requires a user token', async () => {
    expect((await h.call('DELETE', '/v1/account')).status).toBe(401);
  });

  it('deletes the user and every session, then the old tokens stop working', async () => {
    const s = await h.signIn();
    const second = await h.login(s.email, s.password);
    const r = await h.call('DELETE', '/v1/account', { bearer: s.accessToken });
    expect(r.status).toBe(204);

    expect(await h.db.query('select id from identity.users where id = $1', [s.id])).toHaveLength(0);
    expect(await h.db.query('select id from identity.sessions where user_id = $1', [s.id])).toHaveLength(0);

    expect((await h.call('GET', '/v1/me', { bearer: s.accessToken })).status).toBe(401);
    expect((await h.call('POST', '/v1/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401);
    expect((await h.call('POST', '/v1/refresh', { body: { refreshToken: second.json.refreshToken } })).status).toBe(401);
    expect((await h.login(s.email, s.password)).status).toBe(401);
    expect((await h.call('DELETE', '/v1/account', { bearer: s.accessToken })).status).toBe(401);
  });

  it('only deletes the caller, never another user', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    await h.call('DELETE', '/v1/account', { bearer: a.accessToken });
    expect((await h.call('GET', '/v1/me', { bearer: b.accessToken })).status).toBe(200);
    expect(await h.db.query('select id from identity.users where id = $1', [b.id])).toHaveLength(1);
  });

  it('ignores any user id in the body or query string', async () => {
    const a = await h.signIn();
    const b = await h.signIn();
    const r = await h.call('DELETE', `/v1/account?id=${b.id}&userId=${b.id}`, { bearer: a.accessToken, body: { userId: b.id } });
    expect(r.status).toBe(204);
    expect(await h.db.query('select id from identity.users where id = $1', [b.id])).toHaveLength(1);
  });

  it('writes an account_deleted audit event that outlives the user and holds no personal data', async () => {
    const s = await h.signIn();
    await h.call('DELETE', '/v1/account', { bearer: s.accessToken });
    const rows = await h.db.query<{ event: string; detail: unknown }>("select event, detail from identity.audit_log where user_id = $1 and event = 'account_deleted'", [s.id]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(s.email);
  });

  it('frees the email for a new registration', async () => {
    const s = await h.signIn();
    await h.call('DELETE', '/v1/account', { bearer: s.accessToken });
    const again = await h.call('POST', '/v1/register', { body: { email: s.email, password: s.password } });
    expect(again.status).toBe(201);
    expect(again.json.user.id).not.toBe(s.id);
  });
});

describe('data hygiene', () => {
  it('no response in this suite ever contained a password hash or a raw database field', async () => {
    const all = h.seen.join('\n');
    expect(all).not.toMatch(/scrypt\$/);
    expect(all).not.toMatch(/password_hash|passwordHash|token_hash|failed_attempts/);
  });

  it('the audit log never holds passwords, hashes or tokens', async () => {
    const s = await h.signIn();
    await h.login(s.email, 'wrong password here');
    const rows = await h.db.query('select event, detail, user_id from identity.audit_log');
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(s.password);
    expect(dump).not.toContain('wrong password here');
    expect(dump).not.toContain('scrypt');
    expect(dump).not.toContain(s.refreshToken);
    expect(dump).not.toContain(sha256Hex(s.refreshToken));
    expect(dump).not.toContain(s.accessToken);
    expect(dump).not.toContain(s.email);
  });
});

