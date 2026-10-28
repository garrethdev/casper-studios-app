import type { Db } from './db';

export interface Migration {
  id: string;
  sql: string;
}

/**
 * Applies each migration once, in order. The schema belongs to exactly one service.
 * Several serverless instances can cold-start at the same moment, so the whole
 * run holds a transaction-scoped advisory lock: the second instance waits, then
 * sees the first one's work and applies nothing.
 */
export async function migrate(db: Db, schema: string, migrations: Migration[]) {
  if (!/^[a-z_]+$/.test(schema)) throw new Error('invalid schema name');
  await db.exec(`create schema if not exists ${schema}`);
  await db.tx(async (q) => {
    await q.query(`select pg_advisory_xact_lock(hashtext($1))`, [`leanplate.migrate.${schema}`]);
    await q.exec(`create table if not exists ${schema}.__migrations (id text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await q.query<{ id: string }>(`select id from ${schema}.__migrations`)).map((r) => r.id));
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      await q.exec(m.sql);
      await q.query(`insert into ${schema}.__migrations (id) values ($1)`, [m.id]);
    }
  });
}
