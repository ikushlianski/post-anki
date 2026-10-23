# ex7 report: Mac write-action fake-server tests and palette/shortcut tests

Diff command: `git diff --cached -- Tests/PostAnkiMacSmokeTests/FakeServer.swift Tests/PostAnkiMacSmokeTests/WriteActionSupport.swift Tests/PostAnkiMacSmokeTests/*WriteSmokeTests.swift Tests/PostAnkiMacRegistryTests/MacCommandPaletteMatcherTests.swift Tests/PostAnkiMacRegistryTests/MacShortcutHelpTests.swift`

## Files (all under Tests/, all staged, nothing committed, no todo ticked)
- FakeServer.swift (additive): records method and body per request (`FakeServer.requests`, `.writes`, `RecordedRequest.bodyObject`), route keys may be `"METHOD /path"` (falls back to `"/path"`), new reply `.json(status, body)` for 4xx bodies with an error code.
- WriteActionSupport.swift: `Wire` decode helpers and `WriteFailureCase` (signed out, offline, server rejection).
- TagWriteSmokeTests, PendingApprovalWriteSmokeTests, LearningListWriteSmokeTests, AnswerWriteSmokeTests, SubjectManageWriteSmokeTests: per write action, assert method/path/body, success state, and the 401, 4xx message and dropped-connection states, plus input kept (typed answers, capture fields, list contents, tags).
- Registry tests: MacCommandPaletteMatcherTests, MacShortcutHelpTests.

## Results
- Smoke target (PostAnkiMacSmokeTests), xcodegen run on a private copy in /private/tmp/ex7-repo, derived data /private/tmp/dd-f3: "Test run with 155 tests in 24 suites passed". All new write suites pass; existing suites still pass.
- Registry target (PostAnkiMacRegistryTests, hosted): compiles, but NOT run to completion. The hosted app launch hung twice ("test runner hung before establishing connection", linkd/XPC connection refused in this sandbox). I did not disable the sandbox. These tests are unverified at runtime; please run them outside the sandbox.
- tsc, lint and vitest do not apply: this is a Swift repo with no package.json, swiftlint or swiftformat installed.

## Risk to check when the registry tests run
- `shouldListEverySidebarShortcutUnderItsSectionWithTheEntryTitle` and `shouldListEveryAppReservedShortcutSoTheHelpNeverHidesOne`: the registry reserves Option-Cmd-S, which the shortcut help (as of this run, with a sibling editing it) does not list. If the sibling does not add an entry with keys "Option-Cmd-S", the reserved-shortcut test fails and correctly flags a real help gap.

## Observations (no app code changed)
- IngestScreenModel.submitAnswer turns a 401 into the generic "Couldn't grade that answer." (no signed-out state), so a signed-out user is not told to check Settings. The test asserts the current behaviour (input kept, message shown).
- The 4xx assertions use each model's own message mapping; unknown codes fall back to "Something went wrong. Try again."
- A queued answer rejected with a 4xx is dropped (by design in PendingGradeQueue.shouldKeep); 401 and offline keep it. Covered by tests.
- No bug found in Shared models; no Shared file edited.

## Defaults taken
- "Answers" = quick-practice answer (IngestScreenModel), PendingAnswerQueue flush, and language PracticeModel.submit.
- Subject management includes SubjectManageModel and category create (SubjectCategoryModel); category rename/move/put-course were not added.
- Tests that depend on tab-shared singletons (PendingReviewCountStore.shared) filter writes by non-GET so background count refreshes do not interfere.

END-OF-REPORT
