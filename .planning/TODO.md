---
type: todo
branch: main
task: post-anki open items
state: open
updated: 2026-09-04
---
# Run todo

## subject-card-prompts

### Scope
- Each subject and sub-subject has an editable card-writing instruction with a sensible default.
- Triage notes keep shaping card writing.
- Out of scope: Native app editing screens.

### Coding tasks
- [x] Every subject and sub-subject gets a default card-writing instruction, inherited by sub-subjects without their own.
- [x] Triage notes from sessions left open over a day are distilled, so they also shape new cards.

### Notes


## model-quality-tracking

### Scope
- Every card records the model that wrote it, and triage decisions and ratings are tied to it.
- One screen shows approval rate and ratings per model.
- Out of scope: Model comparison runs and native app screens.

### Coding tasks
- [x] Card rebuild script must keep the old card pending when it writes no new card.
- [x] A web table shows approved, rejected and rating per model, with older unknown-model cards grouped as unknown.
- [x] Each new card stores the model that actually wrote it, and ratings and triage decisions use that.

### Notes


## inngest-prod-reliability

### Scope
- Every background job is known to Inngest Cloud after each deploy.
- Imported notes get extracted without manual help, and stuck pending notes are drained.
- Out of scope: Moving jobs off Inngest.

### Coding tasks
- [x] Deploy re-syncs the API with Inngest Cloud and fails when the sync does not land.
- [x] Pending imported notes reach Inngest via the sweep, logging an error when any wait over 30 minutes.

### Notes


## import-facts-not-templates

### Scope
- Imported Anki decks and text files are read as facts, and fresh cards are written from those facts instead of copying the old card layout.
- Card writing prefers direct questions; cloze is a rare exception for short sentences.
- Pending, untriaged cards built the old way get rebuilt.
- Out of scope: Cards already approved in triage stay untouched.

### Coding tasks

### Notes


## offline-review

### Scope
- Cards to review for subjects active in the last 3 days are kept on the phone so review opens instantly with no signal.
- Grades given offline sync later at their real review time.
- Out of scope: Chat and new AI question variants offline.

### Coding tasks
- [x] Apps store the offline pack on disk, refreshed every 6 minutes while open and when possible.
- [x] Server offers an offline pack of cards due within a day for recently studied subjects.
- [x] Review opens the stored pack when offline and keeps grades on the device with their review time.
- [x] Offline grades sync when back online, applied at their real review time without double counting.

### Notes


## chat-queue-card-crafting

### Scope
- The chat a card is sent to becomes a short-lived workbench for fixing weak cards: it answers from a smarter model that can search and fetch the web, prefers the model's own knowledge, and pulls author context when the source author is known.
- The chat has real card tools that create proper PostAnki cards with front, back and optional examples, replacing the button that turns the model's last answer into a front.
- Both the iOS and desktop apps carry the improved chat, since this is where cards get ironed out before they go back to review.
- Out of scope: A persistent general-purpose chat or chat history; backfilling existing cards.
- A proposed card is never saved silently: the user accepts or rejects it in the chat, and a rejection continues the discussion.

### Coding tasks
- [x] Send to chat (iPhone, Mac) takes an optional first prompt so AI replies during triage.
- [x] Chat shows Finish chat after an accepted card, else Cancel chat that deletes it.
- [x] Mac triage gets Send to chat and the full iPhone chat abilities (propose, reword, approve cards).
- [x] Let every item chat on iPhone and Mac propose cards, not only the queue chat.
- [x] iPhone chat proposes a card on request for accept or reject, with an on-demand reword-question button.
- [ ] Cards the chat proposes are triaged in place like the triage screen: swipe right (or accept) saves the card, swipe left (or reject) keeps the thread going on what is wrong until the point is fixed and accepted or discarded.
- [ ] The iOS and Mac apps show the improved chat with the same card tools as the web app.
- [ ] When a card's source author is known, the chat may fetch context about that author's material to ground its explanation.
- [ ] Chat answers come from a smarter model tier with web search and fetch available, with the model's own knowledge preferred and web context used to fill terse one-sentence sources.
- [ ] The chat model gets create-card and update-card tools that take a front, a back and optional examples, so a card born in the chat is a proper card and not a copied answer.
- [x] Item chat always searches the web and fetches pages so replies use current, sourced facts.
- [x] Each subject gets an optional chat instruction that opens every chat; sub-subjects inherit it.
- [x] Data migration writes a tailored chat instruction for every existing subject and sub-subject.
- [x] Data migration adds a B2B sales sub-subject under Sales, with its own chat instruction.

### Notes
- Worked in its own Orca worktree chat-queue-card-crafting, started 2026-11-08 from this session's brief.


## duplicate-detection-and-variations

### Scope
- New cards are checked for near-duplicates in batches and flagged in Triage with clickable similar cards, and Review rotates variations of one card
- Out of scope: Deleting cards without the user's decision

### Coding tasks
- [x] Practice rounds do not skew which wording the next real review shows.
- [x] iPhone and Mac list every similar card of a flagged duplicate, not only the main one.
- [x] Cards created by hand are also checked for near-duplicates, like imported ones.
- [x] Tapping a similar card opens a swipe-down preview offering Reject duplicate or Accept.
- [x] Jev judges each similar pair and flags a card that adds nothing substantial as a duplicate.
- [x] One review session can show several variations of the same underlying card, scheduled as one card.
- [x] Triage still shows a flagged duplicate, marked as such, with its similar cards listed.
- [x] Every newly ingested card is checked for near-duplicates in batches, including automated ingestion.

### Notes


## useful-new-features

### Scope
- Priority: high
- New user-facing features that make daily learning and reviewing faster or more rewarding.
- Each ticket is one behaviour in one app with a stated check, about five files.
- No standing monthly cost; AI features capped and on cheap models.
- Out of scope: Rewrites of working features, new paid infrastructure, anything touching money or privacy without a human call

