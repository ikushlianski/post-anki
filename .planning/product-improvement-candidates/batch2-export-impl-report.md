# Batch 2 report: items 4 and 5

## Item 4: card export topic, tags, added date, every question, Excel-safe CSV

Evidence verified against report-2 (repo selected no topic name/tags/createdAt; one variant per card; no BOM). All true.

- Files: apps/api/src/knowledge-bit/knowledge-bit-export.repo.ts, knowledge-bit-export.csv.ts, and tests knowledge-bit-export.csv.test.ts, knowledge-bit-export.controller.test.ts, knowledge-bit-export.repo.integration.test.ts. Controller unchanged (it streams whatever the card holds).
- Behavior: each card now carries topic (topic title or null), tags (names, alphabetical, loaded in one query per 200-card batch), addedAt (ISO) and otherQuestions (all other current, non-superseded variants, ordered by variant order, each question and answer). JSON gets the same fields. CSV appends columns topic, tags, added_at, other_questions (other questions written as "question => answer" joined by " | "). CSV starts with a UTF-8 BOM, CSV only. Formula-injection guard, string-only guard (numbers never prefixed) and cancel handling are untouched; new text cells go through the same csvCell.
- Tests: `npx vitest run src/knowledge-bit/knowledge-bit-export` in apps/api: 2 files, 18 passed, 0 failed (csv 13, controller 5). New: topic/tags/added/other questions in CSV, empty values, guarded topic/tag, BOM on header, JSON fields. An integration test (topic, sorted tags, other questions excluding superseded) was added but NOT run: the Postgres at localhost:5578 refused connections, so it is unverified.
- tsc: apps/api `npx tsc --noEmit` clean.
- Defaults: new columns appended at the end so existing spreadsheets keep their column order; "=>" separator for other questions; tags alphabetical.
- Undone: integration test not executed (no database reachable).
- Citation: apps/api/src/knowledge-bit/knowledge-bit-export.csv.ts:39 (header with BOM).

## Item 5: Retry on failed card lists

- Files: apps/web/src/knowledge-bit/card-list-load-error.tsx (new shared error block), knowledge-overview-screen.tsx, use-knowledge-overview-data.ts (adds retry calling the query refetch), suspended-cards-screen.tsx, tests apps/web/src/routes/-knowledge.index.test.tsx and -knowledge.suspended.test.tsx.
- Behavior: both screens show "Could not load your cards. Check your connection and try again." with a Retry button that refetches the query. The All cards error state keeps the Download links visible. Retry success replaces the error with the list. Styling follows route-load-error (dark button, alert role).
- Tests: `npx vitest run src/routes/-knowledge.index.test.tsx src/routes/-knowledge.suspended.test.tsx` in apps/web: 2 files, 25 passed, 0 failed (one old suspended error test replaced, one new overview test added).
- tsc: apps/web `npx tsc --noEmit` has 1 error, in apps/web/src/routes/admin-settings.tsx(39,92), a file owned by another agent and outside my changes; none in my files.
- Defaults: the old "Could not load suspended cards." wording replaced by the shared sentence; search and subject filter stay hidden in the error state (only Download kept, per the report).
- Undone: none.
- Citation: apps/web/src/knowledge-bit/knowledge-overview-screen.tsx:77 (Retry wired to refetch).

## Fix round

- Cause: the integration seed hardcoded kind wh_question, so the seeded "Basic?" variant was outranked by the fill_in_the_blank one. Export code unchanged.
- Fix: seedVariant in apps/api/src/knowledge-bit/knowledge-bit-export.repo.integration.test.ts now takes a kind parameter (default wh_question); the primary variant is seeded as basic.
- Result: `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects npx vitest run --config vitest.integration.config.ts src/knowledge-bit/knowledge-bit-export.repo.integration` in apps/api: 1 file, 3 passed, 0 failed. This supersedes the "not run" note in item 4.

END-OF-REPORT
