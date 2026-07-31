---
type: debrief
branch: main
feature: domain-node-merge
updated: 2026-07-31
verdict: sound
diagram-format: ascii
---

# Architecture Review: Domain-node merge

## What was reviewed

The fourth "absorb source into target" merge in this codebase (`mergeDomainNodes`, commit
`dd704de`, merged to `main` at `24c9836`), and the first one that re-parents an *existing*
`domain_nodes` row rather than only reassigning a foreign-key-like column. In scope:
`apps/api/src/domain-map/domain-map.repo.ts` (`mergeDomainNodes`, `getDomainMapForSubject`),
`packages/core/src/domain-map/domain-map-progress.ts` (`isAncestor`, `domainNodeProgress`), the
controller/router wiring, the frontend merge control, and the three suggestion tables the merge
touches.

## Documentation found

Full plan-backed record: `.planning/domain-node-merge/{spec,architecture,scenarios,discussion,
playwright,state-fixtures,e2e-tests,plan-summary}.md`, all `state: confirmed`, plus
`docs/architecture/domain-node-merge/architecture.md` (published by the build agent, left as-is by
this review) and the `.planning/LOG.md` entry recording an independent re-verification pass before
merge (16 core unit tests, both new integration files, 655-test monorepo suite, clean typecheck)
and a `review-playwright` PASS verdict. This review checked the documented claims against the
actual merged code rather than trusting them at face value — see the three flagged questions below.

## As-built architecture

```
 UI: node tile "Merge into..." picker (client excludes own subtree)
                       |
                       v
        POST /domain-nodes/:targetId/merge
                       |
                       v
     withMergeLock(target, source) -- sorted advisory lock, tx
                       |
       re-read both rows -- missing => not_found
       same subjectId?   -- no      => different_subjects
                       |
                       v
     load ALL domain_nodes for subject (flat query)
                       |
                       v
   isAncestor(sourceId, targetId, allNodes)  <-- cycle guard
       (walks target's parentId chain UP, visited-Set,
        no depth cap -- deliberately NOT MAX_DEPTH=6)
                       |
            yes: target inside source's       no: safe to merge
            own subtree                              |
                 |                                    v
                 v                    UPDATE curricula.domain_node_id
         return "cycle", zero writes  UPDATE domain_nodes.parent_id (+order offset)
                                      DELETE domain_priority_suggestions (source)
                                      DELETE domain_supersession_suggestions (source)
                                      UPDATE domain_topic_suggestions
                                        .proposed_parent_node_id (source->target)
                                      DELETE domain_nodes WHERE id = source
                                      commit
                       |
                       v
     GET /subjects/:id/domain-map -> buildItem() recursion
     (UNGUARDED itself -- safe only because isAncestor()
      is the only gate on this write path)
```

Entry point is the map UI's per-node "Merge into…" control (`MergeDomainNodeButton`), which
flattens the already-loaded tree client-side and excludes the source node's own id and every id in
its subtree — defense in depth in front of the server's own `cycle` precondition. The write path is
`mergeDomainNodes`, reusing `withMergeLock` unchanged from the three prior merges. The read path,
`getDomainMapForSubject()`'s `buildItem()` recursion, is deliberately left unguarded — the design
bets everything on `isAncestor()` being the only gate capable of introducing a cycle.

## Verdict

**Sound.** I independently re-derived the central claim rather than trusting the docs: grepped
every write to `domain_nodes.parent_id`/`parentId` across `apps/api/src`. There are exactly three
places that touch it —

1. `mergeDomainNodes`'s `UPDATE domain_nodes SET parent_id = target ...` — the guarded path,
   gated by `isAncestor(sourceId, targetId, allNodesForSubject)` immediately before it.
2. `insertDomainNode` (`domain-map.repo.ts`) and `resolveDomainTopicSuggestion`'s accept-branch
   (`domain-map.repo.ts:569`) and `domain-placement.orchestrator.ts:147` — all three are `INSERT`s
   of a brand-new row with a given `parentId`, never an `UPDATE` of an existing row. A freshly
   inserted node has no existing children pointing at it yet, so it cannot be the missing link in a
   cycle — no guard is needed there, and none is present.
3. `mergeSubjects` (`subject.repo.ts:118`) does `UPDATE domain_nodes SET subjectId = target
   WHERE subjectId = source` — explicitly documented in its own comment as never touching
   `parent_id`, confirmed by reading the statement itself.

So `isAncestor()` is not "the one path someone remembered to add it to" — it is structurally the
only path that can re-parent an existing row, which is a stronger property than "everywhere it's
called, it's called correctly." The call site itself (`domain-map.repo.ts:255`,
`isAncestor(sourceId, targetId, allNodesForSubject)`) matches the documented argument order, and
the unit suite specifically tests the transposed-argument failure mode (a real regression test, not
just a docstring claim).

