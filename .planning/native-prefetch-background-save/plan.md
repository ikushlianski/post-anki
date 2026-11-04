# Native prefetch and background save (Triage + Review)

## Goal
Moving between Triage and Review cards stays instant, every decision or grade saves in the background in order without loss or double-submit, and a save that truly fails brings the user back to that card with Retry or Skip.

## Findings (what already exists, apps/ios is native Swift; no Tauri)
- Review prefetch is done: `review-card-window.swift` (target 20, top-up below 8, merge dedupes) plus `DueReviewModel+Window.swift`. No media in cards (no image fields), so no image prefetch.
- Review save is durable and ordered: `PendingGradeQueue.swift` (file-backed FIFO, one in flight, `requestId` per card). Server dedupes: unique `request_id`, replay in `knowledge-bit-review.orchestrator.ts`. A retried grade never double-counts.
- Triage list loads all pending cards at once (API cap 200, no paging) so the whole queue is in memory; no prefetch work needed.
- Triage save is optimistic (`focus-triage-model+optimistic.swift`) but in memory only, one unordered Task per card, lost on quit. Server approve/reject are state-idempotent (already approved/rejected returns ok; opposite state returns 409 `blocked`).
- Gaps: no failure UI anywhere. Review drops permanent errors silently and retries transient ones silently forever. Triage failure puts the card back with a small notice. No Retry/Skip. Mac Triage (keep/drop) still awaits the API.

## Approach
No API change. Add one durable ordered queue for triage decisions that mirrors `PendingGradeQueue`, and a halt-on-failure state on both queues with one shared prompt. Prefetch stays as is (lowWater stays 8, not 5).
- `PendingDecisionQueue` actor (`Sources/Shared`): file `pending-triage-decisions.json`, entries `{id, bitId, kind approve|reject|keep(variantIds), note?, serverURL, attempts}`, FIFO, one in flight, same `ServerScope` and quarantine handling as the grade queue.
- Shared `BackgroundSaveOutcome` classifier: `sent`, `stale` (404, 409 blocked, 403 not_approved: drop and show "already decided elsewhere"), `offline` (URLError: stay queued silently, as today), `transient` (5xx/408/429: auto-retry 3 times), `failed` (other 4xx, or 3 transient strikes).
- On `failed` the queue halts at that entry (order preserved, later entries wait) and exposes `failure`; `retryFailed()` resends the same id, `skipFailed()` drops it.
- Shared `SaveFailurePrompt` view: card title, plain message, Retry and Skip buttons; used by Review, iOS Triage and Mac.
- Models react: Review re-presents the failed card (kept in an in-memory `unsentCards[requestId]` map); Triage restores the card from its snapshot and pins it (existing `.kept` path). After a relaunch there is no card in memory, so the prompt shows without navigation.

## Steps
1. `background-save-outcome.swift` (new): classifier from `APIError`/`URLError`, reusing `PendingGradeQueue.shouldKeep` and the 404/409 mapping in `PendingReviewDecisionOutcome`.
2. `PendingGradeQueue.swift`: on `failed`, keep the entry, set `failure`, stop flush (no silent drop); add `retryFailed()`, `skipFailed()`; `stale` still drops. `PendingQueueFlusher.swift`: also flush the decision queue.
3. `pending-decision-queue.swift` (new): actor from Approach; `enqueue`, `flush`, `remove(id)` (returns removed / inFlight / notFound), `pendingBitIds()`, `failure`, `retryFailed`, `skipFailed`, `clearAll`. `sign-out-cleanup.swift` clears it.
4. `save-failure-prompt.swift` (new) and wiring in `DueReviewStateViews.swift` (Review) and `focus-triage-view.swift` (iOS Triage). Mac views (`MacDueReviewView.swift`, Mac Triage host) show the same prompt.
5. `DueReviewModel+Window.swift`/`DueReviewModel.swift`: after `drainPending`, read `gradeQueue.failure`; if present set `saveFailure`, re-present the card, expose Retry/Skip. Skip drops the card and un-counts it (`gradedNewCount`/`gradedOtherCount`, `reviewedCount`).
6. `focus-triage-model+optimistic.swift`: `decide` enqueues to `PendingDecisionQueue` then removes the card at once; replace per-bit Tasks with one drain task. `settlePending` awaits the drain. Undo: `remove(id)` if not started, else await settle then call restore. `sourcesWithoutPending` filters by queue `pendingBitIds()`; `list.load()` filters them too so a reload never resurrects an unsent card.
7. Triage failure: restore card, pin it, set `saveFailure`; Finish and `finishTriageSession` wait for the drain and are blocked while a failure is open.
8. Mac: route `PendingReviewTriageModel.keep/drop` through the same queue (kind `keep`/`reject`); keep the 8 s drop undo by `remove(id)` before send, restore after. Add `PendingDecisionQueue` flush to `Launch/MacQueueFlushTrigger.swift` via `PendingQueueFlusher`.
9. `docs/ARCHITECTURE.md` and `README.md` (Focus triage paragraph): describe the queue and failure prompt; mark both todo items done in `.planning/TODO.md` after verification (Review prefetch is verified by existing window tests plus step 5 tests).

## Tests (Swift Testing smoke tests in `Tests/PostAnkiMacSmokeTests`, FakeServer; run `scripts/run-mac.sh --test`)
- `pending-decision-queue-smoke-tests.swift`: should send decisions in the order made even when an earlier one is slow; should not send the same decision twice after a relaunch mid-flight; should survive app quit and flush on next launch; should keep decisions for another server unsent.
- `background-save-outcome-smoke-tests.swift`: should treat an already-decided card as gone, not as a failure; should stay quiet while offline; should surface a failure after three server errors.
- `save-failure-review-smoke-tests.swift`: should bring the user back to the card whose grade failed and offer Retry or Skip; should send the retry with the original request id so the grade counts once; should leave counts unchanged after Skip; should hold later grades behind the failed one.
- `save-failure-triage-smoke-tests.swift`: should show the next card at once while the save is held (extend `focus-triage-optimistic`); should restore and pin the failed card with Retry/Skip; should not resurrect an unsent card on reload; should block Finish until saves settle.
- `review-card-window-smoke-tests.swift`: keep, add a case that a top-up never re-adds a card whose grade is still queued.
- Mac keep/drop through the queue: extend `PendingReviewTriageSmokeTests.swift`.

## Done when
- Approve, reject and grade return control before the network answers; next card shows with no wait.
- Saves leave the app in decision order, one at a time, and are never sent twice.
- Quitting with unsent decisions or grades loses nothing; they flush on next launch.
- A real failure shows the prompt on the failed card with working Retry and Skip on iPhone and Mac.
- Offline use behaves as before; sign-out clears all queues; `scripts/run-mac.sh --test` passes.

## Defaults chosen
- No API change: server already dedupes grades by `requestId` and approve/reject are idempotent.
- Prefetch window left at 20 with top-up below 8: it is shipped and tested; 5 would only risk stalls.
- Triage needs no paging: whole list (up to 200) is already in memory.
- No image prefetch: cards are text only.
- Offline stays silent: failure prompt only for server refusals or repeated 5xx, so the offline queue keeps working.
- Triage Edit stays synchronous: it needs server validation messages (cloze, list) the user must fix.
- One failure halts the queue: preserves order; later saves wait for Retry or Skip.
- Triage notes and feedback after a reject remain best-effort after the decision lands.
- A grade whose card was graded on another device still counts once more: accepted, server has no per-card conflict check.
- Risk: after a relaunch flush, `FocusTriageSessionModel` is not alive, so those decisions may be missing from the session summary counts.

END-OF-REPORT
