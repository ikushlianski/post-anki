---
type: spec
branch: decouple-curricula-from-domain-nodes
task: "Decouple curricula from domain node creation — map into static taxonomy instead (issue #84)"
complexity: complex
state: confirmed
updated: 2026-08-04
---
# Spec: Decouple curricula from domain node creation

Fixed constraints: six forks queued on GitHub issue #84 (`needs:decision` label) — this spec is
written against the recommended option for each (listed in "Decisions pending confirmation" below).
If Ilya answers differently, this spec gets revised before implementation starts.

### Implementation Phases

Single phase — one vertical slice (schema → derivers → orchestrator/agent → controller/routes →
shared schemas → UI → migration → seed script). Reconciliation of pre-existing legacy domain nodes
into the taxonomy (Decision #4) is explicitly out of scope for this phase — see Scope boundary.

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `partitionMappingResult` (`packages/core/src/curriculum-domain-mapping/partition-mapping-result.ts`) | the mapping agent's raw structured output (`{nodeId, depth}[]`, `unmatchedTopics: string[]`), `existingNodeIds: Set<string>` (every real node id in the subject's tree) | `{ matched: {nodeId: string; depth: DepthLevel}[]; unmatchedTopics: string[] }` — any `nodeId` not present in `existingNodeIds` is dropped from `matched`, never inserted | SCENARIO 1, 6, 7 |
| `resolveDomainNodeSource` (`packages/core/src/curriculum-domain-mapping/resolve-domain-node-source.ts`) | `nodes: { source: "static_taxonomy" \| "ai_generated" }[]` (every domain node row for a subject) | `"static_taxonomy" \| "dynamic" \| "empty"` — `"static_taxonomy"` if any node carries that source, `"empty"` if the array is empty, `"dynamic"` otherwise | SCENARIO 1, 8 |
| `domainNodeProgress` (`packages/core/src/domain-map/domain-map-progress.ts`) | `nodeId`, `nodes: DomainNodeRef[]`, `curriculumTopics: DomainNodeCurriculumTopics[]` (unchanged shape) | `ModuleProgress` — **gains a dedup-by-`topic.id` step** before calling `moduleProgress`, so a curriculum confirmed against two nodes that share a common ancestor contributes its topics to that ancestor's rollup once, not once per mapped descendant | SCENARIO 2, 9 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 (trigger produces suggestions) | `curriculum-domain-mapping.orchestrator.ts`, `curriculum-domain-mapping.repo.ts`, `curriculum-domain-mapping.controller.ts`, `domain-taxonomy-mapping.agent.ts`, `partition-mapping-result.ts`, `resolve-domain-node-source.ts` | `curriculum-domain-mapping-panel.tsx`, `curriculum-domain-mapping.api.ts` | None |
| SCENARIO 2 (approve places on map) | `curriculum-domain-mapping.repo.ts` (resolve/accept), `domain-map.repo.ts` (`getDomainMapForSubject` reads confirmed rows) | `curriculum-domain-mapping-panel.tsx` | None |
| SCENARIO 3 (reject leaves map unchanged) | `curriculum-domain-mapping.repo.ts` (resolve/reject) | `curriculum-domain-mapping-panel.tsx` | None |
| SCENARIO 4 (adjust depth before approving) | `curriculum-domain-mapping.controller.ts`, `curriculum-domain-mapping.repo.ts` | `curriculum-domain-mapping-panel.tsx` (depth selector) | None |
| SCENARIO 5 (explicit manual placement, any subject) | `curriculum.controller.ts` (`handleCreateCurriculum` checks `domainNodeId` before subject-type branching), `curriculum.repo.ts` (`createCurriculum`, `updateCurriculum`), `curriculum-domain-mapping.repo.ts` (`insertConfirmedMapping`) | `domain-map-tree.tsx` ("add course here" — no visible change, same call shape) | None |
| SCENARIO 6 (no confident match) | `curriculum-domain-mapping.orchestrator.ts`, `partition-mapping-result.ts` | `curriculum-domain-mapping-panel.tsx` (empty state) | None |
| SCENARIO 7 (unmatched topic → existing suggestion flow) | `curriculum-domain-mapping.orchestrator.ts` (calls existing `insertDomainTopicSuggestion`) | None | None |
| SCENARIO 8 (non-taxonomy subject unchanged) | `curriculum.controller.ts` (`handleCreateCurriculum` branches on `resolveDomainNodeSource`), `curriculum.repo.ts` (`createCurriculum` writes an auto-confirmed mapping instead of a column) | None | None |
| SCENARIO 9 (many-to-many progress) | `domain-map.repo.ts` (`getDomainMapForSubject`), `packages/core/src/domain-map/domain-map-progress.ts` (`domainNodeProgress` — dedup by topic id, see Derivers) | `domain-map-tree.tsx` (curriculum can appear under multiple nodes — no code change, existing list rendering already supports it) | None |
| SCENARIO 10 (migration preserves placement) | `apps/api/src/db/migrations/*` (new migration), `schema.ts` | None | None |
| SCENARIO 11 (agent failure loses no data) | `curriculum-domain-mapping.controller.ts`, `curriculum-domain-mapping.orchestrator.ts` | `curriculum-domain-mapping-panel.tsx` (error state) | None |
| SCENARIO 12 (concurrent accept/reject) | `curriculum-domain-mapping.repo.ts` (claim-first `WHERE status = 'suggested'` guard) | `curriculum-domain-mapping-panel.tsx` (stale-suggestion error surfaced) | None |
| SCENARIO 13 (delete cleans up mappings) | `curriculum.repo.ts` (`deleteCurriculumWith`), `curriculum-domain-mapping.repo.ts` | None | None |