### Coding tasks
- [x] Triage on every device: change an item's subject, or create a subject or subsubject on the spot.
- [x] Add knowledge text field and send button stand out clearly from the page background.
- [x] Treat imported text files as hostile: reject malformed content, strip browser-runnable markup, fence text from prompt instructions.
- [x] Add knowledge accepts a dropped or picked text file and runs the batch import flow on it.
- [ ] [blocked: user] Decide on tighter rows in the Mac knowledge list, which needs a custom list.
- [ ] [blocked: user] Decide whether Copy all stays on cards or the older no-selection item wins.
- [ ] [blocked: user] Choose the single card word and whether the overview merges into the browser.
- [ ] [blocked: user] Approve a database migration to split triage history context from the prompt.
- [x] iPhone Move card sheet says subjects could not load, not that none exist.
- [x] Web Probe next gap says it failed to load instead of claiming every gap is covered.
- [x] Global card chat, suspended cards and daily push routes have error and fallback tests.
- [x] iPhone search says a topic could not load when its fetch failed, not removed.
- [x] iPhone search says a course could not load when the course list fetch failed.
- [x] Learning list and role template errors on web read as plain sentences, not raw codes.
- [x] Q&A chat, study chat, probe and domain recommendation routes have error-status tests.
- [x] iPhone Learning list and Rejected cards say when their subject list failed to load.
- [x] Subject suggestion, study material and decide routes have error-status tests.
- [x] Practice, subject priority, Socratic and probe session routes have error-status tests.
- [x] iPhone study material generation and domain recommendation accept say when they time out or fail.
- [x] iPhone item detail opens the right editor and says when notes or cards failed to load.
- [x] Extension Add subject explains failures in words, blocks double clicks, and flags unloaded parent list.
- [x] Stale Telegram quiz buttons have tests proving the quiz-ended reply shows.
- [x] Feedback, subject category, study forecast and library refetch routes have error-case tests.
- [x] iPhone Chat tab badge hides its number when the count refresh failed.
- [x] iOS inbox, review-subject and hardest-card rows are announced as buttons by VoiceOver.
- [x] iOS README tabs, sign-in and Mac setup, local-dev spend cap and API intro match the code.
- [x] iOS domain mapping and new-course screens show a message when their lookups fail.
- [x] Course refocus and node comment routes have tests, and refocus logs through the structured logger.
- [x] Every API route answers 413 for an oversized request body, not only knowledge-source create.
- [x] Failed accept or reject on a domain recommendation shows an error message.
- [x] Milestones page shows a load error with Retry instead of the empty message.
- [x] Study-plan dates, liveness score clamping and Notion rich-text joining have direct tests.
- [x] Subject rename, node comments, learning links, courses and sources enforce sensible length limits.
- [x] Manual Generate cards does not wait for the whole compile when queueing fails.
- [x] A failed claim or loader query does not hide card counts or fail the whole source.
- [x] Gap, note, tag, question and answer text boxes have names for screen readers.
- [x] Stats range switching ignores stale replies and the due forecast offers Retry on failure.
- [x] A failed header search shows an error, and meaning search offers Retry for every error.
- [x] The web chat-queue count badge shows it is stale when its refresh fails.
- [x] The Telegram webhook rejects oversized request bodies instead of buffering them.
- [x] /pause with 0 or a word replies with the days used or asks again.
- [x] The /chat list never cuts an emoji in half and says how many cards are snoozed.
- [x] The bot Home empty-state message includes the web link, like /start.
- [x] A failed Pause tap on the daily digest no longer replaces the question message.
- [x] Tapping an old quiz button or Regenerate on a stale quiz says it expired.
- [x] The extension keep-or-clear decision has a test for every failure status.
- [x] The extension error toast for a retryable failure tells users to click the toolbar to retry.
- [x] A rate-limited extension capture is kept for retry instead of lost.
- [x] Deleting or merging a subject that has a Notion source no longer fails.
- [x] Check connection says whether the Notion token is bad or Notion is unreachable.
- [x] Phrase import ignores one over-long line instead of rejecting the whole batch.
- [x] Pasting the same text twice in one batch add is caught as a duplicate.
- [x] Large pasted text with Cyrillic is not corrupted at network chunk boundaries.
- [x] Web and iPhone word the last Notion run result the same plain way.
- [x] Web Notion sources page makes each page address a clickable link like iPhone.
- [x] Web and iPhone Notion source rows show when each source runs next.
- [x] A Notion run result says how many new phrases still wait after the per-run limit.
- [x] Notion pages longer than 500 blocks warn that later phrases were never read.
- [x] A database error while closing a Notion run no longer leaves it stuck.
- [x] Each failure code a Notion run can record has a test.
- [x] A failed Notion run tells the user why it failed on web and iPhone.
- [x] Web review panel moves question polling into its own hook and stays under 300 lines.
- [x] iPhone Knowledge subject filter and Move sheet show full subject paths, and Move disables parent subjects.
- [x] iPhone and Mac Triage and Review show the AI-suggested phrase with an AI badge beside the original.
- [x] Deploy docs and API README name the real health path, current secrets and the daily spend guard.
- [x] Web review labels the phrase the user wrote, not the AI-preferred chunk, as Your phrase.
- [x] Web subject page shows a breadcrumb of parent subjects, and its back link goes to Subjects.
- [x] Sources page has a Retry button, a subject-paths-unavailable note, and screen-reader labels.
- [x] Sources page library rows say whether the link downloaded, failed or is not fetched yet.
- [x] A repeated phrase marked ??? later in an import still flags the stored phrase as unsure.
- [x] Telegram subject menu shows nested subjects with their full path labels.
- [x] iPhone chat subject filter includes parent subjects and matches their sub-subjects.
- [x] Web chat and inbox subject filters include parent subjects and match their sub-subjects.
- [x] iPhone Review tab badge counts each due card once, not once per nested level.
- [x] iPhone and Mac scoped review stops at a next-due state when nothing is due.
- [x] Web scoped review ends with a next-due screen when nothing is due, with a Study ahead option.
- [x] Only three or more question marks flag a phrase unsure, with an end-to-end test.
- [x] Extension shows token rejected or missing clearly, and drops cached subjects on a 401.
- [x] Extension menu and options list nested subjects at every depth with parent paths.
- [x] Chat queue, Inbox and global search show the parent path for nested subjects.
- [x] Sources page groups by full subject path and shows Notion last-run results on each row.
- [x] Cards graded Easy never come back in the same review session, on web and iPhone.
- [ ] [blocked: user] Decide how Me Agent book notes reach post-anki so the Sources page can list them.
- [x] Phrases marked with ??? are flagged unsure in the prompt and the model verifies spelling and translation.
- [x] Sources page lists sources by subject, including Notion English Phrases and Me Agent book notes.
- [x] Mac dev build uses the same PA icon with an orange DEV band.
- [x] Native Triage and review cards offer a Copy all action for every text part.
- [x] Web review card offers a Copy all action that copies every text part of the card.
- [x] Web review panel and review api files are prettier-clean after the pending total change.
- [x] Chat thread state settle test asserts the exact resulting lines instead of a loose check.
- [x] Web chat reject hook gets its own unit test covering the resolve, failure and skip-reason paths.
- [x] Phrase split failure toast shows a readable message instead of the raw API code.
- [x] Web rejected cards screen splits its row and filter pieces into sibling files, each under 300 lines.
- [x] iOS Subjects load failure shows the bracketed error text and the connection address.
- [x] Web phrase split shows its result in the existing inbox toast with the card count.
- [x] Knowledge-bit repo splits into read and write modules behind a barrel, each under 300 lines.
- [x] Learning list approval orchestrator extracts its step helpers so the file stays under 300 lines.
- [x] Guarded fetch splits policy checks from the fetch wrapper so each file stays under 300 lines.
- [x] Web chat thread hook extracts its message reducers so the hook file stays under 300 lines.
- [x] Knowledge-bit source item validation splits its rule checks into a separate module under 300 lines.
- [x] Curriculum domain mapping repo splits into read and write modules so each file stays under 300 lines.
- [x] Learning path repo splits into read and write modules so each file stays under 300 lines.
- [x] Tag repo splits into read and write modules so each file stays under 300 lines.
- [x] Web triage undecided count dedupes resolved ids so a card in two sets is subtracted once.
- [x] Knowledge-bit feedback repo splits model-evidence and grading queries into their own module under 300 lines.
- [x] MCP list_decks test fake database supports the card count join so the test passes again.
- [x] Web triage counter uses the server pending total, so it stays right past 200 cards.
- [x] Phrase split repo helpers get an integration test proving a split phrase yields one card per context.
- [x] Pending list integration tests get their own file, keeping the approval test file under 300 lines.
- [x] Mac inbox window smoke tests split into list and triage files so each stays under 300 lines.
- [x] Web Subjects list shows a Kind badge for non-default kinds, matching the Mac and iOS apps.
- [x] Learning-intent migration test checks only rows it created so leftover e2e data cannot fail it.
- [x] iOS focus triage view extracts key handling and overlays so the file stays under 300 lines.
- [x] Web triage focus card extracts its variant list so the file stays under 300 lines.
- [x] Subject repo splits into read, write and tree modules so each file stays under 300 lines.
- [x] Mac kind badge helper drops the unused Category mapping and names only kinds the server sends.
- [x] Web browser rows keep truncating long questions after the Context line was added above them.
- [x] Pending list query moves out of the approval repo so each file stays under 300 lines.
- [x] Web Subjects card counts come from the same API roll-up as the native apps so numbers match.
- [x] iOS cursor picks the last card by server order, not string order, so paging stays correct.
- [x] Mac card triage and inbox list use the cursor window so Mac works past 200 pending cards.
- [x] Pending cards get a created_at plus id index so cursor paging stays fast as the inbox grows.
- [x] iOS Manage Subjects rows show the kind badge like the Mac table so language subjects stand out.
- [x] Web phrase situation split can be run from the card detail panel for one phrase card.
- [x] Mac Subjects table shows a Kind badge again so categories and subjects are told apart.
- [x] Native Triage top-up uses a cursor so lists longer than 200 pending cards can be worked through.
- [x] Web Subjects page shows the card count per subject using the API field.
- [x] Pending card list API returns a total so native Triage shows an exact remaining count.
- [x] Subject card counts include cards in child subjects so a parent subject shows its whole tree.
- [x] iOS Subjects list shows the card count per subject using the API field.
- [x] Mac Triage inbox loads 20 cards and tops up on demand like the phone does.
- [x] Splitting a phrase card into situation variants refreshes its embedding so duplicate checks stay accurate.
- [x] API knowledge-bit review route tests pass again, two cases fail today on the response shape.
- [x] Web suspended and browser lists show the Context line above the question when present.
- [x] iOS Triage accepts a hardware keyboard: digits toggle, Return keeps, X drops, Z undoes, like the Mac.
- [x] iOS Review collapses the New, Learning, Due legend into an info popover instead of a permanent row.
- [x] iOS Home hides the last-week comparison when last week was zero and uses one progress accent.
- [x] iOS Notion source row shows a plain status word, wraps the URL and explains the Remove toggle.
- [x] iOS Chat and Inbox empty states describe the same swipe direction and Triage corner icons get labels.
- [x] iOS Add screen has a real input placeholder and a readable Submit bar when disabled.
- [x] iOS review grade buttons show the next interval under each label and have stronger contrast.
- [x] Web triage focus card shows the original fact and its source above the question variants.
- [ ] [blocked: user] Mac dev copy shows a keychain prompt for the API token, click Always Allow.
- [x] Mac inbox is titled Knowledge Inbox and both empty states use the same Ingest wording.
- [x] Mac icon-only toolbar buttons on Knowledge, Subjects and Review get tooltips.
- [x] Mac Admin settings drops the Test toggle row and shows the real version number.
- [x] Mac Subjects table replaces the constant Kind and Courses columns with item counts.
- [x] Mac Review shows a progress counter and the subject above the question.
- [x] Mac Review has a visible Show answer button and shows the 1-4 key on each grade button.
- [x] Mac knowledge item detail shows Status and Subject values and keeps a right margin.
- [x] Mac sidebar no longer collapses and crops its labels when the Knowledge page is open.
- [x] Web triage landing makes Start triage primary and Approve all ready secondary with a count.
- [x] Web triage focus header shows card 3 of 12 progress and a labelled Leave button.
- [x] Web nav has one Statistics entry, a Notion sources icon, and Inbox renamed Set aside.
- [x] Web Admin settings loses its placeholder toggle text and links to Notion sources from the token setting.
- [x] Web sign-in shows the product name in a centered card and the button just says Sign in.
- [x] Web Inbox rows have one primary Back to triage button, Discard and the rest are secondary.
- [x] Mac Settings scrolls as one long page with section headers, no picker and separate panes.
- [ ] [blocked: user] Phone subject list fails, send the bracketed error text and the Connection address.
- [x] Mac Triage Left and Right arrows do nothing, only Return approves a card and X rejects it.
- [x] Mac Settings is a page in the main window from the sidebar, not a separate window.
- [x] Native Triage starts from a subject list with pending counts, Triage all is secondary.
- [x] Native Triage shows each card as a card with large front, large back and optional examples.
- [x] Native apps sign in with email and password and get a token that does not expire.
- [x] Native Triage preloads the next 15-20 cards and saves each decision in the background.
- [x] Native review preloads the next 20 cards, refilling near the end, so card changes are instant.
- [x] Native app review grade buttons (Hard, Good, Easy) are larger and easier to tap.
- [x] Review tab shows card maturity counts per subject and a maturity bar for all subjects.
- [x] Review tab subject list stops showing a false load error on a cancelled request.
- [x] iPhone Progress and web Stats show card maturity: percent and count of mature, learning and new cards.
- [x] Domain review failure, status filters, doc scan 404 and double-resolved suggestions have controller tests.
- [x] Domain-node depth edits and merges have tests for bad input, missing node and cycle refusal.
- [x] Curriculum settings panel loading its domain map no longer leaves an unhandled error when the request fails.
- [x] Starting a study session or opening a learning-path step shows a failure when the request throws.
- [x] A study session whose next-question load or end request throws stops spinning and lets the learner retry.
- [x] Learning list, learning path, library and note actions re-enable and show an error when the request throws.
- [x] A failed subject create shows an error, keeps the typed values and re-enables the Add button.
- [x] Subject model tier, curriculum placement and domain-node merge show a failure and re-enable instead of freezing.
- [x] The clear-all-knowledge confirm input and its buttons are at least 44px tall on a phone.
- [x] Admin settings tier buttons and number inputs are at least 44px tall on a phone.
- [x] The chat-card controller tests load and run without a database URL.
- [x] A failed topic or module comment save keeps the typed text and shows no success flash.
- [x] The API type check passes: the chat-queue outcomes statistics route is registered in the route name list.
- [x] Telegram daily push claims the Chat reminder slot after sending, and a repeat trigger does not double-send.
- [x] Lecture and card regeneration replace old content in one transaction, so a failure keeps the old content.
- [x] Probe attempt writes and quiz-session creation each run in one transaction.
- [x] A Socratic answer cannot be submitted twice or into a finished session.
- [x] Knowledge extraction chunk helpers (unseen statements, empty chunks, betterOf) have direct tests.
- [x] Curriculum editor forms and Compare models show failures instead of freezing or showing empty history.
- [x] Decide, probe and Socratic screens show an error and keep the learner's text when a request fails.
- [x] Stale generating lectures and study materials are swept to failed, and failed lecture writes are reported.
- [x] 502 replies give a generic message to the client and log the real error.
- [x] Deleting a topic or module also removes its archetype state, study materials and Socratic history.
- [x] Remaining iPhone and Mac count strings (Progress, CourseEdit, SourceRegeneration) use singular for one.
- [x] Extension and bot architecture docs match the current manifest permissions and commands.
- [x] e2e-local covers Add knowledge draft and link error, Anki review shortcuts, tab title, skip link and search.
- [x] Telegram quiz has Skip and End quiz buttons.
- [x] Telegram digest adds streak and triage-waiting lines, and carries Pause and Open buttons.
- [x] Extension options explain wrong token, blocked origin and API down separately, and Enter saves.
- [x] Phone-layout check covers Inbox, Chat, Rejected, Stats, Tags and Profile.
- [x] Web course cards table, Stats tables and feedback buttons fit a 390px phone with 44px tap targets.
- [x] iPhone global search shows load errors, review-subject expand button is labelled and 44pt, and counts use singular.
- [x] Abandoning a completed learning path keeps it completed.
- [x] Study session creation rejects bad dates and huge durations with 400.
- [x] Tags can be renamed and deleted from the Tags page, and the API refuses duplicate names.
- [x] Card, answer, title, name and note text inputs have generous length caps that return 400.
- [x] Bot answers expired button presses without failing, and still handles the press.
- [x] Web tag merge failure shows an error without freezing, and learning-path load errors say what went wrong.
- [x] Web review question wraps long text, and Done for today next-due text reuses the tested formatter.
- [x] Extension keeps the selection when sending fails and offers Retry.
- [x] iPhone Chat search and Home models have tests, and docs explain database backup and restore.
- [x] Telegram /find searches cards and subjects and replies with the top matches.
- [x] Ending a finished study session is refused, answers count atomically, and saving a recommendation is one transaction.
- [x] Notes search, open-questions list and content library list have limits, and the library skips downloaded text.
- [x] Home top subjects and tag mastery are computed in SQL with a 30-day window, not in memory.
- [x] Web sends the user to sign in when a call returns 401, and API calls time out.
- [x] Web has a Skip to content link as the first focusable element.
- [x] Web tab titles name the page, and Session summary hides zero rows.
- [x] Subject and tag names are trimmed and capped at 120 characters, and API JSON is no-store.
- [x] Bot and extension API calls time out with a friendly reply, and Rejected text cuts are emoji-safe.
- [x] Web card source links use safeHref, and key form inputs have accessible names.
- [x] Web phone menu closes on navigation and Escape, and has a Close button.
- [x] iPhone Rejected, Search and Review-subjects models have smoke tests, and web and shared packages have real READMEs.
- [x] Bot shuts down cleanly on SIGTERM: finishes in-flight updates, closes the database pool, then exits.
- [x] New-cards-per-day label is tied to its input, and topic and module delete text names the cards lost.
- [x] iPhone forecast bars have accessibility labels and bin days in the device time zone.
- [x] Web subject-section.tsx and topic-row.tsx are split below 600 lines with no behaviour change.
- [x] iPhone Progress shows a next-7-days due forecast.
- [x] Extension options reload the subject list after saving, and iPhone All items offers Clear filters when empty.
- [x] Cards, note, add-goal and duplicate-suggestion controllers have tests, plus review, gap and learning-list schema tests.
- [x] Review-grade and streak controllers have tests, and AI-spend stats rejects an invalid time zone with 400.
- [x] Web Profile loads in parallel and a failed load shows an alert with Try again.
- [x] Web All cards empty filter result offers Clear filters, and paged lists never show a card twice.
- [x] Telegram cards-due and streak use the saved time zone, and bot secrets are compared in constant time.
- [x] Telegram /start and /study reply with an error line when the API is down.
- [x] iPhone Settings shows messages at the top, announces them, and starts with an empty email.
- [x] Extension has a web app address setting and explains too-large, rate-limited and truncated captures.
- [x] Telegram quiz end screens offer New quiz and Home, and repeated taps no longer error.
- [x] Web shares one plural and browserTimeZone helper instead of per-file copies.
- [x] Module and learning-path controllers, and probe-session and home shared schemas, have tests.
- [x] API requests carry an x-request-id echoed in 500 bodies and logs, with one done line per request.
- [x] Web dialogs restore focus to their opener on close, and seven loading messages are announced.
- [x] A brand-new web account sees one Start here card on Home instead of five empty cards.
- [x] Telegram quiz hands multiple-answer questions to the web and shows why the answer is right.
- [x] Web curriculum actions recover from failed requests with an error line, and deletes state what is removed.
- [x] iPhone Add shows offline and sign-in messages, and VoiceOver review actions are Again, Hard, Good, Easy.
- [x] Docs: bot README with commands, API error codes section, and a top-level README with a docs index.
- [x] Telegram /start welcomes new users and guides those with no subjects to add a note.
- [x] API query errors use the same message shape as body errors, and the account controller has tests.
- [x] A very large paste returns the friendly 50,000-character refusal, and search lists exact matches first.
- [x] Web Inbox Discard uses the inline confirm instead of the browser dialog.
- [x] iPhone sign-out clears queued grades, answers, caches, drafts and last-studied, with a test.
- [x] Extraction that stops at the 40-card cap tells the user the rest was not read.
- [x] Web Review, Add and Stats errors are announced, and a failed Stats range offers Retry.
- [x] e2e specs cover Chat bulk move, export, shortcuts help, thread reply and the paused state.
- [x] iPhone asks badge permission only when cards are due, and refreshes the badge after reviewing.
- [x] Web Subjects errors are announced, empty Subjects links to create, search closes on Escape, Cmd+Enter submits Add.
- [x] Telegram bot ignores edited messages so editing a sent note does not add it again.
- [x] Inbox cards can be sent to Chat from the web Inbox row.
- [x] Web anki-review-screen.tsx is split below 300 lines with no behaviour change.
- [x] Web Download my cards shows an inline error when the export fails.
- [x] The 50,000 character source limit has one shared definition.
- [x] LLM call log caps stored error text and keeps the card id on every call.
- [x] e2e specs cover the Inbox screen, reject reasons on Rejected, and the stats reject-reason sections.
- [x] Web Anki review has a ? shortcuts help, and Suspended, Overview and Browser loading text is announced.
- [x] Extraction stopped by the daily AI budget says it resumes after midnight UTC and is not retried.
- [x] Web shows an offline banner and review grading retries wait until the connection is back.
- [x] API streak, home, weekly digest card and review-due-count endpoints have controller tests.
- [x] API browser list and Rejected list have indexes matching their sort and filter, via generated migration.
- [x] API clamps study-session consistency windowDays and has controller tests for study-session and stats.
- [x] iPhone Progress shows a last 30 days reviews-per-day chart from the learning-stats endpoint.
- [x] iPhone knowledge item screen supports pull to refresh, and Subjects profile button has a VoiceOver label.
- [x] iPhone Knowledge and Inbox lists tell offline from sign-in problems, with one shared helper.
- [x] iPhone Review empty state says when the next card is due.
- [x] iPhone Review gives a haptic when a card is graded, stronger on Again.
- [x] iPhone Add has a Paste button that fills a copied link.
- [x] iPhone Add keeps typed text if the app is closed, using the existing unsent-draft store.
- [x] iPhone app icon badge shows the number of cards due.
- [x] Bot daily digest and a /streak command show flashcards due, streak and recent accuracy.
- [x] Bot /pause and /resume stop and restart the daily reminders.
- [x] Bot uses the caption of a photo or forwarded message as the note to process.
- [x] Web Stats page shows the due-next-7-days forecast and review done screen shows the streak.
- [x] Web browser tab title shows the number of cards due.
- [x] Web header search ignores stale responses and opens with slash or Cmd+K.
- [x] Web global search no-results offers Add this as knowledge with the query prefilled.
- [x] Web Add knowledge link block shows an inline error for non-http links and blocks submit.
- [x] Web Add knowledge keeps typed text across reload and navigation until it is submitted.
- [x] Web Chat export, quick snooze, thread and make-card hooks have tests.
- [x] Web Rejected page says when the whole list is shown, after a filter or search.
- [x] iPhone Chat message search shows a notice when results were cut at 20.
- [x] Web Chat message search shows a notice when results were cut at 20.
- [x] Stale-cards summary and Chat outcomes waiting counts join knowledge_sources like the list.
- [x] iPhone Move all to Inbox announces how many cards moved.
- [x] iPhone Chat and Inbox 200 notice updates after a card leaves the list.
- [x] Chat and Inbox totals ignore cards the list cannot show, so the 200 notice is never false.
- [x] API Chat queue snooze, move, send-message and export handlers have controller tests.
- [x] iPhone weekly digest card shows an error line with retry when the request fails.
- [x] Chat message search says when results were cut at 20 (API hasMore, web and iPhone notice).
- [x] Bot /digest replies with a friendly line when the API is unreachable, with a test.
- [x] Web loading and error text on Inbox, digest and stats sections is announced to screen readers.
- [x] Web Chat and Inbox 200 notice updates after a card leaves the list.
- [x] iPhone Progress tab shows reject reasons, nothing-extracted and Chat outcomes sections.
- [x] iPhone Chat and Inbox lists say when only the first 200 cards are shown.
- [x] iPhone Rejected rows show the note the user typed when rejecting.
- [x] Bot /chat and /inbox say when only the first 200 cards are counted.
- [x] Bot /rejected lines include the note the user typed when rejecting.
- [x] iPhone Inbox has search and a swipe to send a card to Chat.
- [x] iPhone Rejected list can restore several selected cards at once.
- [x] Web Chat and Inbox lists say when only the first 200 cards are shown.
- [x] Web Rejected rows show the note the user typed when rejecting.
- [x] Bot /inbox shows how many cards wait in the Inbox with a link to it.
- [x] Bot handler test: an unknown command with a pending answer is treated as the answer.
- [x] Web Inbox has search and a subject filter.
- [x] iPhone gives haptic feedback on triage swipe decisions.
- [x] iPhone announces to VoiceOver after Restore, Snooze, Send to Chat and Move to Inbox.
- [x] iPhone Chat queue has a subject filter.
- [x] iPhone Rejected list has a subject filter.
- [x] iPhone Rejected rows show the date rejected.
- [x] Web Rejected page shows how many cards match the current search and filters.
- [x] Web Chat and Rejected loading text is announced by screen readers.
- [x] Bot /digest links to the Rejected page when it lists reject reasons.
- [x] Bot /chat header also states how many cards are snoozed.
- [x] Bot /chat and /rejected reply with a friendly line when the API is unreachable.
- [x] Bot registers its commands so Telegram shows the command menu.
- [x] Bot /rejected says how many more rejected cards exist beyond the five shown.
- [x] Bot replies "Unknown command, see /help" to a mistyped slash command.
- [x] iPhone Rejected list can send a card straight to Chat instead of restoring it.
- [x] e2e spec: a rejected decision is sent to Chat from the triage decisions list.
- [x] Rejected page can send a card straight to Chat instead of restoring it to pending.
- [x] Statistics shows what became of cards sent to Chat: accepted, rejected, still waiting.
- [x] iPhone triage decisions list lets a rejected or inbox card be sent to Chat afterwards.
- [x] Triage decisions list lets a rejected or inbox card be sent to Chat afterwards.
- [x] iPhone Chat replies can be copied with a long press.
- [x] iPhone keeps an unsent Chat draft per card when leaving the thread, like the web does.
- [x] Triage card keys are ignored while the shortcuts help is open.
- [x] Web triage focus view lists its keyboard shortcuts on the question-mark key.
- [x] iPhone Chat list and count refresh when the app returns to the foreground.
- [x] Web focus refresh keeps a snooze change made while the refresh was in flight.
- [x] Web Chat queue list and sidebar count refresh when the tab regains focus.
- [x] Telegram /chat lines show the card's subject name.
- [x] iPhone Chat sort order is remembered between launches.
- [x] E2E: Chat queue header counts and oldest wait match seeded cards, snooze updates them.
- [x] iPhone daily-goal refresh logic moves into the package with stale and failure tests.
- [x] Web s key shows an error when the snooze request fails.
- [x] Test that a reload during iPhone Move all to Inbox never brings moved cards back.
- [x] iPhone stale Chat filter offers Move all to Inbox after a confirmation.
- [x] Web Chat queue counts a card with an expired snooze as waiting.
- [x] iPhone Chat list header shows how many cards are waiting and how many are snoozed.
- [x] Web Chat queue header shows how many cards are waiting and how many are snoozed.
- [x] Telegram /help lists every bot command with a one-line description.
- [x] Telegram /rejected accepts a search word to filter rejected cards.
- [x] iPhone Rejected list gets a search box matching the web one.
- [x] Telegram /chat header states how many Chat cards are waiting in total.
- [x] iPhone Chat list header states how long the oldest card has waited.
- [x] Web Chat queue header states how long the oldest card has waited.
- [x] Telegram /rejected shows a one-line count per reject reason.
- [x] iPhone Rejected list: show a card count on each reject reason chip.
- [x] Rejected page: show how many cards sit under each reject reason filter.
- [x] iPhone review screen shows the server streak beside the daily goal.
- [x] iPhone review screen shows today's daily goal progress.
- [x] Web review done screen shows the server streak, not the local counter.
- [x] Web subject review done screen shows the subject's study forecast.
- [x] Telegram /chat accepts a page number to see cards beyond the first 10.
- [x] iPhone Chat list: filter chip showing only cards waiting over 14 days.
- [x] Web Chat queue: s key snoozes the highlighted card, listed in help.
- [x] iPhone Chat Inbox swipe: block double taps and add model unit tests.
- [x] Web Chat queue: i key moves the highlighted card to Inbox, listed in help.
- [x] Web Chat queue: sort toggle between oldest and newest waiting, remembered per browser.
- [x] iPhone Chat list: swipe a card to move it to Inbox.
- [x] Triage keys e2e: clean up partial seeds and triage-session rows, isolate pending count.
- [x] Split chat-queue-screen.tsx under 250 lines with no behavior change.
- [x] Playwright smoke: triage C and I keys move a card to Chat queue and Inbox.
- [x] Telegram /chat shows how long each card has waited.
- [x] Web Chat queue: one-click select of cards waiting over 14 days for bulk Inbox move.
- [x] Check query plans for the Rejected list and Chat search, and add indexes if scans are slow.
- [x] Run the axe accessibility check on the Rejected page and Chat search results.
- [x] Test the iPhone Chat thread retry flow end to end with a stubbed client.
- [x] Add a Playwright smoke test for Rejected page restore and Chat message search.
- [x] Update the triage chat doc with search, retry, source links, bulk restore and retention.
- [x] Add Retry answer to the iPhone Chat thread.
- [x] Test that bulk move to Inbox runs at most three requests at once.
- [x] Add Retry answer in the web Chat thread: drop the last reply and ask again.
- [x] Show the source note title on each iPhone Rejected card row.
- [x] Show the source note title in the iPhone Chat thread header.
- [x] Show the source note title on each web Rejected card row, linked to the note.
- [x] Show the source note title as a link in the web Chat thread header.
- [x] Show change versus last week next to each top reject reason in the weekly digest.
- [x] Add Extract anyway on a note that returned nothing, asking for at least one card.
- [x] Add a search box over Chat thread messages to the iPhone Chat tab.
- [x] Search across all Chat thread messages from the web Chat page.
- [x] Restore several rejected cards at once from the web Rejected page.
- [x] Fix the Add knowledge button contrast and remove its axe exclusion.
- [x] Filter the web Rejected cards page by subject.
- [x] Show AI card proposals with a Save button in the iPhone Chat thread, like web.
- [x] Drop bulk-selected ids from the Chat selection when their cards leave the queue.
- [x] Make web triage Chat about this key send the card to the Chat queue, not Inbox.
- [x] Make the Telegram /chat reply link each card to its own thread.
- [x] Guard the iOS chat export and share code with os(iOS) checks so the Mac target compiles.
- [x] Delete Chat threads of cards already accepted or rejected, 30 days after the decision.
- [x] Offer Snooze in the iPhone Chat thread screen.
- [x] Let the Telegram Chat reminder gate survive restarts by storing the last sent date.
- [x] Show the weekly Chat summary line on the iPhone Review tab digest card.
- [x] Add a one-line weekly Chat summary to the Telegram digest: cards chatted about and turns used.
- [x] Delete Chat threads of cards that were approved, rejected or deleted outside the Chat flow.
- [x] Tag Chat reply traces with card id, turn number and outcome in the existing tracing setup.
- [x] Show a Chat turns-left meter in the web thread header and warn at one turn left.
- [x] Allow deleting the last Chat exchange on iPhone, using the same endpoint.
- [x] Let users delete the last Chat exchange to get the used turn back.
- [x] Show the extraction summary line on the iPhone Add screen too, using the same status outcome.
- [x] Show a short extraction summary after adding a note: cards created, or nothing worth keeping.
- [x] Add bulk select on the web Chat list to move several cards to Inbox at once.
- [x] Add a keyboard shortcuts help overlay (press ?) to the web Chat page.
- [x] Show waiting days on iPhone Chat rows and sort the iPhone Chat list oldest first.
- [x] Show how many days each Chat card has waited, and sort the web Chat list oldest first.
- [x] Add Telegram /rejected command listing the latest rejected cards with their reasons.
- [x] Add text search to the web Rejected cards page, combined with the reason filter.
- [x] Let a rejected card be restored from the iPhone Rejected list.
- [x] Let a rejected card be restored to the approval queue from the Rejected cards page.
- [x] Show the Rejected cards list on iPhone, with a reason filter, reachable from the Review tab.
- [x] Return top reject reasons in the weekly digest and link each to the Rejected cards page.
- [x] Add a Rejected cards page filterable by reject reason, backed by an API filter.
- [x] Refresh the sidebar Chat badge after snooze and unsnooze actions, using a lightweight count request.
- [x] Show waiting Chat card count as a badge on the web sidebar Chat link.
- [x] Add an automated accessibility check to the Chat page smoke test and fix violations.
- [x] Keep an unsent Chat message draft per card so it survives a page reload.
- [x] Add a Copy button on assistant replies in the web Chat thread.
- [x] Add a Playwright smoke test for the web Chat page list, filter, snooze and thread.
- [x] Document the Chat queue, reject reasons and nothing-extracted behavior in the user docs.
- [x] Show today's Chat AI usage and cost cap status on the admin settings page.
- [x] Share a subject's Chat conversations as Markdown from the iPhone Chat tab.
- [x] Add a Telegram /digest command replying with the weekly digest numbers.
- [x] Add a Telegram /chat command listing the oldest five waiting Chat cards with links.
- [x] Add j/k/Enter keyboard shortcuts to the web Chat list.
- [x] Show the weekly digest numbers on the iPhone Review tab.
- [x] Warn on the web Add screen when pasted text is very short and may extract nothing.
- [x] Offer Snooze and Unsnooze inside the web Chat thread view.
- [x] Show reject rate per subject on the statistics page to spot weak subjects.
- [x] Split detect-knowledge-bits.orchestrator.ts under 300 lines with no behavior change.
- [x] Show snoozed state and a Snooze action on the iPhone Chat tab cards.
- [x] Show nothing-extracted rate per week on the extraction statistics page.
- [x] Let the user export all Chat conversations of a subject as one Markdown file.
- [x] Add a Chat card search box and subject filter on the web Chat page.
- [x] Show a weekly digest card on the web home page: cards accepted, rejected, reviewed and Chat backlog.
- [x] Let the user snooze a Chat card for N days so it leaves the reminder count.
- [x] Remind the user in the Telegram bot about Chat cards waiting over three days.
- [x] Add a web Chat queue page to discuss cards parked from triage.
- [x] Show a reject-reason trend per week on the statistics page to see whether card quality improves.
- [x] Add detail level and hinting controls to the iOS subject Study options screen.
- [x] Let the user turn a useful Chat reply into a new card for the same subject.
- [x] Add a Chat queue count badge to the iPhone Home screen, refreshed after each swipe.
- [x] Show a Reject reasons breakdown on the statistics page so the user sees why cards get rejected.
- [x] Let each subject store its detail level and hinting on/off, applied when generating and reviewing cards.
- [x] Make the regeneration status report nothing-extracted notes instead of done, so every client agrees.
- [x] Show the Chat queue in the Mac Knowledge view with count badge, matching iPhone.
- [x] Web anki-review-done test fails on weekends because it expects the word tomorrow for a Monday due date.
- [x] API subject list returns a card count per subject for the Subjects screens.

