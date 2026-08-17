---
type: scenarios
branch: decouple-curricula-from-domain-nodes
task: "Decouple curricula from domain node creation — map into static taxonomy instead (issue #84)"
state: confirmed
updated: 2026-08-04
---
# Scenarios: Decouple curricula from domain node creation

Six forks this plan depends on are queued for human confirmation on GitHub issue #84
(`needs:decision` label). Every scenario below is written against this plan's recommended option
for each fork — see spec.md's "Decisions made autonomously" for the full list and issue #84 for the
reasoning. If Ilya answers any of them differently, the affected scenarios get revised before
implementation starts.

## Business Scenarios

### SCENARIO 1: Triggering the AI mapping step produces reviewable suggestions

On a curriculum belonging to the taxonomy-backed subject, the user clicks "Map to taxonomy" on the
curriculum detail page. The system sends the curriculum's module/topic titles and the subject's full
taxonomy tree to a mapping agent, and inserts one *suggested* mapping row per taxonomy node the agent
confidently matched, each carrying a suggested depth (awareness/working/deep). Nothing is confirmed
yet — the curriculum does not yet appear on the domain map under any of these nodes.

What to verify:
- [x] Suggested rows are inserted with `status: "suggested"`, never `"confirmed"` —
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.repo.ts:67-76`
  (`insertSuggestedMappings`); proven by
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.test.ts:159-190`
  and a real curl (`POST /curricula/:id/domain-mappings` → `200` with `status: "suggested"` rows).
- [x] Each suggested row references a real, existing taxonomy node id — never a fabricated one —
  `packages/core/src/curriculum-domain-mapping/partition-mapping-result.ts:23-33`
  (`partitionMappingResult`); proven by
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.test.ts:283-330`
  (the DoD's required hallucinated-id case).
- [x] The curriculum's domain-map placement is unchanged until the user acts on the suggestions —
  `apps/api/src/domain-map/domain-map.repo.ts:158-172` (`getDomainMapForSubject` only reads
  `status = 'confirmed'` rows).

### SCENARIO 2: Approving a suggestion places the curriculum on the map

The user approves a suggested mapping (optionally adjusting its depth first — SCENARIO 4). The row
flips to `status: "confirmed"`. The curriculum now appears under that taxonomy node on the subject's
domain map, and its topics count toward that node's progress percentage.

What to verify:
- [x] `getDomainMapForSubject` includes this curriculum under the node once, and only once,
  confirmed — `apps/api/src/domain-map/domain-map.repo.ts:191-206` (dedup-by-curriculum-id guard);
  proven live: accepting via `PATCH /curriculum-domain-mappings/:id` then `GET
  /subjects/:id/domain-map` shows the curriculum under the node (runtime curl proof).
- [x] `domainNodeProgress` folds this curriculum's topics into the node's rollup —
  `packages/core/src/domain-map/domain-map-progress.ts:57-77` (unchanged rollup call, now fed by
  the mapping table via `apps/api/src/domain-map/domain-map.repo.ts:176-189`).

### SCENARIO 3: Rejecting a suggestion leaves the map unchanged

The user rejects a suggested mapping. The row flips to `status: "rejected"` (never deleted — same
audit-trail convention as every other suggestion table in this codebase). The curriculum never
appears under that node.

What to verify:
- [x] A rejected row is excluded from `getDomainMapForSubject`'s confirmed-mappings query —
  `apps/api/src/domain-map/domain-map.repo.ts:168-172` (`WHERE status = 'confirmed'`).
- [x] The row still exists and is visible as "handled" if the user reopens the suggestion list —
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.repo.ts:172-197`
  (`resolveMapping` updates status, never deletes); `listMappingsForCurriculum` (same file,
  118-129) returns every status.

### SCENARIO 4: Adjusting depth before approving

Before approving a suggestion, the user can change its suggested depth (awareness/working/deep). The
value the user picks — not the AI's original suggestion — is what gets written when the row is
confirmed.

