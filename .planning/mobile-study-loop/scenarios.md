---
type: scenarios
branch: mobile-study-loop
task: "Complete the core study/review loop on mobile (issue #66)"
state: confirmed
updated: 2026-07-31
---
# Scenarios: Complete the core study/review loop on mobile

## Business Scenarios

SCENARIO 1: Learner reviews a due architecture-mentor topic (regression proof, not new)

The learner opens the app with a paired token and lands on Today. A gap is due, so a real
probe/quiz question renders with its curriculum/topic context. The learner answers and sees a
real graded result (pass/fail feedback).

What to verify:
- `GET /daily-push` → question renders via the existing `QuestionView` (`quick_test` and
  `socratic` kinds both covered — already handled, confirm unchanged).
- `POST /topics/:id/probe/answer` result renders via the existing feedback block.
- Nothing in this plan changes `apps/mobile/app/index.tsx`'s existing request/response handling —
  this scenario exists to prove the loop still works after the new screens are added, not to
  change it.

SCENARIO 2: Nothing due for architecture-mentor right now

`push.push` is `null`. The learner sees "Nothing to review yet — check back later," not a blank
screen or an error.

What to verify:
- The existing `!loading && !loadError && push && !push.push` branch in `apps/mobile/app/index.tsx`
  renders the muted "Nothing to review yet" text, not a blank screen — already implemented,
  confirm this plan's other changes don't disturb it.

SCENARIO 3: Learner opens Practice and sees which language-practice subjects exist, and what's due

