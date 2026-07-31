---
type: spec
branch: ontology-audit-trail
task: "Add a merge/split audit trail so a mistaken merge can be manually reversed (issue #62)"
complexity: medium
state: confirmed
updated: 2026-07-31
verification:
  targetDb: post-anki-e2e (local Docker Postgres, :5436)
  playwrightPlan: .planning/ontology-audit-trail/playwright.md
  stateFixtures: .planning/ontology-audit-trail/state-fixtures.md
---

# Spec: Merge/split audit trail

## What this ships

A durable, read-only log of every ontology merge — a new `ontology_merges` table, written to by
all four existing "absorb source into target" merges (`mergeSubjects`, `mergeTags`,
`mergeCurricula`, `mergeDomainNodes`), read back on a new section of the existing
`/admin-observability` page. Each log row records: which entity type merged, the target's id +
name, the source's id + name, and a count of what was reassigned (module/topic/curriculum/tag
counts — shape varies by entity type, see Decision #2). Not an automated undo — a human reading
the log can manually reconstruct what happened and, if needed, manually re-create the deleted
source row and manually reverse the reassignments. This matches the issue's own explicit scope
("not necessarily an automated undo, just enough information for a human to manually reconstruct
what happened").

## Scope boundary

**In scope:** one log row per successful merge, covering all four current merge functions; a
read-only list view.

**Out of scope, deliberately:**
- **Automated undo / one-click reverse.** Pre-answered directly by the issue text — "needs real
  product/architecture planning first — whether this extends to an actual one-click undo or stays
  a read-only audit log for a first cut." A read-only log is the first cut; undo is a distinct,
  much harder future item (it would need to re-create the deleted source row with its original id
  and reverse every reassignment, which for `mergeCurricula`/`mergeDomainNodes` includes rows that
  may have been further mutated since the merge — out of scope here).
- **Split.** Issue #62's title mentions "merge/split" but every existing operation in this
  codebase is merge-only (split is its own queued, unplanned wishlist item — "Add split... as the
  fast-follow to the merge-only ontology management"). There is no split operation to log yet.
- **The `clearCurriculumStructure` provenance-aware fix.** A related-sounding but structurally
  different mechanism — see "Relationship to the provenance-aware fix" below. Not solved here.
- **Any change to the four merge functions' existing behavior, return shape, or preconditions.**
  Purely additive — one more write per successful merge, nothing else changes.

## Data model

New table, no changes to any existing table:

```sql
CREATE TABLE ontology_merges (
  id text PRIMARY KEY,
  entity_type text NOT NULL,          -- 'subject' | 'tag' | 'curriculum' | 'domain_node'
  target_id text NOT NULL,
  target_name text NOT NULL,
  source_id text NOT NULL,
  source_name text NOT NULL,
  reassigned_counts jsonb NOT NULL,   -- e.g. {"curriculaMoved": 3, "domainNodesMoved": 1}
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ontology_merges_created_at_idx ON ontology_merges (created_at DESC);
```

`target_name`/`source_name` are snapshots taken at merge time, not live joins — the source row is
deleted by the merge itself (a live join would 404 forever after), and the target's name could be
renamed or itself later merged away, so a snapshot is the only way the log stays meaningful as a
historical record. This mirrors why `mergeCurricula` deliberately leaves `llm_call_events` pointing
at a deleted id rather than reassigning it (Decision #3 in that function's own docstring) — an
audit/observability record must reflect what was true at the time, not be silently rewritten later.

`reassigned_counts` is `jsonb`, typed at the Drizzle/Zod layer as `Record<string, number>` — not a
fixed set of columns — because the four merges have genuinely different count fields
(`curriculaMoved`/`domainNodesMoved` for subjects; `assignmentsMoved`/`assignmentsDeduped`/
`sessionsMoved` for tags; `modulesMoved`/`topicsMoved`/`sourcesMoved`/`socraticSessionsMoved`/
`probeSessionsMoved` for curricula; `curriculaMoved`/`childNodesMoved` for domain nodes). Forcing a
shared column vocabulary across four unrelated entities would be artificial; `jsonb` with a typed
`$type<Record<string, number>>()` cast matches an already-established pattern in this schema
(`structureSnapshot`, `toolActions`, `nativeAlternatives` all use typed `jsonb` for a
per-call-site-varying shape).

## Where the log write happens

**Decision: one line added inside each of the four merge callbacks, right before their existing
`return {...}` — not a hook inside `withMergeLock` itself.**

Reasoning: `withMergeLock`'s own doc comment already states its scope explicitly — "this helper
only ever adds `self_merge` to whatever error union `run`'s own return type already defines";
entity-specific logic is deliberately kept out of it. A logging hook inside `withMergeLock` would
need to be told the entity type, how to look up target/source names, and which fields of the
generic `<T>` result are "reassigned counts" versus a plain error — by the time `withMergeLock`
had enough information to do that generically, the call site would be passing it almost the exact
same data it would otherwise just log directly. Each callback, by contrast, already has the
target/source rows (fetched for its own precondition checks) and the exact result object it just
built — the log write is a single `tx.insert(ontologyMerges).values({...})` call using data already
in scope, inside the same transaction that's about to commit. This also gets atomicity for free: if
the log insert fails, the whole merge transaction rolls back with it, so a merge can never succeed
silently un-logged.

## New shared repo: `ontology-merge`

A genuine new entity, not a `shared/` utility (per this project's CLAUDE.md: `shared/lib` is only
for utilities with no domain affiliation; an audit-log row about a real domain event has one).

```ts
// apps/api/src/ontology-merge/ontology-merge.repo.ts

export type OntologyMergeEntityType = "subject" | "tag" | "curriculum" | "domain_node";

export interface InsertOntologyMergeLogParams {
  entityType: OntologyMergeEntityType;
  targetId: string;
  targetName: string;
  sourceId: string;
  sourceName: string;
  reassignedCounts: Record<string, number>;
  createdAt?: Date; // defaults to new Date() — see "Files to modify" note on avoiding tx-shared now()
}

export async function insertOntologyMergeLog(
  params: InsertOntologyMergeLogParams,
  tx: Tx,
): Promise<void> { /* tx.insert(ontologyMerges).values({ id: newId("omrg"), ...params, createdAt: params.createdAt ?? new Date() }) */ }

export async function listRecentOntologyMerges(limit = 50): Promise<OntologyMergeLogRow[]> {
  /* select * from ontology_merges order by created_at desc limit :limit */
}
```

Argument order is `(params, tx)` — `tx` last — matching this codebase's existing precedent for a
tx-taking repo function (`deleteGapMasteryForGapIds(gapIds, tx)` in
`apps/api/src/gap/gap-mastery.repo.ts`), not `(tx, params)`.

`Tx` is `apps/api/src/shared/merge-lock.ts`'s own transaction type — currently `type Tx = ...`
without an `export` keyword (module-private). This item must add `export` to that one line so
`ontology-merge.repo.ts` can import it; every merge callback already has an open `tx` in scope to
pass through.

`InsertOntologyMergeLogParams` also carries an optional `createdAt?: Date` (defaulting to
`new Date()` inside the function) — not left to Postgres's `DEFAULT now()`. Reason: `now()`
resolves to *transaction start time*, so any test that seeds multiple rows inside one transaction
(the DoD's own ordering proof, and S5's four-row seed) would get byte-identical timestamps and an
`ORDER BY created_at DESC` with no defined order — a guaranteed flake, not a rare one. Explicit,
distinct `createdAt` values close this before it's ever hit.

## Call-site changes (four, additive-only)

Each of the four merge functions gets one new line right before its existing return, using data
already computed in that function:

- **`mergeSubjects`** (`apps/api/src/subject/subject.repo.ts`) — after computing `movedCurricula`/
  `movedDomainNodes`: `await insertOntologyMergeLog({ entityType: "subject", targetId, targetName: targetRow.name, sourceId, sourceName: sourceRow.name, reassignedCounts: { curriculaMoved: movedCurricula.length, domainNodesMoved: movedDomainNodes.length } }, tx)`.
- **`mergeTags`** (`apps/api/src/tag/tag.repo.ts`) — `reassignedCounts: { assignmentsMoved, assignmentsDeduped, sessionsMoved }`.
- **`mergeCurricula`** (`apps/api/src/curriculum/curriculum.repo.ts`) — `reassignedCounts: { modulesMoved: movedModules.length, topicsMoved: movedTopics.length, sourcesMoved: movedSources.length, socraticSessionsMoved: movedSocraticSessions.length, probeSessionsMoved: movedProbeSessions.length }`.
- **`mergeDomainNodes`** (`apps/api/src/domain-map/domain-map.repo.ts`) — `reassignedCounts: { curriculaMoved: movedCurricula.length, childNodesMoved: movedChildNodes.length }`.

None of the four functions' existing preconditions, error unions, or return shapes change. The log
write only ever runs on the success path (after every precondition has passed) — a losing side of a
concurrent merge race, which returns `{ error: "not_found" }` before reaching the reassignment
code, never reaches the log write either, so the existing concurrency proofs for all four merges are
unaffected by this change.

## Read side — extends the existing admin-observability page

No new route. `packages/shared/src/admin-observability.ts`'s `adminObservabilitySchema` gets one
more field:

```ts
export const ontologyMergeLogRowSchema = z.object({
  id: z.string(),
  entityType: z.enum(["subject", "tag", "curriculum", "domain_node"]),
  targetId: z.string(),
  targetName: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  reassignedCounts: z.record(z.string(), z.number()),
  createdAt: z.string(),
});
export type OntologyMergeLogRow = z.infer<typeof ontologyMergeLogRowSchema>;

// adminObservabilitySchema gains:
recentMerges: z.array(ontologyMergeLogRowSchema),
```

`apps/api/src/admin-observability/admin-observability.controller.ts`'s `handleGetAdminObservability`
adds `listRecentOntologyMerges(50)` as a third parallel read (alongside `getStuckCurricula()` and
`getRecentLlmCallEvents(50)`), mirroring the existing `Promise.all` shape exactly. No change needed
in `apps/web/src/admin-observability/admin-observability.api.ts` — it already passes through
whatever shape `AdminObservability` has.

`apps/web/src/routes/admin-observability.tsx` gets a third `<section>`, "Recent ontology merges",
same table pattern as the existing two sections: columns Entity, Target, Source, Reassigned,
When. "Reassigned" renders the `reassignedCounts` record as a comma-joined `key: value` list (e.g.
"curriculaMoved: 3, domainNodesMoved: 1") — no per-entity-type custom formatting, since the whole
point of the generic `Record<string, number>` shape is that the display code doesn't need to know
the four entities' different field names either.

## Relationship to the provenance-aware fix (`clearCurriculumStructure`)

**Explicit conclusion: related in spirit, not the same mechanism, and this item's design does not
give the provenance fix a foundation to build on.**

This log is an **append-only, write-time event record about the merge operation itself** — good
for a human reading history after the fact ("what merged into what, and when"). The provenance fix
needs a **per-row, queryable-at-delete-time marker on the actual `modules`/`topics` rows** — when
`clearCurriculumStructure(curriculumId)` runs (at retry/reparse time, arbitrarily long after any
merge), it needs to ask, for each row currently under that curriculum id, "did THIS specific row
originate from a different curriculum via a merge?" — a question this log cannot cheaply answer:

- The merge's `source_id` is the *curriculum that was deleted* — by the time `clearCurriculumStructure`
  runs, that id refers to nothing, and the moved modules/topics now carry the *target's* curriculum
  id, with no column linking them back to which merge (if any) brought them in.
- Even a reverse lookup ("find every `ontology_merges` row where `entity_type = 'curriculum'` and
  `target_id = this curriculum's id`") only proves *a* merge happened into this curriculum at some
  point — it can't say which of the curriculum's *current* modules/topics came from that merge
  versus were already there, especially after multiple sequential merges into the same target.

The provenance fix's own proposed mechanism (a nullable `merged_from_curriculum_id` column
directly on `modules`/`topics`, written at reassignment time) is the right shape for that different
question, and is intentionally not built here — adding it as a byproduct of this item would be
solving a second, harder problem (with its own test matrix: what happens on a second merge into an
already-merged-into row, what a multi-level merge chain looks like) under an issue that only asked
for a read-only log. Both items independently touch `mergeCurricula`'s reassignment step, but for
different columns on different tables (`ontology_merges` here; `modules.merged_from_curriculum_id`
there) — there is no shared migration, shared function, or shared table between them. A future
implementer of the provenance fix should not look for one.

## Files to create

```
apps/api/src/ontology-merge/
  ontology-merge.repo.ts                          — insertOntologyMergeLog, listRecentOntologyMerges
  ontology-merge-log.integration.test.ts           — real-Postgres proof for mergeTags/mergeCurricula/mergeDomainNodes (S2, S3, S4)

apps/api/src/db/migrations/
  00XX_<generated-name>.sql                        — via `npm run db:generate -w @post-anki/api`, additive only (new table)

packages/shared/src/
  ontology-merge.ts                                — OntologyMergeEntityType, ontologyMergeLogRowSchema
```

## Files to modify

```
apps/api/src/
  db/schema.ts                                     — + ontologyMerges table
  shared/merge-lock.ts                              — export the existing Tx type (currently
                                                       module-private) so ontology-merge.repo.ts
                                                       can import it
  subject/subject.repo.ts                           — + 1 line in mergeSubjects
  tag/tag.repo.ts                                   — + 1 line in mergeTags
  curriculum/curriculum.repo.ts                     — + 1 line in mergeCurricula
  domain-map/domain-map.repo.ts                     — + 1 line in mergeDomainNodes
  admin-observability/admin-observability.controller.ts — + listRecentOntologyMerges(50) read

packages/shared/src/
  admin-observability.ts                            — + recentMerges field on adminObservabilitySchema

apps/web/src/routes/
  admin-observability.tsx                           — + "Recent ontology merges" section
```

## Decisions made autonomously

1. **Log write is one line per callback, not a hook inside `withMergeLock`.** Full reasoning above
   ("Where the log write happens"). Follows `withMergeLock`'s own stated precedent of keeping
   itself generic and pushing entity-specific logic into each callback.
2. **`reassigned_counts` is typed `jsonb` (`Record<string, number>`), not fixed columns or a Zod
   discriminated union.** The four merges' count fields don't share a vocabulary; forcing one would
   be artificial. Matches this schema's existing typed-`jsonb`-for-varying-shape pattern.
3. **New `apps/api/src/ontology-merge/` entity folder, not `apps/api/src/shared/`.** This project's
   CLAUDE.md restricts `shared/` to utilities with no domain affiliation; an audit log of merge
   events is a real domain concept, cross-cutting across four entities but not "generic."
4. **Read side extends the existing `/admin-observability` page with a third section, rather than a
   new route.** Mirrors the page's own existing pattern of two unrelated internal read-only lists
   coexisting on one page; matches the issue's own "even a simple list view is enough for a first
   cut" scope — inventing a dedicated route/page for three columns of read-only data would be
   over-building relative to what's asked.
5. **Read-only log, no automated undo — pre-answered by the issue text itself, not re-litigated.**
   "Needs real product/architecture planning first — whether this extends to an actual one-click
   undo or stays a read-only audit log for a first cut" (issue #62's own Note). This plan takes the
   read-only-first-cut branch explicitly.
6. **Relationship to the `clearCurriculumStructure` provenance-aware wishlist item: related in
   spirit, structurally distinct, no shared implementation surface.** Full reasoning above
   ("Relationship to the provenance-aware fix"). Stated explicitly so a future implementer of that
   item doesn't assume this table or its rows can serve as (or be extended into) that mechanism.
7. **No retention/expiry mechanism for v1.** Matches `domain_priority_suggestions`/
   `decide_blind_spots`/`llm_call_events`'s own established precedent of keeping every row forever;
   merges are infrequent, manually-triggered operator actions, not a high-volume event stream.
   `listRecentOntologyMerges(50)` caps the read side, mirroring `getRecentLlmCallEvents(50)`
   exactly — same reasoning, same limit.
8. **`ontology_merges` gets a `created_at` index from the start, unlike `llm_call_events`/
   `domain_priority_suggestions` (both unindexed today, the latter explicitly flagged as a
   non-urgent residual gap in a prior debrief).** Since every admin-observability page load runs an
   `ORDER BY created_at DESC LIMIT 50` against this table, adding the index at creation time is a
   one-line cost now versus a known, already-seen-elsewhere gap to fix retroactively later — not a
   new judgment call, just not repeating a gap this codebase has already flagged once.

### Definition of Done — per layer

**Backend.**
- `npx vitest run -w @post-anki/api` and `npx vitest run -w @post-anki/core` clean.
- **Migration applies cleanly.** `npm run db:generate -w @post-anki/api` produces a single additive
  migration (new table + index only, no ALTER on any existing table); the e2e stack's own migration
  step (already part of `dev:pw`'s orchestration) applies it without error against the local Docker
  Postgres.
- **Write-path proof, per entity type — exact file:**
  `apps/api/src/ontology-merge/ontology-merge-log.integration.test.ts`, three cases against real
  Postgres (S2, S3, S4 — `mergeSubjects` is covered by the e2e in S1 instead, so its write path is
  proven through the real HTTP route, not duplicated here):
  - **S2 — `mergeTags`.** Seed two real tags with known names, at least one shared tag-assignment
    (to produce a non-zero `assignmentsDeduped`) and at least one distinct assignment (non-zero
    `assignmentsMoved`). Call `mergeTags(targetId, sourceId)`. Direct SQL:
    `SELECT * FROM ontology_merges WHERE entity_type = 'tag' AND source_id = :sourceId` returns
    exactly one row, with `target_name`/`source_name` matching the seeded tag names exactly, and
    `reassigned_counts` matching the real `assignmentsMoved`/`assignmentsDeduped`/`sessionsMoved`
    values the merge itself returned (not just non-zero — the exact numbers, cross-checked against
    the function's own return value in the same test).
  - **S3 — `mergeCurricula`.** Seed two real curricula under the same subject with known names, at
    least one module + topic on the source (non-zero `modulesMoved`/`topicsMoved`), at least one
    source row and one probe_session row on the source. Call `mergeCurricula`. Same assertion shape
    as S2: exactly one log row, correct names, `reassigned_counts` matching the function's own
    returned counts exactly (all five fields).
  - **S4 — `mergeDomainNodes`.** Seed two real domain nodes under the same subject with known
    names, a curriculum attached to the source (non-zero `curriculaMoved`) and a child node under
    the source (non-zero `childNodesMoved`). Call `mergeDomainNodes`. Same assertion shape: exactly
    one log row, correct names, `reassigned_counts` matching both fields exactly.
  - **Negative case, same file, attached to the `mergeCurricula` (S3) case specifically:** a merge
    call that returns an error (`mergeCurricula` against a `target_failed` curriculum) writes
    **zero** `ontology_merges` rows — proving the log only ever records successful merges, never a
    rejected attempt. `mergeCurricula`/`target_failed` is used rather than `mergeDomainNodes`/
    `cycle` because it needs no multi-node tree setup — cheaper to construct, proves the same
    thing.
- **Read-path proof:** `listRecentOntologyMerges(2)` against a table seeded with 3 rows (mixed
  entity types), each inserted with an explicit, distinct `createdAt` value (not relying on
  Postgres's `now()`, which resolves to transaction-start time and would give same-transaction
  inserts identical timestamps — see `InsertOntologyMergeLogParams`'s `createdAt` field above),
  returns exactly 2, in the correct newest-first order determined by those explicit timestamps —
  proves the limit and the ordering deterministically, not just presence.

**Frontend.** e2e proof, exact scenario tags (see scenarios.md):
- `@ontology-audit-trail.S1` — merging two subjects via the real UI (the existing
  `MergeSubjectButton` flow) writes a log row end-to-end (proving the trigger wiring from the real
  HTTP route, not a direct function call), and that row is visible on `/admin-observability` with
  the correct target/source names and the correct `curriculaMoved`/`domainNodesMoved` counts —
  proving all four of: the UI merge action, the backend write, the read endpoint, and the render.
  **Two-layer check, not DOM-only** (mirrors `domain-node-merge`'s own S1 precedent): the DOM
  assertion confirms the rendered text is correct, AND a direct SQL query
  (`SELECT reassigned_counts FROM ontology_merges WHERE entity_type = 'subject' AND source_id = :sourceSubjectId`,
  reading the `curriculaMoved`/`domainNodesMoved` keys out of that jsonb value) is cross-checked
  against the real post-merge count of `curricula`/`domain_nodes` rows now carrying the target
  subject's id. `mergeSubjects` has no separate
  backend-integration test in this plan (S2–S4 cover tags/curricula/domain-nodes only — see
  discussion.md), so this two-layer check is the only place its own count correctness is proven; a
  DOM-only assertion would let a hardcoded or off-by-one count pass undetected.
- `@ontology-audit-trail.S5` — `/admin-observability`'s "Recent ontology merges" section correctly
  renders one seeded row of **each** of the four entity types (subject, tag, curriculum,
  domain_node) with the right target/source names and reassigned-counts text — the read-path proof
  that generalization holds on the display side too, independent of S1/S2/S3/S4's write-path
  proofs.

**Infrastructure.** N/A — no new service, no env var, no deploy change. One additive schema
migration (see Backend section above).

## Documentation changes

No existing `docs/architecture/<slug>.md` covers merge logging. This plan commits to publishing
`docs/architecture/ontology-audit-trail/architecture.md` during implementation, documenting the
log-write placement decision and the explicit relationship to the provenance-aware fix (see
`architecture.md` below, already drafted).
