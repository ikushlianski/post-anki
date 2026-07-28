---
type: scenarios
branch: domain-priority-review
task: Per-domain expertise priority, with a monthly re-prioritization review (issue #52)
state: confirmed
updated: 2026-07-28
---

# Scenarios: Per-domain expertise priority, with a monthly re-prioritization review

## SCENARIO 1 — Priority distance is null when no target is set, floored at zero when exceeded

A pure-logic scenario, no UI/integration surface — vitest only.

**Behavior:**
- `domainPriorityDistance(targetDepth, percent)`:
  - `targetDepth: null` → returns `null` (no target set — must be visually distinguishable from
    "on track", which is `0`).
  - `targetDepth: "working"`, `percent: 40` → returns `20` (`DEPTH_TARGET_PERCENT.working` (60) −
    40).
  - `targetDepth: "awareness"`, `percent: 90` → returns `0` (floored — never negative; exceeding
    the target is not a "negative distance").
  - `targetDepth: "deep"`, `percent: 0` → returns `100`.

**Acceptance:**
```
Code:
  - packages/core/src/domain-map/domain-priority.ts exports domainPriorityDistance(targetDepth:
    DepthLevel | null, percent: number): number | null
  - Input shapes: targetDepth ∈ {null, "awareness", "working", "deep"}; percent ∈ [0, 100] integer
  - Output shapes: null | number in [0, 100]
  - Edge cases: null targetDepth; percent === target percent exactly (→ 0); percent > target
    percent (→ 0, not negative); percent === 0
Behavior: as described above
Integration: None
Observability: None
Tests:
  [ ] packages/core/src/domain-map/domain-priority.test.ts covers all 4 cases above plus the
      exact-match boundary (percent === DEPTH_TARGET_PERCENT[targetDepth] → 0)
```

---

## SCENARIO 2 — Review-due threshold is a pure 30-day wall-clock check

Pure-logic scenario, no UI/integration surface — vitest only.

**Behavior:**
- `isDomainPriorityReviewDue(lastReviewedAt, now, thresholdDays = 30)`:
  - `lastReviewedAt: null` → `true` regardless of `now` (never reviewed).
  - `lastReviewedAt` exactly 29 days before `now` → `false`.
  - `lastReviewedAt` exactly 30 days before `now` → `true` (boundary is inclusive).
  - `lastReviewedAt` 45 days before `now` → `true`.

**Acceptance:**
```
Code:
  - packages/core/src/domain-map/domain-priority-review-due.ts exports
    isDomainPriorityReviewDue(lastReviewedAt: string | null, now: Date, thresholdDays?: number):
    boolean
  - Input shapes: lastReviewedAt is an ISO string or null; now is a real Date passed by the
    caller, never read internally via Date.now()
  - Output shapes: boolean
  - Edge cases: null; exactly at threshold; one day under threshold; far past threshold
Behavior: as described above
Integration: None
Observability: None
Tests:
  [ ] packages/core/src/domain-map/domain-priority-review-due.test.ts covers all 4 cases with
      fixed Date fixtures (no wall-clock read inside the test)
```

---

## SCENARIO 3 — Setting a target depth on a domain node persists and updates the priority-distance badge live

**Narrative:** The user opens the domain map for "Programming / Web Development", finds the
"Next.js" node, and sets its target depth to "deep" using the new target-depth control. The
priority-distance badge next to the percent badge updates immediately to reflect the new distance,
without a page reload.

**Concrete initial state:** Subject "Programming / Web Development" (fresh, created via
`createSubject` in-test) with a domain tree containing at minimum `Frontend > Meta-frameworks >
Next.js` (percent: some known non-zero value from a seeded, studied curriculum attached to it —
reuses `seed-knowledge-map`'s `S8` state shape). `Next.js`'s `target_depth` starts `null`.

**Setup role:** Subject = scenery (seeded fresh per test via `createSubject`, back door). The
domain tree nodes = scenery (seeded via the shared `seedDomainMapFixture` helper, back door — same
one `seed-knowledge-map` already uses). The **act of setting the target depth** = subject (driven
through the real UI control — this is the one thing SCENARIO 3 verifies).

**UI clicking notes:** Clicking the target-depth control's "Deep" option is a single click (no
confirmation modal — this is a low-stakes, instantly-reversible setting, same posture as the
existing `DepthSlider` for curricula). Success indicator: the priority-distance badge's text
content changes in place (React state update from the mutation response), no toast, no full page
re-fetch required. Failure path: if the PATCH fails, the control reverts to its previous value and
a small inline error message appears next to it (no full-page error state — this is a low-stakes
setting, not a blocking flow).

**Acceptance:**
```
Code:
  - apps/web/src/domain-map/target-depth-control.tsx: 3-option control (awareness/working/deep)
    against @post-anki/shared's depthLevelSchema; onChange calls updateDomainNodeTargetDepth(id,
    value) then re-renders from the response
  - apps/api/src/domain-map/domain-map.controller.ts: handleUpdateDomainNode validates body via
    a new updateDomainNodeInput (targetDepth: depthLevelSchema.nullable()), calls
    updateDomainNodeTargetDepth(nodeId, targetDepth), returns the updated node
  - Input shapes: PATCH /domain-nodes/:id body { targetDepth: "awareness" | "working" | "deep" |
    null }
  - Output shapes: 200 with the updated DomainNode-shaped JSON; 404 if the node doesn't exist
  - Edge cases: setting targetDepth back to null (clearing it) is allowed and supported
Behavior:
  - Setting a target depth on a node with a real percent immediately produces a non-null
    priority-distance value matching domainPriorityDistance(targetDepth, percent) exactly
Integration:
  - GET /subjects/:id/domain-map after the PATCH reflects the new target_depth and recomputed
    priorityDistance on the correct node, unchanged on every sibling node
Observability: None
Tests:
  [x] @domain-priority-review.S3 — e2e test written
```

---

## SCENARIO 4 — Triggering a review with zero existing target depths still succeeds, exactly one agent call

**Narrative:** A subject's tree has never had a target depth set anywhere. The user (or, at the
vitest/orchestrator layer, a direct call) triggers a review. The system still calls the agent once
with the full tree (all target depths shown as "unset") and persists whatever suggestions come
back.

