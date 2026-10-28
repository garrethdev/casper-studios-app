/**
 * The decision logic behind withUser, kept free of Next, cookies and the network so it can be tested
 * with fakes. The goals, in order:
 *   1. Use the access token if it works.
 *   2. If it is missing or rejected (401), rotate with the refresh token exactly once and retry.
 *   3. Never log a user out because of a race or an outage. Only a definite 401 from the refresh
 *      endpoint, with nothing better available, ends the session. Network trouble (502) is surfaced as is.
 *   4. If the refresh loses a race (401) but a newer access token has appeared in the meantime,
 *      prefer that token instead of clearing the cookies.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface SessionDeps<T> {
  accessToken?: string;
  refreshToken?: string;
  /** Runs the real work with an access token. Rejects with an error carrying `status` (401 means "token rejected"). */
  attempt(accessToken: string): Promise<T>;
  /** Exchanges a refresh token for a new pair. Rejects with an error carrying `status`. */
  refresh(refreshToken: string): Promise<TokenPair>;
  /** A newer access token that arrived while we were refreshing (for example set by a parallel request). */
  freshAccessToken?(): string | undefined;
}

export type SessionOutcome<T> =
  | { kind: 'ok'; value: T; rotated?: TokenPair }
  | { kind: 'unauthorized' };

export const statusOf = (e: unknown): number | undefined =>
  e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : undefined;

export async function resolveSession<T>(deps: SessionDeps<T>): Promise<SessionOutcome<T>> {
  const { accessToken, refreshToken } = deps;

  if (accessToken) {
    try {
      return { kind: 'ok', value: await deps.attempt(accessToken) };
    } catch (e) {
      if (statusOf(e) !== 401) throw e; // a 404, 429 or 502 says nothing about the session
    }
  }
  if (!refreshToken) return { kind: 'unauthorized' };

  let pair: TokenPair;
  try {
    pair = await deps.refresh(refreshToken);
  } catch (e) {
    if (statusOf(e) !== 401) throw e; // identity down or slow: keep the cookies, report the outage
    const fresh = deps.freshAccessToken?.();
    if (fresh && fresh !== accessToken) {
      try {
        return { kind: 'ok', value: await deps.attempt(fresh) };
      } catch (e2) {
        if (statusOf(e2) !== 401) throw e2;
      }
    }
    return { kind: 'unauthorized' };
  }

  try {
    return { kind: 'ok', value: await deps.attempt(pair.accessToken), rotated: pair };
  } catch (e) {
    if (statusOf(e) === 401) return { kind: 'unauthorized' }; // a brand-new token was refused: give up, do not loop
    // The rotation itself worked and its tokens must reach the browser, otherwise the old refresh token is spent.
    throw new RotatedError(e, pair);
  }
}

/** Wraps a non-401 failure that happened after a successful rotation so the caller can still set the new cookies. */
export class RotatedError extends Error {
  constructor(public readonly original: unknown, public readonly rotated: TokenPair) {
    super('failure after token rotation');
  }
}
