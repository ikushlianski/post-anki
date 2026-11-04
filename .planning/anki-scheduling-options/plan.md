# Plan: per-subject study options, then FSRS scheduler

Build order: Part 1 (study options) fully lands and merges before Part 2 (FSRS). Part 2 reads the options Part 1 stores.

## Business summary

- A learner can tune how fast new cards arrive, how short-term "learning" repeats are spaced, and how sure they want to be of remembering (desired retention), per subject.
- A sub-subject without its own value uses its parent's; the top of the chain uses app-wide defaults set on the existing admin settings page.
- Part 2 adds a second, memory-model-based scheduler (FSRS) that a subject can opt into. Nothing changes for anyone until they pick it. Old cards keep working and are converted gradually, only when first reviewed under FSRS.
- Today the 20/day new-card cap is one global number. After Part 1 the cap is counted per subject, so a heavy subject cannot starve a light one.

## Facts from the code (read first)

- Fact: the cap is global: `readNewRemainingToday` in `apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts` = `app_settings.new_cards_per_day` minus non-undone `was_new` reviews since local midnight (`countNewCardsReviewedToday`).
- Fact: learning steps are constants (`LEARNING_STEPS_SECONDS=[60,600]`, `RELEARNING_STEPS_SECONDS=[600]`, graduating 1d, easy 4d, learn-ahead 1200s) in `knowledge-bit-learning-steps.ts`; the SM-2 rule (ease 1.3-3.0, interval 1-180d) is in `knowledge-bit-grade-schedule.ts`. `deriveGradeSchedule` and `previewGradeIntervals` are pure and take no settings.
- Fact: callers are `knowledge-bit-review.orchestrator.ts` (grade and replay) and `knowledge-bit-review-queue-cards.repo.ts` (interval preview).
- Fact: `subjects` has `parent_id` (no FK), nullable `model_tier` as the precedent for "null = inherit". Subject subtree resolution exists (`collectSubjectSubtreeIds` in `@post-anki/core`).
- Fact: highest migration is `apps/api/src/db/migrations/0118_swift_wallflower.sql` (not `apps/api/drizzle`). Journal at `migrations/meta/_journal.json`. Script: `npm run db:generate` then `npm run db:migrate` in `apps/api`.
- Fact: a card's subject: curriculum's subject if placed, else its source's subject (`scopeCondition`); the card row already carries `subjectId`.

## Decisions

- D1 (assumption, pattern-following): the new-card cap is counted per card's own subject, using that subject's resolved limit. It is not cumulative up the tree. Scoped queues (tag/topic/bit/subject) still ignore the cap, as today.
- D2: the existing admin `newCardsPerDay` becomes the app default for the per-subject cap (same column, same field). No second global cap.
- D3: steps are stored in minutes (integers), edited as a list; relearning steps stay in the same options (one extra list).
- D4: nulls everywhere mean "inherit"; no sentinel values. Top of the chain falls back to `app_settings`.
- D5: graduating interval, easy interval, learn-ahead stay constants (out of scope).

## Part 1: study options

### Data model and migration (1 migration)

`0119_subject-study-options.sql`, generated with `npx drizzle-kit generate --name subject-study-options` from the schema change, run with `npm run db:migrate`. Never `drizzle-kit push`. Additive, nullable or defaulted, safe on live data.

- `subjects`: add `new_cards_per_day integer null`, `learning_steps_minutes jsonb null` (int array), `relearning_steps_minutes jsonb null`, `desired_retention real null`.
- `app_settings`: add `learning_steps_minutes jsonb not null default [1,10]`, `relearning_steps_minutes jsonb not null default [10]`, `desired_retention real not null default 0.9`. (`new_cards_per_day` already exists, default 20.)
- Desired retention is stored in Part 1 but only read by the scheduler in Part 2. The UI shows it from the start, labelled as used by FSRS (see edge cases).

### API contract (Zod in `packages/shared/src/subject-study-options.ts`, exported from `index.ts`)

