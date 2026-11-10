# Offline review pack

## Goal
Keep a refreshed on-device pack of cards for recently studied subjects so the due-review screen works offline, with grades synced later at their real review time.

## Approach
- No `brief.md` exists; this plan extends existing seams rather than adding modules.
- Already there: `PendingGradeQueue` (durable outbox, `requestId` idempotency, undo via `remove`) and `knowledge_bit_reviews.request_id` unique. Missing: the pack, the review-time field, and the supersede rule.
- Server: `GET /knowledge-bits/review-packs/current?tz=` (sibling of `/review-cards`); `reviewedAt`/`sentAt` added to the existing `POST /knowledge-bits/reviews`. No migration.
- Client: new pack store and refresher in `apps/ios/Sources/Shared`, shared by iPhone and Mac. Platform glue only for iOS BGTask and Mac app-active hooks.
- Offline serving is a fallback inside `DueReviewModel.load()` and `DueTodayModel.load()`.

## Steps
API (`apps/api/src/knowledge-bit`, `packages/shared/src/knowledge-bit-review.ts`)
1. Shared zod: add optional `reviewedAt`, `sentAt` (ISO datetime) to `recordReviewInputSchema`; add `reviewPackSchema` = `{generatedAt, dueBefore, truncated, cards: [reviewCard + alternates: reviewCard[]]}`; add `superseded: boolean.optional()` to `recordReviewResultSchema`.
2. New `knowledge-bit-review-time.ts` (pure): `resolveReviewedAt({reviewedAt, sentAt}, now)`. Absent = now. Shift by `now - sentAt` when `sentAt` is given. Over 2 min in the future = error, up to 2 min = clamp to now. Older than 14 days = error `review_time_out_of_range`.
3. `knowledge-bit-review.controller.ts`: resolve the time, 400 `{error:"review_time_out_of_range"}` on error, pass the result as `now` to `recordKnowledgeBitReview`, and call `recordActivityToday(reviewedAt, "review")` only when not superseded.
4. `knowledge-bit-review.orchestrator.ts`: after the requestId replay check, if `previous.lastReviewedAt >= now` (non-rehearsal), insert a void row (`undoneAt = real now`, `prevSchedule` null, `wasNew` false), skip the schedule write, bury and points, and return the current schedule with `superseded:true`. `replayStoredReview` returns the same shape when `stored.undoneAt` is set (add `undoneAt` to `KnowledgeBitReviewByRequestRecord` in `knowledge-bit-review.repo.ts`). Backdated applies need no other change: `now` already drives `deriveGradeSchedule`, burying and points.
5. `knowledge-bit-review-queue.repo.ts`: add optional `pack?: {subjectIds, dueCutoff}` to the clock. It keeps the unscoped due-filtered path (skip the scoped branch), passes `subjectIds` into `scopeCondition`, uses `pack.dueCutoff` as `dueCutoff`, and treats the call as ahead mode (caps lifted).
6. New `knowledge-bit-review-pack.repo.ts`: `listActiveSubjectIds(since, db)`, reviews with `undone_at is null` in the last 3 days, grouped by `cardSubjectIdSql`, non-null, same join as `countNewCardsReviewedTodayBySubject`. `listAlternates(bitIds, db)`: one batched query for other active `cardKey ''` variants, at most 2 per bit, reusing `toCard`.
7. New `knowledge-bit-review-pack.service.ts`: `buildReviewPack(tz, now)`. Active subjects (none = empty pack), queue call with `limit = 150` and `dueCutoff = now + 24h`, attach alternates, `truncated = cards.length >= 150`.
8. Controller handler `handleGetReviewPack`; register `GET /knowledge-bits/review-packs/current` in `router-table.ts` and `router.ts`.