### Notes


## fast-cold-start

### Scope
- Priority: high
- Out of scope: New features and anything with a standing monthly cost.
- The first load after idle takes about 30 seconds, and the goal is a few seconds.
- Use only pay-per-use fixes, with no minimum instances or paid always-on compute.

### Coding tasks
- [ ] [blocked: user] Decide whether the three remaining items stay once the boot fix is deployed.
- [x] Measure where the 30-second first load goes: container start, database wake-up, or app boot.
- [x] Shrink app boot time and the container image if the measurement shows startup is slow.
- [x] Try a free keep-warm ping and check it stays inside the free tier.
- [x] Compare AWS Lambda, Cloudflare Workers and GCP functions for the API on cold start and cost.
- [x] Check that Mastra agents and the Postgres driver fit Cloudflare Workers' 10 ms free CPU limit.

### Notes


## triage-chat-and-example

### Scope
- Priority: high
- Out of scope: Changing how cards are generated or approved, and any push to the remote
- Two new triage choices on web and iPhone: Chat about this, and Add an AI example

### Coding tasks
- [x] Each triage chat reply proposes one or two cards to approve or keep refining.
- [x] Animate a card shrinking toward the Inbox when sent to chat, so the move is visible.
- [x] Use a stronger general model, such as Gemini Flash, for chat on cards sent from triage.
- [x] Let learners edit cloze and list notes from Inbox rows on web and iPhone.
- [x] Web triage: swipe up asks AI to write an example for the card.
- [x] iPhone triage: swipe down sends to the Inbox, swipe up asks AI for an example.
- [x] Web triage: swipe down sends the knowledge item to the Inbox; a button does the same.
- [x] Add an Inbox deck of knowledge items sent from triage, with AI chat for each.
- [x] Write a plan for the chat inbox deck and AI example triage choices.

