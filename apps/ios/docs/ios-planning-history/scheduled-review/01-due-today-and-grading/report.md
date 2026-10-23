# Report: Due today screen + reveal and grade

## Built
- Sources/PostAnkiIOS/API/ScheduledReviewModels.swift: grade, card, response, record input/result types.
- Sources/PostAnkiIOS/API/APIClient+ScheduledReview.swift: reviewCards(limit:tz:) (tz percent-encoded, including "/" and "+"), recordReview.
- Sources/PostAnkiIOS/DueReviewModel.swift: states, load/reveal/grade/showNext, single private submit seam, pure static helpers, lastGraded (reviewId kept for item 4).
- Sources/PostAnkiIOS/DueReviewScreen.swift: card, grade buttons (DueReviewGradeButtons), empty, error, unauthorized views, #Preview.
- No entry point (Home card is item 6). Only these four files were created, staged with git add.

## Orchestrator override applied
requestId is per card: one lowercase UUID generated when the card is shown, reused for every attempt at any grade until success or skip.

## Defaults taken
- As in plan (String kind/phase, limit 20, durationMs from card shown, background after reveal, auto-skip on 403/404).
- Grade failure shows the error text plus a Retry button that re-sends the last failed grade; the user may also tap another grade (same requestId).
- loadIfNeeded() in .task so navigating back to the screen does not reload mid-session.
- Skip notice is cleared at the next grade attempt.
- Fill-in-the-blank replacement only for kind == "fill_in_the_blank".

## Build
Exit code 0 (own derived data path). Files: Model 185 lines, Screen 194 lines.

## Deviations
None beyond the requestId override. Not tested manually against the dev API.

END-OF-REPORT
