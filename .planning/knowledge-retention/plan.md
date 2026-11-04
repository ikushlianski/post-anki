---
type: plan
branch: learn-from-doc-site
task: knowledge-retention (exam vs long-term study intent)
state: confirmed
updated: 2026-10-26
---
# Plan: knowledge retention with two study intents

Derived from `spec.md` in this folder (the contract `/implement-ie` builds from); scenarios in `scenarios.md`. Part A (backend + web) lands and is verified before Part B (iOS) starts. Plan and implementation are separate dispatches. No new dependency, no ts-fsrs; the ease-factor scheduler is extended, not replaced. One additive migration (0125).

## Business summary

- Each subject is studied either for an **Exam** on a date, or **Long-term**. Sub-subjects follow their parent unless they choose their own. Untouched subjects are Long-term and behave exactly as today.
- **Exam** works itself out from the days left: review gaps never run past the day before the exam, new cards are spread so new material is done three quarters of the way to the exam (leaving the last quarter for review only), and new cards pause while waiting reviews pile up.
- **Desired retention** finally does something: higher means shorter gaps and more reviews, lower means longer gaps and fewer. 90% (the default) keeps today's gaps exactly. The useful range is 80% to 95%.
- Only four settings are visible: studying for (intent), exam date, desired retention, new cards per day. Learning steps move behind "More options". A typed new-cards number still wins in Exam mode.
- The subject page shows a plain forecast: days left, reviews due today, about how many reviews a day to expect, the busiest day, and when new material will be done (flagged if that is after the exam).
- After web/backend ship, the iPhone subject screen gets a "Study plan" screen with the same four settings and a short stats block (days left, due today, reviews per day, recent retention vs target, new material done date).

## Facts from the code

See `spec.md` "Facts from code" for citations. In short:
- Review rule: again 1d, hard ×1.2, good ×ease, easy ×ease×1.3, clamped 1..365 days; options passed as an optional last argument; only two call paths (grade/replay in the review orchestrator, preview in the queue repo).
- Retention is stored per subject and app-wide (default 0.9, range 0.70..0.99) and used by nothing; the web copy says so.
- Inheritance: per key, nearest subject up the chain, then app defaults; cached resolver per request.
- New-card cap is per card's own subject (not cumulative) through one function used by the unscoped queue, home overview and subject due counts; scoped queues ignore it.
- A subject-scoped scheduled-reviews forecast and 30/90/365-day pass rate already exist (review statistics).
- `learning_intent` (prompt text) and `study_goals` (table) already exist, so the new field is named `study_intent`.
- Highest migration 0124; 0119-0124 and Part 1 code are uncommitted work of other sessions.
- iOS has no study-options client; the iPhone subject screen mounts `SubjectExtrasSection`.

## Decisions (with reasons)

Full list D1-D21 in `spec.md`. The ones that shape behaviour:

