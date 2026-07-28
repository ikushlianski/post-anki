---
type: playwright
branch: phrase-bank-concurrency-fix
task: phrase-bank-concurrency-fix
state: confirmed
target-project: post-anki
target-feature: features/practice
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Close the phrase-bank's concurrency and data-integrity gaps

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- None. This fix has no new observable business capability — it prevents a form of silent data
  corruption (overlapping sequence numbers, duplicate phrase-bank entries, lost mastery progress)
  that a user would otherwise experience as "my progress on this phrase seems to have reset" or
  "the same idiom shows up twice" only in the rare case of genuinely concurrent requests (two
  browser tabs open on the same subject/level/pack at once). There is no new UI, no new endpoint,
  no changed response shape.

**UX scenarios**
- U1 — A learner using the app normally, in one tab, sees no change at all: batches still generate,
  answers still submit and get graded. (→ S5)

**Not e2e (verified at unit/integration only)**
- S1 (migration adds real FK + unique indexes) — a schema/constraint claim, proven by attempting
  raw-SQL inserts against a real migrated Postgres instance and asserting they're rejected; no UI
  surface exists to drive this through a browser.
- S2 (concurrent generation never produces duplicate sequence numbers) — a Playwright browser
  context cannot fire two genuinely concurrent, deterministic backend calls against the same
  subject/level/pack the way a direct `Promise.all` of two `generatePhraseBatch(...)` calls (with a
  mocked LLM agent for determinism) can; even two Playwright browser contexts driving the UI would
  only approximate concurrency through network/render timing, not guarantee it, and would have no
  control over what the (real or mocked) LLM returns for each call — making the specific
  duplicate-text race in S3 unreproducible reliably through the UI.
- S3 (concurrent generation never creates a duplicate phrase-bank entry) — same reasoning as S2; additionally requires both concurrent calls' mocked LLM responses to introduce the *identical* new phrase text, which is only controllable by mocking the Mastra agent directly in a vitest test, not through the UI's real (or even mocked-server) LLM call path.
- S4 (concurrent grading never loses a mastery transition) — requires seeding a specific
  phrase-bank-entry state directly (two phrases linked to one entry at chosen non-adjacent sequence
  numbers) and firing two concurrent grading calls with controlled verdicts — not a state reachable
  or drivable through normal UI interaction in a deterministic, repeatable way.

This split follows this plan's explicit task framing: e2e proves the single-user UI is unaffected;
real-DB vitest integration tests calling the repo/orchestrator functions directly are the proof
mechanism for every concurrency claim. See `spec.md`'s Definition of Done for the exact assertion
each integration test makes.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/practice/`
- Target DB: for S5 — the project's standard e2e Postgres (`localhost:5436`, `e2e/docker-compose.yml`,
  guarded by `db/assert-target-allowed.ts`'s local-only allowlist). SCENARIO 1-4's integration tests
  are **not** part of this verification-repo Playwright run at all — they live in the source repo
  (`apps/api/src/db/migrations.integration.test.ts`,
  `apps/api/src/practice/phrase-bank-concurrency.integration.test.ts`) and run via vitest against the
  same `localhost:5436` Postgres container, started/torn down independently of the Playwright e2e
  run (see `state-fixtures.md` for exactly how).
- Dev server URL: `http://localhost:3100` (web) / `http://localhost:8031` (api), per `project.json`.

## Action surface — snapshot

Actions already available in `features/practice/actions/` at planning time (all reused as-is, no
gaps):

- `openPracticePage` — navigates to `/practice/:subjectId`.
- `generatePhraseBatch` — waits out the automatic batch-generation request, asserts
  `phrase-card-0`..`9` render.
- `answerAndSubmitChunk` — fills every visible `phrase-answer-N`, submits, waits for every
  `phrase-result-N` to render.
- `changeLevel`, `changePack`, `continueChunk` — not needed for S5.

## Scenario → action + state + testid map

### S5 — Normal single-user practice loop is unaffected

**Composes actions:** `openPracticePage`, `generatePhraseBatch`, `answerAndSubmitChunk` — all
existing, all reused verbatim.

**Action gaps:** none.

**Pre-test state:** baseline-only. A fresh subject (created via whatever existing seed/creation path
the `subject` feature already uses for practice-feature tests — no new subject-creation action
needed here) with no prior `phrase_bank_entries`/`phrases` rows for its scope, so the test exercises
the ordinary "first-ever batch" path, same as the existing
`first-batch-generates-automatically/test.ts` scenario already does for the pre-existing
batch-practice feature. This scenario adds no new state requirement beyond what that existing test
already sets up — it's a regression check that the migration didn't change that path's behavior,
not a new state shape.

**Required `data-testid` attributes:** none new — `generating-batch-message`, `phrase-card-N`,
`phrase-answer-N`, `submit-chunk-button`, `phrase-result-N` all already exist and are already used
by `generatePhraseBatch`/`answerAndSubmitChunk`.

**Fixture variants:** none new — reuses whatever mock-OpenRouter response shape the existing
`first-batch-generates-automatically` and `submitted-answers-return-graded-results` tests already
use for a plain (no due-entries, no new-target-phrase) batch.

**Vision check candidate:** no — structural (`data-testid` presence/state) assertions are
sufficient; this is a regression check, not a new visual surface.

---

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| (none) | — | — |

No action gaps. S5 composes only existing, already-verified actions.

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S5 | baseline-only | fresh subject, no prior phrase-bank state — mirrors the existing first-batch e2e scenario's setup |
| S1-S4 | N/A — not Playwright scenarios | see `state-fixtures.md` for the vitest-integration-test state setup (fresh random subject/level/pack scope per test case, no shared fixtures needed) |

## Open questions

None carried forward. The one genuine architectural fork in this plan (lock scope vs. LLM call
timing — see `architecture.md`) was resolved with a documented, reversible default rather than left
open, per this run's unattended-planning instruction.
