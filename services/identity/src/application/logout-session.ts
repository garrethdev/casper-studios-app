import type { AuditLog, Clock, SessionRepo, TokenIssuer } from './ports';

export class LogoutSession {
  constructor(private d: { sessions: SessionRepo; audit: AuditLog; clock: Clock; tokens: TokenIssuer }) {}

  /** Never reports whether the token was known. */
  async execute(input: { refreshToken: string }): Promise<void> {
    const { sessions, audit, clock, tokens } = this.d;
    const session = await sessions.findByTokenHash(tokens.hashRefreshToken(input.refreshToken));
    if (!session) return;
    const now = clock.now();
    await sessions.revokeFamily(session.familyId, now);
    await audit.record({ at: now, userId: session.userId, event: 'logout', detail: { familyId: session.familyId } });
  }
}
