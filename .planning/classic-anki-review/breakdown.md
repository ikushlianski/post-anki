# Breakdown: classic-anki-review

## 2. Task table

Path legend: KB = apps/api/src/knowledge-bit/, WKB = apps/web/src/knowledge-bit/, SH = packages/shared/src/, RT3 = apps/api/src/router-table.ts + apps/api/src/router.ts + apps/api/src/api-server.ts, MIG = apps/api/src/db/schema.ts + apps/api/src/db/migrations/.

| # | Task (exact) | Tier | Guarded | Footprint | Depends |
|---|---|---|---|---|---|
| 1 | Add Anki review mode: show answer, then self-grade Again/Hard/Good/Easy | Complex | yes (new reviews table) | MIG; KB knowledge-bit-grade-schedule*, KB knowledge-bit-review* (queue repo, review repo, orchestrator, controller, tests), KB knowledge-bit-schedule.repo.ts; RT3; SH knowledge-bit-review.ts, SH index.ts; apps/web/src/routes/knowledge.review.tsx, apps/web/src/routes/-knowledge.review.test.tsx, apps/web/src/routeTree.gen.ts, WKB anki-review*, apps/web/src/curriculum/api-client.ts (export `request`), apps/web/src/nav/sidebar.tsx, apps/web/src/routes/knowledge.answer.tsx (mode link) | none |
| 2 | Serve only due or never-reviewed cards in the unscoped review queue | Simple | no | KB knowledge-bit-question-variant.repo.ts, KB list-next-question-variants.integration.test.ts, KB knowledge-bit-review-queue.repo*.ts | 1 |
| 3 | Hide bit text above the question in Anki review mode | Trivial | no | WKB anki-review-card*.tsx | 1 |
| 4 | Run bit detection and question generation right after paste | Simple | yes (new in-process background job) | apps/api/src/knowledge-source/knowledge-source.controller.ts (+test), KB knowledge-bit-pipeline-kick.orchestrator*.ts (new) | none |
| 5 | Link review page from sidebar and add-knowledge success, with pending count | Simple | no | apps/web/src/nav/sidebar.tsx, apps/web/src/knowledge-source/add-knowledge-form.tsx, apps/web/src/routes/-add-knowledge.test.tsx, WKB knowledge-bit-review.api.ts, apps/web/src/curriculum/api-client.ts; KB knowledge-bit-approval.controller*.ts, KB knowledge-bit-approval.repo*.ts; RT3; SH knowledge-bit.ts | none |
| 6 | Refresh review page so bits awaiting questions become approvable | Simple | no | apps/web/src/routes/knowledge-bit-review.tsx, WKB knowledge-bit-review-panel*.tsx | none |
| 7 | Add bulk approve on the knowledge-bit review page | Simple | no | KB knowledge-bit-bulk-approval.repo* (new), KB knowledge-bit-approval.controller*.ts; RT3; SH knowledge-bit.ts; WKB knowledge-bit-review-panel*.tsx, WKB knowledge-bit-review-item.tsx, WKB knowledge-bit-review.api.ts, apps/web/src/curriculum/api-client.ts | none |
| 8 | Add simple front/back basic-card variant for plain recall facts | Complex | yes (schema, infra job, generation worker) | MIG; apps/api/src/mastra/knowledge-bit-basic-card-generator.agent*.ts (new), KB knowledge-bit-basic-card-* (claim repo, orchestrator, tests, new), KB detect-knowledge-bits.controller.ts, KB knowledge-bit-pipeline-kick.orchestrator.ts, KB knowledge-bit-question-variant.repo.ts (typed excludes basic), KB knowledge-bit-review-queue.repo.ts (preference); RT3; infra/index.ts; SH knowledge-bit.ts; WKB knowledge-bit-review-item.tsx, apps/web/src/curriculum/api-client.ts (kind union); e2e-local/mock-openrouter/ | 4 |
| 9 | Keyboard shortcuts: Space reveals answer, 1-4 grade the card | Simple | no | WKB anki-review-keyboard*.ts (new), WKB anki-review-screen*.tsx | 1 |
| 10 | Show the next interval on each grade button, like Anki | Simple | no | KB knowledge-bit-grade-schedule*.ts (preview fn), KB knowledge-bit-review-queue.repo*.ts; SH knowledge-bit-review.ts; WKB anki-review-grade-buttons*.tsx | 1 |
| 11 | Add minute-level learning steps for new and failed cards | Complex | yes (phase/learning_step/lapses columns) | MIG; KB knowledge-bit-grade-schedule*.ts, KB knowledge-bit-schedule.repo*.ts, KB knowledge-bit-schedule-concurrency.integration.test.ts, KB knowledge-bit-review-queue.repo*.ts, KB knowledge-bit-review.orchestrator*.ts; SH knowledge-bit-review.ts | 1, 2 |
| 12 | Cap new cards per day and show due and new counts | Complex | no | KB knowledge-bit-review-queue.repo*.ts, KB knowledge-bit-review.repo*.ts, KB knowledge-bit-review.controller*.ts; SH knowledge-bit-review.ts; WKB anki-review-screen*.tsx, WKB anki-review-counts*.tsx (new), WKB anki-review.api.ts | 2 |
| 13 | Undo the last grade with one click or keystroke | Simple | no | KB knowledge-bit-review.repo*.ts, KB knowledge-bit-review.orchestrator*.ts, KB knowledge-bit-review.controller*.ts; RT3; WKB anki-review-session*.ts, WKB anki-review-screen*.tsx, WKB anki-review-keyboard.ts, WKB anki-review.api.ts | 1 |
| 14 | Show session progress and an end-of-session summary | Simple | no | WKB anki-review-session*.ts, WKB anki-review-summary*.tsx (new), WKB anki-review-screen*.tsx | 1 |
| 15 | Show done-for-today screen with next due time when queue empty | Simple | no | WKB anki-review-done*.tsx (new), WKB anki-review-screen*.tsx; KB knowledge-bit-review-queue.repo*.ts (nextDueAt) | 2 |
| 16 | Edit a card's question or answer during review | Simple | no | KB knowledge-bit-approval.repo*.ts (edit gate), KB knowledge-bit-approval.repo.integration.test.ts; WKB anki-review-card-editor*.tsx (new), WKB anki-review-screen*.tsx, WKB anki-review-session.ts | 1 |
| 17 | Suspend or bury a card from the review screen | Complex | yes (suspended_at/buried_until) | MIG; KB knowledge-bit-schedule.repo*.ts, KB knowledge-bit-review-queue.repo*.ts, KB knowledge-bit-question-variant.repo.ts, KB knowledge-bit-review.controller*.ts; RT3; SH knowledge-bit-review.ts; WKB anki-review-screen*.tsx, WKB anki-review.api.ts | 2 |
| 18 | Flag leeches after repeated failures and suspend them automatically | Simple | no | KB knowledge-bit-grade-schedule*.ts, KB knowledge-bit-review.orchestrator*.ts, KB knowledge-bit-schedule.repo.ts; SH knowledge-bit-review.ts; WKB anki-review-screen*.tsx | 11, 17 |
| 19 | Approve or reject suggestions by keyboard; approve all from a source | Simple | no | WKB knowledge-bit-review-keyboard*.ts (new), WKB knowledge-bit-review-panel*.tsx, WKB knowledge-bit-review-item.tsx | 7 |
| 20 | Hide the chat panel until the answer is revealed | Trivial | no | WKB anki-review-card*.tsx | 1 |


