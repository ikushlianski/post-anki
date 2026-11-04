# Manual testing: useful-new-features

Setup: API on dev DB with migrations 0130-0134 applied; bot migration 0002 applied in the bot DB; web dev server; iOS simulator `PostAnkiIOSDev` (Mac target is not testable, unrelated build break). Have several cards in Chat queue, some waiting over 14 days (backdate `chat_at`), a few rejected cards with different reasons.

Web, Chat queue (`/knowledge/chat`)
1. `j`/`k` move, `Enter` opens, `x` selects, `i` moves the highlighted card to Inbox without clearing the other selected cards, `s` snoozes it for 1 day (no-op on a snoozed card). `?` lists all keys.
2. "Select N waiting over 14 days" appears only when such cards exist; click selects them; bulk move to Inbox runs.
3. Sort toggle oldest/newest; reload the page, choice is remembered. Header shows "Oldest card has waited N days" (unsnoozed cards only, hidden under 1 day).
4. Search box finds a phrase inside a message; result opens that thread.
5. Open a thread: header shows "From <title>" (link only for http/https source). Retry answer drops the last reply and asks again; a typed draft keeps the retried question above it.
6. Triage (`/knowledge-bit-review`): `c` sends the card to Chat, `i` to Inbox.

Web, Rejected (`/knowledge/rejected`)
7. Filter by reason and subject (iPhone Rejected list too); each reason shows a card count (counts ignore the selected reason). Select up to 3 and bulk restore; single restore returns the card to pending.
8. Rows show the source title. iPhone Rejected has a search box (debounced; empty result says no rejected cards match).

Web, review
9. Finish a subject review: the done screen shows the subject's study forecast and one server streak (no second local streak). A failed forecast request leaves the done screen intact.

iPhone
10. Chat list: swipe Inbox (row leaves, count drops; double tap shows no red error); swipe Snooze; "Waiting over 14 days" chip appears only with stale cards; search; header shows how long the oldest card has waited; open thread, Retry answer, Make a card -> Save.
11. Review screen: footnote shows "Today: x of y" and the streak; updates after grading; with the API down, grading still works and the line disappears.
12. Weekly digest shows the Chat line and the reject-reason change versus last week.

Telegram
13. `/chat` lists up to 10 cards with age ("3d", "5h") and links that open that thread; `/chat 2` shows the next page with "Page 2 of N"; `/chat 0` and `/chat abc` get a short hint. The header states the total waiting ("12 Chat cards waiting, oldest first:"). `/rejected foo` lists rejected cards matching foo (a reason code still filters by reason). `/help` lists the commands. `/rejected` shows a one-line count per reject reason; `/digest` still works. The daily digest includes the Chat reminder once per day.

Data
14. Cards of accepted or rejected decisions older than 30 days lose their chat threads (retention job).

Added later in the run (web)
15. Add knowledge: type text, reload the page, text is back; submit, reload, it is gone. A non-http link shows an inline error and Submit stays disabled.
16. Header search: `/` or Cmd/Ctrl+K focuses it (not while typing in a field). "No results" offers Add this as knowledge with the query prefilled. The browser tab title reads "(N) Post Anki" when cards are due.
17. Stats page shows the next-7-days forecast; the review done screen shows the streak.
18. Chat and Inbox: with more than 200 cards the "Showing the first 200 of N" notice drops its number as cards leave. Chat message search shows "Showing the first 20" when cut. Inbox has search and a subject filter.
19. Rejected page: note typed on reject is shown on the row; "That's all the rejected cards" at the end; "Send to Chat" per row and in the triage decisions list. Statistics shows what became of cards sent to Chat.
20. Go offline: a banner appears; a failed grade's Retry stays disabled until you are back online.
21. Screen reader: Inbox, digest and stats loading text is announced; errors are alerts.

Added later in the run (iPhone)
22. Chat: unsent draft is kept per card (kill the app and reopen); long-press a Tutor reply to copy; Rejected: multi-select restore, date, subject filter, note on the row; Inbox: search and swipe to Chat; VoiceOver announces Restore, Snooze, Send to Chat, Move to Inbox, and "N cards moved to Inbox" after Move all. Triage swipes give a haptic.
23. Lists over 200 cards show "Showing the first 200 of N", updated as cards leave; Chat search shows a cut-off notice. Progress tab has reject reasons, nothing-extracted and Chat outcomes sections. Weekly digest shows "Couldn't load" with Try again when offline.
24. App icon badge shows cards due (permission prompt asks for badge only).

Telegram, later additions
25. A random `/word` gets "Unknown command" (but not while the bot waits for your answer). `/inbox` shows the Inbox count; `/rejected` shows notes and "+N more"; `/chat` header shows snoozed cards and a "200+" notice when capped. The "/" menu lists the commands. API down: friendly line instead of silence.
26. Send a photo or forward with a caption: the caption is processed. `/pause 3` stops the daily reminders for 3 days, `/resume` restarts them. `/streak` shows cards due, streak and 7-day accuracy; the daily digest has a cards-due line.

iPhone, later additions
27. Add screen: type text, leave and return, the draft is back; Paste button fills the field; offline send says your text is still there; signed-out send says to sign in. Settings: messages show at the top, email starts empty, an expired token offers "sign in again".
28. Sign out, sign in as another account: no old pending grades, cached cards, drafts or badge remain.
29. App icon badge shows due cards only when due>0 and refreshes after a review and on foreground (confirm on a device when the queue empties).
30. Progress: next-7-days forecast bars each read "Today, N due" / "Tomorrow, N due" / weekday with VoiceOver; bars sit on the right day near midnight. Home counts say "1 topic", "1 card", "1 item".
31. All items with filters and no results shows Clear filters. Review subjects: expand chevron has a VoiceOver name and a 44pt tap area. Global search offline shows an error with retry, not "No subjects". VoiceOver review actions read Again/Hard/Good/Easy.

