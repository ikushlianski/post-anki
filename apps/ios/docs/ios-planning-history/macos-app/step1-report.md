# Step 1 report: PostAnkiAPI package extraction

Diff command: `git diff --cached -M --stat` (everything is staged, nothing committed).

## Result

- The whole former `Sources/PostAnkiIOS/API` folder (55 files) now lives in the local Swift package `Packages/PostAnkiAPI`; the old folder is gone. Moved with `git mv`; git reports about half as renames and the rest as add/delete pairs because the `public` edits changed too many lines for its similarity threshold.
- The iOS app imports the package (`import PostAnkiAPI` in 123 app files that use an API symbol). iOS behaviour is unchanged.
- Public surface follows the plan: every type, member and `APIClient` static function the apps touch is `public`; explicit `Sendable` on every public struct/enum (`APIClient` and `TokenStore` excluded, they are static-only namespaces); `init(from:)` made public; `APIClient.request`, `canSendToken`, `AnyEncodable`, `APIErrorBody`, `AdminScanValue` and `CodingKeys` stay internal/private.
- `TokenStore`: `kSecAttrAccessible` wrapped in `#if os(iOS)`, no access group.
- `project.yml`: top-level `packages: PostAnkiAPI (path Packages/PostAnkiAPI)` and iOS target dependency `package: PostAnkiAPI`.

## Checks

- `swift build` in `Packages/PostAnkiAPI` (host macOS): no errors, no warnings.
- `xcodegen generate`: ok.
- `xcodebuild ... -scheme PostAnkiIOS -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`: BUILD SUCCEEDED. The only warning line is the generic "Metadata extraction skipped. No AppIntents.framework dependency found", not from this change.
- `test -z "$(ls Sources/PostAnkiIOS/API)"`: passes.
- tsc, eslint and vitest do not apply (Swift repo, no CLAUDE.md, no lint tooling). Nothing was run for them.

## Defaults and deviations (one line each)

- Public memberwise inits were written for the plan's 18 types, generated from the stored properties; labels, order and defaults match the old memberwise init. Additions beyond the plan list: none.
- `PendingReviewUndo`, `StudyChatTurn` and `DeclareGapInput` have defaulted `var` properties, so their public inits include those as defaulted parameters (`isRestoring`/`canRetry`, `lookupFailed`, `wanted`) to match the old memberwise signature.
- Two `nonisolated static` helpers on `StudySessionDates` (`parse`, `format`) were also made `public`; the app uses them and the plan's list missed the `nonisolated` modifier.
- Three one-line `enum CodingKeys { ... }` declarations were left internal (not public, no Sendable).
- `.gitignore` gained `.build/` and `.swiftpm/` so the package's SwiftPM build output is not tracked.
- Package has no test target and no `@_exported` re-export, as planned.
- The tree was clean at start (the plan's "uncommitted baseline" risk no longer applied).
- Steps 2 and 3 not started.

END-OF-REPORT
