---
type: discussion
branch: ontology-audit-trail
task: ontology-audit-trail
state: confirmed
updated: 2026-07-31
---

# Discussion log: Merge/split audit trail

Planned autonomously (no live interview round — the task explicitly authorized self-resolving every
fork using this codebase's established "recommended-default rule"). The forks below are recorded in
the same shape a live interview round would have produced, each with the recommended answer that
was actually taken.

## Branch-defining fork: log-write location — hook inside `withMergeLock` vs. one line per callback

**Question:** should the log write live inside `withMergeLock` itself (one implementation point,
automatically applied to all four merges and any future fifth one), or as one added line inside
each of the four callbacks?

**Recommended answer, taken:** one line per callback. `withMergeLock`'s own doc comment already
commits to staying generic ("this helper only ever adds `self_merge` to whatever error union
`run`'s own return type already defines"); giving it entity-type awareness and a counts-extraction
contract would break that commitment and require nearly as much per-call-site wiring as just
writing the line directly, since each callback already has the target/source rows and the exact
result object in scope. The one real cost of this choice — a future fifth merge function must
remember to add its own line — is judged acceptable: the codebase's established pattern (four
merges built one at a time, each explicitly documented against the prior three's precedents) already
shows this is exactly how this project extends merge behavior; nothing here is more forgettable than
the four merges' own existing preconditions/locking pattern, which every new merge has correctly
replicated so far.

## Branch-defining fork: `reassigned_counts` shape

**Question:** fixed columns (e.g. `curricula_moved`, `topics_moved`, ... one column per field ever
used by any merge), a Zod discriminated union keyed by `entity_type`, or untyped/loosely-typed
`jsonb`?

**Recommended answer, taken:** `jsonb` typed as `Record<string, number>` at the Drizzle/Zod layer.
Fixed columns would need ~10 nullable columns (one per distinct field across all four merges) with
most always null for any given row — worse than the varying-shape `jsonb` pattern this schema
already uses elsewhere (`structureSnapshot`, `toolActions`). A discriminated union was considered
and rejected as over-engineering for a display-only value with no further business logic reading
it back — nothing in this codebase queries into `reassigned_counts`' individual fields, it's read
once and rendered as text.

## Independent fork: entity folder placement

**Question:** does the log's repo/insert/read logic live in `apps/api/src/shared/` (alongside
`merge-lock.ts`, which all four merges already import) or its own `apps/api/src/ontology-merge/`
folder?

**Recommended answer, taken:** its own `ontology-merge/` folder. This project's CLAUDE.md is
explicit that `shared/lib` is reserved for utilities with no domain affiliation (the example given:
a generic date formatter). An audit log of real merge events is a domain concept — cross-cutting
across four entities, but not generic in the sense the rule means. `merge-lock.ts` itself is a
genuine exception already (a locking *mechanism*, not a domain concept) — this doesn't extend that
exception to a table of business data.

## Independent fork: where the log renders

**Question:** a new dedicated route (e.g. `/ontology-merges`), or an added section on the existing
`/admin-observability` page?

**Recommended answer, taken:** extend `/admin-observability`. That page already exists specifically
to host small internal read-only lists (stuck curricula, recent LLM calls) with no shared theme
beyond "things an operator occasionally wants to check." A third list of the same kind fits its
existing purpose exactly; a new route for one table would be over-building relative to the issue's
own explicit bar ("even a simple list view is enough for a first cut").

## Independent fork: relationship to the `clearCurriculumStructure` provenance-aware item

**Question:** should this item's schema/mechanism be designed so the provenance fix can build on
it later (e.g. a shared "where did this come from" table both items write to), or are they
independent?

**Recommended answer, taken:** independent, stated explicitly (not silently assumed). Worked through
concretely: the provenance fix's core requirement is answering "was THIS row merged in?" at
delete-time, for a row that may have existed under the target curriculum for an arbitrarily long
time and through an arbitrary number of subsequent merges. This log's rows key off the *source's*
id, which is deleted by the merge itself — there is no cheap, correct way to go from "a `modules`
row currently under curriculum A" back to "was this specific row one of the ones a specific
historical merge moved in," especially after a second merge into A. The provenance fix needs its own
per-row marker column; this item's table cannot serve that purpose without becoming a different,
much more expensive design (effectively re-deriving row-level provenance from an operation-level
log, which is exactly the "expensive/fragile reverse lookup" both items' own text already
anticipated). Full reasoning recorded in `spec.md`'s and `architecture.md`'s dedicated sections so
neither item's future implementer has to re-derive this.

## Independent fork: e2e vs. backend-integration split across the four merge types

**Question:** does "prove the mechanism generalizes across all four merge types" require four full
UI-driven e2e tests, or can three of the four be proven at the integration layer?

**Recommended answer, taken:** one full e2e (subject, S1 — proves the entire stack: UI trigger,
real HTTP route, transactional write, read endpoint, render) plus three backend-integration tests
(tags/curricula/domain-nodes, S2–S4) that assert exact count correctness against real Postgres, plus
a second e2e (S5) that proves the *read/render* path generalizes across all four entity types
independent of how each row got there. This matches the established precedent from
`ontology-split-merge`/`curriculum-merge`/`domain-node-merge` — each of those three's own plans
already built and e2e-proved that specific merge type's UI trigger; re-driving all three again here
would duplicate proof this codebase already has, not add new coverage, and this item's actual new
surface (the log write's correctness and the read path's cross-entity-type rendering) is proven more
precisely by direct Postgres/DOM assertions than a fourth near-identical browser flow would add.

## Adversarial pass (advisor tool) — findings and resolutions

Run before confirmation, per this task's instructions. Six findings, four blocking:

1. **Files were drafted as `state: confirmed` before the consistency gate ran.** Fixed — flipped
   every `.planning/ontology-audit-trail/` file to `draft`, made the fixes below, then promoted all
   together after re-checking.
2. **S1's source domain node was left as "implementer's call" between a front-door action and a
   back-door seed — an unresolved fork the transcript's own earlier research (`domain-node-merge`'s
   plan) already answered.** Fixed — resolved to `seedAdditionalDomainNode` (the exported wrapper;
   `insertDomainNode` itself is module-private), matching the already-established fact that no
   front-door single-node creation action exists. `state-fixtures.md`/`playwright.md` updated.
