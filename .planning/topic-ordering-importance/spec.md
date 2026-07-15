---
type: spec
branch: topic-ordering-importance
task: Promote/demote modules and topics, per-node comments, and AI-decided strict document order
complexity: complex
state: confirmed
updated: 2026-07-15
---
<!-- Consistency gate: PASS (all 8 checks) — promoted from draft to confirmed 2026-07-15. -->
# Spec: Topic ordering & importance

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Derivers + data model | 1–4, 6, 7 | `sortForDisplay` deriver; migration for `modules.priority`, `topics.priority`, `curricula.strict_order`, `node_feedback` | None | None | N/A (unit-tested) |
| 2 — API wiring | 1–4, 7, 8, 11, 12 | `updateModuleInput`/`updateTopicInput` widened with `priority`; `curriculum.repo.ts` wires `sortForDisplay` into `buildModules`; `updateCurriculum` accepts `strictOrder` | None | Phase 1 | No added latency — same queries, one more column read/written |
| 3 — Node comment log | 5 | `apps/api/src/curriculum/node-feedback.repo.ts` + two nested routes | None | Phase 1 | N/A |
| 4 — Doc-research sequencing | 9, 10 | `docResearchPlanSchema` + `doc-research-architect.agent.ts` instructions; `researchCurriculum` persists `strictOrder` | None | Phase 1 | No added LLM calls — same structured-output call, one more field |
| 5 — Web frontend | 1–3, 4, 5, 6, 7, 8 | None (consumes Phases 2–4) | `module-section.tsx`/`topic-row.tsx` promote/demote controls + strict-order inline note; new node comment control; new strict-order toggle on the curriculum page | Phases 2–4 | Promote/demote and comment submit feel instant — no LLM call on either write path |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `sortForDisplay` (`packages/core/src/curriculum/ordering.ts`, new) | `items: { order: number; priority: number }[]`, `strict: boolean` | Same items, sorted: `strict` → by `order` asc only; non-strict → by `priority` desc, then `order` asc | SCENARIO 6, 7 |
| `nextPriority` (`packages/core/src/curriculum/ordering.ts`, new, sibling) | `current: -1 \| 0 \| 1`, `direction: "up" \| "down"` | The toggled tri-state value (e.g. `current: -1, direction: "up"` → `1`, not `0`) | SCENARIO 3 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `apps/api/src/db/schema.ts`, `apps/api/src/topic/topic.repo.ts` (`updateTopic`) | `apps/web/src/curriculum/topic-row.tsx` — promote/demote controls | None |
| SCENARIO 2 | Same as 1 | Same as 1 | None |
| SCENARIO 3 | `packages/core/src/curriculum/ordering.ts` (`nextPriority`) | `topic-row.tsx`/`module-section.tsx` call `nextPriority` before submitting | None |
| SCENARIO 4 | `apps/api/src/module/module.repo.ts` (`updateModule`) | `apps/web/src/curriculum/module-section.tsx` — promote/demote controls | None |
| SCENARIO 5 | `apps/api/src/node-feedback/node-feedback.repo.ts` + `.controller.ts` (new), route wiring in `router.ts`/`server.ts` | New small comment control in `topic-row.tsx`/`module-section.tsx` | None |
| SCENARIO 6 | `packages/core/src/curriculum/ordering.ts` (`sortForDisplay`), `apps/api/src/curriculum/curriculum.repo.ts` (`buildModules`) | None (existing rendering, new order) | None |
| SCENARIO 7 | Same as 6 | `module-section.tsx`/`topic-row.tsx` — inline strict-mode note | None |
| SCENARIO 8 | `apps/api/src/curriculum/curriculum.repo.ts` (`updateCurriculum` accepts `strictOrder`), `packages/shared/src/curriculum.ts` (`updateCurriculumInput`) | New toggle on `apps/web/src/routes/curriculum.$curriculumId.tsx` | None |
| SCENARIO 9 | `apps/api/src/curriculum/curriculum-research-plan.ts` (`docResearchPlanSchema`), `apps/api/src/mastra/doc-research-architect.agent.ts`, `curriculum-parse.orchestrator.ts` (`researchCurriculum` persists it) | None | None |
| SCENARIO 10 | `apps/api/src/db/schema.ts` (`curricula.strict_order` default `false`) — `curriculum-architect.agent.ts` explicitly NOT modified | Same toggle as SCENARIO 8 works regardless of origin | None |
| SCENARIO 11 | None — existing `reorderModules`/`reorderTopics` untouched | None — existing `ReorderButtons` untouched | None |
| SCENARIO 12 | `packages/shared/src/topic.ts`, `packages/shared/src/module.ts` (+ `priority` field); `curriculum.repo.ts`'s `toTopic`/module-mapping hydrates it | None | None |

