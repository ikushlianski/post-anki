---
type: scenarios
branch: topic-ordering-importance
task: Promote/demote modules and topics, per-node comments, and AI-decided strict document order
state: confirmed
updated: 2026-07-15
---
# Scenarios: Topic ordering & importance

## Business Scenarios

SCENARIO 1: Promote a topic

The learner clicks the ▲ (promote) control next to a topic in `TopicRow`.

What to verify:
- [x] `topics.priority` moves from `0` to `1`. `apps/api/src/topic/topic.repo.ts:103-104`
  (updateTopic conditional patch); `apps/web/src/curriculum/topic-shape-bar.tsx:58-67`
  (PromoteDemoteButtons wired to `usePromoteDemoteTopic`); live-verified via direct API call
  (`PATCH /topics/:id {priority:1}` → response `"priority":1`).
- [x] On a curriculum that is not in strict-order mode, the topic now displays above its
  priority-`0`/`-1` siblings within the same module (SCENARIO 6). `apps/api/src/curriculum/curriculum.repo.ts:632-637`
  (`buildModules` calls `sortForDisplay` for topics-within-module); unit-tested
  `packages/core/src/curriculum/ordering.test.ts:22-39`.
- [x] On a strict-order curriculum, the vote is still stored but display order is unchanged
  (SCENARIO 7) — no silent reshuffle. `packages/core/src/curriculum/ordering.ts:11-20` (strict
  branch ignores priority); live-verified via direct API calls (see SCENARIO 7 citation).

SCENARIO 2: Demote a topic

Same mechanics as SCENARIO 1 with the ▼ control, moving `priority` to `-1` and (non-strict only)
sinking the topic below its siblings.

- [x] Verified by the same code paths as SCENARIO 1 — `PromoteDemoteButtons`'s demote button
  (`apps/web/src/curriculum/shape-controls.tsx:90-104`) calls the identical `nextPriority`/
  `updateTopic`/`updateModule` wiring with `direction: "down"`.

SCENARIO 3: Un-promote / un-demote

The learner clicks ▲ on an already-promoted topic (or ▼ on an already-demoted one).

What to verify:
- [x] `priority` returns to `0` (neutral) — promote/demote is a toggle, not an accumulating counter.
  Clicking ▲ on a demoted topic moves it directly to `1` in one click (not two), and vice versa.
  `packages/core/src/curriculum/ordering.ts:30-37` (`nextPriority`); unit-tested
  `packages/core/src/curriculum/ordering.test.ts:104-127` (all 6 toggle cases, including the
  demoted→up→promoted and promoted→down→demoted single-click cases).

SCENARIO 4: Promote or demote a module

Same mechanics as SCENARIO 1/2, applied to `modules.priority`, affecting the module's position
among its siblings within the curriculum.

- [x] `apps/api/src/module/module.repo.ts:73-74` (updateModule conditional patch);
  `apps/web/src/curriculum/module-section.tsx:82-93` (PromoteDemoteButtons wired to
  `usePromoteDemoteModule`); `apps/api/src/curriculum/curriculum.repo.ts:632` (`sortForDisplay`
  for modules-within-curriculum); live-verified end-to-end via direct API calls — promoting
  "Module B" (order 2) moved it to `modules[0]` in `GET /curricula/:id`, and un-promoting reverted
  it to `modules[1]`.

SCENARIO 5: Leave a comment on a module or topic

