# Manual test sequence: macOS app

Run on a Mac from Xcode, scheme `PostAnkiMac`, destination My Mac. Use a server with a few courses, due cards, pending items, learning items and sources. Order is cheapest first: launch, shortcuts, then each sidebar section, then offline and restore.

## 0. Setup
1. Copy `Local.xcconfig.example` to `Local.xcconfig` in the repo root (gitignored), set `DEVELOPMENT_TEAM`, and optionally `POSTANKI_DEV_API_URL` (dev server address).
2. `xcodegen generate`, open `PostAnkiIOS.xcodeproj`, Run.
3. One window opens. The sidebar has sections Study, Library, Learn, Manage and Admin (each collapsible); there is no Settings entry.
4. `docs/ARCHITECTURE.md` is the guide for how the app is built; the README links to it and has the steps to run the server locally.

## 1. Launch check (banner under the toolbar, non-blocking)
Run each state from a Debug build. The banner has a Settings link and a dismiss button; offline and unreachable states also show the server address.
1. No token (remove it in Settings): banner "Add your access token to load your data."; Settings opens the Settings window.
2. Wrong token (save `abc`): banner "The server rejected your access token. Check it in Settings."; sidebar entries stay usable.
3. Server down (stop the server or save an unreachable address): banner "Can't reach the server." with the address.
4. Wi-Fi off: banner "You're offline." with the address, not the signed-out text.
5. Valid token and server up: no banner.
6. Dismiss hides the banner; a different failure shows it again. Saving in Settings and reactivating the app re-run the check.
7. Dev address: in `Local.xcconfig` keep `POSTANKI_DEV_API_URL = http:/$()/localhost:3000` (write `:/$()/`, since `//` starts a comment), regenerate, Run with no saved address: Settings shows the dev address with "Using the default address." and requests go to it.
8. Settings override: save another address; Settings shows "Using the address you saved." and requests go there.
9. Use default address: enabled only with a saved address; clicking it shows "Using the default address." and the dev address returns (production when the key is empty).
10. A Release build ignores `POSTANKI_DEV_API_URL` and uses production.

