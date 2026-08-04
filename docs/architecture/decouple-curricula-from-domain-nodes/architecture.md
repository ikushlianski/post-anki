---
type: architecture
state: shipped
---
# Architecture: Decouple curricula from domain node creation

Shipped for GitHub issue #84. Six placement forks were queued for human confirmation on that issue
(`needs:decision` label) before implementation started; this document reflects the recommended
option this ticket built against for each — see "Decisions" at the bottom.

## What changed

**Before this ticket:** creating a curriculum was what shaped a subject's domain-node tree.
`handleCreateCurriculum` (`apps/api/src/curriculum/curriculum.controller.ts`) called
`resolveDomainPlacement` (`apps/api/src/domain-map/domain-placement.orchestrator.ts`), which — when
no existing node matched by name — called a "sibling discovery" LLM agent that both placed the
topic AND inserted brand new `domain_nodes` rows on the spot. The result was written onto a single
nullable column, `curricula.domain_node_id`. A subject's domain map was therefore only ever as
complete as the curricula someone had actually created under it.

**Now:** domain-node *creation* and curriculum *placement* are two separate mechanisms.

1. **Static taxonomy nodes are seeded once**, independent of any curriculum
   (`apps/api/scripts/seed-domain-taxonomy.ts`, a manually-run script matching
   `seed-domain-nodes.ts`'s own precedent — a static in-file hierarchy, not a YAML file, since no
   such file exists in this repo and no scenario requires one). Seeded rows carry
   `domain_nodes.source = "static_taxonomy"`, distinct from every dynamically-created row
   (`source = "ai_generated"`, the default, unchanged for every pre-existing row).
2. **Curriculum-to-domain-node placement lives on a new many-to-many table**,
   `curriculum_domain_node_mappings` (curriculum ↔ domain node, with a `depth`, a `status`
   (`suggested` / `confirmed` / `rejected`) and a `source` (`ai_suggested` / `manual` / `auto`)).
   `curricula.domain_node_id` was migrated into this table and dropped in the same migration
   (`apps/api/src/db/migrations/0031_decouple_curricula_from_domain_nodes.sql`) — every pre-existing
   value became one pre-`confirmed`, `source: "auto"` row (every value in that column was written by
   `resolveDomainPlacement`, never by a direct write this ticket's own "manual" label would
   correctly describe).
3. **Placement is decided at creation time in this order — explicit choice first, subject type
   second.** `handleCreateCurriculum` checks `body.data.domainNodeId` FIRST, before ever looking at
   whether the subject is taxonomy-backed. An explicit node always wins regardless of subject type
   (mirrors `resolveDomainPlacement`'s own pre-existing "explicit always wins" precedent) — branching
   on subject type first would silently drop an explicit placement on a taxonomy-backed subject, a
   bug this plan's own grill-plan review caught before implementation began.
   - With no explicit node given, a subject with **no** static taxonomy (every subject that existed
     before this ticket, and every non-IT subject going forward — Business, Investing, Music,
     languages) keeps `resolveDomainPlacement`'s flow completely unchanged. The only difference is
     where the result lands: an auto-`confirmed` mapping row instead of a column write.
   - With no explicit node given, a subject **with** a static taxonomy gets a new, on-demand,
     AI-assisted mapping step: the user clicks "Map to taxonomy" on the curriculum detail page
     (`apps/web/src/curriculum/curriculum-domain-mapping-panel.tsx`), a new Mastra agent
     (`domainTaxonomyMapping`, `apps/api/src/mastra/domain-taxonomy-mapping.agent.ts`) proposes which
     taxonomy node(s) the curriculum's topics belong under, and the user approves (optionally
     adjusting the suggested depth first), or rejects, each suggestion before it counts toward that
     node's progress. This agent never creates a domain node directly — a topic with no confident
     match anywhere produces a `domain_topic_suggestion` (the existing "propose a new node" review row
     this codebase already had), reviewed through that same existing flow.
4. **`getDomainMapForSubject`** (`apps/api/src/domain-map/domain-map.repo.ts`) reads `confirmed` rows
   from the new mapping table instead of `curricula.domain_node_id`. The pure rollup deriver it calls,
   `domainNodeProgress` (`packages/core/src/domain-map/domain-map-progress.ts`), keeps its call shape
   — an array of `{domainNodeId, topics}` entries, one per confirmed mapping — but gained a dedup step:
   when a curriculum is confirmed against more than one node and those nodes share a common ancestor,
   that ancestor's subtree walk now dedups the flattened topic list by `topic.id` before averaging, so
   the curriculum's topics count once toward that ancestor's rollup, not once per mapped descendant.

