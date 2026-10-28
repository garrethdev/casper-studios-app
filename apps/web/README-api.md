# Leanplate web: backend-for-frontend API

The browser talks only to these routes. Each one validates its input with the `@leanplate/contracts` schemas, builds its upstream request explicitly (nothing from the browser's headers is forwarded) and calls identity or meals through `callService` with caller `web`. Upstream 4xx codes and messages pass through unchanged. Errors always look like `{ "error": { "code", "message" } }`.

Every `POST`, `PUT` and `DELETE` must come from our own origin (`APP_ORIGIN`, default `http://localhost:3000`): the `Origin` header must match, or, if it is absent, `Sec-Fetch-Site` must be `same-origin`. Otherwise the answer is 403. All responses are `Cache-Control: no-store`.

Cookies: `lp_at` (access JWT, HttpOnly, SameSite=Strict, Path=/, 600 s, `__Host-lp_at` and Secure in production) and `lp_rt` (refresh token, HttpOnly, SameSite=Strict, Path=/api/auth, 14 days, Secure in production). The refresh cookie is only sent to `/api/auth/*`, so on other routes a 401 means "call `POST /api/auth/refresh`, then retry". `lib/api.ts` does that automatically, with one shared refresh at a time.

| Route | Body / query | Success | Notes |
|---|---|---|---|
| `POST /api/auth/register` | `RegisterBody` | 201 `{ user }` + cookies | Registers, then logs in. 5 per minute per IP. |
| `POST /api/auth/login` | `LoginBody` | 200 `{ ok }` + cookies | Wrong email or password is always 401 `invalid_credentials`. 10 per minute per IP. |
| `POST /api/auth/logout` | none | 204 | Revokes the session family (best effort), clears both cookies. |
| `POST /api/auth/refresh` | none | 204 + new cookies | Rotates `lp_rt`. Concurrent calls with one token share one rotation. `?soft=1` answers 200 `{ refreshed }` instead of 401. |
| `GET /api/me` | | `{ user, hasProfile }` | |
| `GET /api/profile` | | `Profile` | 404 `no_profile` before onboarding. |
| `PUT /api/profile` | `ProfileInput` (needs `acceptedDisclaimer: true`) | `{ profile, targets }` | |
| `GET /api/targets` | | `Targets` | |
| `POST /api/meals/analyze` | `AnalyzeMealBody`, at most 6 MB | `AnalyzeMealResult` | Nothing is saved. 30 per minute per IP. |
| `POST /api/meals` | `SaveMealBody` | `{ meal }` | Server recomputes totals and verdict. `idempotencyKey` makes repeats harmless. |
| `GET /api/meals?date&tz` | `date` = `YYYY-MM-DD`, `tz` = `Date.getTimezoneOffset()` | `{ meals }` | |
| `DELETE /api/meals/:id` | | 204 | 404 if it is not yours. |
| `GET /api/summary?date&tz` | | `DaySummary` | |
| `DELETE /api/data` | | 204 | Deletes meals and profile. |
| `DELETE /api/account` | | 204 + cleared cookies | Deletes meal data, then the identity account. |

Rate limiting keys on the first `x-forwarded-for` entry only (Vercel overwrites that header). A missing or malformed value falls back to the shared `local` bucket. `sha256(ip)` is passed to identity as the service token's `cip` claim.

Security headers (per-request nonce CSP, HSTS in production and so on) are set in `middleware.ts`. `style-src` keeps `'unsafe-inline'` because Next and React emit inline styles; scripts stay nonce-only.
