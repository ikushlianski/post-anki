# Wave 5 Mac smoke tests

## Added (all under Tests/PostAnkiMacSmokeTests)
Five suites reusing FakeServer and the `SmokeTests` parent. Each model gets a loaded test plus a 401 signed-out test and a dropped-connection offline test (27 new tests; 52 total pass).

- PracticeSmokeTests: IngestScreenModel (quick practice queue).
- StudyModesSmokeTests: StudySessionsModel (buckets upcoming/in progress/missed/done, completion rate, course names), ResurfacingGapsModel.
- AuthoringSmokeTests: CourseBuildListModel (confirmed courses hidden), CourseRefocusModel (dismissed hidden).
- StructureSmokeTests: SubjectManageModel, DomainMapModel (including 404 gives an empty map, not an error).
- LanguageSmokeTests: PracticeSubjectsModel, PracticeModel (settings then phrase batch; no batch request after a 401), PhraseBankModel, DuplicateReviewModel (removed source labelled "(removed)").

Fixtures added: next-question-variants, gaps-due-for-resurface, study-sessions, study-session-consistency, course-builds, course-refocus-suggestions, domain-map, practice-settings, phrase-batch, phrase-bank, subject-duplicate-suggestions, source-duplicate-suggestions. Existing `subjects`, `curricula` and `library-sources` fixtures are reused.

## Checks
- Private copy /private/tmp/w5t, xcodegen run there only, `xcodebuild test` scheme PostAnkiMac, derived data /private/tmp/dd-5t: 52 tests in 9 suites passed.
- tsc/vitest/lint do not apply (Swift repo; no SwiftLint config or binary).
- Diff: `git diff --cached --stat -- Tests/PostAnkiMacSmokeTests`

## Defaults taken
- Models without a failure kind (study sessions, resurfacing gaps, subjects, knowledge maps) are asserted on their exact error message text; models with one on `failureKind`.
- The practice subject is decoded from a JSON literal because PracticeSubject has no public initializer.
- Write actions (triage, merge, scans) not covered; the todo scoped loading models.

END-OF-REPORT
