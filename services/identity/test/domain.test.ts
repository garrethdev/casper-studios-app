import { describe, expect, it } from 'vitest';
import { LOCKOUT_MS, isLocked, nextFailureState, normalizeEmail, retryAfterSeconds, sessionStatus } from '../src/domain';

const t0 = new Date('2026-03-01T12:00:00Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);

describe('lockout policy', () => {
  it('counts failures and locks on the fifth', () => {
    let u = { failedAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 1; i <= 4; i++) {
      const s = nextFailureState(u, t0);
      expect(s.failedAttempts).toBe(i);
      expect(s.lockedUntil).toBeNull();
      expect(s.justLocked).toBe(false);
      u = s;
    }
    const fifth = nextFailureState(u, t0);
    expect(fifth.justLocked).toBe(true);
    expect(fifth.lockedUntil).toEqual(plus(LOCKOUT_MS));
  });

  it('does not extend or recount while locked', () => {
    const locked = { failedAttempts: 5, lockedUntil: plus(LOCKOUT_MS) };
    const s = nextFailureState(locked, plus(1000));
    expect(s).toEqual({ failedAttempts: 5, lockedUntil: locked.lockedUntil, justLocked: false });
  });

  it('starts counting from zero after a lock runs out', () => {
    const expired = { failedAttempts: 5, lockedUntil: plus(LOCKOUT_MS) };
    const s = nextFailureState(expired, plus(LOCKOUT_MS + 1));
    expect(s.failedAttempts).toBe(1);
    expect(s.lockedUntil).toBeNull();
  });

  it('reports lock state and a positive retry time', () => {
    const u = { lockedUntil: plus(1500) };
    expect(isLocked(u, t0)).toBe(true);
    expect(isLocked(u, plus(1500))).toBe(false);
    expect(retryAfterSeconds(u, t0)).toBe(2);
    expect(retryAfterSeconds({ lockedUntil: null }, t0)).toBe(0);
  });
});

describe('session status', () => {
  const base = { usedAt: null, revokedAt: null, expiresAt: plus(1000) };
  it('classifies tokens', () => {
    expect(sessionStatus(base, t0)).toBe('active');
    expect(sessionStatus({ ...base, usedAt: t0 }, t0)).toBe('late'); // seconds-old reuse: another tab, not a thief
    expect(sessionStatus({ ...base, usedAt: t0 }, new Date(t0.getTime() + 10_000))).toBe('reused');
    expect(sessionStatus({ ...base, revokedAt: t0 }, t0)).toBe('reused');
    expect(sessionStatus(base, plus(1000))).toBe('expired');
  });
});

describe('email', () => {
  it('normalizes to lowercase', () => {
    expect(normalizeEmail('  Ann.Lee@Example.COM ')).toBe('ann.lee@example.com');
  });
});
