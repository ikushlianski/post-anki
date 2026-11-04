# Plan: Persist per-day review totals so streak tracking survives a page reload

**Tier**: Simple — plan skipped (expected 2 code files)

## Goal
When a self-graded Anki review succeeds, record today's activity on the server so the streak advances and survives any page reload.

## Approach
`recordActivityToday` is already called fire-and-forget from `study-session.service.ts` and `probe-session.service.ts` after successful activity. The knowledge-bit review controller (`knowledge-bit-review.controller.ts`) never calls it, so the streak never advances during Anki review sessions. Adding the same fire-and-forget call after a `201` outcome to `handleRecordKnowledgeBitReview` is the only change needed. No new module, boundary, or contract beyond `brief.md`. The client-side `daily-review-storage.ts` already persists its localStorage count across reloads and needs no change.

## Steps
1. **`apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts`**: import `recordActivityToday` from `../streak/streak.service.js`. After `sendJson(res, 201, result)`, add `void recordActivityToday(new Date().toISOString()).catch((err) => log.warn({ err }, 'streak_update_failed'))`.
2. **`apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts`**: add two cases to the existing POST review test — a successful grade calls `recordActivityToday` once; a `variant_not_found` response (404) does not call it. Mock `recordActivityToday` with `vi.mocked`.

## Tests
- `knowledge-bit-review.route.test.ts`: mock `../streak/streak.service.js` with `vi.mock`; assert `recordActivityToday` is called exactly once on a 201; assert it is not called on a 404. These cover the two execution paths in the handler.

## Done when
- A POST to `/knowledge-bits/reviews` that returns 201 causes `recordActivityToday` to be called.
- A POST that returns 403 or 404 does not call `recordActivityToday`.
- `npx tsc --noEmit`, lint, and `npx vitest run` are clean.
- `getDailyReviewCount()` still returns the correct accumulated count after a page reload (localStorage-backed; no code change needed — verify by reading `daily-review-storage.test.ts`).

## Defaults chosen
- Fire-and-forget `void … .catch(log.warn)`: matches the `socratic.service.ts` and `study-session.service.ts` call sites exactly; a streak failure must not fail the grade response.
- Call site in the controller, not the orchestrator: other callers (typed-mode) share the orchestrator but have their own streak wiring; keeping streak calls at the HTTP layer prevents double-recording if the orchestrator is ever called directly.
