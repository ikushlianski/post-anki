# Polish report (02)

Build: xcodegen generate, then xcodebuild (iOS Simulator, quiet): exit 0, no warnings.

1. Approve-all count: fixed. Count captured into @State when the button is tapped (PendingReviewScreen.swift).
2. Restored-then-approved reappearing: fixed. remove(bitId:) also drops it from restoredDuringLoad (PendingReviewListModel.swift).
3. Model split: fixed. Bulk approve, undo, expiry, apply/restore helpers moved to PendingReviewListModel+BulkUndo.swift (155 lines; main file 174). No behaviour change. Default: loosened `private`/`private(set)` on shared model state to internal so the extension compiles.
4. Undo while in flight: fixed per review's fix. PendingGradeQueue.remove marks the in-flight request as cancelled; flush drops it on a failed send instead of keeping it. The "already sent" message is unchanged (still accurate if the send succeeds).
5. Reload during grade/undo: fixed. flushPending skips load() while isGrading (DueReviewModel.swift).
6. Submit re-enabled after save: fixed. New isDetecting flag; isSubmitting ends once the source is saved; detection runs on, and only "Review new items" and the status text depend on isDetecting.
7. Stale subject: fixed. Server returns 400 {"error":"subject_not_found"} (knowledge-source.controller.ts); the app already carries that code in APIError.badStatus, so a specific message is shown: "That course no longer exists. Go back and pick another."
8. Done button: fixed. PendingReviewScreen gains an optional onDone; when set it adds a Done toolbar button inside its own NavigationStack (an outer wrapper would not show in the nested stack). The Add Knowledge sheet passes it; the Home tab usage is unchanged. Default: chose this over wrapping.

Files: PendingReviewScreen.swift, PendingReviewListModel.swift, PendingReviewListModel+BulkUndo.swift (new), PendingGradeQueue.swift, DueReviewModel.swift, IngestionDictationScreen.swift. All staged.

END-OF-REPORT
