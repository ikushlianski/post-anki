---
type: playwright
branch: domain-priority-review
task: domain-priority-review
state: confirmed
target-project: post-anki
target-feature: features/domain-map
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Per-domain expertise priority + monthly re-prioritization review

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — Every domain node can be told how much it matters, independent of how much of it is
  already known — closing the gap between "should be an expert here" and "actually 20% in" is now
  a visible, settable target rather than an unstated intention. → S3
- B2 — Once a month (or whenever the user chooses), the app proposes which domains' priorities
  might be stale, with a plain-language reason for each — the user never has to notice technology
  drift on their own. → S5
- B3 — Every suggestion is honestly labeled as general-knowledge reasoning, not real trend data —
  so when the doc-scan and job-market items land later, their suggestions will read as visibly
  more grounded, not silently swapped in. → S5
- B4 — Accepting or rejecting a suggestion is a real, recorded decision — nothing is silently
  applied or silently discarded. → S6, S7

**UX scenarios**
- U1 — Setting a node's target depth on the domain map updates its priority-distance badge
  immediately, no reload. → S3
- U2 — Clicking "trigger review" on the priority-review screen shows a loading state, then a list
  of suggestions with reasons. → S5
- U3 — Accepting a suggestion updates the node's target depth, visible back on the map. → S6
- U4 — Rejecting a suggestion removes it from "pending" without touching the node. → S7
- U5 — A subject that hasn't been reviewed in 30+ days shows a "review due" banner that clears
  after a fresh trigger. → S9

**Not e2e (verified at unit/integration only)**
- S1 (`domainPriorityDistance` null/zero-floor behavior) — pure arithmetic, no UI/DB surface;
  covered by `packages/core/src/domain-map/domain-priority.test.ts`.
- S2 (`isDomainPriorityReviewDue` threshold behavior) — pure date arithmetic, no UI/DB surface;
  covered by `packages/core/src/domain-map/domain-priority-review-due.test.ts`.
- S4 (review-trigger persistence + exactly-once agent call), S8 (agent-failure error path) —
  exercised against a mocked agent at the orchestrator layer
  (`domain-priority-review.orchestrator.test.ts`); the mocked-agent-call-count assertion and the
  502-propagation assertion are both more precisely and more cheaply proven at this layer than
  through a full browser round-trip. S5/S6/S7/S9 still prove the same mechanism end-to-end through
  the UI with a single mocked response each.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/domain-map/` (same folder `seed-knowledge-map` created — extended, not
  forked; this plan's scenarios are a natural continuation of the same feature surface)
- Target DB: `post-anki-e2e` (local docker postgres, `localhost:5436`)
- Dev server URL: `http://localhost:3100`

## Action surface — snapshot (existing, from `seed-knowledge-map`)

- `openDomainMapPage({ page, subjectId })` — navigates to `/subject/:id/map`, waits for
  `domain-map-tree` testid.
- `createCurriculumByName`, `addCourseUnderNode`, `changePlacement` — not composed by this plan's
  scenarios (they exercise placement, not priority).

## Action gaps (new, this plan)

