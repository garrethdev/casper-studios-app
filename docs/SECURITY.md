# Security

This is a health app that handles weight, goals, allergens and photos of what people eat. The design assumes every input is hostile, every service is reachable from the internet, and the model can be talked into saying anything.

## Threats and what is done about them

| Threat | Control | Where |
|---|---|---|
| Credential stuffing, brute force | scrypt hashes; 12-character minimum with a block-list; unknown emails burn the same time as wrong passwords and get the same 401; 5 failures lock the account for 15 minutes, counted in the database so it holds across instances; per-IP limits on login and register | `packages/security/password*.ts`, `services/identity/src/domain/lockout.ts` |
| Stolen session | 10-minute access tokens (ES256); refresh tokens are random, stored only as SHA-256, rotated on every use; presenting a used token again revokes the whole family and writes an audit event; a seconds-old duplicate from a racing tab is refused without revoking | `services/identity/src/application/refresh-session.ts` |
| XSS stealing tokens | Tokens live only in HTTP-only, SameSite=Strict cookies (`__Host-` prefix in production); the page never sees them; nonce-based CSP with `strict-dynamic` and no inline scripts; no `dangerouslySetInnerHTML` anywhere; model output is rendered as text | `apps/web/middleware.ts`, `apps/web/lib/cookies.ts` |
| CSRF | SameSite=Strict plus an explicit same-origin check (Origin header, or Sec-Fetch-Site when absent) on every POST, PUT and DELETE | `packages/security/origin.ts` |
| Calling a service directly | Every service is behind `serviceAuth`: a 60-second HS256 token naming the caller and callee, with an allow-list of callers per service; without it every route is 401 | `packages/security/middleware.ts` |
| Reading another user's data | Every query is scoped by the user id from the verified token; the body never names a user; tests try every route as the wrong user | `services/meals/test/api.test.ts` |
| Tampered nutrition numbers from the browser | The server re-derives calories from macros, rejects impossible densities and weights, recomputes totals and the verdict, and parses the result through the contract before storing it | `services/meals/src/domain/integrity.ts` |
| Malicious uploads | Real type sniffed from bytes; declared type ignored; 3 MB and 25 megapixel caps; decoded with `failOn: 'error'` and a pixel limit; re-encoded from pixels so no metadata, GPS, ICC profile or embedded payload survives | `services/intelligence/src/application/preprocess.ts` |
| Prompt injection via image text or the description | The model has no tools; the user's text is quoted as a JSON string in the user turn, never in the system prompt; the system prompt states that all such text is data; the reply must be one JSON object that passes a strict schema or it is a 422; instruction-like food names are replaced; injection-looking descriptions get a warning but are otherwise treated as ordinary text | `services/intelligence/src/infrastructure/anthropic.ts`, `validate.ts` |
| Model cost abuse | Analyses are capped per user per hour in the database (atomic upsert), so the cap holds across serverless instances; malformed requests are rejected before they count; one retry only on transient upstream errors | `services/meals/src/infrastructure/repos.ts` |
| Secrets in code or logs | No secret is in the repository; development keys are generated into a git-ignored folder; production refuses to start without each one; the logger redacts any field whose name looks like a secret, token, email or image; upstream error bodies are never echoed | `packages/security/keys.ts`, `packages/platform/logger.ts` |
| Database exposure | Each service owns one schema; row-level security is on with no policies so the public API roles see nothing; migrations run under an advisory lock | `*/infrastructure/migrations.ts` |
| Oversized or hostile request bodies | Byte caps enforced while streaming (web), Hono body limits per service, strict zod schemas that reject unknown fields everywhere | `apps/web/lib/server/bff.ts` |

## Data handling

- Photos are never stored. They are processed in memory and discarded after analysis. The browser also strips them before upload by re-encoding through a canvas.
- The AI service never receives a user id, email or any identifier; it gets the photo or sentence and the allergen and diet lists.
- Users can delete all meal data, or the whole account, from Settings. Deletion cascades.
- Audit events record what happened (login, lockout, replay, deletion) with no passwords, tokens or token hashes.

## Known limits, stated plainly

- Access tokens are stateless for ten minutes. Identity refuses a logged-out token immediately, but the meals service trusts a valid token until it expires. A revoked-session list checked by `userAuth` would close this if it ever needs to be instant.
- Service tokens carry a unique id but it is not checked, so a stolen token could be replayed within its 60-second life. Checking it needs a shared store.
- A refresh token reused within 10 seconds of its first use is refused but does not revoke the family, because two tabs or two serverless instances can legitimately race on one cookie. An attacker who steals a token and replays it inside that window learns nothing and gains nothing, but is also not detected.
- Per-IP rate limits in the web app are in memory and therefore per instance on serverless. The limits that matter for safety (lockout, AI quota) are in the database.
- `style-src` keeps `'unsafe-inline'` because Next and React emit inline styles. Scripts are nonce-only.
- No password reset and no email verification, because no email provider is wired in.
