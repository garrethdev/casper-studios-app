import { describe, expect, it } from 'vitest';
import { createDb, migrate } from '../src';

describe('database layer', () => {
  it('migrates idempotently and isolates schemas', async () => {
    const db = await createDb({ service: 't', dataDir: null });
    const m = [{ id: '001', sql: 'create table demo.items (id int primary key, v text);' }];
    await migrate(db, 'demo', m);
    await migrate(db, 'demo', m);
    await db.query('insert into demo.items values ($1, $2)', [1, 'a']);
    expect(await db.query('select v from demo.items')).toEqual([{ v: 'a' }]);
    await db.close();
  });
  it('rolls a transaction back on error', async () => {
    const db = await createDb({ service: 't', dataDir: null });
    await migrate(db, 'demo', [{ id: '001', sql: 'create table demo.items (id int primary key);' }]);
    await expect(db.tx(async (q) => { await q.query('insert into demo.items values (1)'); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await db.query('select * from demo.items')).toEqual([]);
    await db.close();
  });
  it('rejects hostile schema names', async () => {
    const db = await createDb({ service: 't', dataDir: null });
    await expect(migrate(db, 'x; drop schema public', [])).rejects.toThrow();
    await db.close();
  });
});
