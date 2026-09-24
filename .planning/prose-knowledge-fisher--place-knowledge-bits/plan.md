---
type: plan
item: place-knowledge-bits
direction: prose-knowledge-fisher
stakes-tier: Guarded
---

# Place each knowledge bit into the existing subject/curriculum/topic hierarchy

## The ask

Every tagged `knowledge_bits` row should be classified against the existing topic hierarchy: either
matched to a real, live topic, or — when nothing fits — have a short placement suggestion recorded
for later human review. This folds in "Suggest a new hierarchy spot when no existing topic fits a
bit" (capture half only — see Non-goals).

## Existing infrastructure (from research — reuse, do not rebuild)

- Hierarchy: `subjects` → `curricula` (`subjectId`) → `modules` (`curriculumId`) → `topics`
  (`moduleId`, `curriculumId`) (`apps/api/src/db/schema.ts:16,39,425,436`).
- `biz-education-classifier.agent.ts` (`apps/api/src/mastra/biz-education-classifier.agent.ts`)
  already returns the exact output shape this item needs (`matchedTopicId: string|null`,
  `suggestedPlacement: string|null`, exactly one non-null) — **but its instructions are hard-coded
  to "a captured business-education note"** (agent.ts:7), wrong framing for arbitrary book prose.
  **Do not edit or reuse this agent directly** — it belongs to a separate direction
  (`biz-education-distiller/`), same off-limits treatment as the stuck slug's files. Copy its
  output-contract shape into a new sibling agent instead.
- `listHierarchyForClassification()` (`apps/api/src/biz-education-distiller/distiller.repo.ts:13`)
  joins topic→curriculum→subject but applies **no filters** — it would include
  `included=false` topics and container curricula. Do not reuse as-is; write a new, filtered
  listing function (see Design point 3).
- `listCurricula()`'s own filter convention: `isNull(curricula.containerAreaNodeId)`
  (`apps/api/src/curriculum/curriculum.repo.ts:116`) — a container curriculum is a domain-area
  grouping node, not a real learnable curriculum; exclude it the same way.
- `facts.topicId` (`schema.ts:1019`) is the FK convention to copy: plain nullable `text`, **no
  `.references()`** — comment explicitly states "no FK, matching this schema's convention."
- Dev DB currently has 0 topics — real-world topic count at scan time is unknown. No shortlisting
  mechanism (e.g. embedding-based pre-filter) is built here; see Non-goals.

## Design

