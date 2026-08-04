---
type: todo
branch: decouple-curricula-from-domain-nodes
task: "Decouple curricula from domain node creation — map into static taxonomy instead (issue #84)"
state: open
updated: 2026-08-04
---
# Todo: Decouple curricula from domain node creation

## Decisions to make
- All six forks below are queued on GitHub issue #84 (`needs:decision` label) with a recommendation
  each — this plan proceeds on the recommendations, but none are resolved until Ilya answers on the
  issue. See `.planning/decouple-curricula-from-domain-nodes/decision-comment.md` for full reasoning.
  1. Domain nodes: stay per-subject, or become one global tree? (recommended: per-subject)
  2. Which subject receives the seeded IT taxonomy — existing "Programming / Web Development," or a
     new dedicated subject? (recommended: new dedicated subject)
  3. Does the AI mapping step run on-demand or synchronously at curriculum creation? (recommended:
     on-demand)
  4. How do pre-existing, dynamically-created domain nodes get reconciled with the new static
     taxonomy? (recommended: fold in via the existing node-merge tool, as reviewable suggestions —
     scoped as a follow-on ticket once #2 lands, not part of this one)
  5. Do subjects without a static taxonomy keep today's dynamic sibling-discovery flow, or lose
     domain-map growth entirely? (recommended: keep it unchanged)
  6. Does `curricula.domain_node_id` get migrated-and-dropped, or kept alongside the new mapping
     table? (recommended: migrated and dropped)

## To review / clarify
- [ ] Confirm which real subject(s) in production today have any `domain_nodes` rows at all, and
  whether any of that data is real/relied-upon — this determines how much is actually at stake in
  Decision #4 (reconciliation) once it's scheduled as a follow-on.
- [ ] Once Decision #2 lands, run `apps/api/scripts/seed-domain-taxonomy.ts` against production
  manually (matches `seed-subjects.ts`'s existing precedent of being a manually-triggered script, not
  part of app startup or a migration).

## Manual steps
- `apps/api/scripts/seed-domain-taxonomy.ts` must be run manually once, against production, after
  Decision #2 is answered — not part of the migration, not automatic on deploy (same precedent as
  `seed-subjects.ts`).
- The `needs:decision` label on issue #84 must be removed by Ilya once all six decisions are made —
  this plan does not clear it.

## Post-deploy checks
- [ ] After deploy, trigger the mapping step against one real curriculum under the seeded taxonomy
  subject and confirm a suggestion row appears with a real, existing node id (not a hallucinated one)
  — the first real-world check that `partitionMappingResult`'s validation is actually needed in
  practice, not just in the unit test's synthetic case.
- [ ] Confirm the non-taxonomy-subject path (SCENARIO 8) is truly unchanged by creating one test
  curriculum under a non-IT subject (e.g. "Music") and confirming it still lands under a
  dynamically-created domain node exactly as it does today.

## Coding tasks
- [x] `partitionMappingResult` deriver + tests (packages/core/src/curriculum-domain-mapping/)
- [x] `resolveDomainNodeSource` deriver + tests
- [x] `domainNodeProgress` topic-id dedup fix + regression test (double-count via shared ancestor)
- [x] Schema: `curriculumDomainNodeMappings` table, `domainNodes.source` column
- [x] `curriculum-domain-mapping.repo.ts`
- [x] `domain-taxonomy-mapping.agent.ts` + mastra.ts registration
- [x] `curriculum-domain-mapping.orchestrator.ts`
- [x] `curriculum-domain-mapping.controller.ts` + route wiring
- [x] `curriculum.controller.ts` / `curriculum.repo.ts` changes (explicit-first check, mapping-row
  writes, derived `Curriculum.domainNodeId` read field, delete cleanup)
- [x] `domain-map.repo.ts`: `getDomainMapForSubject` rewrite + `mergeDomainNodes` rewrite
- [x] Electric compat: `board.collection.ts` one-line normalization
- [x] Migration: add table/column, backfill, drop `curricula.domain_node_id` — applied to local dev
  DB and e2e DB, verified via `\d` against real Postgres
- [x] Fix integration tests that hand-INSERT `curricula.domain_node_id` — all pass against a
  freshly reset e2e DB (190/191 total in the affected folders; the 1 failure is a confirmed
  pre-existing, unrelated bug — see "Pre-existing bug found during verification" below)
