# Review: Offline grade queue (item 5)

Verdict: APPROVED

Scope read: PendingGradeQueue.swift and DueReviewModel+Helpers.swift (new, whole), DueReviewModel.swift, DueReviewScreen.swift, DueTodayCard.swift (whole). Build with own derived data: exit 0. HomeView.swift, PostAnkiIOSApp.swift, APIClient.swift untouched.

## Behaviour check
- A network error (URLError other than cancelled) on grade saves {variantId, knowledgeBitId, grade, durationMs, requestId, createdAt} to Application Support `pending-grades.json`, advances, counts the card as reviewed and shows "Saved offline, will send later". 5xx and 401 keep the card with Retry / Settings hint.
- Flush runs on the Due screen's first load, on the scene becoming active while the Due screen is open, and before the Home due-count request. It is FIFO, removes an entry only after a 2xx or a permanent 400/403/404, and stops-and-keeps on URLError, cancellation, 5xx, 408, 429 and `APIError.unauthorized` (a 401 never drops queued work).

## Double-record prevention
- Every queued entry carries the card's requestId (the same one the failed online attempt used); the server replays a known requestId without touching the schedule (knowledge-bit-review.orchestrator.ts:67-72, unique column db/schema.ts:1304). A timed-out request that actually reached the server is therefore recorded once.
- Enqueue dedupes by requestId; the actor's isFlushing flag serializes flushes; the flush re-reads the file before each send and skips entries an undo removed.
- Refetched cards whose knowledge bit is still queued are hidden, so the same bit cannot be graded online ahead of its queued grade.
- Undo of a queued grade removes it locally by requestId with no DELETE; `remove` refuses while that entry is in flight, so undo never claims success for a grade the server is about to record. Undo of a sent grade uses the reviewId DELETE path; a re-shown card always gets a new requestId (the server's requestId lookup ignores undone state).

## Findings
- Low — "Already sent, can't undo" can be shown for a grade whose in-flight send then fails offline; the grade stays queued and is sent later. Mechanism: remove() refuses on in-flight, then the send errors with URLError and the entry is kept. Effect: the grade the learner wanted undone is recorded once (never twice). Fix: let remove() mark the in-flight entry as cancelled so flush drops it on a failed send.
- Low — Undo is allowed in the error state, and a foreground flush can reload at the same moment; the two can interleave queue updates. Mechanism: flushPending() calls load() in the error state without checking isGrading. Fix: skip the reload while isGrading is set.

No Critical/High/Medium findings. No force unwraps; queue is an actor and the model is MainActor; nothing is logged.

END-OF-REPORT