From Today, the learner taps a "Practice a language subject" link and sees a list of subjects
where `kind === "language-practice"`. Each row also shows a due-count — the number of that
subject's phrase-bank entries currently `struggling` or `practicing` (i.e. due for recycling),
fetched via the existing `GET /subjects/:id/phrase-bank` (plain REST, no Electric — same pattern
web's Phrase Bank panel already uses). A subject with zero due entries still shows a neutral
"Start a new batch" affordance rather than looking broken. If no language-practice subjects exist
at all, a clear empty state is shown instead of a blank list.

This due-count is what makes "see what's due" (issue #66's Done-when wording) true for
language-practice too, without touching `/daily-push`'s cross-kind selection logic (Decision 2 —
that stays out of scope for #58) and without building the full phrase-bank archive panel
(Decision 3 — still out of scope). It's a per-subject signal, not a unified cross-kind "what's due
today," which is the part #58 still owns.

What to verify:
- `GET /subjects` is fetched once, filtered client-side to `kind === "language-practice"`.
- For each resulting subject, `GET /subjects/:id/phrase-bank` is fetched (small, bounded set of
  subjects in practice — a handful at most — so per-subject `Promise.all` fan-out is appropriate,
  not a bulk-endpoint case).
- Empty subject list → an explicit "No language-practice subjects yet" message, not a blank
  screen. Empty due-count for a subject that exists → "Start a new batch," not a blank/zero with
  no explanation.
- Each row is tappable and carries the subject's id and name.

SCENARIO 4: Learner opens a language-practice subject and a phrase to translate appears

Tapping a subject calls `POST /subjects/:id/phrase-batches` (no separate practice-settings
pre-fetch needed — the endpoint upserts default settings internally, confirmed by reading
`apps/api/src/practice/practice.controller.ts`'s `handleCreatePhraseBatch`). The first phrase of
the batch renders: the Russian prompt, its domain tag, a "Recycled" badge when
`targetPhraseBankEntryId` is set, and an empty answer field. A "Phrase 1 of N" counter is visible,
where N is the actual returned batch length (`phrases.length`) — **not** a hardcoded constant.
`apps/api/src/practice/practice-batch.schemas.ts` only enforces `.min(1)` on the generated array,
not an exact size, so a hardcoded "10" would misrender the moment a real generation call returns
a different count.

What to verify:
- Batch generation happens once per subject visit, not once per phrase.
- The phrase counter reads `phrases.length` from the real response, never a hardcoded constant.
- The phrase queue advances one at a time (mirrors the architecture-mentor screen's one
  question → one answer → one result rhythm, not the desktop chunk-of-5 grid — see spec.md
  Decision 3).
- Recycled badge only shows when `targetPhraseBankEntryId` is non-null.

SCENARIO 5: Learner submits a translation and sees a graded result

The learner types an English translation and submits. `POST /subjects/:id/attempts` is called
with exactly one answer. The response renders score, verdict, feedback, and native alternatives
(if any) — mirroring the graded-result treatment already used on the architecture-mentor screen.
A mastered-phrase moment (`phraseBankUpdates` containing a `status: "mastered"` entry for this
phrase) shows a distinct "Mastered — moved to the phrase bank archive" note. Submitting the last
phrase in the batch shows a "Batch complete" state with a way to start a new batch.

What to verify:
- Exactly one `{ phraseId, userAnswer }` pair per submission (no chunking).
- Score/verdict/feedback/nativeAlternatives all render from the real `PracticeAttempt` shape.
- Mastered note only appears when a `PhraseBankUpdate` for this phrase's
  `targetPhraseBankEntryId` has `status === "mastered"`.
- "Next phrase" only advances after a result has rendered — can't skip un-answered.
- The submit control is disabled for the duration of the request (mirrors `question-view.tsx`'s
  existing `submitting` prop pattern). This isn't cosmetic: nothing server-side stops two
  sequential submissions for the same phrase from both being scored and both mutating
  `correctCountInCycle`/mastery state — the concurrency-fix locking added in
  `phrase-bank-concurrency-fix` protects against two *concurrent* requests racing each other, not
  against a double-tap firing two *sequential* graded submissions for the same answer.

SCENARIO 5b: Submitting an answer fails (not a 401)

`POST /subjects/:id/attempts` returns a non-2xx for a reason other than an expired token (500,
dropped connection) partway through a batch, e.g. on phrase 4 of a batch. The learner's typed
answer is not lost, and a retry action is shown — mirroring the existing pattern already on the
architecture-mentor Today screen (`apps/mobile/app/index.tsx`'s `submitError` state and "Try
submitting again" link). Without this, a mid-batch failure would look identical to SCENARIO 7's
generation failure but has no scenario covering it today.

What to verify:
- A failed submission (non-401) sets a visible, retry-able error state, distinct from the 401
  redirect path.
- The typed answer text is preserved across a failed submit attempt — retry does not require
  retyping.

SCENARIO 6: An expired/revoked token interrupts either flow

Mid-session, any API call (`/daily-push`, `/subjects`, `/phrase-batches`, `/attempts`) returns
401. The learner is redirected to Connect and the stored token is cleared — identical behavior on
both the architecture-mentor and the new language-practice screens.

What to verify:
- The new practice API calls go through the same `apiFetch` wrapper in `apps/mobile/src/api/client.ts`
  that already handles 401 → clear token → redirect (no new 401 handling logic needed or written).

SCENARIO 7: Phrase batch generation fails

`POST /subjects/:id/phrase-batches` returns a non-2xx (agent/LLM failure, network drop). The
learner sees a clear, retry-able error message — not an infinite "Generating…" spinner. This
mirrors the exact failure mode already fixed on web (`.bmad/batch-practice-electric-fallback/`,
`docs/architecture/batch-practice-electric-fallback/review.md`, merged to main 2026-07-28 per
`.planning/wishlist.md` and `.planning/LOG.md` — a batch-generation hang with no error and no
retry) — the mobile screen must not reintroduce it.

What to verify:
- A caught request failure sets a visible error state with a retry action.
- No unbounded spinner state exists — every loading state has a paired error/timeout path.

## Technical/Architectural Scenarios

SCENARIO 8: The full mobile loop is provable without a device or simulator

`npx expo start --web` renders the app in a real browser via `react-native-web`. A standalone
Playwright script (plain `playwright` npm package, run via plain `node` — the exact mechanism
proven during this planning session, not `npx playwright test`; see spec.md's DoD section for why
one mechanism was picked rather than left open — and not verification-repo, not
`mcp__chrome-devtools__*`) drives it with `page.route()` mocks for every
API call (no live backend reachable anyway — `apps/api/src/server.ts` sends no CORS headers, so a
live cross-origin browser fetch would be blocked by the browser's own preflight check regardless
of mocking). This is the actual, already-proven verification mechanism for this plan (see spec.md
DoD) — confirmed working this planning session for the Connect screen and the architecture-mentor
Today/probe/answer cycle.

What to verify:
- Connect screen renders and accepts a token (requires the `token-storage.ts` web-platform guard
  — see Decision 1).
- Today screen renders a real question and a real graded result after submit (already proven
  during planning for `GET /daily-push` and `POST /topics/:id/probe/answer`).
- Practice subject list renders with due-counts (`GET /subjects`, `GET /subjects/:id/phrase-bank`
  — both newly mocked, never exercised during planning), tapping a subject calls the newly-added
  `POST /subjects/:id/phrase-batches` and renders a generated phrase, and submitting calls the
  newly-added `POST /subjects/:id/attempts` and renders a graded result. These two POST endpoints
  and the phrase-bank GET are new to this plan — planning only proved the mechanism works for one
  GET and one POST on the pre-existing screens; implementation must actually write and run mocks
  for all four new/changed calls before this scenario counts as proven, not assume the mechanism
  generalizes untested.
- Zero uncaught `pageerror` events across all four flows (Connect, Today, Practice list, Practice
  screen).
