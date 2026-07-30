---
type: state-fixtures
branch: gap-mastery-cascade-delete
task: "Clean up orphaned gap_mastery rows left behind by gap/topic/module/curriculum deletion"
state: confirmed
target-project: post-anki
target-feature: none
local-db-inspected-at: 2026-07-30
existing-state-mocks-snapshot: []
proposed-new-state-mocks: []
updated: 2026-07-30
---

# State fixtures — gap_mastery cascade delete

No Playwright state mocks apply to this plan — there is no e2e scenario (see `playwright.md`). The
one scenario is a vitest integration test that seeds its own rows directly via raw SQL `INSERT`
statements inside the test file itself, exactly matching the existing precedent in
`apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts`'s `seedScenery` helper.
This file documents that inline-seeded state as the contract, since the framework's state-fixtures
discipline still applies even though the seeding mechanism is "inline SQL in the test" rather than a
named `state-mocks/<name>.ts` file.

## Source inventory

**Existing state mocks reused:** none (no Playwright state-mock library applies).

**Proposed new state mocks:** none.

**Local-DB inspection summary:** not applicable — the integration test runs against the ephemeral
Docker Postgres instance (`postanki_e2e`, port 5436), which is wiped/recreated by
`e2e/docker-compose.yml`, not the developer's ambient local DB. No local-DB inspection was performed
for this plan since the test seeds all of its own state and depends on nothing pre-existing.

## Per-scenario state contract

### S1 — gap_mastery cascade delete

- **State source:** inline-sql-seed (test-file-local; not a named state mock, not `additive-seed` in
  the Playwright sense — this is a vitest integration test, not a browser test)
- **State mocks applied:** none
- **Suite:** none — each of the four `it` cases seeds and asserts independently
- **Reseed strategy:** each test case creates its own uniquely-`randomUUID()`-suffixed rows (subject,
  curriculum, module, topic, gap, gap_mastery), so cases don't collide with each other or with
  ambient data in the shared `postanki_e2e` DB; no wipe-and-replay needed
- **Concrete state required (every entity must exist before the deletion call runs):**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row | `id`, `name`, `kind` | scenery | inline SQL insert in test |
  | `curricula` row | `id`, `subject_id`, `name`, `status: 'confirmed'` | scenery | inline SQL insert |
  | `modules` row | `id`, `curriculum_id`, `title`, `order: 1` | scenery | inline SQL insert |
  | `topics` row | `id`, `module_id`, `curriculum_id`, `title` | scenery | inline SQL insert |
  | `gaps` row | `id`, `topic_id`, `label`, `state: 'open'` | scenery | inline SQL insert |
  | `gap_mastery` row | `id`, `gap_id` (matches the gap above), `status: 'struggling'` (or any non-default status — proves a REAL row, not just a default) | scenery | inline SQL insert |

  All rows above are scenery, matching `scenarios.md`'s Setup role note: there is no seeded
  "subject" entity here in the browser front-door sense. The subject of this scenario is the
  **deletion call itself** (`deleteTopic` / `deleteModule` / `deleteModules` /
  `clearCurriculumStructure`), invoked directly as a function call from the test, not through any
  UI. The pre-seeded `gap_mastery` row is a precondition (scenery) whose disappearance is what the
  test asserts on after the subject (the deletion call) runs — it is never itself driven through a
  front door, because no front door for `gap_mastery` exists in this app.

- **Mutations the scenario will make (audit trail):**
  - Deletes the seeded `gaps` row (existing behavior, unchanged).
  - Deletes the seeded `topics` / `modules` row(s) depending on which of the four functions is under
    test (existing behavior, unchanged).
  - **New:** deletes the seeded `gap_mastery` row. This is the one behavior change under test.
  - No mutation to `subjects` or `curricula` rows in the topic/module cases; `clearCurriculumStructure`
    additionally deletes `modules`/`topics` under the curriculum but the test only asserts on
    `gap_mastery`, per Acceptance.

---

## State suites

None — all four `it` cases are independent and unordered.

## Forbidden mutations

Not applicable — target DB is the ephemeral local e2e Docker Postgres (`postanki_e2e`), never a
shared or production target. `assertLocalDbTarget` (imported the same way
`gap-mastery-concurrency.integration.test.ts` does) guards against accidentally running this against
the wrong DATABASE_URL.

## Open questions

None.