## 2. Keyboard shortcuts and menus
1. Cmd-1 Home, Cmd-2 Courses, Cmd-3 Review, Cmd-4 Knowledge, Cmd-5 Progress, Cmd-6 Add knowledge switch the entry.
2. Cmd-Shift-F opens Library > Search with the cursor in the field. Cmd-Shift-L opens Learn > Learning list.
3. Cmd-N (File > New Knowledge Item) selects Add knowledge and never opens a second window.
4. Cmd-comma opens the Settings window.
5. The Go menu lists every entry grouped by section; entries without shortcut open when clicked.
6. View menu has sidebar and toolbar commands. Cmd-R reloads on every screen with a Reload button.
7. Digits 1-4 are not menu items.
8. Cmd-F puts the cursor in the search field on Knowledge, Sources, Tags, Notes, Phrase bank and Search; Cmd-Shift-F still opens Search.
9. Every Go menu entry opens its screen; no shortcut appears twice in the Go menu and none collides with Cmd-N, Cmd-R, Cmd-comma, Cmd-F, Cmd-K, Cmd-[, Cmd-] or Cmd-Shift-M.
10. Cmd-K (Edit > Command Palette...) opens a sheet with a search field. Typing "cour" or "lib" lists matching entries and group names; a loose match such as "ksrc" still finds Sources. Up and Down move the highlight, Return or a click opens the entry, Escape closes without changing the entry.
11. Help > Keyboard Shortcuts opens a separate window with General, one group per sidebar section (matching the Go menu) and Practice and review. It lists Cmd-K, Cmd-[, Cmd-], Cmd-N, Cmd-R, Cmd-F, Cmd-comma, Cmd-Shift-M and Option-Cmd-S. Reopening it raises the same window.
12. Go > Back (Cmd-[) and Forward (Cmd-]) are disabled on a fresh entry. Open an item and Cmd-[ returns to the list, Cmd-] reopens the item. Opening a different item clears forward. The toolbar back button keeps forward available.
13. Back and forward work on every entry that opens a detail: Courses, Knowledge (item, Suspended), Tags, Subjects, Knowledge maps (node, Priority, Document scan, What to learn next), Course builds, Refocus suggestions, Study sessions, Learning list, Learning paths, Challenge my thinking (History then a session is two levels) and Language practice (Phrase bank, Writing check).
14. Each entry keeps its own history: step into an item in Courses, switch to Knowledge and back, Cmd-[ still works in Courses. Screens pushed from inside Courses authoring are not in the history; Cmd-[ there pops the entry's path, not that inner screen.

## 3. Study section
Entries: Home, Review, Progress, Quick practice, Study sessions, Gaps coming back, Daily push, Language practice.

### Home
1. Today (streak, stats, top subjects), Due today with count and breakdown, Continue studying show.
2. Study now (Return) opens Review > Due today; with nothing due it reads "Nothing due" and is disabled.
3. After opening a course in Courses, Continue studying shows it; "Open in Courses" switches to Courses. Fresh install: "No course yet".
4. Cmd-R reloads.

### Review
1. Due today: the answer field is focused on each card. Type an answer, Return: the real answer shows and the field is disabled; Return again grades nothing. Return on an empty field still reveals.
2. Press 1, 2, 3, 4 after reveal: Again, Hard, Good, Easy; the next card loads focused and empty; digits never type into the field.
3. Toolbar Edit reopens the card unrevealed; Undo restores the last graded card unrevealed.
4. Pending items: approve, reject with a reason, edit, approve all, undo reject, regenerate.
5. The Review badge shows the pending count, hides at 0, and follows approve, reject and undo. Ingest new text, wait for extraction: the badge picks up new items.

### Progress
1. Streak, retention, to-mastery and coverage tiles, Coverage, Concerns, Retention (all time), Milestones show; no milestones: "No milestones yet". Cmd-R reloads.

### Quick practice
1. Opens with the answer field focused. Return submits; Return on Next continues. Shift-Return adds a line.
2. Empty queue shows an empty state.

### Study sessions
1. Table lists sessions (title, planned time, status). Plan session opens the sheet; with Start now it opens the run screen.
2. Double-click or Return on a row opens the run screen. Switch to another entry and back: the question and draft remain.
3. Cmd-R reloads. Empty and error states show.

### Gaps coming back
1. Rows offer Important, Later again, Dismiss (buttons and context menu); the row disappears after triage.
2. None left: empty state.

### Daily push
1. Answer, Cmd-Return submits; Reload loads the next one. Offline before first load shows Try again.

### Language practice
1. A single subject opens directly. Changing level or pack with unsent answers asks to discard.
2. Return in a phrase field submits; Continue after grading. Cmd-R reloads.
3. Toolbar Phrase bank: search and All/Learning/Mastered filter, right-click copies a phrase. Writing check: Cmd-Return checks.

## 4. Library section
Entries: Courses, Knowledge, Inbox, Sources, Content inbox, Tags, Search, Notes, Add knowledge, Notion import.

### Courses
1. Lists subjects and courses; Cmd-R reloads. Toolbar New course (creates, lands on the build screen) and Course builds.
2. Open a course: stats, modules, topics. Toolbar Edit course and Organize menu (Manage subjects, New course, Course builds).
3. Edit course: select a topic, Return renames; Delete key deletes after confirmation; drag reorders; Order modules works. Back: the course reloads.
4. "Practice this module" is disabled for an empty module. Select a topic, Return opens Study tools; right-click or row buttons offer Practice, Study tools, Add knowledge.
5. Exercise: field focused, Return submits, Shift-Return adds a line, Return after feedback goes to Next.
6. Chats (topic, Discuss, Ask): Return sends, Shift-Return adds a line. Topic study: Cmd-R reloads notes; add-note sheet saves with Cmd-Return.
7. Topic Quick test: 1-4 pick an option, Return submits and continues. Lecture text stays a readable column.
8. A course without topics shows "No topics yet".

### Knowledge
1. Rows show question, status and due; scrolling loads more. Search narrows; no hits shows "No matching items".
2. Subject picker and status menu filter; "Suspended" opens the suspended list (empty: "Nothing suspended").
3. Select rows: Move to Subject (Cmd-Shift-M) and Delete (toolbar or Delete key, with confirmation) work. Selecting over the limit disables both and shows the message.
4. Return or double-click opens the detail: suspend, unsuspend, bring back, generate variants; the row updates on return.

### Inbox
1. List of items to place. Approve places on a confident match, otherwise opens the review sheet; Reject removes the row.
2. Return or double-click opens the review sheet; context menu mirrors the toolbar.

### Sources
1. Table lists sources; search matches title, URL, course and subject.
2. Select link rows: Re-fetch; Delete (and Delete key) asks to confirm; context menu Open link opens the browser.

### Content inbox
1. Table of captured content; double-click shows the full text; Copy works. Cmd-R reloads.

### Tags
1. Table of tags; Return or double-click opens its topics; clicking a topic opens study with Back.
2. Context menu or toolbar "Merge into..." merges and shows the notice. No rename or delete is offered.

### Search
1. The field is focused on open; typing searches; Cmd-R reruns.
2. A result opens course, topic or subject screens inside the entry with Back.

### Notes
1. Notes search finds notes; selecting opens the note.

### Add knowledge
1. Type text, Cmd-Return submits; plain Return adds a newline; paste works.
2. "Review new items" opens the pending sheet at a usable size.
3. "Add knowledge" on a course topic opens this screen for that topic.

### Notion import
1. Form with capped width. A bad page id shows an error message; a valid one imports.

## 5. Learn section
Entries: Learning list, Learning paths, Challenge my thinking, Ask your cards, Open questions.

### Learning list
1. Empty account shows "Save a link" with capture. Drop URL text on the pane: capture opens prefilled.
2. Select "Needs your decision" rows: Approve and Decline from the toolbar or right-click apply to all selected. Return or double-click opens the item.

### Learning paths
1. Empty state offers "Start a path"; the templates sheet starts one. Open a path, Abandon.

### Challenge my thinking
1. Type a situation, Cmd-Return submits. Switch entries and back: the session remains.
2. History table: double-click opens a past session.

### Ask your cards
1. Ask a question: Return sends. Toggle general knowledge. Clear resets.

### Open questions
1. Switch Open, Answered, Dismissed. Right-click or toolbar Answer and Dismiss; Delete key dismisses.

## 6. Manage section
Entries: Subjects, Knowledge maps, Course builds, Refocus suggestions, Duplicates.

### Subjects
1. Table with indented hierarchy and Inside, Kind, Courses columns. New subject with a parent shows it indented.
2. Select two rows, Delete (toolbar or Delete key) asks once and removes both. Rename and "Merge into..." work for one selected row; merge confirmation shows moved courses.
3. Context menu Move up and Move down reorders. Return or double-click opens categories (New, Rename, Move category, per-course folder menu). Cmd-R reloads.

### Knowledge maps
1. Subject picker switches the map. Return or double-click on a node opens it; change depth saves; merge-area sheet works.
2. Toolbar Priority, Document scan, What to learn next open and show Reload (Cmd-R). Accepting a recommendation then "Open course" pushes the course with Back.
3. A subject with no map shows the empty state.

### Course builds
1. Table of builds with status; an in-progress build shows its status and refreshes on app activation or Cmd-R. Double-click opens it.
2. Toolbar New course (Cmd-Return creates in the form). Empty state offers New course.

### Refocus suggestions
1. Open course and Dismiss work as buttons and in the context menu. Empty state shows.

### Duplicates
1. Toggle Sources and Subjects. Scan asks "This uses an AI call." before running.
2. Keep or merge asks its merge confirmation; right-click rows offers the same actions.

## 7. Admin section
### Admin scans
1. Scans table and Overview (settings, stuck builds, AI calls, merges, feedback).
2. Select a row, Run scan or double-click: a paid-AI confirmation (including "changes your data") appears first.
3. A non-admin token shows the server refusal text in the result, never "Add your access token".

## 8. Settings (Cmd-comma) and token
1. A separate Settings window about 480 wide opens; the Open Settings buttons on signed-out screens open it.
2. Enter the server address and paste a token, Save: "Saved.", the field clears, "Token saved" shows. Try again loads the screen.
3. Invalid address (`example.com`, `https://x.com/path`): error shown, nothing saved.
4. Remove token: "Token removed.", "No token saved"; Keychain item `com.ikushlianski.postankiios.api` is gone.
5. No iOS-only tools section appears.
6. Connection section: Test connection with a valid token and server up shows signed in; with no token it reads reachable and no token saved; a wrong token shows the token was rejected; server down or Wi-Fi off shows can't reach or offline; none of these changes saved settings.
7. Copy diagnostics puts a report on the clipboard (paste it into any text field): app and server details plus recent failures with method, path, status and error kind. The report has no token, no query values and no request or response bodies. After a failed Test connection, the failure appears in the next copy.
8. "Show review count in the menu bar" is on by default. Turn it off: the menu bar item disappears at once. Turn it on: it returns. Quit and relaunch: the setting holds.

## 9. Offline, signed-out and empty states
Offline (Wi-Fi off or host blocked), then Try again after reconnecting:
1. Every entry's first load shows "You're offline" with Try again; no text says "pull to refresh".
2. With data on screen, a failed Cmd-R keeps the data and shows a small caption.
3. Review > Due today: grade a card: no crash, "Saved offline" notice; reconnect and reactivate: queued grades flush. Exercise answers queue and flush the same way.
4. Add knowledge offline: the text stays and the message says you are offline.

Signed out (no token or an invalid one):
1. Every entry shows "Add your access token" with Open Settings and Try again; after saving a token, Try again loads.

Empty states: Courses "No courses yet", Knowledge "No approved items yet", Pending "Nothing to review", Suspended "Nothing suspended", each with a next step.

## 10. Window, sidebar and appearance
1. Resize and move the window, collapse a sidebar section, pick Add knowledge, Cmd-Q, relaunch: same size, position, collapsed sections and entry.
2. Repeat with System Settings > "Close windows when quitting an app" on.
3. The window cannot shrink below 760x520.
4. Dock and Finder show the card icon; `PostAnkiMac.app/Contents/Resources` has `Assets.car` and `AppIcon.icns`.
5. Buttons and selection use the accent colour in light and dark mode.

### Menu bar review item
1. With the setting on, the menu bar shows the pending review count and updates as pending items change.
2. Its menu has "Review (n due)" and Quit. Close the main window, click Review: the app activates, the window opens and Review is selected. With the window open on another entry, Review raises it and switches the entry.
3. Quit in the menu quits the app.

### Reload after being away
1. Switch to another app for more than 5 minutes, come back: the visible screen reloads (change data on the server first to see it).
2. Away under 5 minutes: no reload.
3. With unsent text in a focused field (an answer), returning after 5 minutes does not reload and the text stays.

### Unsent drafts
1. Type, without sending, in Ask your cards, Writing check, Quick practice and Challenge my thinking; switch to another entry and back: each text is restored.
2. Send or check successfully: coming back later shows an empty field (Writing check keeps showing its text until you leave). A failed send or check keeps the text.
3. Quit and relaunch: drafts are gone (never saved to disk).
4. Save a different server address in Settings: drafts typed against the old server are gone. Save only a new token, or the same address: drafts stay.

## 11. iOS regression
Run scheme `PostAnkiIOS` on a simulator: Home, due review, courses, Progress, knowledge list, pending review, learning and settings behave as before; pull to refresh works and its offline text still says "Pull to refresh".