### Files to create

```
packages/core/src/
  curriculum/
    ordering.ts             — sortForDisplay, nextPriority
    ordering.test.ts

apps/api/src/node-feedback/
  node-feedback.repo.ts     — insertNodeComment, listNodeComments (not consumed by any
                                generation path — see architecture.md)
  node-feedback.controller.ts — handleAddModuleComment, handleAddTopicComment (thin, each
                                  pins node_type server-side, mirrors the sibling plan's
                                  feedback.controller.ts split-by-route pattern)

apps/web/src/curriculum/
  node-comment-control.tsx  — small free-text comment control, shared by module and topic rows
```

### Files to modify

```
packages/shared/src/
  module.ts       — moduleSchema: + priority (int, -1|0|1); updateModuleInput: + priority optional
  topic.ts        — topicSchema: + priority; updateTopicInput: + priority optional
  curriculum.ts   — curriculumSchema: + strictOrder (boolean); updateCurriculumInput: + strictOrder optional

apps/api/src/
  db/schema.ts                                      — + modules.priority, + topics.priority,
                                                         + curricula.strict_order, + node_feedback table
  curriculum/curriculum.repo.ts                      — buildModules calls sortForDisplay for both
                                                         modules-within-curriculum and
                                                         topics-within-module sorts, reading the
                                                         curriculum's strict_order; updateCurriculum
                                                         sets strict_order
  module/module.repo.ts                              — updateModule sets priority when provided
  topic/topic.repo.ts                                — updateTopic sets priority when provided
  curriculum/curriculum-research-plan.ts             — docResearchPlanSchema: + strictOrder
  curriculum/curriculum-parse.orchestrator.ts         — researchCurriculum persists strictOrder
                                                         from result.object onto the curricula row
  mastra/doc-research-architect.agent.ts             — instructions: strictOrder guidance
                                                         (tutorial/step-building docs → true,
                                                         reference-style docs → false)
  router.ts                                          — + "addModuleComment", "addTopicComment"
                                                         route names + patterns
  server.ts                                          — dispatch the two new route names to
                                                         node-feedback.controller.ts's handlers

apps/web/src/curriculum/
  module-section.tsx    — promote/demote controls next to ReorderButtons; strict-mode inline note;
                            renders node-comment-control
  topic-row.tsx          — same additions, topic-scoped
  curriculum.mutations.ts — usePromoteModule/usePromoteTopic-style hooks, useToggleStrictOrder
apps/web/src/routes/
  curriculum.$curriculumId.tsx — strict-order toggle in the curriculum header/settings area
```

### Data model changes

Drizzle-generated migration (see `architecture.md`'s "Data model evolution" for full column
list): `modules.priority` (int, default 0), `topics.priority` (int, default 0),
`curricula.strict_order` (boolean, default false), and one new table `node_feedback`. No changes
to any table owned by the sibling `question-feedback-memory` plan or by `topic-study-experience`.

### Documentation changes

No existing doc covers curriculum display ordering or the doc-research synthesis schema's
sequencing behavior. A short Mermaid diagram of this plan's architecture (promote/demote → priority
column → sortForDisplay; doc-research → strictOrder → curricula row) will be published to
`docs/architecture/topic-ordering-importance.md` during implementation.

### Decisions made autonomously

1. **Promote/demote reuses the existing `updateModule`/`updateTopic` mutation surface rather than a
   new route** — `priority` is structurally identical to the other independently-optional fields
   (`included`, `selfGrade`, `depth`) those inputs already carry; a new route would duplicate
   plumbing that already exists end-to-end.
2. **Priority is a bounded tri-state (`-1 | 0 | 1`), not an unbounded counter** — matches a
   click-a-button UX ("promoted" / "neutral" / "demoted") rather than an ambiguous "promoted how
   many times" accumulator; simplest model that still satisfies "promote or demote the importance."
