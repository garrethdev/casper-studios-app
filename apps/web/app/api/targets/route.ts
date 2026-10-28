import { ok, withUser } from '@/lib/server/bff';

export const dynamic = 'force-dynamic';

export const GET = withUser({}, async (c) => ok(await c.meals('/v1/targets')));