## 3. Suggested features

### Shared hot spots that force serialization
- **Route triple (RT3):** `apps/api/src/router-table.ts`, `apps/api/src/router.ts` (the `RouteName` union) and `apps/api/src/api-server.ts` (the dispatch switch). Any new endpoint touches all three. They already run 643 and 799 lines, so keep the edits to appends.
- **Schema:** `apps/api/src/db/schema.ts` and `apps/api/src/db/migrations/`. Only one schema-touching feature can be in flight at a time. Drizzle journal and snapshot files conflict otherwise.
- **Shared barrel:** `packages/shared/src/index.ts`. It gets a single append, in task 1. `packages/shared/src/knowledge-bit.ts` is edited by F-approval and by task 8.
- **Web shared files:** `apps/web/src/curriculum/api-client.ts` (1907 lines), `apps/web/src/nav/sidebar.tsx` and `apps/web/src/routeTree.gen.ts` (generated).
- **`knowledge.answer.tsx`:** only task 1 edits it (the mode link), so it is not a contention point. That is the main payoff of using a separate route.
- **Within the Anki features:** `WKB anki-review-screen.tsx`, `KB knowledge-bit-review-queue.repo.ts` and `KB knowledge-bit-schedule.repo.ts` force serial order across F-core, F-queue and F-session.

### F-core: Anki review core (tasks 1, 3, 9, 20)
Footprint:
- MIG
- RT3
- `KB knowledge-bit-grade-schedule*`, `KB knowledge-bit-review*`, `KB knowledge-bit-schedule.repo.ts`
- `SH knowledge-bit-review.ts`, `SH index.ts`
- `apps/web/src/routes/knowledge.review.tsx`, `apps/web/src/routes/-knowledge.review.test.tsx`, `apps/web/src/routeTree.gen.ts`
- `WKB anki-review*`
- `apps/web/src/curriculum/api-client.ts`, `apps/web/src/nav/sidebar.tsx`, `apps/web/src/routes/knowledge.answer.tsx`

It owns the first migration (the reviews table). It must land first among the Anki features.

### F-kick: after-paste pipeline (task 4)
Footprint:
- `apps/api/src/knowledge-source/knowledge-source.controller.ts` (+test)
- `KB knowledge-bit-pipeline-kick.orchestrator*`

This footprint is strictly disjoint from every other feature. It can run concurrently with anything.

