---
type: state-fixtures
branch: workplace-scenario-packs
task: workplace-scenario-packs
state: confirmed
target-project: post-anki
target-feature: features/practice
local-db-inspected-at: 2026-07-28 (inspected via schema reading, not a live query — see note below)
existing-state-mocks-snapshot: [none directly applicable — features/practice has no
  fixtures/state-mocks/ folder; state comes from front-door UI actions, e2e Postgres reset per run]
proposed-new-state-mocks: [none — no new state-mock TS file needed; the only new fixture is a
  pack-aware branch inside the existing buildPhraseBatchStub function, listed below]
updated: 2026-07-28
---

# State fixtures — Port workplace scenario packs to the English subject

The exact initial state every scenario in `scenarios.md` requires before its first Playwright
action runs.

## Source inventory

**Existing state mocks reused:** none — `features/practice` doesn't use a `fixtures/state-mocks/`
pattern; every existing practice scenario (`first-batch-generates-automatically`,
`retry-storm-guard-bounds-failed-generate`, `check-writing-scores-a-submission`, etc.) creates its
subject as a front-door action at test start, not via a seeded state mock. This ticket's scenarios
follow the same convention.

**Proposed new mock content** (to be written by `/implement-playwright`, inside the existing
`mock-openrouter/responses.ts`, not a new file under `fixtures/mock-data/` — this is LLM-response
content, not entity fixture data):
- `buildPhraseBatchStub`'s `CodeReview` branch — themed Russian/English phrase pairs carrying a
  `"Code review stub, generation ${generation}, item ${index + 1}"`-shaped marker (mirrors the
  existing General branch's `"Stubbed generation ${generation} phrase, item ${index + 1}"` shape,
  substituting the pack-identifying marker text), still 10 items, still varying `domain` across
  `Tech`/`SmallTalk`/`Everyday` per the existing `PHRASE_BATCH_DOMAINS` rotation (unchanged — no
  scenario in this plan asserts on domain distribution).
