# Wave 2c report: Mac library and capture

Diff: `git diff --cached -M -- Sources/PostAnkiMac/Library Sources/PostAnkiMac/Features/MacLibraryFeatures.swift Sources/Shared/GlobalSearchScreen.swift Sources/Shared/KnowledgeItemInboxScreen.swift`

## Checks
- Private project via `xcodegen generate -p /private/tmp/xc-2c` (decision 13 works; regenerate after siblings add files). Build with `-derivedDataPath /private/tmp/dd-2c`.
- PostAnkiMac (platform=macOS): BUILD SUCCEEDED, no new warnings. PostAnkiIOS (generic iOS Simulator): BUILD SUCCEEDED.
- `swift test --package-path Packages/PostAnkiAPI`: 34 tests passed.
- No tsc, vitest or lint run: this is a Swift repo (no package.json, no swiftlint config). No GUI click-through.

## What changed
- `MacLibraryFeatures` now lists Inbox (30), Sources (40), Content inbox (50), Tags (60), Search (70, Cmd-Shift-F), Notes (80), Notion import (100) in the Library section. Add knowledge stays at 90.
- New `Sources/PostAnkiMac/Library/`: `MacInboxView` (list, Approve/Reject/Review in toolbar and context menu, Return or double-click opens the review sheet), `MacSourcesView` (Table, re-fetch, delete with confirmation, Delete key, Open link via openURL, search), `MacContentInboxView` (Table, full-text sheet, copy), `MacTagsView` (Table, open tag detail in the stack, merge via context menu and toolbar), `MacNotionImportView` (shared screen with grouped form, capped width), `MacLibrarySupport` (error banner, Reload button, concurrent batch helper).
- Shared: `GlobalSearchScreen` on macOS uses an inline field focused on appear plus Cmd-R rerun (iOS keeps `.searchable`); `KnowledgeItemDetailSheet` is no longer `private` so the Mac inbox reuses it. Notes uses `NotesSearchScreen` unchanged.
- Search results push curriculum/topic/subject screens inside the root stack around the entry (decision 6).

## Defaults taken
- Tag rename and delete are not offered: the API package has no such calls (decision 9: reported, not patched). Only Merge is in the context menu.
- Notion import has no external URLs in its model/screen, so no `openURL` there; `openURL` is used for "Open link" on link sources.
- Inbox has no Delete-key action: reject is not a delete call.
- Load failures render `MacLoadStateView(.other)` with the screen's own message (models expose strings, not failure kinds).
- Reload (Cmd-R) added to Inbox, Sources, Content inbox, Tags, Search; Notes and Notion import have nothing to reload.
- Search focus is only on appear; re-selecting the already selected entry does not refocus.
- Sources Table is flat (no group headers); search still matches title, URL, course, subject.
- Nothing committed, no todos ticked, `PostAnkiIOS.xcodeproj` not touched.

## Manual checks for W4d
- Library lists the 7 new entries in order; Cmd-Shift-F opens Search with the cursor in the field; typing and Cmd-R search.
- Sources: select link rows, Re-fetch and Delete (confirm), Delete key, context menu Open link.
- Tags: Return or double-click opens topics; clicking a topic pushes the study screen with Back; Merge into... sheet merges and shows the notice.
- Inbox: Approve auto-places on a confident match, otherwise opens the sheet; Reject removes the row.
- Content inbox: double-click shows full text; Notion import with a bad id shows the error text.

END-OF-REPORT
