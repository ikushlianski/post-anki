---
type: state-fixtures
branch: phrase-bank-concurrency-fix
task: phrase-bank-concurrency-fix
state: confirmed
target-project: post-anki
target-feature: features/practice
local-db-inspected-at: 2026-07-28 (schema/code inspection only — see note below)
existing-state-mocks-snapshot: [none applicable — post-anki's verification-repo project uses a plain
  Postgres db/ helper (countWhere, rowExists, getRow) rather than Neo4j state-mock files; the
  "state mock" concept in the base plan-playwright template is Neo4j/mathaul-specific]
proposed-new-state-mocks: [none]
updated: 2026-07-28
---

# State fixtures — Phrase-bank concurrency and data-integrity fix

## Note on scope

This project (`post-anki`) is Postgres-only — no Neo4j, no `fixtures/state-mocks/` directory (that
convention belongs to the mathaul/Neo4j projects the base `plan-playwright` template was written
for). The equivalent contract here is: what does each scenario need in the local Postgres instance
before it runs, and how is that state produced (seeded rows vs. driven through the app).

Two different Postgres targets are in play, and this file is explicit about which scenario uses
which:

- **The e2e Postgres** (`localhost:5436`, `e2e/docker-compose.yml`) — used by S5 (the one Playwright
  scenario) via the standard `dev:pw` orchestration (docker up → migrate → mock-openrouter → web/api
  → Playwright run).
- **The same e2e Postgres, driven directly by vitest** (not through Playwright, not through the
  running web/api servers) — used by SCENARIO 1-4's integration tests. These are source-repo tests
  (`apps/api/src/db/migrations.integration.test.ts`,
  `apps/api/src/practice/phrase-bank-concurrency.integration.test.ts`), not verification-repo
  Playwright tests, so they are documented here for completeness (the parent task asked for this
  file to cover the full proof-mechanism split) but are not part of what `/review-playwright` runs.

## Per-scenario state contract

### S1 — Migration adds real FK + unique indexes (integration test, not Playwright)

- **State source:** fresh migration run against the e2e Postgres container, started via
  `docker compose -f e2e/docker-compose.yml up -d postgres` (electric service not needed — no
  Electric-synced read path is touched by this plan).
