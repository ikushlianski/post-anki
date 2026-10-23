# Waves 3 and 4: sidebar wiring, menu commands, Settings window

## Wave 3
- MacSidebarItem: Home, Courses, Review, Knowledge, Progress, Ingest; fallback Home (default entry).
- MacRootView: detail cases for MacHomeView (Study now selects Review, which opens on Due today; Open in Courses selects Courses), MacKnowledgeView, MacProgressView.
- Build gate: PostAnkiMac (macOS) and PostAnkiIOS (simulator) BUILD SUCCEEDED.

## Wave 4
- Settings case removed from the sidebar; `Settings { SettingsScreen().frame(width: 480) }` scene added; root passes `openSettings()` to Review. A stored "settings" selection falls back to Home.
- New MacCommands.swift: SidebarCommands, ToolbarCommands, File > New Knowledge Item (Cmd-N, selects Ingest, replaces .newItem), Go menu Cmd-1..6 writing the AppStorage key (key equivalents from MacSidebarItem.shortcutKey).
- README shortcut list added. xcodegen run once. Both builds BUILD SUCCEEDED.

## Defaults
- Go menu order and digits follow the sidebar order (Home 1 ... Ingest 6).
- Settings width 480, height left to content.
- Sidebar symbols: house, brain, chart.line.uptrend.xyaxis.
- Not run: GUI checks (menus, Settings window, Cmd-comma). Wave 5 not started.

END-OF-REPORT