## Placement mechanism (as built)

Three paths, evaluated in this order inside `handleCreateCurriculum`:

1. **Explicit** — `body.data.domainNodeId` is present and belongs to the curriculum's own subject.
   Writes an already-`confirmed`, `source: "manual"` mapping row in the same subject-locked
   transaction as the curriculum insert. No agent call, no suggestion round-trip. Also reachable
   later via `PATCH /curricula/:id { domainNodeId }` (`handleUpdateCurriculum` /
   `updateCurriculum`), which routes to the same `insertConfirmedMapping` call — this is what backs
   the pre-existing "change placement" panel (`apps/web/src/domain-map/curriculum-placement-panel.tsx`),
   unchanged in the UI, now backed by a many-to-many table underneath. Setting `domainNodeId: null`
   there resolves every currently-confirmed mapping for the curriculum to `rejected` (never deleted),
   since there is no longer a single column to null out.
2. **No explicit node, subject has no static taxonomy** — `resolveDomainPlacement` runs completely
   unmodified (explicit → normalized-name match → sibling-discovery agent, including creating new
   `domain_nodes` rows dynamically when needed). The resolved id, if any, lands as one auto-`confirmed`
   mapping row.
3. **No explicit node, subject has a static taxonomy** — placement is skipped entirely at creation
   time. The curriculum has no mapping rows until the user explicitly triggers "Map to taxonomy" on
   its detail page.

## Mapping trigger (as built)

`POST /curricula/:id/domain-mappings` (`curriculum-domain-mapping.controller.ts` →
`curriculum-domain-mapping.orchestrator.ts`):

1. Loads the curriculum and its subject's domain nodes; guards on the subject actually being
   taxonomy-backed (`resolveDomainNodeSource`, `packages/core/src/curriculum-domain-mapping/`) —
   `400 subject_has_no_static_taxonomy` otherwise, checked before any agent call.
2. Builds one prompt containing the subject's full taxonomy tree (each node's real id and name path)
   and the curriculum's module/topic titles, and calls the `domainTaxonomyMapping` agent exactly
   once.
