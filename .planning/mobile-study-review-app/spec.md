---
type: spec
branch: mobile-study-review-app
task: React Native mobile app for Post Anki, reusing apps/api, starting with core study/review flow
complexity: complex
state: confirmed
updated: 2026-07-17
---
# Spec: React Native mobile app (core study/review flow)

A new `apps/mobile` Expo/React Native app becomes a fourth client of the existing `apps/api`
backend — no parallel backend, reusing the same REST contract `apps/web` already calls for the
study/review loop (`GET /daily-push`, `POST /topics/:id/probe`,
`POST /topics/:id/probe/answer`). Scope is deliberately narrow: connect with a token, see today's
question, answer it, see the result. No curriculum browsing, no admin, no stats, no chat, no
Electric/local-first sync — those stay web-only for now.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|-------|-----------|------------------|------------------|---------------|---------------------|
| 1. Backend auth | 5, 6 | `api_tokens` table + migration, `hashApiToken`/`isTokenActive` derivers, `authorized()` dual-check, mint script | None | None | Auth check adds one indexed DB lookup per request — negligible at single-user scale |
| 2. Mobile scaffold + connect | 1 | None | Expo app scaffold, secure-store token wrapper, Connect screen | Phase 1 (needs a real token to test against) | N/A |
| 3. Today + answer flow | 2, 3, 4 | None (existing routes, unchanged) | Today screen, question rendering, answer submit, 401→Connect redirect | Phase 2 | N/A |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|--------------------|
| `hashApiToken` | `rawToken: string` | `tokenHash: string` (SHA-256 hex) | SCENARIO 5, SCENARIO 6 |
| `isTokenActive` | `token: { revokedAt: string \| null }`, `now: string` | `boolean` | SCENARIO 5, SCENARIO 4 |

No mobile-side derivers are introduced in this slice — rendering a socratic vs quick_test
question and submitting an answer are presentational/IO concerns mirroring `apps/web`'s existing
`probe-answer.tsx`, not new business rules.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 — first connect with PAT | None | `apps/mobile/app/connect.tsx`, `apps/mobile/src/api/token-storage.ts` | None |
| SCENARIO 2 — Today screen shows question | None (reuses `GET /daily-push` as-is) | `apps/mobile/app/index.tsx`, `apps/mobile/src/study/question-view.tsx` | None |
| SCENARIO 3 — answer and see result | None (reuses `POST /topics/:id/probe/answer` as-is) | `apps/mobile/src/study/answer-submit.ts`, `apps/mobile/app/index.tsx` | None |
| SCENARIO 4 — token rejected mid-session | None | `apps/mobile/src/api/client.ts` (401 handling → clear token → redirect) | None |
| SCENARIO 5 — dual auth check | `apps/api/src/server.ts`, `apps/api/src/api-token/api-token.hash.ts`, `apps/api/src/api-token/api-token.repo.ts`, `apps/api/src/db/schema.ts` | None | None |
| SCENARIO 6 — mint token via script | `apps/api/scripts/create-api-token.ts`, `apps/api/src/api-token/api-token.hash.ts` | None | None |

### Files to create

```
apps/api/
  scripts/create-api-token.ts       — one-off CLI: insert hashed token, print raw value once
  src/api-token/
    api-token.hash.ts                — hashApiToken deriver (pure, SHA-256)
    api-token.hash.test.ts           — unit tests, business language
    api-token.repo.ts                — findActiveTokenByHash(hash), touchLastUsed(id)
    api-token.repo.test.ts           — isTokenActive deriver tests
  src/db/migrations/000X_add_api_tokens.sql   — generated via drizzle-kit generate
  src/db/migrations/meta/000X_snapshot.json   — generated alongside

apps/mobile/                         — new Expo app (npx create-expo-app, TypeScript template)
  app.json                           — Expo config: name "Post Anki", expo-router plugin
  package.json                       — expo, expo-router, expo-secure-store, react, react-native
  tsconfig.json
  app/
    _layout.tsx                      — root layout: reads stored token, redirects to /connect
                                        if absent, otherwise renders the study stack
    connect.tsx                      — SCENARIO 1: paste-a-token screen
    index.tsx                        — SCENARIO 2/3: Today screen (fetch daily push, render
                                        question, submit answer, show result, "next" action)
  src/
    api/
      client.ts                      — fetch wrapper: reads token from secure store, sets
                                        `Authorization: Bearer <token>`, on 401 clears token and
                                        signals the layout to redirect to /connect (SCENARIO 4)
      token-storage.ts                — expo-secure-store get/set/clear wrapper
    study/
      question-view.tsx               — renders a Question (socratic free-text vs quick_test
                                        options), mirrors apps/web's probe-answer.tsx branching
      answer-submit.ts                 — calls POST /topics/:id/probe/answer, typed against
                                        @post-anki/shared's submitProbeInput/AttemptResult
```

