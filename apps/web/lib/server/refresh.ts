import 'server-only';
import { RefreshBody, TokenPair } from '@leanplate/contracts';
import { AppError, sha256Hex } from '@leanplate/security';
import { RefreshCoalescer } from '../refresh-cache';
import type { TokenPair as Pair } from '../session-logic';
import { expectShape, identity } from './upstream';

const g = globalThis as unknown as { __lpRefresh?: RefreshCoalescer };
const coalescer = (g.__lpRefresh ??= new RefreshCoalescer());

export const refreshKey = (refreshToken: string) => sha256Hex(refreshToken);

/** Rotates a refresh token through identity; concurrent callers with the same token share one rotation. */
export function refreshShared(refreshToken: string, ipHash?: string): Promise<Pair> {
  if (!RefreshBody.safeParse({ refreshToken }).success) return Promise.reject(new AppError(401, 'unauthorized', 'Please sign in again'));
  return coalescer.run(refreshKey(refreshToken), async () =>
    expectShape(TokenPair, await identity('/v1/refresh', { method: 'POST', body: { refreshToken }, ipHash }), 'identity'),
  );
}

/** A newer pair produced moments ago for this refresh token by a parallel request, if any. */
export const recentRotation = (refreshToken: string): Pair | undefined => coalescer.lookup(refreshKey(refreshToken));
