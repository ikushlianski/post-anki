# Plan: study goals and priorities

## Plain-language product changes

- Per subject, the learner can write down priorities for the year, the month and the week (short text plus an optional numeric target, for example "finish 200 reviews of Postgres this month"). Sub-subjects can have their own; a subject shows its own goals and a roll-up of its children.
- Each priority shows progress automatically: reviews done, new cards learned, and notes added inside that subject's tree, counted from the start of that year, month or week. The learner can also tick a priority done by hand, for text-only priorities.
- One daily study goal (number of card reviews per day). The home page and the review page show "today: 34 of 50" and it resets at the learner's local midnight. The existing streak is unchanged and keeps counting any activity.
- An add-knowledge goal: the learner marks hot subjects or sub-subjects and a target of notes per week (or per day). The add-knowledge page shows "Postgres: 3 of 5 notes this week" and a nudge for hot subjects with zero notes.
- Priorities and goals are per user and optional. Nothing changes for anyone who sets none.

## Facts from the code

- Fact: `subjects` has `parent_id`, `sort_order`, `learning_intent`, nullable `model_tier` (`apps/api/src/db/schema.ts:31`). Subtree helper `collectSubjectSubtreeIds` exists in `@post-anki/core` and is used by `apps/api/src/knowledge-bit/subject-review-due-counts.repo.ts`.
- Fact: streak is a single-row table `user_streaks` (`schema.ts:989`), updated by `recordActivityToday` in `apps/api/src/streak/streak.service.ts`. It holds no per-day counts.
- Fact: every review is a row in `knowledge_bit_reviews` with `reviewed_at`, `was_new`, `undone_at` (`schema.ts:1326`); undone rows must be excluded. `review_point_events` also has `subject_id` and `awarded_day` (`schema.ts:1346`).
- Fact: a card's subject is the curriculum's subject if placed, otherwise its source's subject (`subject-review-due-counts.repo.ts`).
- Fact: local-day windows come from `getLocalDayWindow` and `countNewCardsReviewedToday` in `knowledge-bit-review.repo.ts`; the global new-card cap lives in `app_settings.new_cards_per_day`.
- Fact: add-knowledge content ends up as `knowledge_sources` (has `subject_id`, `created_at`) and `knowledge_bits` (`created_at`); the separate `notes` table has no subject column (`schema.ts:1978`).
- Fact: highest committed migration is 0118; 0119 (per-subject study options) is in progress. This plan uses 0121 and 0122, and does not touch the study-options files (`.planning/anki-scheduling-options/`, `subjects` study-option columns, `app_settings` scheduling columns, `shared/src/subject-study-options.ts`, admin-settings new-card field).
- Fact: single-user app (singleton rows, e.g. streak id "singleton").

## Decisions (recommended defaults; flagged items need Ilya)

- D1: "Notes added" means knowledge sources created through add-knowledge, attributed to the source's subject, counted via `knowledge_sources.created_at`. **Open question**: if "notes" should mean the `notes` table or individual cards (`knowledge_bits`), the counter query changes but nothing else does.
- D2: Progress is computed on read from existing tables (reviews, sources). No stored counters, so they cannot drift and undo is handled automatically.
- D3: Goal tables are new and separate from `subjects` and `app_settings`, so no collision with the 0119 columns.
- D4: Periods are calendar year, calendar month and ISO week in the learner's timezone (same tz source as the review queue).
- D5: Progress for a subject rolls up its whole subtree, same as due counts.
- D6: No AI/LLM involvement, so no token cost or prompt-injection surface.

## Data / API changes

### Migrations (generate with `npm run db:generate` in `apps/api`, run via `npm run db:migrate`; never push)