### Files to create

```
apps/api/src/curriculum-domain-mapping/
  curriculum-domain-mapping.repo.ts            — CRUD for curriculum_domain_node_mappings: insertSuggestedMappings, insertConfirmedMapping (manual/auto paths), listMappingsForCurriculum, resolveMapping (claim-first accept/reject via `UPDATE ... WHERE status = 'suggested'` — this table's own not-yet-resolved value, not the literal `'pending'` other suggestion tables use; optional depth override on accept), deleteMappingsForCurriculum
  curriculum-domain-mapping.orchestrator.ts    — triggerCurriculumDomainMapping(curriculumId): loads curriculum + modules/topics + subject's domain nodes, guards on resolveDomainNodeSource === "static_taxonomy" (400 otherwise), builds the mapping prompt inline (mirrors buildSiblingDiscoveryPrompt's placement in domain-placement.orchestrator.ts), calls the domainTaxonomyMapping agent, partitions the result via partitionMappingResult, inserts suggested rows + domain_topic_suggestions for unmatched topics
  curriculum-domain-mapping.controller.ts      — POST /curricula/:id/domain-mappings (trigger), GET /curricula/:id/domain-mappings (list), PATCH /curriculum-domain-mappings/:id (resolve — accept with optional depth, or reject)
  curriculum-domain-mapping.orchestrator.test.ts
  curriculum-domain-mapping.repo.integration.test.ts

apps/api/src/mastra/
  domain-taxonomy-mapping.agent.ts             — new Mastra agent, mirrors sibling-discovery.agent.ts's structured-output pattern; instructions: given the subject's full taxonomy tree (name + path per node) and the curriculum's module/topic titles, return candidate {nodeId, depth} matches plus any topic titles that fit nowhere

packages/core/src/curriculum-domain-mapping/
  partition-mapping-result.ts
  partition-mapping-result.test.ts
  resolve-domain-node-source.ts
  resolve-domain-node-source.test.ts

apps/api/scripts/
  seed-domain-taxonomy.ts                      — reads the taxonomy YAML, inserts domain_nodes rows recursively with source="static_taxonomy", idempotent (matches seed-subjects.ts's skip-if-exists pattern), subject id/name taken as a script argument (not hardcoded — Decision #2 is still pending)

apps/web/src/curriculum/
  curriculum-domain-mapping-panel.tsx          — "Map to taxonomy" trigger + suggestion list (accept/reject/adjust-depth), rendered on the curriculum detail page for taxonomy-backed subjects only
  curriculum-domain-mapping.api.ts             — client for the three new endpoints

docs/architecture/decouple-curricula-from-domain-nodes/
  architecture.md                              — copy of this ticket's architecture.md, matching this repo's existing per-ticket docs/architecture/<slug>/ convention (see Documentation changes below)
```