### Notes


## knowledge-retention

### Scope
- Priority: highest
- Out of scope: Adding the ts-fsrs library, audio and images, and any push to the remote
- A simple Anki-inspired retention system with few settings for exam prep and long-term learning

### Coding tasks
- [x] Let a subject be exam with a deadline or long-term, deriving interval cap and new-card pace.
- [x] Show retention intent, deadline, retention and new-card settings plus a short stats view on iOS.
- [x] Pause new cards automatically when daily reviews pile up past a limit, with a visible notice.
- [x] Show a subject forecast: reviews per day expected and when new material finishes before the deadline.
- [x] Write a plan for the study intent: exam with deadline versus long-term, derived limits and forecast.

### Notes


## study-goals-and-priorities

### Scope
- Priority: high
- Year, month and week priorities per subject, with progress tracked against them
- Out of scope: Levels, badges and rewards (the gamification direction)
- Daily study goals, and add-knowledge goals for hot subjects or sub-subjects

### Coding tasks
- [x] Set an add-knowledge goal for a hot subject or sub-subject and track notes added against it.
- [x] Set a daily study goal and show today's progress toward it.
- [x] Set year, month and week priorities per subject and show how far along each one is.

### Notes


## card-prompts-by-subject-kind

### Scope
- Business, language and other subjects each get their own card-writing prompt. Language learning keeps its original sentence-level behaviour.
- Out of scope: Changing how lessons are judged for business subjects.

### Coding tasks
- [x] Subjects hold optional custom extraction instructions and example cards that feed the extraction prompt.
- [x] Cloze review backs show the filled sentence, and review edits work on cloze and list notes.
- [x] Each cloze gap and list step gets its own review schedule, with sibling cards buried until tomorrow.
- [x] iPhone edit sheets edit a whole cloze or ordered-list note instead of failing with an error.
- [x] Triage lets the learner edit cloze and ordered-list notes instead of returning an error.
- [x] iPhone review and detail screens show cloze and ordered-list cards correctly.
- [x] Add an ordered-list card style: a card per step plus an overview card on step count.
- [x] Add a cloze card type with several gaps per note, in review and AI prompts.
- [x] Run each prompt version on the same stored sources and compare the cards side by side.
- [ ] [blocked: user] Business subjects get a better question-splitting prompt, once the user pastes the shared chat.
- [x] Language subjects keep their original sentence-level extraction, unaffected by the lesson-based pipeline.

### Notes


## triage-focus-mode

### Scope
- Triage cards appear only after Start triage and are judged one at a time
- Out of scope: Changing how kept cards are scheduled

### Coding tasks
- [x] Mac triage arrows: left rejects, right approves, up sends to chat, with an optional typed comment.
- [x] The focus card can be edited before approving, and approving a card approves all its variations.
- [x] Triage shows one card at a time with Reject and Approve buttons and arrow keys.
- [x] The approval page hides all cards until the user presses Start triage, so triage is never skipped.

### Notes


## concept-extraction

### Scope
- Cards teach transferable lessons and not sentence-level facts
- Out of scope: Changing review scheduling

### Coding tasks
- [x] Each lesson becomes one or two cards and a personal story yields its principle.
- [x] Ingestion first reads text against the subject intent and writes one to three transferable lessons.
- [x] Each subject carries a learning intent that sources inherit, with Business set to learning principles to apply.

### Notes


## gamification

### Scope
- Priority: highest
- Points and levels and badges from real reviews
- Out of scope: Leaderboards and social features

### Coding tasks
- [x] Research what keeps learners motivated beyond levels and badges, and write a plan for it.
- [x] Build the richer motivation system from that research plan, replacing plain levels and achievements.
- [x] Show a short celebration at the end of a review session with points earned.
- [x] Earn badges for milestones such as streak days and cards mastered, shown on a profile page.
- [x] Award points for each review and show a level that rises with total points.

### Notes


## auto-subject-assignment

### Scope
- Pieces that fit no subject get a very conservative suggestion; a subject that grows large gets sub-subject suggestions
- Nothing is created without the person approving it
- Out of scope: Creating or renaming subjects automatically without approval

### Coding tasks
- [x] A cheap grader weighs how large a subject has grown and suggests sub-subjects (modules).
- [x] A piece that fits no subject gets a very conservative new-subject suggestion for approval.
- [x] Subject and sub-subject suggestions show in one place where a click approves, edits or dismisses them.

### Notes


## knowledge-cleanup

### Scope
- Let the user quickly delete knowledge, one item or everything, with a safety step
- Out of scope: Deleting subjects, settings or tokens

### Coding tasks
- [x] Browser rows carry their source id, so a whole source can be selected and deleted.
- [x] Deleting a source stops its running extraction so it cannot re-add pieces afterwards.
- [x] In the Knowledge browser, select one or many pieces, or a whole source, and delete them quickly.
- [x] A Clear all knowledge button removes every piece, source and review history after a typed confirmation.

### Notes


## storage-and-vector-performance

### Scope
- Keep database storage and vector search small and fast as knowledge grows
- Out of scope: Switching to an external vector service

### Coding tasks
- [x] Measure search speed and table sizes on realistic data, then plan what to shrink or index.
- [x] Store vectors in half precision, or at fewer dimensions, if measured quality loss is negligible.

### Notes


## restore-local-subjects

### Scope
- Bring the user's earlier subjects, without their knowledge, back into the empty local database
- Out of scope: Any change to the cloud database

### Coding tasks
- [x] Copy the earlier subjects, without their knowledge, from the cloud database into the local one, read-only.

### Notes


## review-typed-answer-removal

### Scope
- Remove the control that switches the review screen to a typed answer
- Out of scope: Other review screen behaviour

### Coding tasks
- [x] Remove the button that switches the review screen to a typed answer.

### Notes


## pgvector-search

### Scope
- Semantic search over knowledge uses pgvector inside Postgres instead of comparing JSON arrays in application code
- Out of scope: External vector services and on-device search in the native apps

### Coding tasks
- [ ] [blocked: user] Enable pgvector on the cloud database, needs your cloud access (do before the next release).
- [x] Embed a knowledge piece and its kept variations automatically when approved, and search them by similarity.
- [x] Switch the local database container to an image that includes pgvector and enable the extension.
- [x] Add vector columns with an index beside the JSON ones, and backfill them from the stored embeddings.
- [x] Switch every similarity search to database queries on the vector columns, filtered by subject where relevant.
- [x] Drop the old JSON embedding columns once search runs on the vector columns and results match.

### Notes


## review-subject-chat

### Scope
- A chat with the user's knowledge on the review page, tied to the current subject
- Out of scope: Native apps and chat outside the review page
- Each message can carry context: the card on screen, or any text the user highlights in it

### Coding tasks
- [x] Review cards carry their subject, so the chat panel works on the home page too.
- [x] The review page has a chat panel, and each chat is tied to a subject.
- [x] Highlighted card text, or the current card, goes along as context with the chat message.
- [x] The chat answers only from the subject's own knowledge and shows which pieces it used.

### Notes


## home-page-subjects-and-review

### Scope
- The web home page has two parts: the list of all subjects, and the review screen where reviewing can start at once
- Out of scope: Native apps and new review scheduling rules

### Coding tasks
- [x] Home page leads with due, new and learning counts and one large Study now button.
- [x] Home page lists the busiest subjects as tidy cards with due counts and a Study button each.
- [x] Home page shows reviews done today, the streak and a recent-days activity calendar, as Anki users expect.
- [x] The logo opens a home page: subjects on the right, review, search and chat on the left.
- [x] Rename the page and sidebar entry called Dashboard, so the home page is simply the home page.
- [x] The sidebar lists the user's subjects, with a separate Subjects entry below them.
- [x] The home page also lists all subjects with their card counts, and clicking one opens that subject.
- [x] The home page shows the review screen so the user can start reviewing due cards immediately.

### Notes


## card-triage-feedback-session

### Scope
- Priority: highest
- A triage session over a batch of generated cards: bulk accept or reject instead of grading each card
- Out of scope: Per-card grading and review scheduling rules
- During the session the user gives overall impressions as free text, dictated or pasted, once for the whole batch
- When the session ends the feedback is stored and fed into the AI that generates future cards

### Coding tasks
- [x] Triage card shows question first, answer below, small optional example, scrolls if long, on web and iOS.
- [x] Each triage decision is stored with its session, order, timing and card details for later analysis.
- [x] Accept and reject take an optional note, editable until the session finishes, on web and iOS.
- [x] iOS triage starts only on a tap of Start, and a failed start shows a retry.
- [x] Test that style notes reach the fill-blank and question card prompts, as they do for basic cards.
- [x] A session reopened after a reload still counts the decisions made before the reload.
- [x] Pending-review data carries the subject id, so a triage session no longer matches subjects by name.
- [x] A stale or already finished stored triage session can be discarded, so Finish never gets stuck.
- [x] A triage session can be limited to one subject, taken from the cards on the review screen.
- [x] A triage session screen shows a batch of new cards for bulk accept or reject.
- [x] The session has one feedback box for typed, pasted or dictated text, sent at the end.
- [x] The API stores a finished session: its accepted and rejected cards plus the free-text feedback.
- [x] Turn the session's pasted or dictated feedback into short lasting style notes, using one model call.
- [x] Feed stored session feedback into future card generation prompts, capped in size.
- [x] Show the saved session feedback to the user and let them edit or switch off any note.

### Notes


## lambda-api-hosting

### Scope
- Host the API on AWS Lambda with a function URL for near-zero cost, ingest through Inngest cloud, live sync off in production
- Out of scope: Deploying, AWS credentials, domain changes and any always-on sync container

### Coding tasks
- [x] A build script bundles the API into the folder the cloud stack deploys.
- [x] Add the Lambda function, function URL and secrets to the existing Pulumi stack, with a concurrency limit.
- [x] Keep the daily LLM spend cap in the database so it holds across many Lambda copies.
- [x] Move after-response background jobs into Inngest steps or await them, because Lambda freezes work once it replies.
- [x] Split the API request handler from the server start so a Lambda entry point can reuse it.

