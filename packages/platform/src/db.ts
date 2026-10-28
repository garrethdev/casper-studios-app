import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findRoot } from './root';

export interface Queryable {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
}
export interface Db extends Queryable {
  kind: 'pglite' | 'postgres';
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * One database per service. Locally each service gets its own embedded Postgres
 * (PGlite) under .data/. In production the same SQL runs on Postgres (Supabase),
 * where each service owns one schema.
 *   dataDir === null  -> in-memory (tests)
 */
export async function createDb(opts: { service: string; databaseUrl?: string; dataDir?: string | null }): Promise<Db> {
  const url = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (url) return postgresDb(url);
  if (process.env.VERCEL === '1') throw new Error('DATABASE_URL is required in production');
  let dir: string | undefined;
  if (opts.dataDir !== null) {
    dir = opts.dataDir ?? join(findRoot(), '.data', opts.service);
    mkdirSync(dirname(dir), { recursive: true });
  }
  return pgliteDb(dir);
}

async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    kind: 'pglite',
    query: async (text, params) => (await db.query(text, params as any[])).rows as any[],
    exec: async (text) => {
      await db.exec(text);
    },
    tx: (fn) =>
      db.transaction((t) =>
        fn({
          query: async (text, params) => (await t.query(text, params as any[])).rows as any[],
          exec: async (text) => {
            await t.exec(text);
          },
        }),
      ),
    close: () => db.close(),
  };
}

async function postgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const local = /localhost|127\.0\.0\.1/.test(url);
  // prepare:false keeps us compatible with Supabase's transaction pooler. A serverless
  // instance handles one request at a time, so it gets one connection; otherwise a burst
  // of instances multiplies into more connections than the pooler allows.
  const max = process.env.VERCEL === '1' ? 1 : 3;
  const sql = postgres(url, { max, idle_timeout: 20, connect_timeout: 10, prepare: false, ssl: local ? false : 'require' });
  return {
    kind: 'postgres',
    query: async (text, params) => (await sql.unsafe(text, (params ?? []) as any[])) as any[],
    exec: async (text) => {
      await sql.unsafe(text);
    },
    tx: (fn) =>
      sql.begin((t) =>
        fn({
          query: async (text, params) => (await t.unsafe(text, (params ?? []) as any[])) as any[],
          exec: async (text) => {
            await t.unsafe(text);
          },
        }),
      ) as Promise<any>,
    close: () => sql.end(),
  };
}
