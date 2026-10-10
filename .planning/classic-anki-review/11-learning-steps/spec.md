---
type: spec
branch: learn-from-doc-site
task: F-learn — minute-level learning steps (item 11)
complexity: complex
state: confirmed
updated: 2026-10-10
---
# Spec: F-learn — minute-level learning steps

### Summary
New cards and forgotten cards now come back within minutes instead of tomorrow. A new card is shown again after 1 minute and then 10 minutes before it moves to day-based review, and a forgotten review card gets a 10-minute relearning step and a recorded lapse. The review queue serves these in-progress cards first, and serves them a little early when nothing else is left, so a sitting doesn't end while a card is a minute away. The grade buttons show these minute intervals. The per-bit schedule gains a stored phase, step and lapse count so this state survives between requests; existing schedules are treated as plain review cards and keep their dates.

### The ask
> Item 11: "Add minute-level learning steps for new and failed cards".
>
> Binding architecture: .planning/classic-anki-review/brief.md. Use its grade mapping, its learning steps (1m and 10m, graduating at 1d, Easy at 4d, relearning step 10m) and its schema plan: phase, learning_step and lapses columns on knowledge_bit_schedules, with phase defaulting to review for existing rows. This feature owns that migration.
>
> Your plan adds "learning/relearning cards first" ordering to the queue and extends the interval previews to minute steps. Another planner is planning suspend/bury, leech handling and undo (item 17's suspended_at and buried_until migration) in .planning/classic-anki-review/13-session-controls/. Don't plan those columns.

Prerequisites assumed built: F-core (`.planning/classic-anki-review/01-anki-review-core/spec.md`, in the working tree) and F-queue (`.planning/classic-anki-review/02-due-queue/plan.md`: `getKnowledgeBitReviewQueue`, `previewGradeIntervals`, counts, `nextDueAt`, `formatIntervalSeconds`).

### Footprint
Every repo-root path created (C) or edited (E). `00NN_<generated>` is whatever number and name drizzle-kit assigns at generation time.

- C `apps/api/src/db/migrations/00NN_<generated>.sql`
- C `apps/api/src/db/migrations/meta/00NN_snapshot.json`
- E `apps/api/src/db/migrations/meta/_journal.json`
- E `apps/api/src/db/schema.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-learning-steps.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-learning-steps.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-schedule-concurrency.integration.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-queue-learning.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts` (beyond the breakdown footprint, fixture gains `lapses`)
- E `packages/shared/src/knowledge-bit-review.ts`
- E `apps/web/src/routes/-knowledge.review.test.tsx` (beyond the breakdown footprint, fixture gains `lapses`)
- E `docs/architecture/knowledge-bit/anki-review.md` (beyond the breakdown footprint)
- E (conditional) `apps/web/src/knowledge-bit/anki-review-interval.ts` and `apps/web/src/knowledge-bit/anki-review-interval.test.ts`, only if F-queue's `formatIntervalSeconds` does not round 330 s to "6m" and 900 s to "15m"

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `deriveLearningStep` in `apps/api/src/knowledge-bit/knowledge-bit-learning-steps.ts` | `{phase: "new"\|"learning"\|"relearning", learningStep, intervalDays}`, `grade`, `now` | `{phase, learningStep, intervalDays, dueAt}` (stays in a step, or graduates with `phase: "review"`) | SCENARIO 1, 2, 3 |
| `deriveGradeSchedule` (widened) in `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts` | prior `GradeScheduleState` `{easeFactor, intervalDays, phase, learningStep, lapses}` or `null`, `grade`, `now` | `{easeFactor, intervalDays, dueAt, phase, learningStep, lapses, wasNew}` | SCENARIO 1, 2, 3 |
| `previewGradeIntervals` (F-queue's, body unchanged) in `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts` | the widened state or `null`, `now` | `{again, hard, good, easy}` whole seconds | SCENARIO 6 |

Constants live in `knowledge-bit-learning-steps.ts`: `LEARNING_STEPS_SECONDS = [60, 600]`, `RELEARNING_STEPS_SECONDS = [600]`, `GRADUATING_INTERVAL_DAYS = 1`, `EASY_INTERVAL_DAYS = 4`, `LEARN_AHEAD_SECONDS = 1200`.

Transition rule (ease never changes inside a step; lapses change only on review → relearning). `null` and `phase "new"` behave as learning step 0.

| From | Again | Hard | Good | Easy |
|---|---|---|---|---|
| new / learning step 0 | step 0, +60 s | step 0, +330 s (mean of steps 0 and 1) | step 1, +600 s | review, 4 d |
| learning step 1 (last) | step 0, +60 s | step 1, +600 s | review, 1 d | review, 4 d |
| review | relearning step 0, +600 s, lapses +1, ease −0.20, intervalDays 1 | F-core rule | F-core rule | F-core rule |
| relearning step 0 (only) | step 0, +600 s | step 0, +900 s (1.5 × the only step) | review, due + `max(intervalDays,1)` d | review, `max(intervalDays,1) + 1` d |

- Learning keeps `intervalDays` 0 until graduation, so the typed formula treats a learning card as fresh. Relearning keeps the post-lapse `intervalDays` (1 after the clamp).
- Hard on a non-first step repeats that step's delay. Hard on the first step uses the mean of the first two steps, or 1.5 × when only one step exists (Anki v3 behaviour).
- A stored `learningStep` outside the step list is treated as the last step.
- `wasNew` stays `previous === null`.

### Contracts (`packages/shared/src/knowledge-bit-review.ts`)
- `recordReviewResultSchema` gains `lapses: z.number().int().min(0)`. `leech` and `suspended` stay with 13-session-controls.
- Card `phase` now carries `learning` and `relearning` from the stored phase. `cardPhaseSchema` is unchanged.
- `counts.learning` (F-queue's placeholder 0) now counts eligible learning/relearning bits due by `now + LEARN_AHEAD_SECONDS`. `counts.review` excludes those phases.
- No endpoint, route or query param change.

### Queue (unscoped path of `getKnowledgeBitReviewQueue` only)
- Query A (due) orders `phase in (learning, relearning)` first, then `dueAt asc`.
- Query B (new) is unchanged.
- New query C fills `L − A − B` remaining slots with eligible learning/relearning bits where `now < dueAt <= now + LEARN_AHEAD_SECONDS`, `dueAt asc`, using the same eligibility and one-card-per-bit pick. It runs only when A and B leave slots.
- `nextDueAt` is unchanged; C guarantees it is never inside the learn-ahead window when the queue is empty.
- Both paths also select `phase`, `learningStep` and `lapses` to build the preview state. The scoped path keeps its order and emits the stored phase.
- The phase-rank SQL fragment, the learning-count filter and query C live in `knowledge-bit-review-queue-learning.repo.ts`, keeping the queue repo under 300 lines.

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `knowledge-bit-learning-steps.ts` (+test), `knowledge-bit-grade-schedule.ts` (+test), orchestrator (+integration test) | None | None |
| SCENARIO 2 | `knowledge-bit-learning-steps.ts` (+test) | None | None |
| SCENARIO 3 | `knowledge-bit-grade-schedule.ts` (+test), `knowledge-bit-learning-steps.ts` (+test), orchestrator (+integration test), shared `recordReviewResultSchema`, route test fixture | `-knowledge.review.test.tsx` fixture only | None |
| SCENARIO 4 | `knowledge-bit-review-queue.repo.ts`, `knowledge-bit-review-queue-learning.repo.ts`, queue integration test | None (F-queue's counts component already renders `learning`) | None |
| SCENARIO 5 | `knowledge-bit-review-queue-learning.repo.ts` (query C), queue repo, queue integration test | None | None |
| SCENARIO 6 | queue repo (state columns selected), `knowledge-bit-grade-schedule.test.ts` (preview cases) | conditional `anki-review-interval.ts` (+test) | None |
| SCENARIO 7 | `schema.ts`, migration `00NN`, `knowledge-bit-schedule.repo.ts` (read defaults) | None | None (migration applied by the existing CI step, `.github/workflows/deploy.yml:205-206`) |
| SCENARIO 8 | `knowledge-bit-schedule.repo.ts` (typed upsert sets phase review, step 0), `knowledge-bit-schedule-concurrency.integration.test.ts` | None | None |
| SCENARIO 9 | `schema.ts` (`KnowledgeBitScheduleSnapshot` optional keys), orchestrator (snapshot), orchestrator integration test | None | None |

(Backend paths are under `apps/api/src/knowledge-bit/` unless noted. Frontend paths are under `apps/web/src/knowledge-bit/` or `apps/web/src/routes/`.)

### Files to create
```
apps/api/src/
  db/migrations/00NN_<generated>.sql             — 3 × ALTER TABLE knowledge_bit_schedules ADD COLUMN (generated)
  db/migrations/meta/00NN_snapshot.json          — generated
  knowledge-bit/
    knowledge-bit-learning-steps.ts              — step constants + pure deriveLearningStep
    knowledge-bit-learning-steps.test.ts         — every row of the transition table, out-of-range step
    knowledge-bit-review-queue-learning.repo.ts  — phase-rank fragment, learning-count filter, learn-ahead query C
```

### Files to modify
```
apps/api/src/db/schema.ts — knowledgeBitSchedules gains phase text not null default 'review', learningStep integer not null default 0, lapses integer not null default 0; KnowledgeBitScheduleSnapshot gains optional phase, learningStep, lapses. No other table changes
  used by: 104 files under apps/api/src
  tests: apps/api/src/db/migrations.integration.test.ts
apps/api/src/db/migrations/meta/_journal.json — entry appended by drizzle-kit only
  used by: apps/api/scripts/migrate.ts
  tests: apps/api/src/db/migrations.integration.test.ts
apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts — GradeScheduleState and result widened; phase dispatch: new/learning/relearning → deriveLearningStep, review → existing rule, review+again → relearning; clamp constants unchanged; previewGradeIntervals body unchanged
  used by: apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts, queue repo (via F-queue previews)
  tests: apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.test.ts (new-card 1/1/1/4-day and "always review" cases rewritten to the step rule)
apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts — readKnowledgeBitScheduleInTx returns phase (parsed with cardPhaseSchema, unknown → review), learningStep, lapses; upsertKnowledgeBitScheduleInTx writes them; reviewKnowledgeBitSchedule's insert and update set phase 'review' and learningStep 0, never lapses. computeNextSchedule must not change
  used by: apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts, apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts
  tests: apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.test.ts, apps/api/src/knowledge-bit/knowledge-bit-schedule-concurrency.integration.test.ts, apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.test.ts
apps/api/src/knowledge-bit/knowledge-bit-schedule-concurrency.integration.test.ts — append: typed verdict on a relearning row returns it to review with lapses kept
  used by: none found
  tests: itself
apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts — select phase/learningStep/lapses on both paths; Query A phase rank; call query C; counts.learning and counts.review split. Scoped path order untouched
  used by: apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts
  tests: apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts, apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts — append cases for scenarios 4, 5, 6
  used by: none found
  tests: itself
apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts — snapshot gains phase/learningStep/lapses; result gains lapses; lock and transaction shape unchanged
  used by: apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts
  tests: apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts, apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts — first-grade case now expects 1/10-minute steps; append graduation, lapse and snapshot-key cases
  used by: none found
  tests: itself
apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts — mocked result fixtures (~lines 122, 134) gain lapses: 0
  used by: none found
  tests: itself
packages/shared/src/knowledge-bit-review.ts — recordReviewResultSchema gains lapses
  used by: apps/web/src/knowledge-bit/anki-review.api.ts, apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts
  tests: none
apps/web/src/routes/-knowledge.review.test.tsx — result fixture (~line 89) gains lapses: 0; nothing else
  used by: none found
  tests: itself
docs/architecture/knowledge-bit/anki-review.md — "Learning steps" section: states, step table, queue tiers, typed reset, present tense
  used by: none
  tests: none
```

### Data model changes
`knowledge_bit_schedules` gains three columns. Expected generated SQL (precedent `apps/api/src/db/migrations/0081_brainy_ozymandias.sql`):

| Column | Type | Default | Meaning |
|---|---|---|---|
| phase | text not null | 'review' | learning / review / relearning. "new" is never stored; no row means new. No DB check constraint (neighbouring `approval_state` convention); Zod parses on read |
| learning_step | integer not null | 0 | index into the active step list; meaningful only in learning/relearning |
| lapses | integer not null | 0 | review → relearning count; feeds 13-session-controls' leech rule |

- No backfill. Existing rows are typed-mode or F-core schedules, and both scheduled them as plain review cards. F-core's Anki "again" on reviewed cards did not count lapses, and the count starts at 0.
- No new index: the unscoped queue already reads every eligible bit's schedule row, and the deck is single-user.
- Generate with `npm run db:generate:api`. Apply with `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev npm run db:migrate:api`. Never push. `apps/api/.env` points at production, and `apps/api/scripts/migrate.ts:16-38` refuses a non-local host outside CI.
- `KnowledgeBitScheduleSnapshot`'s new keys are optional. Snapshots written by F-core lack them, and any reader (13-session-controls' undo) defaults them to review, 0, 0.

### Risk & rollout
- Blast radius: the shared schedule row. A wrong phase write could strand a card in a step, or send typed-mode cards into learning. Integration tests cover the typed reset and every Anki transition, and `computeNextSchedule` stays byte-identical.
- Coordination: 13-session-controls also migrates this table. Generate this migration only when no other schema change is uncommitted, so drizzle's journal and snapshot stay linear (`.planning/classic-anki-review/breakdown.md` "Shared hot spots").
- The web fixture and the route fixture must gain `lapses`, or the existing tests fail type-checking.
- Deploy ordering, migration safety and rollback: see architecture.md "Failure modes" and "Rollout". Web deploys after the API (`.github/workflows/deploy.yml:300`), so the new required `lapses` field is always present before the web parses it.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 1, 2, 4, 5, 6 | 6–8 approved, never-reviewed bits from one real pasted article | F-core's mechanism: paste → detect/generate scans → approve, run locally. Integration tests insert their own rows |
| SCENARIO 3, 7 | At least two bits with an existing review schedule (one from typed mode, one from an earlier Anki grade) before the migration runs | Same flow, graded before applying the migration locally |

### Documentation changes
- knowledge-bit domain: update `docs/architecture/knowledge-bit/anki-review.md` (created by F-core, extended by F-queue) with a "Learning steps" section covering the four states, the step table, the queue tiers and learn-ahead, the typed-mode reset and the snapshot keys. Present tense, merged into the narrative.

### Phase 3 — resilience and infra-security pass
- **Migration safety on existing rows:** three `ADD COLUMN … DEFAULT <constant> NOT NULL`. On PostgreSQL 11+ a non-volatile default is stored in the catalog, so there is no table rewrite and only a brief ACCESS EXCLUSIVE lock. Production is Neon (`apps/api/scripts/migrate.ts:6`), so 11+. Existing rows read as review, step 0, lapses 0, which reproduces their current scheduling exactly. Ease, interval, due date and review count are untouched.
- **Deploy window:** CI migrates before the API deploys (`.github/workflows/deploy.yml:205-206`). The old API selects named columns only, so it ignores the new ones. Its typed and Anki inserts take the defaults, and review is the correct phase for both of its rules. Forward- and backward-compatible.
- **Rollback:** a code revert. The columns stay and older code ignores them. No down migration (repo convention).
- **Corrupt or unexpected state:** an unknown `phase` text parses to review with a `log.warn`. A `learning_step` past the step list maps to the last step. Negative or NaN values cannot be written (integer column, deriver output only).
- **Concurrency:** all transitions run under the existing per-bit advisory lock (`apps/api/src/shared/merge-lock.ts`), inside the existing single transaction with the history insert. Typed and Anki grades interleave safely, and the concurrency integration test gains the typed-reset case.
- **Auth and input:** no new endpoint, param or route. The existing `authorized()` gate and Zod inputs are unchanged. The phase values sent to the client are from a closed enum.
- **Cost and loops:** zero LLM calls. Query C adds at most one extra bounded query (`limit ≤ 50`), and only when A and B leave slots. The client refetch cadence is unchanged, with no polling, no timers and no auto-retry.
- **Infra and secrets:** none. No Cloud Run or scheduler change.

### Grill phase (self-run)
grill-plan-ie could not be dispatched (no Agent tool in this session) and AskUserQuestion is disallowed by the dispatcher, so grill-me ran as a self-critique. Every finding was decidable and is logged below or in Risk.
- A failed card disappears until the batch ends: accepted. Query C plus refetch-at-batch-end keeps it in the sitting. Mid-batch reinsertion would need client-side scheduling state the brief keeps on the server.
- F-queue's client-side count decrement does not move a failed card into "Learning" until the next fetch: accepted. The counts are corrected on every refetch.
- Breakdown task 11 depends on task 2 (F-queue). If F-queue is not built, the queue edits have no target. Implementation must stop and report rather than build F-queue's structure itself.
- 330 s Hard label: depends on F-queue's rounding. A conditional footprint entry plus a todo check covers it.
- Typed-mode answers on a card mid-step graduate it under the typed formula: intended by the brief ("Typed-mode verdicts … set phase=review").

### Decisions made autonomously
| Decision | Reason |
|---|---|
| New card: Again 1 m, Hard 5.5 m, Good 10 m, Easy 4 d; last step: 1 m / 10 m / 1 d / 4 d | The brief's steps plus Anki v3 Hard semantics, so the grade buttons read "like Anki" |
| Relearning Hard is 15 m (1.5 × the only step) | Anki v3 single-step rule; the brief leaves Hard unspecified |
| Relearning Good graduates at the post-lapse interval (1 d), and Easy at that interval + 1 d (2 d) | The brief fixes only "relearning step 10m". Anki's default new-interval of 0 is clamped to 1 d by the existing minimum |
| Review Again: lapses +1 and ease −0.20 applied on entry to relearning, never again inside it | The brief's mapping. Repeated Again in relearning must not inflate the leech count |
| Ease never changes inside learning/relearning | Anki semantics; the brief's ease steps are review-phase only |
| "new" is never stored; no row means new | Matches F-core and F-queue, which treat "no schedule row" as new; avoids creating rows for unseen bits |
| `learning_step` and `lapses` NOT NULL default 0 instead of nullable | Removes null handling everywhere, and 0 is a valid "first step / no lapses" |
| phase is text with no DB check constraint | Neighbouring `approval_state` convention (`0082_stormy_mac_gargan.sql`); Zod validates on read |
| No lapse backfill from history | Earlier rules never counted lapses, so reinterpreting history would be invented data. The reviews table is brand new |
| No new index | The single-user deck is small, and the queue already joins every schedule row |
| Typed verdicts set phase review and step 0, and leave lapses alone | The brief says typed sets phase=review. Typed "Wrong" was never a lapse in its rule |
| Learning-first ordering and learn-ahead apply to the unscoped queue only | The brief: "Scoped queues … keep today's behaviour" |
| Learn-ahead window 20 min, filling only leftover slots | Anki's default learn-ahead limit. It prevents a false "done for today" a minute before a card returns (SCENARIO 5) |
| `counts.learning` covers bits due within the learn-ahead window | Anki's learning count does the same; it matches what query C can serve |
| `lapses` added to the POST result now, and `leech`/`suspended` left to 13-session-controls | The brief's contract lists lapses. It now has a truthful source; the other two need item 17's columns |
| Step logic in its own pure file, and query C in its own repo file | Keeps every touched file under 300 lines after F-queue's growth |
| Out-of-range stored step maps to the last step | Shortening the step list later must not error on in-flight cards |
| Unknown stored phase reads as review with a warning | Fails safe to the pre-feature behaviour |
| Web code is unchanged unless F-queue's formatter misrounds minutes | F-queue already ships `formatIntervalSeconds` with minute labels |
| Local migration uses the shared pet-projects lane `post_anki_dev` on 127.0.0.1:5999 | Dispatcher instruction; F-core's todo shows the same lane already migrated |
| No lookup-cache write | The dispatcher limits writes to this plan folder. The one web lookup (Postgres constant-default ADD COLUMN) is cited in the final report |

### Implementation order
1. `deriveLearningStep`: red-green-refactor, covers SCENARIO 1, 2, 3
2. Widen `deriveGradeSchedule` and its state type, rewrite the affected tests, add preview cases: covers SCENARIO 1, 3, 6
3. Shared contract: `lapses` on the result. Update the route-test and web-test fixtures (SCENARIO 3)
4. Schema columns and snapshot type, `npm run db:generate:api`, review the SQL against the Data model table, then migrate the local lane (SCENARIO 7, 9)
5. Schedule repo: read/upsert the new fields, typed reset, concurrency integration case (SCENARIO 7, 8)
6. Orchestrator: snapshot keys, result `lapses`, integration cases (SCENARIO 1, 3, 9)
7. Queue: learning repo file (phase rank, count filter, query C), queue repo wiring, integration cases (SCENARIO 4, 5, 6)
8. Check F-queue's formatter on 60/330/600/900 s and extend only if needed (SCENARIO 6)
9. Architecture doc section. Then the gates: `npx tsc --noEmit` per workspace, `npm run depcruise`, `npx vitest run` in api and web, and `npm run test:integration -w @post-anki/api -- knowledge-bit-review knowledge-bit-schedule-concurrency`

### Scope boundary
- `suspended_at`, `buried_until`, leech flag and auto-suspend, and undo belong to 13-session-controls (items 13, 17, 18).
- Configurable step lists or per-deck settings: not asked; the steps are code constants.
- Re-inserting a failed card into the current client batch: not asked; the server queue owns ordering.
- Learning-steps ordering for topic-, tag- or bit-scoped queues: excluded by the brief.
- Changing the typed-mode formula or its queue: out of scope.
- A phase badge on the card UI: not asked.
- SCENARIO 5 (learn-ahead), SCENARIO 8 (typed reset) and SCENARIO 9 (snapshot keys) are `added` but kept as hard prerequisites (reasons in scenarios.md).

### Consistency gate
Checks 1–4 pass. Checks 6, 7, 8, 9 (one domain: knowledge-bit), 10 and 13 pass. Check 5 passes: every scenario has an Acceptance block, pending until implementation cites it. Checks 11 (no BAML) and 12 (no research.md) do not apply. Plan confirmed.
END-OF-REPORT