### Files to modify

```
apps/api/src/db/schema.ts                      — add curriculumDomainNodeMappings table; add domainNodes.source column (default "ai_generated"); drop curricula.domainNodeId
apps/api/src/domain-map/domain-map.repo.ts      — getDomainMapForSubject: join through curriculum_domain_node_mappings (status="confirmed") instead of curricula.domainNodeId; call shape into domainNodeProgress is unchanged (still one {domainNodeId, topics} entry per confirmed mapping)
packages/core/src/domain-map/domain-map-progress.ts — domainNodeProgress: dedup the flattened topics list by topic.id before calling moduleProgress (found during grill-plan review — without this, a curriculum confirmed against two nodes with a shared ancestor double-counts its topics in that ancestor's topicsIncluded/topicsMastered, since two {domainNodeId, topics} entries for the same curriculum both land in the ancestor's subtree and neither is deduplicated today)
apps/api/src/curriculum/curriculum.repo.ts      — createCurriculum: stop writing curricula.domainNodeId; insert a mapping row (confirmed/auto or confirmed/manual, inside the same withSubjectLock transaction) when placement resolved; updateCurriculum: domainNodeId patch path redirected to insertConfirmedMapping; deleteCurriculumWith: add mapping-row cleanup
apps/api/src/curriculum/curriculum.controller.ts — handleCreateCurriculum: check `body.data.domainNodeId` FIRST — if present, validate it belongs to the subject and write a confirmed/manual mapping directly (SCENARIO 5), regardless of subject type; only when no explicit node was given does it call resolveDomainNodeSource on the subject's existing nodes to decide between resolveDomainPlacement (non-taxonomy path, unchanged) or skipping placement entirely (taxonomy path — mapping happens later, on demand). This order matters: branching on subject type before checking for an explicit id would silently drop an explicit placement on a taxonomy-backed subject (caught in grill-plan review — see architecture.md). handleUpdateCurriculum: domainNodeId patch validated the same way, routed to insertConfirmedMapping
apps/api/src/mastra/mastra.ts                   — register AGENT_KEYS.domainTaxonomyMapping
packages/shared/src/domain-map.ts               — add curriculumDomainNodeMappingSchema/type, mapping status enum, extend domainNodeSchema with source
packages/shared/src/curriculum.ts               — CurriculumDetail gains an optional domainMappings field for the detail page (no change to createCurriculumInput — domainNodeId stays the explicit-placement escape hatch)
```

### Data model changes

See architecture.md's "Data model evolution" for full detail. Summary: new `curriculum_domain_node_mappings` table (many-to-many, curriculum ↔ domain_nodes, with `depth`/`status`/`source`); `domain_nodes.source` column added; `curricula.domain_node_id` migrated and dropped in the same migration (Decision #6).

### Documentation changes

