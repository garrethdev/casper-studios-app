import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodType, type output } from 'zod';
import { log } from '@leanplate/platform';
import { AppError, sha256Hex, type RateLimiter } from '@leanplate/security';
import { clientIpFrom, limiterKey } from '../client-ip';
import { originAllowed } from '../origin-guard';
import {
  clearedCookies,
  cookieNames,
  isProduction,
  sessionCookies,
  writeCookies,
  type CookieSpec,
} from '../cookies';
import { RotatedError, resolveSession } from '../session-logic';
import { allowedOrigins } from './env';
import { recentRotation, refreshShared } from './refresh';
import { identity, meals, type UpstreamOptions } from './upstream';

/* ---------------------------------------------------------------- replies */

export interface Reply {
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
  cookies?: CookieSpec[];
}
export const ok = (json: unknown, status = 200): Reply => ({ status, json });
export const noContent = (): Reply => ({ status: 204 });

export function toResponse(r: Reply): NextResponse {
  const res = r.json === undefined ? new NextResponse(null, { status: r.status ?? 204 }) : NextResponse.json(r.json, { status: r.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(r.headers ?? {})) res.headers.set(k, v);
  if (r.cookies) writeCookies(res.cookies, r.cookies);
  return res;
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

/** Client-safe errors pass through unchanged; anything unexpected becomes a generic 500 and is logged without detail. */
export function errorReply(e: unknown): Reply {
  if (e instanceof AppError) return { status: e.status, json: errorBody(e.code, e.message), headers: e.headers };
  if (e instanceof ZodError) {
    const message = e.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return { status: 400, json: errorBody('invalid_request', message) };
  }
  log.error('bff_unhandled', { message: e instanceof Error ? e.message : String(e) });
  return { status: 500, json: errorBody('internal', 'Something went wrong') };
}

/* ---------------------------------------------------------------- guards */

export function guardOrigin(req: NextRequest) {
  if (!originAllowed(req, allowedOrigins())) throw new AppError(403, 'forbidden', 'This request came from somewhere we do not trust');
}

function guardRate(limit: RateLimit | undefined, ip: string) {
  if (!limit) return;
  const wait = limit.limiter.check(limiterKey(limit.scope, ip));
  if (wait) throw new AppError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.', { 'Retry-After': String(wait) });
}

export const DEFAULT_BODY_BYTES = 32 * 1024;

/** Reads a JSON body once, with a hard size cap enforced while streaming (not just from Content-Length). */
async function readRawJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  if (!/^application\/json(\s*;|$)/i.test(req.headers.get('content-type') ?? '')) {
    throw new AppError(415, 'unsupported_media_type', 'Send the request as JSON');
  }
  const declared = Number(req.headers.get('content-length'));
  const tooBig = () => new AppError(413, 'payload_too_large', 'That request is too large');
  if (Number.isFinite(declared) && declared > maxBytes) throw tooBig();
  const reader = req.body?.getReader();
  if (!reader) throw new AppError(400, 'invalid_json', 'Request body must be valid JSON');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

export function queryDate(req: NextRequest): string {
  const date = req.nextUrl.searchParams.get('date') ?? '';
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
  if (!valid) throw new AppError(400, 'invalid_request', 'date must look like 2026-10-26');
  return date;
}

export function queryTz(req: NextRequest): number {
  const n = Number(req.nextUrl.searchParams.get('tz') ?? '0');
  if (!Number.isInteger(n) || n < -840 || n > 840) throw new AppError(400, 'invalid_request', 'tz must be minutes between -840 and 840');
  return n;
}

/* ---------------------------------------------------------------- handlers */

export interface RateLimit {
  scope: string;
  limiter: RateLimiter;
}
export interface ApiCtx {
  req: NextRequest;
  ip: string;
  ipHash: string;
  params: Record<string, string>;
  /**
   * Reads the JSON body (once, even if withUser retries the handler after a token refresh) and validates it
   * with a contracts schema. Unknown fields are rejected by the schemas' strict mode.
   */
  body<S extends ZodType>(schema: S, maxBytes?: number): Promise<output<S>>;
}
type RouteContext = { params?: Promise<Record<string, string>> };

/**
 * Wraps a route handler with the checks every endpoint needs, in a fixed order that handlers cannot skip:
 * same-origin for state-changing methods, then the per-IP rate limit, then the handler, then uniform errors.
 */
export function api(opts: { limit?: RateLimit }, fn: (c: ApiCtx) => Promise<Reply>) {
  return async (req: NextRequest, rc?: RouteContext): Promise<NextResponse> => {
    try {
      guardOrigin(req);
      const ip = clientIpFrom(req.headers);
      guardRate(opts.limit, ip);
      const params = rc?.params ? await rc.params : {};
      let raw: Promise<unknown> | undefined;
      const body: ApiCtx['body'] = async (schema, maxBytes = DEFAULT_BODY_BYTES) => schema.parse(await (raw ??= readRawJson(req, maxBytes)));
      return toResponse(await fn({ req, ip, ipHash: sha256Hex(ip), params, body }));
    } catch (e) {
      return toResponse(errorReply(e));
    }
  };
}

export interface UserCtx extends ApiCtx {
  accessToken: string;
  /** Upstream helpers already bound to this user's token and client hash. */
  meals<T = unknown>(path: string, o?: Omit<UpstreamOptions, 'accessToken' | 'ipHash'>): Promise<T>;
  identity<T = unknown>(path: string, o?: Omit<UpstreamOptions, 'accessToken' | 'ipHash'>): Promise<T>;
}

const unauthorized = () => errorBody('unauthorized', 'Please sign in again');

/**
 * withUser: runs `fn` as the signed-in user.
 * Reads the access cookie; if it is missing or rejected and a refresh cookie came along, rotates once
 * (shared between concurrent requests), sets the new cookies on the response and retries.
 * The decision logic lives in session-logic.ts, where it is unit tested.
 *
 * Note on cookie scope: the refresh cookie is only sent to /api/auth/*, so on other routes `rt` is
 * normally absent. A 401 there tells the browser client to call POST /api/auth/refresh and retry,
 * and we only clear the access cookie, so the still-valid refresh cookie is not thrown away.
 */
export function withUser(opts: { limit?: RateLimit }, fn: (c: UserCtx) => Promise<Reply>) {
  return api(opts, async (c) => {
    const prod = isProduction();
    const names = cookieNames(prod);
    const at = c.req.cookies.get(names.access)?.value;
    const rt = c.req.cookies.get(names.refresh)?.value;

    const bind = (accessToken: string): UserCtx => ({
      ...c,
      accessToken,
      meals: (path, o) => meals(path, { ...o, accessToken, ipHash: c.ipHash }),
      identity: (path, o) => identity(path, { ...o, accessToken, ipHash: c.ipHash }),
    });

    let outcome;
    try {
      outcome = await resolveSession<Reply>({
        accessToken: at,
        refreshToken: rt,
        attempt: (token) => fn(bind(token)),
        refresh: (token) => refreshShared(token, c.ipHash),
        freshAccessToken: () => (rt ? recentRotation(rt)?.accessToken : undefined),
      });
    } catch (e) {
      if (e instanceof RotatedError) return { ...errorReply(e.original), cookies: sessionCookies(e.rotated, prod) };
      throw e;
    }

    if (outcome.kind === 'unauthorized') {
      const cookies = rt ? clearedCookies(prod) : clearedCookies(prod).filter((x) => x.name === names.access);
      return { status: 401, json: unauthorized(), cookies };
    }
    const reply = outcome.value;
    const extra = outcome.rotated ? sessionCookies(outcome.rotated, prod) : [];
    return { ...reply, cookies: [...(reply.cookies ?? []), ...extra] };
  });
}

