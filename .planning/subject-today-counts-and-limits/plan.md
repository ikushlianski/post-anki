# Subject "today" counts and review-per-day limits

## Goal
- Desktop subject trees (web knowledge browser, Mac review tree) show per subject and sub-subject: mature, learning, new, and **Today**.
- Today = cards the user will actually review today after limits: learning due + review due (capped) + new (capped), summed over sub-subjects, bounded by the app-wide daily ceiling.
- Review-per-day cap settable per subject/sub-subject, inheriting like new-cards-per-day. No LLM use.

## What already exists (Facts)
- Global review limit: `app_settings.max_reviews_per_day` (default 200, 0 = unlimited), edited on web admin settings and the shared admin screen (iOS + Mac). It is an app-wide gate: counts every answer today (new, learning, review); when reached the queue serves nothing (`readDailyReviewLimit`, `knowledge-bit-review-queue-daily-limit.repo.ts`).
- Global + per-subject new-cards-per-day: `app_settings.new_cards_per_day`, `subjects.new_cards_per_day` (nullable). Resolved own → nearest ancestor → global (`resolveStudyOptions` in core). The cap applies **per subject's own cards**: an inherited value gives each sub-subject its own allowance of that size (`readNewCardAllowance.remainingFor`). Exam-intent subjects derive the new cap from the study plan.
- `/subjects/review-due-counts`: per subject `dueCount` (uncapped, includes learning) and `newCount` (capped by new allowance), rolled up over subtree; `unsorted` bucket; consumed by iOS/Mac review tree and web sidebar/dashboard.
- `/knowledge-bits/browser/subjects`: per subject `newCount`/`learningCount`/`matureCount` rolled up. Web knowledge browser tree draws them only as an unlabeled depth bar; iOS shows "X mature · Y learning · Z new".
- Mac: the only subject tree is the Review tree (`New`, `Repeat` columns, no maturity). Mac's Knowledge view is a flat list. Mac per-subject settings = shared `StudyPlanScreen` (via `StudyPlanSubjectPicker`); Mac global settings = shared `AdminSettingsScreen`.
- Scoped (subject) review sessions ignore the new cap and include not-yet-due cards (cram); only the global gate applies there.

## Decisions (defaults chosen, pattern-following)
- D1 Global review cap: reuse existing `maxReviewsPerDay`. No second global setting. It stays the app-wide gate **and** becomes the default for the subject review cap.
- D2 Subject review cap: new nullable `subjects.max_reviews_per_day`; resolved own → nearest ancestor → global, same chain as new cards; `sources` reported.
- D3 Parent vs sub-subject: same as new cards today — cap applies to each subject's own cards; a sub-subject without a value gets its own allowance of the inherited size; a parent row's Today is the sum of its capped buckets. Not an Anki-style subtree budget (would change new-card behavior too). **Confirm with user**; alternative noted in Risks.
- D4 What the review cap counts: answers on cards that were in `review` phase before answering (`was_new = false` and prev phase `review`, null prev treated as review). Learning/relearning steps are uncapped (Anki behavior). Due learning cards always count in Today.
- D5 `0` on a subject = no subject cap (matches global meaning).
- D6 Subject value above global: allowed, but the app-wide gate still stops the whole day at the global number. Settings hint says so.
- D7 Scoped subject sessions: unchanged (still cram + global gate). Review cap is honored where the new cap is: the unscoped daily queue and all counts.

## Data contract (shared Zod)
- `studyOptions` / overrides / `subjectStudyOptions.own|effective|sources` gain `maxReviewsPerDay` (reuse `maxReviewsPerDaySchema`). PATCH subject study options accepts `maxReviewsPerDay: number | null`.
- `subjectReviewDueCountSchema` adds (existing fields kept for installed iOS apps):
  - `reviewTodayCount` (review-phase due, capped), `learningDueCount`, `todayCount` (learning due + reviewToday + capped new, subtree sum, min with global remaining)
  - `limits: { newCardsPerDay, maxReviewsPerDay }` (effective for that subject)
- Response top level adds `reviewsRemainingToday` (global gate remaining; null when unlimited). `unsorted` gets the same new fields.
- Maturity stays on `/knowledge-bits/browser/subjects`: both desktop trees already load it to build the tree; mirrors iOS; no duplicate query. One field set per subject = tree entry (maturity) joined with due-counts row by `subjectId`.

## Storage
- Add nullable `max_reviews_per_day` integer to `subjects`. `npm run db:generate:api`, then `npm run db:migrate:api`. Never push.

