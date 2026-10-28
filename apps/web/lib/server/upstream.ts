import 'server-only';
import type { ZodType } from 'zod';
import { callService } from '@leanplate/platform/http';
import { AppError, serviceSecret } from '@leanplate/security';
import { identityUrl, mealsUrl } from './env';

export interface UpstreamOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** The caller's access JWT, forwarded as the bearer token. */
  accessToken?: string;
  /** sha256 of the client IP, so the callee can rate limit per client. */
  ipHash?: string;
  timeoutMs?: number;
}

/**
 * Every upstream request is built explicitly from validated pieces. Nothing from the browser's request
 * (headers, cookies, URL) is copied across; callService adds the signed service token itself.
 */
export function identity<T = unknown>(path: string, o: UpstreamOptions = {}): Promise<T> {
  return callService<T>({
    baseUrl: identityUrl(),
    path,
    method: o.method,
    body: o.body,
    caller: 'web',
    audience: 'identity',
    secret: serviceSecret('identity'),
    userToken: o.accessToken,
    clientIpHash: o.ipHash,
    timeoutMs: o.timeoutMs,
  });
}

export function meals<T = unknown>(path: string, o: UpstreamOptions = {}): Promise<T> {
  return callService<T>({
    baseUrl: mealsUrl(),
    path,
    method: o.method,
    body: o.body,
    caller: 'web',
    audience: 'meals',
    secret: serviceSecret('meals'),
    userToken: o.accessToken,
    clientIpHash: o.ipHash,
    timeoutMs: o.timeoutMs,
  });
}

/** Checks the shape of an upstream response. A mismatch is our dependency's fault, so it is a 502, never a 400. */
export function expectShape<T>(schema: ZodType<T>, data: unknown, from: string): T {
  const res = schema.safeParse(data);
  if (!res.success) throw new AppError(502, 'upstream_invalid', `The ${from} service sent an unexpected response`);
  return res.data;
}
