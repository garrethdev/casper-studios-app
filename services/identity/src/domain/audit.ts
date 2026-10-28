export type AuditEvent =
  | 'register'
  | 'login_success'
  | 'login_failure'
  | 'lockout'
  | 'refresh_reuse'
  | 'logout'
  | 'account_deleted';

export interface AuditEntry {
  at: Date;
  userId: string | null;
  event: AuditEvent;
  /** Never put passwords, tokens, hashes or email addresses here. */
  detail?: Record<string, string | number | boolean | null>;
}
