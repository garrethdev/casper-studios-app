import { AppError, newId } from '@leanplate/security';
import type { TokenPair } from '@leanplate/contracts';
import { REFRESH_TTL_MS, sessionStatus } from '../domain';
import type { AuditLog, Clock, SessionRepo, TokenIssuer } from './ports';
import { buildTokenPair } from './token-pair';

// One body for every refresh failure, so a caller learns nothing about why.
const rejected = () => new AppError(401, 'invalid_refresh', 'Your session has expired. Please sign in again.');

export class RefreshSession {
  constructor(private d: { sessions: SessionRepo; audit: AuditLog; clock: Clock; tokens: TokenIssuer }) {}

  async execute(input: { refreshToken: string }): Promise<TokenPair> {
    const { sessions, audit, clock, tokens } = this.d;
    const now = clock.now();
    const current = await sessions.findByTokenHash(tokens.hashRefreshToken(input.refreshToken));
    if (!current) throw rejected();

    const status = sessionStatus(current, now);
    if (status === 'expired' || status === 'late') throw rejected();
    if (status === 'reused') return this.reuseDetected(current.familyId, current.userId, now);

    const refresh = tokens.newRefreshToken();
    const next = {
      id: newId(),
      userId: current.userId,
      familyId: current.familyId,
      tokenHash: refresh.hash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    };
    // Losing this race means another request used the same token first: also a replay.
    if (!(await sessions.rotate(current.id, next, now))) return this.reuseDetected(current.familyId, current.userId, now);
    return buildTokenPair(tokens, current.userId, next.id, refresh.token);
  }

  private async reuseDetected(familyId: string, userId: string, now: Date): Promise<never> {
    await this.d.sessions.revokeFamily(familyId, now);
    await this.d.audit.record({ at: now, userId, event: 'refresh_reuse', detail: { familyId } });
    throw rejected();
  }
}