- `setNodeTargetDepth({ page, nodeId, depth })` — clicks the new target-depth control's `<depth>`
  option for the given node; waits for the priority-distance badge to update. Params:
  `{ page: Page, nodeId: string, depth: 'awareness' | 'working' | 'deep' }`. Result: `void`
  (assertion happens in the test via the badge's testid).
- `openPriorityReviewPage({ page, subjectId })` — navigates to `/subject/:id/priority-review`,
  waits for the review panel's root testid. Mirrors `openDomainMapPage`'s shape exactly.
- `triggerPriorityReview({ page })` — clicks "trigger review", waits for either the suggestion
  list or the error state to render (both are valid terminal states — S5 asserts the success one,
  S8 is covered at the orchestrator layer, not through this action). Result: `void`.
- `resolveSuggestion({ page, suggestionId, decision })` — clicks accept/reject on a specific
  suggestion row, waits for it to leave the pending list. Params: `{ page: Page, suggestionId:
  string, decision: 'accept' | 'reject' }`.

## Scenario → action + state + testid map

### S3 — Setting a target depth updates the priority-distance badge live

**Composes actions:** `openDomainMapPage`
**Action gaps:** `setNodeTargetDepth` (new — see above)
**Pre-test state:** additive-seed, reuses `seed-knowledge-map`'s existing
`seedDomainMapFixture` (extends it — see `state-fixtures.md`)
**Required `data-testid` attributes:**
- `domain-map-node-target-depth-<nodeId>` — the target-depth control's root
- `domain-map-node-target-depth-option-<nodeId>-<depth>` — each of the 3 clickable options
- `domain-map-node-priority-distance-<nodeId>` — the new badge next to the existing
  `domain-map-node-percent-<nodeId>`
**Fixture variants:** none — reuses the existing tree fixture, extended with one attached
curriculum on `Next.js` for a known non-zero percent (already exists in `seed-knowledge-map`'s
fixture per its own S8 comment).
**Vision check candidate:** no.

---

### S5 — Triggering a review surfaces suggestions with reason + unsourced label

**Composes actions:** `openPriorityReviewPage`, `triggerPriorityReview`
**Action gaps:** both listed above
**Pre-test state:** additive-seed (tree fixture, zero pre-existing suggestions), plus a mocked
`domain-priority-review` responder in `mock-openrouter` returning a fixed 2-suggestion payload
**Required `data-testid` attributes:**
- `priority-review-panel` — root
- `priority-review-trigger-button`
- `priority-review-suggestion-<id>` — each suggestion row
- `priority-review-suggestion-reason-<id>`
- `priority-review-suggestion-source-<id>` — the "general knowledge" label
**Fixture variants:** `domain-priority-review-two-suggestions` (mock-openrouter responder, new)
**Vision check candidate:** no.

---

### S6 — Accepting a suggestion writes the node's target depth

**Composes actions:** `openPriorityReviewPage`, `resolveSuggestion`, `openDomainMapPage` (to
verify the node afterward)
**Action gaps:** `resolveSuggestion` (see above)
**Pre-test state:** additive-seed — one pre-seeded pending suggestion row (back-door SQL, not via
a live agent call — see `state-fixtures.md`)
**Required `data-testid` attributes:**
- `priority-review-suggestion-accept-<id>`
**Fixture variants:** none (reuses S5's testids for the row, S3's for the badge check)
**Vision check candidate:** no.

---

### S7 — Rejecting a suggestion leaves the node untouched, recorded not deleted

**Composes actions:** `openPriorityReviewPage`, `resolveSuggestion`
**Action gaps:** shares `resolveSuggestion` with S6
**Pre-test state:** additive-seed — one pre-seeded pending suggestion on a node that already has
`target_depth: "working"` set (proves rejection leaves an existing value alone, not just "doesn't
set a null")
**Required `data-testid` attributes:**
- `priority-review-suggestion-reject-<id>`
**Fixture variants:** none.
**Vision check candidate:** no.

---

### S9 — "Review due" indicator reflects the 30-day threshold

**Composes actions:** `openPriorityReviewPage`, `triggerPriorityReview`
**Action gaps:** none beyond what S5 already lists
**Pre-test state:** additive-seed — one suggestion row with `created_at` back-dated 45 days (SQL
seed, sets the timestamp explicitly — no UI path can backdate a row)
**Required `data-testid` attributes:**
- `priority-review-due-banner`
**Fixture variants:** reuses S5's mock-openrouter responder for the fresh trigger.
**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `setNodeTargetDepth` | S3 | No — single-scenario, low reuse likelihood |
| `openPriorityReviewPage` | S5, S6, S7, S9 | No — mirrors existing `openDomainMapPage`, not a new pattern |
| `triggerPriorityReview` | S5, S9 | No |
| `resolveSuggestion` | S6, S7 | No |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S3 | additive-seed | extends existing `seedDomainMapFixture` |
| S5 | additive-seed | zero pre-existing suggestions; mocked agent response |
| S6 | additive-seed | one pre-seeded pending suggestion |
| S7 | additive-seed | one pre-seeded pending suggestion + pre-set target_depth |
| S9 | additive-seed | one suggestion row with backdated `created_at` |

## Open questions

- SCENARIO 4's "0-suggestion review still needs a due-timestamp trace" resolution (agent always
  returns at least a no-change acknowledgment row) needs to be encoded into the
  `domain-priority-review` agent's instructions during implementation — carried from
  `scenarios.md` SCENARIO 4.