What to verify:
- [x] The accept action accepts an optional depth override; when given, it overrides the AI's
  value — `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.repo.ts:180-182`
  (`nextDepth`); proven by
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.repo.integration.test.ts:143-158`
  and the frontend depth-`<select>` in
  `apps/web/src/curriculum/curriculum-domain-mapping-panel.tsx:198-215`, verified live via
  Playwright click-through (depth-select control present and wired on the suggestion row).

### SCENARIO 5: Explicit manual placement bypasses AI mapping entirely — even for taxonomy-backed subjects

The user places a curriculum directly onto a taxonomy node — either via "add course here" on the
domain map tree (which sends `domainNodeId` at creation time), or by setting a target node explicitly
afterward via update. This inserts an already-`confirmed` mapping row immediately; no suggestion, no
approval round-trip. This preserves the existing "explicit always wins" precedent from
`resolveDomainPlacement`'s Path 1 — critically, **an explicit `domainNodeId` passed at creation wins
regardless of whether the subject is taxonomy-backed or not**. `handleCreateCurriculum`'s branch on
subject type (SCENARIO 8) only governs what happens when NO explicit node was given; it must check for
an explicit `domainNodeId` first, before it ever looks at the subject's taxonomy status, or a user
explicitly placing a curriculum on a taxonomy subject's node at creation time would silently get no
placement at all instead of the confirmed row they asked for.

What to verify:
- [x] The mapping row lands `status: "confirmed"`, `source: "manual"` in one write —
  `apps/api/src/curriculum/curriculum.repo.ts:191-218` (`createCurriculum`'s
  `insertConfirmedMapping` call, inside `withSubjectLock`'s transaction).
- [x] An explicit `domainNodeId` at creation time produces this confirmed row on a taxonomy-backed
  subject exactly the same as on a non-taxonomy one —
  `apps/api/src/curriculum/curriculum.controller.ts:142-165` (explicit-first check, before the
  `resolveDomainNodeSource` branch); proven live by the runtime curl proof (React node under a
  static-taxonomy subject accepted the same way a non-taxonomy subject's auto path would).
- [x] The chosen node must belong to the same subject as the curriculum, or the write is rejected —
  `apps/api/src/curriculum/curriculum.controller.ts:146-155` (`domain_node_wrong_subject`, 400).

### SCENARIO 6: No confident match anywhere

Every topic in the curriculum fails to match any taxonomy node with enough confidence. No suggested
rows are created. Nothing appears under any node for this curriculum. This is a normal empty
outcome, not an error — the domain map for the rest of the subject is unaffected.

What to verify:
- [x] Triggering mapping on such a curriculum returns a 200 with an empty suggestion list, not a
  4xx/5xx —
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.test.ts:192-207`
  (returns `[]`, not an error).

### SCENARIO 7: A topic doesn't fit any existing node (rare emerging-tech case)

When the mapping agent cannot place a topic under any existing node at all (as opposed to simply not
matching any node confidently for the whole curriculum), the system does not invent a new domain node
on the spot. Instead it inserts a `domain_topic_suggestion` — the same "propose a new node" row and
approval flow that already exists in this codebase (`domainTopicSuggestions`/
`resolveDomainTopicSuggestion`) — for the user to review separately. A node is only ever created
through that existing, already-reviewed path.

What to verify:
- [x] No `insertDomainNode` call happens anywhere in the new mapping orchestrator — confirmed by
  code inspection (`apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.ts`
  imports no such function) and by a real-node-count-unchanged assertion in
  `curriculum-domain-mapping.orchestrator.test.ts:210-236` and `:283-330`.
- [x] An unmatched topic produces a `domain_topic_suggestion` row, reusing the existing table/flow
  as-is — `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.ts:126-134`
  (calls the existing `insertDomainTopicSuggestion`); proven by
  `curriculum-domain-mapping.orchestrator.test.ts:210-236`.

### SCENARIO 8: Subjects without a static taxonomy keep today's behavior unchanged

A curriculum created under a subject that has no seeded static taxonomy (e.g. Business, Investing,
Music, a language) is placed exactly as it is today: `resolveDomainPlacement`'s explicit → normalized
-match → sibling-discovery-agent chain runs unmodified, including creating new nodes dynamically when
needed. The one visible difference is where the result lands: instead of writing
`curricula.domain_node_id` (a column this plan retires), the resolved placement is written as one
`confirmed`, `source: "auto"` mapping row — zero new friction, same UX as today.

What to verify:
- [x] `resolveDomainPlacement` itself is untouched — `git diff` against
  `apps/api/src/domain-map/domain-placement.orchestrator.ts` is empty (zero lines changed by this
  ticket).
- [x] The curriculum creation flow for these subjects produces exactly one auto-confirmed mapping
  row, with no suggestion round-trip and no user-visible change from today's behavior —
  `apps/api/src/curriculum/curriculum.controller.ts:167-181` (the `else` branch, `domainNodeSource:
  "auto"`); proven by
  `apps/api/src/domain-map/domain-placement.integration.test.ts:120-168` (updated to assert against
  the mapping table).

### SCENARIO 9: A curriculum can map to more than one taxonomy node

Because the mapping is many-to-many, a single curriculum can end up `confirmed` under multiple
taxonomy nodes at once (e.g. a course that covers both "Docker" and "Kubernetes"). Its topics count
toward each mapped node's own progress percentage independently.

What to verify:
- [x] `getDomainMapForSubject` surfaces the curriculum under every node it's confirmed against —
  `apps/api/src/domain-map/domain-map.repo.ts:176-206` (one `curriculumTopics`/`curriculaByNodeId`
  entry per confirmed mapping row, not per curriculum).
- [x] `domainNodeProgress` receives one `{domainNodeId, topics}` entry per confirmed mapping —
  `apps/api/src/domain-map/domain-map.repo.ts:176-179`.
