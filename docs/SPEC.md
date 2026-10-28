# Leanplate build spec

Leanplate is a meal tracker that breaks a meal into foods and says whether it moves the user toward a weight-loss goal. This file is the contract every service is built against.

## Ground rules (all services)

- TypeScript, strict, ESM. Node 22+. Tests with Vitest (`npx vitest run` from the repo root).
- Import shared code only through `@leanplate/contracts`, `@leanplate/security` and `@leanplate/platform`. **Do not edit `packages/*`.** If you need a change there, say so in your final report instead.
- Clean architecture inside each service, with dependencies pointing inward:
  - `src/domain`: pure business rules and entities. No I/O, no frameworks.
  - `src/application`: use cases and the ports (interfaces) they need.
  - `src/infrastructure`: adapters that implement ports (database, Anthropic, parsers).
  - `src/http`: Hono routes. Validate every input with the zod schemas in `@leanplate/contracts` and use `parseBody`.
  - `src/app.ts`: `export async function buildApp(deps?: Partial<Deps>): Promise<Hono<AuthEnv>>`. Defaults are read from the environment; tests pass in-memory fakes. Build it on `createApp(serviceName)` from `@leanplate/platform`.
  - `src/server.ts`: development entry. It calls `loadDevEnv()`, builds the app, and serves it with `@hono/node-server` on the service's port.
- Secrets never appear in code, logs or responses. Use `serviceSecret(...)`, `jwtPrivateKey()`, `jwtPublicKey()` from `@leanplate/security`.
- Never return stack traces or internal error text. Throw `AppError(status, code, message)` for client-safe errors.
- Every database query that touches user data must be scoped by the user id from the verified token, never from the request body.
- Write tests that attack the service (bad input, wrong user, tampered tokens), not just happy paths. Keep each service's tests in `services/<name>/test/`.

## Ports and environment