- `studyOptionsSchema`: `{ newCardsPerDay: int 1..200, learningStepsMinutes: int[1..10] each 1..1440 ascending-ish, relearningStepsMinutes: same, desiredRetention: number 0.7..0.99 }`.
- `subjectStudyOptionsOverrideSchema` = `studyOptionsSchema.partial()` where each key may be `null` (clears override to inherit).
- Response `subjectStudyOptionsSchema`: `{ own: Override, effective: StudyOptions, sources: Record<key, subjectId | "app"> }` so the UI can show "inherited from X".
- `GET /subjects/:id/study-options` returns the response. `PATCH /subjects/:id/study-options` takes the override body (at least one key), returns the response. 404 unknown subject, 400 invalid.
- `adminSettingsSchema` and `updateAdminSettingsInput` gain `learningStepsMinutes`, `relearningStepsMinutes`, `desiredRetention` (same clamp-on-input style as `newCardsPerDayInputSchema`). `GET/PATCH /admin-settings` is unchanged in shape otherwise.
- Pure shared helper `resolveStudyOptions(chain, appDefaults)` (nearest non-null ancestor per key) lives in `packages/core` with the existing subject-tree helpers.

### Files, by layer

Shared / core
- Create `packages/shared/src/subject-study-options.ts` (+ `.test.ts`); edit `packages/shared/src/admin-settings.ts`, `index.ts`.
- Create `packages/core/src/subject-study-options-resolve.ts` (+ test).

DB
- Edit `apps/api/src/db/schema.ts` (subjects, appSettings); generated `0119_*.sql` and `meta/0119_snapshot.json`, `_journal.json`.

API
- Create `apps/api/src/subject-study-options/` : `subject-study-options.repo.ts` (read chain + app defaults, write override), `subject-study-options.controller.ts` (register in the API route table where `subject.controller.ts` is registered), `subject-study-options.orchestrator.ts`.
- Edit `apps/api/src/admin-settings/admin-settings.repo.ts` (+ controller) for new defaults; add `getStudyDefaults`.
- Edit `knowledge-bit-learning-steps.ts`: `deriveLearningStep` takes `{learningSteps, relearningSteps}` (seconds) instead of constants. Edit `knowledge-bit-grade-schedule.ts`: `deriveGradeSchedule` / `previewGradeIntervals` take an `options` argument.
- Edit `knowledge-bit-review.orchestrator.ts`: resolve options for the card's subject inside the grade transaction; replay uses current options (display value only; schedule is not rewritten).
- Edit `knowledge-bit-review-queue-cards.repo.ts`: preview with the card's resolved options (resolve once per distinct subject per request, not per card).
- Edit `knowledge-bit-review-queue-counts.repo.ts`, `knowledge-bit-review.repo.ts` (add `countNewCardsReviewedTodayBySubject`), `knowledge-bit-review-queue.repo.ts`: per-subject remaining; `newRemainingToday` = sum over subjects in play of min(subject remaining, new cards available); `newLimitReached` true when any subject's cap hides new cards.
- Edit `subject-review-due-counts.repo.ts` only if its new counts use the cap (check; likely not).

Web
- Create `apps/web/src/subject-study-options/` : `subject-study-options.api.ts`, `subject-study-options-form.tsx`, `steps-field.tsx`, `inherited-hint.tsx` (+ tests); mount the form as a "Study options" section on `apps/web/src/routes/subject.$subjectId.tsx`.
- Edit `apps/web/src/admin-settings/` : add app default fields next to `new-cards-per-day-field.tsx`; edit `routes/admin-settings.tsx`.

Docs
- Edit `docs/architecture/knowledge-bit/anki-review.md` (cap now per subject, steps configurable, current-state wording only).

### Edge cases (Part 1)

- Inheritance: nearest ancestor with a value wins per key independently (a child may override only steps). Reparenting a subject changes its effective options immediately. Cycles/missing parent: stop the walk at depth cap (e.g. 20) and fall back to app defaults. A card with no subject uses app defaults.
- Clearing an override (null) re-inherits; empty step list is rejected (400), never stored.
- Changing steps mid-learning: stored `learning_step` index is clamped to the new last step (existing behaviour); already-set `due_at` is not rewritten; the next grade uses the new list. Lowering `newCardsPerDay` below today's count gives remaining 0, not negative.
- Changing retention: no effect in Part 1 (SM-2 ignores it); never rewrites due dates in either part.
- Concurrency: option edits are single-row writes; a grade reads options inside its transaction so it sees one consistent value.
- Cost/perf: option resolution adds one small subject-tree read per request, cached per request. No AI calls, no new dependency.

