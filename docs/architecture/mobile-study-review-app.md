# Mobile study/review app

`apps/mobile` is a new Expo/React Native client of `apps/api` — a fourth client alongside
`apps/web` and `apps/bot`, no parallel backend. It reuses the same REST routes `apps/web`
already calls for the study/review loop: `GET /daily-push`, `POST /topics/:id/probe`,
`POST /topics/:id/probe/answer`. Scope is deliberately narrow: connect with a token, see
today's question, answer it, see the result — no curriculum browsing, admin, stats, chat, or
Electric/local-first sync in this pass.

Mobile now also has a dedicated Practice flow for `language-practice` subjects (phrase-bank
data), separate from the daily-push loop — see "Two entry points" below.

## Authentication: a revocable personal access token, not a login screen

`apps/web`'s existing auth pattern — a static `API_SHARED_SECRET` injected by a same-origin
proxy route — only works because `apps/web` has a server tier to hide the secret in. A native
app has no such tier; embedding `API_SHARED_SECRET` in the app bundle would let anyone who
downloads the app extract and reuse it against production.

Instead, `apps/api`'s single `authorized()` gate grows a second, additive check: a request is
authorized if it presents either the correct shared secret (unchanged, for `apps/web`/`apps/bot`)
or a valid, unrevoked personal access token (PAT), hash-compared against a new `api_tokens`
table. Tokens are minted by a one-off script (`apps/api/scripts/create-api-token.ts`), never an
HTTP endpoint — there is no chicken-and-egg problem, and the trust boundary for "who can create
a credential" stays at "whoever can run scripts against this database," the same boundary
migrations already sit behind. The raw token is shown once and stored only in the device's
secure keychain (`expo-secure-store`), never in plain `AsyncStorage` and never in source control
or the app bundle.

## Flow

```mermaid
sequenceDiagram
    participant Mobile as apps/mobile (Expo, physical device)
    participant Api as apps/api (GET /daily-push, POST /topics/:id/probe*)
    participant Db as Neon Postgres (api_tokens, existing tables)

    Mobile->>Mobile: Connect screen — user pastes PAT, stored in expo-secure-store
    Mobile->>Api: GET /daily-push, Authorization: Bearer <PAT>
    Api->>Db: hash PAT, look up api_tokens (not revoked)
    Db-->>Api: token row found and active
    Api-->>Mobile: 200, push + question
    Mobile->>Api: POST /topics/:id/probe/answer, Authorization: Bearer <PAT>
    Api-->>Mobile: 200, grading result
    Note over Mobile,Api: If token revoked/unknown: 401 → Mobile clears token, returns to Connect
```

### Web-platform token storage fallback

`expo-secure-store` has no real implementation on the web target — its web module
(`ExpoSecureStore.web.ts`) is an intentional empty stub. Calling it unconditionally crashes the
app the moment it tries to read the stored token, which stalls `_layout.tsx` on its loading
spinner forever. `apps/mobile/src/api/token-storage.ts` now branches on `Platform.OS === "web"`
to read/write/clear `window.localStorage` instead, mirroring the `Platform.OS === "ios"` pattern
already used in `apps/mobile/app/connect.tsx`. Native iOS/Android storage is unaffected — that
branch still calls `SecureStore.*` exactly as before. This exists to make the app testable via
`expo start --web` + Playwright (this project has no simulator/device — see issue #65); it is not
a production security boundary change, since the app is never shipped to a browser as its primary
target.

## Two entry points: Today vs Practice

The backend has no unified "what's due" concept across pedagogy kinds yet — `GET /daily-push`
only reads the architecture-mentor data model (`curricula`→`topics`→`gaps`); language-practice's
`phrase_bank_entries` hang off a bare `subjectId` with no topic/curriculum, so they're structurally
invisible to `/daily-push`. Mobile therefore has two independent entry points into the same
backend, not one:

- **Today** (`apps/mobile/app/index.tsx`) — `GET /daily-push` auto-selects one due
  architecture-mentor gap and renders it via the existing probe/quiz flow.
- **Practice** (`apps/mobile/app/practice/index.tsx` and `apps/mobile/app/practice/[subjectId].tsx`)
  — the learner picks a language-practice subject from a list (`GET /subjects`, filtered to
  `kind === "language-practice"`, each row showing a due-count from `GET /subjects/:id/phrase-bank`),
  then generates and answers one phrase at a time via `POST /subjects/:id/phrase-batches` and
  `POST /subjects/:id/attempts`.

This mirrors the architecture-mentor screen's one-question/one-answer/one-result rhythm rather
than desktop's chunk-of-5/10 grid with a level/pack picker and phrase-bank archive panel — those
are real desktop features but beyond what a real graded interaction for a language-practice
subject requires. Unifying the two entry points into one cross-kind "what's due today" surface is
tracked separately (issue #58) and is out of scope here.

## What's out of scope

Curriculum browsing/creation, admin settings, stats dashboard, study chat, the richer Socratic
chat-thread UI (`apps/web`'s `SocraticChat`), push notifications, offline caching, multi-user
accounts, Electric/local-first sync, EAS cloud builds or app-store submission, pointing the app at
anything other than a locally-run `apps/api` by default, unifying `/daily-push` across pedagogy
kinds (issue #58), on-device/native verification (issue #65), and language-practice's level/pack
picker, chunked answering, batch prefetching, and phrase-bank archive panel on mobile (desktop-only
features, not required by the Done-when bar this Practice flow satisfies).

See `.planning/mobile-study-review-app/` and `.planning/mobile-study-loop/` for the full spec,
scenarios, and architecture notes this slice was built from.
