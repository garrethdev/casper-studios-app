import { isIP } from 'node:net';

export const LOCAL_IP = 'local';

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Picks the client IP used for rate limiting.
 *
 * Only the FIRST entry of x-forwarded-for counts. Vercel (and any correctly configured edge proxy)
 * overwrites that header, so the first entry is the address that connected to the edge. Later entries
 * are never trusted, and a value that is not a plain IPv4/IPv6 address falls back to 'local' instead of
 * letting an attacker mint a new rate-limit bucket per request with junk like "a, b" or "<script>".
 */
export function clientIpFrom(headers: HeaderReader): string {
  const raw = headers.get('x-forwarded-for');
  if (!raw || raw.length > 400) return LOCAL_IP;
  const first = raw.split(',')[0]!.trim();
  if (first.length === 0 || first.length > 45) return LOCAL_IP;
  return isIP(first) ? first.toLowerCase() : LOCAL_IP;
}

/** Keys are namespaced so one scope cannot use up another scope's budget. */
export const limiterKey = (scope: string, ip: string) => `${scope}:${ip}`;