3. The agent returns real node ids directly (not names resolved after the fact, unlike
   `sibling-discovery`/`domain-priority-review`'s agents) — the defense against a hallucinated id is
   `partitionMappingResult` (`packages/core/src/curriculum-domain-mapping/partition-mapping-result.ts`),
   a pure deriver that drops any returned `nodeId` not present in the subject's real tree before
   anything is inserted. `insertDomainNode` is never called anywhere in this orchestrator.
4. Every validated match becomes one `suggested` mapping row; every unmatched topic title becomes a
   `domain_topic_suggestion` via the existing, unmodified review flow.
5. Any agent failure (network, timeout, schema-invalid structured output) propagates as a thrown
   error — the controller turns that into a `502`, and nothing is inserted. This is a foreground,
   user-waited-on action, so it deliberately does not mirror `resolveDomainPlacement`'s silent
   agent-failure fallback.

`PATCH /curriculum-domain-mappings/:id` (`resolveMapping`) is claim-first:
`UPDATE ... WHERE status = 'suggested'` — this table's own not-yet-resolved value (not the literal
`'pending'` other suggestion tables in this codebase use, which is *their* vocabulary, not this
table's). A second resolution of an already-resolved row returns `already_resolved` (`409`), never a
duplicate write. Accepting can carry an optional depth override, which replaces the AI's originally
suggested depth when present.

## Data model

- **`curriculum_domain_node_mappings`** — `id`, `curriculum_id`, `domain_node_id`, `depth` (nullable),
  `status` (`suggested` | `confirmed` | `rejected`), `source` (`ai_suggested` | `manual` | `auto`),
  `created_at`, `resolved_at`. Never deleted on reject — same audit-trail convention as
  `domain_priority_suggestions` / `domain_topic_suggestions` / `domain_supersession_suggestions`.
  Deleted only when its owning curriculum is deleted, or when `mergeCurricula` absorbs the owning
  curriculum into another (the source's mapping rows are deleted along with the rest of its
  merge-absorbed state, matching every other row type that merge already drops rather than
  reassigns).
- **`domain_nodes.source`** — `"static_taxonomy"` | `"ai_generated"` (default), backward-compatible:
  every pre-existing row keeps behaving exactly as before.
- **`curricula.domain_node_id`** — retired. Migrated into one `confirmed`, `source: "auto"` mapping
  row per curriculum with a non-null value, then dropped.
- **`Curriculum.domainNodeId`** (the API/frontend field) — no longer a stored column. Derived at read
  time as the most recently confirmed mapping row for the curriculum, or `null` if none is confirmed.
  Kept purely for backward compatibility with the pre-existing single-value "change placement" panel;
  `CurriculumDetail.domainMappings` carries the full many-to-many list for the new panel.

## mergeDomainNodes and mergeCurricula — the found gaps

Neither of these existing merge functions was in the plan's own file list, but both directly touched
`curricula.domain_node_id` or a curriculum's placement and needed updating to not silently break or
leak state once the column was gone:

- **`mergeDomainNodes`** used to bulk-`UPDATE curricula SET domain_node_id = target WHERE
  domain_node_id = source`. The new table can already hold a row for `(curriculum, target)` before a
  merge runs (impossible under the old single column) — a blind bulk update would create a duplicate
  confirmed pair, rendering that curriculum twice under the target node. The merge now re-points each
  source-side mapping row individually, dropping the row instead of duplicating it when the target
  already has one for that curriculum. `getDomainMapForSubject`'s curricula-list assembly also
  defensively dedupes by curriculum id per node as a second guard.
- **`mergeCurricula`** never touched `curricula.domain_node_id` before this ticket (a merged-away
  source curriculum's old placement was simply lost with the row) — this ticket adds an explicit
  `deleteMappingsForCurriculum(sourceId)` call to that merge's transaction, preserving that exact same
  "not reassigned" behavior now that there's a real table to clean up rather than an implicit column
  drop.

## Failure modes

- **Mapping agent call fails** — the trigger endpoint returns a `502` and inserts nothing.
- **Agent hallucinates a node id** — `partitionMappingResult` drops it before any insert.
- **Concurrent accept/reject on the same suggestion** — claim-first write,
  `UPDATE ... WHERE status = 'suggested'`.
- **Subject deleted/merged mid-mapping** — same class of gap already logged and deliberately deferred
  for `resolveDomainPlacement`/`createCurriculum` (`.planning/wishlist.md`'s ontology-split-merge
  entry) — not newly introduced by this ticket, not fixed by it either.
- **Pre-existing, unrelated bug found during this ticket's own verification**:
  `mergeSubjects` (`apps/api/src/subject/subject.repo.ts`) reassigns `curricula.subject_id` and
  `domain_nodes.subject_id` onto the target subject, but never reassigns
  `domain_topic_suggestions.subject_id` — so a suggestion whose subject gets merged away can only ever
  be rejected afterward, never accepted. Confirmed unrelated to this ticket (zero diff in
  `subject.repo.ts`), logged as a follow-on, not fixed here.

## Rollout

1. Migration applied: `curriculum_domain_node_mappings` created, `domain_nodes.source` added,
   pre-existing `curricula.domain_node_id` values backfilled, column dropped.
2. `apps/api/scripts/seed-domain-taxonomy.ts` still needs to be run manually against production once
   Decision #2 below (which subject) is answered — not part of this migration, not automatic on
   deploy, matching `seed-subjects.ts`'s existing precedent.
3. Everything else (orchestrator, controller, agent, UI) ships and works immediately for
   non-taxonomy subjects (the auto-confirmed path) even before the seed script runs; the on-demand
   "Map to taxonomy" trigger simply has nothing to show for a subject with zero
   `static_taxonomy`-sourced nodes yet.
4. Legacy per-subject domain nodes created by the old sibling-discovery flow are left exactly as they
   are — reconciling them into the static taxonomy is scoped as a follow-on, not part of this ticket.

## Decisions (GitHub issue #84, `needs:decision`)

1. Domain nodes stay scoped **per subject** (not one global tree).
2. The seeded IT taxonomy targets **a new, dedicated subject** (not the existing "Programming / Web
   Development" subject) — parameterized in the seed script as a CLI argument, not hardcoded.
3. The AI mapping step runs **on demand** (a "Map to taxonomy" trigger the user clicks), not
   synchronously during curriculum creation.
4. Legacy domain nodes from the old dynamic-creation flow get **reconciled into the static taxonomy
   via the existing node-merge tool**, surfaced as review suggestions — scoped as a follow-on, not
   part of this ticket.
5. Subjects with no static taxonomy **keep the dynamic sibling-discovery flow unchanged**.
6. `curricula.domain_node_id` **was migrated into the new mapping table and dropped**.
