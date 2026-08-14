---
type: scenarios
branch: 90-deepen-widen-recommendations
task: "Recommendation engine for adjacent knowledge — deepen or widen, accept/reject (#90)"
state: confirmed
updated: 2026-08-14
---

# Scenarios: A structural deepen/widen recommender over the static taxonomy (#90)

**31 acceptance criteria.**

**Proof mechanism.** Pure candidate computation in
`packages/core/src/domain-map/domain-recommendation.test.ts`, against hand-built
`DomainNodeTreeItem[]` fixtures covering the well-mastered/gap/area-exclusion boundaries. Backend
claim-first resolution and course-creation side effects in
`apps/api/src/domain-recommendation/domain-recommendation.orchestrator.test.ts` and
`.repo.test.ts`. One integration test seeded from the **real** `it-taxonomy.yaml` fixture (the
same one `seed-domain-taxonomy.integration.test.ts` already uses) with a realistic partial-mastery
scenario layered on top — this is the direct proof of the issue's own Done-when clause, not a
synthetic stand-in for it. Web rendering and accept/reject interaction as vitest + React Testing
Library tests in `apps/web/src/domain-recommendation/`, following the precedent set by
`priority-review-panel.test.tsx`.

## Master acceptance criteria list (30 items, each independently walkable)

**Pure logic — `packages/core/src/domain-map/domain-recommendation.ts`**

1. `computeDeepenCandidates` emits `{ domainNodeId: child.id, sourceNodeId: parent.id, axis:
   "deepen" }` for a child whose `domainMasteryStatus(percent) === "gap"` and `curricula.length
   === 0`, under a parent whose `percent >= WELL_MASTERED_THRESHOLD` (80).
2. `computeDeepenCandidates` excludes a child that already has `curricula.length > 0`, regardless
   of its `percent`.
3. `computeDeepenCandidates` excludes every child of a parent whose `percent < 80` — no candidate
   is produced from that parent at all.
4. `computeDeepenCandidates` excludes a candidate where either the parent or the child has `kind
   === "area"`.
5. `computeDeepenCandidates` returns at most `MAX_RECOMMENDATIONS_PER_AXIS` (5) candidates, sorted
   by descending `parent.percent`, when more than 5 qualify.
6. `computeWidenCandidates` only ever considers root-level nodes (`parentId === null`) — a
   qualifying non-root sibling pair produces no candidate.
7. `computeWidenCandidates` returns no candidates when every root has `curricula.length === 0`
   (nothing "active" to widen from).
8. `computeWidenCandidates` emits a candidate for each root where `domainMasteryStatus(percent)
   === "gap"` and `curricula.length === 0`, whenever at least one other root is active; its
   `sourceNodeId` is the single active root with the highest `percent`.
9. `computeWidenCandidates` returns at most 5 candidates, in stable tree order, when more than 5
   qualify.
10. `buildDeepenReason` and `buildWidenReason` interpolate only the source/target nodes' real
    `name` and `percent` values from the input tree — asserted by constructing the exact expected
    string from fixture data, never by pattern-matching a subset.

**Data model and suppression**

11. `domain_recommendations_subject_node_unique` is a true (non-partial) unique index on
    `(subject_id, domain_node_id)` — proven at the repo level with a raw second insert for a node
    that already has a row (bypassing the orchestrator's own existence check, which would
    otherwise mean the index path is never actually exercised) and asserting it violates the
    index, regardless of the existing row's status (`pending`, `accepted`, or `rejected`).
12. `domain_recommendations.status` defaults `"pending"`; the claim-first resolve clause is `WHERE
    status = 'pending'`, matching `domain_priority_suggestions`' vocabulary, not
    `curriculum_domain_node_mappings`' `'suggested'`.

**Orchestrator — trigger**

13. `triggerDomainRecommendations(subjectId)` returns `{ error: "no_domain_nodes" }` when the
    subject's tree is empty.
14. `triggerDomainRecommendations` returns `{ error: "not_taxonomy_backed" }` when the tree is
    non-empty but no node has `source === "static_taxonomy"`.
15. `triggerDomainRecommendations` inserts exactly one row per candidate returned by the pure
    functions, for a subject with no prior recommendation rows.
16. `triggerDomainRecommendations` inserts nothing for a candidate whose `(subjectId,
    domainNodeId)` already has a `pending` or `accepted` row — proven by running the trigger
    twice with no resolve in between (still-pending case) and once more after accepting one
    candidate (accepted case), asserting zero new rows for those nodes each time.