Swift (`apps/ios`)
9. `Packages/PostAnkiAPI`: `ReviewPackModels.swift`, `APIClient+ReviewPack.swift`, and `reviewedAt`/`sentAt` on `RecordReviewInput` (ISO strings; `superseded` optional on the result).
10. `PendingGradeQueue.input(for:)`: send `reviewedAt = entry.createdAt` and `sentAt = Date()` (ISO). `background-save-outcome.swift`: treat 400 `review_time_out_of_range` as `.stale` (drop). Flush stays oldest-first.
11. New `review-pack-store.swift` (actor): file `review-pack.json` in Application Support, excluded from backup, holds `serverURL`, `generatedAt`, cards, alternates, and `gradedSince[{variantId, bitId, at}]`. `replace(pack, fetchStartedAt)` writes `.atomic` and carries over `gradedSince` entries newer than `fetchStartedAt`. `cards(scope:)` returns nil if `serverURL` mismatches. `noteGraded` / `unmarkGraded`, `counts()`, `clear()`. Decode failure deletes the file.
12. New `review-pack-sync.swift` (@MainActor): `refresh(reason)` is single-flight and does `PendingQueueFlusher.flushAll()`, then fetch, then `store.replace`. A failed fetch leaves the store untouched. It skips the fetch with no token. It runs a 6-minute `Task.sleep` loop while active, holds an `NWPathMonitor` (`isOnline`; regained = flush + refresh), and exposes `appBecameActive()` / `appWentToBackground()` (refresh inside `beginBackgroundTask` on iOS).
13. iOS: `HomeView.swift` scenePhase calls the sync hooks. New `Sources/PostAnkiIOS/review-pack-background-task.swift`: register in `PostAnkiIOSApp.init`, run `refresh`, reschedule `BGAppRefreshTaskRequest` (earliest 15 min) on entering background and inside the handler, and honour the expiration handler. `project.yml` (both iOS targets): `UIBackgroundModes: [fetch]`, `BGTaskSchedulerPermittedIdentifiers: [$(PRODUCT_BUNDLE_IDENTIFIER).review-pack-refresh]`; run xcodegen so the Info.plists update.
14. Mac: `MacQueueFlushTrigger.start()` also calls `ReviewPackSync` (didBecomeActive, didResignActive, network regained, launch).
15. `DueReviewModel`: new init param `reviewPack: ReviewPackStore = .shared`. In `load()`, when `ReviewPackSync.isOnline == false` or a `URLError` is caught (before the existing `pendingCount` branch), call a new `loadFromPack()` in a new `DueReviewModel+OfflinePack.swift`. Extract the existing card filter (skipped, easy, settled, `isHeldBack`) into one helper and add pack `gradedSince` to the held-back sets. Set `queue`, `windowExhausted = true`, `isServingPack = true`, `serverCounts` from pack phases. Unscoped or exact-`subjectId` scope only, and `aheadDays == 0`. `showNext()` skips `load()` while serving the pack. `grade()` calls `noteGraded`; `restore()` calls `unmarkGraded`. After each successful flush, a card returning online uses the normal path.
16. `DueReviewStateViews.swift` / `DueReviewScreen`: caption "Offline: using cards saved <relative>", and an exhausted-pack message "Saved cards finished. Grades sync when you're back online." `DueTodayModel.load()`: on `URLError` use `store.counts()` and mark `fromPack` (check `DueTodayCard.swift` rendering).
17. `sign-out-cleanup.swift`: `reviewPackStore.clear()` (injectable param) and `ReviewPackSync` stops until the next sign-in.

## Tests
- vitest, co-located: `knowledge-bit-review-time.test.ts` (absent, skew shift, future clamp and reject, 14-day reject); extend `knowledge-bit-review.controller.test.ts` (400 mapping) and `knowledge-bit-review.route.test.ts` (new route); `knowledge-bit-review-pack.service.test.ts` (empty when no active subjects, cap and truncated); extend `packages/shared/src/knowledge-bit-review.test.ts`.
- Integration (run in CI, locally only one file at a time with `--maxWorkers=1`): `knowledge-bit-review.offline.integration.test.ts` (backdated `dueAt`, idempotent replay, ordered offline grades, older-than-schedule gives `superseded` with no points or count, undo of a backdated grade works, undo of a superseded row gives `not_latest`); `knowledge-bit-review-pack.integration.test.ts` (3-day window, undone excluded, 24h cutoff, inactive subject excluded, alternates present).
- Swift Testing in `Tests/PostAnkiMacSmokeTests` (`extension SmokeTests`): `review-pack-store-smoke-tests.swift` (atomic replace, failed refresh keeps old, server mismatch nil, `gradedSince` carry-over, clear); `review-pack-sync-smoke-tests.swift` (single-flight, failure keeps pack); `offline-review-smoke-tests.swift` (FakeServer failing: pack served, graded cards skipped, grade lands in the outbox with `reviewedAt`, undo restores the card, 400 out-of-range drops the entry); extend `sign-out-cleanup-smoke-tests.swift`.

## Done when
- Airplane mode: Today review serves pack cards, grading works, restarting the app keeps the outbox.
- A failed or timed-out refresh never empties or shrinks the stored pack.
- The pack refreshes on open, every 6 min while active, on backgrounding, on network regain, and via `BGAppRefreshTask` (best-effort, identifier permitted).
- Outbox grades reach the server with their original time; retries and double flushes create no duplicate reviews; a newer grade made elsewhere wins and adds no points or counts.
- Sign-out removes the pack. `npx tsc --noEmit`, lint, touched vitest files, `swift build` and the touched Swift tests pass.

## Defaults chosen
- No migration: `request_id` is already unique and a void row (`undone_at` set) records a superseded grade; avoids a new column.
- Pack ignores the daily review and new-card caps (ahead mode): the point is practising offline; caps are not re-applied on sync.
- Cutoff is exactly now+24h, cap 150 cards, due-ascending: bounds payload (~150 KB) and refresh cost.
- Active subject = exact card subject, no descendants: matches how cards carry their subject.
- Offline scope: Today and exact-subject only, not tag/topic/bit or learn-ahead: pack lacks hierarchy and those scopes are not due-filtered.
- Skew fix via `sentAt`, 2 min future tolerance, 14-day max age: a fast or slow phone clock must not drop grades.
- Pack in Application Support, not Caches: the OS must not purge it before the elevator.
- Learning-step repeats are not re-served offline: a card graded locally counts as done for the pack.
- No new LLM calls; alternates reuse existing variants.
