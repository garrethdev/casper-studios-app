import { beforeAll, describe, expect, it } from 'vitest';
import { GOOD_PASSWORD, makeHarness, uniqueEmail, type Harness } from './helpers';

let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
});

describe('POST /v1/register', () => {
  it('creates a user and returns only id and email', async () => {
    const email = uniqueEmail();
    const r = await h.call('POST', '/v1/register', { body: { email, password: GOOD_PASSWORD } });
    expect(r.status).toBe(201);
    expect(Object.keys(r.json)).toEqual(['user']);
    expect(Object.keys(r.json.user).sort()).toEqual(['email', 'id']);
    expect(r.json.user.email).toBe(email);
    expect(r.json.user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores the password only as a scrypt hash', async () => {
    const email = uniqueEmail();
    await h.register(email, GOOD_PASSWORD);
    const [row] = await h.db.query<{ password_hash: string }>('select password_hash from identity.users where email = $1', [email]);
    expect(row!.password_hash.startsWith('scrypt$')).toBe(true);
    expect(row!.password_hash).not.toContain(GOOD_PASSWORD);
  });

  it('normalizes the email to lowercase and treats case variants as the same account', async () => {
    const base = uniqueEmail('case');
    const r = await h.call('POST', '/v1/register', { body: { email: `  ${base.toUpperCase()} `, password: GOOD_PASSWORD } });
    expect(r.status).toBe(201);
    expect(r.json.user.email).toBe(base);
    const dup = await h.call('POST', '/v1/register', { body: { email: base, password: GOOD_PASSWORD } });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('email_taken');
    const login = await h.login(base.toUpperCase(), GOOD_PASSWORD);
    expect(login.status).toBe(200);
  });

  it('rejects a duplicate email with 409 and keeps the original password', async () => {
    const u = await h.register();
    const r = await h.call('POST', '/v1/register', { body: { email: u.email, password: 'another long passphrase 99' } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('email_taken');
    expect((await h.login(u.email, u.password)).status).toBe(200);
    expect((await h.login(u.email, 'another long passphrase 99')).status).toBe(401);
  });

  it('survives a race of identical registrations: exactly one wins', async () => {
    const email = uniqueEmail('race');
    const results = await Promise.all(Array.from({ length: 4 }, () => h.call('POST', '/v1/register', { body: { email, password: GOOD_PASSWORD } })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const rows = await h.db.query('select id from identity.users where email = $1', [email]);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['too short', 'short1!'],
    ['11 characters', 'abcdefgh123'],
  ])('rejects a password that is %s with 400 invalid_request', async (_n, password) => {
    const r = await h.call('POST', '/v1/register', { body: { email: uniqueEmail(), password } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('invalid_request');
  });

  it.each([
    ['a common password', 'password12345'],
    ['one repeated character', 'aaaaaaaaaaaaaaaa'],
    ['a keyboard sequence', '1234567890abcdef'],
  ])('applies the password policy: %s', async (_n, password) => {
    const r = await h.call('POST', '/v1/register', { body: { email: uniqueEmail(), password } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('weak_password');
  });

  it('rejects a password that contains the email name', async () => {
    const r = await h.call('POST', '/v1/register', { body: { email: 'jonathan@example.com', password: 'my-jonathan-secret-1' } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('weak_password');
  });

  it('rejects a password over 128 characters', async () => {
    const r = await h.call('POST', '/v1/register', { body: { email: uniqueEmail(), password: 'x1'.repeat(65) } });
    expect(r.status).toBe(400);
  });

  it.each(['not-an-email', '', 'a@b', 'spaces in@example.com', `${'a'.repeat(250)}@example.com`])('rejects bad email %j', async (email) => {
    const r = await h.call('POST', '/v1/register', { body: { email, password: GOOD_PASSWORD } });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('invalid_request');
  });

  it('does not echo the password in any error', async () => {
    const secret = 'Tr0ub4dor&3-but-short';
    const r = await h.call('POST', '/v1/register', { body: { email: 'bad', password: secret } });
    expect(r.text).not.toContain(secret);
  });

  it('writes a register audit event without secrets', async () => {
    const u = await h.register();
    const rows = await h.db.query<{ event: string; detail: unknown }>("select event, detail from identity.audit_log where user_id = $1 and event = 'register'", [u.id]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(u.password);
  });
});
