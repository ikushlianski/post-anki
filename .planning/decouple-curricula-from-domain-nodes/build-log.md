# Build log: Decouple curricula from domain node creation

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