Web, later additions
32. Inbox: Send to Chat moves the card; Discard uses the inline confirm. Export fails with an inline error; `?` on Anki review lists shortcuts; Cmd/Ctrl+Enter submits Add; errors on Review, Add, Stats and Subjects are announced. A budget-paused chat shows the paused wording.
33. Phone width (390px): menu closes on navigation and Escape and has Close; Skip to content is the first Tab stop; course cards table, Stats tables and feedback buttons fit and tap targets are 44px; run `scripts/phone-layout-check.mjs --seed`.
34. Tab title names the page and keeps the (N) due prefix. Session summary hides zero Suspended/Buried/Edited/Leeches rows. Long review questions wrap. Done-for-today text says "tomorrow" only when due after midnight.
35. Let the web session expire, then click an action: you land on sign in. Slow actions (doc scan, curriculum create) do not time out early.
36. Tags page: rename (duplicate name shows an inline error) and delete (confirm text); failed merge shows an error and unfreezes. Learning path load failure says what went wrong. Topic and module delete say they remove cards. Start-here card on Home for a new account.

Telegram and extension, more additions
37. Bot: `/start` intro and no-subjects hint; `/find words` returns subjects, curricula and topics (not cards); a long API stall gets a friendly "try again"; stop the bot with SIGTERM and it finishes the current update first.
38. Quiz: multi-answer questions say to finish on the web; Skip and End quiz buttons work; end screens carry New quiz and Home. Digest shows streak and triage-waiting lines with Pause and Open buttons; an expired old button press does not break the bot.
39. Extension: options address for the web app; failed send keeps the capture and the toolbar button retries it; wrong token, blocked origin and API down give three messages; Enter saves; truncation notice for long selections; 413/429 messages.
40. API: name fields reject blank and over-120 names; oversized text fields return 400; responses carry `x-request-id`; a deleted topic leaves no study material or Socratic rows (after the pending API items below land).

Sources, phrases and Notion, this run
41. Sources page (web): sources are grouped by subject; Notion English Phrases rows show last run, next run ("Next run in 3 hours"), a clickable Notion address, and a Retry button when loading fails. Failed runs show the reason; long pages show a "cut off at 500 blocks" note; "N more waiting" shows after the per-run limit. Check connection tells bad token from unreachable.
42. English Phrases with "???" next to a phrase: ingest it and check the card carries the model's validated spelling/translation, shown as "Your phrase" beside the AI suggestion. A repeated phrase with "???" stays flagged.
43. Review: Easy on a repeat card schedules further out; reviewing one subject ends with a "nothing due" screen offering Study ahead (web only). Web review card, iOS triage and review cards have Copy all (includes the AI suggestion).
44. Subject paths: Telegram subject buttons, web chat and inbox filters, iOS filter and Move sheet show full paths; picking a parent includes its children. Web subject page shows a breadcrumb; Subjects list shows card counts.
45. Extension: reload at chrome://extensions; nested menus, token states (an emptied token no longer falls back to the seed token).
46. Mac: Triage Left/Right do nothing, Return approves, X rejects; empty states say "Ingest from Notion"; toolbar tooltips; iPhone Home hides week comparison when last week was zero.
47. Pasting the same text twice in one batch adds it once; a long Cyrillic paste arrives intact; one over-long phrase line is skipped, not the whole batch; deleting a subject with a Notion source gives a clear 409, merging moves the source.
48. Telegram: tap an old quiz button after the quiz ended and get "quiz has ended"; `/pause` with a bad value explains the format; a huge webhook body gets 413.
49. Extension: Add subject with an empty name or a bad token says what went wrong in words; double-click adds once; with the API off, the parent list says it could not load. A 429 on capture shows a retry hint.
50. Web: stale chat badge shows "?"; header search and meaning search show an error with Retry; Stats and the due forecast show Retry; Milestones shows a load error, not "nothing yet"; a failed domain recommendation accept shows an error.
51. API: an oversized body on any route answers 413; over-long text fields in subjects, comments and sources are rejected with a clear message.
52. iPhone: domain mapping with the API down says names could not be loaded (not "removed"); new course form says categories could not be loaded; item detail with a failed note lookup does not open the wrong editor and Cards says it failed; study material generation says when it takes too long; Chat tab badge shows "?" when its refresh failed; VoiceOver reads inbox and subject rows as buttons.
53. iPhone with the API off: Learning list and Rejected cards say the subject list could not load (Retry works); search opening a course or topic says it could not load, not "removed".
54. Web: classify or move a Learning list item while the API fails, and start a path from a role template; the message is a plain sentence, never a code in brackets.
55. Web Probe "next gap" with the API off shows a load error with Retry, not "every gap covered"; iPhone Move card sheet with the API off says subjects could not load with Retry.
56. Apply API migration 0145, then paste two near-identical cards on one subject: Triage still shows the second with a "Possible duplicate" badge and the judge's reason.
57. Web and iPhone Triage: tap a similar card under a flagged duplicate; a preview opens, swipe down closes it, "Reject duplicate" and "Accept" each decide the pending card and move on.
58. Review a card with two or more wordings on web and iPhone: after Good, a "Same idea, new wording" card follows with Got it/Missed it; the due count and points do not change, and Undo skips it.
