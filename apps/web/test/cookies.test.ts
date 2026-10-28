import { describe, expect, it } from 'vitest';
import { ACCESS_TTL_SECONDS, REFRESH_PATH, REFRESH_TTL_SECONDS, accessCookie, clearedCookies, cookieNames, refreshCookie, sessionCookies, writeCookies } from '../lib/cookies';

describe('session cookies', () => {
  it('development: plain names, HttpOnly, SameSite=Strict, not Secure', () => {
    const [at, rt] = sessionCookies({ accessToken: 'AT', refreshToken: 'RT' }, false);
    expect(at).toMatchObject({ name: 'lp_at', value: 'AT', options: { httpOnly: true, sameSite: 'strict', secure: false, path: '/', maxAge: 600 } });
    expect(rt).toMatchObject({ name: 'lp_rt', value: 'RT', options: { httpOnly: true, sameSite: 'strict', secure: false, path: '/api/auth', maxAge: 14 * 24 * 3600 } });
  });

  it('production: access cookie gets the __Host- prefix and everything is Secure', () => {
    const [at, rt] = sessionCookies({ accessToken: 'AT', refreshToken: 'RT' }, true);
    expect(at!.name).toBe('__Host-lp_at');
    expect(at!.options.secure).toBe(true);
    expect(rt!.name).toBe('lp_rt');
    expect(rt!.options.secure).toBe(true);
  });

  it('__Host- rules hold: Secure, Path=/ and no Domain', () => {
    const c = accessCookie('x', true);
    expect(c.name.startsWith('__Host-')).toBe(true);
    expect(c.options.secure).toBe(true);
    expect(c.options.path).toBe('/');
    expect('domain' in c.options).toBe(false);
  });

  it('uses the documented lifetimes and scopes the refresh token to the auth endpoints', () => {
    expect(ACCESS_TTL_SECONDS).toBe(600);
    expect(REFRESH_TTL_SECONDS).toBe(1_209_600);
    expect(refreshCookie('r', false).options.path).toBe(REFRESH_PATH);
    expect(REFRESH_PATH).toBe('/api/auth');
  });

  it('cookie names helper matches what middleware looks for', () => {
    expect(cookieNames(false).access).toBe('lp_at');
    expect(cookieNames(true).access).toBe('__Host-lp_at');
    expect(cookieNames(true).refresh).toBe('lp_rt');
  });

  it('clearing keeps name, path and flags so the browser actually deletes them', () => {
    for (const prod of [false, true]) {
      const set = sessionCookies({ accessToken: 'a', refreshToken: 'b' }, prod);
      const cleared = clearedCookies(prod);
      expect(cleared.map((c) => c.name)).toEqual(set.map((c) => c.name));
      cleared.forEach((c, i) => {
        expect(c.value).toBe('');
        expect(c.options.maxAge).toBe(0);
        expect(c.options.path).toBe(set[i]!.options.path);
        expect(c.options.secure).toBe(set[i]!.options.secure);
        expect(c.options.httpOnly).toBe(true);
        expect(c.options.sameSite).toBe('strict');
      });
    }
  });

  it('writeCookies passes every attribute to the response', () => {
    const seen: unknown[][] = [];
    writeCookies({ set: (...a) => seen.push(a) }, sessionCookies({ accessToken: 'a', refreshToken: 'b' }, true));
    expect(seen).toHaveLength(2);
    expect(seen[0]![0]).toBe('__Host-lp_at');
    expect(seen[1]![2]).toMatchObject({ path: '/api/auth', httpOnly: true, sameSite: 'strict', secure: true });
  });
});
