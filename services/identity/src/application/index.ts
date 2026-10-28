export * from './ports';
export * from './register-user';
export * from './login-user';
export * from './refresh-session';
export * from './logout-session';
export * from './get-me';
export * from './delete-account';

import type { AuditLog, Clock, PasswordHasher, SessionRepo, TokenIssuer, UserRepo } from './ports';
import { DeleteAccount } from './delete-account';
import { GetMe } from './get-me';
import { LoginUser } from './login-user';
import { LogoutSession } from './logout-session';
import { RefreshSession } from './refresh-session';
import { RegisterUser } from './register-user';

export interface Ports {
  users: UserRepo;
  sessions: SessionRepo;
  audit: AuditLog;
  clock: Clock;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
}

export function createUseCases(p: Ports) {
  return {
    register: new RegisterUser(p),
    login: new LoginUser(p),
    refresh: new RefreshSession(p),
    logout: new LogoutSession(p),
    me: new GetMe(p),
    deleteAccount: new DeleteAccount(p),
  };
}
export type UseCases = ReturnType<typeof createUseCases>;
