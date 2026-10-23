# Mac app and API-gap third review

Scope: every ticked Coding task in `.planning/todo.md` (macos-app direction and the API-gap iOS features). Findings already listed in review-report.md and review2-report.md are not repeated. Server repo read only.

Checks run here:
- `swift test --package-path Packages/PostAnkiAPI`: 45 tests passed (Fact).
- `xcodebuild test` on the PostAnkiMac scheme (derived data in the scratchpad, signing off): 80 tests in 13 suites passed (Fact).
- The built app was not launched in this pass. The launch item relies on its own report (Assumption).

No Critical findings. No source file is over 300 lines; the largest is the shared due-review model at 296.

## Findings (symptom, part, mechanism, fix)

F1. Medium, security. Tapping a citation, lecture source or learning-list link can open any URL scheme, not only web pages.
- Part: shared lecture, study material and lecture source sections; Mac learning list and Mac sources context menus.
- Mechanism: the app turns server strings straight into links and opens them. The server schemas for lecture citations, study material citations and learning-list URLs are plain `z.string()` with no scheme check (Fact: post-anki `packages/shared/src/lecture.ts:31,52`, `study-material.ts:13`, `learning-list.ts:118`). Those strings come from AI research and web fetches, which are untrusted.
- Fix: open http and https links only, and show anything else as plain text.

F2. Medium. On the Mac, grades and answers queued offline may wait until the user opens Home, Review or an exercise again, and the "N grades waiting to send" caption stays stale after they are sent.
- Part: Mac app root and the due-review screen.
- Mechanism: the Mac flushes both queues only in `onChange(of: scenePhase)` at app level (Fact). Assumption: on macOS the scene phase barely changes when the app loses or regains focus, and `onChange` does not fire for the first value, so this hook rarely runs. Nothing watches the network either (Fact). The Mac due-review view has no flush hook (the iPhone screen has one), and a successful reload never refreshes the pending count (Fact).
- Fix: flush when the app becomes active (the launch check already uses that notification) and when the network comes back, then refresh the pending count.

F3. Medium. Leaving a screen while it loads, or pushing a screen over it, can leave a false "You appear to be offline" error. On Mac list screens it can also leave a generic failure state.
- Part: about 16 shared screen models: learning list, learning paths, subject categories, domain recommendation, mapping, priority and document scan, daily push, tags, course build, course edit, global search, study sessions, source library, decide and resurfacing gaps.
- Mechanism: these models catch only `CancellationError`. URLSession throws `URLError(.cancelled)` instead, and the shared message helper maps any URLError, cancelled included, to "offline" (Fact). Review 2 fixed this in the ten files it listed. The rest still use the old pattern.
- Fix: put one cancellation check in the shared error helpers so every model inherits it. Do not patch the models one at a time.

F4. Medium. After pasting a token in Settings (Cmd-comma), the open screen still says "Add your access token", and the Review badge stays wrong until the user clicks Try again or switches apps.
- Part: Mac Settings, root window and the pending-count store.
- Mechanism: only the launch banner listens for the settings-saved notification (Fact). Screen models and the badge store reload only when the app becomes active, and the Settings window is part of the same app, so that never fires.
- Fix: when settings are saved, reload the detail screen by giving it a new identity and refresh the badge. Clear app-wide stores that hold data from the old server (decide and study-session runs).

F5. Medium, cost. Switching away from Language practice and back throws away the current phrase batch and generates a new one, which is a paid AI call. It also skips the "Discard this batch?" confirmation.
- Part: Mac sidebar detail and the practice model.
- Mechanism: each sidebar switch rebuilds the screen, and its model lives in view state. `start()` creates a batch whenever `phrases` is empty (Fact). Decide sessions and study-session runs already avoid this with app-wide stores; language practice does not.
- Fix: keep practice models per subject in an app-wide store, as the decide and study-session stores do.

