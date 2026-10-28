import { noContent, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

/** Deletes the profile and every meal. The account itself stays. */
export const DELETE = withUser({}, async (c) => {
  await c.meals('/v1/data', { method: 'DELETE' });
  return noContent();
});
