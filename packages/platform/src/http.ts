import type { ZodType } from 'zod';
import { AppError, signServiceToken } from '@leanplate/security';

export interface ServiceCall<T> {
  baseUrl: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Who we are, who we are calling, and the secret that guards the callee. */
  caller: string;
  audience: 'identity' | 'meals' | 'intelligence';
  secret: string;
  userToken?: string;
  userId?: string;
  clientIpHash?: string;
  schema?: ZodType<T>;
  /** Forwarded as X-Request-Id so one user action can be followed across services. */
  requestId?: string;
  timeoutMs?: number;
}

/**
 * Calls another service with a fresh 60-second signed token. Upstream 4xx errors
 * are passed through with their code; upstream failures become a generic 502.
 *
 * Timeouts shrink at each hop so the outer call never gives up while the inner
 * one is still working: web 26s -> meals 23s -> intelligence 20s -> model.
 */
export const HOP_TIMEOUT_MS = { web: 26_000, meals: 23_000, intelligence: 20_000 } as const;
export async function callService<T = unknown>(c: ServiceCall<T>): Promise<T> {
  const token = await signServiceToken({ secret: c.secret, issuer: c.caller, audience: c.audience, userId: c.userId, clientIpHash: c.clientIpHash });
  const headers: Record<string, string> = { 'x-service-token': token, accept: 'application/json' };
  if (c.userToken) headers.authorization = `Bearer ${c.userToken}`;
  if (c.body !== undefined) headers['content-type'] = 'application/json';
  if (c.requestId) headers['x-request-id'] = c.requestId;

  let res: Response;
  try {
    res = await fetch(new URL(c.path, c.baseUrl), {
      method: c.method ?? 'GET',
      headers,
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
      signal: AbortSignal.timeout(c.timeoutMs ?? HOP_TIMEOUT_MS[c.caller as keyof typeof HOP_TIMEOUT_MS] ?? HOP_TIMEOUT_MS.web),
    });
  } catch {
    throw new AppError(502, 'upstream_unavailable', `The ${c.audience} service is unavailable`);
  }

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new AppError(502, 'upstream_invalid', `The ${c.audience} service sent an invalid response`);
  }
  if (!res.ok) {
    // 4xx and 503 bodies are written for the end user by the service that produced them, so they pass through unchanged.
    if (((res.status >= 400 && res.status < 500) || res.status === 503) && json?.error?.code) {
      throw new AppError(res.status, String(json.error.code ?? 'upstream_error'), String(json.error.message ?? 'Request failed'));
    }
    const rid = json?.error?.requestId ? ` (ref ${String(json.error.requestId).slice(0, 36)})` : '';
    throw new AppError(502, 'upstream_error', `The ${c.audience} service failed${rid}`);
  }
  return (c.schema ? c.schema.parse(json) : json) as T;
}
