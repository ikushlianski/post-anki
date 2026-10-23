# Wave 0 report: grouped sidebar and feature registry

Diff: `git diff --cached -M -- Sources/PostAnkiMac`

## Checks
- `xcodegen generate` once: ok.
- PostAnkiMac (platform=macOS, CODE_SIGNING_ALLOWED=NO): BUILD SUCCEEDED, no new warnings.
- PostAnkiIOS (generic iOS Simulator): BUILD SUCCEEDED (iOS untouched).
- `swift test --package-path Packages/PostAnkiAPI`: 34 tests passed.
- Debug app launched and stayed running for 4 s, so the launch assertions passed. No GUI click-through was done.

## What changed
- New `Sources/PostAnkiMac/Navigation/`: `MacFeature` (entry type, section enum, shortcut), `MacFeatureRegistry` (aggregator, sorting, fallback, Debug validation), `MacNavigator` (writes the stored selection, environment value), `MacFeatureDetailView` (stack wrapper, reset per entry via `.id`).
- New `Sources/PostAnkiMac/Features/`: nine group files; `MacCoreFeatures` holds the six existing entries, the other eight are empty lists.
- `MacRootView` and `MacCommands` rewritten from the registry; `MacSidebarItem.swift` deleted.
- Collapse state: AppStorage `mac.sidebarCollapsedSections` (comma-separated section ids). Selection key `mac.sidebarSelection` and raw values (home, courses, review, knowledge, progress, ingest) unchanged.
- Debug assertion (called from `MacRootView.init`): unique ids, unique shortcuts, none reserved (Cmd-N, Cmd-R, Cmd-comma, Cmd-Shift-M, Cmd-Option-S), Home exists, unknown id resolves to Home.

## Defaults taken
- Ingest entry is retitled "Add knowledge" and sits in Library (plan decision 4); id and Cmd-6 unchanged.
- Entries sit in plan sections: Study = Home, Review, Progress; Library = Courses, Knowledge, Add knowledge. Orders are spaced by 10 (Progress 80, Add knowledge 90) to leave room for later waves.
- Go menu now lists by section, so item order differs from the old flat list; shortcuts are the same.
- Home, Review, Progress and Add knowledge are wrapped in a NavigationStack by the root; Courses and Knowledge own stacks and opt out.
- Navigator is a main-actor singleton writing UserDefaults (AppStorage observes it); Cmd-N and Home callbacks use it. Detail builder returns AnyView.
- `PostAnkiIOS.xcodeproj` is generated and not staged.
- No todos ticked, nothing committed.

END-OF-REPORT
