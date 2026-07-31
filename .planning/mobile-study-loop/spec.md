---
type: spec
branch: mobile-study-loop
task: "Complete the core study/review loop on mobile (issue #66)"
complexity: complex
state: confirmed
updated: 2026-07-31
---
# Spec: Complete the core study/review loop on mobile (issue #66)

## What to do

The mobile app (`apps/mobile`) today only implements the architecture-mentor half of the study
loop (`GET /daily-push` → `POST /topics/:id/probe/answer`, already built and working). Issue #66's
Done-when bar requires a real, graded interaction for a `language-practice` subject too — and that
pedagogy kind is structurally invisible to `/daily-push` (it reads `curricula`→`topics`→`gaps`;
`phrase_bank_entries` hangs off a bare `subjectId` with no topic/curriculum — confirmed by reading
`apps/api/src/push/push.repo.ts` and `apps/api/src/db/schema.ts`). On web, language-practice is a
completely separate route and subsystem (`apps/web/src/routes/practice.$subjectId.tsx`,
`apps/web/src/practice/*`, ~1450 lines). This plan adds the missing mobile-native equivalent of
that subsystem, deliberately trimmed to the Done-when minimum (see Decision 3), plus one real bug
fix (Decision 1) discovered while proving the verification approach.

Backend: no changes. Every endpoint mobile needs already exists, already returns exactly the
shape needed, and is already covered by the same global PAT auth check (confirmed by reading
`apps/api/src/server.ts`'s `authorized()` — it runs before route dispatch, not per-route).

## Files to touch

```
apps/mobile/
  src/
    api/
      token-storage.ts        [edit] add Platform.OS === "web" branch — reads/writes/clears
                               window.localStorage instead of expo-secure-store on web only.
                               Native iOS/Android path is byte-for-byte unchanged. Fixes a real
                               crash: on web, ExpoSecureStore's platform module is an intentional
                               empty stub (`export default {}`), so unconditional
                               SecureStore.getItemAsync throws inside _layout.tsx's unguarded
                               getStoredToken().then(...), permanently stalling the app on its
                               loading spinner. Verified via a real Playwright run this session —
                               see spec.md Decision 1.
    subject/
      subject-list.api.ts     [new] getSubjects(): Promise<Subject[]> — GET /subjects via the
                               existing apiFetch wrapper. No new auth/error handling — reuses
                               apiFetch's existing 401 redirect.
    practice/
      practice.api.ts         [new] generatePhraseBatch(subjectId), submitAttempt(subjectId,
                               phraseId, userAnswer), getPhraseBankDueCount(subjectId) — thin
                               wrappers over apiFetch, mirroring answer-submit.ts's shape exactly.
                               submitAttempt always sends a one-element answers array (Decision 3
                               — no chunking). getPhraseBankDueCount reads GET
                               /subjects/:id/phrase-bank and counts entries with
                               status "struggling" or "practicing" (SCENARIO 3's due-count).
      phrase-view.tsx         [new] renders one Phrase (prompt, domain tag, recycled badge,
                               answer TextInput, submit button — disabled while a submission is
                               in flight, mirroring question-view.tsx's `submitting` prop, see
                               Decision 6) and, once graded, the PracticeAttempt result
                               (score/verdict/feedback/alternatives) — mirrors question-view.tsx's
                               structure and style closely enough that a future contributor
                               recognizes the pattern immediately. Counter reads phrases.length,
                               never a hardcoded batch size (Decision 7).
  app/
    index.tsx                 [edit] add one Text link at the bottom, "Practice a language
                               subject →", navigating to /practice — mirrors the existing
                               RetryLink pattern already in this file. No other change.
    practice/
      index.tsx                [new] subject list screen — GET /subjects, filter
                               kind === "language-practice", fan out GET .../phrase-bank per
                               subject (Promise.all — small, bounded set) for the due-count, render
                               as tappable rows, empty state if none. Navigates to
                               /practice/[subjectId] on tap.
      [subjectId].tsx           [new] practice screen for one subject — generate a batch on
                               mount, hold the phrase queue + current index in local state, render
                               via PhraseView, advance index after each graded result, show a
                               "Batch complete → Practice again" state when the queue is
                               exhausted, a retry-able error state if generation fails
                               (SCENARIO 7), and a separate retry-able error state (typed answer
                               preserved) if a submission fails for a reason other than 401
                               (SCENARIO 5b).
```

## Derivers

No new pure-computation deriver layer for this item. The only candidate logic — filtering
`GET /subjects` results to `kind === "language-practice"`, and advancing a phrase-queue index —
is a one-line `.filter()` and an `index + 1`, inline in the screen component. This matches the
existing precedent in this exact codebase: `question-view.tsx`'s own kind-branching
(`quick_test` vs Socratic) is inline in the component, not extracted, and `apps/mobile` has no
test runner configured at all (confirmed: no vitest/jest, no test script in `package.json`).
Standing up a test runner for two trivial one-liners would be disproportionate to what they do;
correctness here is instead proven by the Playwright render-and-interact proof (SCENARIO 8), which
exercises the real behavior end to end rather than a unit-isolated fragment of it.

## Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 | None (existing, unchanged) | None (existing, unchanged — proven not to regress) | None |
| SCENARIO 2 | None | None (existing, unchanged) | None |
| SCENARIO 3 | None | `apps/mobile/src/subject/subject-list.api.ts`, `apps/mobile/src/practice/practice.api.ts` (due-count), `apps/mobile/app/practice/index.tsx` | None |
| SCENARIO 4 | None | `apps/mobile/src/practice/practice.api.ts`, `apps/mobile/src/practice/phrase-view.tsx`, `apps/mobile/app/practice/[subjectId].tsx` | None |
| SCENARIO 5 | None | `apps/mobile/src/practice/practice.api.ts`, `apps/mobile/src/practice/phrase-view.tsx`, `apps/mobile/app/practice/[subjectId].tsx` | None |
| SCENARIO 5b | None | `apps/mobile/app/practice/[subjectId].tsx` | None |
| SCENARIO 6 | None | None (reuses existing `apps/mobile/src/api/client.ts` 401 handling unchanged) | None |
| SCENARIO 7 | None | `apps/mobile/app/practice/[subjectId].tsx` | None |
| SCENARIO 8 | None | `apps/mobile/src/api/token-storage.ts` (Decision 1 fix required for this to render at all); the standalone Playwright script itself (new, lives outside `apps/mobile`, e.g. this session's scratchpad or a `scripts/` location decided at implementation time — not a source file to ship) | None |

## Files to create

```
apps/mobile/src/subject/subject-list.api.ts
apps/mobile/src/practice/practice.api.ts
apps/mobile/src/practice/phrase-view.tsx
apps/mobile/app/practice/index.tsx
apps/mobile/app/practice/[subjectId].tsx
```

## Files to modify

```
apps/mobile/src/api/token-storage.ts   — add web-platform localStorage fallback (Decision 1);
                                          native SecureStore path must not change behavior
apps/mobile/app/index.tsx              — add one navigation link to /practice; nothing else changes
```

## Data model changes

Not applicable — no backend or schema changes.

## Documentation changes

`docs/architecture/mobile-study-review-app.md` already exists and describes `apps/mobile`'s
current architecture (reused per the constitution's component-doc-reuse rule, not duplicated).
Update it in place, merged into its existing narrative:
- "What's out of scope" currently lists "no curriculum browsing" etc. — add that language-practice
  subjects are now in scope via a dedicated Practice flow, separate from the daily-push loop.
- Add a short section (or extend the existing Flow diagram) explaining that mobile now has two
  independent entry points into the same backend — `GET /daily-push` for architecture-mentor
  (system auto-selects) and `GET /subjects` → `POST .../phrase-batches` for language-practice
  (user picks a subject) — because the backend itself has no unified "what's due" concept across
  pedagogy kinds yet (that unification is issue #58, explicitly out of scope here).
- Note the web-platform token storage fallback: `expo-secure-store` has no real implementation on
  the web target (confirmed: its web module is an empty stub), so `token-storage.ts` now branches
  on `Platform.OS === "web"` to use `window.localStorage` there — native iOS/Android storage is
  unaffected. This exists to make the app testable via `expo start --web` + Playwright (this
  project has no simulator/device — see issue #65); it is not a production security boundary
  change, since the app is never shipped to a browser as its primary target.

## Decisions made autonomously

This item was planned unattended — no interactive review — per this session's explicit
authorization. Every judgment call below used the safest, most reversible, most
evidence-grounded default; documented here so none of it needs relitigating.

### 1. Fix `token-storage.ts`'s web crash as part of this plan, not defer it — RESOLVED: fix it

Discovered by actually running the verification approach (not inferred): on `expo start --web`,
`ExpoSecureStore`'s web module (`node_modules/expo-secure-store/src/ExpoSecureStore.web.ts`) is an
intentional empty stub (`export default {}`). `token-storage.ts`'s unconditional
`SecureStore.getItemAsync(...)` call therefore throws inside `_layout.tsx`'s unguarded
`getStoredToken().then(...)`, permanently stalling the app on its loading spinner — confirmed via
a real Playwright run (`pageerror`: `ExpoSecureStore.default.getValueWithKeyAsync is not a
function`, empty `document.body.innerText`).

Without this fix, this plan's own DoD mechanism (react-native-web + Playwright) cannot render
anything — Decision made: fix it as part of this plan's scope, since the verification approach
this task was explicitly asked to prove out is not "real" without it. The fix is a
`Platform.OS === "web"` branch reading/writing `window.localStorage` instead — mirrors the
`Platform.OS === "ios"` pattern already used in `apps/mobile/app/connect.tsx`, so it follows an
established local convention rather than inventing one. Native iOS/Android behavior (the actual
subject of issue #67, "secure token storage on mobile") is untouched — confirmed by reading the
diff: the native branch still calls `SecureStore.*` exactly as before.

### 2. Do not touch `/daily-push`'s selection logic to unify pedagogy kinds — RESOLVED: leave it alone

Tempting shortcut: extend `gatherPushCandidates`/`selectDailyPush` to also surface a due
phrase-bank entry, so mobile's existing single Today screen "just works" for both kinds. Rejected:
`.planning/wishlist.md` already tracks this exact idea as its own item — "One daily touchpoint
instead of three separate practice surfaces" (issue #58) — explicitly flagged there as needing its
own product/architecture planning (how "due" is compared across a spaced-repetition phrase queue
vs. an open-ended probe question, how much to surface before it becomes noise). Building a
narrower, mobile-only version of that unification here would preempt that planning with a decision
made under a different task's scope, and would leave web/Telegram still split three ways while
mobile alone was unified — a worse, inconsistent state, not a better one. Two independent entry
points (Today / Practice) is the correct scope for this item; #58 unifies them later, once, across
every client.

### 3. Language-practice mobile UX: one phrase at a time, no level/pack picker — RESOLVED: match the architecture-mentor screen's rhythm, not the desktop chunk grid

Desktop's `batch-practice.tsx` shows phrases in chunks of 5 or 10 with a size picker, a
prefetch-next-batch background load, and a separate level/pack settings panel synced via
`use-practice-settings.ts`. None of that is required by issue #66's Done-when bar ("answer a real
probe or quiz question, and see a real graded result") — it asks for one real interaction, not
feature parity with the desktop chunk UI. Decision: mobile renders phrases one at a time (same
rhythm as the existing architecture-mentor Today screen — one question, one answer, one result),
skips the level/pack picker entirely (confirmed safe by reading
`apps/api/src/practice/practice.controller.ts`'s `handleCreatePhraseBatch`: it calls
`getOrCreatePracticeSettings` itself and generates against whatever settings already exist —
mobile does not need to pre-fetch or manage settings at all for the Done-when bar), and skips the
phrase-bank archive panel (active/mastered list) — an enhancement beyond what's asked, not part of
"answer a question, see a graded result." This is a smaller, easily-extended surface, and it keeps
the two pedagogy kinds visually consistent on a phone screen rather than importing a
desktop-density grid.

One consequence, accepted explicitly rather than left implicit: the phrase queue lives in
`[subjectId].tsx`'s local component state, so navigating away mid-batch and back discards the
in-progress batch and generates a fresh one on return. No resume-in-progress-batch flow exists or
is planned — acceptable for a Done-when bar of "answer a question, see a result," not something a
future contributor should read as an oversight to "fix" into a persisted-batch resume flow.

### 4. New mobile routes as `app/practice/index.tsx` + `app/practice/[subjectId].tsx` — RESOLVED: follow Expo Router file-based convention already in use

`apps/mobile/app/` already uses Expo Router's flat file-based routing (`index.tsx`, `connect.tsx`)
with `<Stack screenOptions={{ headerShown: false }} />` in `_layout.tsx` (no tab navigator, no
custom header chrome). A nested `practice/` folder with an `index.tsx` and a dynamic
`[subjectId].tsx` is the direct, idiomatic extension of that same convention — no new navigation
library, no new dependency.

### 5. One-answer-per-submission means more, smaller grading calls — accepted, not a blocker

Self-grilled: submitting one phrase at a time (Decision 3) means one `POST .../attempts` call —
and therefore one LLM grading call via `buildGradeBatchPrompt` — per phrase, instead of desktop's
one call per chunk of 5–10. Checked `grade-attempts.orchestrator.ts`: grading is stateless per
call (each item graded independently, in the order given) and phrase-bank mastery correctness
(`applyAttemptToPhraseBankEntry`, the sequence-numbered isAdjacent logic) depends on each phrase's
own creation/attempt sequence, not on how many answers arrive together in one HTTP request — so
this is behaviorally safe, not just convenient. The real cost is more round-trips and more
independent LLM calls for the same total content (token volume per phrase is roughly the same
either way; batching mainly saves call/prompt overhead, not token count). Accepted as the right
trade for this item: this is a single-user personal app, sessions are short (one due question or
one practice pass), and Decision 3 already prioritizes mobile-UX simplicity over desktop parity —
chunked batching stays an available future enhancement if usage patterns ever justify optimizing
for it, not something to build speculatively now.

### 6. Grill-plan finding: "see what's due" was not actually satisfied for language-practice — RESOLVED: added a due-count to the subject list, not a full push unification

A fresh red-team pass (`/grill-plan-ie`, run this session) found that issue #66's Done-when text
literally reads "see what's due... for both an architecture-mentor and a language-practice
subject" — and the original draft of this plan satisfied "see what's due" only for
architecture-mentor (via `/daily-push`), leaving language-practice as manual-navigate-and-generate
with no due signal at all. That's a real, checkable gap against the issue's own wording, not
implementation trivia. Resolved by adding a per-subject due-count to SCENARIO 3 (count of
`struggling`/`practicing` phrase-bank entries via the already-existing `GET
/subjects/:id/phrase-bank`) — this makes "see what's due" literally true for both pedagogy kinds,
without reopening Decision 2 (still not touching `/daily-push`'s cross-kind selection, still
deferred to issue #58) and without reopening Decision 3 (still no full phrase-bank archive panel
— a due-count is not the same as rendering the archive list).

### 7. Grill-plan finding: hardcoded "Phrase 1 of 10" would be factually wrong — RESOLVED: read phrases.length

The original draft's SCENARIO 4 said "a 'Phrase 1 of 10' counter," implicitly hardcoding desktop's
`BATCH_SIZE = 10` constant. Checked `apps/api/src/practice/practice-batch.schemas.ts`: the
generation response schema only enforces `.min(1)` on the phrases array, not an exact count — a
hardcoded "10" would misrender the instant a real generation call returns fewer (or more) phrases.
Fixed in scenarios.md: the counter must read the real `phrases.length` from the response.

### 8. Grill-plan finding: two real submission-failure gaps — RESOLVED: added SCENARIO 5b, added an explicit disabled-while-submitting requirement

Two related gaps found: (a) SCENARIO 5 covered a successful submission and SCENARIO 6 covered a
401, but nothing covered a non-401 submission failure mid-batch (500, dropped connection) — added
as SCENARIO 5b, mirroring the existing `submitError`/retry pattern already on
`apps/mobile/app/index.tsx`. (b) nothing required disabling the submit control while a request is
in flight — a real correctness risk, not cosmetic: the concurrency-fix locking
(`phrase-bank-concurrency-fix`) protects against two *concurrent* requests racing, but a double-tap
firing two *sequential* graded submissions for the same answer would still double-count
`correctCountInCycle`/mastery progress, since each call is individually valid and individually
locked. Added as an explicit "what to verify" line under SCENARIO 5, mirroring
`question-view.tsx`'s existing `submitting`-prop disable pattern (no new pattern invented).

### 9. Grill-plan finding: the Playwright proof was never run against the two new POST endpoints — RESOLVED: named explicitly in SCENARIO 8, not silently assumed to generalize

This planning session's real Playwright run proved the mechanism against `GET /daily-push` and
`POST /topics/:id/probe/answer` — the two pre-existing endpoints. It never touched the two
endpoints this plan actually adds calls to (`POST /subjects/:id/phrase-batches`,
`POST /subjects/:id/attempts`) or the new `GET /subjects`/`GET /subjects/:id/phrase-bank` calls.
The underlying mechanism (page.route() mocking, no CORS needed) has no reason to behave
differently for a POST with a JSON body vs. the one already proven, but "no reason to differ" is
not the same as "proven" — SCENARIO 8 now says this explicitly rather than letting the DoD imply
blanket coverage the planning session didn't actually establish. Implementation must write and run
mocks for all four new/changed calls, not assume the pattern transfers untested.

Also fixed: `scenarios.md`'s SCENARIO 7 originally cited `.planning/batch-practice-electric-fallback/`
as the prior fix it mirrors — that path doesn't exist. The real location is
`.bmad/batch-practice-electric-fallback/` (source repo) and
`docs/architecture/batch-practice-electric-fallback/review.md`, confirmed via `git log` (commit
`55aabd7`) and `.planning/wishlist.md`/`.planning/LOG.md`. Corrected in scenarios.md.

## Implementation order

1. `apps/mobile/src/api/token-storage.ts` — web-platform fallback fix (Decision 1). This unblocks
   the Playwright verification for everything else, so it goes first.
2. `apps/mobile/src/subject/subject-list.api.ts` + `apps/mobile/src/practice/practice.api.ts`'s
   due-count function + `apps/mobile/app/practice/index.tsx` — SCENARIO 3.
3. `apps/mobile/src/practice/practice.api.ts` (generate/submit) + `apps/mobile/src/practice/phrase-view.tsx`
   + `apps/mobile/app/practice/[subjectId].tsx` — SCENARIO 4, 5, 5b, 7.
4. `apps/mobile/app/index.tsx` — add the navigation link (SCENARIO 3's entry point).
5. `npx tsc --noEmit` in `apps/mobile` — must be clean.
6. Standalone Playwright script (SCENARIO 8) proving SCENARIO 1–7/5b all render and interact
   correctly under `expo start --web` with mocked network responses — including real mocks for
   the two new POST endpoints and the two new GET endpoints, not just the two pre-existing calls
   already proven during planning (Decision 9).
7. Update `docs/architecture/mobile-study-review-app.md` per "Documentation changes" above.

## Scope boundary

Out of scope for this item (all confirmed deliberate, not overlooked):
- Unifying `/daily-push` across pedagogy kinds — issue #58.
- On-device/native verification (real SecureStore, Expo Go, physical gestures/keyboard) — issue
  #65.
- Native token storage's own end-to-end correctness audit (restart survival, revoked-token UX
  polish) — issue #67.
- Level/pack selection UI, chunked answering, next-batch prefetching, and the phrase-bank
  active/mastered archive panel for language-practice on mobile — all real desktop features, all
  beyond this issue's Done-when bar (Decision 3).
- "Check my writing" freeform scoring on mobile — a separate, already-shipped-on-web feature never
  named in issue #66.
- CORS support on `apps/api` for a real browser target — not needed; mobile's real targets are
  iOS/Android native builds, and the web target exists only for this plan's own Playwright
  verification (mocked network), not as a shipped surface.

### Definition of Done — per layer

**Backend: N/A, confirmed (not assumed).** Read `apps/api/src/server.ts`: the PAT auth check
(`authorized()`) runs as global middleware before route dispatch, not scoped to specific routes —
so it already covers every endpoint this plan calls (`/subjects`, `/subjects/:id/phrase-batches`,
`/subjects/:id/attempts`), the same way it covers `/daily-push` and `/topics/:id/probe/answer`
today. No migration, no new endpoint, no auth change. This was verified by reading the actual
middleware code this planning session, not inferred from the epic's earlier claim.

**Mobile/frontend — the real, already-proven verification mechanism:**

A standalone Playwright script — written directly against the `playwright` npm package (already
present at the repo root, confirmed `npx playwright --version` → 1.60.0), run via plain `node`
(the exact mechanism used and proven during this planning session — a `chromium.launch()` +
`page.goto()`/`page.route()` script executed with `node <file>.cjs`, not `npx playwright test`;
picking one mechanism now rather than leaving both options open, since they have different
harness/assertion behavior and this plan should not leave that choice to whoever implements it),
**never** any `mcp__chrome-devtools__*` tool, and **not** part of `verification-repo` (that
framework is web-app-only and has no entry for `apps/mobile`) — driving `npx expo start --web`
(react-native-web, already a dependency; the `"web": "expo start --web"` script already exists in
`apps/mobile/package.json`).

This was not a hypothetical during planning — it was actually run, twice, this session:
1. First run, before the Decision 1 fix: the app hung on a blank loading spinner; Playwright's
   `pageerror` listener captured a real, specific crash (`ExpoSecureStore.default.getValueWithKeyAsync
   is not a function`), which is what led to Decision 1.
2. Second run, after applying the fix locally to test it (then reverted, since planning doesn't
   touch source — the fix is scheduled as this plan's first implementation step instead): the
   Connect screen rendered its real text and inputs with zero page errors; then, with a token
   seeded into `localStorage` and `page.route()` mocking `/daily-push` and
   `/topics/:id/probe/answer` with realistic fixture payloads, the Today screen rendered a real
   question with full gap context, accepted textarea input, and rendered a real graded-result
   message after submit — the full architecture-mentor loop, observed rendering and interacting
   correctly, with zero uncaught errors.

`page.route()` mocking is required, not a convenience shortcut: `apps/api/src/server.ts` sends no
CORS headers on any response, so a live cross-origin `fetch` from a react-native-web page running
on a Metro dev server port would be blocked by the browser's own preflight check before ever
reaching the mocked-vs-real question — mocking every API call sidesteps that entirely and also
keeps the proof fast and deterministic (no real LLM-backed agent calls in the loop).

**What this plan proves itself, in this environment:** all of SCENARIO 1–8 above, driven through
the same Playwright-against-`expo start --web` mechanism, plus `npx tsc --noEmit` clean in
`apps/mobile` — i.e., every screen renders, every interaction (text input, button tap, navigation
between Today/Practice/subject/phrase) works, and both pedagogy kinds produce a real graded result
on screen, all via mocked network responses.

**What remains explicitly deferred to issue #65 (on-device human verification), not proven here:**
real `expo-secure-store` behavior on iOS/Android (the web fallback in Decision 1 only covers the
web target used for this proof, not the native storage path), real native gesture/keyboard/scroll
behavior, real Expo Go QR-pairing and app-restart persistence, real network conditions on a
physical device (cellular/flaky wifi), and anything react-native-web is known to render
differently from true native RN (safe-area insets, native modals, platform-specific styling
quirks) that this plan's mocked-network browser proof cannot surface. This plan's Playwright proof
is real evidence the code and interaction logic work — it is not a substitute for the on-device
check issue #65 already owns.
