/**
 * Content Security Policy and the other response hardening headers.
 * Pure and edge-safe (no Node imports): middleware.ts calls it for every request.
 */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export interface CspOptions {
  nonce: string;
  development: boolean;
}

export function buildCsp({ nonce, development }: CspOptions): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // React's dev tooling rebuilds stack traces with eval(). Never allowed in production.
  if (development) script.push("'unsafe-eval'");
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', script],
    // The one exception: Next.js and React emit inline <style> and style="" attributes while streaming,
    // and a nonce cannot cover style attributes. Styles cannot run code, so the risk is limited to
    // cosmetic tampering, and scripts (the dangerous part) stay nonce-only.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    ['connect-src', development ? ["'self'", 'ws:', 'wss:'] : ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]],
  ];
  return directives.map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

export function securityHeaders(opts: CspOptions & { production: boolean }): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Security-Policy': buildCsp(opts),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    // The photo picker uses <input capture>, so the camera is allowed for our own origin only.
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cache-Control': 'no-store',
  };
  if (opts.production) h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  return h;
}
