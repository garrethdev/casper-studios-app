import { NextResponse, type NextRequest } from 'next/server';
import { cookieNames } from '@/lib/cookies';
import { makeNonce, securityHeaders } from '@/lib/csp';
import { isAppPage } from '@/lib/routing';

const production = process.env.NODE_ENV === 'production';

/**
 * Runs on every page and API request (static files excluded). It does three jobs:
 *  1. Gives each request its own CSP nonce and the other security headers.
 *  2. Marks everything no-store, so signed-in pages and API answers are never cached.
 *  3. Routes by cookie presence only: people without an access cookie go to the landing page, people with
 *     one skip it. This is a convenience, not a security check. Pages and handlers verify the token.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const signedInCookie = req.cookies.has(cookieNames(production).access);

  let redirectTo: URL | null = null;
  if (!pathname.startsWith('/api/')) {
    if (isAppPage(pathname) && !signedInCookie) {
      redirectTo = new URL('/', req.url);
      redirectTo.searchParams.set('next', pathname);
    } else if (pathname === '/' && signedInCookie && !searchParams.has('expired')) {
      // `expired` is added by pages whose server-side check rejected the cookie, which breaks the loop.
      redirectTo = new URL('/dashboard', req.url);
    }
  }

  const nonce = makeNonce();
  const headers = securityHeaders({ nonce, development: !production, production });

  if (redirectTo) {
    const res = NextResponse.redirect(redirectTo);
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  }

  // Next reads the nonce from the request's CSP header and stamps it on its own scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy']!);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)' }],
};