### Files to modify

```
apps/api/src/db/schema.ts           — + `apiTokens` table (id, label, tokenHash, createdAt,
                                        lastUsedAt, revokedAt); every existing table definition
                                        stays untouched
apps/api/src/server.ts              — `authorized()` becomes async and additive: request passes
                                        if `Authorization` matches `API_SHARED_SECRET` (unchanged
                                        check, unchanged behavior) OR resolves to an active PAT
                                        via `api-token.repo.ts`; the http.createServer callback
                                        awaits this before routing. No existing route's handler
                                        changes.
package.json (root workspaces)      — apps/mobile added to the npm workspaces list, following
                                        the same apps/<name> convention as api/web/bot
```

### Data model changes

New table `api_tokens`:
- `id` text primary key
- `label` text not null — e.g. "Ilya's phone"
- `token_hash` text not null, unique — SHA-256 hex of the raw token; raw value never stored
- `created_at` timestamptz not null default now()
- `last_used_at` timestamptz nullable
- `revoked_at` timestamptz nullable — null = active

Generated with `npm run db:generate --workspace apps/api` (drizzle-kit), applied with
`npm run db:migrate --workspace apps/api` — never pushed directly, per the migration rule in the
constitution. No existing table's shape changes.

### Documentation changes

No existing doc covers a mobile client's architecture — `docs/architecture/local-first-electric-sync.md`
covers the web-only Electric slice and is not modified (this slice doesn't touch Electric).
New — a short Mermaid diagram of this architecture (the sequence diagram already drafted in
`.planning/mobile-study-review-app/architecture.md`) will be published to
`docs/architecture/mobile-study-review-app.md` during implementation, per this repo's established
`docs/architecture/<slug>.md` convention.

### Decisions made autonomously

1. **PAT over a login screen** — the task's own example ("a login screen exchanging credentials
   for a session token") was floated as an illustration, not a requirement; this app is genuinely
   single-user (same precedent the Electric sync spec already set), so a revocable personal
   access token is per-user authentication without building registration/password/reset
   infrastructure for a user base of one. Recorded explicitly in `architecture.md` since the task
   flagged this as a decision that must not be silently copied from the web pattern.
2. **`authorized()` grows additively, not replaced** — apps/web and apps/bot keep using
   `API_SHARED_SECRET` unchanged; breaking that gate would regress every existing client, so the
   PAT check is an `OR`, not a swap. Called out as SCENARIO 5.
3. **Token minting is a script, not an HTTP endpoint** — avoids a chicken-and-egg auth problem
   (no endpoint needs to authenticate its own first caller) and keeps the trust boundary at
   "whoever can run scripts against this database," matching the existing migration script's
   trust level.
4. **Expo (managed workflow) + Expo Router** over bare React Native — this machine has no iOS
   Simulator and no Android emulator, so Expo Go (scan a QR code on a physical device) is the
   only realistic way to iterate without native build tooling; Expo Router's file-based routing
   also mirrors the file-based convention `apps/web` already uses (TanStack Router), keeping the
   monorepo's mental model consistent across clients.
5. **No same-origin proxy for mobile** — unlike `apps/web`, mobile has nowhere to hide a static
   secret, which is exactly why it authenticates with a PAT it's safe to hold on-device instead
   of proxying through a server tier it doesn't have.
6. **Electric/local-first sync explicitly out of scope** — the task's Electric reference is prior
   art for "reuse the gatekeeper," not a requirement to consume the shape endpoint; the
   study/review flow is plain REST and predates Electric.
7. **Scope is the Today/review loop only** — no curriculum creation, browsing, admin settings,
   stats, or study chat in this pass, per the task's explicit "core flow, not full parity."
8. **Raw token format** — generated with `crypto.randomBytes(32).toString('hex')`, prefixed
   `pat_` for recognizability (mirrors GitHub-style PATs), hashed with SHA-256 before storage.
   Surfaced during self-grilling since the spec must not leave "how is the token generated"
   implicit.
9. **No token expiry (TTL) in this pass** — tokens are revocable (SCENARIO 5) but don't
   auto-expire; for a single personal device this mirrors how `API_SHARED_SECRET` itself never
   expires today. Revocation is the mechanism, not TTL. Revisit if this ever becomes multi-device
   at scale.
10. **No rate-limiting/brute-force protection added to the auth check** — out of scope at this
    project's threat model (personal single-user app, same threat model the existing
    shared-secret gate already accepts); 32 random bytes of token space makes brute force
    computationally infeasible regardless.
