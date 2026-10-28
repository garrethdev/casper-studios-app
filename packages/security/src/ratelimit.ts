import { createMiddleware } from 'hono/factory';
import { AppError } from './errors';

/**
 * Sliding-window limiter. In-memory, so on serverless it is per-instance and
 * best effort; durable limits (login lockout) live in the database instead.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = Date.now();
  constructor(private windowMs: number, private max: number) {}

  /** Returns 0 when allowed, otherwise the seconds to wait. */
  check(key: string, now = Date.now()): number {
    if (now - this.lastSweep > this.windowMs) this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0]! + this.windowMs - now) / 1000));
    }
    recent.push(now);
    this.hits.set(key, recent);
    return 0;
  }

  private sweep(now: number) {
    this.lastSweep = now;
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}

export function rateLimit(opts: { windowMs: number; max: number; key: (c: import('hono').Context) => string | undefined }) {
  const limiter = new RateLimiter(opts.windowMs, opts.max);
  return createMiddleware(async (c, next) => {
    const key = opts.key(c);
    if (key) {
      const wait = limiter.check(key);
      if (wait) throw new AppError(429, 'rate_limited', 'Too many requests. Please slow down.', { 'Retry-After': String(wait) });
    }
    await next();
  });
}
