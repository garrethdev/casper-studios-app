import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  RateLimiter, checkPasswordPolicy, hashPassword, isSameOrigin, signAccessToken, signServiceToken,
  sniffImage, verifyAccessToken, verifyPassword, verifyServiceToken,
} from '../src';

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};

describe('passwords', () => {
  it('hashes with a unique salt and verifies', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toEqual(b);
    expect(await verifyPassword('correct horse battery staple', a)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', a)).toBe(false);
  });
  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'md5$1$2$3$4$5')).toBe(false);
  });
  it('enforces the policy', () => {
    expect(checkPasswordPolicy('short', 'a@b.co').length).toBeGreaterThan(0);
    expect(checkPasswordPolicy('password1234', 'a@b.co')).toContain('That password is too common.');
    expect(checkPasswordPolicy('garreth-is-cool-2026', 'garreth@x.com').join()).toMatch(/email/);
    expect(checkPasswordPolicy('aaaaaaaaaaaaaaaa', 'a@b.co').join()).toMatch(/variety/);
    expect(checkPasswordPolicy('plum-orbit-tangent-77', 'a@b.co')).toEqual([]);
  });
});

describe('access tokens', () => {
  it('round-trips', async () => {
    const { priv, pub } = pair();
    const t = await signAccessToken({ privateKeyPem: priv, userId: 'u1', sessionId: 's1' });
    expect(await verifyAccessToken(t, pub)).toEqual({ userId: 'u1', sessionId: 's1' });
  });
  it('rejects a token signed by a different key', async () => {
    const a = pair(), b = pair();
    const t = await signAccessToken({ privateKeyPem: a.priv, userId: 'u1', sessionId: 's1' });
    await expect(verifyAccessToken(t, b.pub)).rejects.toThrow();
  });
  it('rejects tampered payloads', async () => {
    const { priv, pub } = pair();
    const t = await signAccessToken({ privateKeyPem: priv, userId: 'u1', sessionId: 's1' });
    const [h, , s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', sid: 's1', iss: 'leanplate-identity', aud: 'leanplate', exp: 9999999999 })).toString('base64url');
    await expect(verifyAccessToken(`${h}.${forged}.${s}`, pub)).rejects.toThrow();
  });
  it('rejects alg=none and HS256-with-public-key confusion', async () => {
    const { pub } = pair();
    const none = [Buffer.from('{"alg":"none"}').toString('base64url'), Buffer.from('{"sub":"u1","sid":"s","iss":"leanplate-identity","aud":"leanplate"}').toString('base64url'), ''].join('.');
    await expect(verifyAccessToken(none, pub)).rejects.toThrow();
    const hs = await new SignJWT({ sid: 's' }).setProtectedHeader({ alg: 'HS256' }).setSubject('u1').setIssuer('leanplate-identity').setAudience('leanplate').setExpirationTime('5m').sign(new TextEncoder().encode(pub));
    await expect(verifyAccessToken(hs, pub)).rejects.toThrow();
  });
  it('rejects expired tokens', async () => {
    const { priv, pub } = pair();
    const t = await signAccessToken({ privateKeyPem: priv, userId: 'u1', sessionId: 's1', ttlSeconds: -60 });
    await expect(verifyAccessToken(t, pub)).rejects.toThrow();
  });
});

describe('service tokens', () => {
  const secret = 'x'.repeat(40);
  it('accepts the right caller and audience', async () => {
    const t = await signServiceToken({ secret, issuer: 'web', audience: 'meals', userId: 'u1', clientIpHash: 'abc' });
    expect(await verifyServiceToken(t, { secret, audience: 'meals', allowedIssuers: ['web'] })).toEqual({ issuer: 'web', userId: 'u1', clientIpHash: 'abc' });
  });
  it('rejects wrong audience, caller, or secret', async () => {
    const t = await signServiceToken({ secret, issuer: 'web', audience: 'meals' });
    await expect(verifyServiceToken(t, { secret, audience: 'identity', allowedIssuers: ['web'] })).rejects.toThrow();
    await expect(verifyServiceToken(t, { secret, audience: 'meals', allowedIssuers: ['meals'] })).rejects.toThrow();
    await expect(verifyServiceToken(t, { secret: 'y'.repeat(40), audience: 'meals', allowedIssuers: ['web'] })).rejects.toThrow();
  });
  it('refuses short secrets', async () => {
    await expect(signServiceToken({ secret: 'short', issuer: 'web', audience: 'meals' })).rejects.toThrow();
  });
});

describe('upload sniffing and origin checks', () => {
  it('identifies real images by their bytes', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });
  it('refuses everything else', () => {
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImage(Buffer.from('<?php system($_GET[1]);'))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
  it('allows only same-origin state changes', () => {
    const allowed = ['https://app.example'];
    expect(isSameOrigin({ method: 'GET' }, allowed)).toBe(true);
    expect(isSameOrigin({ method: 'POST', origin: 'https://app.example' }, allowed)).toBe(true);
    expect(isSameOrigin({ method: 'POST', origin: 'https://evil.example' }, allowed)).toBe(false);
    expect(isSameOrigin({ method: 'POST' }, allowed)).toBe(false);
    expect(isSameOrigin({ method: 'DELETE', secFetchSite: 'same-origin' }, allowed)).toBe(true);
    expect(isSameOrigin({ method: 'POST', secFetchSite: 'cross-site' }, allowed)).toBe(false);
  });
});

describe('rate limiter', () => {
  it('blocks after max hits and recovers after the window', () => {
    const rl = new RateLimiter(1000, 3);
    expect([rl.check('k', 0), rl.check('k', 1), rl.check('k', 2)]).toEqual([0, 0, 0]);
    expect(rl.check('k', 3)).toBeGreaterThan(0);
    expect(rl.check('other', 3)).toBe(0);
    expect(rl.check('k', 1100)).toBe(0);
  });
});