**Concrete initial state:** Same tree shape as SCENARIO 3's fixture, all nodes' `target_depth`
null, zero pre-existing `domain_priority_suggestions` rows for the subject.

**Setup role:** Subject + tree = scenery (seeded). The mocked agent response = scenery (mocked via
`mock-openrouter`'s new `domain-priority-review` responder returning a fixed 2-suggestion payload).
The **review trigger itself and its resulting rows** = subject (what this scenario verifies).

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/domain-priority-review.orchestrator.ts:
    triggerDomainPriorityReview(subjectId) — loads tree via getDomainMapForSubject (unchanged),
    builds one prompt line per node (name, path, current target depth or "unset", percent), calls
    the domain-priority-review agent exactly once, resolves each returned nodePath via
    domain-node-name-resolver.ts, inserts one domain_priority_suggestions row per resolved
    suggestion (dropping unresolved paths silently)
  - Input shapes: subjectId: string
  - Output shapes: DomainPrioritySuggestion[] (the freshly inserted rows)
  - Edge cases: agent returns a suggestion whose nodePath doesn't resolve to a real node → dropped,
    not inserted, not thrown; agent returns 0 suggestions → 0 rows inserted, call still counted as
    "reviewed" (updates the derived last-reviewed timestamp via the rows' own created_at — if 0
    rows, review-due logic falls back to a separate lightweight review-attempt marker; see Open
    Questions)
Behavior:
  - Exactly one call to the mocked agent per trigger, verified via call-count assertion
  - Every inserted row has source: "general-knowledge", status: "pending",
    current_target_depth: null (snapshotting the pre-review value, which was unset)
Integration:
  - Real SELECT against domain_priority_suggestions after the call returns exactly the expected
    row count with the expected field values
Observability: None
Tests:
  [ ] apps/api/src/domain-map/domain-priority-review.orchestrator.test.ts covers: 2-suggestion
      mocked response → 2 rows inserted with correct fields; a suggestion with an unresolvable
      nodePath → dropped, not inserted; agent called exactly once (mock call-count assertion)
```

**Open question carried to `/write-playwright-tests` / `/implement-playwright`:** if a review
returns 0 suggestions, `MAX(created_at)` over 0 rows for the subject means "review due" cannot be
derived from suggestion rows alone. Resolution (default, not re-litigated): insert a lightweight
"review attempt" marker row even when 0 suggestions are returned would reintroduce a table this
plan chose not to build (Decisions #6) — cheaper fix is to require the agent to always return at
least a "no changes recommended" acknowledgment as one suggestion-shaped row with
`suggestedTargetDepth` equal to `currentTargetDepth` and a `reason` explaining why, which
naturally produces a row every trigger. State this constraint explicitly in the agent's
instructions during implementation.

---

## SCENARIO 5 — Triggering a review surfaces suggestions with reason text and an unsourced label

**Narrative:** The user opens `/subject/:subjectId/priority-review`, sees a "review due" banner
(first-ever review for this subject), clicks "trigger review". After a short loading state, the
returned suggestions render as a list, each with the node name, current vs. suggested depth, a
short reason, and a visible "general knowledge — not grounded in real trend data" label.

**Concrete initial state:** Same as SCENARIO 4 (never reviewed).

**Setup role:** Subject + tree = scenery. Agent response = scenery (mocked). The **review trigger
through the UI and the rendered suggestion list** = subject.

**UI clicking notes:** Clicking "trigger review" disables the button and shows a small inline
spinner (this is a real, potentially multi-second LLM call — a blocking full-page spinner would be
wrong for a page that also shows prior suggestions). On success, the button re-enables and the new
suggestions animate/appear at the top of the list. On failure (SCENARIO 8), an inline error message
appears in place of the spinner and the button re-enables for retry.

**Acceptance:**
```
Code:
  - apps/web/src/domain-map/priority-review-panel.tsx: "trigger review" button calls
    triggerDomainPriorityReview(subjectId); renders returned suggestions list; each item shows
    reason text and a static "general knowledge — unsourced" label string
  - apps/api/src/domain-map/domain-map.controller.ts: handleTriggerDomainPriorityReview,
    handleListPrioritySuggestions (GET /subjects/:id/domain-priority-suggestions?status=pending)
Behavior:
  - Every rendered suggestion shows: node name, current target depth (or "unset"), suggested
    target depth, reason text, source label
Integration:
  - The list rendered immediately after triggering matches exactly the rows returned by
    GET /subjects/:id/domain-priority-suggestions?status=pending on a fresh page load
Observability: None
Tests:
  [x] @domain-priority-review.S5 — e2e test written
```

---

## SCENARIO 6 — Accepting a suggestion writes the target depth onto the node

**Narrative:** From the pending-suggestions list, the user clicks "accept" on the "Next.js →
deep" suggestion. The suggestion moves out of the pending list. Navigating to the domain map shows
Next.js's target depth is now "deep".

**Concrete initial state:** One pre-seeded pending suggestion (`Next.js`, `current_target_depth:
null`, `suggested_target_depth: "deep"`, `status: "pending"`) via back-door seed (not produced
through a live agent call — SCENARIO 6 verifies accept/reject, not review-triggering, so seeding
the suggestion directly keeps the test focused and fast).

**Setup role:** Subject + tree + the pending suggestion = scenery (seeded). The **accept action and
its effect on the node** = subject.

**UI clicking notes:** Clicking "accept" is a single click, no confirmation modal (reversible —
the user can always set a different target depth by hand afterward). Success indicator: the
suggestion row disappears from the pending list (optimistic or re-fetch, implementer's choice,
verified by the resulting DOM state either way) and a brief inline confirmation ("applied to
Next.js") appears.

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/domain-map.controller.ts: handleResolvePrioritySuggestion validates
    { status: "accepted" | "rejected" }, calls resolvePrioritySuggestion(id, status) which — for
    "accepted" — updates the domain_node's target_depth AND the suggestion's status/resolved_at
    in one transaction
  - Input shapes: PATCH /domain-priority-suggestions/:id body { status: "accepted" }
  - Output shapes: 200 with the updated suggestion; 404 if the suggestion doesn't exist
Behavior:
  - Accepting writes suggested_target_depth onto domain_nodes.target_depth for that node
Integration:
  - GET /subjects/:id/domain-map after accept shows the node's new target_depth and recomputed
    priorityDistance
Observability: None
Tests:
  [x] @domain-priority-review.S6 — e2e test written
```

---

## SCENARIO 7 — Rejecting a suggestion leaves the node's target depth unchanged and is recorded, not deleted

**Narrative:** From the pending-suggestions list, the user clicks "reject" on a suggestion. It
disappears from "pending". The node's target depth is provably unchanged. The suggestion is not
gone from the database — it's marked rejected.

**Concrete initial state:** Same shape as SCENARIO 6, one pending suggestion, but the target node
already has an existing `target_depth: "working"` (proves rejection genuinely leaves it alone,
rather than merely "not setting a null to something").

**Setup role:** Subject + tree + pending suggestion = scenery (seeded). The **reject action** =
subject.

**Acceptance:**
```
Code: (shares handleResolvePrioritySuggestion with SCENARIO 6 — status: "rejected" branch)
Behavior:
  - Rejecting sets status: "rejected", resolved_at: <timestamp>, and does NOT touch
    domain_nodes.target_depth
Integration:
  - Real SELECT on domain_nodes after reject shows target_depth === "working" (unchanged from
    before the action)
  - Real SELECT on domain_priority_suggestions after reject shows the row still exists with
    status: "rejected" (negative assertion: row count for the subject is unchanged, not
    decremented)
Observability: None
Tests:
  [x] @domain-priority-review.S7 — e2e test written
```

---

## SCENARIO 8 — Agent failure during a triggered review surfaces an error, never a silent no-op

Backend/vitest scenario (orchestrator + controller layer) — the deliberate divergence from
`domain-placement.orchestrator.ts`'s silent-fallback pattern (Decisions #10).

**Behavior:**
- Mocked `domain-priority-review` agent call rejects (simulated network error).
- `triggerDomainPriorityReview(subjectId)` propagates the error (does not swallow it, does not
  return an empty array).
- The controller path (`handleTriggerDomainPriorityReview`) catches it and responds `502` with a
  non-empty `message` field.
- Zero `domain_priority_suggestions` rows are inserted (verified via `SELECT`).

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/domain-priority-review.orchestrator.test.ts: mocked agent rejection →
    triggerDomainPriorityReview() throws
  - apps/api/src/domain-map/domain-map.controller.ts: handleTriggerDomainPriorityReview wraps the
    orchestrator call, catches, responds sendError(res, 502, "review_failed", <message>)
  - Input shapes: same trigger endpoint as SCENARIO 4
  - Output shapes: 502 { error: "review_failed", message: string }
  - Edge cases: partial failure (agent returns malformed/schema-invalid JSON) is treated
    identically to a network failure — both surface as a thrown error, both produce 502, zero
    rows inserted (no partial-insert state)
Behavior: as described above
Integration:
  - Real SELECT on domain_priority_suggestions after the failed call returns 0 new rows for the
    subject
Observability: None
Tests:
  [ ] apps/api/src/domain-map/domain-priority-review.orchestrator.test.ts covers: agent rejects →
      orchestrator throws, 0 rows inserted; agent returns schema-invalid output → same outcome
```

---

## SCENARIO 9 — "Review due" indicator reflects the 30-day threshold and clears after a fresh trigger

**Narrative:** A subject's most recent suggestion is 45 days old. Opening the priority-review
screen shows a "review due" banner. The user triggers a review. Reloading the screen, the banner
is gone (the fresh review's timestamp is now the most recent).

**Concrete initial state:** One `domain_priority_suggestions` row for the subject with
`created_at` back-dated 45 days (back-door SQL seed — this is the one piece of state this feature
needs that can't come from driving the UI, since the UI has no way to backdate a timestamp).

**Setup role:** Subject + tree + the backdated suggestion row = scenery (seeded, including the
explicit backdated timestamp). The **due-banner rendering and its clearing after a real trigger** =
subject.

**Acceptance:**
```
Code:
  - apps/web/src/domain-map/priority-review-panel.tsx: renders a "review due" banner when
    GET /subjects/:id/domain-priority-suggestions (or a dedicated lightweight
    GET /subjects/:id/domain-priority-review-status) reports isDomainPriorityReviewDue(...) ===
    true
  - apps/api/src/domain-map/domain-map.repo.ts: getLastReviewedAt(subjectId) returns
    MAX(created_at) across domain_priority_suggestions for the subject, or null if none exist
Behavior:
  - lastReviewedAt 45 days old → due === true, banner visible
  - After a fresh trigger (SCENARIO 4/5's mechanism), lastReviewedAt is now "now" → due === false
Integration:
  - The due/not-due read is computed server-side from the same getLastReviewedAt() the review
    trigger itself updates by inserting new rows — no separate client-side timestamp bookkeeping
Observability: None
Tests:
  [x] @domain-priority-review.S9 — e2e test written
```
