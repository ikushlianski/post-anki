# Batch 3C report: domain maps, duplicate review, admin tools

Built in order: domain-maps, duplicate-review, admin-tools. Settings > Tools (hub `SettingsToolsSection.swift`) has rows Knowledge maps, Refocus suggestions, Duplicates, Admin.

## Verification
- `xcodegen generate` then simulator `xcodebuild` (unsigned): BUILD SUCCEEDED, run after domain-maps and again after all three.
- No test target exists, so no tests; manual sequences are in each folder.

## Shared file edits
- `Sources/PostAnkiIOS/SettingsScreen.swift`: one line `SettingsToolsSection()` after the Save/Remove section (re-read first). No batch A or B files touched.

## Open item resolved
Admin scan paths were copied from `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/router-table.ts` (read-only): embedding-scan, tagging-scan, placement-scan, question-generation-scan, fill-blank-generation-scan, basic-card-generation-scan under `/knowledge-bits/`, plus `/knowledge-bits/question-variants/embedding-scan`; all POST.

## Defaults
- Plans' file layout kept, except triage screens (priority, doc scan, recommendations, mappings, refocus) hold their small models in the same file as the screen.
- Doc-scan, priority-run, mapping-suggest and recommendation-run responses are ignored (decoded as empty); lists reload after.
- Recommendations list is filtered to pending on the client.
- Duplicates toolbar Scan runs the scan for the visible tab (Subjects or Sources).
- Admin scan summary shows top-level numeric/boolean fields as "name value".
- Refocus "Open course" looks the course up in `listCurricula()`; failure shows "Couldn't open this course."
- Menu entries on the map screen are NavigationLinks inside a toolbar Menu.
- Generated `.xcodeproj` is gitignored; not staged.

## Files
Plans' folders: `.planning/domain-maps/`, `.planning/duplicate-review/`, `.planning/admin-tools/` (report.md and manual-test-sequence.md each). New Swift files are under `Sources/PostAnkiIOS/` and `Sources/PostAnkiIOS/API/` with prefixes Domain*, DocScan*, CourseRefocus*, SettingsTools*, DuplicateReview*, SubjectDuplicate*, SourceDuplicate*, Admin*.

END-OF-REPORT
