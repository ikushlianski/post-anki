# Wave 2b: Mac knowledge browser

Diff: `git diff --cached -- Sources/Shared/Knowledge* Sources/Shared/MoreVariantsSection.swift Sources/Shared/SuspendedKnowledgeScreen.swift Sources/PostAnkiIOS/KnowledgeListScreen.swift Sources/PostAnkiMac/MacKnowledgeView.swift`

Changes
- git mv to Sources/Shared: KnowledgeListModel, KnowledgeListModel+Bulk, KnowledgeItemDetailScreen, MoreVariantsSection, SuspendedKnowledgeScreen; `navigationBarTitleDisplayMode` guarded with `#if os(iOS)`.
- New Sources/Shared/KnowledgeMoveSheet.swift (moved out of the iOS list screen, now internal, guarded, Mac min frame 320x360). iOS KnowledgeListScreen otherwise unchanged.
- New Sources/PostAnkiMac/MacKnowledgeView.swift: multi-select List bound to model.selection, subject picker, status menu (Suspended opens the shared suspended screen), .searchable, load-more on last row, Return/double-click opens shared detail (suspend/unsuspend/bring back, more variants), Delete key and toolbar Delete with confirmation, Move to Subject (Cmd-Shift-M, also context menu), Reload Cmd-R, over-limit message, model failure/notice captions, empty and error states.
- Not touched: MacRootView, MacSidebarItem, PostAnkiMacApp, project.yml (Wave 3 wires the sidebar; the view is not reachable yet).

Checks
- xcodegen generate run once (files moved/added).
- PostAnkiMac macOS build (/tmp/dd-kb): BUILD SUCCEEDED.
- PostAnkiIOS simulator build (/tmp/dd-kb-ios): BUILD SUCCEEDED.
- tsc/vitest/lint: not applicable (Swift repo). Not exercised in a running app.

Defaults
- Row view is private in MacKnowledgeView (duplicated from iOS private row) since the plan lists no Shared row file.
- Detail opens via navigationDestination(item:) inside the view's own NavigationStack.
- Selection-too-large shows an orange inline caption and disables bulk buttons.
- Accidentally staged siblings' files with `git add Sources`; unstaged them again (working tree untouched).

END-OF-REPORT