### Tests (named business guarantees)

- should use the parent subject's new-card limit when the child has none
- should let a child override only learning steps while inheriting the rest
- should fall back to app defaults when no subject in the chain sets a value
- should cap new cards per subject independently so one full subject does not block another
- should treat an unplaced card as using app defaults
- should reject an empty or out-of-range steps list with 400
- should re-inherit when an override is cleared with null
- should space learning repeats by the subject's steps for a new card
- should clamp a stored step index when steps are shortened
- should keep SM-2 intervals identical to today when all options are defaults (regression)
- should not move already-scheduled due dates when options change
- should show remaining new cards as zero, not negative, when the limit is lowered below today's count
- migration: should leave every existing subject with null overrides and existing app settings with defaults

## Part 2: FSRS scheduler

### Dependency (needs approval, not installed)

`ts-fsrs` (open-spaced-repetition, MIT, actively maintained, TypeScript, the reference JS implementation of FSRS). New runtime dependency in `apps/api` only. Check against `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md` and verify current version and API on context7 before install. Alternative if rejected: none worth hand-rolling (the 19-parameter model is exactly what the rule says not to rebuild).

### Data model and migration (1 migration)

`0120_fsrs-scheduler.sql`, generated with `--name fsrs-scheduler`, same script.

- `knowledge_bit_schedules`: add `stability real null`, `difficulty real null` (null = no FSRS memory state yet). Existing rows keep `ease_factor` and everything else untouched.
- `subjects`: add `scheduler text null` (`sm2` | `fsrs`, app-validated like `model_tier`). `app_settings`: add `scheduler text not null default 'sm2'`.
- `KnowledgeBitScheduleSnapshot` (jsonb `prev_schedule`) gains optional `stability`, `difficulty`; missing keys read as null, so old snapshots restore cleanly (matches the doc's rule for added columns).
- Total migrations across both parts: 2 (0119, 0120).

### API contract

- Shared: `schedulerSchema = z.enum(["sm2","fsrs"])`; add `scheduler` to `studyOptionsSchema`, override schema, `adminSettingsSchema`, and `sources`. Same endpoints, no new routes.
- Review grade result and card preview shapes unchanged (the preview still returns seconds per grade).

### Behaviour

- Per grade, the resolved scheduler of the card's subject decides the rule. Learning, relearning and steps stay on our step logic for both schedulers (single source for phases, steps, leeches, daily cap). Only the review-phase interval and the memory state differ.
- FSRS review step: ts-fsrs computes stability, difficulty and next interval from (state, grade, elapsed days, desired retention); interval clamped to 1..180 days, same as SM-2 today. Again sends the card to relearning with `lapses` +1 as now.
- Graduation from learning (Good or Easy) initialises stability and difficulty from the graduating grade (assumption: first rating approximated by the graduating grade; verify against ts-fsrs defaults).
- Old cards: lazy conversion, no bulk backfill. On first FSRS grade of a card with null stability: stability = max(interval_days, 1); difficulty = linear map of ease (3.0 -> 1, 2.5 -> ~5, 1.3 -> 10), clamped 1..10; elapsed days from `last_reviewed_at`. This is an approximation and is documented as such in the UI hint.
- `ease_factor` is left unchanged by FSRS grades, so switching back to SM-2 resumes from the last interval with the old ease. SM-2 grades leave stability/difficulty as they are; they are stale until the next FSRS grade, which recomputes elapsed time from `last_reviewed_at`.
- Typed-answer mode keeps its own three-verdict rule and does not touch FSRS fields (stays on SM-2 maths even for FSRS subjects; documented). Assumption: acceptable; revisit if typed mode should feed FSRS.

### Files, by layer

Shared: edit `subject-study-options.ts`, `admin-settings.ts`.
DB: edit `schema.ts` (schedules, subjects, appSettings, snapshot type); generated `0120_*`.
API:
- Create `apps/api/src/knowledge-bit/knowledge-bit-fsrs-schedule.ts` (+ test): pure adapter around ts-fsrs, including `seedFromSm2(state, now)`.
- Create `apps/api/src/knowledge-bit/knowledge-bit-scheduler.ts` (+ test): picks sm2 or fsrs rule from options; `deriveGradeSchedule` becomes the sm2 branch behind it.
- Edit `knowledge-bit-grade-schedule.ts` (state gains optional stability/difficulty and result carries them), `knowledge-bit-schedule.repo.ts` (read, upsert, replace, snapshot include new columns), `knowledge-bit-review.orchestrator.ts` (snapshot and replay), `knowledge-bit-review-undo.ts` / `.orchestrator.ts` (restore new fields), `knowledge-bit-review-queue-cards.repo.ts` and its row select (stability, difficulty for previews), `subject-study-options.repo.ts`, `admin-settings.repo.ts`.
Web: edit `subject-study-options-form.tsx` (scheduler select, retention shown only when FSRS is effective, hint about lazy conversion); edit admin settings page default select.
Docs: edit `anki-review.md` (new Scheduler section, data model).

### Edge cases (Part 2)

- Switching a subject to FSRS never rewrites any due date; cards convert one at a time on next review. Switching back is lossless for SM-2 fields.
- Retention changed mid-learning: learning and relearning cards ignore retention (step-based); it applies from the next review-phase grade. Existing review due dates are never recalculated.
- A card moves between subjects (different schedulers): the new subject's scheduler governs the next grade; null stability triggers lazy seed.
- Undo restores stability/difficulty from the snapshot; pre-0120 snapshots restore null (card reseeds lazily).
- Overdue old card at first FSRS grade: elapsed days can be large; retrievability is computed from real elapsed time, interval is capped at 180.
- ts-fsrs fuzz: disable interval fuzz so previews equal the real grade (preview must match what a grade produces); required for the "preview equals result" guarantee.
- Replay of a stored grade (requestId retry) must not re-run FSRS against changed state: it re-derives from the stored snapshot only, as today.

### Tests (named business guarantees)

- should leave every existing card's due date unchanged when a subject is switched to FSRS
- should convert an SM-2 card on its first FSRS grade using its interval and ease
- should keep ease unchanged when a card is graded under FSRS
- should resume SM-2 from the last interval when a subject switches back
- should lengthen the next interval when desired retention is lowered, and shorten it when raised
- should ignore retention for cards still in learning steps
- should send an FSRS card to relearning and count a lapse on Again
- should cap FSRS intervals at 180 days
- should make the interval preview equal the interval a real grade produces
- should restore stability and difficulty on undo, and restore null for old snapshots
- should use the scheduler of the card's own subject, inheriting from the parent
- should keep typed-answer grading working for cards with FSRS state
- migration: should add null stability/difficulty and keep all existing schedule rows intact

## File ownership (parallel safety)

Part 1 split into three parallel lanes after shared/core + DB land first (single owner, sequential):
- Lane 0 (first, one agent): `packages/shared/*`, `packages/core/*`, `apps/api/src/db/schema.ts`, migrations. Nobody else touches these.
- Lane A (scheduling): `knowledge-bit-learning-steps.ts`, `knowledge-bit-grade-schedule.ts`, `knowledge-bit-review.orchestrator.ts`, `knowledge-bit-review-queue*.repo.ts`, `knowledge-bit-review.repo.ts`, `knowledge-bit-schedule.repo.ts`, their tests, `anki-review.md`.
- Lane B (options API): `apps/api/src/subject-study-options/*`, `apps/api/src/admin-settings/*`, route registration.
- Lane C (web): `apps/web/src/subject-study-options/*`, `apps/web/src/admin-settings/*`, `routes/subject.$subjectId.tsx`, `routes/admin-settings.tsx`.
Part 2 reuses the same lanes; Lane 0 owns the 0120 migration and schema first; Lane A additionally owns `knowledge-bit-fsrs-schedule.ts`, `knowledge-bit-scheduler.ts`, undo files; the `package.json`/lockfile edit for ts-fsrs belongs to Lane 0 only, after approval.

## Verification gates

`npx tsc --noEmit`, project lint, `npx vitest run` (plus integration config for queue and migration tests against the local DB on port 5562) all clean before each part is committed.

## Open items for the owner

- Approve `ts-fsrs` as a new dependency (Part 2 blocker only).
- Confirm D1 (per-subject, non-cumulative cap) and that typed-answer mode stays on SM-2 maths.

END-OF-REPORT
