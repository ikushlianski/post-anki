# Wave 3b report: Mac subjects and knowledge maps

Diff: `git diff --cached -M -- Sources/PostAnkiMac/Structure Sources/PostAnkiMac/Features/MacStructureFeatures.swift Sources/Shared/DomainPriorityScreen.swift Sources/Shared/DocScanScreen.swift Sources/Shared/DomainRecommendationScreen.swift Sources/Shared/SubjectCategoryScreen.swift Sources/Shared/DomainNodeScreen.swift`

## Checks
- Private project `xcodegen generate -p /private/tmp/xc-3b` (decision 13 works), derived data `/private/tmp/dd-3b`.
- PostAnkiMac (platform=macOS): BUILD SUCCEEDED, no new warnings. PostAnkiIOS (iOS Simulator): BUILD SUCCEEDED.
- `swift test --package-path Packages/PostAnkiAPI`: 34 passed. tsc/vitest/lint not applicable (Swift repo, no package.json). No GUI click-through.

## What changed
- `MacStructureFeatures`: Manage section, Subjects (order 10) and Knowledge maps (order 20).
- New `Sources/PostAnkiMac/Structure/`: `MacSubjectsView` (Table with multi-select, indented hierarchy, Inside/Kind/Courses columns; toolbar New, Rename, Merge into, Delete, Reload Cmd-R; context menu Open categories, Rename, Merge, Move up/down, Delete; Delete key; Return/double-click opens categories), `MacKnowledgeMapsView` (subject picker in toolbar, outline list of the domain map, Return/double-click or context menu opens the node; toolbar buttons for priority suggestions, document scan, what to learn next; Reload Cmd-R).
- Shared (macOS-only additions): Cmd-R Reload toolbar in `DomainPriorityScreen`, `DocScanScreen`, `DomainRecommendationScreen`, `SubjectCategoryScreen`; `.macSheetMinSize()` on sheets in `DomainNodeScreen`, `SubjectCategoryScreen`. iOS behaviour unchanged.
- Recommendations still push `CurriculumDetailScreen` inside the same stack (unchanged shared code).

## Defaults taken
- Merge is enabled for exactly one selected subject (the iOS sheet takes one source); candidates are the same-kind subjects, as on iOS.
- Multi-delete runs sequentially (the model's busy guard drops concurrent calls), one confirmation for the whole selection.
- Table cannot drag-reorder, so reorder is Move up / Move down in the context menu using the existing reorder call.
- Knowledge map is a tree, so it is a `List` outline rather than a `Table`.
- Tools menu replaced by toolbar buttons (NavigationLink inside a toolbar Menu is unreliable on macOS).
- Category screen is the shared iOS screen reused as is (List with sections, course category menu); no Table there.
- `onChange` callback of `SubjectManageScreen` not used (it only refreshes the iOS Courses tab); `SubjectManageScreen` itself stays unwired on the Mac.
- `DomainMapError` is in the API package (`DomainMapModels.swift`), left untouched.
- Load failures show `MacLoadStateView(.other)` with the model message.
- Nothing committed, no todos ticked, repo `PostAnkiIOS.xcodeproj` not touched.

## Manual checks for W4d
- Manage lists Subjects and Knowledge maps. Subjects: select two rows, Delete asks once and removes both; select one, Merge into... lists same-kind subjects, confirm shows moved-courses notice; New subject with a parent shows it indented; Move up/down changes order; Return opens categories, where New/Rename/Move category and the per-course folder menu work.
- Knowledge maps: switch subject, Return on a node opens it, change depth saves, merge area sheet works; toolbar Priority, Document scan, What to learn next open; accepting a recommendation then "Open course" pushes the course inside the stack with Back.
- A subject with no map shows the empty state.

END-OF-REPORT
