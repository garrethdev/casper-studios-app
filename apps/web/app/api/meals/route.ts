import { SaveMealBody } from '@leanplate/contracts';
import { ok, queryDate, queryTz, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

export const GET = withUser({}, async (c) => {
  const q = new URLSearchParams({ date: queryDate(c.req), tz: String(queryTz(c.req)) });
  return ok(await c.meals(`/v1/meals?${q}`));
});

/** The server recomputes totals and the verdict; the numbers in this body are never trusted. */
export const POST = withUser({}, async (c) => {
  const input = await c.body(SaveMealBody, 64 * 1024);
  return ok(await c.meals('/v1/meals', { method: 'POST', body: input }));
});
