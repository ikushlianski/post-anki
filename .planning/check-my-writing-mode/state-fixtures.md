---
type: state-fixtures
branch: check-my-writing-mode
task: check-my-writing-mode
state: confirmed
target-project: post-anki
target-feature: features/practice
local-db-inspected-at: 2026-07-28T00:00:00Z (inspected via schema reading, not a live query — see
  note below)
existing-state-mocks-snapshot: [none directly applicable — features/practice has no
  fixtures/state-mocks/ folder; state comes from front-door UI actions, e2e Postgres reset per run]
proposed-new-state-mocks: [none — no new state-mock TS file needed; the only new fixtures are 2
  mock-openrouter response entries, listed below]
updated: 2026-07-28
---

# State fixtures — Port "check my writing" to the English subject

The exact initial state every scenario in `scenarios.md` requires before its first Playwright
action runs.

## Source inventory

**Existing state mocks reused:** none — `features/practice` doesn't use a `fixtures/state-mocks/`
pattern; every existing practice scenario (`first-batch-generates-automatically`,
`submitted-answers-return-graded-results`, etc.) creates its subject as a front-door action at test
start, not via a seeded state mock. This ticket's scenarios follow the same convention.

**Proposed new mock-data entries** (to be written by `/implement-playwright`, under
`features/practice/fixtures/mock-data/`):
- `grade-freeform-slack-message` — `MOCK_WRITING_CHECK_SLACK_MESSAGE = { score: 9, verdict: 'Ok',
  feedback: "Sounds like a real coworker message, nice and casual.", nativeAlternatives: ["Hey,
  could you take a look at this PR when you get a sec?"] }` — graded result for a realistic casual
  Slack message ("hey can u take a look at this PR when u get a sec").
- `grade-freeform-stiff-email` — `MOCK_WRITING_CHECK_STIFF_EMAIL = { score: 5, verdict:
  'NeedsReview', feedback: "Grammatically fine but reads like a formal memo, not an email to a
  colleague.", nativeAlternatives: ["Just a heads up — the deploy's been pushed to tomorrow
  morning.", "Quick update: we're pushing the deploy to tomorrow morning."] }` — used for a stiffer
  PR-description/email-style input, deliberately a different score/verdict than the Slack fixture so
  S2 can distinguish two history entries by content.

**Local-DB / schema inspection note:** confirmed via reading `apps/api/src/db/schema.ts` directly
(no `writing_checks` table exists yet — this ticket's migration creates it) and
`apps/api/src/practice/practice.repo.ts`'s existing INSERT patterns for `attempts`, which
`writing-check.repo.ts`'s `insertWritingCheck` mirrors. No live e2e Postgres was queried for this
ticket specifically (nothing to sample — the table doesn't exist pre-migration); the migration
itself is what brings the table into existence before any scenario here can pass.

## Per-scenario state contract

### S1 — User checks a piece of writing and gets a score + rewrites

- **State source:** `additive-seed` for the subject (created via the existing `subject` feature's
  front-door action); the `writing_checks` row itself is front-door, not seeded.
- **State mocks applied:** `grade-freeform-slack-message` (proposed-new mock-data entry), selected
  by the mock-openrouter `writing-check` responder matching the submitted text against
  `ctx.userText` — post-anki's mock has no enqueue/response-queue mechanism, unlike the source
  app's BAML `dequeueStub`, so this is a content match, not a FIFO pop.
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` at the suite level (this project's e2e
  Postgres is reset per full run via `e2e/scripts/run.sh`); no per-test reseed within the run, since
  each test's subject and rows are scoped to its own freshly-created subject id.
- **Concrete state required (every entity must exist before the first Playwright action):**

  | Entity / relationship | Key properties | Source |
  |---|---|---|
  | `subjects` row | `kind: 'language-practice'` | front-door — created via the existing `subject` feature's action at test start |
  | `writing_checks` table | schema exists (migration applied) | this ticket's Drizzle migration, applied by the e2e stack's standard migrate-on-boot step |

- **Setup role:** the `subjects` row is **scenery** (a precondition this scenario needs to exist,
  created via an existing action, not the thing under test). The `writing_checks` row this scenario
  creates is **subject** (front door — created by driving the real `checkWriting` UI flow, never
  seeded).
- **Mutations the scenario makes:** creates 1 `subjects` row (scenery setup), then INSERTs exactly
  1 row into `writing_checks`.

---

### S2 — Checked entries persist across reload and appear newest-first

- **State source:** same as S1 — subject created front-door, no DB wipe mid-test.
- **State mocks applied:** `grade-freeform-slack-message` (1st submission), `grade-freeform-stiff-
  email` (2nd submission) — each selected by the same content-match responder as S1 (order plays
  no role in selection; each submission's own text picks its own fixture).
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` at the suite level, as S1.
- **Concrete state required:** same `subjects` row + `writing_checks` table existence as S1 (a
  fresh subject, not shared with S1's).
- **Setup role:** the `subjects` row is **scenery**. Both `writing_checks` rows are **subject**
  (front door — created by two real submissions within the test).
- **Mutations the scenario makes:** creates 1 `subjects` row (scenery), INSERTs exactly 2 rows into
  `writing_checks`; the `page.reload()` itself makes no mutation.

---

### S3 — Empty/whitespace-only text cannot be submitted

- **State source:** same as S1/S2 — subject created front-door; no state mocks (no LLM call ever
  expected to fire).
- **State mocks applied:** none.
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` at the suite level.
- **Concrete state required:** the `subjects` row (scenery) and `writing_checks` table existence,
  for the row-count-unchanged assertion to have something valid to query.
- **Setup role:** the `subjects` row is **scenery**. No `writing_checks` row is created (the
  scenario proves a NEGATIVE). If run in the same suite as S1/S2, the row-count assertion must be
  scoped to this scenario's own subject id (each scenario gets its own fresh subject, so this is
  naturally isolated — not a shared-branch row-count concern the way the source app's S4 flagged).
- **Mutations the scenario makes:** creates 1 `subjects` row (scenery); no `writing_checks`
  mutation (by design).

## State suites

None of this ticket's 3 scenarios share state across test files — each creates its own fresh
`language-practice` subject via the existing `subject` feature's action, so there's no cross-
scenario row-count ambiguity even when run in the same suite pass.

## Forbidden mutations

None beyond the project-wide guard already in place for the e2e stack (local Postgres only,
`localhost:5436`, never Neon/prod) — unchanged by this ticket, applies identically to
`getWritingChecksForSubject` as it does to every other practice-feature query.

## Open questions

None. The migration itself (bringing `writing_checks` into existence) is a preflight action
covered by `spec.md`'s "Implementation order" step 2, not an unresolved design fork.