3. **`Tx` was claimed as already exported from `merge-lock.ts` (it isn't — module-private `type
   Tx`), and the proposed `insertOntologyMergeLog(tx, params)` signature inverted this codebase's
   own established tx-last convention (`deleteGapMasteryForGapIds(gapIds, tx)`).** Fixed —
   `spec.md` now lists exporting `Tx` as an explicit files-to-modify item, and the signature is
   `insertOntologyMergeLog(params, tx)` everywhere it's referenced.
4. **The DoD's ordering test (`listRecentOntologyMerges` newest-first) would flake
   deterministically** — Postgres `now()` is transaction-start time, so multiple rows seeded in one
   transaction get identical timestamps and an `ORDER BY created_at DESC` has no defined order.
   Fixed — `InsertOntologyMergeLogParams` gained an explicit optional `createdAt`, and both the
   backend DoD test and S5's 4-row seed now pass distinct values instead of relying on the default.
5. **S1 only asserted rendered text was "correct," with no independent check of the actual numbers
   — and `mergeSubjects` has no backend-integration test in this plan to catch a wrong-but-
   consistently-rendered count.** Fixed — S1 now includes a direct-SQL cross-check against real
   post-merge row counts, mirroring `domain-node-merge`'s own two-layer S1 precedent.
6. **The negative-case (rejected merge writes zero log rows) was described inconsistently between
   `spec.md` (attached to `mergeCurricula`/`target_failed`) and `scenarios.md` (attached to the
   domain-node S4, "`cycle` or `target_failed`").** Fixed — standardized on `mergeCurricula`/
   `target_failed`, moved to S3, removed from S4, with the reasoning (`target_failed` needs no
   multi-node tree setup) stated in both files identically.

Everything else — the log-write-per-callback decision, the `jsonb` counts shape, the entity-folder
placement, the read-side location, and the "not a foundation for the provenance fix" conclusion —
held up under the adversarial pass unchanged.

## Settled vs. still open

Settled: log-write location, `reassigned_counts` shape, entity folder placement, read-side location,
relationship to the provenance-aware item, e2e/integration split, retention (none for v1), the
`created_at` index.

Still open: none. Every fork resolved to a recommended default backed by either direct precedent in
this codebase or a concrete correctness/cost argument. Nothing is deferred to
`/write-playwright-tests` or `/implement-playwright`.
