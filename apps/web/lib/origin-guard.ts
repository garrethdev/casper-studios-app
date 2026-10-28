import { isSameOrigin } from '@leanplate/security';

export const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

/** APP_ORIGIN may list several origins separated by commas. Trailing slashes are stripped so it can be pasted as is. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? DEFAULT_APP_ORIGIN)
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

interface HeaderReader {
  get(name: string): string | null;
}

/** True when a request may proceed: safe methods always, otherwise Origin must be ours (or Sec-Fetch-Site: same-origin when Origin is absent). */
export function originAllowed(req: { method: string; headers: HeaderReader }, allowed: string[]): boolean {
  return isSameOrigin({ method: req.method, origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site') }, allowed);
}
