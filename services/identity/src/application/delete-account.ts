import { AppError } from '@leanplate/security';
import type { AuditLog, Clock, SessionRepo, UserRepo } from './ports';
import { requireActiveSession } from './get-me';

export class DeleteAccount {
  constructor(private d: { users: UserRepo; sessions: SessionRepo; audit: AuditLog; clock: Clock }) {}

  async execute(input: { userId: string; sessionId: string }): Promise<void> {
    await requireActiveSession(this.d, input.userId, input.sessionId);
    // The id comes from the verified token, never from the request.
    if (!(await this.d.users.delete(input.userId))) throw new AppError(401, 'unauthorized', 'Your session has expired');
    await this.d.audit.record({ at: this.d.clock.now(), userId: input.userId, event: 'account_deleted' });
  }
}
