import type { Db } from '@leanplate/platform';
import { nextFailureState, type FailureState, type User } from '../domain';
import type { NewUser, UserRepo } from '../application';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
  failed_attempts: number | string;
  locked_until: Date | string | null;
  last_login_at: Date | string | null;
}

const COLUMNS = 'id, email, password_hash, created_at, failed_attempts, locked_until, last_login_at';
const date = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    createdAt: new Date(r.created_at),
    failedAttempts: Number(r.failed_attempts),
    lockedUntil: date(r.locked_until),
    lastLoginAt: date(r.last_login_at),
  };
}

export class PgUserRepo implements UserRepo {
  constructor(private db: Db) {}

  async create(u: NewUser): Promise<boolean> {
    const rows = await this.db.query(
      `insert into identity.users (id, email, password_hash, created_at) values ($1, $2, $3, $4::timestamptz)
       on conflict (email) do nothing returning id`,
      [u.id, u.email, u.passwordHash, u.createdAt.toISOString()],
    );
    return rows.length === 1;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db.query<UserRow>(`select ${COLUMNS} from identity.users where email = $1`, [email]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.query<UserRow>(`select ${COLUMNS} from identity.users where id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** The row is locked for the read-modify-write, so parallel instances cannot lose a failure. */
  async applyFailedLogin(userId: string, now: Date): Promise<FailureState | null> {
    return this.db.tx(async (q) => {
      const rows = await q.query<UserRow>(`select ${COLUMNS} from identity.users where id = $1 for update`, [userId]);
      if (!rows[0]) return null;
      const state = nextFailureState(toUser(rows[0]), now);
      await q.query(`update identity.users set failed_attempts = $2, locked_until = $3::timestamptz where id = $1`, [
        userId,
        state.failedAttempts,
        iso(state.lockedUntil),
      ]);
      return state;
    });
  }

  async recordSuccessfulLogin(userId: string, now: Date): Promise<void> {
    await this.db.query(
      `update identity.users set failed_attempts = 0, locked_until = null, last_login_at = $2::timestamptz where id = $1`,
      [userId, now.toISOString()],
    );
  }

  async delete(userId: string): Promise<boolean> {
    const rows = await this.db.query(`delete from identity.users where id = $1 returning id`, [userId]);
    return rows.length === 1;
  }
}
