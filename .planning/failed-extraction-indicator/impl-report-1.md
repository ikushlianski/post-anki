# Impl report 1 — failed-extraction indicator (all 9 steps)

## Endpoints
- GET /knowledge-sources/failed → 200 { items: FailedKnowledgeSourceItem[], total } — up to 50 newest failed or stuck (pending/processing older than durableStaleMs). Preview is left(raw_text, 160) with whitespace collapsed. Never returns raw failureReason or full rawText. Excludes processed_at IS NOT NULL rows.
- POST /knowledge-sources/deletions { ids: string[1..50] } → 200 { deleted: id[], skipped: [{ id, reason: not_found|not_deletable|has_cards }] } — one transaction, FOR UPDATE lock, source must be failed or stuck, any approved or manual bit blocks with has_cards, feedback/grade rows kept.
- POST /knowledge-sources/:id/regeneration — existing endpoint, claim WHERE extended to also pick up stuck rows (pending|processing older than durableStaleMs). 409 still returned for fresh processing rows.

## Architecture decisions
- `toPublicFailureReason` in shared: maps all raw codes, workflow_* prefixes, durable: markers and free-text provider messages to 7 safe public reasons; never reaches the UI.
- Stuck threshold = durableStaleMs() (default 30 min): consistent with durable reconcile cutoff, above legacy 15 min sweep.
- Deletion is a bulk POST /knowledge-sources/deletions (mirrors /knowledge-bits/deletions pattern); single delete is a one-id call.
- FailedExtractionsIndicator self-fetches via a plain hook (no react-query), refetches on mount/focus/pending-review-changed event, polls for 5 min after a retry. After retry emits review-refresh-requested, useReviewRefresh listens via a new useEffect and calls checkNow.
- Component lives in apps/web/src/knowledge-source/ (page-level mount), not inside the 183-line review panel.

## Files (new)
- packages/shared/src/knowledge-source-failure.ts (+.test.ts)
- apps/api/src/knowledge-source/: knowledge-source-failed.repo.ts, .controller.ts, .controller.test.ts, .repo.integration.test.ts; knowledge-source-deletion.repo.ts, .controller.ts, .controller.test.ts, .repo.integration.test.ts; knowledge-source-regeneration.stuck.integration.test.ts
- apps/web/src/knowledge-source/: failed-extractions.api.ts, use-failed-extractions.ts, failed-extraction-reason.ts (+.test.ts), failed-extractions-indicator.tsx (+.test.tsx), failed-extraction-item.tsx (+.test.tsx), failed-extractions-confirm.tsx

## Files (additive hunk to dirty foreign files — not staged per plan)
- packages/shared/src/index.ts — one export line
- apps/api/src/router-table.ts — two route entries before /:id regexes
- apps/api/src/router.ts — two RouteName union entries
- apps/api/src/api-server.ts — two imports + two switch cases
- apps/api/src/knowledge-source/knowledge-source-regeneration.repo.ts — stuck clause in WHERE
- apps/web/src/curriculum/api-client.ts — listFailedKnowledgeSources + deleteKnowledgeSources
- apps/web/src/knowledge-bit/knowledge-bit-review-events.ts — REVIEW_REFRESH_REQUESTED_EVENT + notifyReviewRefreshRequested
- apps/web/src/knowledge-bit/knowledge-bit-review-refresh.ts — useEffect listener for REVIEW_REFRESH_REQUESTED_EVENT
- apps/web/src/knowledge-bit/knowledge-bit-review-page.tsx — one FailedExtractionsIndicator mount
- apps/web/src/routes/add-knowledge.tsx — one FailedExtractionsIndicator mount
- apps/web/src/routes/-add-knowledge.test.tsx — vi.mock failed-extractions.api
- apps/web/src/routes/-knowledge-bit-review.test.tsx — vi.mock failed-extractions.api

## Checks
- npx tsc --noEmit: apps/api, packages/shared, apps/web all clean.
- npx vitest run: all new unit tests pass (controller tests, reason tests, item/indicator component tests, shared contract tests). Pre-existing non-integration failures are unchanged.
- No lint script exists; none run.

## Not run
- knowledge-source-failed.repo.integration.test.ts, knowledge-source-deletion.repo.integration.test.ts, knowledge-source-regeneration.stuck.integration.test.ts: require pet-projects DB lane (localhost:5578); not run to avoid touching shared DB state.

## Defaults chosen
- Browser check (step 9) not run per plan instruction ("Browser check on the e2e stack only").
- `notifyReviewRefreshRequested` added directly to knowledge-bit-review-events.ts alongside notifyPendingReviewChanged (the same file, same pattern).

END-OF-REPORT