### F-approval: approval page UX (tasks 5, 6, 7, 19)
Footprint:
- `apps/web/src/nav/sidebar.tsx`
- `apps/web/src/knowledge-source/add-knowledge-form.tsx`, `apps/web/src/routes/-add-knowledge.test.tsx`
- `apps/web/src/routes/knowledge-bit-review.tsx`
- `WKB knowledge-bit-review*` (panel, item, api, keyboard)
- `apps/web/src/curriculum/api-client.ts`
- `KB knowledge-bit-approval.controller*`, `KB knowledge-bit-approval.repo*`, `KB knowledge-bit-bulk-approval.repo*`
- RT3
- `SH knowledge-bit.ts`

No schema changes. It overlaps F-core only on RT3, `sidebar.tsx` and `api-client.ts`, and all three overlaps are small appends. It can run concurrently with F-core if it merges second and rebases those three spots. Its footprint is not strictly disjoint.


### F-queue: due queue and scheduler (tasks 2, 10, 11, 12, 15)
Footprint:
- MIG
- `KB knowledge-bit-question-variant.repo.ts`, `KB list-next-question-variants.integration.test.ts`
- `KB knowledge-bit-grade-schedule*`, `KB knowledge-bit-schedule.repo*`, `KB knowledge-bit-schedule-concurrency.integration.test.ts`
- `KB knowledge-bit-review*` (queue repo, review repo, orchestrator, controller)
- `SH knowledge-bit-review.ts`
- `WKB anki-review*` (grade buttons, counts, done, screen, api)

It owns migration 2 (phase, learning_step, lapses). It runs after F-core because it shares the screen, the queue repo and the deriver. It can run concurrently with F-approval and F-kick. It must not run alongside F-session or F-basic, because all three touch the schema.

### F-session: in-session controls (tasks 13, 14, 16, 17, 18)
Footprint:
- MIG
- RT3
- `KB knowledge-bit-review*`, `KB knowledge-bit-schedule.repo*`, `KB knowledge-bit-grade-schedule*`
- `KB knowledge-bit-question-variant.repo.ts`
- `KB knowledge-bit-approval.repo*` (edit gate) and `KB knowledge-bit-approval.repo.integration.test.ts`
- `SH knowledge-bit-review.ts`
- `WKB anki-review*` (session, summary, card editor, keyboard, screen, api)

It owns migration 3 (suspended_at, buried_until). It runs after F-queue, because task 18 needs 11 and 17, and 17 needs 2. It also runs after F-approval, because both touch `KB knowledge-bit-approval.repo.ts`.

### F-basic: basic-card variant (task 8)
Footprint:
- MIG
- RT3
- `infra/index.ts`
- `apps/api/src/mastra/knowledge-bit-basic-card-generator.agent*`
- `KB knowledge-bit-basic-card-*`
- `KB detect-knowledge-bits.controller.ts`, `KB knowledge-bit-pipeline-kick.orchestrator.ts`, `KB knowledge-bit-question-variant.repo.ts`, `KB knowledge-bit-review-queue.repo.ts`
- `SH knowledge-bit.ts`
- `WKB knowledge-bit-review-item.tsx`
- `apps/web/src/curriculum/api-client.ts`
- `e2e-local/mock-openrouter/`

It owns migration 4 (claim columns on knowledge_bits). It runs last, or at least after F-kick, F-approval and F-queue. It shares the schema with every other migration owner, the item file with F-approval, and the queue and variant repos with F-queue and F-session.

### Suggested waves
1. F-core, F-kick and F-approval. F-kick is fully disjoint. F-approval merges after F-core and rebases RT3, `sidebar.tsx` and `api-client.ts`.
2. F-queue.
3. F-session.
4. F-basic.

Only one migration owner is in flight per wave. Inside each feature, tasks run in TODO order.

### Things to check while implementing
- Today the variant edit and bit body edit are gated to `pending` only (`apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:83`, `apps/api/src/knowledge-bit/knowledge-bit.repo.ts:179`). Task 16 relaxes only the variant gate. An edit that supersedes a variant returns a new `variantId`, which the session state must swap in.
- `/knowledge-bits/question-variants/next` does not return `answer` today (`apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts:107-114`). That is why Anki mode needs its own endpoint, so typed mode cannot leak the reference answer.
- Task 2 changes behaviour in the typed mode's unscoped queue. The "fair cycling" doc comment and `apps/api/src/knowledge-bit/list-next-question-variants.integration.test.ts` must be updated in the same change.
- Leech-suspended cards need an unsuspend path. The PATCH schedule endpoint supports it, but no UI surface for it is in scope.
- The grader and follow-up agents have kind-specific prompts (`apps/api/src/mastra/knowledge-bit-answer-grader.agent.ts:22-33`). That is the reason basic cards are excluded from the typed queue.

### Critical Files for Implementation
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/db/schema.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/router-table.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/web/src/routes/knowledge.answer.tsx