### Notes


## web-sidebar-and-knowledge-browser

### Scope
- The web sidebar has three entries: Knowledge browser, Knowledge inbox, and Review of ready cards
- Out of scope: Native Mac and iOS apps and new review scheduling rules
- Knowledge browser: a list that opens a table of question phrasings, author, date added and answer

### Coding tasks
- [x] Add an icon to every other sidebar menu item so the menu is easier to scan.
- [x] Move Admin settings to the bottom of the sidebar and give it a gear icon.
- [x] Make web table column widths draggable and remembered per user in local storage.
- [x] Knowledge browser shows all cards in one table; Subjects opens the subject list, not the same page.
- [x] Review schedules each piece once but shows a different variation every time it returns.
- [x] Approval shows only the main card and approves the piece with all its variations together.
- [x] Triage shows the main card beside its variations, and any variation can be excluded.
- [x] The Knowledge browser shows each main card with its variations next to it, in one row.
- [x] Web sidebar shows only Knowledge browser, Knowledge inbox and Review of ready cards, other pages stay linkable.
- [x] Knowledge browser page lists the user's knowledge lists, and clicking one opens its table.
- [x] The API gives each knowledge piece its phrasings, author, date added and answer for the browser table.
- [x] Opening a list in the Knowledge browser shows a table of phrasings, author, date added and answer.
- [x] Table columns can be reordered by dragging their headers, and the chosen order is remembered between visits.

### Notes


## zero-cost-local-dev

### Scope
- Every part of the app runs on a laptop from one documented command set with no paid service needed
- Out of scope: Production hosting choices and moves to other clouds
- Developer experience is smooth: fast start, clear errors, one place for setup, tests that run offline
- Every paid service is listed, has a free local or free-tier path, and a spend guard

### Coding tasks
- [x] A spent-up daily cap returns a clear HTTP 429 to clients instead of a generic server error.
- [x] Mock mode switches off Langfuse tracing so offline dev sends nothing to the cloud.
- [x] A fresh dev database applies every migration, including 0097, and the journal order is fixed.
- [x] The API boots and core flows run on a mock LLM, with no OpenRouter key.
- [x] A daily spend cap and a mock-cheap-real model switch guard LLM calls.
- [x] One documented command set starts every part of the app on a fresh laptop clone.
- [x] A paid-service inventory lists each external service, its price, and its free or local alternative.

### Notes


## native-apple-apps

### Scope
- Native Swift iOS and macOS apps live inside this repo under apps/ios, local-first via PowerSync on the existing Postgres
- Out of scope: Replacing the Expo mobile app or the web app before PowerSync is proven

### Coding tasks
- [x] iPhone triage screen: Resume, Triage all and subjects at top; item list collapsed.
- [x] Mac app updates itself: CI attaches it to each GitHub release, the app checks hourly.
- [x] Native Add knowledge: add several raw pieces at once under one subject, like the web.
- [x] Highlight selected text with a configurable keyboard shortcut, default Command+D, on Mac and web.
- [x] Mac and iPhone apps ingest a picked or dropped text file through the web file import.
- [x] Mac triage hides the statement line above the question and answer cards.
- [ ] [blocked: user] Register Apple App ID and App Group for the Mac share extension.
- [x] Add a macOS share extension to the PostAnki Mac app, so right-clicking selected text in any app (for example the Claude desktop app) shows PostAnki in the Share menu. The panel has a subject picker with an "Auto" default that leaves the subject empty so the API's triage assigns one, and it saves the text as raw knowledge using the Mac app's existing login.
- [x] Let the user highlight phrases in a knowledge source in the Mac and iPhone apps to tell the AI which parts to pay attention to when shaping questions, as the web app already does. The apps send the highlight start and end positions with the source, and the question-shaping code reads them as today.
- [x] Filter the Knowledge overview by state and origin on the server, then use it on iPhone.
- [x] Bring the iOS app close to web parity: cards table, subjects tree with depth bar, triage, search.
- [x] A kept piece in pending review can be undone, restoring its dropped variants and pending state.
- [x] Mac Knowledge table column titles are not clipped when zoomed to 200%.
- [x] API takes the chosen one or two variants of a piece, drops the rest and approves it.
- [x] Block regeneration scans from re-creating variants of an approved piece the reviewer already narrowed down.
- [x] Shared selection model preselects the best variant, caps keeps at two, with tests.
- [x] Mac and iOS pending review shows one piece per screen with numbered variant cards.
- [x] Mac pending review keys: digits toggle variants, Return keeps and advances, X drops the piece, Z undoes.
- [x] Web pending review uses the same keep-one-or-two choice and number keys on each piece.
- [x] Mac app zooms with Cmd-plus, Cmd-minus and Cmd-0, scaling text and interface, remembered between launches.
- [x] Mac sidebar keeps only Knowledge, Knowledge Inbox, Review (cram), Subjects and Settings.
- [x] The Knowledge screen is a sortable table with columns, not a plain list.
- [x] The iOS app has the same Debug-only sync spike window and shows subjects offline in the simulator.
- [x] The Mac smoke tests and a Release build pass after the address and sync token changes.
- [x] The spike syncs subjects and topics using only API-minted tokens, with no dev-token fallback, checked live.
- [x] PowerSync sync rules also cover topics, and the Mac spike window shows them offline.
- [x] The Mac app uses the address saved in Settings, not production, and a test covers it.
- [x] The Mac app fetches fresh sync tokens from the API itself and keeps syncing past five minutes.
- [x] PowerSync accepts a token minted by the post-anki API and syncs the Mac app with it.
- [x] The iOS target builds for the simulator from apps/ios.
- [x] The post-anki API issues short-lived sync tokens that PowerSync checks through a public key endpoint.
- [x] The Mac spike runs from a signed, sandboxed build and still reads the local service.
- [x] A script builds and launches the native app, takes a screenshot, and main screens have accessibility identifiers.
- [x] The Swift iOS and macOS project from the old post-anki-ios repo lives in apps/ios here and builds.
- [x] The native app's local secrets file and build output never get committed to git.
- [x] The native app's config, ports and README point at this repo's API, not the old repo.
- [x] A short note compares PowerSync with Electric for native sync and records the chosen path.
- [x] One table syncs from dev Postgres to the Swift app via PowerSync and shows offline.

### Notes
- iOS auth and API-gap items in cross-surface-practice belong here. PowerSync Open Edition is free to self-host.


## durable-background-jobs

### Scope
- Background work (extraction, card generation, scans) runs on the Inngest workflow engine so it survives restarts and always ends done or failed.
- Inngest features that bound cost and protect the endpoint: signing, timeouts, retries, throttling, one run per source.
- Out of scope: Inngest Cloud, paid plans, and moving to another workflow engine.

### Coding tasks
- [x] Install the Inngest CLI and document how to look up production runs with it.
- [x] The durable extraction database tests pass again, with the new run-id lookup covered against Postgres.
- [x] Bursts of pasted material queue up instead of failing against the model provider's rate limit.
- [x] A source can never have two extraction runs active at once, so tokens are never spent twice.
- [ ] [blocked: user] Decide whether documentation change scans run on a built-in weekly schedule.
- [x] Only signed requests can start or run extraction jobs outside local development.
- [x] The Inngest library is listed in the API's dependencies so a fresh install works.
- [x] A hung extraction is cancelled after a time limit and shows as failed.
- [x] Extraction retries a failed model call only when it can help, and never multiplies paid calls.
- [x] Learner text stays out of the workflow engine's stored step results.
- [x] Turning approved sources into questions runs as a durable job that survives an API restart.
- [x] A regeneration the engine skips as a duplicate run never leaves its source stuck in processing.
- [x] A timed-out question-generation run queues a follow-up instead of leaving rows processing.
- [x] A provider rate-limit error is retried by one layer only, not by two stacked ones.
- [x] Card generation for a course's topics runs as durable jobs that survive an API restart.
- [x] Course research and outline drafting run as durable jobs that always end done or failed.
- [x] Courses started from a domain recommendation research on the durable engine like other new courses.
- [x] A late failure from an old course job never fails a newer one on that course.
- [x] A failed draft retry send never starts a second paid draft beside a live one.
- [ ] [blocked: user] Approve the Inngest CLI sign-in in the browser

### Notes
- Live extraction progress and model-call tracing can come later; research is in the inngest-features report.


## data-export

### Scope
- The learner can take everything they built out of the app as a file
- Out of scope: Importing data back

### Coding tasks
- [ ] [blocked: user] Import and export Anki .apkg decks, needs a dependency decision (recommend approve small maintained libraries).
- [x] Card export includes topic, tags, added date and every question, and opens cleanly in Excel.
- [x] Keep negative numbers in the CSV export as plain numbers, not quoted text
- [x] Let a cancelled card download end cleanly on the server instead of hanging
- [x] Let the learner download all cards and review history as a file

### Notes


## load-failure-recovery

### Scope
- Every page recovers from a failed load or unknown address with a plain message and a way forward
- Out of scope: Offline mode

### Coding tasks
- [x] A failed card list offers Retry instead of a dead-end message.
- [x] Settings show a clear message when a save fails and never lock the page.
- [x] Show a friendly error and not-found page instead of a crashed screen

### Notes


## article-knowledge-extraction

### Scope
- Priority: high
- Out of scope: Crawling whole doc sites, which doc-site-ingestion covers
- Summarize any article from a link
- Extract knowledge in the book-extraction format, saved only after the user approves

### Coding tasks
- [x] Store the final address after redirects as the article source link
- [x] Generate a short article summary at URL import and store it on the source
- [x] Clean article pages to main text, dropping menus, ads and comments, before extraction
- [x] Keep the article link as a source link on every item extracted from it
- [x] Show the article summary beside its extracted items in the approval screen

### Notes


## ai-web-enrichment

### Scope
- Priority: high
- Out of scope: Automated course or curriculum generation, and the existing own-cards chat in grounded-knowledge-chat
- Chat about any knowledge item when the learner still does not understand it, asking why
- Create extra cards from web search and web fetch, each marked with an AI label

### Coding tasks
- [x] Tapping a suggested related card in item chat opens a ready card proposal.
- [x] Item chat adds a few examples and nearby facts, each labelled web or own material.
- [x] Item chat uses a cheap web search by default to clarify a card, capped per reply.
- [x] Item chat checks the learner's own source material first, quoting the relevant part.
- [x] Add tests for source-first grounding, the search cap, web labels and related-card suggestions in item chat.
- [x] Item chat ends a clarifying answer with one to three suggested related cards the learner could add.
- [x] Decide whether the card example field is filled by web search always, only on demand, or never
- [x] Stop a late Make fact reply refilling the tray after Clear
- [x] Let the learner open item chat from any item in the knowledge overview
- [x] Fix the double JSON encoding of request bodies in the web api-client at two other calls
- [x] Add endpoint creating a pending sibling card from an existing item, used by chat drafts
- [x] Return AI label and source links on study review cards and show the badge there
- [x] Add a save-as-new-card draft flow with a web research option to item chat
- [x] Show an AI badge and source links on labelled cards in the web app
- [x] Mark cards drafted from web research with the AI label and store their source links
- [x] Let the item draft agent use web search and fetch results as sources for new cards
- [x] Add a web fetch tool to item chat so the tutor can read a cited page
- [x] Add an AI-origin label to knowledge items, defaulting to not AI for all existing rows
- [x] Return a structured card proposal from the chat draft agent, honoring dictated Q and A
- [x] Show card proposals inline in chat with approve, edit and reject
- [x] Make the item chat a keyboard-safe bottom sheet on phones
- [x] Add highlight actions and a card tray to the item chat
- [x] Remove the old one-button draft flow once inline cards replace it

### Notes


## sub-subjects

### Scope
- Subjects hold sub-subjects, e.g. Business: time management, sales, SMM, negotiations, HR, marketing
- Paste into, approve under and review by a sub-subject
- Reuse the existing subject-category nesting unless a decision says otherwise
- Out of scope: Domain-map tree changes; it stays a separate structure

### Coding tasks
- [x] Reviewing a parent subject mixes balanced new and learning cards from sub-subjects, favouring recently studied ones.
- [ ] [blocked: user] Run the Business sub-subject seed on production for the deeper Sales and Management levels.
- [x] Sales gets deeper sub-subjects such as cold sales; management gets delegation and people management.
- [x] Business gets its past sub-subjects: marketing, sales, SMM, hiring, director, communication, management and similar.
- [x] Knowledge items can only belong to a subject without sub-subjects, so assigning to a parent is refused.
- [x] Adding a first sub-subject to a subject moves its existing items into a new Common sub-subject.
- [x] Items under a subject that already has sub-subjects move to its Common sub-subject, unless directed elsewhere.
- [x] Automatic classification places new knowledge into sub-subjects, never into a subject that has sub-subjects.
- [x] Deleting a subject must move its sub-subjects up, not orphan them
- [x] Keep saved subject order after reload: map sortOrder, resync sortable group
- [x] Dashboard search box for subjects using the server search
- [x] Move subject page Rename and Delete into a three-dot menu
- [x] Add knowledge button beside New material, scoped to that subject
- [x] Review cards scoped to one sub-subject, including its children
- [x] Let pasted text and its items belong to a sub-subject
- [x] Subject menu: Add sub-subject and Move under actions
- [x] Drag subjects on the dashboard to change their order
- [x] Search subjects by name with a server-side database query
- [x] Delete subject warns what curricula go and sub-subjects move up
- [x] Keep focus inside subject menus after each step and delete
- [x] Move under picker marks current parent, indents tree, filters
- [x] Subject page header menu: same delete warning and nesting actions
- [x] Expand parent and highlight new or moved subject
- [x] Drag hint, larger grips, keyboard and touch reorder on subject page
- [x] Search: result count, retry button, visible clear button
- [x] Subject cards show due card counts rolled up from sub-subjects