The learner opens a small feedback control on a topic/module and types a note ("this section felt
too shallow, want more on X") without necessarily promoting or demoting.

What to verify:
- [x] The comment is stored in a new append-only log (`node_feedback`), with the node's type, id, and
  a timestamp. `apps/api/src/node-feedback/node-feedback.repo.ts:17-31` (`insertNodeComment`);
  `apps/api/src/node-feedback/node-feedback.controller.ts:9-58` (route handlers pin `node_type`
  server-side); live-verified via `POST /modules/:id/comments` and `POST /topics/:id/comments`,
  both returned 201 with `nodeType`/`nodeId`/`createdAt` populated; a comment against a
  nonexistent module id returned 404 as expected.
- [x] This comment is never injected into any LLM generation prompt — it is a personal note for the
  learner's own later reference (or a future stats/dashboard surface owned by a different plan),
  not a signal the doc-research or quiz agents read. Verified structurally: `node-feedback.repo.ts`
  has no importers outside `node-feedback.controller.ts`, and the scope-boundary diff
  (`git diff <merge-base> -- apps/api/src/probe-session apps/api/src/socratic`) is 0 lines.

SCENARIO 6: Non-strict display order composes priority with manual order

A module has topics with priorities `[0, 1, -1, 0]` in `order` positions `[0, 1, 2, 3]`.

What to verify:
- [x] Display groups by priority descending first (`1` topics, then `0` topics, then `-1` topics),
  and within each priority group, orders by the existing `order` column ascending — a stable,
  predictable composition, not a full re-sort that discards the user's manual arrangement within
  a tier. `packages/core/src/curriculum/ordering.ts:11-20`; unit-tested
  `packages/core/src/curriculum/ordering.test.ts:22-39, 60-65` (mixed-priority ordering and
  same-priority stable-order-within-tier tests).
- [x] The same composition rule applies to modules within a curriculum.
  `apps/api/src/curriculum/curriculum.repo.ts:626-644` (`buildModules` calls `sortForDisplay`
  once for modules, once per module for its topics — same deriver, same call shape).

SCENARIO 7: Strict-order curriculum ignores priority for display

A curriculum has `strictOrder: true` (set at doc-research synthesis time, SCENARIO 9).

What to verify:
- [x] Display order for both modules and topics follows the `order` column only — `priority` is
  ignored for sorting purposes even if some topics have been promoted/demoted.
  `packages/core/src/curriculum/ordering.ts:15-17` (strict branch); unit-tested
  `packages/core/src/curriculum/ordering.test.ts:49-57`; live-verified via direct API calls:
  with `strict_order: true`, a module with `priority: 1` still rendered second (behind its
  lower-order, priority-0 sibling) in `GET /curricula/:id`.
- [x] Promote/demote controls remain visible and usable (the vote itself is still meaningful data,
  e.g. for a future recommender) — they're not hidden, their *display* effect is just suppressed.
  `apps/web/src/curriculum/module-section.tsx:82-93` and `apps/web/src/curriculum/topic-shape-bar.tsx:58-67`
  render `PromoteDemoteButtons` unconditionally on `editable`, with no `strictOrder` gate; the
  inline note is the only strict-mode-conditional UI element
  (`apps/web/src/curriculum/module-section.tsx:113`, `apps/web/src/curriculum/topic-row.tsx:116`).

SCENARIO 8: Turning off strict mode is the explicit override

The learner flips a "Strict document order" toggle to off on a strict-origin curriculum.

What to verify:
- [x] `curricula.strict_order` becomes `false`. `apps/api/src/curriculum/curriculum.repo.ts:481-482`
  (`updateCurriculum` conditional patch); `packages/shared/src/curriculum.ts:72`
  (`updateCurriculumInput.strictOrder`); `apps/web/src/curriculum/adaptive-settings.tsx:132`
  (toggle button); live-verified via `PATCH /curricula/:id {strictOrder:true}` then confirming
  `GET /curricula/:id` reflects it.
- [x] Display order for that curriculum immediately starts composing priority as in SCENARIO 6 — this
  toggle IS the "I can still override it if I want to" mechanism the task asked for; no separate
  drag-and-drop or new reordering UI is built for this purpose. Live-verified: flipping
  `strict_order` from `true` back to `false` on the same fixture immediately moved the
  higher-priority module back to `modules[0]`.

SCENARIO 9: Doc-research synthesis decides strict-order per curriculum

Researching "Temporal" (a step-by-step "getting started" style doc set) yields `strictOrder: true`;
researching a technology whose docs are reference-style (no natural sequence) yields `false`.

What to verify:
- [x] `doc-research-architect.agent.ts`'s structured output gains a `strictOrder: boolean` field,
  described in its instructions with concrete guidance on when true vs false applies.
  `apps/api/src/curriculum/curriculum-research-plan.ts:22` (schema field);
  `apps/api/src/mastra/doc-research-architect.agent.ts:35-43` (instructions).
- [x] `researchCurriculum` persists this flag onto the new `curricula` row at creation time.
  `apps/api/src/curriculum/curriculum-parse.orchestrator.ts:165`
  (`setCurriculumStrictOrder(curriculumId, result.object.strictOrder ?? false)`).
  Not yet observed with a real LLM call (no OpenRouter request was made during implementation to
  avoid cost) — flagged in `todo.md`'s post-deploy checks as the one behavior typecheck can't
  verify (LLM output content, not shape).

SCENARIO 10: Pasted-material curricula never default to strict

A curriculum created via the existing paste-sources flow (not doc-research).

What to verify:
- [x] `strict_order` defaults to `false` at the table level and the pasted-material
  `curriculum-architect.agent.ts` is not modified to reason about sequencing — this plan does not
  touch that agent's contract, only the doc-research agent's. `apps/api/src/db/schema.ts:28`
  (`.default(false)`); confirmed via `git diff <merge-base> -- apps/api/src/mastra/curriculum-architect.agent.ts`
  = 0 lines.
- [x] The learner can still manually flip `strict_order` to `true` later via the same toggle from
  SCENARIO 8 if they want strict behavior on a hand-authored curriculum too (the toggle isn't
  origin-gated). `apps/web/src/curriculum/adaptive-settings.tsx:132` — the toggle reads/writes
  `curriculum.strictOrder` unconditionally, with no `origin` check.

SCENARIO 11: Manual reorder still works regardless of strict/priority state

The learner uses the existing `ReorderButtons` (▲/▼ position controls, distinct from
promote/demote) to move a topic or module.

What to verify:
- [x] This writes directly to the `order` column exactly as it does today — completely unchanged
  behavior, works identically whether `strict_order` is true or false and regardless of any
  node's `priority`. `apps/api/src/module/module.repo.ts:110-116` (`reorderModules`) and
  `apps/api/src/topic/topic.repo.ts:179-185` (`reorderTopics`) are byte-for-byte unmodified by
  this plan (confirmed via `git diff <merge-base>` showing no hunks touching these functions).
- [x] Because `order` is what strict-mode display sorts by, a manual reorder on a strict curriculum
  IS a real, persistent override of the doc-research sequence — satisfying "I can still override
  it if I want to." Follows directly from `packages/core/src/curriculum/ordering.ts:15-17`
  sorting strict mode by `order` only.

SCENARIO 12: Priority is a consumable signal, not a rebuilt recommender

A topic has been promoted.

What to verify:
- [x] `Topic.priority` (and `Module.priority`) are present on the shared types and hydrated by
  `curriculum.repo.ts`, so any reader (including a future recommendation engine) can access them.
  `packages/shared/src/topic.ts:15` and `packages/shared/src/module.ts:11` (schema fields);
  `apps/api/src/curriculum/curriculum.repo.ts:630` and `apps/api/src/curriculum/curriculum.repo.ts:679`
  (`toTopic`/`buildModules` hydration).
- [x] `recommendedTopicId` (`packages/core/src/curriculum/recommendation.ts`) itself is NOT modified by
  this plan — confirmed by direct diff-scope check during implementation. The signal exists; a
  parallel, separately-owned plan is responsible for teaching the recommender to read it.
  `git diff <merge-base> -- packages/core/src/curriculum/recommendation.ts` = 0 lines (only its
  test fixture file, `recommendation.test.ts`, changed — mechanically, to satisfy the now-required
  `priority` field on fixture literals, no assertions or logic touched).

## Technical/Architectural Scenarios

None beyond what's covered above — no new async boundary, no new service, no infrastructure
change. The new sort deriver replaces two inline `.sort()` calls already present in
`curriculum.repo.ts` with equivalent-or-richer behavior. [x] Confirmed — no new files under
`apps/api/src/*/` beyond `node-feedback/` (a thin CRUD-only route pair), no new queue/worker,
no new external service call.
