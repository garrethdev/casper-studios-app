import { AnalyzeMealBody } from '@leanplate/contracts';
import { ok, withUser } from '@/lib/server/bff';
import { limits } from '@/lib/server/limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** About 4.5 MB of base64 image plus a little JSON. The browser downsizes photos first, so real requests are far smaller. */
const MAX_ANALYZE_BYTES = 6 * 1024 * 1024;

export const POST = withUser({ limit: { scope: 'analyze', limiter: limits.analyze } }, async (c) => {
  const input = await c.body(AnalyzeMealBody, MAX_ANALYZE_BYTES);
  // The body is read once (c.body memoizes), so a retry after a token refresh does not need the stream again.
  return ok(await c.meals('/v1/meals/analyze', { method: 'POST', body: input, timeoutMs: 55_000 }));
});
