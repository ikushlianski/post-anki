---
type: state-fixtures
branch: curriculum-merge
task: curriculum-merge
state: confirmed
target-project: post-anki
target-feature: features/curriculum
local-db-inspected-at: 2026-07-31 (not applicable — see note below)
existing-state-mocks-snapshot: []
proposed-new-state-mocks: []
updated: 2026-07-31
---

# State fixtures — Curriculum merge

The exact initial state every scenario in `scenarios.md` requires before its first Playwright
action (or, for S3/S4, its first backend call) runs.

## Note on local-DB inspection (post-anki specifics vs. the generic template)

This project's e2e stack is a local, ephemeral Docker Postgres wiped and reseeded per the project's
own `e2e/docker-compose.yml` + migration flow (`project.json`'s `localInfra`/`e2eCommand`), not a
long-lived shared local database the way the generic Phase 6.3 template (written for a Neo4j-backed
project) assumes. There is no ambient "developer's local DB" to sample for reusable state, and no
`fixtures/state-mocks/` directory exists yet under `features/curriculum/` or `features/subject/` —
confirmed by directory listing. Every scenario in this plan is `baseline-only` for exactly this
reason: it is both the only available option and the correct one, since building the real-world
duplicate-curriculum case in-test is also what proves the reassignment path itself works (same
reasoning `ontology-split-merge`'s own state-fixtures.md gave for its S1-S3).

## Source inventory

**Existing state mocks reused:** none — none exist for this feature area yet.

**Proposed new state mocks:** none — no scenario needs one.

## Per-scenario state contract

### S1 — Merging two curricula with real children reassigns every one, none orphaned or duplicated

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** `none`
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` (this project's default per-test
  isolation — the e2e Postgres is reset between test files per the project's own `e2eCommand`
  orchestration; no scenario-specific override needed)
- **Concrete state required (every entity must exist before the assertions run):**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row | `name: 'Curriculum merge test subject <stamp>'`, `kind: 'architecture-mentor'` | scenery | `createSubject` action |
  | `curricula` row (target, "new") | `name`, `subjectId`, reaches `status: 'ready'` | **subject** — the entity whose merge behavior is under test | `studyTechnology` action + `request.post` polling sequence (approve-sources, confirm-structure) |
  | `curricula` row (source, "old") | `name`, `subjectId`, reaches `status: 'ready'` | **subject** | same sequence, second curriculum |
  | `modules`/`topics` rows under target | real rows from structure generation against the mocked LLM | **subject** (their reassignment IS the thing under test) | produced by the `confirm-structure` step against `mock-openrouter` |
  | `modules`/`topics` rows under source | same | **subject** | same, second curriculum |
  | `tags` row (x2, one per curriculum) | distinct names, so post-merge assertions can tell which tag came from which side | scenery | `assignTagToModule` action (which resolves-or-creates the tag) |
  | `tag_assignments` row (x2) | one per tagged module | scenery | same action |
  | `sources` row (extra, on the source curriculum) | one additional source beyond whatever `studyTechnology`/approve-sources already created | scenery | direct `request.post(/curricula/:sourceId/sources)` call — no dedicated UI action needed, this row only needs to exist, not be created through its own UI flow |

- **Mutations the scenario will make** (audit trail for state-isolation reasoning):
  - The merge itself: `modules`/`topics`/`sources` rows move from source's `curriculum_id` to
    target's; `curriculum_structure_turns`/`structure_research_candidates` rows for the source are
    deleted; the source `curricula` row is deleted.
  - No mutation to the two `tags` rows themselves or their `tag_assignments` rows — the whole point
    of asserting both tag chips survive is that these rows are never written to by the merge.

---

### S2 — The merge-target picker only ever offers another curriculum in the same subject

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** `none`
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row A | one curriculum only | scenery | `createSubject` |
  | `curricula` row under subject A | any name, does not need `status: 'ready'` (assertion is about the picker's option list, not merged content) | **subject** | `studyTechnology`, stopped after it appears in the list |
  | `subjects` row B | two curricula | scenery | `createSubject` |
  | `curricula` row (x2) under subject B | distinct names | **subject** — the picker's filtering behavior over this exact pair is what's under test | `studyTechnology` x2 |

- **Mutations the scenario will make:** none — this scenario opens the picker and reads its option
  list, never confirms a merge (mirrors `openMergePicker`'s own "leaves the picker
  open/unconfirmed" behavior).

---

## State suites

No scenario shares state with another; each is fully self-contained. `S1`/`S2` run isolated by
this project's existing per-test-file DB reset; `S3`/`S4` run as backend integration tests against
the same e2e Postgres instance, seeding and asserting entirely via direct SQL/HTTP, no browser
involved.

| Suite | Scenarios | Reseed at suite start | Notes |
|---|---|---|---|
| n/a | S1, S2, S3, S4 | n/a — each scenario is independently isolated | no suite grouping needed |

## Forbidden mutations

N/A — no scenario targets a read-only or forbidden database. All four scenarios run exclusively
against the local, ephemeral `post-anki-e2e` Postgres instance (`:5436`), never against the Neon
production database (the project's own `assert-target-allowed`/`forbidden-targets` guard in
`db/pg.ts` enforces this regardless).

## Open questions

None.
