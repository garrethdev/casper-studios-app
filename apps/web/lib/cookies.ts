/**
 * The single place that decides what our session cookies look like.
 * Pure on purpose (no Node or Next imports) so middleware, route handlers and tests share it.
 *
 *  - lp_at: the 10-minute access JWT. Path=/ so every page and API call carries it.
 *    In production it gets the __Host- prefix, which makes the browser insist on Secure, Path=/ and no Domain.
 *  - lp_rt: the rotating refresh token. Path=/api/auth, so it is only ever sent to the auth endpoints.
 *    It cannot take the __Host- prefix because that prefix requires Path=/.
 * Both are HttpOnly (no script can read them) and SameSite=Strict (never sent on cross-site requests).
 */
export const ACCESS_TTL_SECONDS = 600;
export const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;
export const REFRESH_PATH = '/api/auth';

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
}
export interface CookieSpec {
  name: string;
  value: string;
  options: CookieOptions;
}
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export const isProduction = (env: { NODE_ENV?: string } = process.env) => env.NODE_ENV === 'production';

export function cookieNames(production: boolean) {
  return { access: production ? '__Host-lp_at' : 'lp_at', refresh: 'lp_rt' } as const;
}

export function accessCookie(token: string, production: boolean): CookieSpec {
  return {
    name: cookieNames(production).access,
    value: token,
    options: { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: ACCESS_TTL_SECONDS },
  };
}

export function refreshCookie(token: string, production: boolean): CookieSpec {
  return {
    name: cookieNames(production).refresh,
    value: token,
    options: { httpOnly: true, secure: production, sameSite: 'strict', path: REFRESH_PATH, maxAge: REFRESH_TTL_SECONDS },
  };
}

export function sessionCookies(tokens: SessionTokens, production: boolean): CookieSpec[] {
  return [accessCookie(tokens.accessToken, production), refreshCookie(tokens.refreshToken, production)];
}

/** Expiring a cookie only works when the attributes (name, path) match the ones it was set with. */
export function clearedCookies(production: boolean): CookieSpec[] {
  return [accessCookie('', production), refreshCookie('', production)].map((c) => ({ ...c, options: { ...c.options, maxAge: 0 } }));
}

/** Minimal shape shared by NextResponse.cookies, so this module needs no Next import. */
export interface CookieSink {
  set(name: string, value: string, options: CookieOptions & { expires?: Date }): unknown;
}
export function writeCookies(sink: CookieSink, specs: CookieSpec[]) {
  for (const c of specs) sink.set(c.name, c.value, c.options);
}