### Notes
- Decided 2026-10-11: real nested subjects via parent link, not categories


## highlight-capture-extension

### Scope
- Chrome extension sends highlighted page text to the locally running post-anki
- Text lands as a knowledge source, same as pasting on /add-knowledge
- Source page URL travels with the text
- Out of scope: Filing into the curriculum hierarchy; the older chrome-extension-note-capture plan covers that

### Coding tasks
- [x] The extension shows an on-page message when saving a highlight to knowledge succeeds or fails.
- [ ] [blocked: user] Load unpacked, set token and EXTENSION_ID, capture a real docs page; README at apps/extension/README.md
- [x] Send highlighted text from Chrome to local post-anki as a knowledge source
- [x] Store the page link and title on a text capture sent to POST /knowledge-sources
- [x] Make the extension send link, title and subject, with a fixed ID and local API permissions
- [x] Show sending, saved and plain-words error status on the extension icon
- [x] Add an optional default subject to the extension options page
- [x] Write the extension run steps and check a real page capture end to end

### Notes
- Older capture extension sits unmerged on chrome-extension-note-capture; check before building
- MVP plan in .planning/chrome-extension-mvp/plan.md, local unpacked only, no store


## classic-anki-review

### Scope
- Paste text, approve suggested bits, review them as classic Anki cards
- Review shows question, reveals answer, learner self-grades Again/Hard/Good/Easy
- Self-grades drive the existing bit schedule; queue serves due cards
- Pipeline runs after paste without manual scan calls
- Out of scope: Replacing the typed-answer LLM-graded mode; it stays as a separate mode

### Coding tasks
- [x] A daily review limit ends the session with a done-for-today message, and review-ahead stays available.
- [x] Mac Review shows a collapsible subject tree with due new and repeat counts, and reviews on click.
- [x] On the Mac, Space, Return and numpad Enter all continue the review as Good.
- [x] A card graded Good or Hard is not brought back by queue refills in the same session.
- [ ] [blocked: user] Raise the session token cap so planned Anki-parity items can be built.
- [x] Add review statistics: due forecast for coming days, retention rate over time, and answer-button counts.
- [x] Pending items move from Review to Knowledge Inbox, and Inbox is renamed Knowledge Inbox everywhere.
- [x] Review drops typed answers: Space reveals ratings, keys 1-4 rate, Space again picks Good.
- [x] Select-all on All cards works on a Russian keyboard layout.
- [x] Today's review count and streak follow the learner's own midnight, not UTC.
- [x] Review shortcuts for undo, edit and suspend work on a Russian keyboard layout.
- [x] Show each card's source link in review and in All cards
- [x] Warn before adding a link or text that was already added, with an explicit add-again
- [x] Say why a pasted text or link was refused, next to the block that failed
- [x] Add controller tests for bulk move knowledge bits
- [x] Show human-readable relative time for next due card on done screen
- [x] Show today's count and streak on the done-for-today screen
- [x] Highlight overdue cards in amber on the knowledge overview table
- [x] Show study streak count on the session summary screen
- [x] Persist per-day review totals so streak tracking survives a page reload
- [x] Show fill-in-blank variant as a cloze card during study sessions
- [x] Decide durable workflow engine for extraction jobs; replace homegrown pipeline kicks
- [x] Harden knowledge extraction against prompt injection and unsafe input
- [x] Replace gemini-2.5-flash-lite default before OpenRouter drops it on 2026-10-20
- [x] Write cards from the whole source text, not sentence by sentence
- [x] Regenerate button on the approval page for a source
- [x] Phone tap targets at least 44px: menus, Add knowledge, Show answer
- [x] Allow the custom web domain in the API origin allow-list
- [x] Settings switcher to pick the extraction model from five candidates
- [x] Fix single-item review batch serving the same item twice
- [x] Show newly detected suggestions on the approval page without reload
- [x] Split approval review item and panel files under 300 lines
- [x] Explain approve, and that questions take minutes, on paste
- [x] Show per-row error when approve or reject fails
- [x] Stop checking-automatically text after polling gives up
- [x] Reorder nav: Add, Approve, Review
- [x] Rename approval page so Review means cards only
- [x] Fix Done for today showing when nothing was reviewed
- [x] Label Bury and Suspend in words; move below answer
- [x] Add aria-labels with interval to grade buttons
- [x] Stop a retried grade save from grading the card twice
- [x] Split the review queue repo file under 300 lines
- [x] Add Anki review mode: show answer, then self-grade Again/Hard/Good/Easy
- [x] Serve only due or never-reviewed cards in the unscoped review queue
- [x] Hide bit text above the question in Anki review mode
- [x] Run bit detection and question generation right after paste
- [x] Link review page from sidebar and add-knowledge success, with pending count
- [x] Refresh review page so bits awaiting questions become approvable
- [x] Add bulk approve on the knowledge-bit review page
- [x] Add simple front/back basic-card variant for plain recall facts
- [x] Keyboard shortcuts: Space reveals answer, 1-4 grade the card
- [x] Show the next interval on each grade button, like Anki
- [x] Add minute-level learning steps for new and failed cards
- [x] Cap new cards per day and show due and new counts
- [x] Undo the last grade with one click or keystroke
- [x] Show session progress and an end-of-session summary
- [x] Show done-for-today screen with next due time when queue empty
- [x] Edit a card's question or answer during review
- [x] Suspend or bury a card from the review screen
- [x] Flag leeches after repeated failures and suspend them automatically
- [x] Approve or reject suggestions by keyboard; approve all from a source
- [x] Hide the chat panel until the answer is revealed
- [x] E2e: basic cards generated, preferred in review, excluded from typed mode
- [x] E2e: basic card retries, overlapping runs, injection and backstop job
- [x] E2e: session summary, mid-review edit, undo suspend or bury
- [x] E2e: typed queue skips suspended and buried; timer finishes interrupted runs
- [x] Review screen: keep grade focus, retry button, explained counts and done step
- [x] Paste page: plain wording, saving state, labelled inputs and mode toggles
- [x] Script listing cheapest structured-output OpenRouter models with prices
- [x] Count pasted items as due on the dashboard without a curriculum placement
- [x] Page to list and unsuspend suspended or leech cards
- [x] Approve all asks to confirm and lists why items were skipped
- [x] Empty approval page points to Add knowledge
- [x] Raise hint contrast and touch target size on approval and review
- [x] Phone-width checks: no horizontal overflow on key screens, with screenshots
- [x] Cards keep the source language and never say the bit or the text
- [x] Write cards in parallel and show how many are ready
- [x] Detected items must stand alone, with no dangling this or that
- [x] Compare the five models side by side on the user's Russian text

### Notes
- Gap analysis: .planning/anki-scenario-review/report.md
- Model candidates: deepseek-v4-flash, gpt-oss-20b, gpt-4o-mini, mistral-nemo, ling-3.0-flash


## exam-prep-from-sources

### Scope
- Add a link as a knowledge source, not just pasted text
- Out of scope: Multi-page doc-site crawling stays frozen - single-link fetch only
- Reuse the existing paste-to-cards pipeline for link content, same tagging and placement
- Add a timed mock-exam practice mode with a score summary at the end

### Coding tasks
- [x] Add a timed mock-exam mode that scores answers and shows a summary
- [x] Let a learner pick exam mode alongside existing practice modes

### Notes
- Completed items archived to .planning/LOG.md.
- Full scope shipped as of 2026-10-04: link-as-source, timed exam mode with score summary, and a dedicated exam-start entry point all already existed in the codebase — this direction's own Notes were stale, not the backlog


## aws-electric-fargate-deploy

### Scope
- Move the API backend to AWS ECS Fargate, not Lambda
- Out of scope: Splitting into multiple sync tasks before a second real app with its own database exists
- Lambda doesn't fit the API's fire-and-forget background work (card compile, curriculum create)
- Self-host Electric sync on one shared, reusable Fargate service in the same ECS cluster
- Keep the Telegram bot webhook and the SSR web app on GCP Cloud Run for now
- Reuse the existing AWS Route53 domain for the new backend

### Coding tasks
- [ ] [blocked: user] Point the custom domain at the new backend, needs your DNS access.
- [ ] [blocked: user] Deploy the Fargate services and check API and sync are healthy, needs AWS access.
- [ ] [blocked: user] Set up AWS credentials and the secrets the new backend needs, only you can.
- [ ] [blocked: user] Shut down the live GCP backend once AWS is verified, needs your go-ahead.

### Notes
- Completed items archived to .planning/LOG.md.
- Bot can't run locally without a Telegram bot token and webhook secret
- Scope decision changed: web and bot now move to AWS too, GCP is being retired
- EXHAUSTED-AT-SCOPE (round 1, 2026-10-02) - IaC complete end to end, only live AWS credentials and manual cutover remain
- Open decision: SCF can't route Electric privately — pick Pulumi, SCF+shared-secret, or wait for SCF


## mcp-content-access

### Scope
- Expose post-anki's decks and course/module/section knowledge items through an MCP server, so any MCP client can read a learner's content
- Read-only access first: list/browse/search decks, courses, modules, sections, and individual knowledge items
- Out of scope for now: MCP write access (creating/editing content), auth beyond the app's existing per-user model
- Out of scope: Building a new UI for this — MCP clients are the interface

### Coding tasks
- [x] check_duplicates also flags near-duplicate drafts that differ only in case, spacing or punctuation.
- [x] Import the Business deck as one resumable Inngest job that submits notes in batches.
- [x] Add a check_duplicates MCP tool returning existing sources and cards that match given draft texts.
- [x] Let MCP clients open one knowledge bit found by search, with its source and questions
- [x] Let MCP clients read a source's approved knowledge bits with their study questions
- [x] Let MCP clients list added knowledge sources with title, link, status and approved bit count

### Notes
- Completed items archived to .planning/LOG.md.
- Pre-existing: unset API_SHARED_SECRET lets every request through — confirm prod always sets it
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-30)


## spaced-repetition-scheduling

### Scope
- Per-knowledge-bit review scheduling with a simple SM-2-style interval, ease factor, and due date, rolled up to topic, module, and curriculum for a due count
- Out of scope: Cross-subject ranking or priority weighting across different topics - that is study-prioritization's own open call

### Coding tasks
- [ ] [blocked: user] Build the FSRS scheduler with a retention setting, once ts-fsrs is approved (recommend approve).
- [x] Remove leftover card schedules when edits replace a note's cards, so they never show up later.
- [ ] [blocked: user] Approve adding the ts-fsrs library; FSRS scheduler is planned and waits for this.
- [x] Add per-subject study options: new cards per day, learning steps and desired retention, with app-wide defaults.
- [x] A saved setting never shows a save error when only the page refresh after it fails.
- [x] Stop an older sidebar count reply from overwriting a newer one during fast grading
- [x] Let the learner set the daily new-card limit in settings, default 20
- [x] Keep the sidebar review count current after grading and on the learner's local day
- [x] Show new card count alongside due count on the Review nav link
- [x] Wire per-topic due count into the curriculum topic list view
- [x] Show total due cards count on the Review nav link in the sidebar

### Notes
- Completed items archived to .planning/LOG.md.
- Balance goal: no due-pile guilt, but no skimming past a bit before it is truly known
- Checked: schedule updates per variant answer, not per bit/session — matches Scope wording, not a bug
- getDueCountsForTopics is now called by curriculum.repo.ts buildModules (wired 2026-10-13)


## prose-knowledge-fisher

### Scope
- Accept raw prose or a Notion database as a knowledge source, not just structured rows
- Auto-detect distinct knowledge bits inside a block of prose
- Auto-tag each bit from one shared taxonomy of roughly 20-50 tags, reusing and growing it rather than inventing tags per bit
- Place each bit into the existing subject-curriculum-topic hierarchy, same as any other card
- Generate a few question variants per bit (open Wh-questions, fill-in-the-blank, others) probing the why, not just the fact
- Ask follow-up questions as a knowledge fisher persona that digs for the reasoning behind a fact
- Track per-tag and per-topic knowledge strength from how the learner answers, and update it as new answers come in
- Use that tracked strength to advise the learner where to go deeper
- Out of scope: The existing Biz Education Notion pipeline and generic notion-deck-connectors router stay separate pipelines
- Embed submitted knowledge bits and AI-generated Q&A into the existing vector pipeline, traceable back to their source bit

