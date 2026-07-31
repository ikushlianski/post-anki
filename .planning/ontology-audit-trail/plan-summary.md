---
type: plan-summary
branch: ontology-audit-trail
task: ontology-audit-trail
state: confirmed
updated: 2026-07-31
---

# Plan summary: Merge/split audit trail

Closes issue #62. Issue #62 was filed against two merges (`mergeSubjects`, `mergeTags`); two more
(`mergeCurricula`, `mergeDomainNodes`) shipped since. This plan covers all four uniformly — a new
`ontology_merges` append-only log table, one insert call added inside each of the four merge
callbacks (not a hook inside the shared `withMergeLock` preamble — see spec.md's Decision #1), read
back on a new "Recent ontology merges" section on the existing `/admin-observability` page.

Business outcome: after any subject/tag/curriculum/domain-node merge, a human can open
`/admin-observability` and see exactly what merged into what, when, and how many rows moved —
enough to manually reconstruct a mistaken merge, without an automated undo (explicitly out of
scope, per the issue's own text).

Architectural relationship to the still-open "make `clearCurriculumStructure` provenance-aware"
wishlist item: related in spirit (both are "where did this row come from"), but NOT the same
mechanism and this item does not lay usable groundwork for that one. This log is an append-only,
write-time record of the MERGE OPERATION (source name, target name, counts, timestamp) — good for
a human reading history. The provenance fix needs a PER-ROW, queryable-at-delete-time marker on the
actual `modules`/`topics` rows themselves, since `clearCurriculumStructure` must ask "was THIS row
merged in?" at an arbitrary later time, and the merge's own source id no longer exists to look up by
then. See architecture.md's "Relationship to the provenance-aware fix" for the full reasoning — this
is stated explicitly so a future implementer doesn't re-derive it.

Verification: full BMAD + Playwright plan, 5 scenarios (2 e2e — one full-stack UI-driven proof via
subject merge, one read-path proof rendering all four entity types; 3 backend integration tests —
one per remaining merge type, matching this codebase's established "prove the write path against
real Postgres, prove UI wiring once" precedent from `ontology-split-merge`/`curriculum-merge`/
`domain-node-merge`). See `scenarios.md`, `playwright.md`, `state-fixtures.md`.

Files: see `spec.md`'s "Files to create/modify". One additive schema migration (new table only, no
columns added to existing tables). No new service.
