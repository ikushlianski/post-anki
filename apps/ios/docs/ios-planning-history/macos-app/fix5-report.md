# Fix 5 report: links, redirects, path encoding, token cache

Diff: `git diff --cached -- Packages/PostAnkiAPI Sources/Shared/StudyMaterialsSection.swift Sources/Shared/LectureScreen.swift Sources/Shared/LectureSourcesSection.swift Sources/PostAnkiMac/Learn/MacLearningListView.swift Sources/PostAnkiMac/Library/MacSourcesView.swift`
(Other staged files belong to sibling agents. StudyToolsModels.swift is a sibling edit and was left unstaged by me.)

## Changes
1. Links: new `WebLink.url(from:)` accepts only http/https URLs with a host. The citation, lecture source, study material, Mac learning list and Mac sources links use it and fall back to plain text. `LectureMarkdown.text` also strips non-web links from AI markdown, keeping the visible text.
2. Redirects: all requests go through one session with `RedirectGuard`. A redirect is refused when the host changes or https drops to http. A refused redirect surfaces as a bad-status error.
3. Encoding: new `RequestPath.swift` holds `encodedSegment`, `encodedQuery`, `encodedPath`. The 20 private copies and ad-hoc query building are removed. Ids that were unencoded (knowledge bits, curricula stats, variants, placement, chat, feedback, pending review) are now encoded. Query strings use the one helper.
4. Token: `TokenStore.read()` reads the keychain once through `TokenCache`. `save` and `clear` update the cache. The public API is unchanged.

## Tests (swift test): 60 tests passed
WebLinkTests, RedirectGuardTests, TokenCacheTests, RequestPathEncodingTests. QuestionVariantsPathTests was updated for the non-throwing helper.

## Checks
- `swift test --package-path Packages/PostAnkiAPI`: pass.
- Mac scheme tests and iOS build: not verified. Both fail only on sibling files that reference types not yet in the checked-in project (`ServerScope`, `recentTurns`, `pendingQueuesFlushed`, `MacCourseOpenRequest`). Retried twice. My app-side edits are one-line `WebLink.url(from:)` swaps.
- tsc and vitest: not applicable (Swift repo). No swiftlint installed.

## Defaults
- Mac learning list and Mac sources views were included since they render links (not in the sibling-owned list).
- Comma-joined gap ids are now sent percent-encoded (%2C) inside one query value.
- Same-host redirects over http (localhost dev) are allowed.

END-OF-REPORT