Two things fall short of "critical" but are worth naming precisely rather than waving through:

**The `llm_call_events` precedent cited for `domain_topic_suggestions.created_domain_node_id` is
not fully equivalent, though the outcome is still safe today.** `spec.md`'s Decision #4 says leaving
`created_domain_node_id` pointing at a deleted source node "mirrors `mergeCurricula`'s explicit
precedent for `llm_call_events`." Checking that precedent directly: `curriculum-merge/spec.md`
records that the `llm_call_events` decision was verified against a real downstream consumer —
`admin-observability.controller.ts` was checked to tolerate a missing name lookup
(`namesByCurriculumId.get(e.curriculumId) ?? null`). `created_domain_node_id` has no such consumer
anywhere in the codebase today (grepped `apps/api/src`, `apps/web/src`, `packages` — the only
references are the write itself and the pass-through type mapper). The dangling reference is inert
right now because nothing reads it, which is actually a safer position than `llm_call_events`'
was — but it means the "verified tolerant" step the precedent implies wasn't actually performed,
because there was nothing to verify against. This becomes load-bearing the moment issue #62's
merge/split audit trail (already scoped as a fast-follow) starts joining
`domain_topic_suggestions.created_domain_node_id` back to `domain_nodes` for display.

**The read-path proof only exercises a single re-parented child, not a wide merge.** Both the S1
e2e test and the concurrency integration test's read-path assertion (`domain-node-merge-
concurrency.integration.test.ts:205-215`, comment: "traverses the merged, re-parented shape without
incident") seed exactly one child under the source. `domainNodeProgress()`'s `MAX_DEPTH = 6` cap is
a level-counter in a BFS `while` loop, not a per-node counter, so a wide merge (many siblings landing
under one target) would not trip it — no correctness bug from width specifically. But `buildItem()`
calls `domainNodeProgress()` fresh for every node in the tree, and `domainNodeProgress()` itself
scans the full node array with `.filter()` per BFS level — an existing O(n) cost per node,
independent of how those n nodes arrived (merge or the ordinary placement flow one node at a time).
Nothing in this feature's own test suite proves the read path's behavior — correctness or
performance — at a fan-out wider than 1, so the "without incident" claim is proven for the case
tested, not demonstrated in general. This is a pre-existing characteristic of the whole domain-map
read path, not something this feature newly introduces, and at this app's single-user personal
scale it is very unlikely to matter in practice.

Neither point meets the bar for escalation (no data loss, no security exposure, no outage or
runaway-cost path, no single point of failure, nothing blocking planned work) — both are precision
gaps in what was proven, not bugs found in what shipped.

## Questions a reviewer would ask

1. When issue #62's merge/split audit trail eventually renders `domain_topic_suggestions` history,
   will it need the same null-tolerant join pattern `admin-observability.controller.ts` already had
   to add for `llm_call_events`, and is that dependency written down anywhere so it isn't
   rediscovered by a failed lookup in production?
2. Is there a realistic scenario in this app where a single merge moves more than a handful of
   children onto one target — and if the answer is "no, this is a single-user app with small trees
   by construction," should that assumption be stated explicitly next to `domainNodeProgress()`'s
   own O(n)-per-node scan, so a future change to multi-tenant or bulk-import doesn't inherit an
   unexamined quadratic cost?
3. `pathFor()` in `domain-placement.orchestrator.ts` is flagged, twice, as unguarded and only safe
   because `mergeDomainNodes` is currently the sole path that can create a cycle — is there a
   tripwire (a test, a lint rule, a code comment convention) that would catch a *future* write path
   quietly re-parenting a node without going through `isAncestor()`, or does that invariant rely
   entirely on the next engineer reading this comment?
4. The cycle guard's own contract is explicitly "this merge introduces no new cycle," not "the tree
   is proven acyclic" — given that, is there any process (a migration script, a manual DB fix) that
   could introduce a cycle *above* a node outside of `mergeDomainNodes`, and if one ever did, what's
   the actual blast radius — does `buildItem()` infinite-loop, or does something else break first?
5. `mergeSubjects` moves an entire `domain_nodes` forest to a new `subjectId` without touching
   `parent_id` — has the interaction between a subject merge and a domain-node merge (e.g., a
   subject merge landing between `isAncestor()`'s tree-load and the reassignment writes) been
   considered, or are the two merge locks (`withMergeLock` on subject ids vs. domain-node ids)
   provably non-overlapping some other way?
6. The concurrency test proves exactly one of two racing merges into different targets wins — has
   the case of two merges racing for the *same* target-and-source pair (a genuine double-click, not
   a retry-into-a-different-target) been considered separately, or is it covered by the same
   `not_found`-on-reread mechanism?

For the business-stakeholder Q&A that closes the BMAD cycle, run /debrief-qa.
