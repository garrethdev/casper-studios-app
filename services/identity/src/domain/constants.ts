/** Business constants for the identity service. Times are in milliseconds unless the name says otherwise. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const ACCESS_TTL_SECONDS = 600;
/** A used refresh token presented again inside this window is a late duplicate from another tab or
 * serverless instance, not a thief. It is refused, but the family survives. */
export const REFRESH_REUSE_GRACE_MS = 10_000;

export const REGISTER_RATE = { windowMs: 60_000, max: 5 } as const;
export const LOGIN_RATE = { windowMs: 60_000, max: 10 } as const;
