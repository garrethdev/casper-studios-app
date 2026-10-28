# Leanplate

Leanplate is a meal tracker for people who are trying to lose weight. You take a photo of what you just ate, or describe it in a sentence, and it breaks the meal into foods, shows the calories and macros, and tells you plainly whether that meal moves you toward your goal. The tone is a coach, not a scold.

I built it because I have tried most of the big tracking apps and they all make the same two mistakes: they treat logging as data entry, and they never answer the one question I actually have after eating, which is "was that okay?". Leanplate answers it in one screen.

**Submission for the Casper Studios take-home.** TypeScript end to end.

- Deployed product: https://leanplate-web.vercel.app
- Source: https://github.com/garrethdev/casper-studios-app

## What works

- **Accounts.** Sign up and sign in with email and password. Sessions use a 10-minute access token and a rotating refresh token, both in HTTP-only cookies. Replaying an old refresh token revokes the whole session. Five wrong passwords lock the account for fifteen minutes.
- **Onboarding.** Four steps: about you (sex, age, height, weight, activity), your goal (target weight and pace), food preferences (diet and allergens), and a plan review that you must acknowledge is not medical advice. The plan uses Mifflin-St Jeor for resting energy, an activity multiplier, and a pace-based deficit that is capped at 25% of maintenance and never goes below a calorie floor.
- **Add a meal from a photo.** The photo is shrunk and re-encoded in the browser, then checked on the server by its real bytes, resized again, and stripped of all metadata (including GPS) before a vision model lists the foods. Needs an Anthropic API key.
- **Add a meal from words.** "Two scrambled eggs, a slice of wholegrain toast and half an avocado" is parsed by a deterministic parser over a built-in knowledge base of 191 common foods. Works offline, no key needed.
- **Grounding and validation.** Every detected food is matched against the knowledge base (BM25 with aliases) and, when the match is strong, its nutrition numbers are replaced by the reference values. Calories must agree with the macros, portions must be plausible, allergen and diet conflicts become warnings, and anything the model gets wrong is flagged for review rather than passed through.
- **Editable breakdown.** Change the grams of any food and everything rescales. Remove foods or add one by hand.
- **Verdict.** Each meal scores 0 to 100 against your plan (calories, effect on the rest of the day, protein, fiber, sugar) with reasons in plain language. A listed allergen in the meal overrides everything. The server recomputes the score when you save; the browser's numbers are never trusted.
- **Feedback.** A headline and up to three tips, built from a guidance corpus of 36 snippets and cited ("Why we say this"). With an API key the tips are reworded warmly; without one you get the templates.
- **Dashboard.** Calorie ring, protein, fiber and sugar bars, today's meals with their verdicts, a seven-day chart.
- **Settings.** Edit your plan, delete your meal data, delete your account.

## What is incomplete

- Photo analysis has only been exercised with unit tests against a mocked model and the real pipeline in text mode. It needs an `ANTHROPIC_API_KEY` to run for real.
- There is no password reset or email verification (no email provider is wired in).
- The weekly chart shows calories only. Weight tracking over time is not built.
- Analysis is synchronous: the browser waits while the model works. The roadmap in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the job-based version.
- Next.js prints a deprecation notice for `middleware.ts` (its replacement is `proxy.ts`); it still works and the migration is mechanical.

## How to run it locally

Requirements: Node 22 or newer and npm. Nothing else; each service runs its own embedded Postgres locally.

```bash
npm install
```

```bash
npm run dev
```

That starts all four processes: the web app on http://localhost:3000, and the identity (4001), meals (4002) and intelligence (4003) services. Open the web app, create an account, and follow the onboarding.

Photo analysis is optional. To turn it on, copy `.env.example` to `.env.local` at the repo root and set `ANTHROPIC_API_KEY`. Without it, describe meals in words; the app tells you photo analysis is unavailable.

Development keys for signing tokens are generated once into `.data/` (git-ignored). In production every secret must come from the environment and a missing one is a startup failure.

## Tests and checks

```bash
npm test
```

546 tests across the four packages and services. Most are written as attacks: wrong user, tampered or expired tokens, replayed refresh tokens, forged service tokens, disguised uploads, prompt injection in the model's reply, implausible nutrition numbers, cross-user access to meals, idempotency replays.

```bash
npm run typecheck
```

## Repository layout

```
packages/contracts     zod schemas shared by every service and the browser
packages/security      passwords, JWTs, service tokens, rate limiting, upload sniffing
packages/platform      app shell, database, migrations, logging, service-to-service calls
services/identity      accounts and sessions
services/meals         plans, verdicts, meal history
services/intelligence  the AI layer: pre-processing, vision, text parser, retrieval, validation, feedback
apps/web               Next.js app: UI plus the backend-for-frontend route handlers
scripts/bundle.mjs     builds one service into a single Vercel function
docs/                  architecture and security notes
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit and [docs/SECURITY.md](docs/SECURITY.md) for the threat model and what is done about it.

## Deployment

Each service and the web app is its own Vercel project, all sharing one Supabase Postgres where each service owns a schema.

1. `node scripts/bundle.mjs identity` (and `meals`, `intelligence`) produces `dist/<service>` with a single function, a `vercel.json` and a minimal `package.json`. Deploy each folder as a project.
2. Deploy `apps/web` as a Next.js project with the repository root as the monorepo root.
3. Environment variables: see `.env.example`. Generate `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` as a P-256 pair, and three 32-byte service secrets. Identity gets the private key; meals and web get the public key; each secret goes to the service it guards and the one caller allowed to use it.
4. Migrations run automatically on first start, under an advisory lock.

## AI tools

I used Claude Code to write large parts of this codebase from a specification I wrote first ([docs/SPEC.md](docs/SPEC.md) describes the contract each piece was built against), then reviewed and corrected the result. I can discuss and change any of it.
