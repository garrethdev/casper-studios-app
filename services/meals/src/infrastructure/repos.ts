import type { MealRecord, Profile, ProfileInput } from '@leanplate/contracts';
import type { Db } from '@leanplate/platform';
import type { MealRepo, ProfileRepo, UsageRepo } from '../application/ports';

const iso = (v: unknown) => new Date(v as string | Date).toISOString();
const json = (v: unknown) => JSON.stringify(v);

export class PgProfileRepo implements ProfileRepo {
  constructor(private db: Db) {}

  async get(userId: string): Promise<Profile | null> {
    const [row] = await this.db.query(`select data, updated_at from meals.profiles where user_id = $1`, [userId]);
    return row ? { ...row.data, updatedAt: iso(row.updated_at) } : null;
  }

  async upsert(userId: string, input: Omit<ProfileInput, 'acceptedDisclaimer'>, now: Date): Promise<Profile> {
    await this.db.query(
      `insert into meals.profiles (user_id, data, updated_at) values ($1, $2::jsonb, $3)
       on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
      [userId, json(input), now.toISOString()],
    );
    return { ...input, updatedAt: now.toISOString() };
  }

  async delete(userId: string): Promise<void> {
    await this.db.query(`delete from meals.profiles where user_id = $1`, [userId]);
  }
}

const toMeal = (r: Record<string, any>): MealRecord => ({
  id: r.id,
  eatenAt: iso(r.eaten_at),
  mealType: r.meal_type,
  items: r.items,
  totals: r.totals,
  verdict: r.verdict,
  feedback: r.feedback ?? null,
  note: r.note ?? null,
});

export class PgMealRepo implements MealRepo {
  constructor(private db: Db) {}

  async insert(userId: string, m: MealRecord, key: string) {
    const rows = await this.db.query(
      `insert into meals.meals (id, user_id, idempotency_key, eaten_at, meal_type, items, totals, verdict, feedback, note)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
       on conflict (user_id, idempotency_key) do nothing returning id`,
      [m.id, userId, key, m.eatenAt, m.mealType, json(m.items), json(m.totals), json(m.verdict), m.feedback ? json(m.feedback) : null, m.note],
    );
    if (rows.length) return { meal: m, created: true };
    const [existing] = await this.db.query(`select * from meals.meals where user_id = $1 and idempotency_key = $2`, [userId, key]);
    return { meal: toMeal(existing!), created: false };
  }

  async between(userId: string, from: Date, to: Date): Promise<MealRecord[]> {
    const rows = await this.db.query(
      `select * from meals.meals where user_id = $1 and eaten_at >= $2 and eaten_at < $3 order by eaten_at asc, created_at asc`,
      [userId, from.toISOString(), to.toISOString()],
    );
    return rows.map(toMeal);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.query(`delete from meals.meals where user_id = $1 and id = $2 returning id`, [userId, id]);
    return rows.length > 0;
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.query(`delete from meals.meals where user_id = $1`, [userId]);
  }
}

export class PgUsageRepo implements UsageRepo {
  constructor(private db: Db) {}

  /** One upsert, so two instances incrementing at once both see the true count. */
  async increment(userId: string, now: Date): Promise<number> {
    const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
    const [row] = await this.db.query<{ count: number | string }>(
      `insert into meals.usage (user_id, hour, count) values ($1, $2, 1)
       on conflict (user_id, hour) do update set count = meals.usage.count + 1 returning count`,
      [userId, hour],
    );
    return Number(row!.count);
  }
}
