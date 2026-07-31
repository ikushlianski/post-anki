---
type: architecture
branch: domain-node-merge
task: domain-node-merge
state: confirmed
updated: 2026-07-31
---

# Architecture: Domain-node merge

## Why this needed its own architecture.md

This is the first write path in the codebase that re-parents an existing `domain_nodes` row.
Every prior merge (`mergeSubjects`, `mergeCurricula`, `mergeTags`) only ever changed a foreign-key
-like column to point at a different owner; none of them altered the self-referential tree
structure itself. That distinction is what makes the cycle guard a genuinely new piece of
architecture, not just another reassignment — closing `docs/architecture/seed-knowledge-map/review.md`'s
previously-flagged gap.

## Merge procedure

```mermaid
flowchart TD
  Start["POST /domain-nodes/:targetId/merge"] --> Lock["withMergeLock: sorted advisory lock, open transaction"]
  Lock --> ReRead["Re-read target and source domain_nodes rows"]
  ReRead --> ExistCheck{Both rows still exist?}
  ExistCheck -- No --> NotFound["Return error: not_found"]
  ExistCheck -- Yes --> SubjectCheck{Same subjectId?}
  SubjectCheck -- No --> DiffSubjects["Return error: different_subjects"]
  SubjectCheck -- Yes --> LoadTree["Load every domain_nodes row for the subject"]
  LoadTree --> CycleCheck{"isAncestor(sourceId, targetId, allNodes)?"}
  CycleCheck -- Yes: target is inside source's subtree --> Cycle["Return error: cycle, zero writes"]
  CycleCheck -- No --> MoveCurricula["UPDATE curricula: domain_node_id = target WHERE domain_node_id = source"]
  MoveCurricula --> Reparent["UPDATE domain_nodes: parent_id = target WHERE parent_id = source"]
  Reparent --> CleanSuggestions["DELETE priority and supersession suggestions tied to source"]
  CleanSuggestions --> RepointSuggestions["UPDATE topic suggestions: proposed_parent_node_id = target WHERE = source"]
  RepointSuggestions --> DeleteSource["DELETE the source domain_nodes row"]
  DeleteSource --> Commit["Commit transaction, return moved counts"]

  classDef default fill:#e8eaf6,stroke:#455a64,stroke-width:1.5px,color:#000
  classDef errorNode fill:#ffcdd2,stroke:#b71c1c,stroke-width:1.5px,color:#000
  classDef successNode fill:#c8e6c9,stroke:#1b5e20,stroke-width:1.5px,color:#000
  linkStyle default stroke:#455a64,stroke-width:1.5px
  class NotFound,DiffSubjects,Cycle errorNode
  class Commit successNode
```

## Cycle-guard shape — why an ancestor walk, not a descendant walk

```mermaid
flowchart LR
  subgraph BadMerge["Rejected: merging B into A when A is inside B's own subtree"]
    B1["B (source)"] --> C1["C"]
    C1 --> A1["A (target)"]
  end
  subgraph AfterBadMerge["What would happen if allowed"]
    C2["C, reparented onto A"] --> A2["A"]
    A2 --> C2
  end
  BadMerge -. "re-parenting B's child C onto A creates" .-> AfterBadMerge

  classDef default fill:#e8eaf6,stroke:#455a64,stroke-width:1.5px,color:#000
  classDef cycleNode fill:#ffcdd2,stroke:#b71c1c,stroke-width:1.5px,color:#000
  linkStyle default stroke:#455a64,stroke-width:1.5px
  class C2,A2 cycleNode
```

The guard walks from the target upward via `parentId` (the same shape
`domain-placement.orchestrator.ts`'s `pathFor()` already uses for building display paths) and
checks whether the source appears in that chain — cheaper than enumerating the source's entire
subtree (`domainNodeProgress()`'s shape), and, critically, run with **no depth cap**: a capped
walk is correct for a rollup that can tolerate slight under-counting past 6 levels, but wrong for a
write-blocking correctness check where stopping early means silently allowing a corrupting merge
through. Full reasoning in `spec.md`'s "Cycle-guard design" section.

## What does not change

`getDomainMapForSubject()`'s own tree-assembly recursion (`buildItem()`) is left exactly as-is —
this item does not add a guard there. The reasoning: once `mergeDomainNodes` is the only write path
capable of re-parenting a node, and it always runs the ancestor-walk check before any write lands,
no cycle can ever exist in the data `buildItem()` reads. The read-path recursion staying unguarded
is therefore a correctly-scoped decision, not a leftover gap — the fix belongs on the write path
that could introduce the problem, not on every read path that assumes data integrity already holds
(the same posture `domainNodeProgress()`'s own comment already states: its cap is "a defensive
bound against future misuse," not a substitute for preventing the misuse at the source).

## Documentation changes

Publishes `docs/architecture/domain-node-merge/architecture.md` during implementation, carrying
both diagrams above, closing the two open findings from `docs/architecture/seed-knowledge-map/review.md`
(cycle guard) and `docs/architecture/ontology-split-merge/review.md`'s Decision #5 (deferred
re-parenting guard).
