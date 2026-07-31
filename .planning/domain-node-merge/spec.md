---
type: spec
branch: domain-node-merge
task: "Add domain-node merge to close near-duplicate knowledge-map nodes (issue #61)"
complexity: complex
state: confirmed
updated: 2026-07-31
verification:
  targetDb: post-anki-e2e (local Docker Postgres, :5436)
  playwrightPlan: .planning/domain-node-merge/playwright.md
  stateFixtures: .planning/domain-node-merge/state-fixtures.md
---

# Spec: Domain-node merge

## What this ships

A fourth "absorb source into target" merge in this codebase, for `domain_nodes` — the
self-referential tree the knowledge map is built from. Reachable from the map UI on any node.
Every curriculum attached to the source node moves to the target; every CHILD of the source node
is re-parented onto the target; the source node's own row is deleted. This is the first merge in
the codebase that re-parents an existing row, so it also closes a previously-flagged, previously
load-bearing gap: `domain-map.repo.ts`'s tree-assembly recursion (`buildItem()`) has no cycle
guard, and a debrief plus `ontology-split-merge`'s own spec both said the next re-parenting write
path must add one before it ships. This is that write path.

## Scope boundary

**In scope:** merge two `domain_nodes` rows within the same subject; reassign attached curricula
and child nodes; reject a merge that would create a cycle; UI control on the map.