## API changes
- Study options: repo columns/row mapping, `getStudyDefaults` includes global `maxReviewsPerDay`, `STUDY_OPTION_KEYS` gains the key (core resolver needs no logic change).
- Review allowance (new file, mirrors new allowance): per-bucket remaining = effective cap − review answers today for that bucket; plus due-review-by-subject reader.
- Unscoped queue: due cards split into learning (uncapped) and review-phase per bucket taking `min(limit, remaining)`; counts `review` use capped sum; if the cap hides due reviews, `nextDueAt` = day end (same as new cap).
- Due-counts endpoint: per bucket compute capped values, roll up subtree, bound by global remaining. Pure rollup/cap math in its own unit-tested module.
- Files over 300 lines (`knowledge-bit-review-queue-cards.repo.ts` is 330) get no additions; new logic goes in new files.

## Web UI (desktop)
- Knowledge browser tree: at `md+` show four labeled numeric columns Mature / Learning / New / Today (Today emphasized) next to the existing bar; phone layout unchanged. Due counts fetched via existing `subjectReviewDueCounts` client call; tree rows join by id; "No subject" row uses `unsorted`. Loading/failed due counts: show `–` for Today only.
- Subject study options form: add "Reviews per day" override using the existing inherit/override pattern and `InheritedHint` (source = global or ancestor). Global field already exists; only add the D6 hint text.

## Mac UI
- Review tree header/columns: Mature, Learning, New, Today (Today replaces `Repeat`; New = total unseen from maturity). Totals row likewise. Dim rows with Today = 0. Accessibility label reads all four.
- PostAnkiAPI: decode new due-count fields leniently (default 0 / nil) and `maxReviewsPerDay` in study options + update payload.
- Shared `StudyPlanScreen`: add "Reviews per day" stepper with inherit toggle (iOS gets it too, same code). Global stepper already exists.

## Tests
- shared: schema tests for new fields (nullable override, clamp).
- core: resolver inherits `maxReviewsPerDay` (own / ancestor / global).
- api unit (vitest): rollup math — subtree sum, per-bucket cap, inherited cap per child, global bound, 0 = unlimited.
- api integration: review cap honored in unscoped queue (template: `knowledge-bit-review-queue.new-card-limit.integration.test.ts`); due-counts `todayCount` after answering reviews; subject study options PATCH/GET with inherit; migration test passes.
- web (RTL): tree shows four numbers at desktop, Today from due counts, failure shows `–`; form saves and clears the review override, shows inherited source.
- Mac smoke tests: `review-subjects-model-smoke-tests` (Today/maturity per row, totals), `study-plan-smoke-tests` (review cap round trip via FakeServer).

## Build items (parallel after A1)
- A1 Contract (serial, first): shared Zod + DB column + migration + study options repo/resolver/defaults + PATCH. Owns `packages/shared/src/subject-study-options.ts`, `packages/shared/src/subject-review-due.ts`, `apps/api/src/db/`, `apps/api/src/subject-study-options/`, `apps/api/src/admin-settings/admin-settings.repo.ts`, `packages/core/src/subject-study-options-resolve*`.
- A2 API counting + queue: owns `apps/api/src/knowledge-bit/` (review allowance new file, queue, due-counts repo + pure rollup module).
- W1 Web tree numbers: owns `apps/web/src/knowledge-bit/knowledge-browser-subject-list.tsx` + new `subject-today-columns.tsx` / hook.
- W2 Web subject review cap: owns `apps/web/src/subject-study-options/`, `apps/web/src/admin-settings/` (hint only).
- M1 Mac tree: owns `apps/ios/Sources/PostAnkiMac/MacReviewSubject*`, `apps/ios/Sources/Shared/review-subject*`, `apps/ios/Packages/PostAnkiAPI/.../subject-review-due-counts.swift`.
- M2 Shared study plan review cap: owns `apps/ios/Sources/Shared/study-plan-*`, `apps/ios/Packages/PostAnkiAPI/.../StudyPlanModels.swift`, `study-plan-draft.swift`. M1 and M2 run sequentially in one Mac build lane (shared app build).
- A2, W1, W2, M1/M2 build against A1's schemas; W1/M1 can use fixture responses until A2 lands.

## Risks
- D3 surprise: parent with cap 50 can show Today > 50 when children inherit 50 each. Alternative (subtree budget) needs new-card semantics changed too; out of scope unless user picks it.
- Two subject-attribution expressions exist (browser counts use effective subject, queue uses card subject); maturity and Today could attribute a placed card differently. Verify on one placed card in A2 integration test; align only if they differ.
- Global gate counts all answers (incl. learning steps), so Today bounded by it is approximate late in the day.
- Scoped subject sessions can serve more than Today (existing cram behavior, D7).
- Installed old iOS/Mac builds must keep decoding: only additive fields.