- **Reseed strategy:** the test's own `beforeAll` runs every migration under
  `apps/api/src/db/migrations/` (including this plan's new one) against a throwaway schema/database
  name unique to the test run, so it never collides with S2-S4's data or with anything a developer
  might have running locally on the same container.
- **Concrete state required:** none pre-existing — the test creates its own violating/non-violating
  rows via raw SQL inside each `it` block, scoped to a random `subjectId` generated per case (no FK
  from `phrases`/`phrase_bank_entries.subject_id` to a `subjects` table exists — confirmed by grep —
  so no `subjects` row needs to exist first).
- **Setup role:** subject = the migration itself (what's under test, applied fresh each run) and the
  specific violating/non-violating INSERT statements (front-door in the sense that they exercise the
  exact constraint being verified). Scenery = none — there is no precondition data this test depends
  on.
- **Mutations:** the test's own inserts (some expected to fail) — no mutation to any pre-existing
  data, since nothing pre-existing is read.

### S2, S3, S4 — Concurrency races (integration tests, not Playwright)

- **State source:** `additive-seed`, but seeded per-test-case via a random, unique `subjectId` (e.g.
  `newId("test-subject")`) rather than a shared named fixture — this is the reason no proposed-new
  state-mock file is needed for any of these three scenarios. Because `phrases` and
  `phrase_bank_entries` carry no FK to a `subjects` row, and every query in the code under test
  filters by `(subjectId, level, pack)`, giving each test case its own random `subjectId` guarantees
  full isolation without any table truncation or shared setup/teardown between cases.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` does not apply (no baseline concept
  here) — closer to `share-within-suite` is also wrong, since these are deliberately *not* shared.
  The accurate label for this project's shape: **isolated-by-scope-key** — each `it` block picks a
  fresh scope key and never reads/writes another case's key. This is simpler than a reseed strategy
  and is the reason this plan needs no new fixture infrastructure.
- **Concrete state required per case:**
  - S2: no pre-existing `phrases` rows for the test's random scope (so the sequence starts at 1);
    the test asserts on rows it creates via the two concurrent `generatePhraseBatch` calls.
  - S3: same as S2, plus the mocked agent response for both concurrent calls must be authored so
    their first generated item shares an identical `newTargetPhrase.text` — this is fixture
    *content* (the mocked Mastra agent's structured-output return value), not database state, and
    lives in the test file itself using the same `vi.mock("../mastra/mastra.js", ...)` pattern the
    existing orchestrator unit tests already use.
  - S4: one `phrase_bank_entries` row is seeded directly via SQL (status "practicing",
    masteryStage 0, correctCountInCycle 0) plus two `phrases` rows linked to it via
    `target_phrase_bank_entry_id` at non-adjacent `sequenceNumber`s (e.g. 1 and 9) — this seeding is
    the test's own setup step, not a reusable fixture, since the exact counters and sequence numbers
    are specific to what each `it` block is asserting.
- **Setup role:** for S2/S3, the subject under test is the pair of concurrent `generatePhraseBatch`
  calls themselves (front-door — driven through the real orchestrator function, not seeded around).
  For S4, the subject under test is the pair of concurrent `gradeAttempts` calls; the one seeded
  `phrase_bank_entries` row and its two linked `phrases` rows are scenery (back-door — their
  existence is a precondition, not what's being verified).
- **Mutations:** each test's own inserts/updates, scoped to its own random `subjectId` — no shared
  mutable state between cases, so tests can run in any order or in parallel vitest workers without
  interference.

### S5 — Normal single-user practice loop is unaffected (Playwright e2e)

- **State source:** `baseline-only`, matching the existing `first-batch-generates-automatically`
  scenario's setup — a fresh subject with no prior phrase-bank state, created through whatever
  existing subject-creation path that scenario already uses.
- **State mocks applied:** none — no new mock needed; this test reuses the same setup shape as an
  already-existing, already-verified practice-feature scenario.
- **Suite:** none.
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` — standard for the verification-repo's
  e2e Postgres, which resets between runs via the project's normal `dev:pw` orchestration; no
  special handling beyond ensuring the new migration is included in that orchestration's migrate
  step (it is — it's just the newest file under `apps/api/src/db/migrations/`).
- **Concrete state required:**

  | Entity | Key properties | Source |
  |---|---|---|
  | `subjects` row | fresh id, `kind: 'language-practice'` | created via existing subject-creation path (same as `first-batch-generates-automatically`) |
  | `phrases` rows | none pre-existing for this subject | baseline — nothing to seed |
  | `phrase_bank_entries` rows | none pre-existing for this subject | baseline — nothing to seed |

- **Setup role:** the subject under test is the batch-generation + grading flow itself, driven
  through the real UI (front-door). The one `subjects` row is scenery (back-door — created through
  whatever existing action/seed path the practice feature already uses to get a subject onto the
  practice page; this plan adds no new subject-creation mechanism).
- **Mutations:** the flow creates its own `phrases`, `phrase_bank_entries` (possibly), and
  `attempts` rows through normal use — no assertions depend on a specific mutation count beyond
  "10 phrase cards render" and "N results render," matching the existing analogous scenario's
  assertions.

## Forbidden mutations

Not applicable — no scenario in this plan targets a read-only or shared environment. Both the
Playwright e2e run (S5) and the vitest integration tests (S1-S4) are guarded to local-only Postgres
targets: S5 via the verification-repo's existing `assertTargetAllowed` check; S1-S4 via the new
lightweight host-allowlist guard this plan adds directly to the integration test file (see
`spec.md`, decision 4).

## Open questions

None carried forward.
