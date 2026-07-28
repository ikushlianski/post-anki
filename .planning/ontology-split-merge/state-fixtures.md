---
type: state-fixtures
branch: ontology-split-merge
task: ontology-split-merge
state: confirmed
target-project: post-anki
target-feature: features/subject, features/tag
local-db-inspected-at: 2026-07-28
existing-state-mocks-snapshot: []
proposed-new-state-mocks: []
updated: 2026-07-28
---

# State fixtures — Subject and Tag merge

This project's persistence layer is Postgres (Drizzle), not Neo4j — `pg.Pool` against a local
Docker instance at `:5436` for e2e, matching `features/subject/seeds/baseline.ts`'s existing
`applyBaselineSeed(pool: Pool)` shape (currently a no-op — `{ applied: [] }` — since no scenario in
this project's suite so far has needed a non-empty baseline).

## Source inventory

**Existing state mocks reused:** none as a named mock file, but S1 reuses an existing **pattern**:
`features/domain-map/seeds/seed-domain-map-fixture.ts`'s direct-SQL `insertDomainNode` approach for
the one piece of state that genuinely has no front door — a `domain_nodes` row (verified: no HTTP
path creates one independent of the agent-driven placement flow inside curriculum creation). Every
other entity every scenario needs is created **in-test through real actions** — a deliberate
choice, not a gap:

- No seed provides the "Webdev"/"Programming / Web Development" duplicate
  (`apps/api/scripts/seed-subjects.ts` seeds only "Programming / Web Development" — verified by
  reading the file in full).
- The entire point of every scenario in this plan is proving a *reassignment* worked — seeding the
  pre-merge state would mean the test never exercises the real creation paths (subject creation,
  curriculum creation, domain-node placement, tag assignment) that produce the exact shape a real
  user's duplicate would have.

**Proposed new state mocks:** none for the e2e scenarios (S1-S3) — all baseline-only,
built via actions. S4 and S5 (backend-only, integration tests, not e2e) seed their fixtures via
direct SQL/Drizzle inserts inside the test file itself, matching
`phrase-bank-concurrency-fix`'s existing integration-test pattern (real Postgres, throwaway-per-run
data, no shared fixture file) rather than the e2e state-mock mechanism.

**Local-DB inspection summary** (observation only, not contract): this project's e2e Postgres
instance is wiped and re-migrated per `dev:pw` run (per `project.json`'s `e2eCommand` orchestration
and `e2e/docker-compose.yml`) — there is no persistent "developer's local DB" to sample the way a
long-lived Neo4j dev instance would be sampled for a Neo4j-backed project. Every scenario in this
plan is written to be self-contained and order-independent for exactly this reason.

## Per-scenario state contract

### S1 — Merge two subjects with real children

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` (this project's default per-test
  Postgres reset via its own e2e harness — no scenario-specific reseed needed since nothing is
  seeded beyond baseline)
- **Concrete state required (every entity must exist before the first Playwright action):**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | Subject "Webdev" | `kind: 'architecture-mentor'` | **subject** (front door) | `createSubject` action, in-test |
  | Subject "Programming / Web Development" | `kind: 'architecture-mentor'` | **subject** | `createSubject` action, in-test |
  | Curriculum under "Webdev" with a real module + topic, `status: 'ready'` | reached via `studyTechnology` (docUrl against the existing `mockDocsSiteBaseUrl()` fixture) → poll to `awaiting_source_approval` → `POST .../approve-sources {override:true}` → poll to `ready` (the exact, already-proven sequence `study-technology-doc-url/test.ts` uses) — corrected mid-planning after verifying `editable = status==='ready'\|\|'confirmed'` gates BOTH the manual add-module/add-topic UI and `TagPicker`'s "+ tag" control, so neither exists on a freshly-created (`status: 'curating'`) curriculum | **subject** | `studyTechnology` action (existing) + `request`-fixture polling, in-test |
  | Tag "react" assigned to a module from that curriculum | — | **subject** | `assignTagToModule` action (new), in-test — proves tags survive untouched |
  | `domain_nodes` node "Backend" under "Webdev" | — | scenery (back-door — no HTTP creation path exists independent of the agent-driven placement flow, verified) | direct SQL insert, mirroring `features/domain-map/seeds/seed-domain-map-fixture.ts`'s existing `insertDomainNode` pattern |
  | Curriculum placed on "Backend" node | via the tree UI's own "add course here" | **subject** | `addCourseUnderNode` — EXISTING action from `features/domain-map/actions`, reused as-is, in-test |

- **Mutations the scenario will make** (audit trail):
  - `POST /subjects/:programmingId/merge { sourceSubjectId: webdevId }` — the mutation under test.
  - Post-merge reads only (`GET /curricula`, `GET /subjects/:id/domain-map`, `GET /subjects/:webdevId`
    expecting 404) — no further mutation.

---

### S2 — Merge-target picker excludes invalid targets

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | Subject A | `kind: 'architecture-mentor'` | **subject** | `createSubject`, in-test |
  | Subject B | `kind: 'architecture-mentor'` | **subject** | `createSubject`, in-test |
  | Subject C ("English") | `kind: 'language-practice'` | **subject** | `createSubject`, in-test |

- **Mutations the scenario will make:** none — this scenario only opens the merge picker and reads
  its option list; no merge is actually confirmed.

---

### S3 — Merge two tags, dedupe case

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | Subject | `kind: 'architecture-mentor'` | scenery | `createSubject`, in-test |
  | Curriculum with a real module + topic, `status: 'ready'` | same `studyTechnology` +
    approve-override + poll sequence as S1 | scenery | `studyTechnology` (existing) + polling, in-test |
  | Tag "react" | — | **subject** | `createTag`, in-test |
  | Tag "reactjs" | — | **subject** | `createTag`, in-test |
  | "react" assigned to the module (single-tag case) | — | **subject** | `assignTagToModule`, in-test |
  | "reactjs" assigned to the module (same module — plain-move case) | — | **subject** | `assignTagToModule`, in-test |
  | "react" AND "reactjs" both assigned to the topic (dedupe case) | — | **subject** | `assignTagToModule`/topic variant, in-test |

- **Mutations the scenario will make:**
  - `POST /tags/:reactId/merge { sourceTagId: reactjsId }` — the mutation under test.
  - Post-merge reads only.

---

## State suites

None — every e2e scenario in this plan is fully isolated (`baseline-only`, all state created
in-test), so no suite/shared-state grouping is needed.

## Forbidden mutations

N/A — no scenario in this plan targets a read-only or forbidden environment; everything runs
against the local, ephemeral e2e Postgres instance per `project.json`.

## Open questions

None.
