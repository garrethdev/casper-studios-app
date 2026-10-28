import { describe, expect, it } from 'vitest';
import { RefreshCoalescer } from '../lib/refresh-cache';
import { RotatedError, resolveSession, type SessionDeps, type TokenPair } from '../lib/session-logic';

class Http extends Error {
  constructor(public status: number) {
    super(`http ${status}`);
  }
}
const pair = (n: number): TokenPair => ({ accessToken: `at${n}`, refreshToken: `rt${n}` });

/** A fake upstream that accepts only the access tokens in `valid`, and records every call. */
function harness(over: Partial<SessionDeps<string>> & { valid?: string[]; refreshResult?: () => Promise<TokenPair> } = {}) {
  const calls = { attempt: [] as string[], refresh: [] as string[] };
  const valid = over.valid ?? ['at1'];
  const deps: SessionDeps<string> = {
    accessToken: over.accessToken,
    refreshToken: over.refreshToken,
    attempt: async (t) => {
      calls.attempt.push(t);
      if (!valid.includes(t)) throw new Http(401);
      return `ok:${t}`;
    },
    refresh: async (t) => {
      calls.refresh.push(t);
      return (over.refreshResult ?? (async () => pair(2)))();
    },
    freshAccessToken: over.freshAccessToken,
  };
  return { deps, calls };
}

describe('withUser decision logic', () => {
  it('uses a good access token and never touches the refresh token', async () => {
    const { deps, calls } = harness({ accessToken: 'at1', refreshToken: 'rt1' });
    expect(await resolveSession(deps)).toEqual({ kind: 'ok', value: 'ok:at1' });
    expect(calls.refresh).toEqual([]);
  });

  it('missing access token + refresh token: rotates once, retries, returns the new pair', async () => {
    const { deps, calls } = harness({ refreshToken: 'rt1', valid: ['at2'] });
    const out = await resolveSession(deps);
    expect(out).toEqual({ kind: 'ok', value: 'ok:at2', rotated: pair(2) });
    expect(calls.refresh).toEqual(['rt1']);
  });

  it('rejected access token (401): refreshes exactly once and retries with the new token', async () => {
    const { deps, calls } = harness({ accessToken: 'stale', refreshToken: 'rt1', valid: ['at2'] });
    const out = await resolveSession(deps);
    expect(out.kind).toBe('ok');
    expect(calls.attempt).toEqual(['stale', 'at2']);
    expect(calls.refresh).toHaveLength(1);
  });

  it('no tokens at all: unauthorized without any upstream call', async () => {
    const { deps, calls } = harness({});
    expect(await resolveSession(deps)).toEqual({ kind: 'unauthorized' });
    expect(calls.attempt).toEqual([]);
    expect(calls.refresh).toEqual([]);
  });

  it('rejected access token and no refresh token: unauthorized', async () => {
    const { deps } = harness({ accessToken: 'stale' });
    expect(await resolveSession(deps)).toEqual({ kind: 'unauthorized' });
  });

  it('refresh rejected with 401 and nothing better: unauthorized (cookies get cleared)', async () => {
    const { deps } = harness({ accessToken: 'stale', refreshToken: 'rt1', refreshResult: async () => { throw new Http(401); } });
    expect(await resolveSession(deps)).toEqual({ kind: 'unauthorized' });
  });

  it('race: refresh loses with 401 but a fresh access token arrived, so the user stays signed in', async () => {
    const { deps, calls } = harness({
      accessToken: 'stale',
      refreshToken: 'rt1',
      valid: ['fresh'],
      refreshResult: async () => { throw new Http(401); },
      freshAccessToken: () => 'fresh',
    });
    const out = await resolveSession(deps);
    expect(out).toEqual({ kind: 'ok', value: 'ok:fresh' });
    expect(calls.attempt).toEqual(['stale', 'fresh']);
  });

  it('race: the "fresh" token is the same stale one, or also rejected, so it does not loop', async () => {
    const same = harness({ accessToken: 'stale', refreshToken: 'rt1', refreshResult: async () => { throw new Http(401); }, freshAccessToken: () => 'stale' });
    expect(await resolveSession(same.deps)).toEqual({ kind: 'unauthorized' });
    expect(same.calls.attempt).toEqual(['stale']);

    const bad = harness({ accessToken: 'stale', refreshToken: 'rt1', refreshResult: async () => { throw new Http(401); }, freshAccessToken: () => 'also-bad' });
    expect(await resolveSession(bad.deps)).toEqual({ kind: 'unauthorized' });
    expect(bad.calls.attempt).toEqual(['stale', 'also-bad']);
  });

  it('an identity outage during refresh is NOT a logout: the error surfaces and nothing is cleared', async () => {
    const { deps } = harness({ refreshToken: 'rt1', refreshResult: async () => { throw new Http(502); } });
    await expect(resolveSession(deps)).rejects.toMatchObject({ status: 502 });
  });

  it('non-401 errors from the real work pass straight through without a refresh', async () => {
    const { deps, calls } = harness({ accessToken: 'at1', refreshToken: 'rt1' });
    deps.attempt = async () => { throw new Http(404); };
    await expect(resolveSession(deps)).rejects.toMatchObject({ status: 404 });
    expect(calls.refresh).toEqual([]);
  });

  it('a brand-new token being refused ends the session instead of looping', async () => {
    const { deps, calls } = harness({ accessToken: 'stale', refreshToken: 'rt1', valid: [] });
    expect(await resolveSession(deps)).toEqual({ kind: 'unauthorized' });
    expect(calls.refresh).toHaveLength(1);
  });

  it('a failure after a successful rotation carries the new tokens so they still reach the browser', async () => {
    const { deps } = harness({ refreshToken: 'rt1' });
    deps.attempt = async (t) => {
      if (t === 'at2') throw new Http(404);
      throw new Http(401);
    };
    const err = await resolveSession(deps).catch((e) => e);
    expect(err).toBeInstanceOf(RotatedError);
    expect((err as RotatedError).rotated).toEqual(pair(2));
    expect((err as RotatedError).original).toMatchObject({ status: 404 });
  });
});

describe('refresh coalescing', () => {
  it('concurrent callers with the same token share ONE rotation', async () => {
    const c = new RefreshCoalescer();
    let calls = 0;
    const rotate = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return pair(calls);
    };
    const results = await Promise.all([c.run('k', rotate), c.run('k', rotate), c.run('k', rotate)]);
    expect(calls).toBe(1);
    expect(new Set(results.map((r) => r.refreshToken)).size).toBe(1);
  });

  it('late arrivals within the grace period reuse the result, then a new rotation is allowed', async () => {
    let t = 1000;
    const c = new RefreshCoalescer(10_000, () => t);
    let calls = 0;
    const rotate = async () => pair(++calls);
    await c.run('k', rotate);
    t += 5_000;
    await c.run('k', rotate);
    expect(calls).toBe(1);
    expect(c.lookup('k')).toEqual(pair(1));
    t += 6_000;
    expect(c.lookup('k')).toBeUndefined();
    await c.run('k', rotate);
    expect(calls).toBe(2);
  });

  it('different tokens never share a result, and a failed rotation is not cached', async () => {
    const c = new RefreshCoalescer();
    let n = 0;
    const a = await c.run('a', async () => pair(++n));
    const b = await c.run('b', async () => pair(++n));
    expect(a).not.toEqual(b);
    await expect(c.run('x', async () => { throw new Http(401); })).rejects.toBeInstanceOf(Http);
    expect(c.lookup('x')).toBeUndefined();
    expect(await c.run('x', async () => pair(9))).toEqual(pair(9));
  });
});
