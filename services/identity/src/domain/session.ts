export interface Session {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

import { REFRESH_REUSE_GRACE_MS } from './constants';

export type SessionStatus = 'active' | 'late' | 'reused' | 'expired';

/**
 * A refresh token may be presented exactly once. A token that was already used
 * or revoked is a replay (possibly a thief), which the caller answers by
 * revoking the whole family. The one exception is a token used only seconds
 * ago: two browser tabs, or two serverless instances, can race on the same
 * cookie, and that is refused without punishing the family. An unused token
 * past its expiry is simply stale.
 */
export function sessionStatus(s: Pick<Session, 'usedAt' | 'revokedAt' | 'expiresAt'>, now: Date, graceMs = REFRESH_REUSE_GRACE_MS): SessionStatus {
  if (s.revokedAt) return 'reused';
  if (s.usedAt) return now.getTime() - s.usedAt.getTime() < graceMs ? 'late' : 'reused';
  if (s.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}