This repo does not yet have the `docs/architecture/<domain>/<component-slug>.md` domain taxonomy the
constitution describes (no `docs/architecture/README.md` exists) — its actual, consistently-used
convention across 15+ prior tickets is one folder per ticket under `docs/architecture/<ticket-slug>/`
(e.g. `docs/architecture/domain-node-merge/`, `docs/architecture/curriculum-merge/`). Bootstrapping a
new domain/component taxonomy is a real, separate decision (which domains, whether to migrate 15+
existing docs) that doesn't belong folded into this ticket's own scope on an unattended run — this
plan follows the repo's existing convention instead: `docs/architecture/decouple-curricula-from-
domain-nodes/architecture.md` is created (copy of this ticket's own architecture.md, current-state
framing), matching precedent. Bootstrapping the formal taxonomy is logged as a separate wishlist
candidate (see todo.md).

### BAML test coverage

Not applicable — no BAML functions touched. This codebase's AI-assisted steps (including the new
mapping agent) use Mastra agents with `structuredOutput`, not BAML — same pattern as
`sibling-discovery.agent.ts`, `domain-priority-review` agent, and `subject-duplicate`'s embeddings
client.

### Decisions made autonomously

- **AI mapping mechanism: structured-output LLM classification, not embeddings.** Mapping a
  curriculum's topics onto a fixed, named taxonomy is a classification problem (like the existing
  `domain_topic_suggestions` new-node proposals and `sibling-discovery`'s placement), not a
  similarity-dedup problem (like `subject-duplicate`'s embeddings). Reuses the existing Mastra
  structured-output agent pattern already proven in this codebase.
- **Mapping depth reuses the existing `DepthLevel` enum** (`awareness`/`working`/`deep`,
  `packages/shared/src/depth.ts`) rather than inventing a new coverage scale — this is the same
  enum `domain_nodes.target_depth` and `topics.depth` already use.
- **Explicit manual placement always bypasses AI mapping**, writing an already-`confirmed` row
  directly — mirrors `resolveDomainPlacement`'s existing "explicit always wins" precedent (Path 1)
  and the domain map tree's existing "add course here" UX, unchanged.
- **The mapping UI lives on the curriculum detail page**, not a separate subject-wide review route —
  simpler than a dedicated panel (like `domain-priority-review`'s own page), and the natural place a
  user reviews one curriculum's placement; a subject-wide review view can be added later if the
  per-curriculum flow proves too slow to use in practice.
- **New endpoint naming**: `POST/GET /curricula/:id/domain-mappings`, `PATCH /curriculum-domain-
  mappings/:id` — RESTful, resource-first, matches this repo's existing `PATCH /domain-priority-
  suggestions/:id` / `PATCH /domain-topic-suggestions/:id` shape.
- **Documentation location**: per-ticket `docs/architecture/<slug>/` folder, matching this repo's
  actual existing convention rather than the constitution's not-yet-bootstrapped domain taxonomy (see
  "Documentation changes" above).

**Fixed during grill-plan review, before first confirmation** (a dispatched fresh-eyes subagent
red-teamed this plan and found four internal-consistency gaps in the new design — not in this plan's
description of existing code, which it verified as accurate):
- `domainNodeProgress` needed a topic-id dedup step, or a curriculum mapped to two nodes sharing an
  ancestor would double-count its topics in that ancestor's rollup (SCENARIO 9) — fixed in the
  Derivers table above.
- `handleCreateCurriculum` must check for an explicit `domainNodeId` **before** branching on subject
  type, or an explicit placement on a taxonomy-backed subject would be silently dropped instead of
  confirmed (SCENARIO 5) — fixed in "Files to modify" above and in architecture.md's diagram.
- The claim-first concurrency guard must use `WHERE status = 'suggested'` (this table's own
  vocabulary), not the literal `'pending'` copied from `resolveDomainTopicSuggestion`'s different
  table — copying the literal would make every accept/reject a permanent no-op (SCENARIO 12).
- The migration backfill must tag pre-existing rows `source: "auto"`, not `"manual"` — every value
  ever written to `curricula.domain_node_id` came from `resolveDomainPlacement`, including its own
  explicit-placement case, so `"manual"` (this plan's label for a direct, non-`resolveDomainPlacement`
  write) would misrepresent their provenance (SCENARIO 10).

Plan auto-confirmed by grand-loop (no human present to review) — consistency gate passed with 0 gaps
after two passes: the first pass found 0 gaps against the plan's own internal cross-references; a
dispatched grill-plan-ie subagent then found 4 further internal-consistency gaps in the new design
(listed above, all fixed and re-verified) that the first pass's mechanical checks couldn't have
caught since they were correctness bugs in a self-consistent-looking design, not cross-reference
mismatches between files.

### Decisions pending confirmation (GitHub issue #84)

1. Domain nodes stay **per subject** (not global) — see architecture.md.
2. Taxonomy seeds into **a new dedicated subject**, not "Programming / Web Development."
3. AI mapping runs **on demand**, not synchronously at curriculum creation.
4. Legacy domain nodes get **reconciled via the existing merge tool as reviewable suggestions** —
   scoped as a follow-on, not part of this ticket (see Scope boundary).
5. Non-taxonomy subjects **keep today's dynamic sibling-discovery flow unchanged**.
6. `curricula.domain_node_id` **is migrated and dropped**, not kept alongside the new table.

Full reasoning: `.planning/decouple-curricula-from-domain-nodes/decision-comment.md` / issue #84.

### Implementation order

1. `partitionMappingResult` — red-green-refactor, covers SCENARIO 1, 6, 7
2. `resolveDomainNodeSource` — red-green-refactor, covers SCENARIO 1, 8
3. Schema: `curriculum_domain_node_mappings` table, `domain_nodes.source` column (migration generated, not pushed)
4. `curriculum-domain-mapping.repo.ts` — insert/list/resolve/delete, covers SCENARIO 2, 3, 4, 12, 13
5. `domain-taxonomy-mapping.agent.ts` + registration in `mastra.ts`
6. `curriculum-domain-mapping.orchestrator.ts` — covers SCENARIO 1, 6, 7, 11
7. `curriculum-domain-mapping.controller.ts` + route wiring
8. `curriculum.repo.ts` / `curriculum.controller.ts` changes — covers SCENARIO 5, 8, 13
9. `domain-map.repo.ts`'s `getDomainMapForSubject` rewrite, plus `domainNodeProgress`'s topic-id dedup fix — red-green-refactor on the dedup case first ("a curriculum mapped to two nodes under the same ancestor counts its topics once, not twice, in that ancestor's rollup"), then the rewrite — covers SCENARIO 2, 9
10. Data migration: backfill `curricula.domain_node_id` into the mapping table, then drop the column — covers SCENARIO 10
11. `apps/api/scripts/seed-domain-taxonomy.ts`
12. Frontend: `curriculum-domain-mapping-panel.tsx`, `curriculum-domain-mapping.api.ts`, wiring into the curriculum detail page
13. `docs/architecture/decouple-curricula-from-domain-nodes/architecture.md`

### Definition of Done — per layer

- **Backend**: `npx vitest run apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.test.ts` passes, including the test case "drops any AI-suggested node id not present in the subject's real tree, and never calls insertDomainNode." Runtime proof once deployed: `curl -X POST http://localhost:8080/curricula/<taxonomy-subject-curriculum-id>/domain-mappings` against a curriculum under the taxonomy-backed subject returns `200` with a JSON array of `{id, domainNodeId, depth, status: "suggested"}` rows (or `[]` for SCENARIO 6); the same call against a curriculum under a non-taxonomy subject (e.g. "Business") returns `400 subject_has_no_static_taxonomy`.
- **Frontend**: on `/curriculum/$curriculumId` for a curriculum under the taxonomy-backed subject, clicking "Map to taxonomy" (`data-testid="trigger-domain-mapping"`) renders one row per suggested mapping (`data-testid="domain-mapping-suggestion-{id}"`) with an accept, reject, and depth-select control; clicking accept on one row removes it from the pending list and the same curriculum then appears under that node's `data-testid="domain-node-curriculum-{curriculumId}"` link on `/subject/$subjectId/map`.
- **Infrastructure**: N/A — not touched (no new cloud resources, IaC, or deploy pipeline changes).

### Scope boundary

Out of scope for this ticket:
- Reconciling pre-existing, dynamically-created domain nodes into the newly-seeded static taxonomy
  (Decision #4) — this ticket ships the new mapping mechanism; folding old data into it is a
  follow-on once Decision #2 (which subject) is answered.
- Bootstrapping the constitution's formal `docs/architecture/<domain>/<component-slug>.md` taxonomy
  for this repo — logged as a separate wishlist candidate, not part of this ticket.
- A subject-wide "review all pending mappings" panel — the per-curriculum trigger/review flow is the
  full scope of the approval UI for this ticket.
- Changing anything about how `resolveDomainPlacement` itself works for non-taxonomy subjects —
  untouched, per Decision #5.
