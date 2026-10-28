import { describe, expect, it } from 'vitest';
import { RateLimiter } from '@leanplate/security';
import { LOCAL_IP, clientIpFrom, limiterKey } from '../lib/client-ip';

const h = (xff?: string) => ({ get: (n: string) => (n.toLowerCase() === 'x-forwarded-for' ? (xff ?? null) : null) });

describe('client IP and rate limiter keys', () => {
  it('uses the first x-forwarded-for entry only', () => {
    expect(clientIpFrom(h('203.0.113.7'))).toBe('203.0.113.7');
    expect(clientIpFrom(h('203.0.113.7, 10.0.0.1, 10.0.0.2'))).toBe('203.0.113.7');
    expect(clientIpFrom(h('  203.0.113.7  ,198.51.100.1'))).toBe('203.0.113.7');
  });

  it('accepts IPv6 and normalizes case', () => {
    expect(clientIpFrom(h('2001:DB8::1'))).toBe('2001:db8::1');
  });

  it('missing header falls back to "local"', () => {
    expect(clientIpFrom(h())).toBe(LOCAL_IP);
    expect(clientIpFrom(h(''))).toBe(LOCAL_IP);
  });

  it('malformed first entries fall back to "local" instead of looking at later entries or minting buckets', () => {
    for (const bad of ['not-an-ip', '999.1.1.1', '1.2.3', '<script>', 'a'.repeat(100), ', 203.0.113.7', '203.0.113.7:8080', '1.2.3.4/24', 'x'.repeat(500)]) {
      expect(clientIpFrom(h(bad))).toBe(LOCAL_IP);
    }
  });

  it('a spoofed tail does not change the key an attacker is limited under', () => {
    const k1 = limiterKey('login', clientIpFrom(h('198.51.100.9, 1.1.1.1')));
    const k2 = limiterKey('login', clientIpFrom(h('198.51.100.9, 2.2.2.2')));
    expect(k1).toBe(k2);
  });

  it('keys are namespaced per scope', () => {
    expect(limiterKey('login', '1.2.3.4')).not.toBe(limiterKey('register', '1.2.3.4'));
  });

  it('login limiter: 10 per minute per IP, other IPs unaffected, window slides', () => {
    const rl = new RateLimiter(60_000, 10);
    const key = (xff: string) => limiterKey('login', clientIpFrom(h(xff)));
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(rl.check(key('203.0.113.1'), t0 + i)).toBe(0);
    expect(rl.check(key('203.0.113.1'), t0 + 20)).toBeGreaterThan(0);
    // changing the junk after the first entry does not buy more attempts
    expect(rl.check(key('203.0.113.1, 9.9.9.9'), t0 + 30)).toBeGreaterThan(0);
    expect(rl.check(key('203.0.113.2'), t0 + 30)).toBe(0);
    expect(rl.check(key('203.0.113.1'), t0 + 61_000)).toBe(0);
  });

  it('junk values all share the single "local" bucket', () => {
    const rl = new RateLimiter(60_000, 5);
    const t0 = 5_000_000;
    for (let i = 0; i < 5; i++) expect(rl.check(limiterKey('register', clientIpFrom(h(`junk-${i}`))), t0)).toBe(0);
    expect(rl.check(limiterKey('register', clientIpFrom(h('junk-again'))), t0)).toBeGreaterThan(0);
  });
});
