# Product improvement candidates

Method: read apps/web routes and components, the API behind them, .planning/TODO.md (all directions' Scope and Coding tasks), .product/REJECTED.md and .product/PRINCIPLES.md. All paths are repo-root relative. Each item is buildable locally (no credentials, AWS, Notion, iOS or paid services) and respects the principles (no gamification, no guilt nudges). Ranked by user impact.

Note: uncommitted in-flight work exists for "mark source processed" (apps/api/src/knowledge-source/knowledge-source-processed.*) and an entries/rejected view (apps/api/src/knowledge-bit/knowledge-bit-approval-entries.repo.ts). Nothing below overlaps them.

## 1. Keep the Review sidebar count current and on the learner's local day

- Problem today: the "Review (N due · M new)" label in the sidebar is fetched once when the page first loads and never again. After grading cards, or approving suggestions, it keeps showing the old numbers until a full reload. It also asks the server for counts without the browser time zone, so the server uses UTC and the "new cards left today" figure rolls over at UTC midnight instead of local midnight, while the review screen and dashboard use local time. The two disagree around the day boundary.
- Evidence: apps/web/src/nav/sidebar.tsx:51-80 (effect with `[]` deps, one `load()`), apps/web/src/nav/sidebar.tsx:59 (`getSubjectReviewDueCounts({})` with no tz), apps/web/src/curriculum/curriculum.api.ts:75-79 (tz optional), packages/shared/src/knowledge-bit-review.ts:26 (tz defaults to "UTC"), apps/web/src/routes/index.tsx:47 (dashboard passes `browserTimeZone()`). The catch at apps/web/src/nav/sidebar.tsx:68-72 silently blanks the label.
- Fix: pass `browserTimeZone()` from the sidebar and reload the counts when a grade, undo, bury/suspend or approve completes (reuse the `PENDING_REVIEW_CHANGED_EVENT` pattern already used for the Approve label at apps/web/src/nav/sidebar.tsx:41). Keep the last known counts on a failed refresh instead of clearing them.
- Direction: spaced-repetition-scheduling
- Complexity: Simple

## 2. Say why a pasted text or link was refused, and which block failed

- Problem today: when a link cannot be fetched, has no readable text, the subject is gone, or pasted text is over 50,000 characters, the form only says "Block 1 could not be added. Try again." The server knows the exact reason but the web layer drops it. When several blocks fail, the message lists "Blocks 1, 2" counted from 1 to the failure count, not the real block positions, and failed blocks are renumbered after the filter, so the numbers point at the wrong blocks. A long article is also silently cut at 50,000 characters with no notice that only the start was read.
- Evidence: apps/web/src/knowledge-source/add-knowledge-form.tsx:36-44 (message numbers `1..count`), :137-161 (`Promise.allSettled`, reason discarded), :166 (failed blocks renumbered). Server codes exist but are lost: apps/api/src/knowledge-source/knowledge-source.controller.ts:117 (`fetch_failed`), :124 (`empty_content`), :32 and :39 (50,000 limit returns a raw zod message), :84 and :121 (silent `truncateText` at 50,000). The client keeps the code in `ApiError` at apps/web/src/curriculum/api-client.ts:142-146.
- Fix: map the known error codes to plain sentences ("That page could not be opened", "That page has no readable text", "This text is longer than 50,000 characters, split it"), show them next to the failing block using its real position, and return a `truncated` flag on URL imports so the success line says "Only the first 50,000 characters were read".
- Direction: classic-anki-review (holds the add-knowledge and paste items)
- Complexity: Simple

## 3. Warn before adding a link or text that was already added

- Problem today: pasting the same article link twice (or sending the same page again from the Chrome extension) creates a second source, runs a second paid extraction, and puts a second set of near-identical suggestions on the approval page. The duplicate detector only compares course sources after the fact, not knowledge sources.
- Evidence: apps/api/src/knowledge-source/knowledge-source.controller.ts:128-131 (URL import inserts unconditionally), :204-211 (text insert unconditionally), apps/api/src/knowledge-source/knowledge-source.repo.ts:18-40 (no lookup). Extension posts straight to the same endpoint at apps/extension/src/capture/send-capture.ts:41-47. Duplicate scan covers other tables: apps/api/src/source-duplicate/source-duplicate.orchestrator.ts:48-58.
- Fix: before inserting, look for an existing knowledge source with the same final URL (or identical trimmed text) and return 409 `already_added` with the existing source id; the form and the extension badge say "Already added on <date>" with a link to its approval group, and offer an explicit "Add again" for a deliberate re-extraction.
- Direction: classic-anki-review
- Complexity: Simple

## 4. Show where each card came from during review and in All cards

- Problem today: cards extracted from an article store the article link, but the learner never sees it. The link is only rendered inside the "AI" badge, which returns nothing for any card that is not AI-labelled, so a normal card from a saved article or docs page shows no source in review or in All cards. The learner cannot jump back to the original text when an answer feels wrong, which is the app's own "real-source grounding" principle.
- Evidence: link is saved on every extracted bit: apps/api/src/knowledge-bit/knowledge-bit-source-items.repo.ts:60-66. It reaches the review card payload: packages/shared/src/knowledge-bit-review.ts:60 and apps/api/src/knowledge-bit/knowledge-bit-review-queue-cards.repo.ts:59. The UI hides it: apps/web/src/knowledge-bit/ai-label-badge.tsx:28-30 (`if (!isAiGenerated) return null`) used at apps/web/src/knowledge-bit/anki-review-card.tsx:87. The All cards row shows no source at all: apps/web/src/knowledge-bit/knowledge-overview-table.tsx:148-158.
- Fix: render a small "Source: host" link under the revealed answer in review whenever `sourceLinks` has a safe link (keep the AI chip only for AI-labelled cards), and add the same link to the All cards row. Reuse `toSafeLink` from the badge file; add `sourceLinks` to the overview item.
- Direction: classic-anki-review
- Complexity: Simple

## 5. Show a friendly error and not-found page instead of a crashed screen

- Problem today: roughly 30 routes load data in a route loader, and the router has no default or root error, pending or not-found component. If the API is down or one call throws, the learner gets the framework's raw error screen with no retry and no way back, and an unknown URL gets the bare default. Only the approval route defines its own error screen. The dashboard guards five side calls but the main board call is unguarded.
- Evidence: apps/web/src/router.tsx:11-24 (no `defaultErrorComponent`, `defaultPendingComponent`, `defaultNotFoundComponent`), apps/web/src/routes/__root.tsx:31-52 (no `errorComponent` or `notFoundComponent`), apps/web/src/routes/index.tsx:41 (`getBoard()` unguarded inside the loader), only error screen: apps/web/src/routes/knowledge-bit-review.tsx:10-11. Loader-bearing routes: `grep -c "loader:" apps/web/src/routes/*.tsx` lists 31 files.
- Fix: add one shared error component (plain-language message, Retry that calls `router.invalidate()`, link to the dashboard) and one not-found component as router defaults, plus a short pending indicator for slow navigations.
- Direction: new direction: load-failure-recovery
- Complexity: Simple

## 6. Download all cards and review history as a file

- Problem today: everything the learner has built (approved cards, answers, schedules, review history) lives in one local database with no way out except manual database dumps (the repo already gitignores "pre-migration DB backups (contain real data)"). A bad migration, a reset script (scripts/dev-db-fresh.sh, scripts/clear-extraction-data.sh) or a lost laptop loses months of reviews, and the learner cannot move cards to Anki or a spreadsheet.
- Evidence: no export route exists in apps/api/src/router-table.ts, and no export UI in apps/web/src; `.gitignore` entry for pre-migration backups; destructive scripts in scripts/. Read model already exists to build on: apps/api/src/knowledge-bit/knowledge-bit-overview.repo.ts:89 (overview query) and apps/api/src/knowledge-bit/knowledge-bit-delete.repo.ts:34-60 (tables that hold a card's data).
- Fix: add a read-only endpoint that streams approved cards (question, answer, example, subject, source link, state, due date, interval, lapses) as JSON and CSV, and a "Download my cards" link on the All cards page. A first version needs no import path.
- Direction: new direction: data-export
- Complexity: Simple

## 7. Fix the typed-answer screen so a failure does not lose the learner's answer

- Problem today: if the question list fails to load, the screen says "Nothing to answer right now", which is false and hides the failure. If grading fails, the learner sees the raw code "grading_failed" and the only button is Next, which clears the typed answer and moves on, so a long written answer is lost with no retry. The screen also shows no loading state for the Next refetch.
- Evidence: apps/web/src/routes/knowledge.answer.tsx:50 (only `isLoading`, `isError` ignored), :116-117 (empty message also covers errors), :75-77 (any exception becomes `grading_failed`), :81 (`setDraft('')` on Next), :170-179 (raw `result.error` shown, only Next offered).
- Fix: show a load error with Retry when the query fails, show a plain sentence on a grading failure, and offer "Try again" that keeps the draft; Next is offered as a secondary "Skip this question".
- Direction: prose-knowledge-fisher
- Complexity: Simple

## 8. Let the learner choose the daily new-card limit

- Problem today: no more than 20 new cards are served per day and the number cannot be changed. After approving a large article (dozens of cards) the learner can only study 20 per day, with no way to raise it for a heavy week or lower it for a light one, and the done screen just says no more cards are scheduled.
- Evidence: apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts:31 (`NEW_CARDS_PER_DAY = 20` constant), apps/api/src/knowledge-bit/knowledge-bit-review-queue-counts.repo.ts:34-40 (limit applied), apps/web/src/knowledge-bit/anki-review-done.tsx:65-69 (message gives no hint that the cap, not an empty queue, ended the session). The settings store already exists: apps/api/src/admin-settings/admin-settings.repo.ts:40-90, UI at apps/web/src/routes/admin-settings.tsx.
- Fix: add a "New cards per day" number setting (default 20, clamped 1-200) read by the review queue and counts, and when the cap ended the session say "Daily new-card limit reached, change it in settings" with a link.
- Direction: spaced-repetition-scheduling
- Complexity: Simple (one settings column plus reads; needs a generated migration)

## Runner-up (not ranked): keep a card's chat conversation

Card chat history is held only in component state, so grading to the next card or leaving the page discards the conversation (apps/web/src/knowledge-bit/knowledge-bit-chat-panel.tsx:29-33, keyed per card at apps/web/src/knowledge-bit/anki-review-card.tsx:91). Persisting threads per card needs a new table and endpoints (Complex), so it ranks below the items above; fits grounded-knowledge-chat.

END-OF-REPORT