3. **A separate `node_feedback` comment log, not a reuse of the sibling plan's `study_item_feedback`
   table** — different consumer (none, vs. LLM generation prompts), different lifecycle, and the
   task explicitly asked for these to be independently shippable units; a shared table would create
   a false coupling between two features with different futures.
4. **Node comments are never injected into any generation prompt** — the task's own words scoped
   "goes to the memory of the agent" to per-question/turn feedback only; per-node feedback's stated
   purpose is display order and recommendation, both fully served by `priority` alone.
5. **`strict_order` lives on `curricula`, not per-module or per-topic** — the task's own framing
   ("for some frameworks... the AI model needs to disable sorting") is a whole-curriculum,
   whole-technology decision, not a per-section one; a single boolean is the simplest correct
   granularity.
6. **`sortForDisplay` applies uniformly to both modules-within-curriculum and
   topics-within-module** — doc-research already orders modules basic→medium→advanced via the
   `order` column at insert time, so strict mode protecting that ordering, and non-strict mode
   letting priority override it, is consistent behavior at both granularities; no special-casing
   needed for modules vs topics.
7. **The `strict_order` toggle (SCENARIO 8) is the one genuinely new UI control this plan adds for
   override purposes** — the existing manual-reorder buttons already serve as a real, persistent
   override mechanism (SCENARIO 11), so the *only* gap was a way to opt back into priority-driven
   ordering wholesale; a drag-and-drop rebuild was considered and rejected as solving a problem the
   existing reorder buttons already solve.
8. **This plan does not modify `recommendedTopicId`** — per the explicit scope boundary, a parallel
   sibling plan owns the recommendation engine; this plan's job ends at making `priority` a real,
   persisted, typed field the recommender can read (SCENARIO 12).
9. **`doc-research-architect.agent.ts` gains `strictOrder`; `curriculum-architect.agent.ts` (the
   pasted-material agent) is not modified** — pasted material has no equivalent "was this scraped
   from a sequential tutorial" signal to reason from, and touching that agent's contract is out of
   this plan's explicit scope boundary; its curricula simply keep the column's safe default.
10. **`node_feedback.comment` is `NOT NULL`** — unlike the sibling plan's item-feedback table
    (where a comment-less thumbs vote is itself meaningful data), a node comment row with no text
    would carry zero information; promote/demote already captures the structured sentiment, so an
    empty comment row would exist for no reason.

### Implementation order

1. `/tdd sortForDisplay` + `/tdd nextPriority` — covers SCENARIO 3, 6, 7
2. `packages/shared` schema changes (`module.ts`, `topic.ts`, `curriculum.ts`)
3. `apps/api/src/db/schema.ts` — add the three columns + `node_feedback` table, generate + apply
   the Drizzle migration
4. `curriculum.repo.ts` — wire `sortForDisplay` into `buildModules`, extend `updateModule`/
   `updateTopic`/`updateCurriculum`
5. `node-feedback.repo.ts` + `curriculum.controller.ts` + `router.ts` — comment log routes
6. `curriculum-research-plan.ts` + `doc-research-architect.agent.ts` — `strictOrder` field +
   instructions
7. `curriculum-parse.orchestrator.ts` — `researchCurriculum` persists `strictOrder`
8. Frontend: `curriculum.mutations.ts` hooks, `module-section.tsx`/`topic-row.tsx` promote/demote +
   comment controls + strict-mode note, curriculum-page strict-order toggle
9. Publish `docs/architecture/topic-ordering-importance.md`

### Scope boundary

Out of scope: rebuilding `recommendedTopicId` or any recommendation-engine logic beyond exposing
`priority` on the shared types (a parallel sibling plan owns the recommender); injecting
`node_feedback` comments into any LLM prompt; a stats/dashboard view of promote/demote history (a
separate parallel plan's scope); modifying `curriculum-architect.agent.ts` (the pasted-material
agent) to reason about sequencing; drag-and-drop reordering (the existing position-reorder buttons
already cover manual override); any change to how curricula are confirmed, sourced, or leveled
beyond the one new `strictOrder` field on the doc-research plan schema.