F6. Medium, untested guarantee. Nothing tests the trickiest promise in scheduled review: grades saved offline are sent exactly once, and undo works while a grade is queued, in flight or unconfirmed.
- Part: the pending-grade queue and the due-review model.
- Mechanism: the tests cover only file quarantine and 429/400 handling for answers (Fact: the crash-guard smoke tests). There is no test for `flush`, `remove(requestId:)`, `cancelledSendOutcome` or `DueReviewModel.grade/undo`.
- Fix: add fake-server tests for these cases: grade offline then flush, undo before send, undo while in flight, undo after an unconfirmed send, and a 4xx drop.

F7. Medium, UX. The Mac Home "Continue studying" button opens the Courses list, not the course. The Home item promised the latest topic.
- Part: Mac Home and the Mac Courses navigation stack.
- Mechanism: the Courses stack has no path binding, so Home can only switch the sidebar (Fact).
- Fix: give the Courses stack a path the navigator can set, and push the last-studied course.

F8. Low. Long knowledge-item, topic or ask chats stop working after about 100 exchanges, with a misleading "Couldn't reach the tutor".
- Mechanism: the app sends the whole transcript. The server rejects more than 200 messages and uses only the last 12 (Fact: post-anki `packages/shared/src/study-chat.ts:8,11,20`). The knowledge-item chat also maps 401 and 404 to "Couldn't reach the tutor".
- Fix: send only the most recent turns, and use the shared error messages.

F9. Low, cost. A queued offline answer whose grading keeps failing with 502 (an AI failure) is retried on every flush, forever.
- Mechanism: the answer queue keeps anything with status 500 or higher and has no attempt count or age limit (Fact). Each retry is a paid grading call.
- Fix: stop after a few attempts or a few days.