- `0121_subject-priorities.sql`: new table `subject_priorities` (id, subject_id, period_kind year|month|week, period_key such as 2026, 2026-10, 2026-W44, title, target_metric reviews|new_cards|notes|none, target_value nullable, done_at nullable, created_at, updated_at). Index on (subject_id, period_kind, period_key).
- `0122_study-goals.sql`: new table `study_goals` single-row style (id "singleton", daily_review_target integer nullable) and new table `add_knowledge_goals` (id, subject_id unique, period week|day, target_notes, created_at). Index on subject_id for `knowledge_sources` (`subject_id, created_at`) if the plan check shows a scan; additive only.
- If the 0119 migration slips and 0120 is taken by something else, renumber to the next free number at generation time (drizzle assigns it).

### Shared contracts (Zod, new file `packages/shared/src/study-goals.ts`, exported from index)

- Priority create/update/list schemas and a progress-bearing priority response.
- Daily goal schema and `DailyGoalProgress { target, doneToday, dayEndsAt }`.
- Add-knowledge goal schema and `AddKnowledgeGoalProgress { subjectId, target, added, periodEndsAt }`.

### Endpoints (new module `apps/api/src/study-goal/`, plural nouns)

- `GET/POST /subjects/:subjectId/priorities`, `PATCH/DELETE /priorities/:id` (list supports `?period=week|month|year`, returns progress).
- `GET/PUT /study-goal/daily` (target) and `GET /study-goal/daily/progress`.
- `GET/PUT/DELETE /add-knowledge-goals` and `GET /add-knowledge-goals/progress`.
- Progress queries: count non-undone `knowledge_bit_reviews` (and `was_new`) joined to subject via the existing subject-of-bit expression, bounded by the period window; sources counted from `knowledge_sources`. Reuse `getLocalDayWindow`; add week/month/year window helpers beside it in a goals-owned file.

## Build slices (each independently shippable)

1. Daily goal: migration 0122 part (daily target), shared schema, daily progress endpoint, home and review-page progress chip, setting field on the settings page.
2. Priorities CRUD: migration 0121, endpoints, subject page panel to add/edit/tick priorities (no progress yet).
3. Priority progress: period windows, subtree roll-up counts, progress bars on the subject page.
4. Add-knowledge goal: goals table, endpoints, hot-subject toggle, progress and nudge on the add-knowledge page.
5. Polish: empty states, home summary of this week's priorities, docs.

Slices 1 and 4 are independent of 2 and 3; 3 depends on 2.

## Tests

- Unit (vitest): period window calculation (year/month/ISO week edges, year boundary, DST day, timezone midnight), roll-up of subtree counts, target-met logic.
- Integration (against the shared pet-projects DB lane, per `~/.claude/pet-projects-db/README.md`): undone reviews not counted; a review near local midnight lands in the right day; a nested sub-subject's reviews roll up to its parent and year/month/week; a source with a deleted subject is ignored; notes counted only in the active period.
- Route tests: validation errors, 404 for unknown subject, idempotent PUT for daily goal.
- Web (react-testing-library): progress chip states (no goal, partial, met), priority form, add-knowledge nudge only for hot subjects at zero.
- Test names state the guarantee, e.g. "should not count an undone review toward today's goal".

## Risks

- Progress queries over `knowledge_bit_reviews` joined to subjects per period could be slow at scale; mitigate by reusing the due-counts join shape and measuring before adding indexes.
- Definition of "notes" (D1) is the main product ambiguity; wrong choice means rework in one query only.
- Subject deletion or moves: priorities hold a subject id with no FK (schema convention), so deletion needs a cleanup hook in the subject-delete path; moves change roll-ups retroactively, which is acceptable and should be stated in the UI.
- Timezone consistency: week start and "today" must use the same tz source as the review queue, or the daily chip will disagree with the queue.
- Collision with 0119 work: only additive new tables; if 0119 changes `app_settings` or shared exports, rebase `index.ts` exports carefully.
- Scope creep: no reminders, notifications, or streak redefinition in this plan.

## Dependencies

- No new dependency. Date-window math uses existing helpers and the platform `Intl` API; flag and propose before adding a date library.

END-OF-REPORT
