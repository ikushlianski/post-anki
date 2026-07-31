---
type: scenarios
branch: domain-node-merge
task: domain-node-merge
state: confirmed
updated: 2026-07-31
---

# Scenarios: Domain-node merge

## SCENARIO 1 — Merge two domain nodes with real children; none orphaned or duplicated

A user has a knowledge-map tree with a near-duplicate node somewhere off to the side (not
necessarily a sibling — e.g. "React Server Components" was created under "Frontend > React" while
"Server Components" already exists under "Frontend > Meta-frameworks > Next.js"). The duplicate
has its own attached curriculum and its own child node. The user opens the source node's merge
control, picks the real target from the path-labeled picker, confirms. The source node disappears
from the map; its curriculum and child node now render under the target instead, with none of
their own data lost (curriculum still has its modules/topics, the child node still has its own
place in the tree, just re-rooted).

**Acceptance:**
- **BE:** `mergeDomainNodes(targetId, sourceId)` reassigns `curricula.domain_node_id` and
  `domain_nodes.parent_id` (with `order` offset past the target's existing children) for every row
  pointing at the source, deletes the source's `domain_priority_suggestions`/
  `domain_supersession_suggestions` rows, reassigns `domain_topic_suggestions.proposed_parent_node_id`,
  deletes the source `domain_nodes` row. Returns
  `{ targetDomainNodeId, sourceDomainNodeId, curriculaMoved, childNodesMoved }`. Post-merge,
  `GET /subjects/:id/domain-map` (the tree-assembly read path) correctly nests the moved child
  under the target — proving the read path this item exists to protect actually traverses the
  merged tree without incident, not just that the raw rows look right.
- **FE:** `MergeDomainNodeButton` on the source node's tile; confirming removes the source's own
  tile from the DOM and the target's subtree now renders the moved curriculum link and the moved
  child node.
- **Infra:** None.
- Tests:
  [x] @domain-node-merge.S1 — e2e test written

## SCENARIO 2 — Merge-target picker excludes invalid targets

A user opens the merge control on a node that has its own descendants. The target `<select>` never
lists: the node itself, or any node inside its own subtree (both would be rejected server-side by
the `cycle` check anyway, but the picker should never let the user click their way into a
guaranteed-400). It DOES list every other node in the subject's tree, including nodes that are
neither an ancestor nor a sibling, each labeled with its full path.

**Acceptance:**
- **BE:** None beyond S1's own `cycle` precondition (already covered there as the backstop).
- **FE:** The target `<select>`'s option list, read back via `openMergePicker`-equivalent action,
  excludes the source's own id and every id in its subtree; includes at least one unrelated-branch
  node with a path-qualified label.
- **Infra:** None.
- Tests:
  [x] @domain-node-merge.S2 — e2e test written

## SCENARIO 3 — Deliberately malformed merge is rejected, not corrupted (not e2e — see below)

An operator (or a future buggy caller) calls the merge endpoint directly with a target that is a
descendant of the source — bypassing the UI picker's own filtering entirely. The system must
refuse cleanly: a `cycle` error, zero writes, the tree byte-for-byte unchanged. A paired case —
merging a node into its own direct parent (the ordinary, intentional "collapse a level"
operation) — must still succeed; together the two cases are the argument-order regression test
for the guard (a transposed `isAncestor(a, b)` call would flip both outcomes simultaneously, so
neither test alone would catch it, but the pair does).

**Acceptance:**
- **BE:** `mergeDomainNodes` returns `{ error: "cycle" }` for target-is-descendant-of-source
  (tested at 3 levels and at 9 levels, past `domainNodeProgress`'s own `MAX_DEPTH = 6`, to prove
  the guard has no depth limit); succeeds normally for the safe "merge into direct parent" case.
- **FE:** None — this scenario is deliberately about a call that bypasses the UI.
- **Infra:** None.
- Tests:
  [ ] `apps/api/src/domain-map/domain-node-merge-cycle-guard.integration.test.ts` — malformed
      case rejected cleanly (3-level and 8+-level chains), safe case succeeds.

**Not e2e — see playwright.md.** The malformed state (target already a descendant of source)
cannot be reached through the UI at all once S2's picker filtering is in place; proving the
backend's independent rejection requires calling the endpoint directly, which is exactly what the
integration test above does. Building the malformed tree shape via UI clicks would also be
disproportionate to what the test is actually proving (a single write-path precondition).

## SCENARIO 4 — Two concurrent merges racing for the same source node (not e2e — see below)

Two merge requests for the same source node into two different targets fire concurrently (two
tabs, a retry). Exactly one must win; the other must fail cleanly with `not_found`, never a 500,
never split ownership of the source's children between both targets.

**Acceptance:**
- **BE:** Mirrors `subject-merge-concurrency.integration.test.ts` exactly — one call succeeds with
  real moved counts, the other resolves (never throws) `{ error: "not_found" }`; verified via
  direct SQL that the source's children/curricula ended up on the winner only.
- **FE:** None.
- **Infra:** None.
- Tests:
  [ ] `apps/api/src/domain-map/domain-node-merge-concurrency.integration.test.ts`

**Not e2e — see playwright.md.** The exact race interleaving can't be reliably constructed by
browser clicks; mirrors `ontology-split-merge`'s own S5 precedent of verifying this class of proof
via a real-Postgres integration test firing concurrent calls directly.

## SCENARIO 5 — `domainNodeProgress()` rollup stays correct against a merged tree shape (not e2e)

After a merge, the target's subtree contains a mix of its own pre-existing children and the
source's former children sitting alongside them (per Decision #2, including a same-named pair).
The percentage rollup for the target and its ancestors must still average correctly across every
topic in the now-larger subtree, and must not be silently truncated by the deriver's own
`MAX_DEPTH = 6` cap for a realistically-shaped merged tree.

**Acceptance:**
- **BE:** `domainNodeProgress()` unit test constructs the merged-shape tree directly (no DB, pure
  function) with known topic maturities at multiple points, asserts the correct averaged percent.
- **FE:** None — S1's own e2e already asserts the percent badge renders post-merge; this scenario
  is the correctness proof for the number itself, not its rendering.
- **Infra:** None.
- Tests:
  [ ] `packages/core/src/domain-map/domain-map-progress.test.ts` — merged-shape rollup case

**Not e2e — see playwright.md.** Pure-logic arithmetic with no independent UI/integration surface
beyond what S1 already exercises for rendering; this is exactly the rare case Phase 6.0's triage
reserves for a unit test.
