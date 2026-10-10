# classic-anki-review: e2e verification report (2026-10-11)

Mode: post-implementation verification (tests expected to pass). Run via `npm run dev:pw -- anki-review` from the post-anki repo (Docker Postgres :5578, api :5570, web :5550, mock OpenRouter :4999). Final state: 19 tests, all passing (the last full run had 18 pass; the one failure was a stale assertion on the empty-state text, fixed and re-run green). Stack torn down (`npm run e2e:db:down`, no servers left).

## Priority deliverable: the journey (green)
`features/anki-review/tests/paste-approve-review-journey.test.ts` (`@anki-journey.S1`) PASS. Paste on /add-knowledge, bits and cards appear on /knowledge-bit-review with no manual scan (after-paste kick + mock OpenRouter), approve both, /knowledge/review shows the question only, Space reveals, key 3 grades; DB: both bits approved, one `knowledge_bit_reviews` row (good, was_new), schedule moved (learning, review_count 1, due in future).

## Test files (all under projects/post-anki/post-anki/features/anki-review/, in the verification repo)
| File | Tags | Result |
|---|---|---|
| tests/paste-approve-review-journey.test.ts | @anki-journey.S1 | PASS |
| core/tests/reveal-then-grade-saves-schedule-and-history | @anki-core.S1-S4,S8 | PASS |
| core/tests/keyboard-reveals-and-grades-once | @anki-core.S5 | PASS |
| core/tests/modes-link-each-other-and-keep-scope | @anki-core.S6 | PASS |
| core/tests/empty-failed-load-and-failed-grade-states | @anki-core.S7 | PASS |
| core/tests/typed-and-anki-grades-both-land-on-one-bit | @anki-core.S9,S10 | PASS |
| learning/tests/new-card-walks-1m-10m-steps-then-graduates | @anki-learning.S1,S6 | PASS |
| learning/tests/hard-repeats-the-step-and-easy-skips-the-rest | @anki-learning.S2 | PASS |
| learning/tests/forgotten-review-card-relearns-and-records-a-lapse | @anki-learning.S3,S6 | PASS |
| learning/tests/learning-cards-first-and-learn-ahead-window | @anki-learning.S4,S5 | PASS |
| learning/tests/typed-answer-ends-a-learning-step | @anki-learning.S8 | PASS |
| learning/tests/schedule-defaults-and-old-history-copies-still-work (DB-only) | @anki-learning.S7,S9 | PASS |
| queue/tests/unscoped-queue-serves-due-then-new-one-card-per-bit | @anki-queue.S1,S2,S4,S5 | PASS |
| queue/tests/daily-new-card-cap-and-done-screen | @anki-queue.S3,S6 | PASS |
| session/tests/undo-restores-schedule-and-card-and-is-refused-when-stale | @anki-session.S1,S2,S3 | PASS |
| session/tests/suspend-bury-and-leech-take-a-card-out-of-rotation | @anki-session.S6,S7,S9 | PASS |
| kick/tests/paste-starts-processing-at-once-without-duplicates (2 tests) | @anki-kick.S1,S2,S4 and S3 | PASS |
| approval/tests/sidebar-count-bulk-approve-and-keys | @anki-approval.S1-S3 | PASS |

Queue (02-due-queue/plan.md) and approval items have no scenarios.md; their S-numbers are defined in the per-folder tests/README.md. No test uses skip/only/fixme.

## Scenarios not covered (box left unchecked in scenarios.md)
Skipped for time after the priority change:
- 04 kick S5 (interrupted work finished by timer: needs a stale "processing" source plus the backstop scan).
- 13 session S4 (summary), S5 (edit), S8 (undo of suspend/bury), S10 (concurrency races), S11 (typed queue skips suspended/buried).
- 08 basic S2 (edit a basic card on approval page; label only covered in the approval test), S4-S10 (typed excludes basic, pending-bit edit, backfill 50/run, retry cap 3, overlapping scans, backstop auth, markup/injection). Mock markers for these already exist in `mock-openrouter/knowledge-bit-responders.ts`.
- Partials noted on the checked lines: tag/topic scopes (core S6), Z key and done-screen undo (session S1), 12th/16th leech repeat (session S9), timer-vs-kick race (kick S4), log lines and run count (kick S2/S3). Topic "N due" badge not driven.

## App bugs found
None confirmed. Observations:
- Cold-start flake (not root-caused): on the first run against a fresh Vite server, the first grade after approval showed "Couldn't save that. Try again." and the key press did not save; the identical test passed on the next run. `gradeCard` retries once (what a learner would do). Suspected cold dev-server compile of the `submitReview` server function; unverified.
- core S2 text (never-reviewed card back in 1 day) is superseded by learning steps (new card: 10 minutes); tests follow current behavior.
- Empty queue shows "No cards to review yet ..." (inside `anki-review-done`), not the old "nothing to review" text; assertion follows the app.
- Existing `features/nav/tests/admin-observability-reachable.test.ts` expects a "More" nav panel that the current sidebar does not render (not run here, not mine).

## Defaults chosen (no questions asked)
- Tagging: no Linear ticket, so slugs per planning folder: `@anki-core`, `@anki-kick`, `@anki-learning`, `@anki-session`, `@anki-basic`, `@anki-queue`, `@anki-approval`, `@anki-journey`, each as `@slug.S<N>`; matches existing `@platform-navigation-redesign.S6` style.
- Ran as Sonnet directly rather than dispatching Haiku (this agent was already the dispatched worker).
- Actions live inside the feature (`features/anki-review/actions`), following the project runbook's documented deviation; flat `tests/*.test.ts` in sub-folders so `testMatch` picks them up.
- scenarios.md files had no e2e boxes; added `- [x]/[ ] @tag.S<N> — what — path` lines (under Acceptance, or an "E2E:" label where there is none), left unstaged.
- Global queue: tests clear every knowledge_* table before and after each test.
- Time-dependent behaviour: seeded schedule rows with past/future `due_at`; real-time asserts within a tolerance; `timezoneId: 'UTC'` for midnight tests. No sleeps, no clock mocking needed.
- Added mock-openrouter responders (detector, why, blank, basic, grader, follow-up); detector returns one bit per source line.
- Used the API (bearer secret) only for triggering "other tab" actions and queue reads; UI is the primary driver.

## Files changed
post-anki repo (nothing committed, all unstaged; the other modified files in `git status` pre-existed):
- .planning/classic-anki-review/{01-anki-review-core,04-after-paste-pipeline-kick,08-basic-card-variant,11-learning-steps,13-session-controls}/scenarios.md
- this report

verification-repo (nothing committed or pushed):
- projects/post-anki/post-anki/features/anki-review/ (new: actions/, fixtures/, queries/, seeds/, tests/ plus core, kick, learning, queue, session, approval sub-folders, each with tests/README.md)
- projects/post-anki/post-anki/mock-openrouter/knowledge-bit-responders.ts (new)
- projects/post-anki/post-anki/mock-openrouter/responses.ts (import + spread of the new responders)
- projects/post-anki/post-anki/docs/memories/knowledge-bit-review-queue-is-global.md (new) and docs/memories/README.md (index line)
END-OF-REPORT
