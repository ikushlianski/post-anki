# Fix batch 1 report

Fixed findings 1, 4, 5, 7, 8, 10 plus the two below-cutoff items.

1. TagsModel: mastery rows are indexed with a keep-last merge (`TagsModel.index`), so a repeated tagId no longer traps.
4. SettingsScreen: removeToken posts `.postAnkiSettingsDidSave`; the Remove token button now asks for confirmation (applies on iOS too, since the screen is shared).
5. SettingsScreen: `save()` rejects http:// unless the host is localhost or 127.0.0.1 (the same rule APIClient uses for sending the token), with a clear message.
7. IngestScreenModel.submitAnswer has an in-flight guard and ignores calls once feedback is showing.
8. MacLaunchIssue gains `.serverError` ("The server ran into a problem"); bad status and other non-network errors map to it. badURL stays serverUnreachable.
10. PendingAnswerQueue.flush uses `PendingGradeQueue.shouldKeep`, so 408/429 answers are kept for retry.
Below cutoff: PendingGradeQueue.load moves an undecodable file aside to `pending-grades.unreadable-<timestamp>.json` instead of overwriting it. nextQuestionVariants percent-encodes topicId via `nextQuestionVariantsPath`.

Both queues gained an optional `init(fileURL:)` for tests; default behavior is unchanged.

Tests: `Tests/PostAnkiMacSmokeTests/CrashGuardSmokeTests.swift` (tags, address rule, double submit, 429/400 retention, unreadable grades file) and `Packages/PostAnkiAPI/Tests/PostAnkiAPITests/QuestionVariantsPathTests.swift`.
Not tested: MacLaunchIssue (the Mac target is not compiled into the test target) and removeToken (needs Keychain).

Checks (private spec copy in /private/tmp/fx1-proj, derived data /private/tmp/dd-fx1): Mac scheme tests passed (57), iOS scheme build succeeded, swift test on PostAnkiAPI passed (43). No lint tool is configured (swiftlint absent); tsc/vitest do not apply to this Swift repo.

Defaults: quarantine the bad file rather than refuse to enqueue; PendingAnswerQueue has the same silent-decode behavior and was left alone (not in scope). The new test file is not in the checked-in PostAnkiIOS.xcodeproj; regenerate it normally.

Staged (diff: `git diff --cached`): the files above only. The sibling's unstaged files were not touched.

END-OF-REPORT