1. **New sibling agent** — `apps/api/src/mastra/knowledge-bit-placer.agent.ts`. One LLM call per
   bit. Instructions rewritten for arbitrary prose-sourced knowledge (not "business-education
   note"), same untrusted-content delimiter framing as every other agent in this codebase. Input:
   bit body + the full filtered topic list (id, title, curriculum name, subject name). Output
   schema: `{ matchedTopicId: z.string().nullable(), suggestedPlacement: z.string().nullable() }`
   with a `.refine()` enforcing exactly one non-null (mirrors the classifier's own stated
   contract, now enforced in code, not just in the prompt). `tierToModelId("cheap")`.
2. **Schema — four nullable columns on `knowledgeBits`** (mirrors tagging's two-outcome-plus-
   failure lesson, extended to three outcomes): `topicId: text("topic_id")` (no FK, per
   `facts.topicId`'s convention), `placementSuggestion: text("placement_suggestion")`,
   `placementCheckedAt: timestamp("placement_checked_at", { withTimezone: true })` (set on EITHER
   a match or a suggestion — the "done, no more scanning" marker), `placementFailedAt:
   timestamp("placement_failed_at", { withTimezone: true })`. Selection query keys on
   `placementCheckedAt IS NULL AND placementFailedAt IS NULL` — same reasoning as tagging's
   `taggedAt`/`tagFailedAt`: an LLM classification call fails per-item in realistic ways, and an
   anti-join can't distinguish untried from permanently-failing. Generate + apply migration.
3. **Filtered topic-listing repo function** — new function (co-located with the new placement repo
   file below, not added to `distiller.repo.ts`) selecting `{topicId, topicTitle, curriculumName,
   subjectName}` joined topic→curriculum→subject, filtered to `topics.included = true` AND
   `isNull(curricula.containerAreaNodeId)` — the two confirmed, real filters. No shortlisting by
   count; if the real topic count ever makes per-call cost a problem, that's a future item (Non-
   goals).
4. **Repo** — new file `apps/api/src/knowledge-bit/knowledge-bit-placement.repo.ts`:
   `listKnowledgeBitsForPlacementScan(limit, db?)`, `listTopicsForPlacement(db?)` (point 3's
   function), `markKnowledgeBitMatched(id, topicId, db?)` (sets `topicId` + `placementCheckedAt`),
   `markKnowledgeBitSuggested(id, suggestion, db?)` (sets `placementSuggestion` +
   `placementCheckedAt`), `markKnowledgeBitPlacementFailed(id, db?)`.
5. **Orchestrator** — new file `apps/api/src/knowledge-bit/knowledge-bit-placement.orchestrator.ts`,
   `placeKnowledgeBits(): Promise<{scanned, matched, suggested, failed}>` (own shape, not reused).
   Per bit, own try/catch: call the placer agent with the bit body + the topic list fetched once
   per scan (not once per bit — the list is the same for every bit in a batch); zod-validate the
   agent's output against the refine above; **validate `matchedTopicId` against the real id set
   sent in this call** (same hallucination-guard lesson as the existing tagging orchestrator/
   TODO's "Validate the LLM's matched tag name" item) — a `matchedTopicId` not present in the sent
   list is treated as invalid and the bit is marked failed. **No fallback-to-suggestion branch on a
   hallucinated id**: the placer agent's own zod `.refine()` (Phase 2, shipped) already guarantees
   `matchedTopicId` and `suggestedPlacement` are never both non-null in the same response, so when
   `matchedTopicId` is present (and therefore invalid), `suggestedPlacement` is structurally always
   null in that same response — a "fall back to it" branch would be dead code. On a genuine match:
   `markKnowledgeBitMatched`. On a genuine suggestion (non-blank, non-empty after trim, under 300
   chars — a blank/oversized suggestion is rejected the same as a hallucinated id, since writing it
   would otherwise permanently remove the bit from the scan queue with nothing usable):
   `markKnowledgeBitSuggested`. On failure (agent throws, output fails the refine, `matchedTopicId`
   doesn't match the sent list, or the suggestion fails validation): `markKnowledgeBitPlacementFailed`,
   wrapped in its own nested try/catch so a failed-mark write error can't abort the batch (same
   pattern as the tagging orchestrator). Per-scan cap via a named constant (`PLACEMENT_CAP`).
6. **Trigger route** — `POST /knowledge-bits/placement-scan`, same shape/auth as the tagging-scan
   route. **`write-phases` must use a phase name unique across this direction's other items** —
   e.g. `"Phase 3: placement trigger route and tests"`, not the bare `"Phase 3: trigger route and
   tests"` reused three times already by sibling items in this same direction (that collision
   forced a manual TODO.md edit for auto-tag-knowledge-bits' own Phase 3 — see this run's judgment
   log).

## Non-goals (Guarded tier — explicit)

- **No automatic topic/module creation.** `suggestedPlacement` is stored as free text for later
  human review, exactly like `domainTopicSuggestions`' pending-suggestion pattern
  (`schema.ts:280-296`) — this item never writes a new `topics`/`modules` row itself. A future item
  builds the accept/reject flow.
- **No promotion to `facts` via `insertFactWithTopic`.** That belongs to "Feed prose-sourced bits
  into the existing per-topic knowledge tracking," a separate, later backlog item.
- **No edits to `apps/api/src/biz-education-distiller/`** (`classification-model.ts`,
  `distiller.repo.ts`, `biz-education-classifier.agent.ts`) — a different direction's code, reused
  only by pattern-copying, never modified.
- **No topic-list shortlisting/embedding pre-filter.** Dev DB has 0 topics today; if production
  topic count later makes "full list per call" too expensive, that's a follow-up item, not solved
  here.
- **Accepted: concurrent scans may double-classify the same bit** — same accepted race as tagging
  (idempotent marks, no corruption).

## Rollback note

Additive: four new nullable columns (no FK), two new files (repo + orchestrator), one new sibling
agent file, one new route. Revert by dropping the migration and removing the route entries.
