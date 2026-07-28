---
type: state-fixtures
branch: doc-changelog-scan
task: doc-changelog-scan
state: confirmed
target-project: post-anki
target-feature: features/domain-map
local-db-inspected-at: 2026-07-28 (schema/code inspection only — see note below)
existing-state-mocks-snapshot: [seedDomainMapFixture, seedStudiedCurriculumUnderNode (both features/domain-map/seeds/seed-domain-map-fixture.ts)]
proposed-new-state-mocks: [seedPendingDomainTopicSuggestion, seedPendingDomainSupersessionSuggestion]
updated: 2026-07-28
---

# State fixtures — Periodic doc/changelog scan

## Note on scope

Same Postgres-only divergence from the base template already documented by
`domain-priority-review/state-fixtures.md` in this same worktree — no Neo4j, no state-mock
TypeScript library in the framework's original sense. The equivalent contract: what does each
scenario need in the local e2e Postgres before it runs, produced via front-door UI action (subject)
vs. back-door seed (scenery).

Two proof mechanisms are in play:
- **The e2e Postgres via Playwright** (`localhost:5436`) — SCENARIOS 5, 6, 7, 8, 9, via the
  standard `dev:pw` orchestration.
- **The same e2e Postgres, driven directly by vitest** — SCENARIOS 1, 2, 3, 4, 10's
  backend/orchestrator tests (source-repo tests, not verification-repo Playwright tests —
  documented for completeness per `spec.md`'s Definition of Done, not run by `/review-playwright`).

## Reused fixtures

`seedDomainMapFixture(subjectId)` and `seedStudiedCurriculumUnderNode(...)` — both unchanged. The
two new nullable columns on `domain_nodes` (`superseded_at`, `superseded_reason`) default to `null`
on every row this fixture creates, matching their default-free nullability — zero edits needed.

## New fixture: `seedPendingDomainTopicSuggestion`

New test-support helper (`features/domain-map/seeds/seed-pending-domain-topic-suggestion.ts`,
proposed shape for `/implement-playwright` to author) — back door, since the only front door into
`domain_topic_suggestions` is a live scan (S5 deliberately avoids depending on that to keep S6/S7
focused on accept/reject, same posture item 7 took for its own accept/reject scenarios):

```ts
async function seedPendingDomainTopicSuggestion(params: {
  subjectId: string
  proposedParentNodeId: string | null
  proposedNodeName: string
  reason?: string
}): Promise<{ suggestionId: string }>
```

## New fixture: `seedPendingDomainSupersessionSuggestion`

Same rationale, for the other new table:

```ts
async function seedPendingDomainSupersessionSuggestion(params: {
  subjectId: string
  domainNodeId: string
  reason?: string
}): Promise<{ suggestionId: string }>
```

## Per-scenario state contract

### S5 — "Scan now" surfaces both suggestion kinds

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` (existing, unchanged); the test env sets
  `E2E_MOCK_TRACKED_TOOL_CONTENT` (resolved mechanism, `spec.md`'s Fetch mechanism section — the
  new piece this feature needs beyond what item 7 required, since item 7 never made an outbound
  HTTP call); mock-openrouter's new `doc-scan` responder
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity / mock | Key properties | Setup role | Source |
  |---|---|---|---|
  | `subjects` row | fresh, via `createSubject` in-test | scenery | front-door helper (existing) |
  | `domain_nodes` tree (5 rows) | zero pre-existing `tracked_tool_scan_state` rows (first scan) | scenery | `seedDomainMapFixture` |
  | mocked tool-fetch content | fixed distinct content per `tool_key`, all 4 "new" (no watermark) | scenery | `E2E_MOCK_TRACKED_TOOL_CONTENT` env var |
  | mocked agent response | 1 new-topic suggestion (parent path → real seeded "Frontend"), 1 supersession suggestion (path → real seeded "Next.js") | scenery | mock-openrouter's `doc-scan` responder |
  | **The "Scan now" click and rendered suggestion lists** | via `triggerDocScan` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** inserts 1 `domain_topic_suggestions` row + 1
  `domain_supersession_suggestions` row + 4 `tracked_tool_scan_state` rows via the real endpoint.

---

### S6 — Accepting a new-topic suggestion

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedPendingDomainTopicSuggestion`
  (proposed-new, `proposedParentNodeId`: the seeded "Frontend" node's id, `proposedNodeName`:
  `"Astro"`)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | includes "Frontend" | scenery | `seedDomainMapFixture` |
  | `domain_topic_suggestions` row | `status: "pending"`, `proposed_node_name: "Astro"` | scenery | `seedPendingDomainTopicSuggestion` |
  | **The accept action + resulting new node** | via `resolveDocScanSuggestion({kind:'topic', decision:'accept'})` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** `INSERT domain_nodes` (new "Astro" node, `parent_id` =
  Frontend's id) + `UPDATE domain_topic_suggestions SET status='accepted', resolved_at=now(),
  created_domain_node_id=<new id>` — both via the real PATCH endpoint, asserted via a follow-up
  `openDomainMapPage` read.

---

### S7 — Rejecting a new-topic suggestion

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedPendingDomainTopicSuggestion`
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | includes "Frontend"; row count noted before the action | scenery | `seedDomainMapFixture` |
  | `domain_topic_suggestions` row | `status: "pending"` | scenery | `seedPendingDomainTopicSuggestion` |
  | **The reject action + the negative assertion that no node was created** | via `resolveDocScanSuggestion({kind:'topic', decision:'reject'})` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** `UPDATE domain_topic_suggestions SET status='rejected',
  resolved_at=now()` only — the test asserts `domain_nodes` row count for the subject is unchanged
  afterward (negative assertion, not just "no error").

---

### S8 — Accepting a supersession suggestion

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedStudiedCurriculumUnderNode` (attached to
  "Next.js", giving it a real non-zero percent) + `seedPendingDomainSupersessionSuggestion`
  (proposed-new, `domainNodeId`: Next.js's id)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | "Next.js" has a real non-zero `percent` (via attached curriculum) and `superseded_at: null` | scenery | `seedDomainMapFixture` + `seedStudiedCurriculumUnderNode` |
  | `domain_supersession_suggestions` row | `status: "pending"`, `domain_node_id`: Next.js's id | scenery | `seedPendingDomainSupersessionSuggestion` |
  | **The accept action + resulting flag, percent unchanged** | via `resolveDocScanSuggestion({kind:'supersession', decision:'accept'})` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** `UPDATE domain_nodes SET superseded_at=now(),
  superseded_reason=<reason>` + `UPDATE domain_supersession_suggestions SET status='accepted',
  resolved_at=now()` — both via the real PATCH endpoint. The test additionally asserts, via a
  follow-up `GET /subjects/:id/domain-map`, that Next.js's `percent` is byte-identical to its
  value from the initial seed (the negative assertion proving Decisions #2).

---

### S9 — Rejecting a supersession suggestion

- **State source:** `additive-seed`
- **State mocks applied:** `seedDomainMapFixture` + `seedStudiedCurriculumUnderNode` +
  `seedPendingDomainSupersessionSuggestion`
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Setup role | Source |
  |---|---|---|---|
  | `domain_nodes` tree | "Next.js" `superseded_at: null` before the action | scenery | `seedDomainMapFixture` + `seedStudiedCurriculumUnderNode` |
  | `domain_supersession_suggestions` row | `status: "pending"` | scenery | `seedPendingDomainSupersessionSuggestion` |
  | **The reject action + the negative assertion that no flag was set** | via `resolveDocScanSuggestion({kind:'supersession', decision:'reject'})` | **subject** | driven via real UI click |

- **Mutations the scenario makes:** `UPDATE domain_supersession_suggestions SET
  status='rejected', resolved_at=now()` only — the test asserts `domain_nodes.superseded_at` is
  still `null` for that node afterward.

## State suites

None — every scenario in this plan is independently seeded and strictly isolated; no scenario
depends on another's prior mutation.

## Forbidden mutations

Not applicable — this project has no `read-only-mathaul-dev`-equivalent target; the local e2e
Postgres is fully mutable by design.

## Open questions

- Carried from `spec.md`/`playwright.md`: the `doc-scan` mock-openrouter responder's payload shape
  must be confirmed against the real `docScanAgentResultSchema` once authored, not assumed from
  this plan's description alone. (The outbound-tool-fetch mock itself,
  `E2E_MOCK_TRACKED_TOOL_CONTENT`, is a resolved mechanism per `spec.md`'s Fetch mechanism section,
  not an open question.)
