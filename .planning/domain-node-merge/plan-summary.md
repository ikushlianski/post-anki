---
type: plan-summary
branch: domain-node-merge
task: domain-node-merge
state: confirmed
updated: 2026-07-31
---

# Plan summary: Domain-node merge

Closes issue #61. Adds a fourth merge to the codebase (`mergeDomainNodes`, alongside
`mergeSubjects`/`mergeCurricula`/`mergeTags`), reusing `withMergeLock` unchanged. Unlike the prior
three, this merge re-parents existing rows (a source node's children move onto the target), which
is the exact write path `docs/architecture/seed-knowledge-map/review.md` and
`ontology-split-merge`'s own spec (Decision #5) both flagged as needing a cycle guard before it
ever shipped. This plan designs and ships that guard as part of its own scope: an ancestor-walk
check (`isAncestor`, new pure function in `packages/core`) run before any reassignment write,
deliberately NOT reusing `domainNodeProgress()`'s depth-capped descendant-walk shape, because a
depth cap on a correctness-blocking guard would silently let a deep malformed merge through.

Business outcome: a user can fold a near-duplicate knowledge-map node into its real counterpart
from the map UI, with every attached course and every child node correctly carried over, and the
system refuses (cleanly, not by corrupting the tree) if the merge would create an impossible
parent/child loop.

Verification: full BMAD + Playwright plan, 5 scenarios (2 e2e, 3 backend/unit — malformed-merge
rejection, concurrency, and rollup-correctness are all better proven at the integration/unit layer
per this codebase's established "prove races and pure logic below the browser" precedent from
`ontology-split-merge`). See `scenarios.md`, `playwright.md`, `state-fixtures.md`.

Files: see `spec.md`'s "Files to create/modify". No schema migration. No new service.
