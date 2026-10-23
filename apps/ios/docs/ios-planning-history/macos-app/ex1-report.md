# ex1: split DueReviewModel

Diff: `git diff --cached -- Sources/Shared/DueReviewModel.swift Sources/Shared/DueReviewModel+Loading.swift Sources/Shared/DueReviewModel+Grading.swift Sources/Shared/DueReviewModel+Undo.swift`

## Result
- DueReviewModel.swift 318 -> 88 lines (state, init, reveal, showNext, present)
- DueReviewModel+Loading.swift 77 (refreshAfterBackgroundFlush, loadIfNeeded, flushPending, load)
- DueReviewModel+Grading.swift 71 (grade, queueOffline, submit)
- DueReviewModel+Undo.swift 94 (undo and its helpers, restore)
- Method bodies moved verbatim; no logic change. Only these four files staged by me.

## Defaults
- Swift extensions in other files cannot see `private`, so `private`/`private(set)` members of DueReviewModel became internal (module-only, no public API change). Side effect: other module code can now write properties that were `private(set)`.
- xcodegen hangs (CPU loop) when the spec uses absolute paths outside its dir; used /private/tmp/e1b with symlinks to Sources/Tests/Config/Packages and the unmodified project.yml. Nothing generated in the repo root.

## Checks
- xcodebuild build PostAnkiIOS (iOS Simulator), derivedData /private/tmp/dd-e1: succeeded
- xcodebuild build PostAnkiMac: succeeded
- xcodebuild test PostAnkiMac: TEST SUCCEEDED (registry suite 6 tests pass)
- npx tsc / vitest / lint: not applicable (Swift repo, no package.json, no swiftlint installed)
- Siblings' edits did not break the build; no retry needed.

END-OF-REPORT
