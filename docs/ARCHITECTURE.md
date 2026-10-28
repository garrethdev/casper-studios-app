# Architecture

## The shape

```
 browser ──HTTPS──▶ web (Next.js: pages + backend-for-frontend)
                        │ service token (web→identity)        │ service token (web→meals)
                        ▼                                     ▼
                    identity ──┐                            meals ──── service token (meals→intelligence) ──▶ intelligence
                               │                              │                                                   │
                        schema identity                 schema meals                                        no database
                               └──────── one Postgres ───────┘                                             Anthropic API
```

Four deployable units. The browser only ever talks to **web**. Everything behind it is private: every internal request carries a signed, 60-second service token naming the caller and the callee, and calls that act for a user also carry that user's access token.

| Unit | Owns | Talks to |
|---|---|---|
| web | cookies, same-origin checks, per-IP rate limits, the UI | identity, meals |
| identity | users, sessions, lockout, audit log | nothing |
| meals | plans, meal history, verdicts, AI usage quota | intelligence |
| intelligence | pre-processing, vision, text parsing, retrieval, validation, feedback | Anthropic |

The intelligence service holds no user data at all. It receives a photo or a sentence and the user's allergens and diet, and returns an analysis. It does not get the user's id.

## Inside a service

Every service has the same four layers, and dependencies only point inward:

- `domain/`: pure business rules with no I/O. The energy formula, the meal score, the lockout rules, the session state machine, the food knowledge base. These are the files to read to understand what the product does, and they are tested exhaustively because they are cheap to test.
- `application/`: use cases and the ports (interfaces) they need, such as `MealRepo`, `Intelligence`, `UsageRepo`, `MealAnalyzer`, `Clock`.
- `infrastructure/`: adapters that implement the ports: Postgres repositories, the Anthropic client, the text parser, the scrypt hasher.
- `http/`: Hono routes. Every input is parsed with a shared zod schema and every output is parsed through the matching schema before it leaves.

`app.ts` wires the layers together and accepts injected dependencies, so tests run against an in-memory database and a fake model with a controllable clock. `server.ts` is only the development entry point.

## Shared packages

- **contracts**: the zod schemas for every request and response, plus three pure helpers (`sumTotals`, `scaleItem`, `round1`). This package is the only one the browser imports.
- **security**: scrypt password hashing with a dummy-verify path, a NIST-style password policy, ES256 access tokens, HS256 service tokens, the `serviceAuth` and `userAuth` middleware, a sliding-window rate limiter, same-origin checking, and byte-level image type sniffing.
- **platform**: the app shell (request ids, hardened headers, body limit, uniform errors), `createDb` (embedded Postgres locally, Supabase Postgres in production), `migrate` (advisory-locked, so parallel cold starts do not race), redacting structured logs, and `callService` (signs a token, forwards the request id, shrinks the timeout at each hop).

## The data model

One Postgres in production, one schema per service, and no cross-schema queries; locally each service has its own embedded database so the isolation is real, not just a convention.

- `identity.users`, `identity.sessions` (token hashes only, grouped in families), `identity.audit_log`.
- `meals.profiles` (one JSON document per user), `meals.meals` (items, totals, verdict and feedback stored as the user saw them, plus an idempotency key), `meals.usage` (AI analyses per user per hour).

Every query that touches user data is filtered by the user id from the verified token, never from the request body. Row-level security is enabled with no policies on every table, so Supabase's public API roles can read nothing.

## The AI layer, stage by stage

1. **Pre-process.** The image's real type is sniffed from its bytes (the declared type is ignored). It is capped at 3 MB and 25 megapixels, rotated by its EXIF tag, resized to at most 1024 px, and re-encoded from pixels as a plain JPEG, so no metadata of any kind survives. Text is NFKC-normalized, stripped of control and invisible characters, capped in length, and scanned for instruction-like phrases; a match only adds a warning, it never changes how the text is handled.
2. **Analyze** through the `MealAnalyzer` port. With a photo, the Anthropic adapter sends one image block and a quoted hint, with no sampling parameters (current models reject them) and a system prompt that says any text in the image or from the user is data, never an instruction. With words only, a deterministic parser handles counts, units and typical portions against the knowledge base. The model has no tools.
3. **Ground.** Each detected food is retrieved from the knowledge base with BM25 over names and aliases. A strong match replaces the model's guessed nutrition with the reference values scaled to the portion and records a citation; a weak one keeps the estimate and marks the item for review.
4. **Validate.** Strict schema, a non-food image is a 422, calories must agree with the 4/4/9 macro rule within 25% or are recomputed, portions and densities must be plausible, totals above 4,500 kcal are rejected, allergen and diet conflicts become named warnings, low confidence marks the item.
5. **Feedback.** Guidance snippets are retrieved for the verdict's flags and the tips are built from templates grounded in them, with citations. If a key is present the model may reword the tips warmly, constrained to those snippets, with the templates as the fallback on any failure.

## What happens when you save a meal

The browser sends the edited items with an idempotency key. The meals service re-checks every number (calories versus macros, density, weight), sums the totals itself, loads the rest of that local day to see how much is already eaten, scores the meal, asks intelligence for feedback (and saves without it if that fails), and stores the result. A repeated key returns the original row instead of a duplicate.

## Deployment topology

The code boundaries above are fixed; where the units run is a choice. The default is four Vercel projects, one per unit, built by `scripts/bundle.mjs` into single functions. Because each service exposes `buildApp()` returning a plain Hono app, the same code can be mounted inside one project and called in-process through the same `callService` interface, which removes the chain of cold starts for small deployments. The service-token checks apply either way.

## Where it goes next

In order of impact:

1. **Asynchronous analysis.** Today web waits for meals which waits for intelligence which waits for the model, so three functions sit idle during a vision call. The next step is a job row: meals returns `202 { jobId }`, intelligence fills it in, the browser polls. This also removes the timeout coupling between hops entirely.
2. **Cache feedback.** Feedback depends only on the label, the flags and the size of the meal, which is a few hundred distinct inputs. Memoizing it removes the second AI call per meal.
3. **Store the local date at write time.** The seven-day chart currently loads full rows for a week and buckets them in code. A `local_date` column written at save time turns it into one `group by`.
4. **Photos through object storage.** Upload straight to storage with a signed URL and pass a reference instead of 4.5 MB of base64 through two services.
5. **Knowledge base in the database.** The retriever interface already hides the source; at USDA scale the corpus moves to Postgres full-text search or pgvector.
6. **Asymmetric service identity.** Replace the shared HS256 secrets with per-caller key pairs once there are more than a handful of services.
7. **Retention jobs** for the audit log and idempotency keys.
