import { describe, expect, it } from 'vitest';
import { buildCsp, makeNonce, securityHeaders } from '../lib/csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('CSP builder', () => {
  const nonce = makeNonce();
  const prod = buildCsp({ nonce, development: false });
  const dev = buildCsp({ nonce, development: true });

  it('produces a fresh, unguessable nonce each time', () => {
    const set = new Set(Array.from({ length: 50 }, makeNonce));
    expect(set.size).toBe(50);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it('script-src has the nonce and strict-dynamic, never unsafe-inline', () => {
    const s = directive(prod, 'script-src');
    expect(s).toContain(`'nonce-${nonce}'`);
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain('unsafe-inline');
    expect(s).not.toContain('unsafe-eval');
  });

  it('unsafe-eval appears only in development', () => {
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'script-src')).not.toContain('unsafe-inline');
  });

  it('locks down framing, base URI, forms, objects and defaults', () => {
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(prod, 'base-uri')).toBe("base-uri 'none'");
    expect(directive(prod, 'form-action')).toBe("form-action 'self'");
    expect(directive(prod, 'default-src')).toBe("default-src 'self'");
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'connect-src')).toBe("connect-src 'self'");
    expect(directive(prod, 'img-src')).toBe("img-src 'self' data: blob:");
  });

  it('style-src keeps the single documented unsafe-inline exception', () => {
    expect(directive(prod, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
  });

  it('adds HSTS only in production, plus the standard hardening headers', () => {
    const p = securityHeaders({ nonce, development: false, production: true });
    const d = securityHeaders({ nonce, development: true, production: false });
    expect(p['Strict-Transport-Security']).toMatch(/max-age=\d+/);
    expect(d['Strict-Transport-Security']).toBeUndefined();
    for (const h of [p, d]) {
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['Referrer-Policy']).toBe('no-referrer');
      expect(h['Cache-Control']).toBe('no-store');
      expect(h['Permissions-Policy']).toContain('camera=(self)');
      expect(h['Permissions-Policy']).toContain('microphone=()');
      expect(h['Content-Security-Policy']).toContain(`'nonce-${nonce}'`);
    }
  });
});
