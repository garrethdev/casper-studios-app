import type { Db } from '@leanplate/platform';
import type { AuditEntry } from '../domain';
import type { AuditLog } from '../application';

export class PgAuditLog implements AuditLog {
  constructor(private db: Db) {}

  async record(e: AuditEntry): Promise<void> {
    await this.db.query(`insert into identity.audit_log (at, user_id, event, detail) values ($1::timestamptz, $2, $3, $4::jsonb)`, [
      e.at.toISOString(),
      e.userId,
      e.event,
      JSON.stringify(e.detail ?? {}),
    ]);
  }
}
