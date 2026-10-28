import type { AuditEntry, FailureState, Session, User } from '../domain';

export interface Clock {
  now(): Date;
}

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface UserRepo {
  /** Returns false when the email is already registered. */
  create(user: NewUser): Promise<boolean>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Atomically records one failed password and returns the resulting state (null if the user is gone). */
  applyFailedLogin(userId: string, now: Date): Promise<FailureState | null>;
  recordSuccessfulLogin(userId: string, now: Date): Promise<void>;
  /** Deletes the user; sessions go with it. Returns false if there was no such user. */
  delete(userId: string): Promise<boolean>;
}

export type NewSession = Omit<Session, 'usedAt' | 'revokedAt'>;

export interface SessionRepo {
  create(session: NewSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  /**
   * In one transaction: mark `oldId` used and insert `next`. Returns false,
   * and changes nothing, if `oldId` was already used, revoked or expired.
   */
  rotate(oldId: string, next: NewSession, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  /** True while the session exists and its family has not been revoked. */
  isActive(sessionId: string): Promise<boolean>;
  purgeExpired(userId: string, now: Date): Promise<void>;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
  /** Spends the same time as a real check, for accounts that do not exist. */
  verifyDummy(password: string): Promise<void>;
}

export interface TokenIssuer {
  issueAccessToken(userId: string, sessionId: string): Promise<{ token: string; expiresIn: number }>;
  newRefreshToken(): { token: string; hash: string };
  hashRefreshToken(token: string): string;
}