- [x] `domain-node-merge-concurrency.integration.test.ts` — added SCENARIO 1b: a curriculum
  confirmed-mapped to BOTH source and target before a merge ends up with exactly one confirmed
  `(curriculum, target)` row after, not two — proves `mergeDomainNodes`' per-row dedup guard and
  `getDomainMapForSubject`'s read-side dedup, neither of which the original SCENARIO 1/4 tests
  exercised (both only ever mapped the curriculum to the source side)
- [x] `curriculum-domain-mapping.orchestrator.test.ts` — 10/10 passing, including the DoD's
  required hallucinated-node-id case
- [x] `seed-domain-taxonomy.ts` script (static in-file hierarchy, subject id via CLI arg — see
  "Implementation gaps" below for the YAML deviation)
- [x] Frontend: `curriculum-domain-mapping-panel.tsx` + `curriculum-domain-mapping.api.ts` + wiring
  into `curriculum.$curriculumId.tsx`; also added `DomainNodeTreeItem.source` (shared schema +
  `domain-map.repo.ts`) so the panel can gate its own visibility client-side — not explicitly named
  in spec.md's file tables but required for "taxonomy-backed subjects only" rendering
- [x] `docs/architecture/decouple-curricula-from-domain-nodes/architecture.md`
- [x] Verification: vitest (237 fast + 134/135 integration, 1 pre-existing unrelated failure), full
  typecheck (shared/core/api/web/bot/mobile all clean), no separate lint step in this repo beyond
  typecheck (`bot`'s own "lint" script is a typecheck alias; no ESLint config found)
- [x] Runtime proof: curl against a real dev server (both the 200 taxonomy-suggestion case and the
  400 `subject_has_no_static_taxonomy` case) + a real Playwright click-through (trigger → suggest →
  accept → appears on `/subject/:id/map`), all against a real LLM call, not mocked

## Implementation gaps found before coding (not covered by spec.md's file tables)
- `curriculum-placement-panel.tsx` and its "change placement" flow are NOT listed in spec.md's
  "Files to modify"/"Files by scenario" tables, yet they depend on `curricula.domain_node_id`
  (dropped by Decision #6). Resolution: keep `Curriculum.domainNodeId` as a DERIVED read field
  (the oldest/newest `confirmed` mapping row for the curriculum — see repo comment at
  implementation time), not a stored column. `PATCH /curricula/:id { domainNodeId: null }` (the
  panel's "— unplaced —" option) flips the curriculum's `confirmed` mapping rows to `rejected`
  (audit-trail convention, never deleted) rather than clearing a column. Panel itself needs zero
  code changes — it only ever consumed a nullable string field, which it still gets.
- `domain-map.repo.ts`'s `mergeDomainNodes` (not in spec's file tables either) currently does
  `UPDATE curricula SET domain_node_id = target WHERE domain_node_id = source` — must become a
  re-point of `curriculum_domain_node_mappings` rows instead. Because the old single column could
  never produce duplicates but the new many-to-many table can (if a curriculum is already mapped
  to the target), the merge must not blindly bulk-update: for each source-side row, only re-point
  it onto the target if no row already exists for that (curriculumId, targetId) pair; otherwise
  drop the redundant source-side row. `getDomainMapForSubject`'s curricula-list assembly also
  defensively dedupes by curriculum id per node as a second guard.
- `apps/web/src/curriculum/board.collection.ts` (Electric raw-row sync) reads `domain_node_id`
  directly off the replicated `curricula` Postgres row — not in spec's file tables. Nothing in the
  dashboard board UI actually displays this field, so the fix is a one-line
  `row.domain_node_id ?? null` normalization rather than adding a second Electric collection to
  join the new mapping table.
- Several integration tests hand-INSERT `curricula` rows with an explicit `domain_node_id` value
  (`domain-node-merge-concurrency.integration.test.ts`, `ontology-merge-log.integration.test.ts`,
  `subject-merge-concurrency.integration.test.ts`, `domain-placement.integration.test.ts`) — these
  break once the column is dropped and need updating to insert/assert against
  `curriculum_domain_node_mappings` instead.
- Seed script deviation from architecture.md's literal text: no `.planning/design-knowledge-
  taxonomy/taxonomy.yaml` file exists anywhere in the repo, and no YAML-parsing dependency is
  installed. `seed-domain-taxonomy.ts` mirrors the existing `seed-domain-nodes.ts` script's own
  pattern instead — a static in-file `SEED_HIERARCHY`, idempotent skip-if-exists, subject id/name
  taken as a CLI argument. No scenario tests the seed script's data-loading mechanism directly.
- e2e test authoring skipped: this repo's actual Playwright test content lives in a separate
  repository (`verification-repo`), out of scope for this worktree. DoD's frontend criterion is
  proven via a live dev server + Playwright driven directly from this session instead of a
  committed e2e test.

## Data-loss bug found in code review and fixed
- `mergeDomainNodes`'s curriculum-mapping re-point logic (`domain-map.repo.ts`) originally treated
  the target having ANY row (any status) for a curriculum as "already there, skip" — so a stale
  rejected/suggested row at the target caused the source's real CONFIRMED row to be deleted as a
  false duplicate, leaving the curriculum with zero confirmed placements. It also picked
  nondeterministically among multiple source-side rows for the same curriculum (e.g. a rejected AI
  suggestion plus a confirmed manual one — reachable via this ticket's own "Map to taxonomy" flow),
  sometimes dropping the confirmed row. Fixed: the "already there" check now only counts
  `status = 'confirmed'`; per curriculum at the source, the confirmed row (if any) is the one that
  gets re-pointed/deduped, and non-confirmed rows are handled separately rather than competing with
  it for the same slot. Covered by SCENARIO 1c/1d/1e in
  `domain-node-merge-concurrency.integration.test.ts`.
- Side effect worth flagging, not a regression: non-confirmed (pending/rejected) rows at the source
  are now re-pointed onto the target rather than silently dropped when there's no confirmed row to
  disambiguate against. A curriculum with unresolved suggestions on both the source and target nodes
  before a merge can end up with two pending rows for the same (curriculum, target) pair afterward —
  harmless (no unique constraint, and `getDomainMapForSubject` only ever reads `status = 'confirmed'`),
  but the mapping panel would show two resolvable suggestion entries instead of one deduped down to
  one. Not folded into this fix since it's cosmetic, not data loss.
- `movedCurricula.length`/`curriculaMoved` also used to count every distinct curriculum id touched
  at the source, including ones whose only row was deleted as a duplicate (not genuinely moved).
  Fixed alongside the main bug: it now only counts curricula whose confirmed row was actually
  re-pointed. This changes real merge audit-log numbers (`insertOntologyMergeLog`) for merges where
  the curriculum was already confirmed at the target — those now correctly log `curriculaMoved: 0`
  instead of `1`.

## Pre-existing bug found during verification (out of scope, not caused by this ticket)
- `apps/api/src/domain-map/topic-suggestion-accept-merge-race.integration.test.ts` — "accepts a
  reassigned suggestion normally after the merge completes" fails against a freshly reset e2e DB,
  independent of this ticket (zero diff in `subject.repo.ts` or `resolveDomainTopicSuggestion`).
  Root cause: `mergeSubjects` (`apps/api/src/subject/subject.repo.ts`) reassigns
  `curricula.subject_id` and `domain_nodes.subject_id` onto the target subject, but never
  reassigns `domain_topic_suggestions.subject_id` — so a pending suggestion whose subject gets
  merged away can only ever be rejected afterward (rejecting doesn't require the subject to
  exist), never accepted (accepting does, and 404s with `subject_not_found` since the source
  subject row is gone). Worth a real follow-on ticket; not touched here since `subject.repo.ts`
  and `mergeSubjects` are outside this ticket's file scope.

## Follow-on candidates (not this ticket)
- Bootstrap the constitution's `docs/architecture/<domain>/<component-slug>.md` taxonomy for this
  repo — currently using a per-ticket-folder convention instead (see spec.md's Documentation
  changes). Worth doing once, deliberately, not folded into an unrelated ticket.
- Legacy domain-node reconciliation (Decision #4) — a real follow-on ticket once Decision #2 lands.
- A subject-wide "review all pending mappings" panel, if the per-curriculum trigger/review flow
  proves too slow to use once there are many curricula under the taxonomy subject.
