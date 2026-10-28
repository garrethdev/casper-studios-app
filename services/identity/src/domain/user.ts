export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
}

/** Emails are compared case-insensitively, so they are stored in one canonical form. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