- [x] When two of a curriculum's mapped nodes share a common ancestor, that ancestor's own
  `topicsIncluded`/`topicsMastered` counts the curriculum's topics once, not once per mapped
  descendant — `packages/core/src/domain-map/domain-map-progress.ts:57-77` (topic-id dedup);
  regression-tested in
  `packages/core/src/domain-map/domain-map-progress.test.ts:154-181` ("dedups a curriculum's
  topics by id before rolling up an ancestor shared by two of its mapped nodes").

### SCENARIO 10: Migrating existing curricula preserves their placement exactly

Every curriculum that already had `curricula.domain_node_id` set before this change keeps the exact
same placement afterward: one pre-`confirmed`, `source: "auto"` mapping row, created by the migration
itself. `"auto"`, not `"manual"` — every pre-existing value in that column was written by
`resolveDomainPlacement` (there was no other write path before this ticket, including its own
explicit-placement case, which still resolves through that same function's Path 1), so the migrated
rows correctly carry the same provenance SCENARIO 8's auto-confirmed rows carry going forward. Nothing
shifts on the domain map for any subject as a direct result of shipping this change.

What to verify:
- [x] Row count of migrated mappings equals the count of curricula that had a non-null
  `domain_node_id` before migration —
  `apps/api/src/db/migrations/0031_decouple_curricula_from_domain_nodes.sql:16-24` (`INSERT ...
  SELECT ... WHERE domain_node_id IS NOT NULL`, one row per matching curriculum); applied live
  against both the local dev DB and the e2e DB (`\d curricula` confirms the column is gone,
  `curriculum_domain_node_mappings` exists with the expected shape).
- [~] `getDomainMapForSubject`'s rendered tree byte-identical before/after — not independently
  re-verified against a snapshot (neither target DB had any pre-existing non-null
  `curricula.domain_node_id` rows to migrate), but the backfill SQL's `source: 'auto'`/`status:
  'confirmed'` shape is the same shape `getDomainMapForSubject` already reads for every other
  auto-confirmed row, so no code path treats a migrated row differently.

### SCENARIO 13: Deleting a curriculum cleans up its mappings

Deleting a curriculum removes every mapping row it owns — confirmed, suggested, and rejected alike —
so no dangling references remain for `getDomainMapForSubject` to trip over.

What to verify:
- [x] `deleteCurriculum` removes all `curriculum_domain_node_mappings` rows for that curriculum id,
  inside the same transaction as the rest of the delete —
  `apps/api/src/curriculum/curriculum.repo.ts:695-704` (`deleteCurriculumWith`'s
  `deleteMappingsForCurriculum(curriculumId, db)` call, same `db`/transaction as the rest);
  `curriculum-domain-mapping.repo.integration.test.ts:207-224` ("removes every mapping row
  regardless of status") proves the underlying repo function itself.

## Technical/Architectural Scenarios

### SCENARIO 11: Mapping agent failure loses no data

If the mapping LLM call fails (network error, timeout, structured-output validation failure), the
trigger endpoint returns a clear error (502, mirroring `handleTriggerSubjectDuplicateScan`'s posture)
and inserts nothing. There is never a silent partial mapping — either the whole batch of suggestions
lands, or none does.

What to verify:
- [x] A thrown/rejected agent call produces zero inserted rows and a 502 response —
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.controller.ts:9-33`
  (`handleTriggerCurriculumDomainMapping`'s catch → 502); proven by
  `curriculum-domain-mapping.orchestrator.test.ts:333-378`.
- [x] No suggestion row is left half-written on partial failure — the agent call and its schema
  parse (`curriculum-domain-mapping.orchestrator.ts:96-104`) happen entirely before any insert; a
  thrown/rejected call never reaches `insertSuggestedMappings`.

### SCENARIO 12: Concurrent accept/reject race on the same suggestion

Two near-simultaneous resolutions of the same suggestion (e.g. a double-click, or two tabs) — only
one succeeds. The other gets a clean `already_resolved`, not a duplicated confirm or a second
domain-map entry. Same claim-first-write pattern already used by `resolveDomainTopicSuggestion` and
`resolveDomainSupersessionSuggestion` — `UPDATE ... WHERE status = 'suggested'` (this table's own
"not yet resolved" value; the two precedent tables use `'pending'` because that's *their* vocabulary,
not because `'pending'` is a value this table has).

What to verify:
- [x] The second resolution attempt returns `already_resolved`, never a second write —
  `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.repo.ts:172-197`
  (claim-first `WHERE status = 'suggested'`); proven against real Postgres with a genuine
  concurrent `Promise.all` race in
  `curriculum-domain-mapping.repo.integration.test.ts:97-131`.
- [x] `getDomainMapForSubject` shows the curriculum under the node exactly once, never twice —
  `apps/api/src/domain-map/domain-map.repo.ts:191-206` (dedup-by-curriculum-id guard, also
  protecting against `mergeDomainNodes`-created duplicates).
