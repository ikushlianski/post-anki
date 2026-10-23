# Scheduled review run report

The learner can now open "Due today" from Home and review approved knowledge on the server's spaced-repetition schedule. Each card shows its question, then its answer, then four grade buttons labelled with when the card would come back. The last grade can be undone, and grades given offline are saved on the device and sent later without ever being recorded twice.

## Item status
| # | Item | Status | Citation |
|---|------|--------|----------|
| 1 | Due today screen loads the cards due now | Done | Sources/PostAnkiIOS/DueReviewModel.swift:65 (load) |
| 2 | Question, reveal answer, grade again/hard/good/easy | Done | Sources/PostAnkiIOS/DueReviewModel.swift:118 (grade) |
| 3 | Next interval shown on each grade button | Done | Sources/PostAnkiIOS/DueReviewScreen.swift:72 (buttons), API/ScheduledReviewModels.swift (IntervalFormat) |
| 4 | Undo the last grade | Done | Sources/PostAnkiIOS/DueReviewModel.swift:165 (undo) |
| 5 | Offline grades saved and sent later | Done | Sources/PostAnkiIOS/PendingGradeQueue.swift:50 (flush) |
| 6 | Home card with due count, opens Due today | Done | Sources/PostAnkiIOS/HomeScreen.swift:43 |

The citations in todo.md were recorded when each item was approved. Later items moved some line numbers; the table above has the current ones. Every item was approved on the first review, so no fix dispatches were needed. Reviews are in each item folder's `review.md`.

## How it works (architecture)
- **Server contract (Fact).** The app reads `GET /knowledge-bits/review-cards?limit&tz` and sends grades with `POST /knowledge-bits/reviews` as `{variantId, grade, durationMs, requestId}`. Undo is `DELETE /knowledge-bits/reviews/{reviewId}`, using the `reviewId` returned by the POST (post-anki apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:14-70; routes router-table.ts:84,99,104). Dates stay as ISO strings. `intervalPreview` is whole seconds (knowledge-bit-grade-schedule.ts:109-122).
- **No double records.**
  - Each card that is shown gets one `requestId`. Every retry and the offline queue reuse it, and the server answers a repeated `requestId` with the stored result instead of recording it again (knowledge-bit-review.orchestrator.ts:67-72).
  - A card brought back by undo gets a new `requestId`. The server's lookup does not skip undone reviews (knowledge-bit-review.repo.ts:105-125), so the old id would quietly do nothing.
  - Undoing a grade that is still only on the device deletes it from the device and sends nothing.
  - Cards for a knowledge bit that still has a grade waiting to be sent are held back when the next batch loads.
- **Double-tap guard.** Grading and undo share one in-flight flag. While a request is running, the grade buttons, Retry and Undo are all disabled.
- **Offline queue.** `PendingGradeQueue` is an actor that saves to Application Support, modelled on `PendingAnswerQueue`. It keeps everything and stops on a network error, cancellation, 5xx, 408, 429 or 401. It drops an entry only on 400, 403 or 404.
- **Home count.** Home uses the `counts` from `review-cards`, totalling review + learning + new. It does not use `/subjects/review-due-counts`, because that endpoint adds each subject's subfolders into its total, so summing subjects double-counts.

## Defaults taken (no questions asked)
- Cards load 20 at a time (the web loads 10).
- `kind` and `phase` are read as plain text, so a new value from the server can't break a whole batch.
- The answer timer starts when the card is shown, and the background text appears only after the answer is revealed. Both match the web.
- A 403 or 404 on a grade skips the card with a notice. The web shows a Skip button instead.
- Undo goes back one grade only (the web allows several). It is available on the card, on the "done" screen and on the error screen.
- Only a network error puts a grade in the offline queue. A 5xx or 401 keeps the card on screen with Retry or a pointer to Settings.
- Undoing an offline grade that has already been sent shows "Already sent, can't undo". The app does not look up the server id for it afterwards.
- When the queue is sent:
  - the Due screen opens;
  - the app returns to the foreground while the Due screen is open;
  - the Home due count loads.

  The app's existing foreground hook lives in HomeView.swift, which another orchestrator owns, so it was not used.
- The Due screen shows how many grades are waiting to be sent.
- Cards are not cached. With no connection, the Due screen can't start.
- I added files beyond the four named ones, all under our own names: `DueReviewModel.swift`, `DueReviewModel+Helpers.swift` and `DueTodayCard.swift`. This keeps every file under 300 lines and keeps the HomeScreen.swift edit to three small insertions.

## Files touched
New:
- Sources/PostAnkiIOS/DueReviewScreen.swift
- Sources/PostAnkiIOS/DueReviewModel.swift
- Sources/PostAnkiIOS/DueReviewModel+Helpers.swift
- Sources/PostAnkiIOS/DueTodayCard.swift
- Sources/PostAnkiIOS/PendingGradeQueue.swift
- Sources/PostAnkiIOS/API/APIClient+ScheduledReview.swift
- Sources/PostAnkiIOS/API/ScheduledReviewModels.swift

Edited:
- Sources/PostAnkiIOS/HomeScreen.swift: a due-model state, the first Section, and a pull-to-refresh that reloads both. This edit is left unstaged because the file also holds another orchestrator's staged changes.

Nothing was committed. HomeView.swift, PostAnkiIOSApp.swift, APIClient.swift and the web repo were not touched.

## Build
The final build exited 0. It used the scheduled-review derived data path after `xcodegen generate`, and showed no errors or warnings in our files.

## Open notes (todo.md "To review / clarify")
- If the learner undoes an offline grade while it is being sent, the app says "already sent". If that send then fails, the grade is still sent later. It is recorded once, but the undo is lost.
- A foreground reload on the error screen can run at the same time as an undo. The fix is to skip the reload while a request is in flight.

## Not verified
- I made no call to the live API and ran nothing on a device or simulator. Only the compile was checked.
- There is no test target, so no automated tests were run. The pure helpers (interval formatter, `shouldKeep`, duration) are ready for one.
- The JSON shapes come from reading the Zod schemas and controllers. I did not capture a real response.
- I did not check against real data that the server's new-card cap makes the Home count equal what the Due screen serves.

## Manual test sequence
1. Set a valid token in Settings. Home shows a "Due today" row with a number and a breakdown; tap it.
2. Each card shows its question. Tap Show answer and check that the answer and background appear, and each grade button has an interval label (a new card shows about <1m / 6m / 10m / 4d).
3. Tap Good twice quickly. The server records exactly one review, and the next card appears.
4. Tap Undo. The same card comes back hidden and the reviewed count drops by one. Grade it again and the server records a new review.
5. Turn on airplane mode and grade three cards. Each one moves on with "Saved offline, will send later", and the caption reads "3 grades waiting to send". After the last card you see the offline message.
6. Grade one more card offline, then tap Undo. The card comes back, the caption drops by one, and nothing is sent later.
7. Turn off airplane mode, send the app to the background and bring it back. The caption clears, and the server shows exactly one review per offline card.
8. Put an invalid token in Settings, grade offline, then reconnect. The grades stay queued; nothing is dropped on a 401. Fix the token and come back to the foreground: they are sent.
9. Go back to Home. The due count has dropped. Pull to refresh and it updates.

END-OF-REPORT
