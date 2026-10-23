# Wave 3c report: language practice, duplicates, admin

Diff: `git diff --cached -- Sources/PostAnkiMac/LanguageAdmin Sources/PostAnkiMac/Features/MacLanguageFeatures.swift Sources/PostAnkiMac/Features/MacAdminFeatures.swift Sources/Shared/{AdminModel,AdminScreen,DuplicateReviewModel,PhraseBankScreen,PhraseCardView,PracticeModel,PracticeSubjectsScreen,SourceDuplicateList,SubjectDuplicateList}.swift`. Only 3c files are staged.

## Checks
- Private project via `xcodegen generate -s project.yml -p /private/tmp/xc-3c` (decision 13), derived data /private/tmp/dd-3c; nothing generated in the repo.
- PostAnkiMac (generic macOS): BUILD SUCCEEDED, no new warnings. PostAnkiIOS (iOS Simulator): BUILD SUCCEEDED.
- Not run: `swift test` (package untouched), tsc/vitest/lint (Swift repo, no swiftlint installed), GUI.

## What changed
- Entries: Language practice (Study, order 70), Duplicates (Manage, order 50, in MacAdminFeatures), Admin scans (Admin, order 10).
- New `Sources/PostAnkiMac/LanguageAdmin/`: `MacLanguagePracticeView` (subject list, auto-opens a single subject like iOS) and `MacPracticeView` (levels/pack, discard alert, Return submits, Reload Cmd-R, toolbar links to phrase bank and writing check); `MacPhraseBankView` (`Table`, search field, All/Learning/Mastered); `MacWritingCheckView` (Cmd-Return checks); `MacDuplicatesView` (segmented sources/subjects, Scan with the original "This uses an AI call." confirm); `MacAdminView` (segmented Scans/Overview; scans `Table` with Run button, context menu, double-click, original paid-AI confirm text incl. "changes your data"; overview reuses shared sections).
- Shared (iOS behaviour unchanged): `failureKind` on practice, subjects, phrase bank and duplicate models; `PhraseCardView.onSubmit` (macOS uses a single-line field so Return submits); `AdminScreen` sections extracted to `AdminOverviewSections`; `AdminModel.forbiddenDetail` and `AdminScansModel.refusals`; macOS-only context menus on duplicate rows.

## Defaults taken
- Duplicates entry lives in MacAdminFeatures (the only file of mine in addition to Language); registry orders chosen to sit after Daily push and in Manage.
- Admin entry shows both scans table and the overview (settings, stuck builds, AI calls, merges, feedback) as two panes, since decision 4 has one Admin entry.
- 403 on admin load shows the "other" state with "The server refused this request: <code>."; a refused scan shows that text in the Result column, never signed out.
- Duplicates default to Sources tab (iOS defaults to Subjects).
- Phrase bank copy-phrase context menu added (no server action exists for entries); no drag/drop.
- First-answer focus not forced; Return in a phrase field submits the whole chunk (guarded by canSubmit).

## Manual checks (for W4d)
- Language practice: single subject opens directly; level/pack change with unsent answers asks to discard; Return in a phrase field submits; Continue after grading; Phrase bank search and scope filter; writing check Cmd-Return.
- Duplicates: toggle Sources/Subjects, Scan asks confirm; keep/merge keeps its merge confirm; right-click rows.
- Admin scans: select row, Run scan or double-click, confirm dialog appears; non-admin token shows server refusal text, not "Add your access token".
- Offline / signed out: each entry shows load-state view before first load.

END-OF-REPORT
