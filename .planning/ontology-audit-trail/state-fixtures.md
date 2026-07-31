---
type: state-fixtures
branch: ontology-audit-trail
task: ontology-audit-trail
state: confirmed
target-project: post-anki
target-feature: features/admin-observability
local-db-inspected-at: 2026-07-31T00:00:00Z
existing-state-mocks-snapshot: [seed-domain-map-fixture.insertDomainNode]
proposed-new-state-mocks: [seed-ontology-merge-fixture.insertOntologyMergeLogRow]
updated: 2026-07-31
---

# State fixtures — Merge/split audit trail

One new state mock is proposed: `insertOntologyMergeLogRow` (S5 only). S1 reuses one existing
back-door seed (`seedAdditionalDomainNode`, for the source's domain node — there is no front-door
single-node creation action) plus existing front-door actions for everything else.

## Source inventory

**Existing state mocks reused:**
- `seedAdditionalDomainNode` (`features/domain-map/seeds/seed-domain-map-fixture.ts`) — S1's
  source domain node.

The precedent `seedAdditionalDomainNode`'s "back-door SQL insert when no HTTP creation path exists"
reasoning is reused for the new S5 seed helper's design, not its code.

**Proposed new state mocks:**
- `insertOntologyMergeLogRow` (`features/admin-observability/seeds/seed-ontology-merge-fixture.ts`)
  — direct SQL insert of one `ontology_merges` row with caller-supplied `entityType`, `targetName`,
  `sourceName`, `reassignedCounts`. `targetId`/`sourceId` are generated deterministically inside the
  helper (never asserted on by the test — only names and counts are).

**Local-DB inspection summary:** this project's e2e stack always starts from a wiped Docker Postgres
(`post-anki-e2e`, :5436) per the project's own `dev:pw` orchestration — no ambient/persistent local
state between runs. Every scenario below is `baseline-only` plus in-test creation.

## Per-scenario state contract

### S1 — Merging two subjects via the UI writes a visible, correctly-populated log row

- **State source:** `baseline-only + back-door node seed`
- **State mocks applied:** `seedAdditionalDomainNode` (existing, ×1 — the source's domain node)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required (every entity must exist before the first Playwright action):**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row (target) | `name: 'S1 Merge Target Subject'` | scenery | `createSubject` action |
  | `subjects` row (source) | `name: 'S1 Merge Source Subject'` | scenery | `createSubject` action |
  | `curricula` row under source | `name: 'S1 Source Curriculum'`, `subjectId: <source id>` | scenery | `createCurriculumByName` action |
  | `domain_nodes` row under source | `name: 'S1 Source Domain Node'`, `subjectId: <source id>`, `parentId: null` | scenery | `seedAdditionalDomainNode` seed (no front-door single-node creation action exists — confirmed in `domain-node-merge`'s own plan) |
  | merge operation itself | via `mergeSubject({ sourceSubjectName: 'S1 Merge Source Subject', targetSubjectName: 'S1 Merge Target Subject' })` | **subject** | `mergeSubject` action (existing) |
  | admin-observability read | via `openAdminObservabilityPage` + `readOntologyMergeRows`, plus a direct SQL cross-check of `reassigned_counts` against real post-merge row counts | **subject** | new actions + direct SQL in the test file |

- **Mutations the scenario will make** (audit trail for state-isolation reasoning):
  - `subjects` source row deleted
  - `curricula` row's `subject_id` becomes the target's id
  - `domain_nodes` row's `subject_id` becomes the target's id
  - one new `ontology_merges` row inserted, `entity_type: 'subject'`, with an implicit `createdAt`
    (this row is not part of any multi-row-same-transaction ordering assertion, so the `now()`
    default is fine here — the ordering-flake concern applies only to S5's 4-row seed and the
    backend read-path DoD test, both of which use explicit `createdAt` values)

---

### S5 — The admin view renders all four entity types correctly, independent of S1–S4

- **State source:** `baseline-only` (page itself) + in-test back-door log-row seed
- **State mocks applied:** `insertOntologyMergeLogRow` ×4 (proposed-new)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `ontology_merges` row (subject) | `entityType: 'subject'`, `targetName: 'S5 Sub Target'`, `sourceName: 'S5 Sub Source'`, `reassignedCounts: { curriculaMoved: 3, domainNodesMoved: 1 }`, `createdAt: T0` | scenery | `insertOntologyMergeLogRow` |
  | `ontology_merges` row (tag) | `entityType: 'tag'`, `targetName: 'S5 Tag Target'`, `sourceName: 'S5 Tag Source'`, `reassignedCounts: { assignmentsMoved: 2, assignmentsDeduped: 1, sessionsMoved: 1 }`, `createdAt: T0 + 1s` | scenery | `insertOntologyMergeLogRow` |
  | `ontology_merges` row (curriculum) | `entityType: 'curriculum'`, `targetName: 'S5 Cur Target'`, `sourceName: 'S5 Cur Source'`, `reassignedCounts: { modulesMoved: 4, topicsMoved: 9, sourcesMoved: 2, socraticSessionsMoved: 1, probeSessionsMoved: 1 }`, `createdAt: T0 + 2s` | scenery | `insertOntologyMergeLogRow` |
  | `ontology_merges` row (domain_node) | `entityType: 'domain_node'`, `targetName: 'S5 Node Target'`, `sourceName: 'S5 Node Source'`, `reassignedCounts: { curriculaMoved: 1, childNodesMoved: 2 }`, `createdAt: T0 + 3s` | scenery | `insertOntologyMergeLogRow` |
  | admin-observability read | via `openAdminObservabilityPage` + `readOntologyMergeRows` | **subject** | new actions |

- **Mutations the scenario will make:** none beyond the 4 seed inserts themselves — the page is
  read-only, never submits a form. `T0` is an arbitrary fixed timestamp the test picks (e.g. "1
  hour before test start"); each row gets `T0 + 0s/1s/2s/3s` explicitly, never Postgres's `now()` —
  four inserts made in the same transaction would otherwise share one transaction-start timestamp,
  making the table's own rendering order undefined for this test's own assertions (S5 doesn't
  assert a specific order, but S5's seed helper reuses the same `insertOntologyMergeLogRow`
  function the backend DoD's ordering test also uses, so the explicit-timestamp discipline is kept
  consistent everywhere the function is called, not just where it's strictly required).

---

## State suites

None — every scenario is strictly isolated, no shared sequential state.

## Forbidden mutations

N/A — no `read-only-mathaul-dev` scenarios; `post-anki-e2e` is always local, ephemeral Docker
Postgres per `project.json`.

## Open questions

None.