17. A real-taxonomy integration run — the actual `it-taxonomy.yaml` tree, seeded with one root
    domain at high mastery (a well-covered descendant chain) and at least one sibling root at 0%
    coverage — produces at least one `"deepen"` row and at least one `"widen"` row. This is the
    direct proof of the issue's Done-when: "a real run against the taxonomy + user mastery data
    produces at least one deepen suggestion and one widen suggestion."

**Orchestrator — resolve (accept/reject)**

18. `resolveDomainRecommendation(id, status)` returns `{ error: "not_found" }` for an id with no
    row.
19. `resolveDomainRecommendation` returns `{ error: "already_resolved" }` on a second call against
    a row already resolved by a first call — proven by asserting call order/count, not merely
    that both calls returned.
20. `resolveDomainRecommendation(id, "rejected")` sets `status: "rejected"` and `resolvedAt`, and
    performs **no** curriculum-creation call — asserted by a spy on `createCurriculum` recording
    zero invocations.
21. `resolveDomainRecommendation(id, "accepted")` calls `createCurriculum` with exactly `{
    subjectId, name: node.name, sources: [], researchTopic: node.name, domainNodeId: node.id,
    domainNodeSource: "manual" }` — proven by asserting the call's arguments, not just that a
    curriculum was created.
22. On accept, the created curriculum has an already-`confirmed` row in
    `curriculum_domain_node_mappings` for the target node — proven by reading that table after
    accept, not by re-asserting `createCurriculum`'s own internal behavior (already covered by
    that function's existing tests).
23. On accept, `domain_recommendations.created_curriculum_id` is set to the new curriculum's id,
    and the row `resolveDomainRecommendation` returns carries that same `createdCurriculumId` —
    no second lookup is required to learn it.
24. If `createCurriculum` returns `{ error: "subject_not_found" }` after the claim already
    succeeded, the row is released back to `status: "pending"` with `resolvedAt` cleared (via
    `releaseRecommendationClaim`, the same recovery `approveMiniCourseRecommendation` uses on the
    identical failure) — never left stuck `"accepted"` with a null `createdCurriculumId`.
25. **Reject never resurfaces the same node, including across axes.** After rejecting a `"widen"`
    recommendation for root domain X, a later run where a *different* root domain becomes the
    highest-percent active one (making X newly eligible as the widen target again under the
    unchanged rule) inserts no new row for X. This is the direct proof of the issue's Done-when:
    "reject never resurfaces the same node — proven by a test."

**API contract**

26. `POST /subjects/:id/domain-recommendations` triggers and returns the inserted rows.
27. `GET /subjects/:id/domain-recommendations?status=pending` lists rows filtered by status,
    newest first, each carrying `createdCurriculumId` (null unless resolved `"accepted"`).
28. `PATCH /domain-recommendations/:id` resolves, body `{ status: "accepted" | "rejected" }`,
    returning the updated row (including `createdCurriculumId` on accept) on success, and `409`
    with the specific error code on `not_found`/`already_resolved`.

**Web**

29. `RecommendationPanel` renders one entry per pending recommendation, each carrying an axis
    badge (`Deepen` / `Widen`), the stored `reason` text verbatim, and Accept/Reject buttons.
30. Clicking Accept calls the resolve endpoint with `"accepted"`, removes the item from the list on
    success, and shows a confirmation naming the newly created curriculum with a link built from
    the response's `createdCurriculumId`.
31. Clicking Reject calls the resolve endpoint with `"rejected"`, removes the item from the list on
    success, and shows no confirmation — mirroring `PriorityReviewPanel.resolve()`'s own
    accept-only-confirms behavior. A second click on either button before the first request
    resolves is a no-op, guarded by `useResolvingSuggestions`.

---

## SCENARIO 1 — A learner who has mastered one branch gets a concrete "go deeper" suggestion

**Given** a taxonomy-backed subject where "TCP/IP" sits at 92% mastery (a curriculum exists and is
mostly complete) and its child "DNS" has no curriculum mapped to it anywhere
**When** the recommendation review page triggers a run
**Then** a `"deepen"` recommendation appears naming DNS, with reason text quoting TCP/IP's real
92% and DNS's own name — not a paraphrase, not a generic template.

*Covers 1, 5, 10, 15, 17, 29.*

## SCENARIO 2 — Neither an already-covered child nor an under-mastered parent produces noise

