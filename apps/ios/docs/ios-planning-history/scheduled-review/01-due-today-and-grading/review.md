# Review: Due today screen + reveal and grade (items 1 and 2)

Verdict: APPROVED

Scope read: Sources/PostAnkiIOS/API/ScheduledReviewModels.swift, Sources/PostAnkiIOS/API/APIClient+ScheduledReview.swift, Sources/PostAnkiIOS/DueReviewModel.swift, Sources/PostAnkiIOS/DueReviewScreen.swift (all new, read whole). Build with own derived data: exit 0.

## Contract check
- GET /knowledge-bits/review-cards with limit=20 and percent-encoded tz (router-table.ts:84, schema knowledge-bit-review.ts:24-31). Model keys match reviewCardSchema / reviewCardsResponseSchema exactly; kind/phase kept as String so new server values cannot break decoding.
- POST /knowledge-bits/reviews body {variantId, grade, durationMs, requestId}; nil fields omitted by synthesized encodeIfPresent. Result decoded per recordReviewResultSchema; reviewId kept in lastGraded for undo.
- 403/404 (controller :48-52) skip the card with a notice; skipped ids filtered on refetch, so no refetch loop.

## Double-record and double-tap
- One requestId per shown card (DueReviewModel.swift:149), reused for every retry at any grade, so a lost-response retry is replayed by the server (orchestrator.ts:67-72) and never recorded twice.
- grade() sets isGrading before its first await and all four buttons plus Retry are disabled while it is set; a second queued tap hits the guard (MainActor-serialized). After success the next card is unrevealed, so a late tap is also rejected.

## Findings
- Low — Unauthorized state never re-checks. Symptom: after fixing the token in Settings and coming back, the screen still says unauthorized. Mechanism: .task calls loadIfNeeded, which skips because hasLoaded is true, and the view has no retry action. Fix: add a "Try again" button calling load(). Folded into the item 3/4 implementation brief.
- Low — A load cancelled by the view disappearing leaves state .loading with hasLoaded true. Mechanism: CancellationError returns without resetting hasLoaded. Impact is minimal because the popped screen's model is discarded. Fix: reset hasLoaded on cancellation. Folded into the item 3/4 brief.

No Critical/High/Medium findings. No force unwraps, MainActor-isolated model, nothing logged.

END-OF-REPORT
