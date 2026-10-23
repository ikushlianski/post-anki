# Plan: link to review after sending text

## Goal
After a successful send in the dictation screen, offer a one-tap "Review new items" action that opens the existing review screen so the new items can be approved.

## Behaviour
- Submit works as today (create source, clear text, best-effort `detectKnowledgeBits()`).
- On success the "Sent for review" alert is replaced by an inline Section in the form:
  - While extraction runs (`isSubmitting` still true): "Sent. Extracting items..." and the review button is disabled.
  - When extraction finishes (success or failure): "Sent. New items appear in Review once extracted." and the button "Review new items" is enabled.
- Tapping the button presents `PendingReviewScreen()` in a `.sheet`. The sheet is a fresh instance on each presentation, so its `.task { load() }` fetches after extraction has finished. It also has pull-to-refresh, which covers the case where extraction failed or is slow.
- The user can keep typing in the form while the section is shown.

## Approach
Only `IngestionDictationScreen.swift` changes. `PendingReviewScreen` owns its own `NavigationStack`, so it is presented in a sheet, never pushed (a push would nest stacks). No new module or contract. `PendingReviewScreen.swift` and `HomeView.swift` are untouched.

## Steps (all in `Sources/PostAnkiIOS/IngestionDictationScreen.swift`)
1. In `IngestionDictationScreenModel`, replace `showConfirmation` with `var hasSent = false` and add `var showReview = false`.
2. In `submit()`: set `hasSent = false` right after `errorMessage = nil`. After `createKnowledgeSource` succeeds and `text = ""`, set `hasSent = true`. Keep `try? await APIClient.detectKnowledgeBits()` and `isSubmitting = false` as they are. The catch branch leaves `hasSent` false.
3. In the view, remove the `.alert("Sent for review", ...)` modifier.
4. Add a Section shown when `model.hasSent`, placed after the Submit section and before the error text:
   - `Text` that reads "Sent. Extracting items..." when `model.isSubmitting`, else "Sent. New items appear in Review once extracted." (`.font(.caption)`, `.foregroundStyle(.secondary)`).
   - `Button("Review new items") { model.showReview = true }`, `.disabled(model.isSubmitting)`.
5. Add `.sheet(isPresented: $model.showReview) { PendingReviewScreen().presentationDragIndicator(.visible) }` on the Form. The drag indicator is the dismiss affordance, because the review screen has no Done button and must not be edited.

## Tests
None. The repo has no test target and the change is view state only. Verify by building (`xcodebuild` for the iOS 17 simulator, or `swift build` if that is how the repo builds) and by this manual run-through:
- Send text: the section shows "Extracting items...", then the button enables, and the sheet shows the new items.
- Send with the network off: the error text shows, no review section appears.
- Send twice: the section hides during the second send and returns on success.
- Swipe the sheet down: the form is intact and the section is still there.

## Done when
- No "Sent for review" alert remains and `showConfirmation` is gone.
- A successful send shows the inline section; the button is disabled until extraction finishes and then opens `PendingReviewScreen` in a sheet.
- A failed send shows only the existing error message, with no review link.
- A second send hides the previous success state until it succeeds.
- Dismissing the sheet returns to the dictation form with the typed text kept.
- The project builds with no warnings from this file, and `git diff` shows only `IngestionDictationScreen.swift` changed.

## Defaults taken
- Inline section over an alert with a "Review now" button: the alert blocks the screen while extraction is still running, so the link would open to an empty list. The section can reflect extraction state and needs no extra alert state.
- Sheet over NavigationLink: avoids the nested NavigationStack from `PendingReviewScreen`'s own stack.
- Button disabled during extraction, not hidden: shows the user something is in progress. Detection failure still enables it, since the source is saved and pull-to-refresh is available.
- Reuse `isSubmitting` as the extraction signal: `submit()` already awaits `detectKnowledgeBits()` before clearing it. The known "Submit stays disabled until detect-bits returns" issue is out of scope.
- No change to `PendingReviewScreen` for a Done button: another agent owns it, so the drag indicator is used.
- No test added: there is no test target.

END-OF-REPORT
