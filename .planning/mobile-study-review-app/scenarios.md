---
type: scenarios
branch: mobile-study-review-app
task: React Native mobile app for Post Anki, reusing apps/api, starting with core study/review flow
state: confirmed
updated: 2026-07-17
---
# Scenarios: React Native mobile app (core study/review flow)

## Business Scenarios

SCENARIO 1: First-time connect with a personal access token

The user installs the app (via Expo Go, scanning a QR code from `npx expo start`), is shown a
one-time "Connect" screen asking for a token, pastes in a token they generated on their own
machine, and the app stores it securely and moves straight to the Today screen.

What to verify:
- A token that apps/api accepts is stored in the device's secure storage (`expo-secure-store`),
  never in plain `AsyncStorage` and never hardcoded in the app bundle.
- An invalid or revoked token shows an inline error on the Connect screen and does not navigate
  forward.
- Once connected, relaunching the app skips the Connect screen (token persisted across restarts).

SCENARIO 2: Today screen shows the day's review question

The user opens the app already connected and sees one question — the same "Today" pick
(`GET /daily-push`) the web app surfaces — with the topic/curriculum context and the reason it
was chosen.

What to verify:
- Empty state: no candidates yet (`push` is null) shows a plain "nothing to review yet" message,
  not a crash or blank screen.
- The question renders correctly for both kinds the backend can return (`socratic` free-text
  prompt vs `quick_test` multiple-choice), matching `QuestionKind` from `@post-anki/shared`.

SCENARIO 3: Answering a question and seeing the result

The user answers the shown question (types free text for socratic, taps an option for
quick_test) and submits; the app calls `POST /topics/:topicId/probe/answer` and shows the
grading result (pass/fail, feedback) inline before offering the next question.

What to verify:
- A quick_test answer without an associated `gapId` still submits (matches web's `probe-answer.tsx`
  self-report path for gap-less questions).
- A network failure during submit shows a retry affordance instead of losing the typed answer.
- After a successful submit, the user can pull to refresh / tap "next" to fetch a new
  `GET /daily-push` pick — mirrors the web "↻ New push" affordance.

SCENARIO 4: Token rejected mid-session (revoked or expired)

The user's token stops being valid while using the app (revoked from the backend independently)
— any subsequent API call returns 401, and the app returns them to the Connect screen with a
message, rather than showing a broken/blank study screen.

What to verify:
- 401 from any endpoint clears the stored token and redirects to Connect — not just on login.
- No endpoint silently retries with a stale token in a loop.

## Technical/Architectural Scenarios

SCENARIO 5: apps/api accepts a personal access token alongside the existing shared secret

The single `authorized()` gate in `apps/api/src/server.ts` — today only checks
`Authorization: Bearer <API_SHARED_SECRET>` — must also accept
`Authorization: Bearer <valid, unrevoked PAT>` without changing behavior for existing callers
(apps/web's same-origin proxy, apps/bot).

What to verify:
- A request with the correct `API_SHARED_SECRET` still succeeds (regression check — this is the
  scenario most likely to break silently since it touches the one shared gate every route relies
  on).
- A request with a valid, unrevoked PAT succeeds.
- A request with a revoked or unknown token/secret returns 401, same as today.
- Token lookup compares a hash, never the raw token, against the `api_tokens` table.

SCENARIO 6: A token is minted for the one user without building a login system

The user runs a one-off script against `apps/api`'s database to mint a new token (label +
raw value shown once), rather than the app exposing a registration/login HTTP flow.

What to verify:
- The script inserts a hashed token row into `api_tokens` and prints the raw token exactly once
  — the raw value is never persisted anywhere.
- No new unauthenticated HTTP endpoint is introduced to mint tokens (minting stays a
  DB-adjacent script, keeping the attack surface at "whoever can run scripts against the DB",
  same trust level as running migrations).
