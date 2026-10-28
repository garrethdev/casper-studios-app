import { ok, queryDate, queryTz, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

export const GET = withUser({}, async (c) => {
  const q = new URLSearchParams({ date: queryDate(c.req), tz: String(queryTz(c.req)) });
  return ok(await c.meals(`/v1/summary?${q}`));
});
