import type { Db } from '@leanplate/platform';
import type { Session } from '../domain';
import type { NewSession, SessionRepo } from '../application';

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  created_at: Date | string;
  expires_at: Date | string;
  used_at: Date | string | null;
  revoked_at: Date | string | null;
}

const COLUMNS = 'id, user_id, family_id, token_hash, created_at, expires_at, used_at, revoked_at';
const date = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

function toSession(r: SessionRow): Session {
  return {
    id: r.id,
    userId: r.user_id,
    familyId: r.family_id,
    tokenHash: r.token_hash,
    createdAt: new Date(r.created_at),
    expiresAt: new Date(r.expires_at),
    usedAt: date(r.used_at),
    revokedAt: date(r.revoked_at),
  };
}

const INSERT = `insert into identity.sessions (id, user_id, family_id, token_hash, created_at, expires_at)
                values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`;
const insertParams = (s: NewSession) => [s.id, s.userId, s.familyId, s.tokenHash, s.createdAt.toISOString(), s.expiresAt.toISOString()];

export class PgSessionRepo implements SessionRepo {
  constructor(private db: Db) {}

  async create(s: NewSession): Promise<void> {
    await this.db.query(INSERT, insertParams(s));
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const rows = await this.db.query<SessionRow>(`select ${COLUMNS} from identity.sessions where token_hash = $1`, [tokenHash]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async rotate(oldId: string, next: NewSession, now: Date): Promise<boolean> {
    return this.db.tx(async (q) => {
      // The conditional update is the single point where two racing requests are told apart.
      const won = await q.query(
        `update identity.sessions set used_at = $2::timestamptz
         where id = $1 and used_at is null and revoked_at is null and expires_at > $2::timestamptz returning id`,
        [oldId, now.toISOString()],
      );
      if (won.length !== 1) return false;
      await q.query(INSERT, insertParams(next));
      return true;
    });
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.db.query(`update identity.sessions set revoked_at = $2::timestamptz where family_id = $1 and revoked_at is null`, [
      familyId,
      now.toISOString(),
    ]);
  }

  async isActive(sessionId: string): Promise<boolean> {
    const rows = await this.db.query<{ revoked_at: Date | string | null }>(`select revoked_at from identity.sessions where id = $1`, [sessionId]);
    return rows.length === 1 && rows[0]!.revoked_at === null;
  }

  async purgeExpired(userId: string, now: Date): Promise<void> {
    await this.db.query(`delete from identity.sessions where user_id = $1 and expires_at <= $2::timestamptz`, [userId, now.toISOString()]);
  }
}
