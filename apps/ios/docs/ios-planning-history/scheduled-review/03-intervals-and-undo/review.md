# Review: Interval labels + undo last grade (items 3 and 4)

Verdict: APPROVED

Scope read: DueReviewModel.swift, DueReviewScreen.swift, API/APIClient+ScheduledReview.swift, API/ScheduledReviewModels.swift (whole files). Build with own derived data: exit 0.

## Contract check
- intervalPreview is integer seconds (server knowledge-bit-grade-schedule.ts:109-122). IntervalFormat.short/spoken match the web formatter apps/web/src/knowledge-bit/anki-review-interval.ts:14-52 branch for branch (minute/hour/day thresholds, 30-day month, one-decimal months with ".0" dropped, plurals). Swift `.rounded()` (half away from zero) equals JS Math.round for positive values.
- Undo calls DELETE /knowledge-bits/reviews/{reviewId} with the reviewId from the record result (controller :59-70). 409/404 clear the undo entry with a notice; 401 and network errors keep it for a retry.

## Double-record and double-tap
- The undone card is re-presented through present(), which issues a NEW requestId. This is required: the server's requestId lookup does not filter undone rows (knowledge-bit-review.repo.ts:105-125), so reusing the old id would silently replay the undone result.
- Grading and undo share the isGrading flag; Undo is also disabled while a refetch is loading, so an undo cannot interleave with a grade or a reload.
- Both Low findings from review 01 are fixed (Try again in the unauthorized view; hasLoaded reset on cancellation).

## Findings
- Low — Undo is hidden when the refetch after the last card fails (error state), so that last grade cannot be undone until the reload succeeds. Mechanism: the toolbar condition excludes `.error`. Fix: allow undo in `.error` too. Logged as a note; not worth a fix dispatch.
- Low — APIClient+ScheduledReview.swift has two `extension APIClient` blocks and a duplicated percent-encoding set. Cosmetic; fold into one helper when the file is next touched.

No Critical/High/Medium findings.

END-OF-REPORT
