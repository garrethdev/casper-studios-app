import 'server-only';
import { RateLimiter } from '@leanplate/security';

/**
 * Per-IP limiters. Kept on globalThis so dev hot reloads and separately bundled routes share one counter.
 * In-memory means per server instance: a best-effort brake, with the durable limits (login lockout,
 * hourly AI quota) enforced by the identity and meals services.
 */
const g = globalThis as unknown as { __lpLimits?: Record<'login' | 'register' | 'analyze' | 'refresh', RateLimiter> };

export const limits = (g.__lpLimits ??= {
  login: new RateLimiter(60_000, 10),
  register: new RateLimiter(60_000, 5),
  analyze: new RateLimiter(60_000, 30),
  refresh: new RateLimiter(60_000, 60),
});
