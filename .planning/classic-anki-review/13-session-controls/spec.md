---
type: spec
branch: learn-from-doc-site
task: F-session — in-session controls (items 13, 14, 16, 17, 18)
complexity: complex
state: confirmed
updated: 2026-10-10
---
# Spec: F-session — in-session controls

## Summary
This feature gives the Anki review page the controls Anki users expect. A learner can take back a grade, see how far through the session they are and a summary at the end, fix a badly worded card on the spot, and set aside a card (until tomorrow, or indefinitely). Cards the learner keeps forgetting are flagged as leeches and set aside automatically, so they stop wasting review time. Everything stays reversible from the review screen. Undo covers grades, suspends and buries, because there is no separate screen to bring a suspended card back.

## The ask
> Run /plan-ie for one feature. The feature covers these items:
> - 13: Undo the last grade with one click or keystroke
> - 14: Show session progress and an end-of-session summary
> - 16: Edit a card's question or answer during review
> - 17: Suspend or bury a card from the review screen
> - 18: Flag leeches after repeated failures and suspend them automatically
>
> Binding architecture is .planning/classic-anki-review/brief.md:
> - DELETE /knowledge-bits/reviews/:id restores prev_schedule and returns 409 not_latest.
> - PATCH /knowledge-bits/:id/schedule takes {suspended, buried}.
> - suspended_at and buried_until columns: this feature owns that migration.
> - A leech is derived as lapses >= 8, with auto-suspend.
> - The edit gate on PATCH /knowledge-bits/question-variants/:id is relaxed from "pending" to "not rejected".
> - Session stats and the undo stack live in client state.
>
> Pitfalls the breakdown flagged:
> - Editing a variant that supersedes it returns a new variantId, which the session must swap in.
> - Leech-suspended cards need an unsuspend path through the PATCH endpoint, but no UI for it.

Binding inputs: `.planning/classic-anki-review/brief.md`, plus row source `.planning/classic-anki-review/breakdown.md` (F-session, tasks 13, 14, 16, 17, 18). Built after F-core (`.planning/classic-anki-review/01-anki-review-core/spec.md`, committed in 45aa599), F-queue (`.planning/classic-anki-review/02-due-queue/plan.md`) and F-learning (`.planning/classic-anki-review/11-learning-steps/`, not yet written).

