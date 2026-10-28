import { Analysis, Feedback } from '@leanplate/contracts';
import { HOP_TIMEOUT_MS, callService } from '@leanplate/platform/http';
import { serviceSecret } from '@leanplate/security';
import type { Caller, Intelligence } from '../application/ports';

/**
 * Signs a short-lived token for each call so only meals can reach the AI service.
 * The user's id is deliberately not sent: the AI service holds no user data at all,
 * only a hashed client IP for rate limiting.
 */
export function httpIntelligence(baseUrl: string, secret: () => string = () => serviceSecret('intelligence')): Intelligence {
  const call = <T>(path: string, body: unknown, schema: { parse: (v: unknown) => T }, who: Caller) =>
    callService<T>({ baseUrl, path, method: 'POST', body, caller: 'meals', audience: 'intelligence', secret: secret(), clientIpHash: who.clientIpHash, requestId: who.requestId, schema: schema as any, timeoutMs: HOP_TIMEOUT_MS.meals });
  return {
    analyze: (input, who) => call('/v1/analyze', input, Analysis, who),
    feedback: (input, who) => call('/v1/feedback', input, Feedback, who),
  };
}
