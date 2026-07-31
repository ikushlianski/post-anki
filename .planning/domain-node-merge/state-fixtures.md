---
type: state-fixtures
branch: domain-node-merge
task: domain-node-merge
state: confirmed
target-project: post-anki
target-feature: features/domain-map
local-db-inspected-at: 2026-07-31T00:00:00Z
existing-state-mocks-snapshot: [seed-domain-map-fixture.insertDomainNode, seed-domain-map-fixture.seedAdditionalDomainNode, seed-domain-map-fixture.seedCurriculumAttachedToNode]
proposed-new-state-mocks: []
updated: 2026-07-31
---

# State fixtures — Domain-node merge

No new state mocks are proposed — `seed-domain-map-fixture.ts`'s existing `insertDomainNode` /
`seedAdditionalDomainNode` helpers already cover every tree-shape need below; extending the
existing file with more calls is the reuse-beats-forking default, not a new named mock.

## Source inventory

**Existing state mocks reused:**
- `insertDomainNode` (`features/domain-map/seeds/seed-domain-map-fixture.ts`) — back-door SQL
  insert of one `domain_nodes` row, the only creation path independent of the agent-driven
  placement flow.
- `seedAdditionalDomainNode` (same file) — thin wrapper over `insertDomainNode` for a single extra
  node beyond a fixture's base shape.

**Local-DB inspection summary:** this project's e2e stack always starts from a wiped Docker
Postgres (`post-anki-e2e`, :5436) per the project's own `dev:pw` orchestration — there is no
ambient/persistent local state to inspect between runs, unlike the Neo4j-backed mathaul projects
this framework was originally built around. Every scenario below is `baseline-only` (nothing
seeded ahead of the test) plus in-test back-door seeding.

## Per-scenario state contract

### S1 — Merge two domain nodes with real children, none orphaned or duplicated

- **State source:** `baseline-only` (subject created in-test) + in-test back-door tree seed
- **State mocks applied:** `insertDomainNode` ×4 (existing)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required (every entity must exist before the first Playwright action):**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row | `name: 'S1 Domain Merge Subject'`, `kind: 'architecture-mentor'` | scenery | `createSubject` action |
  | `domain_nodes` row (target A) | `parent_id: null`, `name: 'Meta-frameworks'` | scenery | `insertDomainNode` |
  | `domain_nodes` row (unrelated parent) | `parent_id: null`, `name: 'Backend'` | scenery | `insertDomainNode` |
  | `domain_nodes` row (source B) | `parent_id: <unrelated parent id>`, `name: 'React Server Components'` | scenery | `insertDomainNode` |
  | `domain_nodes` row (child C) | `parent_id: <B id>`, `name: 'RSC Streaming'` | scenery | `insertDomainNode` |
  | `curricula` row attached to B | `domain_node_id: <B id>` | **subject** | `addCourseUnderNode` action |
  | merge operation itself | `mergeDomainNode({ sourceNodeName: 'React Server Components', targetNodeName: 'Meta-frameworks' })` | **subject** | `mergeDomainNode` action (new) |

- **Mutations the scenario will make** (audit trail for state-isolation reasoning):
  - `domain_nodes` row B deleted
  - `domain_nodes` row C's `parent_id` becomes A's id
  - `curricula` row's `domain_node_id` becomes A's id

---

### S2 — Merge-target picker excludes invalid targets

- **State source:** `baseline-only` (subject created in-test) + in-test back-door tree seed
- **State mocks applied:** `insertDomainNode` ×4 (existing)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row | `name: 'S2 Picker Subject'` | scenery | `createSubject` action |
  | `domain_nodes` row (node under test) | `parent_id: null`, `name: 'Frontend'` | scenery | `insertDomainNode` |
  | `domain_nodes` row (its child) | `parent_id: <node under test id>`, `name: 'Meta-frameworks'` | scenery | `insertDomainNode` |
  | `domain_nodes` row (its grandchild) | `parent_id: <child id>`, `name: 'Next.js'` | scenery | `insertDomainNode` |
  | `domain_nodes` row (sibling) | `parent_id: null`, `name: 'Backend'` | scenery | `insertDomainNode` |
  | picker option list read-back | via `openDomainNodeMergePicker` | **subject** | new action |

- **Mutations the scenario will make:** none — the picker is opened and read, never confirmed.

---

## State suites

None — every scenario is strictly isolated, no shared sequential state.

## Forbidden mutations

N/A — no `read-only-mathaul-dev` scenarios; this project never touches a shared/prod-adjacent
target (`post-anki-e2e` is always local, ephemeral Docker Postgres per `project.json`).

## Open questions

None.