### Coding tasks
- [x] Text saying "ask AI" extracts only evident facts and opens a web chat.
- [x] Add knowledge input lets the learner highlight several passages, overlaps allowed, to focus extraction.
- [x] Split long pasted text into sources with a cheap model, then extract knowledge normally.
- [x] The database tests for approving, processing and regenerating knowledge items pass under the current approval rules.
- [x] Typed-answer mode lets the learner skip a question and submit with Ctrl+Enter.
- [x] Keep the typed answer and offer a retry when grading or loading fails
- [x] Remove dead review-item props and unused export, make Grade button 44px at every width
- [x] Check grading an already approved or rejected card works through the grade route, with a test
- [x] Keep a card's grade when a rejection is undone
- [x] Make approve and reject reuse a card's graded pending feedback row instead of adding a second
- [x] Let a pending card be graded before it is decided, through a new grade route
- [x] Stop opening the feedback box automatically after every decision; let the learner grade a card on demand from the card itself, so grading is a choice rather than a step in every approval.
- [x] Keep a card in the review table after it is approved or rejected, showing its decision as a status, so the learner can take the decision back at any time instead of losing the row.
- [x] Export private helpers from detect orchestrator needed by Inngest steps
- [x] Wire Inngest extraction dispatch on paste (when DURABLE_EXTRACTION=1)
- [x] Hide a rejected bit from the admin placement-suggestions queue too
- [x] Hold new knowledge bits as pending until the learner approves each one
  - [x] Phase 1: approval column and approve/reject/edit API
  - [x] Phase 2: block learner-facing surfaces
  - [x] Phase 3: review screen
- [x] Generate a fill-in-the-blank variant for each knowledge bit
  - [x] Phase 1: schema and migration
  - [x] Phase 2: fill-blank agent and repo
  - [x] Phase 3: orchestrator and route
  - [x] Phase 4: tests
- [x] Feed prose-sourced bits into the existing per-topic knowledge tracking
- [x] Finish Notion-database ingestion (stuck, see accept-notion-source/todo.md)

### Notes
- Completed items archived to .planning/LOG.md.
- Per learning-brain's rule, deepen advice stays pull-only — never a push notification or a waiting-count badge
- Reuse tags table (schema.ts:791), biz-education's classifier, gap-mastery, and domain-recommendations — don't rebuild
- Default call: reordered items by dependency, rewrote 4 toward reuse after an overlap audit
- Embeddings: cheapest provider. Classification/placement calls: cheapest model that can classify + search, below cheap-tier if one exists
- STUCK (2026-09-24): tag-taxonomy-cap hit 3 review FAILs — don't re-attempt, work the 4 split-out items
- Stuck (2026-09-24): accept-notion-source hit 3 review failures — do not re-dispatch
- Stuck (2026-09-24): fill-in-the-blank-variant hit 3 review-factory FAILs, don't re-dispatch. Code landed unreviewed in a395949 (swept by an unrelated mark-done); one more regex bug found and fixed manually after that (f6fe80f) — needs a fresh review pass before trusting it fully
- Resolved (2026-09-24): follow-up-question — Pass 1 FAIL fixed fail-soft, Pass 2 PASS; advisor then found the prompt was kind-blind
- Blocked (2026-09-24): topic-tracking item — progressMaturity is gap-derived, no safe write path for bits
- Fresh review of fill-in-the-blank ran: FAIL on correctness and tests, 4th straight failure, stuck
- Possible unblock for topic-tracking: read-time fold of bit attempts, no progressMaturity write — needs human sign-off.
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-02) - fill-blank and notion-ingestion stuck, topic-tracking needs human sign-off per its own plan folder
- Checked live: cheaper OpenRouter models split sentences into bad fragments — keeping deepseek-v4-flash


## biz-education-distiller

### Scope
- Every 15 min, pull up to 20 PA-tagged Biz Education items not yet marked synced
- Skip any item that contains a question
- Classify each with a cheap AI model: fits an existing deck, or needs a new one
- Fit items become facts linked to that topic; unplaced items land in an inbox with a suggested hierarchy spot
- Mark a Notion row synced via a real Notion property once processed — never remove or archive it
- Out of scope: The generic notion-deck-connectors router and its facts/CRM routing — this is a separate, Biz-Education-specific pipeline

### Coding tasks
- [ ] [blocked: user] Wire NOTION_TOKEN into the deployed API before the 15-minute job goes live, needs your secret.

### Notes
- Completed items archived to .planning/LOG.md.
- Confirm Notion's Tags filter is case-sensitive — a lowercase "pa" tag might now be silently excluded
- Biz Education data source: collection://3cddec4d-fc6e-805c-93ea-000bc235a121, real Tags option is PA.
- A cheap OpenRouter tier already exists (tierToModelId 'cheap' = deepseek-v4-flash) — reuse it, don't add a new model.
- Marking synced needs a write-capable Notion token — current one may be read-only.
- PostAnki Synced (date) property already added to Biz Education — read/filter on it, don't recreate.
- Confirm apps/api's own NOTION_TOKEN can write pages.update before wiring the sync-mark step.
- EXHAUSTED-AT-SCOPE (round 1, 2026-10-02)


## notion-deck-connectors

### Scope
- Configure a Notion page or database as the source for one deck's cards
- Support both a plain paragraph-style page and a table/database-style page
- Each connector runs on its own schedule (nightly, daily, or manual), unattended
- Each connector has its own configurable rules: which items it pulls (e.g. by tag), and whether it removes or keeps an item in Notion once imported
- New cards from a connector feed into the same vectorize-and-label pipeline as any other card
- Out of scope: Automated multi-module course generation from an arbitrary link — stays frozen; non-Notion connectors for now

### Coding tasks
- [x] Remove Notion ingestion from API, web and apps, keeping cards already made from Notion.
- [ ] [blocked: user] Register the English phrases Notion page as a production source for English for IT.
- [ ] [blocked: user] Pull the two seed Notion pages read-only and inspect their shape, needs a Notion token.
- [x] Store ingestion sources with page URL, target subject, items per run, frequency and a keep-or-remove-after-import setting.
- [x] Add an Ingest Now action for each source that imports it immediately.
- [x] Add the same sources screen and remove-after-import toggle to the iOS app.
- [x] Add the same sources screen and remove-after-import toggle to the native Mac app.
- [x] Let the user configure the Notion MCP connection in settings, with credentials kept out of the page.
- [x] Run each source on its own schedule, removing imported Notion items only if its toggle is on.
- [x] Let the user pause, edit or delete a source in the web app.

### Notes
- Completed items archived to .planning/LOG.md.
- Seed-page pull stalled this session — Notion MCP not logged in, needs human /login
- Schedule is a 15-min macOS LaunchAgent with a read-only Notion token, no deploy — off means skipped, never replayed.
- Open: approve @notionhq/client (official SDK, read-only token) for the app-side pull — not in TECH-STACK-BY-PROJECT.md yet.
- Notes become facts, not cards — the two 'into individual cards' items are met by the fact route.
- Blocked on the Notion MCP being connected — no live Notion access yet, do not start real work.


## local-first-sync

### Scope
- Finish turning on the already-built Electric sync in production
- Extend local-first sync to the existing mobile app, which is plain REST today
- Out of scope: The Tauri desktop wrapper — already tracked separately, blocked on a missing Rust toolchain

### Coding tasks
- [ ] [blocked: user] Turn on the prod Electric rollout flag once its database secret is set, production change.

### Notes
- Completed items archived to .planning/LOG.md.
- Electric is fully built (dev, prod infra, 6 web collections) — prod never started, missing DB secret.
- Blocked on the prod Electric DB secret — see Manual steps. Do not flip the flag before it's set.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-19) — blocked pending human call, see above.


## grounded-knowledge-chat

### Scope
- Vectorize every card's question/answer content, reusing the existing embeddings pattern
- Label cards along existing dimensions only — subject, topic, tags, domain-map, no new taxonomy
- A global AI chat that answers from the learner's own card knowledge first, general knowledge only if allowed
- Out of scope: Automated course/curriculum generation from a link — frozen, see doc-site-ingestion's own Notes

### Coding tasks
- [x] Add a UI entry point to chat with a single knowledge item
- [x] Fix nondeterministic domainNodeName and add negative filter tests for card labels
- [x] Surface a card's subject, tags, and confirmed domain node alongside its topic
- [x] Show which cards grounded each chat answer, so it's never a black box
  - [x] Enrich chat response with card display data
  - [x] Render grounding cards under each reply

### Notes
- Completed items archived to .planning/LOG.md.
- 5 unfixed review-factory findings (allowGeneralKnowledge threading, matchedCards shape, matchedCards default, domainNodeName ordering, tags ordering) all verified fixed in code 2026-10-13 — safe to archive.
- On a card-lookup failure, the tutor prompt now returns lookup-unavailable rather than no-cards-matching — fixed 2026-10-13.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-19)


## prompt-and-performance-quality

### Scope
- LLM prompt quality across generation call sites — grounding, tone, accuracy
- App performance — page load, query speed, bundle size
- Out of scope: New user-facing features or browse surfaces (see content-browser-and-search); model tier or routing policy (see llm-cost-observability)

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- practice.$subjectId's sequential loader is correct — settings fetch upserts, gating avoids a write for invalid subjects.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-16)


## content-browser-and-search

### Scope
- A browsable cards table with question/answer/topic columns, searchable
- Drag-and-drop for reordering or organizing browsed content
- Natural-language topK search across topics and modules, ranked matches
- Out of scope: Generating new cards or course content — browsing and finding what already exists, not authoring it

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Cards-browser table has no pagination/limit — low priority, curriculum-scoped so bounded
- Card variants have no cross-topic order column — nothing for drag-reorder to persist to.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-16)


## agentic-framework-and-tool-principles

### Scope
- A written, grounded set of tool-call and agent/subagent conventions for post-anki's own AI framework, drawing on real lessons from building and studying other agent harnesses
- A persistent memory solution for post-anki's own AI framework, and the agents/subagents this actually needs, built out where genuinely missing
- Out of scope: Rewriting an existing, working agent from scratch just to match a new convention — apply this to new/missing pieces and real defects, not a wholesale rewrite

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-02) — one dup found, routed to spaced-repetition-scheduling, fixed


## shareable-browser-search

### Scope
- The post-anki web app supports a shareable URL for a search or browse state, so a link can be sent or bookmarked and reopens the same view
- Out of scope: Adding new search capabilities beyond what already exists — only making the existing search/browse state linkable

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Manual subject pick doesn't update the URL — a later URL change could revert it
- Global search lives in the root layout, not a route — not linkable, out of scope.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)


## ingestion-progress-visibility

### Scope
- When a new URL or doc page is added as a source, show clear processing state: which step is running, a rough progress estimate, and plain-language descriptions with no technical jargon
- Show a running count of cards generated so far, with cards and study material visible immediately in the post-anki browser as they land, not only once everything finishes
- Out of scope: Changing the underlying ingestion pipeline's actual steps — only making its existing state and output visible as it happens

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- StructureDraftPending already auto-refreshes every 2.5s while a draft is pending — not a gap.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.


## instant-study-cards

### Scope
- Generate a topic's cards (concept + rephrased-answer variants) automatically once its content is ready, not only when a learner opens it and clicks generate
- Trigger generation across many topics without wasted duplicate work or overwhelming the LLM queue
- Out of scope: Rebuilding the cards agent's variant-generation approach itself — the concept + 3-5 rephrased-variants design already exists and stays as-is

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.


- updatedAt isn't refreshed mid-run, so an unusually slow run could get reclaimed early
Business and architecture-level open items only. Small mechanical gaps get fixed directly.

Each root item below is one separate autonomous session, worked sequentially — not batched.
- A newly created bare topic has no content yet — no valid trigger point at creation.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)

## Wishlist for the night


## Decisions to make

- [x] Merge the courses home page and the dashboard into one, using the dashboard's design.
      Implemented; drag-and-drop between subjects is not yet reliable and is tracked separately.
- [ ] Register the drag-and-drop library in the shared tech-stack registry, which lives in
      another repository this run deliberately did not touch.
  - Manual, cross-repo — not a post-anki coding session.
- [ ] Turn on live-updating sync in production, or remove it entirely. It was deployed once and
      has never passed a health check since, so it currently serves no traffic. Check real
      billing before assuming it costs nothing.
  - [x] Decide: keep and fix, or remove — needs a human call before either path starts
- [ ] Splitting a subject, course or tag into pieces needs product design first: how does the app
      decide which existing content goes where?
- [ ] When discovering doc-site sources for an existing course, should candidates be saved
      immediately and go through the same approval flow as new courses, or be reviewed in the
      browser and submitted only once accepted? Currently the reversible second option. Revisit
      if it feels wrong in practice.
- Nothing creates personal API tokens, so MCP uses the shared secret; add token creation or keep it

## To review / clarify

- [x] Review suggestions for the knowledge map can come back empty with no error — it just looks
      like nothing happened.
  - Fixed as item 8 of the autonomous batch, issue #103 — a completed review with zero results
    now says so explicitly.
- [x] Adding more source material to a course can silently delete modules merged in from another
      course, with no warning.
  - Fixed as item 6 of the autonomous batch, issue #103 — merge-provenance now locks a module
    against deletion the same way learner progress does.
- [x] Retrying research on a course that absorbed another can delete the absorbed course's
      original source links.
  - Fixed as item 7, issue #103 — `sources.mergedFromCurriculumId` added (migration
    0050_happy_killraven), retry-research now spares merged-in sources.
- [x] A retry-research pass has no ordering guarantee over which surviving source becomes the new
      entry point, so it could in principle pick an absorbed course's URL over the target's own.
      Not data loss, surfaced while fixing the item above — needs a look separately.
- [x] A manual scan for new docs can return nothing while a scheduled scan runs for a different
      subject, because scans are serialised across the whole app instead of per subject.
  - In progress as item 9 of the active autonomous batch, issue #103.
