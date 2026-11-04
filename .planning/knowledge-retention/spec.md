---
type: spec
branch: learn-from-doc-site
task: knowledge-retention (exam vs long-term study intent)
complexity: complex
state: confirmed
updated: 2026-10-26
---
# Spec: knowledge retention with two study intents

### Summary
Each subject gets a study intent: Exam (with a date) or Long-term. Exam limits review gaps so every card returns before the exam, spreads new cards so new material is done three quarters of the way there, and pauses new cards while reviews pile up; desired retention, stored since the study-options work but unused, now shortens or lengthens review gaps in both intents. The subject page and a new iPhone screen show the four visible settings and a plain forecast (reviews per day, days left, when new material is done).

### The ask
> Goal: the app has a simple knowledge-retention system inspired by Anki, with only a few settings, that fits two uses: exam preparation with a deadline of one to two months, and long-term business knowledge learned over months and years. Then the iOS app gets the matching stats and options.
>
> Scope:
> - Backend and web first: a per-subject study intent of Exam (with a deadline date) or Long-term. Exam derives its own values from the days left: maximum interval no lower than 1 year is NOT used for exams of 1-2 months; instead cap near the days left, new cards per day spread so new material finishes about three quarters of the way to the deadline, a paused-new-cards rule when daily reviews pile up, and retention default 90 percent. Long-term keeps 90 percent and no short cap. A learner can still override the few visible values.
> - Few visible settings only: intent, deadline, desired retention, new cards per day. Hide the rest.
> - Show a plain forecast on the subject page: reviews per day expected and when new material finishes.
> - After that is built, hand over to iOS: show the same intent, deadline, retention and new-cards settings and a short stats view (due forecast, retention, days left).
> - Out of scope: ts-fsrs and any new dependency, Easy Days, filtered decks, audio and images, push.
>
> Constraints: plan and implement in separate subagent dispatches; migration 0125 is next free; never push; other sessions have uncommitted edits, so edits are minimal and additive.
>
> Assumptions: the existing ease-factor scheduler is extended, not replaced. Exam values are derived from the deadline at read time, not stored per card.

