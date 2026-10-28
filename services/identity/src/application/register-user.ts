import { AppError, checkPasswordPolicy, newId } from '@leanplate/security';
import type { UserDto } from '@leanplate/contracts';
import { normalizeEmail } from '../domain';
import type { AuditLog, Clock, PasswordHasher, UserRepo } from './ports';

export class RegisterUser {
  constructor(private d: { users: UserRepo; audit: AuditLog; clock: Clock; hasher: PasswordHasher }) {}

  async execute(input: { email: string; password: string }): Promise<UserDto> {
    const email = normalizeEmail(input.email);
    const problems = checkPasswordPolicy(input.password, email);
    if (problems.length > 0) throw new AppError(400, 'weak_password', problems.join(' '));

    // Hash before touching the database so a taken email costs the same time as a free one.
    const passwordHash = await this.d.hasher.hash(input.password);
    const now = this.d.clock.now();
    const id = newId();
    const created = await this.d.users.create({ id, email, passwordHash, createdAt: now });
    if (!created) throw new AppError(409, 'email_taken', 'An account with that email already exists');

    await this.d.audit.record({ at: now, userId: id, event: 'register' });
    return { id, email };
  }
}