**Given** three facts on the same tree: (a) "DNS" (child of the mastered "TCP/IP") already has a
curriculum mapped to it, even at 0% progress; (b) "Routing" sits at 45% — below the mastery
threshold — and its own child "Dynamic Routing" is otherwise a textbook gap; (c) "Firewalls" (a
`kind: "area"` node) sits under a mastered parent with an uncovered child of its own
**When** the run computes deepen candidates
**Then** none of DNS, Dynamic Routing, or the Area-kind node produce a candidate — an existing
course excludes DNS regardless of its progress, an under-threshold parent excludes every one of
its children regardless of their own state, and Area-kind nodes are excluded on either side of the
pair.

*Covers 2, 3, 4.*

## SCENARIO 3 — Widening only crosses whole top-level domains, never mid-tree siblings

**Given** a learner actively studying within "Networking" (a root domain, non-zero coverage) while
a sibling child two levels deep inside "Networking" itself (e.g. "VPN" under "Network Security")
sits at 0%, and a wholly separate root domain "Cloud Computing" also sits at 0%
**When** the run computes widen candidates
**Then** "VPN" produces no widen candidate (it is not root-level), and "Cloud Computing" does,
sourced from "Networking" as the active domain.

*Covers 6, 7, 8, 9, 10, 17.*

## SCENARIO 4 — A rejected suggestion never comes back, even as which domain is "active" changes

**Given** a `"widen"` recommendation for root domain X (suggested while "Networking" was the
highest-percent active root) was rejected yesterday
**When** the learner's mastery data changes such that "Cloud Computing" overtakes "Networking" as
the highest-percent active root — X is still a qualifying widen candidate under the unchanged
rule, just now sourced from a different active domain — and the review page triggers another run
**Then** no new recommendation row is created for X — the unique index and the trigger's own
existence check both back this, and the test asserts it end to end, not just at the index level.
This is what makes cross-axis, cross-source-node suppression (spec.md Decision 2) a proven
property, not just a stated one.

*Covers 11, 16, 25.*

## SCENARIO 5 — A non-taxonomy subject gets an honest refusal, not a garbage suggestion

**Given** a subject whose domain tree was built entirely by the dynamic sibling-discovery agent
(no node carries `source: "static_taxonomy"`)
**When** the review page triggers a run for that subject
**Then** the trigger returns `not_taxonomy_backed` and inserts nothing — the structural rule is
never silently applied to a tree shape it wasn't designed for.

*Covers 13, 14.*

## SCENARIO 6 — Accepting a widen suggestion starts a real, researched course

**Given** a pending `"widen"` recommendation for "Cloud Computing"
**When** the learner clicks Accept
**Then** a new curriculum named "Cloud Computing" is created via the research-topic intake path
(no manual sources), it is already placed with a confirmed mapping to the Cloud Computing domain
node, the recommendation's own row records that curriculum's id, and the panel shows "Course
created: Cloud Computing" with a link to it.

*Covers 21, 22, 23, 30.*

## SCENARIO 7 — Rejecting leaves no trace beyond the tombstone

**Given** a pending `"deepen"` recommendation for "DNS"
**When** the learner clicks Reject
**Then** the row is marked rejected with no curriculum ever created, no `createCurriculum` call is
made, and the item disappears from the pending list with no confirmation message.

*Covers 20, 31.*

## SCENARIO 8 — Two tabs cannot both resolve the same suggestion

**Given** the same pending recommendation is open in two browser tabs
**When** the learner clicks Accept in the first tab, and then Reject in the second tab before the
first request completes
**Then** whichever request's claim lands first (`WHERE status = 'pending'`) wins and its decision
stands — the second tab's request is refused with `already_resolved` regardless of which action it
was, exactly one curriculum is created if Accept won or none if Reject won, and the second tab's
button becomes usable again with no crash. The outcome depends on claim order, never on which
tab's click the user intended to be "final."

*Covers 12, 18, 19, 28.*

## SCENARIO 9 — A deleted subject does not leave an accepted recommendation stuck

**Given** a pending recommendation whose subject is deleted (a concurrent subject merge/delete)
between the recommendation being generated and the learner clicking Accept
**When** the claim succeeds but the subsequent `createCurriculum` call returns `subject_not_found`
**Then** the row is released back to `"pending"` with no `createdCurriculumId` set, rather than
sitting permanently `"accepted"` with nothing to show for it — recoverable by a later trigger run
or a manual reject, not a silent dead end.

*Covers 24.*

## SCENARIO 10 — The review page reflects the API contract exactly

**Given** a subject with a mix of pending, accepted, and rejected recommendations
**When** the page loads
**Then** only `pending` rows are fetched and rendered (`GET …?status=pending`), each with its
stored axis and reason, and every button on the page maps to the documented `POST`/`PATCH` routes
with no ad hoc client-side filtering standing in for the server contract.

*Covers 26, 27, 28.*