11. **This plan was auto-confirmed by the planning agent itself** (no human reviewer in this
    autonomous run) once the consistency gate below passed with 0 gaps, per this run's explicit
    instructions to override the normal human-confirmation step for this personal, low-stakes
    project.

### Implementation order

1. `/tdd hashApiToken` — covers SCENARIO 5, SCENARIO 6
2. `/tdd isTokenActive` — covers SCENARIO 5, SCENARIO 4
3. `api-token.repo.ts` (DB lookup + `touchLastUsed`) — side effect, typechecked not unit-tested
4. `apps/api/src/server.ts` — wire the dual `authorized()` check
5. `apps/api/scripts/create-api-token.ts` — mint script
6. `db:generate` + `db:migrate` for the `api_tokens` table
7. `apps/mobile` scaffold (Expo + TypeScript + Expo Router), root workspaces entry
8. `token-storage.ts` + `client.ts` (secure store, 401 handling)
9. `connect.tsx` screen
10. `app/index.tsx` Today screen + `question-view.tsx` + `answer-submit.ts`
11. Publish `docs/architecture/mobile-study-review-app.md`

### Scope boundary

Out of scope this pass: curriculum browsing/creation, admin settings, stats dashboard, study
chat, Socratic multi-turn chat UI (the mobile Today screen supports both `quick_test` and
`socratic` question kinds the backend already returns, but not the richer chat thread UI
`apps/web`'s `SocraticChat` component has — a single question/answer/result cycle only), push
notifications, offline caching, multi-user accounts, Electric/local-first sync, EAS cloud builds
or app-store submission, and pointing the app at anything other than a locally-run `apps/api` by
default (production base URL is a config value, not built in this pass).

---

### Definition of Done — per layer

**Backend (provable on this machine):**
- `cd apps/api && npm run typecheck` exits 0 after the `api_tokens` schema + auth changes.
- `npx vitest run apps/api/src/api-token/api-token.hash.test.ts apps/api/src/api-token/api-token.repo.test.ts`
  passes — `hashApiToken` and `isTokenActive` asserted in business language.
- `npm run db:generate --workspace apps/api` produces a new migration file under
  `apps/api/src/db/migrations/`, and `npm run db:migrate --workspace apps/api` applies it against
  the local dev database without error (migration generated then run — never pushed directly).
- With the local API running (`npm run dev --workspace apps/api`) and one token minted via
  `npx tsx apps/api/scripts/create-api-token.ts`:
  - `curl -H "Authorization: Bearer $API_SHARED_SECRET" http://localhost:8030/daily-push` → `200`
    (regression check — existing shared-secret callers, i.e. apps/web/apps/bot, are unaffected).
  - `curl -H "Authorization: Bearer <minted-token>" http://localhost:8030/daily-push` → `200`.
  - `curl -H "Authorization: Bearer not-a-real-token" http://localhost:8030/daily-push` → `401`.

**Frontend/Mobile (partially provable on this machine):**
- `cd apps/mobile && npx tsc --noEmit` exits 0.
- `npx expo export` (or `npx expo-doctor`) succeeds, proving the app bundles without a runtime
  error in the module graph.
- **Not verifiable on this machine:** actually seeing the Connect screen, Today screen, or answer
  flow render on a device or simulator. This machine has no iOS Simulator (`xcode-select` points
  at Command Line Tools only, `simctl` is missing) and no Android emulator (`adb` exists but no
  `emulator` binary or configured AVD). Visual/interaction verification requires a physical device
  running Expo Go connected to `npx expo start` — a manual step recorded in `todo.md`, not
  something this build can self-certify.

**Infrastructure:**
- Not applicable. This slice adds no Cloud Run service, no Pulumi resource, and no CI/CD change —
  `apps/mobile` is a client built and run via Expo tooling (Expo Go for iteration, EAS only if the
  user later wants a shareable build), entirely outside this repo's existing IaC. The only
  backend-visible change (the `api_tokens` migration) is verified under the Backend section above
  via the project's existing migration path, not a separate infra check.
