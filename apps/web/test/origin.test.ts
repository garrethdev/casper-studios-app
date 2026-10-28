import { describe, expect, it } from 'vitest';
import { originAllowed, parseAllowedOrigins } from '../lib/origin-guard';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const allowed = parseAllowedOrigins(undefined);

describe('same-origin check wiring', () => {
  it('defaults to http://localhost:3000 and tidies APP_ORIGIN', () => {
    expect(allowed).toEqual(['http://localhost:3000']);
    expect(parseAllowedOrigins('https://app.example.com/, https://www.example.com')).toEqual(['https://app.example.com', 'https://www.example.com']);
  });

  it('never blocks safe methods', () => {
    expect(originAllowed({ method: 'GET', headers: h({ origin: 'https://evil.test' }) }, allowed)).toBe(true);
  });

  for (const method of ['POST', 'PUT', 'DELETE']) {
    it(`${method}: accepts our origin and rejects others`, () => {
      expect(originAllowed({ method, headers: h({ origin: 'http://localhost:3000' }) }, allowed)).toBe(true);
      expect(originAllowed({ method, headers: h({ origin: 'https://evil.test' }) }, allowed)).toBe(false);
      expect(originAllowed({ method, headers: h({ origin: 'null' }) }, allowed)).toBe(false);
      expect(originAllowed({ method, headers: h({ origin: 'http://localhost:3000.evil.test' }) }, allowed)).toBe(false);
    });
  }

  it('without Origin, only Sec-Fetch-Site: same-origin passes', () => {
    expect(originAllowed({ method: 'POST', headers: h({ 'sec-fetch-site': 'same-origin' }) }, allowed)).toBe(true);
    expect(originAllowed({ method: 'POST', headers: h({ 'sec-fetch-site': 'cross-site' }) }, allowed)).toBe(false);
    expect(originAllowed({ method: 'POST', headers: h({ 'sec-fetch-site': 'same-site' }) }, allowed)).toBe(false);
    expect(originAllowed({ method: 'POST', headers: h({}) }, allowed)).toBe(false);
  });

  it('a wrong Origin wins over a friendly Sec-Fetch-Site', () => {
    expect(originAllowed({ method: 'DELETE', headers: h({ origin: 'https://evil.test', 'sec-fetch-site': 'same-origin' }) }, allowed)).toBe(false);
  });

  it('honours a configured production origin', () => {
    const prod = parseAllowedOrigins('https://leanplate.app');
    expect(originAllowed({ method: 'POST', headers: h({ origin: 'https://leanplate.app' }) }, prod)).toBe(true);
    expect(originAllowed({ method: 'POST', headers: h({ origin: 'http://localhost:3000' }) }, prod)).toBe(false);
  });
});