### Facts from code
- Fact: review-phase rule is `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts:31-48` (again 1d, hard ×1.2, good ×ease, easy ×ease×1.3), clamped to 1..365 days (`MAX_INTERVAL_DAYS`, line 11). `deriveGradeSchedule`/`previewGradeIntervals` take an optional `StepOptions` last argument defaulting to constants (line 55, 118).
- Fact: graduation from learning is 1 day (Good) / 4 days (Easy); relearning graduates at the kept interval (`apps/api/src/knowledge-bit/knowledge-bit-learning-steps.ts:3-6,80-97`). After Again the kept interval is 1 day.
- Fact: options reach the scheduler only through `readStepOptionsInTx` in `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:29-36` (grade and replay) and `stepsFor` in `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:87-88` (preview).
- Fact: desired retention is stored (`subjects.desired_retention`, `app_settings.desired_retention` default 0.9, range 0.70..0.99 in `packages/shared/src/study-option-fields.ts:5-7`) and read by no scheduler; the web form says "it has no effect on the current scheduler" (`apps/web/src/subject-study-options/subject-study-options-form.tsx:93`, same text in `apps/web/src/routes/admin-settings.tsx:160`).
- Fact: inheritance is per key, nearest non-null in the subject chain, then app defaults: `resolveStudyOptions` / `collectSubjectAncestorIds` (depth cap 20) in `packages/core/src/subject-study-options-resolve.ts`; per-request cached resolver in `apps/api/src/subject-study-options/subject-study-options-resolver.ts`.
- Fact: the daily new-card cap is per card's own subject, not cumulative: `readNewCardAllowance.remainingFor` in `apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts:47-65`; used by the unscoped queue, `subject-review-due-counts.repo.ts` and home overview (`readNewRemainingToday`). Scoped queues ignore the cap.
- Fact: per-subject eligible new cards come from `readFreshBySubject` over `pickedVariants` (`knowledge-bit-review-queue-counts.repo.ts:67-79`); new cards graded today per subject from `countNewCardsReviewedTodayBySubject`.
- Fact: a scheduled-reviews forecast and pass-rate history already exist, scoped to a subject subtree: `readDueForecast` (`apps/api/src/review-statistics/review-statistics-forecast.repo.ts`), `readReviewHistory` (`review-statistics-history.repo.ts`), `resolveSubjectScope`; contract `packages/shared/src/review-statistics.ts`.
- Fact: `subjects.learning_intent` already exists as free-text prompt input for card extraction (`apps/api/src/db/schema.ts:50`, `packages/shared/src/subject-learning-intent.ts`); `study_goals` is an existing table (migration 0122).
- Fact: local-date helper `localDateParts(now, tz)` exists in `packages/shared/src/study-goal-periods.ts:25`; configured user time zone is `readMotivationSettings().timeZone` (fallback UTC) in `apps/api/src/motivation/motivation-settings.repo.ts`. Grade input carries no time zone (`packages/shared/src/knowledge-bit-review.ts:71-76`).
- Fact: highest migration is `apps/api/src/db/migrations/0124_motivation-goal-days.sql`; 0119-0124 and the Part 1 study-options code are uncommitted work of other sessions.
- Fact: typed-answer grading uses its own rule `computeNextSchedule` (`apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts:24`).
- Fact: iOS has no study-options client yet; subject detail is `SubjectDetailScreen` in `apps/ios/Sources/PostAnkiIOS/SubjectsScreen.swift:109` which mounts `SubjectExtrasSection` (`apps/ios/Sources/Shared/SubjectExtrasSection.swift`); API package `apps/ios/Packages/PostAnkiAPI` with fixture-decoding tests (`Tests/PostAnkiAPITests/ProgressDecodingTests.swift`, `Fixture.swift`); explicit-null encoding precedent in `triage-decision-models.swift`.
- External fact (evidence base, given in the request): desired retention is the key setting, default 90%, stay under 97%, higher means more reviews; ~20 new cards/day yields ~200 reviews/day; stop new cards during a backlog; blog rule for a 60-day sprint: max interval about days left, new/day = total/45, pause new if reviews exceed about 400/day.
- External fact: Anki's interval-modifier rule of thumb is log(desired retention)/log(current retention), and Anki's UI bounds the modifier to 0.5..2.0 ([forum](https://forums.ankiweb.net/t/modifying-interval-modifier-again-and-again/4727), [limits](https://forums.ankiweb.net/t/cant-increase-interval-modifier-beyond-2-0/16078)).

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `deriveRetentionMultiplier` | desired retention | multiplier = ln(r)/ln(0.9), clamped 0.5..2.0; exactly 1 at 0.9 | SCENARIO 6, SCENARIO 7 |
| `deriveExamWindow` | resolved intent, exam date, exam planned-on date, today (local) | mode (`exam`/`long_term`), daysLeft, examPassed, maxIntervalDays, newCardsEndOn | SCENARIO 2, SCENARIO 3, SCENARIO 7, SCENARIO 9 |
| `deriveNewCardPace` | window, explicit pace (or null), fallback pace, new cards remaining at day start, today | perDay, paced flag | SCENARIO 3, SCENARIO 4 |
| `deriveNewCardPause` | mode, waiting reviews, perDay | paused, threshold | SCENARIO 5 |
| `resolveStudyPlan` | subject chain links (options + intent fields), app defaults | intent, examDate, plannedAt, intent source, explicit pace (only at or below the intent source), retention | SCENARIO 4, SCENARIO 8 |
| `deriveStudyForecast` | per-subject streams (scheduled cards, new remaining, used today, plan), horizon, today | per-day reviews/new, averages, peak, newFinishOn, finishesBeforeExam | SCENARIO 10, SCENARIO 13 |
| `deriveGradeSchedule` (extended) | state, grade, now, step options + maxIntervalDays + retentionMultiplier | next schedule | SCENARIO 2, SCENARIO 6, SCENARIO 7 |
| `validateStudyIntentPatch` | stored own intent/date, patch, today | ok or `exam_date_required` / `exam_date_in_past` / `exam_date_too_far` / `exam_date_requires_exam_intent` | SCENARIO 1 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `packages/shared/src/study-plan.ts`, `packages/shared/src/subject-study-options.ts`, `apps/api/src/subject-study-options/subject-study-options.repo.ts`, `.orchestrator.ts`, `.controller.ts`, `study-intent-patch.ts` | `apps/web/src/subject-study-options/study-intent-field.tsx`, `exam-date-field.tsx`, `subject-study-options-form.tsx` | `apps/api/src/db/migrations/0125_subject-study-intent.sql` |
| SCENARIO 2 | `packages/core/src/study-plan/study-plan-derive.ts`, `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts`, `knowledge-bit-schedule-options.ts`, `knowledge-bit-review.orchestrator.ts`, `knowledge-bit-review-queue.repo.ts` | None | None |
| SCENARIO 3 | `packages/core/src/study-plan/study-plan-derive.ts`, `apps/api/src/study-plan/study-plan-day.repo.ts`, `apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts` | None | None |
| SCENARIO 4 | `packages/core/src/study-plan/study-plan-resolve.ts` | `apps/web/src/subject-study-options/subject-study-options-form.tsx` | None |
| SCENARIO 5 | `packages/core/src/study-plan/study-plan-derive.ts`, `apps/api/src/study-plan/study-plan-day.repo.ts`, `knowledge-bit-review-queue-counts.repo.ts` | `apps/web/src/study-plan/study-forecast-panel.tsx` | None |
| SCENARIO 6 | `packages/core/src/study-plan/study-plan-derive.ts`, `knowledge-bit-grade-schedule.ts` | `apps/web/src/subject-study-options/subject-study-options-form.tsx`, `apps/web/src/routes/admin-settings.tsx` (copy) | None |
| SCENARIO 7 | `knowledge-bit-grade-schedule.ts`, `knowledge-bit-review-queue-counts.repo.ts` | None | None |
| SCENARIO 8 | `packages/core/src/study-plan/study-plan-resolve.ts`, `apps/api/src/subject-study-options/subject-study-options-resolver.ts` | `apps/web/src/subject-study-options/study-intent-field.tsx` (inherited hint) | None |
| SCENARIO 9 | `packages/core/src/study-plan/study-plan-derive.ts` | `apps/web/src/study-plan/study-forecast-panel.tsx` | None |
| SCENARIO 10 | `packages/shared/src/study-plan.ts`, `packages/core/src/study-plan/study-forecast-derive.ts`, `apps/api/src/study-plan/study-forecast.repo.ts`, `study-forecast.service.ts`, `study-forecast.controller.ts`, `apps/api/src/router-table.ts`, `router.ts`, `api-server.ts` | `apps/web/src/study-plan/study-forecast.api.ts`, `study-forecast-panel.tsx`, `apps/web/src/routes/subject.$subjectId.tsx` | None |
| SCENARIO 11 | None | `apps/web/src/subject-study-options/subject-study-options-form.tsx` | None |
| SCENARIO 12 | None (uses the same endpoints) | `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/StudyPlanModels.swift`, `APIClient+StudyPlan.swift`, `apps/ios/Sources/Shared/study-plan-model.swift`, `study-plan-screen.swift`, `SubjectExtrasSection.swift` | `apps/ios` `xcodegen generate` |
| SCENARIO 13 | None | `apps/ios/Sources/Shared/study-plan-stats-section.swift`, `StudyPlanModels.swift` | None |
| SCENARIO 14 | `apps/api/src/db/schema.ts`, `0125_subject-study-intent.sql`, `meta/0125_snapshot.json`, `meta/_journal.json` | None | migration run |

### Files to create
```
packages/shared/src/study-plan.ts                       intent/exam-date schemas, forecast query+response schemas, constants
packages/shared/src/study-plan.test.ts
packages/core/src/study-plan/study-plan-derive.ts       retention multiplier, exam window, pace, pause
packages/core/src/study-plan/study-plan-derive.test.ts
packages/core/src/study-plan/study-plan-resolve.ts      intent group + explicit-pace precedence over the chain
packages/core/src/study-plan/study-plan-resolve.test.ts
packages/core/src/study-plan/study-forecast-derive.ts   day-by-day simulation
packages/core/src/study-plan/study-forecast-derive.test.ts
packages/core/src/study-plan/index.ts
apps/api/src/subject-study-options/study-intent-patch.ts (+ .test.ts)  validateStudyIntentPatch
apps/api/src/study-plan/study-plan-today.ts             local today from configured time zone
apps/api/src/study-plan/study-plan-day.repo.ts          per-subject fresh / used-today / waiting-review counts, only when an exam subject exists
apps/api/src/study-plan/study-forecast.repo.ts          scheduled card rows (due day offset, interval, ease, subject) for a subtree
apps/api/src/study-plan/study-forecast.service.ts
apps/api/src/study-plan/study-forecast.controller.ts
apps/api/src/study-plan/study-forecast.integration.test.ts
apps/api/src/study-plan/study-plan-queue.integration.test.ts
apps/api/src/knowledge-bit/knowledge-bit-schedule-options.ts  toScheduleOptions(resolved plan, today) -> step options + cap + multiplier
apps/api/src/db/migrations/0125_subject-study-intent.sql (generated) + meta/0125_snapshot.json
apps/web/src/subject-study-options/study-intent-field.tsx (+ .test.tsx)
apps/web/src/subject-study-options/exam-date-field.tsx
apps/web/src/study-plan/study-forecast.api.ts
apps/web/src/study-plan/study-forecast-panel.tsx (+ .test.tsx)
apps/web/src/study-plan/test-mocks.ts
apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/StudyPlanModels.swift
apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient+StudyPlan.swift
apps/ios/Packages/PostAnkiAPI/Tests/PostAnkiAPITests/StudyPlanDecodingTests.swift
apps/ios/Packages/PostAnkiAPI/Tests/PostAnkiAPITests/Fixtures/subject-study-options.json, study-forecast-exam.json, study-forecast-empty.json
apps/ios/Sources/Shared/study-plan-model.swift
apps/ios/Sources/Shared/study-plan-screen.swift
apps/ios/Sources/Shared/study-plan-stats-section.swift
```

### Files to modify
```
apps/api/src/db/schema.ts — subjects: + studyIntent text, examDate text (YYYY-MM-DD), examPlannedAt timestamptz; nothing else
  used by: everything DB; tests: migrations.integration.test.ts
packages/shared/src/subject-study-options.ts — override + own gain studyIntent, examDate; response gains `intent {studyIntent, examDate, source}`; StudyOptions / STUDY_OPTION_KEYS / effective / sources unchanged
  used by: api study-options module, web form, core resolver; tests: subject-study-options.test.ts
packages/shared/src/index.ts, packages/core/src/index.ts — export new files (one line each)
apps/api/src/subject-study-options/subject-study-options.repo.ts — read/write 3 new columns; set examPlannedAt=now when own intent becomes exam or examDate changes; clear date+plannedAt when intent is not exam
  used by: orchestrator, resolver; tests: subject-study-options.integration.test.ts
apps/api/src/subject-study-options/subject-study-options-resolver.ts — add resolvePlan(subjectId) next to resolve(); resolve() unchanged
  used by: orchestrator, review orchestrator, queue repo, queue counts repo
apps/api/src/subject-study-options/subject-study-options.orchestrator.ts, .controller.ts — validate patch, map errors to 400 codes, return `intent`
  tests: subject-study-options.integration.test.ts, .route.test.ts
apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts — options gain optional maxIntervalDays (default 365), retentionMultiplier (default 1); review-phase hard/good/easy × multiplier, floors only when multiplier < 1, final cap on any review-phase result. Defaults must reproduce today's output exactly
  used by: review orchestrator, queue cards repo, suspension orchestrator, suspended repo; tests: knowledge-bit-grade-schedule.test.ts, -leech.test.ts
apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts — readStepOptionsInTx -> schedule options (plan + today from configured tz); nothing else
  tests: knowledge-bit-review.route.test.ts, integration suites
apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts — stepsFor -> schedule options for previews (same today source)
apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts — readNewCardAllowance.remainingFor uses the plan day limit (pace, 0 when paused) when any exam subject exists; unchanged path otherwise; deriveUnscopedQueueCounts / readNewRemainingToday signatures unchanged
  used by: home-study-overview.repo.ts, home-study-overview.service.ts, knowledge-bit-review-queue.repo.ts, subject-review-due-counts.repo.ts
apps/api/src/router-table.ts, router.ts, api-server.ts — register GET /subjects/:id/study-forecast
apps/web/src/subject-study-options/subject-study-options-form.tsx — intent + exam date fields at top; new cards field shows "Auto" in exam mode; retention copy; steps inside closed <details> "More options"
  tests: subject-study-options-form.test.tsx
apps/web/src/routes/subject.$subjectId.tsx — load forecast (settle), render StudyForecastPanel, reload forecast after a save
apps/web/src/routes/admin-settings.tsx — retention description copy only
apps/ios/Sources/Shared/SubjectExtrasSection.swift — one NavigationLink "Study plan"
docs/architecture/knowledge-bit/anki-review.md — Study intent, retention multiplier, caps, pacing, pause, forecast (current state)
```

### Data model changes
Migration `0125_subject-study-intent` (generate with `npx drizzle-kit generate --name subject-study-intent`, run `npm run db:migrate` in `apps/api`): `subjects` add `study_intent text null` (`exam` | `long_term`, validated in app like `model_tier`), `exam_date text null` (`YYYY-MM-DD`, like `motivation_goal_days.day`), `exam_planned_at timestamptz null`. No backfill, no app_settings change (app default intent is the constant Long-term). Purely additive.

### Risk & rollout
- Subjects that already store a desired retention other than 0.9 get different review gaps from their next grade on (the form said it had no effect). Before release, list them (`select id, name, desired_retention from subjects where desired_retention is not null and desired_retention <> 0.9`) and tell the owner; app default 0.9 keeps everything else unchanged.
- Shared queue files (`knowledge-bit-review-queue-counts.repo.ts`, `knowledge-bit-review-queue.repo.ts`, review orchestrator, `schema.ts`, `_journal.json`) are uncommitted edits of other sessions (Part 1 and others). Edits must be additive; re-read each file immediately before editing; confirm 0125 is still free right before generating.
- The unscoped queue, home overview and subject due counts all go through the new-card allowance; a bug there hides or floods new cards for every subject. The exam path runs only when a subject resolves to Exam, so default users stay on today's code path.
- Rollback: revert code; the three columns are nullable and ignored by old code, so the migration need not be reverted.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 3, 5, 10, 13 | One subject with ~450 approved new cards and ~300 scheduled cards spread over the next 60 days, plus one sub-subject; one subject with >400 waiting reviews | Integration tests build their own rows (pattern of `subject-study-options.integration.test.ts`); manual checks use the owner's existing dev database subjects (real usage), setting one to Exam. No new seed script. |

### Documentation changes
- `docs/architecture/knowledge-bit/anki-review.md` — add current-state sections: study intent and inheritance, retention multiplier, max interval by intent, exam pacing, backlog pause, forecast endpoint; remove "retention has no effect" wording.

### Decisions made autonomously
- D1 Naming: `study_intent` (values `exam`, `long_term`) — avoids `learning_intent` (prompt text) and `study_goals` (existing table). UI label "Studying for".
- D2 Retention in SM-2: next review interval × m, m = ln(r)/ln(0.9) clamped to 0.5..2.0 — Anki's own documented interval-modifier rule and bounds; m = 1 at 0.9, so defaults are byte-identical. Effective range is ~80%..95%; the UI says values outside have no further effect. Stored range 0.70..0.99 is not narrowed (no data breakage).
- D3 Floors (only when m < 1): Hard ≥ previous interval, Good ≥ previous + 1 day, Easy ≥ Good + 1 day — Anki's rule that intervals keep growing; not applied at m ≥ 1 so today's maths is untouched.
- D4 Multiplier applies to review-phase Hard/Good/Easy only; learning/relearning steps and graduation intervals are unchanged (short, not retention-driven).
- D5 Max interval: Long-term 365 days; Exam min(365, max(1, daysLeft − 1)) so a card graded today is back by the day before the exam; applied to every review-phase result including graduation. Evidence base says "about days left"; minus one makes the guarantee hold.
- D6 Pace: newCardsEndOn = plannedOn + round(0.75 × (examDate − plannedOn)), never after examDate − 1. daysForNew = newCardsEndOn − today + 1 when today ≤ newCardsEndOn, else max(1, daysLeft − 1). perDay = min(200, ceil(remainingAtDayStart / daysForNew)), remainingAtDayStart = eligible new now + new graded today (stable within a day). Matches the request's "three quarters" and the blog's total/45 for 60 days. Needs the hidden `exam_planned_at`, set by the server; recomputing 75% of the remaining time daily would keep pushing the finish date toward the exam.
- D7 Override precedence in Exam: a typed new-cards value on the exam subject or any subject below it wins; values from above it or the app default are replaced by the pace. Retention inherits as today (Exam default 90% = app default, nothing special).
- D8 Pause: Exam only; paused when waiting reviews (due now, not new) for the card subject ≥ max(100, 20 × perDay). 20 = twice the ~10 reviews per daily new card in the evidence; at 20/day it is the blog's 400. Recomputed on each request, so new cards return once the pile is worked down. Long-term is not paused (keeps today's behaviour); logged as open item.
- D9 Intent group inheritance: intent, exam date and planned-at resolve together from the nearest subject with an own intent; app default Long-term. Pace is per card subject (keeps D1 of the study-options plan: non-cumulative).
- D10 Exam date passed (daysLeft ≤ 0): behaves as Long-term; stored values kept; UI prompts.
- D11 Patch rules: own intent Exam requires a date (in body or stored); date must be ≥ today and ≤ today + 730 days; a date with a non-Exam own intent is refused; setting intent to Long-term or null clears date and planned-at.
- D12 "Today" for exam maths everywhere (grade, preview, allowance, forecast) comes from the configured time zone (`motivation_settings.time_zone`, fallback UTC) so the preview always equals the grade; forecast day buckets use the request `tz` like review statistics.
- D13 Forecast is a separate endpoint `GET /subjects/:id/study-forecast?tz=` (heavier, needed alone by iOS); study-options GET stays a pure settings read.
- D14 Forecast model: deterministic simulation assuming every review is answered Good; each review adds (1 − r) expected extra same-day review for forgotten cards; new cards graduate to 1 day then grow by ease 2.5 × m under the cap; pause and pace re-derived per simulated day; per-subject streams summed over the subtree. Horizon: Exam min(daysLeft, 90), else 30. Finish date past the horizon extrapolated at the last pace; null when pace is 0.
- D15 Recent retention = pass rate of the last 30 days from the existing review history repo; no new query.
- D16 Queue response shape unchanged; a pause shows through the existing "new limit reached" flag and the forecast panel's reason.
- D17 No app-level intent setting and no admin page change except retention copy.
- D18 iOS: online-only settings (no offline queue, matching subject management screens); screen lives in `Sources/Shared` and is linked from the iPhone subject screen only; the Mac link is not added. Retention stepper limited to 80-95% (the range with an effect, D2); new cards 1-200 with an "Auto" toggle in Exam (D7); `inherit` is sent as explicit null.
- D19 Typed-answer grading keeps its own rule (no cap/multiplier) — out of scope, logged.
- D20 Grill phase ran as an internal self-critique (dispatched run, no subagent or interview available); findings folded into D5, D6, D12, D16 and Risk.
- D21 `todo.md` not written: owned by `/todo-ie`, not available in this dispatched run.

### Implementation order
1. `packages/shared/src/study-plan.ts` + `subject-study-options.ts` additions — tests first.
2. `deriveRetentionMultiplier`, `deriveExamWindow`, `deriveNewCardPace`, `deriveNewCardPause` — red-green-refactor, SCENARIO 2, 3, 5, 6, 9.
3. `resolveStudyPlan` — SCENARIO 4, 8.
4. `deriveGradeSchedule` extension — SCENARIO 2, 6, 7 (regression suite unchanged and green).
5. `deriveStudyForecast` — SCENARIO 10.
6. `validateStudyIntentPatch` — SCENARIO 1.
7. Schema + migration 0125 (generate, migrate) — SCENARIO 14.
8. Study-options repo/resolver/orchestrator/controller — SCENARIO 1, 8.
9. Schedule options in grade + preview; plan-aware new-card allowance — SCENARIO 2, 3, 5, 7.
10. Forecast repo/service/controller + route — SCENARIO 10.
11. Integration tests against the local dev DB.
12. Web form, forecast panel, subject page, admin copy — SCENARIO 6, 10, 11.
13. Docs.
14. iOS package models/client/tests, then screens — SCENARIO 12, 13.

### Scope boundary
- SCENARIO 9 (exam date passed) is `added` and kept: Exam mode needs a defined after-date behaviour.
- Out: ts-fsrs and any new dependency, Easy Days, filtered decks, audio/images, push.
- Out: backlog pause for Long-term.
- Out: rewriting existing due dates when intent, date or retention change.
- Out: Mac app link to the study plan screen; offline editing on iOS.
- Out: queue response changes and an app-level intent default.