F10. Low. Switching the server address (for example, a Debug build's localhost default to production) sends queued grades to the wrong server, where a 404 drops them silently. Home also points at a course id from the other server.
- Mechanism: the offline grade queue, cached question variants and last-studied course are not tied to the server address (Fact).
- Fix: store the server address with each record, and skip or clear records that belong to a different server.

F11. Low, destructive edge. On the Mac Knowledge screen, Delete and Move act on selected items that the status filter currently hides.
- Mechanism: the selection is pruned on reload but not when the client-side status filter changes (Fact). The dialog shows the count, which reduces the risk.
- Fix: limit bulk actions to the intersection of the selection and the visible items.

F12. Low. Mac Quick practice: after feedback appears, Return does nothing, because the answer field swallows it. The empty state says "Nothing to confirm", which is copy from the inbox.
- Fix: let Return trigger Next when feedback is showing, and reword the empty state.

F13. Low. Rejecting or approving a large inbox selection on the Mac fires one request per item, all at once.
- Mechanism: the concurrency helper starts a task per item with no limit (Fact). Assumption: 200 parallel PATCH requests can hit the server's rate limit.
- Fix: cap parallel requests at a small number.

F14. Low, security hardening (Assumption). A server redirect could carry the bearer token to another host or to plain http.
- Mechanism: requests use the default shared session, which follows redirects. Whether URLSession keeps the Authorization header across a cross-host redirect was not verified.
- Fix: use a session delegate that refuses redirects that change host or downgrade from https.

F15. Low, duplication. The percent-encoding rule is written out 22 times across the API package. About 48 request paths put ids in without encoding. ISO date parsing is written in 7 places.
- Fix: route every path and query through one shared builder, and keep one date parser.

F16. Low, duplication. The Mac and iPhone due-review card bodies are about 80 near-identical lines (prompt, answer, background, grade buttons, error with retry, counters). They already differ in where the error shows.
- Fix: share one card body and keep only the input differences per platform: the typed answer on the Mac, the Show answer button on the iPhone.

F17. Low. Every request reads the token from the keychain.
- Assumption: on ad-hoc-signed Mac builds this can raise a separate keychain prompt for each request that runs at the same time.
- Fix: cache the token in memory, and refresh it on save and remove.

## Per-item verdicts: macos-app

1. VoiceOver labels and minimum window sizes: PASS. Every icon-only button checked has an accessibility label and help text.
2. Review the files the first review skipped: PASS. Review 2 findings are fixed.
3. Reload with Cmd-R on review screens; keep unreadable answer queue: PASS. Unreadable files are set aside, never overwritten. They are never shown to the user, which is acceptable.
4. Sidebar jump, refresh and search-focus shortcuts: PASS. The registry validates duplicate and reserved shortcuts.
5. Mac smoke tests for practice, study modes, authoring, structure and language: PASS (80 tests green).
6. Whole-app crash and unhandled-error review: NEEDS-CHANGES (F3; the cancellation fix is still partial).
7. Launch the built app: PASS. Based on its report; not re-run here.
8. Swift models against server schemas: PASS. Spot-checked review cards, record review, knowledge overview, bulk delete and move, chat input and Notion import, all of which match. See F1 for the unconstrained URL strings.
9. Sidebar sections from per-group registry files: PASS.
10. iOS screens moved into shared code: PASS.
11. Mac topic study and practice: PASS (F12 minor).
12. Mac study modes: PASS.
13. Mac library: NEEDS-CHANGES (F1 sources links, F13).
14. Mac learning tools: NEEDS-CHANGES (F1 learning-list links).
15. Mac course building and editing: PASS.
16. Mac subjects, categories and knowledge maps: PASS.
17. Mac language practice, duplicates and admin: NEEDS-CHANGES (F5).
18. Mac smoke tests with a fake server (Cmd-U): PASS. The scheme wires up the tests, and the fake server isolates requests.
19. Dev server address and launch check: PASS. The Debug-only fallback works, and the classification covers offline, unreachable, signed-out and server error.
20. README and run script: PASS.
21. Manual test sequence: PASS.
22. Mac settings for address and token: NEEDS-CHANGES (F4).
23. macOS target: PASS. It is sandboxed with outgoing network only, and http to localhost is accepted.
24. Shared API package: PASS (F15 duplication).
25. Mac Home: NEEDS-CHANGES (F7).
26. Knowledge browser: NEEDS-CHANGES (F11, low).
27. Progress: PASS.
28. Menu commands and Settings window: PASS.
29. Review badge: NEEDS-CHANGES (F4; not refreshed after a token change).
30. Empty, offline and signed-out states: NEEDS-CHANGES (F3).
31. Remember sidebar entry and window size: PASS.
32. App icon and accent: PASS.
33. API package decoding tests: PASS (45 green).

## Per-item verdicts: API-gap and earlier iOS items

- Add knowledge anywhere: PASS.
- Pending review approve and reject: PASS.
- Scheduled review: NEEDS-CHANGES (F2 on the Mac, F6).
- Knowledge-item chat field name: PASS. `text` matches the server's chat message schema. See F8.
- Offline question cache fixes (discuss reload, cancelled vs offline, double Next): PASS.
- Server address and token in secure storage: PASS (F14 and F17 are hardening).
- Study now on Home (iPhone): PASS.
- Cache question variants offline: PASS (F10).
- Queue offline answers: NEEDS-CHANGES (F2, F9).
- Refine a knowledge item by chat: PASS (F8).
- Scaffold items (course list, latest course, confirm bits, pull to refresh, deck exercise, dictation ingest, auto-detect, inbox with gestures, auto-assign deck): PASS on spot check, not re-reviewed in depth.
- Feature screens (progress, knowledge management, ask/notes/open questions, probe and socratic, study sessions, lectures, gaps, learning list and paths, decide, language practice, tags, search, daily push, source library, subjects, course building, module editing, domain maps, duplicates, Notion import, regeneration, admin): PASS overall, except F1 (lecture and study-material links) and F3 (models that still mis-handle cancellation).

## Facts, assumptions, to verify
- Facts: everything cited above with file or schema references, plus both test runs.
- Assumptions: macOS scene-phase behaviour (F2), rate limiting under unbounded parallel requests (F13), Authorization header surviving redirects (F14), keychain prompts per request (F17).
- To verify: run the Mac app, put it in the background and bring it back while offline grades are queued, and confirm whether they are sent (F2).

END-OF-REPORT
