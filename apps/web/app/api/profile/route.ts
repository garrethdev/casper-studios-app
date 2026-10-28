import { ProfileInput } from '@leanplate/contracts';
import { ok, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

export const GET = withUser({}, async (c) => ok(await c.meals('/v1/profile')));

export const PUT = withUser({}, async (c) => {
  const input = await c.body(ProfileInput);
  return ok(await c.meals('/v1/profile', { method: 'PUT', body: input }));
});