**Out of scope, logged as fast-follows:**
- **Fuzzy/semantic duplicate detection.** This issue only builds the merge mechanism. Surfacing
  *which* nodes are likely duplicates (the "Server Components" vs. "React Server Components" case
  from the issue's own Why) is issue #63's job — this ships the action #63 will trigger.
- **Split.** Same reasoning `ontology-split-merge` already gave: re-parenting on split needs the
  same cycle guard this item builds, but choosing *which* children go where is a harder judgment
  call deserving its own pass.
- **Merge/split audit trail.** Issue #62, separate item.
- **Cross-subject merge.** A domain node belongs to exactly one subject's tree; merging across
  subjects has no coherent meaning (mirrors `mergeCurricula`'s own `different_subjects` guard).

## Data model

No schema migration. Pure reassignment over the existing `domain_nodes`, `curricula`,
`domain_priority_suggestions`, `domain_topic_suggestions`, `domain_supersession_suggestions`
columns.

## New endpoint

| Method | Path | Body | Behavior |
|---|---|---|---|
| POST | `/domain-nodes/:targetId/merge` | `{ sourceDomainNodeId: string }` | Absorbs `sourceDomainNodeId` into `:targetId`. Target survives (keeps name/description/order/targetDepth); source is deleted. |

Action-verb sub-path on an existing resource id — matches `/subjects/:id/merge`,
`/curricula/:id/merge`, `/tags/:id/merge`.

### Behavior contract

Preconditions (checked inside the transaction, after acquiring locks — never before, per this
codebase's established TOCTOU-avoidance pattern):

1. `targetId !== sourceDomainNodeId` → handled by `withMergeLock` itself → 400 `self_merge`.
2. Both nodes exist → 404 `not_found`.
3. Both nodes have the same `subjectId` → 400 `different_subjects`.
4. **Target is not a descendant of source** (equivalently: source is not an ancestor of target) →
   400 `cycle`. This is the new precondition this item introduces — see "Cycle guard design"
   below for the full reasoning.

Procedure, inside `withMergeLock(targetId, sourceDomainNodeId, run)`:

1. Re-read both `domain_nodes` rows inside the lock. Missing → `not_found`.
2. `subjectId` mismatch → `different_subjects`.
3. Load every `domain_nodes` row for that `subjectId` (one flat query, same shape
   `getDomainMapForSubject` already uses) and run the ancestor-walk cycle check (below). Cycle
   found → `cycle`.
4. `UPDATE curricula SET domain_node_id = :targetId WHERE domain_node_id = :sourceId` — curricula
   moved.
5. `UPDATE domain_nodes SET parent_id = :targetId, "order" = "order" + :targetMaxChildOrder WHERE parent_id = :sourceId`
   — child nodes re-parented, with `order` offset past the target's current max child order first
   (mirrors `mergeCurricula`'s own `modules.order` offset exactly — see Decision #8; without this,
   re-parented children land alongside the target's existing children at colliding `order` values
   and `buildItem()`'s `.sort((a,b) => a.order - b.order)` gives an arbitrary, unstable
   interleaving). No name-collision check against target's existing children (see Decision #2 —
   matches `mergeCurricula`'s own "additional modules, no matching attempted" precedent).
6. `DELETE FROM domain_priority_suggestions WHERE domain_node_id = :sourceId` — ephemeral,
   1:1-tied-to-the-retiring-node advisory rows (see Decision #3).
7. `DELETE FROM domain_supersession_suggestions WHERE domain_node_id = :sourceId` — same
   reasoning as step 6.
8. `UPDATE domain_topic_suggestions SET proposed_parent_node_id = :targetId WHERE proposed_parent_node_id = :sourceId`
   — a still-pending "add a new node here" suggestion whose proposed parent is the node about to
   disappear must point somewhere real, or it becomes silently unresolvable the next time someone
   tries to accept it (see Decision #4). `created_domain_node_id` on already-resolved suggestions
   is intentionally left untouched — see Decision #4.
9. `DELETE FROM domain_nodes WHERE id = :sourceId`.
10. Commit. Return `{ targetDomainNodeId, sourceDomainNodeId, curriculaMoved, childNodesMoved }`.

## Cycle-guard design

**The check:** reject the merge if `sourceId` is an ancestor of `targetId` (equivalently:
`targetId` is a descendant of `sourceId`). Concrete reasoning for why this is the correct
direction, not the reverse: merging source B into target A re-parents every direct child of B onto
A. If A is somewhere inside B's own subtree, one of B's children is an ancestor of A (or A itself).
Re-parenting that child onto A makes A simultaneously an ancestor and a descendant of that
child — a cycle. Concretely: tree `B → C → A` (B is A's grandparent, C is A's parent). Merging B
into A re-parents C (B's child) onto A: `C.parentId = A`. But `A.parentId = C` already. Now
`A → C → A`, a 2-node cycle, and both `buildItem()`'s tree-assembly recursion and any future
ancestor-path walk loop forever without a guard.

The reverse direction — merging a node into its own ancestor (e.g., merge C into B, where B is
C's parent) — is the ordinary, safe "collapse a level" case and must remain allowed; nothing in the
guard should reject it.

**Implementation: walk target's ancestors, not source's descendants.** Two shapes exist in this
codebase to build on:
- `packages/core/src/domain-map/domain-map-progress.ts`'s `domainNodeProgress()` — a *descendant*
  walk (BFS + visited-`Set` + `MAX_DEPTH = 6` cap), built for the rollup deriver's own need to
  collect an entire subtree.
- `apps/api/src/domain-map/domain-placement.orchestrator.ts`'s `buildTreeLines()` → `pathFor()` —
  an *ancestor* walk (plain `while (current.parentId)` loop), built for display-path formatting,
  with **no cycle protection today** (safe only because nothing re-parents yet).

The cycle guard needs an ancestor walk from `targetId` upward, checking whether `sourceId` appears
in the chain — this is the cheaper and more direct shape for this specific question (bounded by
tree depth, not tree width; no need to enumerate source's entire subtree just to answer "is one
specific node in it"). This is `pathFor`'s shape, not `domainNodeProgress`'s.

**Critical difference from `domainNodeProgress`'s depth cap — do not copy `MAX_DEPTH = 6`
verbatim.** `domainNodeProgress`'s cap is a defensive bound for a *rollup* — if it stops early,
the failure mode is a percentage slightly under-counting a very deep subtree, low stakes, and the
comment there says explicitly "v1 never creates cycles" (true only because nothing re-parented
before this item). The cycle guard is a *correctness-critical, write-blocking* check — if it stops
before reaching an actual ancestor 7+ levels up, the guard **false-negatives**: it reports "no
cycle" and lets a malformed merge through, corrupting the tree. A depth cap is the wrong kind of
defense here. Termination is instead guaranteed by a visited-`Set` alone (walk `parentId` upward,
stop when the current node's id has already been seen or `parentId` is null) — correct even against
a tree that's already unexpectedly deep, and correct even against an already-corrupted cycle
introduced by hand (a migration, a manual DB edit) sitting *above* `targetId`, which a capped walk
could also miss.

**New shared function:** `isAncestor(candidateAncestorId, nodeId, nodes): boolean` in
`packages/core/src/domain-map/domain-map-progress.ts` (co-located with `domainNodeProgress`, same
`DomainNodeRef[]` input shape, exported alongside it) — visited-`Set`-guarded ancestor walk, no
depth cap. Called from `mergeDomainNodes` as
`isAncestor(sourceId, targetId, allNodesForSubject)`. Unit-tested directly (pure function, no DB) —
see Definition of Done.

**Behavior on an unresolvable `parentId`.** If a hop's `parentId` doesn't match any row in `nodes`
(a dangling pointer — e.g. `deleteSubject()`'s already-documented, pre-existing orphaning of a
subject's `domain_nodes`, unrelated to this item), the walk terminates there and returns `false`
("not an ancestor") rather than throwing. This is a deliberate, permissive choice, stated explicitly
so the implementer doesn't pick an arbitrary behavior: a merge should not fail because of unrelated
pre-existing data corruption elsewhere in the tree; the guard's job is narrowly "does *this* merge
introduce a cycle," not "is the whole tree healthy."

**What the guard does and does not guarantee.** The visited-`Set` guarantees the walk always
terminates, including against a tree that already contains a cycle somewhere. It does **not**
guarantee that pre-existing cycle is detected if it doesn't lie on `targetId`'s own ancestor chain
— the guard's contract is "this merge does not introduce a new cycle," not "the tree is proven
acyclic." For a *well-formed* (already acyclic) tree the check is complete: re-parenting moves
every child of the source onto the target, and a child of the source could only become an ancestor
of the target if the target were already inside the source's subtree — exactly the condition the
walk checks. See Decision #1 for why this distinction matters and isn't just a wording nuance.

**Not fixed as part of this item (flagged, not silently ignored):** `pathFor()` in
`domain-placement.orchestrator.ts` still has no visited-set guard. It remains safe today only
because this item is the only write path that could ever introduce a cycle, and this item's own
guard prevents that write from ever landing. If a future change ever bypasses `mergeDomainNodes`
(a raw migration, a script), `pathFor()` would still be exposed. Logged as a cheap fast-follow, not
blocking this item.

## Frontend

- `apps/web/src/domain-map/merge-domain-node-button.tsx` — new `MergeDomainNodeButton`, same
  confirm-arm interaction as `MergeSubjectButton`
  (`apps/web/src/subject/subject-section.tsx`). Click reveals a `<select>` of eligible targets +
  Confirm/Cancel. The picker offers **every other node in the subject's tree**, not just siblings
  — near-duplicates can live in different branches (the issue's own example: "Server Components"
  and "React Server Components" could be proposed under different parents by the two independent
  agent call sites) — flattened from the already-loaded tree, labeled with its full path (e.g.
  "Frontend > Meta-frameworks > Astro") so identically-named nodes in different branches stay
  distinguishable. The node itself and its own entire subtree are excluded client-side (defense in
  depth — mirrors `ontology-split-merge`'s S2 precedent of the picker never offering an invalid
  target, backed independently by the server's own `cycle` check).
- `apps/web/src/domain-map/domain-map-tree.tsx` — `DomainMapNode` renders
  `MergeDomainNodeButton`, needs the full flattened node list threaded down (already has the root
  `nodes` array in `DomainMapTree`; pass it through unchanged as an `allNodes` prop alongside the
  existing per-node `node` prop).
- `apps/web/src/domain-map/domain-map.api.ts` (or nearest existing domain-map server-fn file) —
  new `mergeDomainNodes` server function, same shape as `mergeSubjects`/`mergeTags`.

## Files to create

```
apps/api/src/domain-map/
  domain-node-merge-cycle-guard.integration.test.ts   — malformed-merge rejection proof
  domain-node-merge-concurrency.integration.test.ts   — double-merge race proof

apps/web/src/domain-map/
  merge-domain-node-button.tsx

packages/core/src/domain-map/
  (no new file — isAncestor added to domain-map-progress.ts, tested in domain-map-progress.test.ts)
```

## Files to modify

```
apps/api/src/
  domain-map/domain-map.repo.ts      — + mergeDomainNodes(targetId, sourceId)
  domain-map/domain-map.controller.ts — + handleMergeDomainNodes
  router.ts                           — + POST /domain-nodes/:id/merge

apps/web/src/domain-map/
  domain-map-tree.tsx                 — thread allNodes, render MergeDomainNodeButton
  domain-map.api.ts (or equivalent)   — + mergeDomainNodes server fn

packages/core/src/domain-map/
  domain-map-progress.ts              — + isAncestor()
  domain-map-progress.test.ts         — + isAncestor coverage, + merged-shape rollup coverage

packages/shared/src/
  domain-map.ts                       — + mergeDomainNodesInput, + mergeDomainNodesResultSchema
```

## Decisions made autonomously

1. **Cycle guard walks target's ancestors (not source's descendants), with no depth cap.** See
   "Cycle-guard design" above for the full reasoning — this is the item's central judgment call.
   Verified against both existing shapes in the codebase (`domainNodeProgress`'s descendant-BFS,
   `pathFor`'s ancestor-walk) and chose to build on the ancestor-walk shape specifically because
   the depth-capped descendant-BFS would silently under-protect a tree deeper than 6 levels — a
   correctness bug for a write-blocking guard, acceptable only for the rollup deriver it was
   designed for. **Scope of the guarantee, stated precisely:** the visited-`Set` guarantees the
   walk terminates even against an already-corrupted (cyclic) tree; it does not guarantee such a
   pre-existing cycle is *detected* unless it happens to lie on the target's own ancestor chain.
   The guard's actual contract is "this specific merge introduces no new cycle," proven complete
   for any tree that was acyclic going in (the only case this codebase can produce, since this
   item is the first and only write path capable of re-parenting a node) — not the stronger,
   unneeded claim "the tree is proven acyclic."
2. **Same-name-sibling handling: no matching attempted, becomes an additional sibling.** Verified
   consistent across every existing merge — `mergeCurricula`'s modules land as additional modules
   under the target with no title-matching reconciliation (explicitly documented in its own
   docstring); `mergeSubjects`/`mergeTags` never attempt name-collision handling either. Re-parented
   children under the target may end up with a same-named sibling; this is accepted, matching
   established precedent, not a new gap this item introduces.
3. **`domain_priority_suggestions` and `domain_supersession_suggestions` rows tied to the source
   node are deleted, not reassigned.** Both are ephemeral, single-node-scoped advisory rows (a
   pending "raise this node's target depth" or "flag this node as superseded" suggestion). If
   reassigned to the target, an unresolved suggestion's `reason` text (often referencing the
   specific node's name) would misrepresent what was actually suggested once that node no longer
   exists under its own identity. Mirrors `mergeCurricula`'s own precedent of deleting
   `curriculum_structure_turns`/`structure_research_candidates` rather than reassigning them
   (Decision #2 there: "reassigning risks colliding... and always produces an incoherent... thread").
4. **`domain_topic_suggestions.proposed_parent_node_id` is reassigned; `created_domain_node_id` is
   left untouched.** These are two different kinds of reference on the same row.
   `proposed_parent_node_id` is a *forward-looking* pointer (where a not-yet-created node should
   attach) — if left pointing at a deleted source id, accepting that suggestion later would
   silently fail to resolve a parent. It must move to the target, the node that now represents
   that position. `created_domain_node_id` is a *historical* record ("this suggestion, once
   accepted, produced this exact node") — reassigning it would falsify which node the suggestion
   actually created. Left untouched, mirroring `mergeCurricula`'s explicit precedent for
   `llm_call_events` (Decision #3: "an append-only observability log, reassigning would falsify
   which curriculum an LLM call actually ran against").
5. **Merge restricted to same `subjectId`, mirroring `mergeCurricula`'s `different_subjects`
   guard.** A domain node's tree position only has meaning within its own subject; merging across
   subjects has no coherent target position for re-parented children.
6. **The merge-target picker offers every other node in the subject's tree, not just siblings,
   labeled by full path.** The issue's own motivating example (two independent AI call sites
   proposing differently-named nodes for the same concept under potentially different parents)
   means the near-duplicate is not guaranteed to be a sibling. Path-qualified labels
   ("Frontend > Meta-frameworks > Astro") resolve the ambiguity of two identically-named nodes
   in different branches — the same problem `buildTreeLines`/`pathFor` already solves for the
   sibling-discovery agent's own prompt, reused here for the same reason.
7. **`pathFor()`'s own missing cycle guard is flagged, not fixed, in this pass.** See "Cycle-guard
   design"'s closing note. It stays safe as a side effect of this item's own write-path guard
   preventing any cycle from ever existing; fixing it defensively too is a one-line, low-risk
   fast-follow, not required for this item's own correctness.
8. **Re-parented children get their `order` offset past the target's current max child order,
   mirroring `mergeCurricula`'s own `modules.order` offset exactly.** Without this, the source's
   children (typically `order` 0, 1, 2…) would collide with the target's existing children's
   `order` values, and `buildItem()`'s `.sort((a, b) => a.order - b.order)` would produce an
   arbitrary, unstable interleaving on every render. This is a direct precedent this item had
   already committed to following everywhere else in the reassignment procedure; carrying it
   through here is consistency, not a new judgment call.

### Definition of Done — per layer

**Backend.**
- `npx vitest run -w @post-anki/api` and `npx vitest run -w @post-anki/core` clean.
- **Zero-orphan proof (reassigned curricula AND reassigned child nodes).** A real integration test
  (`apps/api/src/domain-map/domain-node-merge-concurrency.integration.test.ts`'s happy-path test,
  or a co-located non-concurrency test in the same file) against real Postgres:
  1. Create a subject, three domain nodes (target A, source B as a child of A's sibling —
     deliberately NOT a direct sibling of A, to prove the picker's "anywhere in the tree" design
     point), a fourth node C as a child of B (the re-parenting case), a curriculum with
     `domain_node_id = B`.
  2. `mergeDomainNodes(targetId: A, sourceId: B)`.
  3. Direct SQL: `SELECT count(*) FROM domain_nodes WHERE id = B` = 0.
  4. Direct SQL: `SELECT parent_id FROM domain_nodes WHERE id = C` = A (re-parented, not orphaned
     with a dangling `parent_id`).
  5. Direct SQL: `SELECT domain_node_id FROM curricula WHERE id = <curriculumId>` = A (not
     orphaned with a dangling `domain_node_id`).
  6. Direct SQL: `SELECT count(*) FROM domain_priority_suggestions WHERE domain_node_id = B` = 0
     (a pending suggestion seeded against B before the merge) — proves the ephemeral-suggestion
     cleanup, not just silence-by-absence of an error.
  7. Direct SQL: a `domain_topic_suggestions` row seeded with `proposed_parent_node_id = B` now
     reads `proposed_parent_node_id = A`.
  8. **Read-path proof, not just write-path.** `GET /subjects/:subjectId/domain-map` (i.e.
     `getDomainMapForSubject()`, the exact `buildItem()` recursion the seed-knowledge-map review
     flagged as unguarded) is called after the merge and its response is asserted to contain node
     C nested directly under node A at the correct depth — proving the tree-assembly read path
     actually traverses the merged, re-parented structure successfully, not just that the raw rows
     look right in isolation. This is the assertion that ties this item back to the review finding
     that motivated it, not an incidental side effect of the e2e test loading the map page.
- **Malformed-merge rejection proof — exact file:**
  `apps/api/src/domain-map/domain-node-merge-cycle-guard.integration.test.ts`. Two cases, both
  against real Postgres:
  - Build a real 3-level chain `B → C → A` (B is A's grandparent). Call
    `mergeDomainNodes(targetId: A, sourceId: B)`. Assert the result is `{ error: "cycle" }`, not a
    thrown exception, not a 500. Assert via direct SQL immediately after: `C.parent_id` is still
    `B` (unchanged — the merge made zero writes), `A` and `B` both still exist, `A.parent_id` is
    still `C` — the tree is byte-for-byte what it was before the call, not partially mutated.
  - **Negative control, same file — the argument-order regression test.** The safe, ordinary
    "collapse a level" case — merge C (source) into its own direct parent B (target) — must
    succeed normally. This isn't just "the guard isn't over-broad": paired with the positive case
    above, it's the specific test that catches an implementer transposing the two arguments to
    `isAncestor`. Under a transposed call (`isAncestor(targetId, sourceId)` instead of
    `isAncestor(sourceId, targetId)`), the positive case (`B → C → A`, merge B into A) would
    wrongly return `false` (allowing a cycle), while this negative case (merge C into B) would
    wrongly return `true` (rejecting a safe merge) — the two tests together, not either alone,
    discriminate that specific implementation bug.
  - A third case building a deliberately deep chain (`CHAIN_DEPTH = 9`, a named constant in the
    test with a comment tying it to `domainNodeProgress`'s `MAX_DEPTH = 6` so the relationship
    survives a future cap change) with the cycle at the bottom, proving the guard still catches
    it — the concrete regression test for the depth-cap mistake this spec explicitly warns against
    copying. This test fails correctly if a future change reuses the capped descendant-BFS shape
    instead of the uncapped ancestor walk.
- **Concurrency proof — exact file:**
  `apps/api/src/domain-map/domain-node-merge-concurrency.integration.test.ts`. Mirrors
  `subject-merge-concurrency.integration.test.ts` exactly: two concurrent
  `mergeDomainNodes(targetB, source)` / `mergeDomainNodes(targetC, source)` calls for the same
  source node — exactly one succeeds with real moved counts, the other resolves (never throws)
  with `{ error: "not_found" }`, verified via direct SQL that the source's children and curricula
  ended up on the winner only, never split or duplicated.
- **`isAncestor()` unit coverage** (`packages/core/src/domain-map/domain-map-progress.test.ts`):
  direct ancestor, indirect (multi-hop) ancestor, non-ancestor sibling, non-ancestor unrelated
  branch, self (a node is not its own ancestor — note in the test comment that `withMergeLock`
  already rejects this as `self_merge` before `isAncestor` would ever run for a real merge call,
  so this case is only reachable at the pure-function level, and is kept so a future simplification
  doesn't quietly remove the guard's own self-safety), a dangling/unresolvable `parentId` mid-walk
  (asserts the documented permissive "not an ancestor" behavior, not a throw), and a pre-corrupted
  2-node cycle fed in directly (proving the visited-set terminates instead of looping — this is the
  one case that must never be constructible via the API, so it's exercised at the pure-function
  level instead).
- **`domainNodeProgress()` post-merge rollup correctness** (same test file): construct a tree
  shape equivalent to what `mergeDomainNodes` produces — a target node with its own pre-existing
  children plus the source's former children re-parented alongside them (including one
  intentionally same-named pair, per Decision #2), attach curricula/topics with known maturity
  values at multiple points in the merged shape, and assert `domainNodeProgress()` returns the
  correct averaged percent for the target's subtree — proving the deriver's own `MAX_DEPTH = 6`
  cap is not unexpectedly tripped by the specific shape a real merge produces (the merged tree
  stays well under 6 levels for this test's construction, so the assertion is a real pass, not a
  cap-driven false pass).

**Frontend.** e2e proof, exact scenario tags (see scenarios.md):
- `@domain-node-merge.S1` — merging two domain nodes with a real curriculum and a real child node
  via the UI reassigns both, verified in the DOM (map re-renders under the target, source node
  gone) and via direct DB reads.
- `@domain-node-merge.S2` — the merge-target picker never offers the node itself or any node in
  its own subtree as a valid target.

**Infrastructure.** N/A — no schema migration, no new service, no env var, no deploy change.

## Documentation changes

`docs/architecture/seed-knowledge-map/review.md` flagged the cycle-guard gap this item closes;
`docs/architecture/ontology-split-merge/review.md`'s precedent (Decision #5 there) explicitly
deferred it to this item. This plan commits to publishing
`docs/architecture/domain-node-merge/architecture.md` during implementation (mirroring this repo's
existing `docs/architecture/<slug>/` convention), documenting the merge procedure and the
cycle-guard's ancestor-walk design — the diagram already drafted in `architecture.md` below.
