---
type: state-fixtures
branch: domain-priority-review
task: domain-priority-review
state: confirmed
target-project: post-anki
target-feature: features/domain-map
local-db-inspected-at: 2026-07-28 (schema/code inspection only — see note below)
existing-state-mocks-snapshot: [seedDomainMapFixture (features/domain-map/seeds/seed-domain-map-fixture.ts, from seed-knowledge-map)]
proposed-new-state-mocks: [seedPendingPrioritySuggestion — extends seedDomainMapFixture's output with one domain_priority_suggestions row; backdatable via an explicit createdAt param for S9]
updated: 2026-07-28
---

# State fixtures — Per-domain expertise priority + monthly re-prioritization review

## Note on scope

Same Postgres-only divergence from the base `/plan-playwright` template already documented by
`phrase-bank-concurrency-fix/state-fixtures.md` and `seed-knowledge-map/state-fixtures.md` in this
same worktree — no Neo4j, no state-mock TypeScript library in the framework sense. The equivalent
contract: what does each scenario need in the local e2e Postgres before it runs, produced via
front-door UI action (subject) vs. back-door seed (scenery).

Two proof mechanisms are in play:
- **The e2e Postgres via Playwright** (`localhost:5436`) — SCENARIOS 3, 5, 6, 7, 9, via the
  standard `dev:pw` orchestration.
- **The same e2e Postgres, driven directly by vitest** — SCENARIOS 1, 2, 4, 8's unit/integration
  tests (source-repo tests, not verification-repo Playwright tests — documented for completeness
  per `spec.md`'s Definition of Done, not run by `/review-playwright`).

## Reused fixture: `seedDomainMapFixture`

This plan's scenarios reuse `seed-knowledge-map`'s existing tree fixture unchanged (same
`Frontend > Meta-frameworks > {Next.js, Nuxt.js}` + `Backend` shape, same node ids returned via
`DomainMapFixtureNodeIds`). No structural change to that fixture — `target_depth` is simply
`null` on every node it creates, matching the new column's own default-free nullability, so the
fixture needs zero edits to keep working for this plan's scenarios.

## New fixture: `seedPendingPrioritySuggestion`

A new test-support helper (`features/domain-map/seeds/seed-pending-priority-suggestion.ts`,
proposed shape for `/implement-playwright` to author) that inserts one
`domain_priority_suggestions` row directly via SQL (back door — no UI path creates a suggestion
row except a live agent call, which S6/S7/S9 deliberately avoid to keep those scenarios focused on
accept/reject/due-banner behavior, not review-triggering):

```ts
async function seedPendingPrioritySuggestion(params: {
  domainNodeId: string
  subjectId: string
  suggestedTargetDepth: 'awareness' | 'working' | 'deep'
  currentTargetDepth?: 'awareness' | 'working' | 'deep' | null
  createdAt?: Date  // defaults to now(); S9 passes a 45-days-ago Date
}): Promise<{ suggestionId: string }>
```

## Per-scenario state contract

### S3 — Setting a target depth

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` (existing, unchanged)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row | fresh, via `createSubject` in-test | scenery | front-door helper (existing) |
  | `domain_nodes` (5 rows: Frontend, Meta-frameworks, Next.js, Nuxt.js, Backend) | `target_depth: null` on all | scenery | `seedDomainMapFixture` |
  | `curricula` + `topics` attached to Next.js | non-zero studied maturity (reused from seed-knowledge-map's own S8 shape) | scenery | existing fixture extension |
  | **The target-depth PATCH itself** | `nodeId: <Next.js id>`, `targetDepth: "deep"` | **subject** | driven via `setNodeTargetDepth` action (real UI click) |

- **Mutations the scenario makes:** one `UPDATE domain_nodes SET target_depth = 'deep' WHERE id =
  <next.js id>` via the real PATCH endpoint (not seeded).

---

### S5 — Triggering a review

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` (existing); mock-openrouter's new
  `domain-priority-review` responder (fixed 2-suggestion payload)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` + `domain_nodes` tree | zero pre-existing `domain_priority_suggestions` rows for the subject | scenery | `seedDomainMapFixture` |
  | mocked agent response | 2 suggestions, each with a `nodePath` matching a real seeded node name | scenery | mock-openrouter responder |
  | **The review trigger + resulting suggestion list rendered** | via `triggerPriorityReview` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** inserts 2 `domain_priority_suggestions` rows via the real
  endpoint.

---

### S6 — Accepting a suggestion

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedPendingPrioritySuggestion` (proposed-new)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | Next.js `target_depth: null` | scenery | `seedDomainMapFixture` |
  | `domain_priority_suggestions` row | `domain_node_id: <Next.js>`, `suggested_target_depth: "deep"`, `status: "pending"` | scenery | `seedPendingPrioritySuggestion` |
  | **The accept action + resulting node state** | via `resolveSuggestion({decision: 'accept'})` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** `UPDATE domain_nodes SET target_depth = 'deep'` +
  `UPDATE domain_priority_suggestions SET status = 'accepted', resolved_at = now()` — both via the
  real PATCH endpoint, asserted via a follow-up `openDomainMapPage` read.

---

### S7 — Rejecting a suggestion

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedPendingPrioritySuggestion` (proposed-new,
  called with `currentTargetDepth: "working"` this time — the node already has a target set)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | target node's `target_depth: "working"` (pre-set) | scenery | `seedDomainMapFixture` + a direct SQL update in the test's own setup |
  | `domain_priority_suggestions` row | `status: "pending"`, `suggested_target_depth: "deep"` | scenery | `seedPendingPrioritySuggestion` |
  | **The reject action + the negative assertion that target_depth is unchanged** | via `resolveSuggestion({decision: 'reject'})` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** `UPDATE domain_priority_suggestions SET status = 'rejected',
  resolved_at = now()` only — the test asserts `domain_nodes.target_depth` is still `"working"`
  afterward (negative assertion, not just "no error").

---

### S9 — Review-due indicator

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedPendingPrioritySuggestion` (proposed-new,
  called with `createdAt: <45 days ago>`); mock-openrouter's `domain-priority-review` responder
  (reused from S5) for the fresh trigger half of the scenario
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | any shape | scenery | `seedDomainMapFixture` |
  | `domain_priority_suggestions` row | `created_at`: 45 days before test run time | scenery | `seedPendingPrioritySuggestion` |
  | **The due-banner's presence, then its clearing after a fresh trigger** | via `openPriorityReviewPage` (assert banner visible) then `triggerPriorityReview` then reload (assert banner gone) | **subject** | driven via real UI |

- **Mutations the scenario makes:** inserts fresh `domain_priority_suggestions` rows via the
  trigger endpoint, which is what flips the derived `getLastReviewedAt()` value.

## State suites

None — every scenario in this plan is independently seeded and strictly isolated; no scenario
depends on another's prior mutation.

## Forbidden mutations

Not applicable — this project has no `read-only-mathaul-dev`-equivalent target; the local e2e
Postgres is fully mutable by design.

## Open questions

- Carried from `scenarios.md` SCENARIO 4: the `domain-priority-review` agent's instructions must
  guarantee at least one suggestion-shaped row per trigger (even a "no changes recommended"
  acknowledgment) so `getLastReviewedAt()` always has a fresh timestamp to derive from after a
  successful trigger — needed for S9's "clears after trigger" assertion to be meaningful even in
  the pathological case of a trigger that finds nothing worth suggesting.
