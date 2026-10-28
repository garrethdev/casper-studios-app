import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS } from './constants';
import type { User } from './user';

type LockFields = Pick<User, 'failedAttempts' | 'lockedUntil'>;

export interface FailureState {
  failedAttempts: number;
  lockedUntil: Date | null;
  /** True only for the failure that tripped the lock. */
  justLocked: boolean;
}

export const isLocked = (u: Pick<User, 'lockedUntil'>, now: Date): boolean => u.lockedUntil !== null && u.lockedUntil.getTime() > now.getTime();

/** Whole seconds until the lock ends, never less than 1 while locked. */
export function retryAfterSeconds(u: Pick<User, 'lockedUntil'>, now: Date): number {
  if (!u.lockedUntil) return 0;
  return Math.max(1, Math.ceil((u.lockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * The state after one more failed password. A lock that has run out starts the
 * count again from zero, so one typo after an unlock does not lock the account
 * a second time. A failure while still locked changes nothing.
 */
export function nextFailureState(u: LockFields, now: Date): FailureState {
  if (isLocked(u, now)) return { failedAttempts: u.failedAttempts, lockedUntil: u.lockedUntil, justLocked: false };
  const base = u.lockedUntil !== null ? 0 : u.failedAttempts;
  const failedAttempts = base + 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { failedAttempts, lockedUntil: new Date(now.getTime() + LOCKOUT_MS), justLocked: true };
  }
  return { failedAttempts, lockedUntil: null, justLocked: false };
}