1. **Retention → interval multiplier.** m = ln(r) / ln(0.9), clamped to 0.5..2.0 (Anki's interval-modifier rule and its UI bounds). Applied to review-phase Hard/Good/Easy. Examples: 95% → 0.5 (half the gap), 85% → 1.54, 80% → 2.0, 90% → exactly 1. When m < 1, floors keep gaps growing: Hard ≥ previous, Good ≥ previous + 1 day, Easy ≥ Good + 1 day. At m ≥ 1 no floors, so defaults reproduce today's numbers exactly.
2. **Max interval from days left.** Long-term: 365. Exam: min(365, max(1, daysLeft − 1)), applied to every review-phase result, including graduation from learning. So anything answered today is back by the day before the exam, and gaps shrink as the exam approaches.
3. **New cards per day pace.** A hidden `exam_planned_at` is stamped when Exam or its date is set. newCardsEndOn = plannedOn + round(0.75 × (examDate − plannedOn)), never later than the day before the exam. Each day: perDay = min(200, ceil(remainingAtDayStart / daysForNew)), where daysForNew = newCardsEndOn − today + 1 (or max(1, daysLeft − 1) once past that point), and remainingAtDayStart = eligible new cards now + new cards already graded today (so the number does not shrink during the day). 450 cards, 60 days → 10/day, done around day 45. Without the planned-at stamp, "three quarters of the remaining time" recomputed daily would keep sliding the finish date toward the exam.
4. **Override precedence.** In Exam mode a typed new-cards value on the exam subject or below it wins; inherited values from above it and the app default are replaced by the pace. Retention inherits exactly as today.
5. **Auto-pause.** Exam only. New cards for a card subject are paused while its waiting reviews (due now, not new) ≥ max(100, 20 × perDay). Reason: ~10 reviews per daily new card is steady state in the evidence; twice that is a backlog; at 20/day it equals the blog's 400. Re-checked on each request, so new cards come back once the pile is worked down.
6. **Forecast.** Deterministic simulation per card subject in the subtree, summed: every review answered Good; each review adds (1 − r) expected same-day repeat for forgotten cards; scheduled cards advance by interval × ease × m under the cap of that day; new cards per day from the pace rule with pause applied per day; new cards graduate to 1 day, then grow with ease 2.5 × m. Horizon: Exam min(daysLeft, 90), else 30 days. New material done date = first day remaining hits 0; past the horizon it is extrapolated at the last pace; none when pace is 0.
7. **Inheritance.** Intent, exam date and planned-at travel together from the nearest subject with its own intent; app default is the constant Long-term. Pace and pause are per card subject, so each sub-subject paces its own cards to the shared date.
8. **Exam date passed** → behaves as Long-term; settings kept; the page prompts.
9. **Time.** "Today" for exam maths (grade, preview, allowance, forecast) uses the configured time zone (motivation settings, fallback UTC), so a preview always equals the grade it predicts. Forecast day labels use the request `tz`, like review statistics.

**Legend:** ➕ add · ✏️ change · ➖ remove

# Part A — backend and web

## 1. Database

| | Table | Change | Why |
|---|---|---|---|
| ➕ | `subjects.study_intent` | `text null` (`exam` \| `long_term`, app-validated like `model_tier`) | null = same as parent |
| ➕ | `subjects.exam_date` | `text null`, `YYYY-MM-DD` (like `motivation_goal_days.day`) | local calendar date, no time zone drift |
| ➕ | `subjects.exam_planned_at` | `timestamptz null`, server-set | anchors the three-quarter point (decision 3) |

Migration `0125_subject-study-intent.sql`: edit `apps/api/src/db/schema.ts`, then in `apps/api` run `npx drizzle-kit generate --name subject-study-intent` and `npm run db:migrate`. Never push. No backfill, no `app_settings` change. Confirm 0125 is still free immediately before generating (other sessions add migrations).

## 3. Business rules (derivers)

`packages/core/src/study-plan/` (entity folder, exported from `packages/core/src/index.ts`):

- `deriveRetentionMultiplier(r)` — ln(r)/ln(0.9), clamp 0.5..2.0; returns exactly 1 for 0.9.
- `deriveExamWindow({ intent, examDate, plannedOn, today })` → `{ mode, daysLeft, examPassed, maxIntervalDays, newCardsEndOn }`. Long-term or passed date → mode `long_term`, cap 365, no end date.
- `deriveNewCardPace({ window, explicitPerDay, fallbackPerDay, remainingAtDayStart, today })` → `{ perDay, paced }`. Long-term: explicit ?? fallback (today's value). Exam: explicit (decision 4) or pace (decision 3); 0 when nothing remains.
- `deriveNewCardPause({ mode, waitingReviews, perDay })` → `{ paused, threshold }`; never paused in Long-term.
- `resolveStudyPlan(chain, appDefaults)` → `{ intent, examDate, plannedAt, intentSource, explicitPerDay, desiredRetention }`; reuses the existing per-key resolution for retention; explicit pace counts only links at or below the intent source.
- `deriveStudyForecast({ streams, horizonDays, today })` → per-day `{ reviews, newCards }`, average, peak, `newFinishOn`, `finishesBeforeExam`.

`apps/api` (existing deriver, extended):
- ✏️ `deriveGradeSchedule` / `previewGradeIntervals` options gain optional `maxIntervalDays` (default 365) and `retentionMultiplier` (default 1). Review phase: hard/good/easy × m, floors when m < 1, then clamp 1..maxIntervalDays; any review-phase result (also graduation) is clamped to the cap. Again/relearning unchanged.
- ➕ `validateStudyIntentPatch` (`apps/api/src/subject-study-options/study-intent-patch.ts`): Exam needs a date (body or stored); date ≥ today and ≤ today + 730; a date with a non-Exam own intent is refused; Long-term/null clears date and planned-at.

## 4. Services

| | File | What it does |
|---|---|---|
| ✏️ | `apps/api/src/subject-study-options/subject-study-options.repo.ts` | Read/write the 3 columns; stamp `exam_planned_at = now()` when own intent becomes Exam or the date changes; clear both when intent is not Exam. Single-row update. |
| ✏️ | `apps/api/src/subject-study-options/subject-study-options-resolver.ts` | Add `resolvePlan(subjectId)` beside `resolve()` (same rows, same cache, depth cap 20). `resolve()` untouched. |
| ✏️ | `apps/api/src/subject-study-options/subject-study-options.orchestrator.ts` | Validate patch with today from the configured time zone; return `own` + `intent`. |
| ➕ | `apps/api/src/study-plan/study-plan-today.ts` | Local today via `readMotivationSettings().timeZone` + `localDateParts`. |
| ➕ | `apps/api/src/knowledge-bit/knowledge-bit-schedule-options.ts` | `toScheduleOptions(plan, today)` = step options + `maxIntervalDays` + `retentionMultiplier`. |
| ✏️ | `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts` | Grade and replay read schedule options inside the existing transaction (one consistent value per grade). Replay uses current options, as today. |
| ✏️ | `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts` | Preview uses the same schedule options, so preview = grade. |
| ➕ | `apps/api/src/study-plan/study-plan-day.repo.ts` | One grouped query over the unscoped `pickedVariants`: per card subject fresh count and waiting reviews; plus existing new-graded-today counts. Runs only if some subject resolves to Exam. |
| ✏️ | `apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts` | `readNewCardAllowance.remainingFor` uses the plan day limit (pace, or 0 when paused) minus used today when Exam subjects exist; otherwise the current code path. Exported signatures unchanged (home overview and due counts keep working). |
| ➕ | `apps/api/src/study-plan/study-forecast.repo.ts` | Scheduled card rows for the subtree (due day offset, interval, ease, card subject) with the same eligibility filters as `readDueForecast`. |
| ➕ | `apps/api/src/study-plan/study-forecast.service.ts` | Scope via `resolveSubjectScope`, plans via resolver, counts via day repo, recent retention via `readReviewHistory` (30 days), then `deriveStudyForecast`. |

Cost guard: no AI calls; one extra grouped query per queue request only when an Exam subject exists; forecast loads card rows for one subtree only.

## 5. Validation (Zod, `packages/shared`)

| Schema | Fields |
|---|---|
| ➕ `studyIntentSchema` (`study-plan.ts`) | `z.enum(["exam","long_term"])` |
| ➕ `examDateSchema` | `YYYY-MM-DD` string that is a real calendar date |
| ✏️ `studyOptionsOverrideSchema` / `updateSubjectStudyOptionsInput` (`subject-study-options.ts`) | + `studyIntent: studyIntentSchema.nullable().optional()`, `examDate: examDateSchema.nullable().optional()`; refine: `examDate` string not allowed with `studyIntent` `long_term`/`null` in the same body |
| ✏️ `subjectStudyOptionsSchema` | `own` + `studyIntent`, `examDate` (nullable); ➕ `intent: { studyIntent, examDate: string \| null, source: subjectId \| "app" }`. `effective`, `sources`, `StudyOptions`, `STUDY_OPTION_KEYS` unchanged. |
| ➕ `studyForecastQuerySchema` | `tz` (valid time zone, default from configured tz) |
| ➕ `studyForecastSchema` | `intent`, `examDate`, `daysLeft`, `examPassed`, `desiredRetention`, `recentRetention` (0..1 or null), `maxIntervalDays`, `newCards { perDay, paced, pausedToday, pauseThreshold, remaining, finishOn, finishesBeforeExam }`, `reviews { dueToday, averagePerDay, peakPerDay, peakOn }`, `days [{ date, reviews, newCards }]` |
| ➕ constants | `EXAM_NEW_MATERIAL_SHARE = 0.75`, `PAUSE_REVIEWS_PER_NEW_CARD = 20`, `PAUSE_MIN_REVIEWS = 100`, `RETENTION_MULTIPLIER_MIN = 0.5`, `RETENTION_MULTIPLIER_MAX = 2`, `LONG_TERM_MAX_INTERVAL_DAYS = 365`, `EXAM_DATE_MAX_DAYS_AHEAD = 730` |

## 6. API endpoints

| | Method | Path | Who | Purpose | Errors |
|---|---|---|---|---|---|
| ✏️ | GET | `/subjects/:id/study-options` | signed-in owner | + `own.studyIntent`, `own.examDate`, `intent` | 404 `subject_not_found` |
| ✏️ | PATCH | `/subjects/:id/study-options` | signed-in owner | accepts `studyIntent`, `examDate` | 400 `invalid_input`, `exam_date_required`, `exam_date_in_past`, `exam_date_too_far`, `exam_date_requires_exam_intent`; 404 |
| ➕ | GET | `/subjects/:id/study-forecast?tz=` | signed-in owner | forecast + stats for the subject subtree | 400 invalid tz; 404 unknown subject |

Registered in `apps/api/src/router-table.ts`, `router.ts`, `api-server.ts` beside the study-options routes. Review queue, grade and counts responses are unchanged.

## 9. Client state (web)

- `apps/web/src/study-plan/study-forecast.api.ts`: server fn GET forecast with the browser time zone.
- Subject route loader settles options and forecast in parallel; after any options save, the forecast is reloaded (router invalidate), so the forecast always reflects the saved values.

## 10. Frontend (web)

| | Where | Change |
|---|---|---|
| ✏️ | `apps/web/src/subject-study-options/subject-study-options-form.tsx` | Order: Studying for, Exam date (only when Exam), Desired retention, New cards per day. Steps move into a closed `<details>` "More options". Retention copy: "Higher means shorter gaps and more reviews. 90% suits most; 80-95% is the useful range." New cards in Exam mode without a typed value shows "Auto" plus today's pace from the forecast; a reset link clears a typed value. |
| ➕ | `apps/web/src/subject-study-options/study-intent-field.tsx` | Exam / Long-term choice plus "Same as <parent>" (null) with the inherited hint (reuse `InheritedHint`). |
| ➕ | `apps/web/src/subject-study-options/exam-date-field.tsx` | Date input; server error codes shown as plain sentences. |
| ➕ | `apps/web/src/study-plan/study-forecast-panel.tsx` | Plain lines: "N days left until the exam", "M reviews due today", "About X reviews a day over the next H days (busiest: P on Tue 4 Nov)", "New material done around 30 Nov, 2 weeks before the exam" / "... after the exam: raise new cards per day" / "not at the current pace", "New cards paused: 430 reviews waiting (limit 400)", "Exam date passed: set a new date or switch to Long-term". Empty subject: "No cards yet." |
| ✏️ | `apps/web/src/routes/subject.$subjectId.tsx` | Mount the panel above the form; load error shows a one-line message like the options load error. |
| ✏️ | `apps/web/src/routes/admin-settings.tsx` | Retention description copy only (drop "no effect"). |

Files stay under 150 lines; the form's new parts live in the new field components.

## 11. Tests (Part A)

Unit, `npx vitest run` (business guarantees):
- shared: should accept Exam with a real calendar date and reject 2026-02-30; should refuse an exam date sent with Long-term in the same change.
- core `deriveRetentionMultiplier`: should keep today's gaps at 90%; should halve gaps at 95% and stop shortening above that; should lengthen gaps by about half at 85% and stop lengthening below 80%.
- core `deriveExamWindow`: should cap gaps at the day before the exam; should shrink the cap as the exam approaches; should never cap below one day; should behave as Long-term once the exam date has passed; should keep the 365-day cap for Long-term; should put the new-material end three quarters of the way from planning to the exam.
- core `deriveNewCardPace`: should pace 450 new cards over 60 days at 10 a day; should keep today's number stable while new cards are learned; should spread leftovers up to the day before the exam once past the three-quarter point; should never exceed 200 a day; should use the typed number instead of the pace; should keep today's per-subject limit for Long-term.
- core `deriveNewCardPause`: should pause new cards at 400 waiting reviews for 20 a day and resume at 399; should use at least 100 as the limit; should never pause Long-term subjects.
- core `resolveStudyPlan`: should follow the nearest parent's intent and exam date together; should let a child's own intent win; should ignore a new-cards value set above the exam subject; should honour a value set on the exam subject or below; should default to Long-term from the app.
- core `deriveStudyForecast`: should count scheduled reviews on their due days and overdue ones today; should add new-card follow-up reviews from the next day; should finish new material on the day the pace runs out; should mark a finish on or after the exam as late; should report no finish date when new cards are zero; should skip new cards on simulated days over the pause limit; should add more reviews at higher retention.
- api `deriveGradeSchedule`: should produce identical results to today with default options (existing suite stays green); should halve a Good gap at 95% retention; should still grow a Good gap by at least a day at 95%; should cap Easy at the exam cap; should cap graduation from learning at a 2-day exam cap; should make the preview equal the graded gap under exam options.
- api `validateStudyIntentPatch`: should refuse Exam without a date; should refuse a past date; should refuse a date over two years ahead; should refuse a date when the intent is not Exam; should clear the date when switching to Long-term.
- web `study-intent-field` / form: should show only four settings with steps folded under More options; should show the exam date only for Exam; should show "Auto" for new cards on an Exam subject without a typed value; should show the server's message when the date is refused.
- web `study-forecast-panel`: should show days left, due today, reviews per day and the busiest day; should flag new material finishing after the exam; should explain a pause with the waiting count; should prompt when the exam date has passed; should show "No cards yet." for an empty subject.

Integration, `npm run test:integration` in `apps/api` against the local dev database:
- migration: should add three empty subject fields and leave every existing subject and app setting unchanged.
- study options: should save Exam with a date and stamp the planned time; should refuse Exam without a date with 400 `exam_date_required`; should clear date and planned time when switching to Long-term; should report the parent as the intent source for a child.
- queue: should serve the paced number of new cards for an Exam subject and the stored limit for a Long-term one; should serve no new cards for an Exam subject over its pause limit and serve them again below it; should leave other subjects' new cards unaffected.
- grade: should schedule an Exam card no later than the day before the exam; should schedule identical gaps to before for a default subject.
- forecast: should return days left, due today and a finish date for an Exam subject with sub-subjects; should return 404 for an unknown subject and an empty forecast for a subject without cards.

Gates: `npx tsc --noEmit` in `packages/shared`, `packages/core`, `apps/api`, `apps/web`; project lint on changed files; all the above green.

## 12. Docs

`docs/architecture/knowledge-bit/anki-review.md`: current-state sections for study intent and inheritance, retention multiplier, max interval by intent, exam pacing, backlog pause, forecast endpoint; remove "retention has no effect".

## 13. After deploy (Part A)

1. Run the retention check from `spec.md` "Risk & rollout" and tell the owner which subjects will get different gaps.
2. Set one real subject to Exam on the dev database and compare the forecast panel with what the queue serves the same day.

# Part B — iOS (starts after Part A is verified)

## 10b. iOS

| | Where | Change |
|---|---|---|
| ➕ | `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/StudyPlanModels.swift` | `SubjectStudyOptions` (own, effective, sources, intent), `StudyForecast` (Decodable); `SubjectStudyOptionsUpdate` with a tri-state value (unchanged / set / inherit) that encodes explicit `null` (precedent: `triage-decision-models.swift` `encodeNil`). |
| ➕ | `.../APIClient+StudyPlan.swift` | `studyOptions(subjectId:)`, `updateStudyOptions(subjectId:_:)`, `studyForecast(subjectId:)` passing `TimeZone.current.identifier`. Server error codes surfaced as plain sentences. |
| ➕ | `apps/ios/Sources/Shared/study-plan-model.swift` | `@Observable` load/save, one in-flight save, reload forecast after save, error message state. |
| ➕ | `apps/ios/Sources/Shared/study-plan-screen.swift` | `Form`: Picker "Studying for" (Same as parent / Exam / Long-term), DatePicker (Exam only, ≥ today), retention Stepper 80-95% with the same hint, new cards Stepper 1-200 with "Auto" toggle in Exam, inherited-source footers. Online only: a failed save shows "Couldn't save" and keeps the previous value. |
| ➕ | `apps/ios/Sources/Shared/study-plan-stats-section.swift` | Rows: days left, due today, about N reviews a day (next 7 days), recent retention vs target ("no reviews yet" when null), new material done date (late flag), paused notice. |
| ✏️ | `apps/ios/Sources/Shared/SubjectExtrasSection.swift` | One `NavigationLink` "Study plan". |

Then `xcodegen generate` in `apps/ios`.

## 11b. Tests (Part B)

- `swift test --package-path apps/ios/Packages/PostAnkiAPI`, new `StudyPlanDecodingTests.swift` with fixtures `subject-study-options.json`, `study-forecast-exam.json`, `study-forecast-empty.json` copied from real Part A responses: should decode inherited Exam intent with its source; should decode a forecast with a late finish and a pause; should decode an empty forecast with no retention; should encode "inherit" as an explicit null and omit unchanged fields.
- Simulator build: `xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.
- Manual (owner, device over Wi-Fi to the local API): change intent/date on iPhone and see it on web and the reverse; the stats match the web panel for the same subject.

## Out of scope

- ts-fsrs and any new dependency, Easy Days, filtered decks, audio/images, push.
- Backlog pause for Long-term.
- Rewriting existing due dates when intent, date or retention change.
- Mac app link; offline editing on iOS; queue response changes; app-level intent default.

## Open items (pattern-following defaults taken)

- Apply the backlog pause to Long-term too? Default: Exam only.
- Typed-answer grading ignores the exam cap and retention, so a typed-mode card in an Exam subject can be scheduled past the exam.
- `exam_planned_at` resets whenever the date changes; moving the date later restarts the three-quarter clock from that day.
