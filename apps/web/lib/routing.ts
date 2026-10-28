/** Which paths need a session, and where a person may be sent after signing in. Pure so middleware and tests share it. */
export const APP_PAGES = ['/dashboard', '/onboarding', '/meals', '/settings'] as const;

export function isAppPage(pathname: string): boolean {
  return APP_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only same-site app paths are valid "next" targets, so the landing page can never be used as an open redirect. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 100 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  const path = raw.split(/[?#]/)[0]!;
  return isAppPage(path) ? path : null;
}
