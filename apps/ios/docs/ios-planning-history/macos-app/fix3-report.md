# Fix round 3 (review2 findings 1, 2, 3, 5, 7, partial 6)

Diff: `git diff --cached` (my files are staged; sibling files are unstaged).

Fixed
- 1: DomainMapModel.load() re-runs until the loaded subject equals the current subjectId and drops stale results, so a switch during a load shows the right map.
- 2: MacKnowledgeMapsView shows MacLoadStateView when the tree is empty and an error is set.
- 3: PracticeModel.loadSettings() clears the old error; start() generates a batch when phrases are empty (so retry after failure or a cancelled batch works); cancellation is silent.
- 5: error banner added to MacLanguagePracticeView, MacPhraseBankView (once bank exists), MacAdminView overview (banner only), MacRefocusView list.
- 6 (my files only): `catch where ProgressLoadError.from(error) == nil` in DomainMapModel, PracticeModel, WritingCheckModel (history and check), PhraseBankScreen, PracticeSubjectsScreen.
- 7: WritingCheckModel.loadHistory() clears the error; new retry() resubmits a failed check, else reloads history; MacWritingCheckView "Try again" calls retry().

Tests: Tests/PostAnkiMacSmokeTests/ReviewFixes2SmokeTests.swift (subject switch during load, practice retry, silent cancellation for practice/phrase bank, writing error cleared on reload).

Checks: tsc and repo lint are not applicable (Swift project, no lint config). iOS scheme build succeeded; Mac scheme build and tests succeeded (80 tests passed, including the sibling's current files). Built from a symlinked spec copy at /private/tmp/r2a-spec (xcodegen with absolute paths hung), derived data /private/tmp/dd-r2a.

Defaults: MacRefocusView error shown as a plain red caption row (no banner view, since it is a List); phrase-bank banner hidden while the bank is nil to avoid doubling the full-screen error. The writing-check cancel test uses retry() with a cancelled reply rather than a decode fixture.

END-OF-REPORT