- `buildPhraseBatchStub`'s `StandupUpdates`/`IncidentPostmortems`/`GivingFeedback` branches — same
  minimal-but-distinct treatment, required only to satisfy the strict-match-or-throw contract (see
  `spec.md`'s "Mock LLM mechanism"); no scenario in this plan reads their specific content.
- `buildPhraseBatchStub`'s `General` branch — UNCHANGED, byte-for-byte identical to today's stub
  content, since existing tests outside this ticket's scope depend on its current shape.

**Local-DB / schema inspection note:** confirmed via reading `apps/api/src/db/schema.ts` directly
(`languagePracticeSettings.pack` and `phrases.pack` columns already exist, migrated — no new
migration needed) and `mock-openrouter/responses.ts` directly (`buildPhraseBatchStub` currently
takes no arguments and is pack-blind — confirmed by reading its full body and the responder's
`content: () => JSON.stringify(buildPhraseBatchStub())` call site). No live e2e Postgres was queried
for this ticket specifically — nothing new to sample; the `phrases`/`language_practice_settings`
tables and their `pack` column already exist and are already populated by every other passing
practice test.

## Per-scenario state contract

### S1 — A selected pack persists across a page reload

- **State source:** `additive-seed` for the subject (created via the existing `subject` feature's
  front-door action); the `language_practice_settings` row's `pack` value is front-door, not
  seeded (it's upserted to `'General'` on first read by `getOrCreatePracticeSettings`, then mutated
  by the real `changePack` click).
- **State mocks applied:** none — no LLM call happens in this scenario.
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` at the suite level (this project's e2e
  Postgres is reset per full run via `e2e/scripts/run.sh`); no per-test reseed within the run, since
  the subject and its settings row are scoped to this test's own freshly-created subject id.
- **Concrete state required (every entity must exist before the first Playwright action):**

  | Entity / relationship | Key properties | Source |
  |---|---|---|
  | `subjects` row | `kind: 'language-practice'` | front-door — created via the existing `subject` feature's action at test start |
  | `language_practice_settings` row | `subject_id` = the test's subject; `pack: 'General'` (default, before the click) | front-door — upserted by `getOrCreatePracticeSettings` on first page load |

- **Setup role:** the `subjects` row is **scenery**. The `language_practice_settings.pack` mutation
  (General → StandupUpdates) is the **subject** under test.
- **Mutations the scenario makes:** creates 1 `subjects` row (scenery), 1 upserted
  `language_practice_settings` row, then 1 UPDATE to that row's `pack` column via the real
  `changePack` click.

---

### S2 — Selecting a named pack themes the generated batch, provably

- **State source:** `additive-seed` for the subject (front-door). No prior `phrases` rows.
- **State mocks applied:** `buildPhraseBatchStub`'s `CodeReview` branch (proposed-new content
  inside the existing mock file, not a new fixture file), selected by the mock's
  `Pack: CodeReview`-line parse of the real generation prompt — no queue, order-independent, pure
  function of the request.
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` at the suite level, as S1.
- **Concrete state required:**

  | Entity / relationship | Key properties | Source |
  |---|---|---|
  | `subjects` row | `kind: 'language-practice'` | front-door |
  | `language_practice_settings` row | `pack: 'CodeReview'` after the click (was `'General'`) | front-door |
  | `phrases` rows (×10) | `subject_id` = test's subject; `pack: 'CodeReview'`; `level: 'B1_B2'`; `batch_id` = the newly generated batch | front-door — created by the real `generatePhraseBatch` orchestrator call, using the mock's CodeReview branch |

- **Setup role:** the `subjects` row is **scenery**. The 10 `phrases` rows are the **subject**
  under test (front door — created by driving the real generate flow after the pack switch, never
  seeded).
- **Mutations the scenario makes:** creates 1 `subjects` row (scenery), 1
  `language_practice_settings` row (default, then updated to `CodeReview`), INSERTs 10 `phrases`
  rows with `pack = 'CodeReview'`.

---

### S3 — Switching back to General regenerates untainted generic content

- **State source:** `additive-seed` for the subject (front-door), same as S1/S2 but not shared with
  either — its own fresh subject.
- **State mocks applied:** `buildPhraseBatchStub`'s `CodeReview` branch (first half of the test,
  reused from S2's proposed content) then the unchanged `General` branch (second half).
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` at the suite level.
- **Concrete state required:**

  | Entity / relationship | Key properties | Source |
  |---|---|---|
  | `subjects` row | `kind: 'language-practice'` | front-door |
  | `phrases` rows (×10, first batch) | `pack: 'CodeReview'` | front-door — same mechanism as S2, run first within this test |
  | `phrases` rows (×10, second batch) | `pack: 'General'`, different `batch_id` from the first | front-door — created after switching back to General |

- **Setup role:** the `subjects` row is **scenery**. Both sets of 10 `phrases` rows are **subject**
  (front door, both generated within the one test — the point of this scenario is precisely that
  switching packs doesn't retroactively touch the first set).
- **Mutations the scenario makes:** creates 1 `subjects` row (scenery), INSERTs 10 `phrases` rows
  with `pack = 'CodeReview'`, then INSERTs 10 more `phrases` rows with `pack = 'General'` — 20 total,
  zero UPDATEs or DELETEs to the first 10 (the negative assertion this scenario exists to prove).

## State suites

None of this ticket's 3 scenarios share state across test files — each creates its own fresh
`language-practice` subject via the existing `subject` feature's action, so there's no cross-
scenario row-count ambiguity even when run in the same suite pass. This also rules out the
cross-test contamination risk the source app's own `.planning/LOG.md` 2026-07-18 entry documented
(a shared, non-reset `settings` row leaking a non-General pack into the next test) — see `spec.md`
decision 4 for why post-anki's per-subject settings row doesn't share that risk.

## Forbidden mutations

None beyond the project-wide guard already in place for the e2e stack (local Postgres only,
`localhost:5436`, never Neon/prod) — unchanged by this ticket, applies identically to
`generatePhraseBatch`/`updatePracticeSettings` as it does to every other practice-feature mutation.

## Open questions

None. The `buildPhraseBatchStub` rewrite is a `/write-playwright-tests`/`/implement-playwright`
implementation detail with a fully specified contract in `spec.md`, not an unresolved design fork.