- [x] The mobile app has two narrow address-safety gaps around local development and non-secure
      connection types. Low real-world risk, not yet hardened.
  - [x] Identify the two gaps precisely (local-dev addresses, non-secure connection types)
  - [x] Harden both, matching the safe-address check pattern shipping as issue #103 item 10

## Manual steps

- [x] Wire the API's database-backed test suite into the build pipeline.
  - [x] Confirm which test suite/config needs CI wiring (the integration config)
  - [x] Add it to the existing CI workflow, with a real DB service in CI
  - [ ] Confirm it runs green in CI before merging
- [ ] If live sync goes to production: set its database secret, then turn on the feature switch.
- [ ] The cloud development database is missing recent updates, so the board fails to load
      against it. Needs someone with access to apply them.
- [ ] Three database updates from the concurrency work exist only locally, not in the cloud.
- [x] Confirm Playwright gotcha notes got committed in verification-repo (outside this repo's
      autonomy).
- To test the MCP knowledge tools locally, paste and approve a source first; the local dev database has none

## Post-deploy checks

- [ ] Once live sync is running: confirm a long-lived connection is not cut short by a timeout.
- [ ] Once live sync is running: confirm an unauthorised data request is rejected against the real
      production address, not just locally.

## Resolved

- 2026-08-05 — TODO.md wrongly implied an unmerged branch was live; corrected.
- 2026-08-05 — Tests polluted the live local database with fixtures; they now run against an
  isolated throwaway database.
- 2026-08-05 — Courses could only be reorganised by deleting and recreating them; added a proper
  move-to-another-subject action.
- 2026-08-05 — A stale tracking bug permanently hid one database update locally, breaking
  duplicate-subject detection.
- 2026-08-01 — Concurrent phrase-bank generate and grade calls could deadlock.
- 2026-08-01 — A knowledge-map review with zero suggestions silently looked like nothing happened;
  now fails loudly.
- 2026-08-01 — Creating a course during a concurrent subject merge could orphan it.
- 2026-08-01 — Tag assignments needed a manual page reload to appear.
- 2026-08-01 — A server-only import could silently break the web app in production; the build now
  catches it.
- 2026-08-01 — Double-clicking accept or reject on a doc-scan suggestion could create a duplicate
  knowledge-map entry.
- 2026-08-01 — Merging two subjects left the losing subject's pending suggestions stuck and
  invisible forever; they now carry over.
- 2026-08-01 — Deleting a subject during a concurrent merge could destroy or orphan courses.
- 2026-08-01 — Deleting a subject could hang the app under load by holding two database
  connections per delete; now uses one.
- 2026-08-01 — An exhausted connection pool could hang forever with no error; now fails loudly.
- 2026-08-01 — Four database-backed tests were silently not running in either configuration.
- 2026-08-01 — Investigated a flaky course-merge test; traced to a known rendering timing issue,
  not a new bug.
- 2026-08-01 — Confirmed a real timing gap where controls far down a page look clickable before
  the app has attached their handlers.

## data-integrity-under-regeneration

### Scope
- Every module/topic/source mutation path (regenerate, retry-research, merge, clear) preserves content it doesn't own
- Extend merge-provenance protection to any remaining unprotected bulk-delete/regenerate call site
- Add regression tests proving specific content survives a specific mutation
- Out of scope: new merge/regenerate features themselves — only hardening existing mutation paths against data loss

### Coding tasks

### Notes
- Edit-vs-answer race (no row lock) is a precondition to fix before wiring UI/MCP to this endpoint
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — deep audit found no unguarded bulk-delete/regenerate path.

## safe-address-hardening

### Scope
- Every URL reaching the browser or getting server-fetched passes through isSafeSourceUrl/guardedFetchText
- Audit new call sites as they're found
- Out of scope: the two unmerged branches (curriculum-add-sources-easily, module-topic-expand-web-search) and building a new safety mechanism — only applying the existing one consistently

### Coding tasks

### Notes
- DNS-rebinding (no IP pinning) is a separate gap — new mechanism, needs human call
- Mobile gap already fixed pre-run — assertSecureUrl in client.ts blocks non-loopback HTTP.
- 4 components rely only on the shared safeHref unit test, no dedicated component test yet.
- Completed items archived to .planning/LOG.md.
- Route file curriculum.$curriculumId.tsx has no dedicated safeHref test — no route-test pattern exists yet.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Only unguarded citation-render site left is on the unmerged module-topic-expand-web-search branch.
- Route-test pattern for safeHref now exists — see curriculum.$curriculumId.test.tsx.
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-03) — broad re-sweep of fetch/render/redirect/MCP sinks found nothing new
- Watch: knowledge-source intake is text-only today — guard its fetch/render once a URL-extracting scan is built

## study-prioritization

### Scope
- What's the single best next thing to study across every subject, at any moment
- Due-today queue, gap triage, cross-subject ranking, priority review accuracy
- Out of scope: new study modalities — only ranking/selection logic

### Coding tasks

### Notes
- listNextQuestionVariantsToAnswer also skips the confirmed/dormant filter via direct topicId
- Knowledge-bit due review never joins the cross-subject queue — needs a human design call
- Completed items archived to .planning/LOG.md.
- Ceiling-relative depth ranking and the dismissed-gap check-in revisit path are both intentional, not bugs.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- Chat card retrieval ignores dropped topics too - hide or keep? Needs a human call

## calibration-and-depth-accuracy

### Scope
- How accurately the app senses what depth a learner is actually at
- Calibration quiz quality, depth election correctness, go-deeper accuracy, headroom-offer correctness
- Out of scope: new quiz question types — only depth-signal accuracy

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Open: should near-perfect (not flawless) multi-question accuracy elect deep? Needs a human call.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Open: no learner-facing signal when a retake is kept-not-overwritten by the new depth guard. Needs a human call.

## doc-site-ingestion

### Scope
- Learn-from-a-doc-site's own remaining scope: source granularity, module/topic sizing, source-discovery review flow
- Extending to other source types over time
- Out of scope: rebuilding the crawler itself — reuses gatherDocSiteCandidates as-is

### Coding tasks

### Notes
- Source triage already exists: SourceApprovalPanel gates candidates pre-structure.
- Out of scope: restoring approve/reject decisions across a retry — no record of prior decisions exists to restore.
- Completed items archived to .planning/LOG.md.
- Crawl fallback caps at 8 links with no signal — no message channel exists to surface it.
- Entry-point ordering is already deterministic — resolveRetryResearchSource prefers own sources; flat note is stale.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.

## llm-cost-observability

### Scope
- Every LLM call site is tiered/bounded appropriately and its cost is visible
- Retry/backoff discipline, context growth, caching across curriculum/probe/lecture/study-material generation
- Out of scope: changing which model each call uses — only cost visibility and guardrails, not model selection policy

### Coding tasks
- [x] Cover skipped items in the subject and source duplicate scans with tests
- [x] Report embedding scan counts from items actually saved, not items attempted
- [x] Keep every chat's prompt bounded by sending only recent conversation turns
- [x] Stop one oversized text from failing every embedding batch it lands in

### Notes
- Message-length cap doesn't bound transcript array item count — total prompt size still unbounded
- Unverified: one oversized bit body could fail a whole 200-item embedding batch repeatedly
- No generation-result caching layer exists — needs a human call on invalidation policy first.
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- Re-checked 2026-10-02: resolveOfficialDocsUrl and gatherTrustedSourceCandidates already wrap generateWithRetry, stale note removed

## discovery-and-navigation

### Scope
- Finding and organizing content once the knowledge base outgrows a flat list
- Global search, dashboard, domain map, tagging
- Out of scope: new content types — organizing what already exists

### Coding tasks
- [x] Hide declined topics and unconfirmed curricula from global search and tag browse

### Notes
- CORS bug fixed (WEB_ORIGIN header, server.ts:261) — was blocking browser-side fetches.
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- A real item shipped under this direction after the exhaustion marker — re-evaluate next round.
- Found, out of scope: listTopicsForTag (tag.repo.ts, probe-session direction) has an unbounded query — needs filing elsewhere
- Blocked: fix reverses plan.md:59-63's intended dormant/included search behavior - needs human call

## chat-driven-reorganization

### Scope
- Natural-language move/merge/split/rename of the knowledge structure via chat
- Confirmation before any destructive reorganize action
- Out of scope: non-reorganize chat features (Socratic dialogue, Q&A) — those are separate directions

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Blocked: the only tool-calling chat surface is contractually read-only; needs a confirmation UX and a human decision.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — blocked pending human call, see above.

## cross-surface-practice

### Scope
- Letting the learner practice and get nudged from wherever they already are
- Telegram digest, mobile study app, Chrome extension capture consistency
- Out of scope: building a brand-new surface from scratch — hardening/extending existing ones

### Coding tasks
- [ ] [blocked: user] Decide iOS auth: token-mint endpoint or manual token, and chat field text vs content
- [ ] [blocked: user] Unify API error status codes across web and iOS, which both depend on today's
- [x] Add a router test proving specific routes resolve before their parameterised siblings
- [x] Send every knowledge-source error through sendError with a message, keeping status codes unchanged
- [x] Recheck key API endpoints and fix problems, coordinating with the post-anki-ios worktree's API gaps

### Notes
- Completed items archived to .planning/LOG.md.
- Bot probe-flow has the same selfOutcome gap, but quick_test mode is unreachable there today
- Chrome extension is unmerged on an abandoned branch — needs a human call on landing it
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED round 2 (2026-10-03): web scoring, voice race checked, no bug

## the-me-agent-integration

### Scope
- Connecting post-anki to the-me-agent's vault/learning-map via MCP for mentor context and course recommendations
- Out of scope: changes to the-me-agent itself — post-anki's side of the integration only

### Coding tasks

### Notes
- MCP is stdio-only; post-anki runs on Cloud Run — no prod path without a networked transport
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-12)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- post-anki now has a networked MCP transport — re-check this blocker once live in prod.
- EXHAUSTED-AT-SCOPE (round 3, 2026-10-02) — re-verified: vault MCP is stdio + local SQLite/notes, no network path yet

## e2e-reliability

### Scope
- Automated coverage for user-facing flows is reliable and non-flaky
- Fixing known-flaky tests, hydration-wait timing, locked-test maintenance
- Out of scope: writing coverage for brand-new features — this is fixing what already exists

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Blocked: this run cannot execute Playwright, so a flaky-test fix can't be verified.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Tag-picker's open click can be missed on a long page — hydration signal is global-only, no per-component fix yet.
- No 'locked test' convention found in verification-repo — that item is unresolvable here.
- Stale: tag-picker already uses per-component useHydrated gate, not global-only

## curriculum-structure-quality

### Scope
- Drafted course structure (module/topic sizing, granularity) is trustworthy without manual re-editing
- Source-discovery review flow decision follow-through
- Out of scope: the ingestion mechanism itself (doc-site-ingestion's job) — this is about quality of what gets drafted

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- No grounded gaps found yet — swept structure code, prompts, editing tools.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.

## Notes

## english-meeting-phrases

### Scope
- Ingest the user's meeting-phrases Notion page as raw knowledge, read-only, so phrases stay in Notion and a re-import skips ones already imported
- Each phrase becomes one card: the front is a short English situation with a context line, written as a Russian speaker might say it clumsily, and the back is the natural phrase
- Phrases that look misheard or non-native are flagged, and the back shows the original beside an AI-suggested version with an AI badge
- Cards land in Triage like any other card, with subject English and sub-subject English for IT
- Priority: medium
- Out of scope: Scheduled Notion sync, other Notion pages and deleting anything from Notion; the Notion connector work stays in notion-deck-connectors

### Coding tasks
- [x] Cards get a Context field shown first, Front holds only the question, Back the answer.
- [x] Each phrase gets three situation variants paired with its sentences, so Triage shows front and back variations.
- [x] Phrase cards offer three sentence options in Triage, picked with arrows, Enter or X.
- [ ] [blocked: user] Run the first real phrase import from Notion, needs the MCP connection.
- [x] Ingest the phrases as raw knowledge and skip any already imported, so a re-run adds nothing twice.
- [x] Flag misheard or non-native phrases and show an AI-suggested version beside the original, with an AI badge.
- [x] Turn each phrase into a card with a situation front and the natural phrase on the back.
- [x] Create the English subject and English for IT sub-subject if missing, and send cards to Triage.

### Notes

## cloze-cards

### Scope
- Support Anki-style cloze cards, where one sentence hides one or more words and the learner recalls them, as a card format PostAnki can create with AI and by hand and review like any other card.
- Accept cloze notes from Anki exports so a migration keeps them as clozes instead of flattening them to plain question and answer.
- Out of scope: Backfilling existing cards that already use blanks like ____ in their text; those stay as they are.

### Coding tasks
- [x] A long imported Anki cloze note becomes one cloze card with no stray extra cards.
- [x] An imported cloze note's example is shortened at a word or sentence end, never mid-word.
- [x] Add a cloze card kind with a stored sentence and the hidden spans, so the review screens can show the sentence with blanks and reveal the words.
- [x] Let the manual card form and the AI card generation produce cloze cards when a fact is best learned as a sentence with hidden words.
- [x] Parse Anki cloze markup (the cloze spans in HTML exports and the double-brace c1 syntax) into the cloze card kind during imports, so Business.txt-style exports migrate without losing the format.

### Notes
- EXHAUSTED-AT-SCOPE (round 1, 2026-11-08)

