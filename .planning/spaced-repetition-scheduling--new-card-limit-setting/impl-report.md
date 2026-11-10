# Impl report: learner-set daily new-card limit

## Evidence check
Verified against code: the 20 constant was at knowledge-bit-review.repo.ts:31 and applied in the counts repo; the done-screen message and the settings store/page matched the report. The report's section 8 line refs were accurate.

## Files changed
- apps/api/src/db/schema.ts: `app_settings.new_cards_per_day integer not null default 20`
- apps/api/src/db/migrations/0101_low_cardiac.sql (+ meta/0101_snapshot.json, _journal.json entry): generated; SQL is only `ALTER TABLE "app_settings" ADD COLUMN "new_cards_per_day" integer DEFAULT 20 NOT NULL;`. Existing 0097 untouched.
- packages/shared/src/admin-settings.ts: constants, `clampNewCardsPerDay`, Zod schemas (output 1-200 int; update input clamps)
- packages/shared/src/knowledge-bit-review.ts: optional `newLimitReached` on the queue response
- apps/api/src/admin-settings/admin-settings.repo.ts: field in get/update; shared reader `getNewCardsPerDay(db)`
- apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts: `readNewRemainingToday` uses the reader (it feeds both the review queue and the subject/sidebar counts, one copy)
- apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts: removed `NEW_CARDS_PER_DAY`
- apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts: returns `newLimitReached` (cap hides waiting new cards)
- apps/web/src/admin-settings/new-cards-per-day-field.tsx (new), apps/web/src/routes/admin-settings.tsx: number field, saves on blur/Enter via the existing updateAdminSettings + router.invalidate pattern
- apps/web/src/knowledge-bit/anki-review-done.tsx, anki-review-screen.tsx: "Daily new-card limit reached. Change it in settings." with router Link to /admin-settings
- Tests: packages/shared/src/admin-settings.new-cards.test.ts; apps/api/src/admin-settings/new-cards-per-day.repo.test.ts; apps/api/src/knowledge-bit/knowledge-bit-review-queue.new-card-limit.integration.test.ts (new, real Postgres); apps/web/src/admin-settings/new-cards-per-day-field.test.tsx; additions to anki-review-done.test.tsx; fixtures in knowledge-bit-review.route.test.ts

## Behavior
Default 20, clamped 1-200 on write (update input), on read (reader), and in the UI. Queue, counts and sidebar share `readNewRemainingToday`. Done screen shows the message only when the cap hid waiting new cards (unscoped review).

## Migration
Before: drizzle table is `drizzle.drizzle_migrations_api` (not `__drizzle_migrations`); latest applied id 101 (created_at 1792408003518 = 0100_knowledge_source_url_and_summary); no journal entry was unapplied. `npm run db:migrate:api` applied exactly one: 0101_low_cardiac (now id 102). Verified column exists with default 20.

## Tests
- `cd packages/shared && npx vitest run src/admin-settings.new-cards.test.ts`: 11 passed
- `cd apps/api && npx vitest run src/admin-settings src/knowledge-bit/knowledge-bit-review.route.test.ts`: 38 passed (3 files)
- `cd apps/api && npx vitest run --config vitest.integration.config.ts src/knowledge-bit/knowledge-bit-review-queue` (env from .env.local): 32 passed (new file 6, existing 26)
- `cd apps/web && npx vitest run src/admin-settings src/knowledge-bit/anki-review-done.test.tsx src/routes`: 186 passed (18 files)

## tsc
`npx tsc --noEmit` clean in packages/shared, apps/api, apps/web.

## Defaults and notes
- `newLimitReached` is optional in the shared response schema so existing web fixtures stay valid; the API always sends it.
- Limit applies to the unscoped queue and counts (same as the old constant); scoped reviews stay uncapped.
- Not done: no eslint run (no eslint config found at repo root); nothing staged or committed.

## Citation
apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts:40 reads the stored limit through `getNewCardsPerDay` (apps/api/src/admin-settings/admin-settings.repo.ts:103).

END-OF-REPORT
