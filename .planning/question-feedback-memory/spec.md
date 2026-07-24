---
type: spec
branch: question-feedback-memory
task: Per-question/turn thumbs feedback that feeds future quiz and Socratic generation
complexity: complex
state: confirmed
updated: 2026-07-15
---
<!-- Consistency gate: PASS (all 8 checks) — promoted from draft to confirmed 2026-07-15. -->
# Spec: Question feedback memory

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Data model + deriver | 1–10 | Migration for `study_item_feedback`; `buildFeedbackDigest` deriver | None | None | N/A (unit-tested) |
| 2 — API wiring | 1–6, 9 | `feedback/feedback.repo.ts`, `feedback.controller.ts`, routes, upsert semantics | None | Phase 1 | Single indexed upsert, no added latency to existing flows |
| 3 — Generation injection | 7, 8, 9, 10 | `probe-session.generate.ts`'s `topicBlock`, `probe.service.ts`'s `generateQuestion` call the retrieval+deriver pair; `probe-quiz.agent.ts` + `mentor.agent.ts` instruction updates | None | Phase 2 | No added LLM calls — same call count as today |
| 4 — Web frontend | 1–6 | None (consumes Phase 2 API) | New `ItemFeedbackButtons` component wired into `ProbeSessionQuiz`/`SocraticChat` | Phase 2, and `topic-study-experience`'s `ProbeSessionQuiz`/`SocraticChat` components existing | Popover open/submit feels instant — no LLM call on the write path |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `buildFeedbackDigest` (`packages/core/src/feedback/feedback-digest.ts`, new) | `rows: { rating: "up" \| "down"; comment: string \| null; itemText: string }[]` (already capped/ordered by the caller) | `string \| null` — formatted keep/avoid block, or `null` when nothing renders | SCENARIO 3, 4, 7, 8, 9 |
| `selectRecentFeedback` (`packages/core/src/feedback/feedback-digest.ts`, new, sibling to the above) | `rows: FeedbackRow[]` (all rows for a topic, unsorted) | `FeedbackRow[]` — at most 10 most-recent `down` + 5 most-recent `up`-with-comment, sorted most-recent-first | SCENARIO 10 |

