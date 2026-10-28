import { AppError } from '@leanplate/security';
import type { UserDto } from '@leanplate/contracts';
import type { SessionRepo, UserRepo } from './ports';

const unauthorized = () => new AppError(401, 'unauthorized', 'Your session has expired');

/**
 * Access tokens are stateless, but identity still refuses one whose session
 * family was revoked (logout, replay) or whose user no longer exists.
 */
export async function requireActiveSession(d: { users: UserRepo; sessions: SessionRepo }, userId: string, sessionId: string) {
  if (!(await d.sessions.isActive(sessionId))) throw unauthorized();
  const user = await d.users.findById(userId);
  if (!user) throw unauthorized();
  return user;
}

export class GetMe {
  constructor(private d: { users: UserRepo; sessions: SessionRepo }) {}

  async execute(input: { userId: string; sessionId: string }): Promise<UserDto> {
    const user = await requireActiveSession(this.d, input.userId, input.sessionId);
    return { id: user.id, email: user.email };
  }
}