## Dependency assumptions (verify before step 1)
- **Fact** (F-queue `.planning/classic-anki-review/02-due-queue/plan.md`): the queue function is `getKnowledgeBitReviewQueue(limit, filter, {tz, now}, db)`, returning `{cards, counts, newRemainingToday, nextDueAt}`. The unscoped "new" query is "no schedule row". `getLocalDayWindow(tz, now, db)` lives in `apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts`. The new-today count is `was_new and undone_at is null`. The screen keeps a "graded tally" stamped with `queue.dataUpdatedAt`. F-queue leaves the suspended and buried filters to this feature.
- **Assumption** (F-learning is not written yet, so the brief's contract applies): `knowledge_bit_schedules` gains `phase`, `learning_step` and `lapses` (Drizzle `phase`, `learningStep`, `lapses`). Again on a `review`-phase card increments `lapses` and moves it to `relearning`. Again during `learning`/`relearning` does not. `recordReviewResult` gains `lapses`. The prior-schedule snapshot carries `phase`, `learningStep` and `lapses`. If any of these names or rules differ, adapt this plan's references and keep its behaviour.
- **Assumption**: the grade upsert keeps setting `lastReviewedAt = now` with the same `now` it writes to `knowledge_bit_reviews.reviewed_at` (true for F-core today, at `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:35-52`). Undo's "latest" check depends on that equality.

## Footprint
Every repo-root path created (C) or edited (E). `<next>_<generated>` is whatever name drizzle-kit assigns after F-learning's migration.

- C `apps/api/src/db/migrations/<next>_<generated>.sql`
- C `apps/api/src/db/migrations/meta/<next>_snapshot.json`
- E `apps/api/src/db/migrations/meta/_journal.json`
- E `apps/api/src/db/schema.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule-leech.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule-leech.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-undo.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-undo.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-undo.orchestrator.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-undo.orchestrator.integration.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-suspension.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-suspension.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-suspension.orchestrator.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-review-suspension.orchestrator.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts`
- E `apps/api/src/knowledge-bit/list-next-question-variants.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-approval.repo.integration.test.ts`
- E `apps/api/src/knowledge-bit/topic-due.repo.ts` (beyond the breakdown footprint)
- E `apps/api/src/knowledge-bit/topic-due.repo.integration.test.ts` (beyond the breakdown footprint)
- E `apps/api/src/router-table.ts`
- E `apps/api/src/router.ts`
- E `apps/api/src/api-server.ts`
- E `apps/api/src/router.test.ts`
- E `packages/shared/src/knowledge-bit-review.ts`
- C `apps/web/src/knowledge-bit/anki-review-session.ts`
- C `apps/web/src/knowledge-bit/anki-review-session.test.ts`
- C `apps/web/src/knowledge-bit/anki-review-session-stats.ts`
- C `apps/web/src/knowledge-bit/anki-review-session-stats.test.ts`
- C `apps/web/src/knowledge-bit/anki-review-session-actions.ts`
- C `apps/web/src/knowledge-bit/anki-review-session-bar.tsx`
- C `apps/web/src/knowledge-bit/anki-review-summary.tsx`
- C `apps/web/src/knowledge-bit/anki-review-card-editor.tsx`
- C `apps/web/src/knowledge-bit/anki-review-card-actions.tsx`
- E `apps/web/src/knowledge-bit/anki-review-card.tsx` (beyond the breakdown footprint)
- E `apps/web/src/knowledge-bit/anki-review-screen.tsx`
- E `apps/web/src/knowledge-bit/anki-review-keyboard.ts`
- E `apps/web/src/knowledge-bit/anki-review-keyboard.test.ts`
- E `apps/web/src/knowledge-bit/anki-review.api.ts`
- C `apps/web/src/routes/-knowledge.review.session.test.tsx`
- E `docs/architecture/knowledge-bit/anki-review.md`

## Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `deriveLeechOutcome` in `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule-leech.ts` | `lapsesBefore`, `lapsesAfter` | `{leech, autoSuspend}` | SCENARIO 9 |
| `isLeech` (same file) | `lapses` | boolean (`lapses >= 8`) | SCENARIO 9 |
| `deriveReviewUndo` in `apps/api/src/knowledge-bit/knowledge-bit-review-undo.ts` | review `{reviewedAt, undoneAt}`, `snapshot \| null`, current schedule row `\| null`, `laterLiveReviewExists`, `now` | `{ok:false, error:"not_latest"}` or `{ok:true, row}` (full schedule row to write) | SCENARIO 1, 2, 9, 10 |
| `deriveSuspensionChange` in `apps/api/src/knowledge-bit/knowledge-bit-review-suspension.ts` | current `{suspendedAt, buriedUntil} \| null`, input `{suspended?, buried?}`, `now`, `buryUntil` | `{suspendedAt, buriedUntil}` | SCENARIO 6, 7, 8 |
| `ankiReviewSessionReducer` in `apps/web/src/knowledge-bit/anki-review-session.ts` | session state, action | next session state | SCENARIO 1, 2, 3, 5, 6, 7, 8, 9 |
| `deriveSessionStats` in `apps/web/src/knowledge-bit/anki-review-session-stats.ts` | undo list entries, edited-bit set, server counts, tally | `{reviewed, byGrade, recalledShare, newStudied, totalMs, averageMs, suspended, buried, leeches, edited, remaining}` | SCENARIO 3, 4, 9 |
| `ankiReviewKeyAction` (extended) in `apps/web/src/knowledge-bit/anki-review-keyboard.ts` | key facts, screen facts `+ {canUndo, editing}` | `+ {type:"undo"}`, `{type:"edit"}`, `{type:"bury"}`, `{type:"suspend"}` | SCENARIO 1, 5, 6, 7 |

Rules:
- **Leech:** `LEECH_THRESHOLD = 8` and `LEECH_REPEAT = 4`. `leech = lapsesAfter >= 8`. `autoSuspend = lapsesAfter > lapsesBefore && lapsesAfter >= 8 && (lapsesAfter - 8) % 4 === 0`, which fires at 8, 12, 16 and so on.
- **Undo, refusal:** refuse when `undoneAt` is set, or `laterLiveReviewExists`, or the current row is missing, or `current.lastReviewedAt` is not the same instant as `review.reviewedAt`.
- **Undo, the row written:** grade-owned fields (`easeFactor, intervalDays, dueAt, lastReviewedAt, reviewCount, phase, learningStep, lapses`) come from the snapshot. A key missing from an older snapshot defaults to the column default (`phase` = `review`, `learningStep` = 0, `lapses` = 0). A `null` snapshot gives the ungraded row (`easeFactor` 2.5, `intervalDays` 0, `dueAt` = `review.reviewedAt`, `lastReviewedAt` null, `reviewCount` 0, `phase` `new`, `learningStep` 0, `lapses` 0).
- **Undo, suspension:** `suspendedAt` becomes `snapshot.suspendedAt ?? null` only when `current.suspendedAt` equals `review.reviewedAt` (that grade auto-suspended the card). Otherwise it stays `current.suspendedAt`. `buriedUntil` always stays `current.buriedUntil`.
- **Suspension:** `suspended: true` keeps the existing `suspendedAt` or sets `now`, `false` clears it, and an absent key leaves it unchanged. `buried: true` sets `buryUntil`, `false` clears it, and an absent key leaves it unchanged.
- **Ungraded row:** `reviewCount = 0`. Everywhere it means the same as "no schedule row": the card is new.

## Contracts (`packages/shared/src/knowledge-bit-review.ts`, Zod, additive)
- `reviewCardSchema` gains `leech: z.boolean()`.
- `recordReviewResultSchema` gains `leech: z.boolean()` and `suspended: z.boolean()` (and `lapses: z.number().int()` if F-learning did not add it).
- `undoReviewResultSchema = {knowledgeBitId: string}`.
- `scheduleControlInputSchema = {suspended?: boolean, buried?: boolean, tz?: <F-queue's IANA tz schema>}`, refined so that at least one of `suspended`/`buried` is present. Unknown keys are stripped.
- `scheduleControlResultSchema = {knowledgeBitId, suspended: boolean, buriedUntil: string|null, leech: boolean}`. `buriedUntil` is null once it has passed.
- Endpoints:
  - `DELETE /knowledge-bits/reviews/:id`: 200 `undoReviewResult`, 404 `review_not_found`, or 409 `not_latest`.
  - `PATCH /knowledge-bits/:id/schedule`: 200 `scheduleControlResult`, 400 `invalid_input`, 404 `not_found` or 403 `not_approved`.
  - `PATCH /knowledge-bits/question-variants/:id`: unchanged contract. Its 404 `not_found` now means missing, superseded or rejected.

## Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `knowledge-bit-review-undo.ts` (+test), `knowledge-bit-review-undo.orchestrator.ts` (+integration test), `knowledge-bit-review.repo.ts` (read, later-live check, mark undone), `knowledge-bit-schedule.repo.ts` (replace row), controller, RT3, shared `undoReviewResultSchema` | `anki-review-session.ts` (+test), `anki-review-session-actions.ts`, `anki-review-session-bar.tsx` (Undo button), `anki-review-keyboard.ts` (+test), `anki-review.api.ts`, `anki-review-screen.tsx`, `-knowledge.review.session.test.tsx` | None |
| SCENARIO 2 | `knowledge-bit-review-undo.ts` (refusal rules), undo orchestrator integration test (typed grade after, double undo), route test 409 | `anki-review-session.ts` (drop top entry only), `anki-review-screen.tsx` (message), session route test | None |
| SCENARIO 3 | None | `anki-review-session-stats.ts` (+test), `anki-review-session-bar.tsx`, `anki-review-screen.tsx` | None |
| SCENARIO 4 | None | `anki-review-session-stats.ts` (+test), `anki-review-summary.tsx`, `anki-review-session-bar.tsx` (End session), `anki-review-screen.tsx`, session route test | None |
| SCENARIO 5 | `knowledge-bit-approval.repo.ts` (gate `!== "rejected"`), `knowledge-bit-approval.repo.integration.test.ts` | `anki-review-card-editor.tsx`, `anki-review-card-actions.tsx` (Edit), `anki-review-card.tsx`, `anki-review-session.ts` (variant swap, editor time excluded), `anki-review.api.ts` (`editReviewCard`), `anki-review-keyboard.ts` (E, editing guard), session route test | None |
| SCENARIO 6 | `schema.ts` + migration, `knowledge-bit-review-suspension.ts` (+test), `knowledge-bit-review-suspension.orchestrator.ts` (+integration test), `knowledge-bit-schedule.repo.ts` (eligibility condition, suspension write), `knowledge-bit-review-queue.repo.ts` (+integration test), `knowledge-bit-question-variant.repo.ts`, `topic-due.repo.ts` (+integration test), controller, RT3, shared schedule-control schemas | `anki-review-card-actions.tsx` (Suspend), `anki-review-session.ts`, `anki-review-session-actions.ts`, `anki-review.api.ts` (`updateCardSchedule`), `anki-review-keyboard.ts` (@), session route test | None (migration applied by existing CI step) |
| SCENARIO 7 | same as SCENARIO 6, plus `getLocalDayWindow` reuse for the bury end | `anki-review-card-actions.tsx` (Bury), `anki-review-keyboard.ts` (-), `anki-review-session.ts`, session route test | None |
| SCENARIO 8 | `knowledge-bit-review-suspension.ts` (false clears), suspension orchestrator integration test | `anki-review-session.ts` (suspend/bury entries in one undo list), `anki-review-session-actions.ts`, session route test | None |
| SCENARIO 9 | `knowledge-bit-grade-schedule-leech.ts` (+test), `knowledge-bit-review.orchestrator.ts` (auto-suspend inside the grade transaction, result fields), `knowledge-bit-review.orchestrator.integration.test.ts`, `knowledge-bit-review-queue.repo.ts` (leech per card), shared result and card fields | `anki-review-card-actions.tsx` (Leech marker), `anki-review-screen.tsx` (leech notice), `anki-review-session-stats.ts` (leech count), session route test | None |
| SCENARIO 10 | undo and suspension orchestrators (per-bit lock), their integration tests (concurrent cases) | `anki-review-session.ts` (busy blocks other actions) | None |
| SCENARIO 11 | `knowledge-bit-question-variant.repo.ts` (eligibility condition), `list-next-question-variants.integration.test.ts`; `computeNextSchedule` and `reviewKnowledgeBitSchedule` untouched | None | None |

(Backend paths are under `apps/api/src/knowledge-bit/` unless noted. Frontend paths are under `apps/web/src/knowledge-bit/` or `apps/web/src/routes/`. RT3 means `apps/api/src/router-table.ts`, `apps/api/src/router.ts` and `apps/api/src/api-server.ts`, plus `apps/api/src/router.test.ts`.)

## Files to create
```
apps/api/src/
  db/migrations/<next>_<generated>.sql                 — ALTER TABLE knowledge_bit_schedules ADD suspended_at, buried_until (generated)
  db/migrations/meta/<next>_snapshot.json              — generated
  knowledge-bit/
    knowledge-bit-grade-schedule-leech.ts              — LEECH_THRESHOLD, LEECH_REPEAT, isLeech, deriveLeechOutcome
    knowledge-bit-grade-schedule-leech.test.ts         — 7→8 suspends, 8→9 flags only, 11→12 suspends, relearning Again (no lapse) never suspends
    knowledge-bit-review-undo.ts                       — deriveReviewUndo (pure)
    knowledge-bit-review-undo.test.ts                  — restore, null snapshot → ungraded, old snapshot defaults, leech suspension reverted, manual suspension/bury kept, every refusal
    knowledge-bit-review-undo.orchestrator.ts          — undoKnowledgeBitReview(reviewId, now): read review → withSubjectLock(bit) → re-read review, schedule, later-live check → derive → replace row + mark undone
    knowledge-bit-review-undo.orchestrator.integration.test.ts — restore, undone not counted as new today, typed grade after → not_latest, double undo, chain undo of two grades on one bit, concurrent undo + grade
    knowledge-bit-review-suspension.ts                 — deriveSuspensionChange (pure)
    knowledge-bit-review-suspension.test.ts           — set/keep/clear for each key, absent keys untouched
    knowledge-bit-review-suspension.orchestrator.ts    — updateKnowledgeBitScheduleControls(bitId, input, now): approval check → day window → withSubjectLock → read → derive → write (insert ungraded row if missing)
    knowledge-bit-review-suspension.orchestrator.integration.test.ts — suspend/unsuspend, bury to local midnight, new card stays new, not approved, missing bit
apps/web/src/
  knowledge-bit/anki-review-session.ts                 — session state + ankiReviewSessionReducer (cards, index, revealed, shownAt, editor, undo list, edited bits, tally, view: reviewing|summary)
  knowledge-bit/anki-review-session.test.ts            — reducer cases per scenario, in business language
  knowledge-bit/anki-review-session-stats.ts           — deriveSessionStats
  knowledge-bit/anki-review-session-stats.test.ts      — totals, recalled share, averages, remaining never negative, undo lowers counts
  knowledge-bit/anki-review-session-actions.ts         — useAnkiReviewSessionActions: grade/undo/suspend/bury/edit mutations dispatching to the reducer; one action in flight at a time
  knowledge-bit/anki-review-session-bar.tsx            — "N done · M left" progress, Undo (Z), End session
  knowledge-bit/anki-review-summary.tsx                — summary panel with Keep reviewing
  knowledge-bit/anki-review-card-editor.tsx            — two textareas, Save (Ctrl/Cmd+Enter), Cancel (Esc), inline error
  knowledge-bit/anki-review-card-actions.tsx           — Edit (E, after reveal), Bury (-), Suspend (@), Leech marker
  routes/-knowledge.review.session.test.tsx            — screen-level tests for scenarios 1–9
```

## Files to modify
```
apps/api/src/db/schema.ts — knowledgeBitSchedules gains suspendedAt, buriedUntil (timestamptz, nullable, no default); KnowledgeBitScheduleSnapshot gains optional suspendedAt?, buriedUntil? (ISO|null); no other table changes
  used by: 104 files under apps/api/src
  tests: apps/api/src/db/migrations.integration.test.ts
apps/api/src/db/migrations/meta/_journal.json — entry appended by drizzle-kit only
  used by: apps/api/scripts/migrate.ts
  tests: apps/api/src/db/migrations.integration.test.ts
apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts — readKnowledgeBitScheduleInTx selects the two new columns; grade upsert accepts optional suspendedAt (set only on auto-suspend, never cleared by a grade); add replaceKnowledgeBitScheduleInTx (undo, all columns) and writeKnowledgeBitScheduleControlsInTx (insert ungraded row or update the two columns); export inReviewRotation(now) condition (suspendedAt null and buriedUntil null-or-<=now; null schedule row passes). computeNextSchedule and reviewKnowledgeBitSchedule must not change
  used by: knowledge-bit-review.orchestrator.ts, grade-knowledge-bit-variant-answer.orchestrator.ts
  tests: knowledge-bit-schedule.repo.test.ts, knowledge-bit-schedule-concurrency.integration.test.ts, grade-knowledge-bit-variant-answer.orchestrator.test.ts, knowledge-bit-review.orchestrator.integration.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts — add readKnowledgeBitReviewInTx(tx, id), hasLaterLiveReviewInTx(tx, bitId, reviewedAt, id), markKnowledgeBitReviewUndoneInTx(tx, id, now) (the one sanctioned update of this append-only table); F-queue's day window and new-today count unchanged
  used by: knowledge-bit-review.orchestrator.ts, knowledge-bit-review-queue.repo.ts
  tests: knowledge-bit-review.orchestrator.integration.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts — pass null to the grade deriver when the row is ungraded (reviewCount 0) and set wasNew accordingly; snapshot includes suspendedAt/buriedUntil; deriveLeechOutcome(prev lapses, next lapses) → set suspendedAt=now in the same upsert when autoSuspend; result adds leech, suspended
  used by: knowledge-bit-review.controller.ts
  tests: knowledge-bit-review.orchestrator.integration.test.ts, knowledge-bit-review.route.test.ts, knowledge-bit-review-queue.repo.integration.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts — add handleUndoKnowledgeBitReview(res, id) and handleUpdateKnowledgeBitScheduleControls(req, res, id); existing handlers unchanged
  used by: apps/api/src/api-server.ts
  tests: knowledge-bit-review.route.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts — add inReviewRotation(now) to the shared eligibility (scoped and unscoped paths and counts); "new" = no schedule row or reviewCount 0 (due path requires reviewCount > 0); select lapses → leech via isLeech
  used by: knowledge-bit-review.controller.ts
  tests: knowledge-bit-review-queue.repo.integration.test.ts, knowledge-bit-review.route.test.ts
apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts — typed queue (scoped and unscoped) adds inReviewRotation(now()); nothing else
  used by: list-next-knowledge-bit-question-variants.controller.ts and 14 other importers (claim repos, embedding orchestrator, tests)
  tests: list-next-question-variants.integration.test.ts, list-next-knowledge-bit-question-variants.route.test.ts
apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts — editKnowledgeBitQuestionVariant gate at line 83 becomes `!bit || bit.approvalState === "rejected"`; comment above it stays ≤2 lines; bitApproved and approve/reject unchanged
  used by: knowledge-bit-approval.controller.ts, search-tag-and-bit.repo.ts, list-nodes-by-tag.repo.ts, both queue repos
  tests: knowledge-bit-approval.repo.integration.test.ts (approved-bit case flips to "should edit"), knowledge-bit-approval.controller.test.ts (unchanged)
apps/api/src/knowledge-bit/topic-due.repo.ts — dueCondition adds inReviewRotation(new Date()), and its comment gains one line; nothing else
  used by: apps/api/src/curriculum/curriculum.repo.ts, apps/api/src/topic/topic.controller.ts
  tests: topic-due.repo.integration.test.ts, topic-bit-mastery.integration.test.ts
apps/api/src/router-table.ts — append DELETE /^\/knowledge-bits\/reviews\/([^/]+)$/ (undoKnowledgeBitReview, param id) and PATCH /^\/knowledge-bits\/([^/]+)\/schedule$/ (updateKnowledgeBitScheduleControls, param id), next to the other knowledge-bit regex routes
  used by: apps/api/src/router.ts
  tests: apps/api/src/router.test.ts
apps/api/src/router.ts — append the two RouteName members
  used by: api-server.ts, router-table.ts, router.test.ts
  tests: apps/api/src/router.test.ts
apps/api/src/api-server.ts — two switch cases calling the new handlers
  used by: server.ts and every *.route.test.ts
  tests: every *.route.test.ts under apps/api/src
apps/api/src/router.test.ts — one case resolving both routes; PATCH /knowledge-bits/x still resolves editKnowledgeBit
packages/shared/src/knowledge-bit-review.ts — contracts above, additive only
  used by: @post-anki/shared barrel (already exported)
  tests: none
apps/web/src/knowledge-bit/anki-review-screen.tsx — replace local useState with the session reducer + actions hook; compose session bar, card, card actions/editor, grade buttons, summary, F-queue's counts and done screen; move F-queue's graded tally into the reducer; stay under 300 lines
  used by: apps/web/src/routes/knowledge.review.tsx
  tests: apps/web/src/routes/-knowledge.review.test.tsx (must stay green), new session test
apps/web/src/knowledge-bit/anki-review-card.tsx — accepts an actions slot and an editing flag (editor replaces prompt/answer while editing); chat panel rule unchanged
  used by: anki-review-screen.tsx
  tests: -knowledge.review.test.tsx
apps/web/src/knowledge-bit/anki-review-keyboard.ts — screen facts gain canUndo, editing; "z" and Ctrl/Cmd+"z" → undo (allowed with no card); "e" → edit (revealed); "-" → bury, "@" → suspend (has card); all null while editing or busy; modifiers still block every other key
  used by: anki-review-screen.tsx
  tests: anki-review-keyboard.test.ts
apps/web/src/knowledge-bit/anki-review.api.ts — add undoReview, updateCardSchedule (sends browser tz), editReviewCard (PATCH question-variants/:id); same {ok:false,error} union and Zod parsing
  used by: anki-review-screen.tsx, -knowledge.review.test.tsx
  tests: -knowledge.review.test.tsx, new session test
docs/architecture/knowledge-bit/anki-review.md — "Session controls" section (current state)
```

## Data model changes
`knowledge_bit_schedules` gains two columns:

| Column | Type | Notes |
|---|---|---|
| suspended_at | timestamptz null | set by manual suspend or leech auto-suspend; null = in rotation |
| buried_until | timestamptz null | end of the learner's local day at bury time; null or past = in rotation |

There is no index (single-user, small table, always joined by primary key) and no backfill. Generate with `npm run db:generate:api`. Apply with `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev npm run db:migrate:api`; the environment value takes precedence over `apps/api/.env`, which is production. Also apply it to the database lane the integration suite uses. Never push. The migrate script refuses non-local hosts outside CI (`apps/api/scripts/migrate.ts:16-33`). `knowledge_bit_reviews` gets no column changes. Undo uses its existing `undone_at`.

## Risk & rollout
- Blast radius: the shared eligibility rule now gates the typed queue and the topic and module due badges (home screen, curriculum view). A wrong predicate would hide cards or deflate due counts across the app. Integration tests on both queues and on topic-due cover suspended, buried, expired-bury and no-row cases.
- Relaxing the edit gate lets approved cards change after learners have attempt history on them. History stays on the superseded row, by design, and the bit body edit stays pending-only (`apps/api/src/knowledge-bit/knowledge-bit.repo.ts:179`).
- Coordination: F-learning must land first (lapses), and F-queue's "new = no schedule row" predicates are extended here to "or reviewCount 0". Merge after both and rebase on their queue repo.
- Rollback and failure modes: see architecture.md "Failure modes" and "Rollout". One addition: after a revert, an ungraded row created by suspend or bury would be served by F-queue's due path as a review card with a 1-day interval, not as new. That is harmless for a single learner.

## Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 1–8 | The F-core seed: 6–8 approved bits from one real pasted article, a mix of question kinds, a couple already reviewed | Existing paste → scans → approve flow, locally (F-core seed row) |
| SCENARIO 9 | One approved, already-reviewed bit with 7 lapses, so that the next Again makes it a leech | Establish locally: one `UPDATE knowledge_bit_schedules SET lapses = 7` on the dev lane (no checked-in seed mechanism exists). Integration tests seed their own rows |

## Documentation changes
- knowledge-bit domain: update `docs/architecture/knowledge-bit/anki-review.md` with a present-tense "Session controls" section. It covers undo and its latest-review rule, suspend and bury with the eligibility rule shared by both queues and the due counts, ungraded rows, the leech rule and auto-suspend, the API-only unsuspend path, in-review editing, and the client-only session state.

## Phase 3 — resilience and infra-security pass
- **Auth:** both new endpoints sit behind the existing `authorized()` gate (`apps/api/src/api-server.ts`). Route tests assert a 401 without a token. The single-user model has no per-user ownership checks (brief, "Single-user assumption kept").
- **Input:** Zod covers the PATCH body. `tz` is validated with F-queue's IANA check, and an invalid value gives 400. Path ids reach SQL only as Drizzle parameters. Body size is capped by `readJsonBody` (`apps/api/src/shared/http.ts:4`). The edit body keeps its existing trimmed non-empty rule.
- **Data exposure:** no new data leaves the server beyond two booleans and a timestamp. Neither new column is synced through Electric (the shape registry, `apps/api/src/electric/electric-shape-registry.ts`, does not register the schedules table).
- **Untrusted content:** edited prompts and answers are learner-authored and rendered as React text only. They later feed the chat panel and embeddings exactly as pending-bit edits already do. No new prompt surface.
- **Cost and loops:** no LLM call on any new path. An approved-card edit triggers one re-embedding through the existing scan. No automatic retries: undo, suspend, bury and edit run once per learner action, and the client blocks a second action while one is in flight.
- **Concurrency:** undo and suspend/bury run under `withSubjectLock(knowledgeBitId)` (`apps/api/src/shared/merge-lock.ts:58`), the same lock grading and typed grading use. Undo re-reads the review inside the lock. Edit keeps its `FOR UPDATE` on the bit row (`apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:75-81`). Lock waits are bounded by the pool's connection timeout.
- **Idempotency:** a second undo of the same review gets 409 and writes nothing. Suspend and bury are idempotent (a repeated suspend keeps the original timestamp). A repeated edit after a lost response gets 404, because the variant is already superseded, and the client shows "changed elsewhere".
- **Infra and secrets:** no new resources, secrets, scheduler jobs or Cloud Run changes. The migration is additive and nullable, so it is safe to apply ahead of the API deploy.

## Grill phase (self-run)
The grill-plan-ie red-team subagent could not be dispatched, because this session has no Agent tool. AskUserQuestion was ruled out by the dispatch, so grill-me ran as a self-critique. Every finding was decidable and is logged below.
- Undo after a typed answer would silently overwrite the typed grade, because typed answers keep no history row. Handled by the "schedule still records this grade" check.
- A suspension or bury set after a grade would be wiped by restoring the snapshot. Handled by keeping current control fields, except a leech suspension caused by the undone grade.
- Suspending a never-reviewed card needs a schedule row, which F-queue would read as "reviewed". Handled by the ungraded-row rule (reviewCount 0 = new) in the queue and the grade orchestrator. Typed `computeNextSchedule` already treats `{2.5, 0}` like a missing row (`apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts:73`).
- With no unsuspend UI, an accidental "@" would hide a card for good. Handled by putting suspend and bury in the undo list (SCENARIO 8).
- Topic and module badges would count suspended cards the queue never serves. Handled by adding the eligibility rule to topic-due (beyond the breakdown footprint).
- A leech re-suspending on every failure after a manual unsuspend. Handled by Anki's repeat rule (every 4 lapses after 8).

## Decisions made autonomously
| Decision | Reason |
|---|---|
| "Latest" = not undone, no later live review of the bit, and `lastReviewedAt` equals `reviewedAt` | Typed answers write no history row, so the schedule's own timestamp is the only signal that something graded the bit since |
| Undo restores the grade-owned fields; current suspend/bury is kept unless the undone grade auto-suspended the card | An unrelated manual control must not be reverted by undoing a grade |
| A `null` snapshot restores an ungraded row instead of deleting it | One write path, and it keeps any suspension or bury on the row |
| Ungraded row (reviewCount 0) is treated as new everywhere | Suspend and bury must work on new cards without changing their "new" status or the daily new count |
| Undo 409 drops only that one entry from the client list | Older entries for other bits are still independently undoable |
| A 409 after a lost-response retry is shown as "can't be undone" | The brief fixes 409 for already-undone. The schedule is correct either way |
| Undo brings the card back question side up, at the front of the session, deduplicated by bit | Anki behaviour, and avoids a double showing |
| Undo works from the done screen | The last grade of a session is the one most often regretted |
| Undo keys are bare "z" and Ctrl/Cmd+Z | "One keystroke" was asked for, and Ctrl/Cmd+Z is the Anki desktop key |
| The undo list covers grades, suspends and buries, but not edits | No unsuspend UI exists, and edit undo was not asked for |
| The undo list is unbounded within a session and lost on reload | Client state per the brief, and a session is naturally bounded |
| Progress = actions done this session plus F-queue counts minus the tally, clamped at 0 | Reuses the counts already on screen, and needs no new endpoint |
| Summary appears on the done screen and via "End session". No summary after zero actions | Brief: summary from client state. An empty summary is noise |
| "Recalled" share = (Hard + Good + Easy) / reviewed | Anki's "correct" definition |
| Edit is available after reveal only, via button or "e" | Editing shows the answer, so before reveal it would spoil recall |
| Editor time is excluded from the card's answer duration | Keeps time statistics honest |
| A successful edit swaps the variant id and text in every session reference (current card, later cards, undo list) | The breakdown pitfall. Later grades and undos must use the live version |
| Edit errors keep the typed text in the editor | Never lose the learner's rewrite |
| The web side edits through a new `editReviewCard` in `anki-review.api.ts`, not F-approval's server function | Keeps F-approval's file out of this footprint |
| Bury lasts until the end of the learner's local day, via an optional `tz` in the PATCH body, using F-queue's `getLocalDayWindow` | Anki buries until the next day. `tz` is additive to the brief's contract and mirrors F-queue's GET param |
| Suspend and bury are refused for non-approved bits (403) and missing bits (404) | Mirrors the grade endpoint |
| A repeated suspend keeps the original `suspended_at` | Idempotent, and preserves when the card was first set aside |
| The eligibility rule applies to scoped and unscoped queues in both modes | A set-aside card should never be served. The brief's "scoped keep today's behaviour" is about the due filter |
| Topic and module due counts also skip suspended and buried cards | Otherwise badges promise cards the queue never serves |
| Keyboard: "-" bury, "@" suspend, "e" edit (Anki's own keys) | Familiar to Anki users. `event.key` handles layouts |
| Leech fires at 8 and then every 4 more lapses | Anki's leech rule. Prevents a re-suspend on every fail after an unsuspend |
| The leech rule runs only on the Anki grade path; typed verdicts never auto-suspend | The brief keeps typed mode's formula. Lapses come from Anki grades (F-learning) |
| A leech is shown as a notice after the grade, a marker on unsuspended leech cards and a summary count | "Flag" means visible to the learner |
| Leech auto-suspend is written in the same transaction as the grade | Undo then reverts both atomically |
| Unsuspend is API-only (PATCH `{suspended:false}`), documented, with no UI | The breakdown puts unsuspend UI out of scope |
| Derivers live in new files named under the breakdown's globs (`knowledge-bit-grade-schedule*`, `knowledge-bit-review*`) | Keeps the deriver and orchestrator files under 300 lines after F-learning's growth |
| Separate undo and suspension orchestrators, not more code in the grade orchestrator | One write path per file, and each is easier to test |
| No index on the two new columns | Single user, small table, always reached by primary key |
| Screen tests go in a new `-knowledge.review.session.test.tsx` | The existing route test is near 300 lines |
| `anki-review-card.tsx` gains an actions slot | Edit, bury and suspend sit on the card. This is beyond the breakdown footprint, but a small change |
| Leech seed is a local SQL update on the dev lane | There is no checked-in knowledge-bit seed mechanism. The integration tests seed their own rows |

## Implementation order
1. `deriveLeechOutcome` / `isLeech`: red-green-refactor, covers SCENARIO 9
2. `deriveReviewUndo`: red-green-refactor, covers SCENARIO 1, 2, 9, 10
3. `deriveSuspensionChange`: red-green-refactor, covers SCENARIO 6, 7, 8
4. `deriveSessionStats`: red-green-refactor, covers SCENARIO 3, 4
5. `ankiReviewSessionReducer`: red-green-refactor, covers SCENARIO 1, 2, 5, 6, 7, 8
6. `ankiReviewKeyAction` extension: red-green-refactor, covers SCENARIO 1, 5, 6, 7
7. Shared contracts (all scenarios)
8. Schema columns, snapshot type, `npm run db:generate:api`, then migrate the local dev and integration lanes (SCENARIO 6, 7)
9. Schedule repo helpers and `inReviewRotation`, review repo undo helpers (SCENARIO 1, 6, 7)
10. Grade orchestrator: ungraded = new, snapshot fields, leech auto-suspend, plus its integration test (SCENARIO 9, 11)
11. Undo orchestrator and suspension orchestrator, plus integration tests including the concurrency cases (SCENARIO 1, 2, 6, 7, 8, 10)
12. `inReviewRotation` in the Anki queue repo (and ungraded = new, plus leech per card), the typed repo and topic-due, plus their integration tests (SCENARIO 6, 7, 9, 11)
13. Edit gate relaxation and its integration test (SCENARIO 5)
14. Controller handlers, RT3, router test and route tests (SCENARIO 1, 2, 6, 7)
15. Web: `anki-review.api.ts` server functions, then the actions hook (SCENARIO 1, 5, 6, 7, 8)
16. Web: session bar, summary, card actions, editor, card slot, screen wiring (SCENARIO 1–9)
17. Web: `-knowledge.review.session.test.tsx` (SCENARIO 1–9)
18. Architecture doc. Then the gates: `npx tsc --noEmit` per workspace, `npm run depcruise`, `npm run check-no-dynamic-imports`, `npm run check-web-node-builtins` (the repo has no ESLint), `npx vitest run` in api and web, and `npm run test:integration -w @post-anki/api -- knowledge-bit-review knowledge-bit-approval topic-due list-next-question-variants`

## Scope boundary
- An on-screen unsuspend (a list of suspended cards, a browse view) is cut. Unsuspend is API-only.
- Undo for edits is cut. An edit is reversed by editing again.
- Editing the bit's own text or background during review is cut. The body edit gate stays pending-only.
- Server-side session persistence and cross-device sessions are cut. The brief keeps session state client-only.
- Configurable leech threshold or leech action ("tag only") is cut. The constants live in code.
- Sibling-variant bury (Anki "bury siblings") is cut, because the schedule is already per-bit and so a bury already covers siblings.
- A "Leech" filter or list view is cut.
- Changes to typed grading formulas and to F-queue's ordering or cap are out of scope.

## Consistency gate
Checks 1–8, 10 and 13 pass. Check 9 passes with one domain (knowledge-bit) named. Checks 11 (no BAML) and 12 (no research.md) do not apply. Plan confirmed.
END-OF-REPORT