Both are pure: no DB access, no LLM call. The repo layer fetches all rows for a topic; these two derivers do the selection and formatting.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `apps/api/src/feedback/feedback.repo.ts`, `feedback.controller.ts` — upsert, comment optional | `apps/web/src/feedback/item-feedback-buttons.tsx` — new | None |
| SCENARIO 2 | Same as 1 | Same as 1 — popover comment field | None |
| SCENARIO 3 | Same as 1 | Same as 1 | None |
| SCENARIO 4 | Same as 1 | Same as 1 — submit with empty comment allowed | None |
| SCENARIO 5 | `feedback.repo.ts` — upsert keyed on `(item_type, item_id)` | `item-feedback-buttons.tsx` — re-clicking updates local state from server response | None |
| SCENARIO 6 | Same repo/controller, `itemType: "socratic_turn"` branch | `item-feedback-buttons.tsx` used inside `socratic-chat.tsx` (topic-study-experience's component) | None |
| SCENARIO 7 | `apps/api/src/probe-session/probe-session.generate.ts` (`topicBlock`), `apps/api/src/feedback/feedback.repo.ts` (`getFeedbackForTopic`), `packages/core/src/feedback/feedback-digest.ts`, `apps/api/src/mastra/probe-quiz.agent.ts` | None | None |
| SCENARIO 8 | `apps/api/src/probe/probe.service.ts` (`generateQuestion`), same repo/deriver, `apps/api/src/mastra/mentor.agent.ts` | None | None |
| SCENARIO 9 | Both prompt-builder call sites — `buildFeedbackDigest` returning `null` short-circuits the injected block | None | None |
| SCENARIO 10 | `packages/core/src/feedback/feedback-digest.ts` (`selectRecentFeedback`) | None | None |

### Files to create

```
packages/shared/src/
  feedback.ts                    — itemFeedbackTypeSchema ('probe_question'|'socratic_turn'),
                                     itemFeedbackRatingSchema ('up'|'down'), itemFeedbackSchema
                                     (read shape), submitItemFeedbackInput = { rating,
                                     comment: z.string().trim().min(1).max(500).optional() } —
                                     deliberately NOT topicId/itemText: those are resolved
                                     server-side from the item id in the route path, never
                                     trusted from the client (prevents a spoofed digest entry)

packages/core/src/
  feedback/
    feedback-digest.ts           — selectRecentFeedback, buildFeedbackDigest
    feedback-digest.test.ts

apps/api/src/
  feedback/
    feedback.repo.ts             — upsertItemFeedback, getFeedbackForTopic, rowToItemFeedback
    feedback.controller.ts       — handleSubmitFeedback (looks up source item for topicId/itemText,
                                     404s if the item doesn't exist, then upserts)

apps/web/src/
  feedback/
    item-feedback-buttons.tsx    — 👍/👎 + popover comment field, calls submitItemFeedback
    feedback.api.ts              — createServerFn wrapper for POST feedback endpoints
```

### Files to modify

```
apps/api/src/
  db/schema.ts                              — + studyItemFeedback table
  router.ts                                 — + "submitProbeQuestionFeedback",
                                                "submitSocraticTurnFeedback" route names,
                                                POST /probe-session-questions/:id/feedback,
                                                POST /socratic-turns/:id/feedback
                                                (both dispatch to the same controller function
                                                with itemType fixed per route)
  server.ts                                 — dispatch the two new route names to
                                                feedback.controller.ts's handler(s)
                                                (mirrors the existing switch-on-RouteName
                                                pattern used for every other entity's routes)
  probe-session/probe-session.generate.ts   — topicBlock() accepts an optional feedback digest
                                                string, splices it into the per-topic prompt block
  probe/probe.service.ts                    — generateQuestion() fetches+injects the same digest
                                                for the topic being probed
  mastra/probe-quiz.agent.ts                — instructions: new rule — if a "Prior feedback"
                                                section is present, honor its avoid/keep items
  mastra/mentor.agent.ts                    — ASK_INSTRUCTIONS: same rule as above

apps/web/src/curriculum/
  probe-session-quiz.tsx  — renders ItemFeedbackButtons per question (file already being created
                              by topic-study-experience; this plan adds to it, doesn't replace it)
  socratic-chat.tsx       — renders ItemFeedbackButtons per turn bubble (same note)
```

### Data model changes

Drizzle-generated migration, one new table (see `architecture.md`'s "Data model evolution" for full column list): `study_item_feedback`, polymorphic over `(item_type, item_id)`, unique on that pair, denormalized `topic_id` (nullable) and `item_text` snapshot. No changes to any existing table.

### Documentation changes

No existing doc covers quiz/Socratic generation prompt assembly in detail. A short Mermaid diagram of this plan's architecture (submit → store → retrieve+digest → inject) will be published to `docs/architecture/question-feedback-memory.md` during implementation.

### Decisions made autonomously

1. **One polymorphic `study_item_feedback` table, not two per-source tables** — both item kinds share an identical rating/comment/date shape and the same digest consumer; a real DB FK is impossible across two tables anyway, so the "two tables would each get a clean FK" argument doesn't actually hold. App-layer existence check on write substitutes for the FK.
2. **No LLM call anywhere in the feedback path** — the user's own comment already is the correction note; a digest-time template ("Avoid: <comment>") satisfies "what needs to be corrected" without summarization latency or cost. Full reasoning in `architecture.md`.
3. **Quiz-question feedback and Socratic-turn feedback share one digest, injected into both generation call sites** — both are "how this topic's questions should be framed" signals; splitting them per-surface would mean a lesson learned in Socratic mode never reaches quiz generation for the same topic, which contradicts the user's intent ("what needs to be corrected" should generalize).
4. **Module-scope quiz feedback (null `topic_id`) is stored but never injected anywhere** — no topic-scoped query can match it, and module-scope batch generation isn't the flow this plan targets. Logged, not silently dropped from the design.
5. **Retrieval cap: 10 most-recent `down` + 5 most-recent `up`-with-comment per topic** — bounds prompt size indefinitely without a decay algorithm; a personal app's feedback volume per topic is low enough that "most recent N" is a reasonable proxy for "still relevant."
6. **Comment-less up-votes are stored but never rendered in the digest** — "thumbs up, no text" has positive signal value for a future stats view (out of scope here) but zero actionable content for a generation prompt.
7. **Upsert keyed on `(item_type, item_id)`, not an append-only log** — an item is a fixed, immutable piece of generated content; the user's *current* opinion on it is what matters, not a history of opinion changes. `updated_at` tracks the latest edit, `created_at` the first vote.
8. **Feedback UI is a new shared `apps/web/src/feedback/` component, imported into the two topic-study-experience components rather than built inside them** — those components are mid-implementation in a parallel plan; this keeps the integration to two small import+render additions instead of redesigning components this plan doesn't own. Logged as a real cross-plan sequencing dependency in `todo.md`.
9. **`generateQuestion`'s shared use by the old self-graded `apps/probe` flow and `today.tsx` also gains the feedback block, as a side effect** — mirrors the precedent already set by `topic-study-experience` spec.md's decision #13 for the same function; not new scope, just an accepted consequence of one shared function.
10. **Route shape: two nested REST routes (`POST /probe-session-questions/:id/feedback`, `POST /socratic-turns/:id/feedback`) over one generic `POST /feedback`** — matches this repo's established sub-resource nesting convention (e.g. `/topics/:id/gaps`) per this project's REST naming rule, and lets each route pin `itemType` server-side rather than trusting a client-supplied enum.
11. **Comment is capped at 500 characters at the schema level (`z.string().trim().min(1).max(500)`)** — a thumbs-down popover is a quick reaction, not a document; this bounds the digest's per-row size independent of the row-count cap (Decision 5), so one unusually long comment can't dominate the prompt budget on its own.
12. **Feedback buttons are visible on an item at any time it's rendered — mid-answer, post-reveal, or in a later review of the same session — with no gating on answered state** — the user is reacting to the question's phrasing/content, not to their own performance on it, so there's no reason to hide the control before or after answering.

### Implementation order

1. `/tdd selectRecentFeedback` + `/tdd buildFeedbackDigest` — covers SCENARIO 3, 4, 7, 8, 9, 10
2. `packages/shared/src/feedback.ts` — schemas
3. `apps/api/src/db/schema.ts` — add `study_item_feedback`, generate + apply migration
4. `apps/api/src/feedback/feedback.repo.ts` — upsert + retrieval
5. `apps/api/src/feedback/feedback.controller.ts` + `router.ts` — the two nested routes
6. `probe-session.generate.ts` + `probe.service.ts` — wire retrieval+deriver into prompt assembly
7. `probe-quiz.agent.ts` + `mentor.agent.ts` — instruction updates
8. `apps/web/src/feedback/item-feedback-buttons.tsx` + `feedback.api.ts`
9. Wire into `probe-session-quiz.tsx` and `socratic-chat.tsx`
10. Publish `docs/architecture/question-feedback-memory.md`

### Scope boundary

Out of scope: any LLM summarization call (submission-time or otherwise); a feedback review/moderation UI; feedback on modules/topics themselves (see the sibling `topic-ordering-importance` plan); changing quiz/Socratic scoring or turn mechanics; module-scope quiz feedback ever reaching a generation prompt; any stats/aggregate view of feedback (a personal-learning-map dashboard is a separate parallel plan's scope); `socratic.agent.ts` (the grading/eval agent) — it grades an answer, it doesn't generate question content, so it has nothing to respect an avoid/keep list about.
