import { AppError, newId } from '@leanplate/security';
import type { TokenPair } from '@leanplate/contracts';
import { REFRESH_TTL_MS, isLocked, normalizeEmail, retryAfterSeconds } from '../domain';
import type { AuditLog, Clock, PasswordHasher, SessionRepo, TokenIssuer, UserRepo } from './ports';
import { buildTokenPair } from './token-pair';

const invalid = () => new AppError(401, 'invalid_credentials', 'Incorrect email or password');

export class LoginUser {
  constructor(private d: { users: UserRepo; sessions: SessionRepo; audit: AuditLog; clock: Clock; hasher: PasswordHasher; tokens: TokenIssuer }) {}

  async execute(input: { email: string; password: string }): Promise<TokenPair> {
    const { users, sessions, audit, clock, hasher, tokens } = this.d;
    const user = await users.findByEmail(normalizeEmail(input.email));

    if (!user) {
      await hasher.verifyDummy(input.password);
      await audit.record({ at: clock.now(), userId: null, event: 'login_failure', detail: { reason: 'unknown_user' } });
      throw invalid();
    }

    const start = clock.now();
    if (isLocked(user, start)) {
      throw new AppError(429, 'account_locked', 'Too many failed attempts. Try again later.', {
        'Retry-After': String(retryAfterSeconds(user, start)),
      });
    }

    const ok = await hasher.verify(input.password, user.passwordHash);
    const now = clock.now();
    if (!ok) {
      const state = await users.applyFailedLogin(user.id, now);
      await audit.record({ at: now, userId: user.id, event: 'login_failure', detail: { reason: 'bad_password', attempts: state?.failedAttempts ?? 0 } });
      if (state?.justLocked) await audit.record({ at: now, userId: user.id, event: 'lockout', detail: { attempts: state.failedAttempts } });
      throw invalid();
    }

    await users.recordSuccessfulLogin(user.id, now);
    await sessions.purgeExpired(user.id, now);
    const refresh = tokens.newRefreshToken();
    const sessionId = newId();
    await sessions.create({
      id: sessionId,
      userId: user.id,
      familyId: newId(),
      tokenHash: refresh.hash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    });
    await audit.record({ at: now, userId: user.id, event: 'login_success' });
    return buildTokenPair(tokens, user.id, sessionId, refresh.token);
  }
}
