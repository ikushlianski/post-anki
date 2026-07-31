---
type: debrief
branch: main
feature: ontology-audit-trail
updated: 2026-07-31
verdict: sound
diagram-format: ascii
---

# Architecture Review: Merge/split audit trail (issue #62)

## What was reviewed

A new `ontology_merges` table that records one row per merge operation across all four existing
ontology merge functions — `mergeSubjects`, `mergeTags`, `mergeCurricula`, `mergeDomainNodes` — plus
a read-only "Recent ontology merges" section on the existing `/admin-observability` page. Already
merged into `main` (commit `b3133a6`, preceded by `31571d5` on its own branch) — this review runs
directly against the main checkout, not an unmerged worktree.

## Documentation found

Unusually complete for something built via `/grand-loop` + `/moonshine`: the full `.planning/
ontology-audit-trail/` plan set (spec.md, scenarios.md, architecture.md, playwright.md,
state-fixtures.md, discussion.md, e2e-tests.md, all `state: confirmed`), a build-time
`docs/architecture/ontology-audit-trail/architecture.md` with two Mermaid diagrams, and a
`review.md` written moments earlier by `/review-playwright` with the concrete e2e/regression
verdict (5/5 new scenarios, 70/84 full regression sweep, all 14 failures independently traced to
causes unrelated to this feature). Read all of it and cross-checked the architecture.md's claims
against the actual code — no drift found between what it describes and what shipped.

## As-built architecture

```
 subject.repo.ts        tag.repo.ts         curriculum.repo.ts    domain-map.repo.ts
 mergeSubjects()         mergeTags()          mergeCurricula()      mergeDomainNodes()
      │                     │                      │                      │
      ▼                     ▼                      ▼                      ▼
 withMergeLock() (shared/merge-lock.ts) — advisory lock, open tx — UNCHANGED by this item
      │                     │                      │                      │
      │  each callback's own body, one added line, right before its own return:
      ▼                     ▼                      ▼                      ▼
 tx.insert(ontologyMerges) — same open transaction as the reassignment/delete statements above it
      │                     │                      │                      │
      └─────────────────────┴──────────┬───────────┴──────────────────────┘
                                        ▼
                          ontology_merges (new table)
                          id, entityType, targetId/targetName,
                          sourceId/sourceName (snapshotted —
                          source row is deleted by the merge),
                          reassignedCounts jsonb, createdAt
                                        │
                                        ▼
                     ontology-merge.repo.ts: listRecentOntologyMerges(50)
                                        │
                                        ▼
              admin-observability.controller.ts → /admin-observability page
                     "Recent ontology merges" section (read-only, no auth ⚠
                      — same as every other section on this pre-existing page)
```

Entry point is never direct — the log write is reached only as the last step inside each of the
four merge functions' existing transaction, immediately before their existing return statement. No
new endpoint, no new lock, no new tx boundary. Read side is a single new query
(`listRecentOntologyMerges`) fanned into the admin-observability page's existing `Promise.all`
alongside its two pre-existing queries.

## Verdict

**Sound.** This is about as low-risk as a schema change gets: one new append-only table, one new
narrow write function called from four places that already had an open transaction and the exact
data (`targetRow`, `sourceRow`, per-table `.returning()` counts) the log needs, with no new locking,
no new endpoint, and no change to any existing return shape or error path. I independently verified
the two properties that actually matter for an audit log:

1. **The write really is atomic with the merge, not a best-effort side call.** Read all four call
   sites (`subject.repo.ts:127`, `tag.repo.ts:283`, `curriculum.repo.ts:642`,
   `domain-map.repo.ts:292`) — each call passes the open `tx`, `insertOntologyMergeLog` does not
   wrap itself in its own try/catch, so a failed insert throws and rolls back the whole merge with
   it. `/review-playwright`'s rollback test (`ontology-merge-log-rollback.integration.test.ts`)
   force-fails the insert and proves the reassignment/deletes roll back too — I re-ran it myself,
   2/2 pass.
2. **Preconditions run before the log write, not after.** In `mergeCurricula`, the `target_failed`
   check (added by a prior fix in this same queue) and the pending-structure-turn check both return
   early well before any mutation or the log insert — a rejected merge never produces a phantom log
   row. Confirmed by reading the function top to bottom, not just the log call site.

**The one real tradeoff, named plainly rather than treated as a gap:** the log write is a manual
one-line addition at each of the four call sites, not something `withMergeLock` enforces
structurally. `architecture.md` documents this as deliberate — keeping the shared helper's contract
narrow so it doesn't grow a logging-specific parameter — but it does mean a fifth future merge
function can be added without anyone remembering to call `insertOntologyMergeLog`, and nothing in
the type system would catch that omission. Low stakes for an audit log (worst case: a merge that
happened but isn't listed on an internal admin page), and the codebase already accepts this same
shape of risk elsewhere (e.g. `llm_call_events`), so this is consistent with existing practice, not
a new pattern being introduced carelessly.

**Not a new exposure:** `/admin-observability` has no auth check today, and this feature adds a
new query to that same unauthenticated page rather than introducing the gap itself — worth flagging
since it's now surfacing four entity types' full merge history (including curriculum/subject names)
to anyone who can reach the route, but this is pre-existing behavior for the whole page, not
something this item newly created.

## Questions a reviewer would ask

1. If a fifth merge function is added later, what actually stops someone from forgetting the
   `insertOntologyMergeLog` call — is a lint rule or a shared test fixture (e.g. "every function
   matching `merge*` must call `insertOntologyMergeLog`") worth the cost, or is four call sites too
   few to justify enforcing this mechanically yet?
2. `reassignedCounts` is a loosely-typed `Record<string, number>` jsonb column with each merge
   function choosing its own key names (`modulesMoved`, `topicsMoved`, ...) — is there a risk of
   silent inconsistency across entity types if a future contributor names a count differently than
   the existing three, given nothing validates the key shape?
3. `source_id`/`source_name` are denormalized at write time because the source row is deleted by
   the merge — has anyone confirmed `target_id` staying valid indefinitely (targets are never
   deleted, only merged into) is actually guaranteed, or could a future "delete this
   subject/curriculum" flow leave `target_id` dangling the same way `source_id` already does?
4. The admin-observability page has no auth today — is that an accepted risk specific to this being
   a single-user personal project with no public deployment of the admin routes, or is it a gap
   that predates this feature and just hasn't been prioritized?
5. `listRecentOntologyMerges` hardcodes a limit of 50 with no pagination — fine at current volume,
   but is there a plan for what happens to this admin view once merge activity genuinely accumulates
   past that, or is 50 intentionally "recent enough to be useful, not meant to be a full history"?
6. The architecture doc explicitly rules out extending this table into the provenance-aware
   `clearCurriculumStructure` fix (a still-open wishlist item) — is that boundary documented
   anywhere a future implementer of that item would actually see it before starting, or only in
   this file?