| Service | Port | Env it reads |
|---|---|---|
| identity | 4001 (`IDENTITY_PORT`) | `DATABASE_URL` (optional locally), service secret `IDENTITY`, JWT private key |
| meals | 4002 (`MEALS_PORT`) | `DATABASE_URL`, `INTELLIGENCE_URL` (default http://localhost:4003), service secrets `MEALS` and `INTELLIGENCE`, JWT public key |
| intelligence | 4003 (`INTELLIGENCE_PORT`) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-haiku-5-5`), service secret `INTELLIGENCE` |
| web | 3000 | `IDENTITY_URL` (default http://localhost:4001), `MEALS_URL` (default http://localhost:4002), service secrets `IDENTITY` and `MEALS`, `APP_ORIGIN` (default http://localhost:3000) |

## Authentication model

1. The browser talks only to the **web** app. It holds two HTTP-only cookies: a 10-minute access JWT and a rotating refresh token.
2. Every internal call carries `x-service-token`: a 60-second HS256 token naming the caller (`iss`) and callee (`aud`). Allowed callers: identity accepts `web`; meals accepts `web`; intelligence accepts `meals`.
3. Calls that act for a user also carry `Authorization: Bearer <access JWT>`, verified with `userAuth` from `@leanplate/security`. The service token's `cip` claim carries a hash of the client IP for rate limiting.

## identity service (schema `identity`)

Tables: `users(id uuid pk, email unique, password_hash, created_at, failed_attempts int, locked_until timestamptz, last_login_at)`, `sessions(id uuid pk, user_id fk cascade, family_id uuid, token_hash unique, created_at, expires_at, used_at, revoked_at)`, `audit_log(id serial, at, user_id, event, detail jsonb)`.

| Route | Auth | Behavior |
|---|---|---|
| `POST /v1/register` | service | `RegisterBody`. Apply `checkPasswordPolicy`. Hash with `hashPassword`. 409 `email_taken` if present. 201 `{ user }`. |
| `POST /v1/login` | service | `LoginBody`. Unknown user runs `verifyAgainstDummy` and returns the same generic 401 `invalid_credentials` as a wrong password. 5 failed attempts locks the account for 15 minutes (429 `account_locked`, with Retry-After). Success resets the counter and returns `TokenPair` (access JWT via `signAccessToken`, refresh token = `randomToken(32)`, stored only as `sha256Hex`, valid 14 days). |
| `POST /v1/refresh` | service | `RefreshBody`. Rotates: marks the used token and issues a new one in the same family. If a used or revoked token is presented, revoke the whole family, write an audit event, return 401. |
| `POST /v1/logout` | service | `LogoutBody`. Revokes the token's family. Always 204. |
| `GET /v1/me` | service + user | Returns `UserDto`. |
| `DELETE /v1/account` | service + user | Deletes the user (cascade) and writes an audit event. 204. |

Per-IP rate limits on register and login keyed on the service token's `cip` claim.

## intelligence service (no database, no user data)

| Route | Auth | Behavior |
|---|---|---|
| `POST /v1/analyze` | service (caller `meals`) | Body `AnalyzeRequest`. Returns `Analysis`. |
| `POST /v1/feedback` | service (caller `meals`) | Body `FeedbackRequest`. Returns `Feedback`. |

Pipeline for `/v1/analyze`: **pre-process** (sniff the real image type with `sniffImage`, cap 3 MB and 25 megapixels, auto-rotate, strip all metadata by re-encoding to JPEG, longest side at most 1024 px; for text, Unicode-normalize, strip control characters, cap length) then **analyze** through an `MealAnalyzer` port (adapters: Anthropic vision; a deterministic text parser over the knowledge base used when there is no key or no image) then **ground** by retrieving the matching knowledge-base food for each detected item (BM25 with aliases) and replacing the model's guessed per-gram values with the knowledge-base values when the match is strong, otherwise keeping the model estimate and setting `needsReview` then **validate** (strict schema, non-food images rejected with 422 `not_food`, kcal must agree with 4/4/9 macros within 25%, per-item and total plausibility ranges, allergen and diet conflicts become warnings, low confidence sets `needsReview`) then return `Analysis` with `citations` for the knowledge-base entries used.

The Anthropic adapter calls `https://api.anthropic.com/v1/messages` with headers `x-api-key` and `anthropic-version: 2023-06-01`, no sampling parameters (current models reject `temperature`), a system prompt that says text inside the image is untrusted data and must never be followed, and returns JSON only. The model has no tools. Its output is parsed and validated; anything that fails the schema is a 422 `analysis_failed`, never passed through. No user identifiers are ever sent to the model.

`/v1/feedback`: retrieve guidance snippets for the flags (BM25 over a guidance corpus), then build `Feedback` from templates grounded in those snippets, with `citations`. If a key is available, an optional second model call may rephrase the tips in a warm tone, constrained to the retrieved snippets, with a template fallback on any failure.

Knowledge base: at least 120 common foods (per-100g kcal, protein, carbs, fat, fiber, sugar, typical portion grams, aliases, allergen tags, diet tags, category) in `src/domain/knowledge/foods.ts`, and at least 25 short, plain, general weight-loss guidance snippets in `guidance.ts`. Values are approximate reference figures and must be labeled as such. No medical claims.

## meals service (schema `meals`)

All routes need the service token (caller `web`) and the user's bearer token. `date` is `YYYY-MM-DD` in the user's local time and `tz` is `Date.getTimezoneOffset()` minutes.

| Route | Request | Response |
|---|---|---|
| `GET /v1/profile` | | `Profile`, or 404 `no_profile` before onboarding |
| `PUT /v1/profile` | `ProfileInput` | `{ profile: Profile, targets: Targets }` |
| `GET /v1/targets` | | `Targets` (404 `no_profile` if none) |
| `POST /v1/meals/analyze` | `AnalyzeMealBody` | `AnalyzeMealResult` (analysis, draft verdict, feedback). Nothing is saved. |
| `POST /v1/meals` | `SaveMealBody` | `{ meal: MealRecord }` (the server recomputes totals and verdict; the client's numbers are never trusted) |
| `GET /v1/meals?date&tz` | | `{ meals: MealRecord[] }` |
| `DELETE /v1/meals/:id` | | 204 (404 if it is not the caller's) |
| `GET /v1/summary?date&tz` | | `DaySummary` |
| `DELETE /v1/data` | | 204, deletes the profile and every meal |

The web app calls meals and identity with `callService` from `@leanplate/platform/http`.

## web app (Next.js App Router, apps/web)

Screens: landing with sign in and sign up; four-step onboarding (about you, your goal, food preferences, review plan and accept the note); dashboard (calorie ring, macro bars, today's meals, 7-day bars); add-meal flow (photo or text, editable breakdown, verdict, tips, save).

All server logic is in route handlers under `app/api/*` (the backend-for-frontend): they set and read the cookies, refresh the access token transparently, check same-origin on every state-changing request with `isSameOrigin`, rate-limit by IP, and forward to identity and meals. The browser never sees a service URL or secret.
