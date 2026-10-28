import type { TokenPair } from './session-logic';

/**
 * Coalesces refreshes of the same refresh token.
 *
 * Refresh tokens are single use and the identity service treats a replay as theft (it revokes the whole
 * session family). A page that fires several API calls at once, right when the access cookie expires,
 * would otherwise present the same token several times and get logged out. Here the first caller does the
 * real rotation, concurrent callers share its promise, and for a short grace period late arrivals that
 * still carry the old cookie get the same new pair. The grace period is kept small because replaying a
 * stolen old token inside it would also succeed.
 */
export class RefreshCoalescer {
  private inflight = new Map<string, Promise<TokenPair>>();
  private recent = new Map<string, { pair: TokenPair; at: number }>();

  constructor(
    private graceMs = 10_000,
    private now: () => number = Date.now,
  ) {}

  /** `key` must be a hash of the refresh token, never the token itself. */
  async run(key: string, rotate: () => Promise<TokenPair>): Promise<TokenPair> {
    this.sweep();
    const done = this.recent.get(key);
    if (done) return done.pair;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const p = rotate()
      .then((pair) => {
        this.recent.set(key, { pair, at: this.now() });
        return pair;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** The newest pair produced for this key, if it is still within the grace period. */
  lookup(key: string): TokenPair | undefined {
    this.sweep();
    return this.recent.get(key)?.pair;
  }

  private sweep() {
    const t = this.now();
    for (const [k, v] of this.recent) if (t - v.at > this.graceMs) this.recent.delete(k);
  }
}
