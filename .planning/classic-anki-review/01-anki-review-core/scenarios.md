---
type: scenarios
branch: learn-from-doc-site
task: F-core — Anki review core (items 1, 3, 9, 20)
state: confirmed
updated: 2026-10-10
---
# Scenarios: F-core — Anki review core

## Business Scenarios

SCENARIO 1: Reveal a card, then self-grade it — asked

The learner opens the new Review page, sees only a question, presses "Show answer", sees the reference answer, presses Again, Hard, Good or Easy, and the next card appears.

What to verify:
- Before reveal only the question and "Show answer" show; no grade buttons.
- After reveal the reference answer and four grade buttons show.
- A grade is saved, then the next card appears unrevealed; after the batch ends, a fresh batch loads.
- Grading is never done by an AI model and costs no tokens.

Acceptance:
- [x] @anki-core.S1 — reveal then grade 1-4, next card unrevealed — projects/post-anki/post-anki/features/anki-review/core/tests/reveal-then-grade-saves-schedule-and-history.test.ts
- [x] Question-only before reveal: apps/web/src/knowledge-bit/anki-review-card.tsx:20 (Show answer), grades render only when revealed apps/web/src/knowledge-bit/anki-review-screen.tsx:138; test apps/web/src/routes/-knowledge.review.test.tsx:102
- [x] Answer and four grades after reveal: apps/web/src/knowledge-bit/anki-review-card.tsx:31, apps/web/src/knowledge-bit/anki-review-grade-buttons.tsx:21; test apps/web/src/routes/-knowledge.review.test.tsx:102
- [x] Grade saved, next card unrevealed, fresh batch after last: apps/web/src/knowledge-bit/anki-review-screen.tsx:53-65; tests apps/web/src/routes/-knowledge.review.test.tsx:118, :134
- [x] No AI model on the grade path: apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:18-31 (deriver + DB only)

SCENARIO 2: Each grade moves the next review date the way Anki does — asked

A grade sets when the card's knowledge bit comes back, using a four-grade rule that is separate from the typed mode's three-verdict rule.

What to verify:
- A never-reviewed card comes back in 1 day after Again, Hard or Good, and in 4 days after Easy. Its ease does not change.
- A reviewed card: Again resets to 1 day with ease down 0.20; Hard multiplies the interval by 1.2 with ease down 0.15; Good multiplies it by ease; Easy multiplies it by ease and 1.3 with ease up 0.15.
- Ease always stays between 1.3 and 3.0, and the interval between 1 and 180 days. Hard is not limited to 14 days.

Acceptance:
- [x] @anki-core.S2 — Good on a reviewed card = interval x ease, ease kept (new-card 1/1/1/4 superseded by learning steps; see learning S1) — projects/post-anki/post-anki/features/anki-review/core/tests/reveal-then-grade-saves-schedule-and-history.test.ts
- [x] Never-reviewed 1/1/1/4 days, ease kept: apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts:43-58; test apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.test.ts "should bring a never-reviewed card back tomorrow..."
- [x] Reviewed-card multipliers and ease steps: apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts:31-38; tests in apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.test.ts (Again/Hard/Good/Easy cases)
- [x] Clamps 1.3–3.0 and 1–180 days, Hard uncapped at 14: apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts:54-55; tests "should never let ease fall below 1.3...", "should never schedule a card more than 180 days out", "should grow a hard-recalled card..." 

SCENARIO 3: The fact being tested stays hidden until reveal — asked

In Anki mode the knowledge bit's own text never appears above the question, so recall is not spoiled. The bit's background note appears only after reveal, together with the answer.

What to verify:
- The bit's text is never on the page, before or after reveal.
- The background note shows only after reveal, and only when the bit has one.
- The review page never receives the bit's text from the server.

Acceptance:
- [x] @anki-core.S3 — bit text never on page, background only after reveal — projects/post-anki/post-anki/features/anki-review/core/tests/reveal-then-grade-saves-schedule-and-history.test.ts
- [x] Bit text never on the page: card renders prompt/answer/background only apps/web/src/knowledge-bit/anki-review-card.tsx:5-44
- [x] Background only after reveal and when present: apps/web/src/knowledge-bit/anki-review-card.tsx:36; test apps/web/src/routes/-knowledge.review.test.tsx:146
- [x] Server never sends bit text: queue selection has no body apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:66-74; test apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts:87

SCENARIO 4: The chat panel stays hidden until the answer is revealed — asked

The tutor chat for the current bit shows up only after reveal, so it can't be used to look the answer up first.

What to verify:
- No chat panel before reveal; it appears after reveal.
- Moving to the next card hides it again and starts a fresh conversation for the new bit.

Acceptance:
- [x] @anki-core.S4 — chat hidden before reveal, hidden again on next card — projects/post-anki/post-anki/features/anki-review/core/tests/reveal-then-grade-saves-schedule-and-history.test.ts
- [x] Chat hidden before reveal, shown after: apps/web/src/knowledge-bit/anki-review-card.tsx:41; test apps/web/src/routes/-knowledge.review.test.tsx:162
- [x] Next card hides it and keys a fresh panel per bit: apps/web/src/knowledge-bit/anki-review-screen.tsx:54, apps/web/src/knowledge-bit/anki-review-card.tsx:41; test apps/web/src/routes/-knowledge.review.test.tsx:162

SCENARIO 5: Review with the keyboard — asked

Space reveals the answer, and keys 1 to 4 grade it as Again, Hard, Good or Easy, so a session never needs the mouse.

What to verify:
- Space reveals and does not scroll the page; 1 to 4 do nothing before reveal.
- After reveal, 1 to 4 grade exactly once, even if a key is pressed twice fast or held down.
- Keys typed into the chat box or any text field never reveal or grade.
- Keys pressed with Ctrl, Cmd or Alt are ignored. Each grade button shows its key number.

Acceptance:
- [x] @anki-core.S5 — Space reveals, 1-4 grade once, chat typing and Ctrl ignored — projects/post-anki/post-anki/features/anki-review/core/tests/keyboard-reveals-and-grades-once.test.ts
- [x] Space reveals without scrolling, 1–4 inert before reveal: apps/web/src/knowledge-bit/anki-review-keyboard.ts:40-42, :83; tests apps/web/src/knowledge-bit/anki-review-keyboard.test.ts, apps/web/src/routes/-knowledge.review.test.tsx:182
- [x] Grades exactly once on repeat or while saving: apps/web/src/knowledge-bit/anki-review-keyboard.ts:32-37; test apps/web/src/knowledge-bit/anki-review-keyboard.test.ts "should grade only once..."
- [x] Text fields never reveal or grade: apps/web/src/knowledge-bit/anki-review-keyboard.ts:32, :50-61; test apps/web/src/routes/-knowledge.review.test.tsx:205
- [x] Modifier keys ignored; buttons show key numbers: apps/web/src/knowledge-bit/anki-review-keyboard.ts:32, apps/web/src/knowledge-bit/anki-review-grade-buttons.tsx:30

SCENARIO 6: Move between the two review modes — asked

The sidebar has a "Review" entry for Anki mode next to "Answer (typed)". Each mode's header links to the other one and keeps the current scope (tag, topic or single bit).

What to verify:
- The sidebar "Review" opens the Anki page; the typed entry still opens the typed page.
- "Switch to typed answer" and "Switch to Anki review" each keep the tag, topic or bit scope.
- The Anki page honours the same scopes as the typed page.

Acceptance:
- [x] @anki-core.S6 — sidebar entries, mode switch keeps bit scope (tag/topic scope not driven) — projects/post-anki/post-anki/features/anki-review/core/tests/modes-link-each-other-and-keep-scope.test.ts
- [x] Sidebar Review and Answer (typed): apps/web/src/nav/sidebar.tsx:19-24; test apps/web/src/routes/-knowledge.review.test.tsx:273
- [x] Mode links keep scope: apps/web/src/knowledge-bit/anki-review-screen.tsx:105-107, apps/web/src/routes/knowledge.answer.tsx:105-107; tests apps/web/src/routes/-knowledge.review.test.tsx:256, apps/web/src/routes/-knowledge.answer.test.tsx "keeps the learner on the same tag..."
- [x] Anki page honours tag/topic/bit scopes: apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:44-63, apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:19-20; test apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts "should keep the learner's tag scope..." 

SCENARIO 7: Nothing to review, a failed load, and a grade that doesn't save — asked

Empty and failure states are visible, and a failure never loses or half-saves a grade.

What to verify:
- No cards: the page says there is nothing to review right now.
- The cards fail to load: an error message and a Retry button show.
- A grade fails to save: the same card stays revealed with an error, and the grade can be retried.
- A card whose bit is no longer approved, or that no longer exists, is refused with a clear error and is not graded.

Acceptance:
- [x] @anki-core.S7 — done screen, load error + Retry, failed grade retry, unapproved card refused — projects/post-anki/post-anki/features/anki-review/core/tests/empty-failed-load-and-failed-grade-states.test.ts
- [x] Empty queue message: apps/web/src/knowledge-bit/anki-review-screen.tsx:131; test apps/web/src/routes/-knowledge.review.test.tsx:217
- [x] Load error with Retry: apps/web/src/knowledge-bit/anki-review-screen.tsx:116-128; test apps/web/src/routes/-knowledge.review.test.tsx:225
- [x] Failed grade keeps card revealed and retryable: apps/web/src/knowledge-bit/anki-review-screen.tsx:82-84; test apps/web/src/routes/-knowledge.review.test.tsx:237
- [x] Unapproved or missing card refused, not graded: apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:22-29, apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:40; tests apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts:151, :162

## Technical/Architectural Scenarios

SCENARIO 8: Every grade leaves a restorable history entry — asked

Each grade adds one permanent history entry that records the grade, whether the card was new, how long the learner took, and a copy of the schedule as it was before the grade.

What to verify:
- The schedule update and the history entry are saved together or not at all.
- A never-reviewed card's entry is marked new and holds no prior schedule; a reviewed card's entry holds its full prior schedule.
- History entries are never edited or deleted by grading.

Acceptance:
- [x] @anki-core.S8 — one history row per grade, new flag and prior schedule — projects/post-anki/post-anki/features/anki-review/core/tests/reveal-then-grade-saves-schedule-and-history.test.ts
- [x] Schedule and history saved together: both writes in one locked transaction apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:31-37
- [x] New flag and prior-schedule copy: apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:41-50; tests apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts:110, :128
- [x] History append-only: apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts:17-25 (insert only), table apps/api/src/db/schema.ts:1247

SCENARIO 9: Both modes grading the same bit at the same time — asked

A typed answer and an Anki grade for the same bit, arriving together, are applied one after the other to the bit's single schedule, and neither is lost.

What to verify:
- Both updates land: the review count goes up by two, and the final schedule reflects the second update applied on top of the first.
- Two Anki grades for sibling variants of one bit never overwrite each other.

Acceptance:
- [x] @anki-core.S9 — typed + Anki grade both land, sibling variants concurrent — projects/post-anki/post-anki/features/anki-review/core/tests/typed-and-anki-grades-both-land-on-one-bit.test.ts
- [x] Typed and Anki grades on one bit both land: shared lock apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:31; test apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts:169
- [x] Sibling variants never overwrite: test apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.integration.test.ts:187

SCENARIO 10: Typed mode keeps working as before — asked

The typed, AI-graded mode keeps its behaviour, its queue and its scheduling rule. It gains only a link to Anki mode.

What to verify:
- The typed queue still never returns the reference answer.
- Typed grading still uses its own three-verdict rule, with unchanged results.
- The typed page's existing tests still pass, and the only change is the mode link.

Acceptance:
- [x] @anki-core.S10 — typed queue omits answer and basic cards, typed rule unchanged — projects/post-anki/post-anki/features/anki-review/core/tests/typed-and-anki-grades-both-land-on-one-bit.test.ts
- [x] Typed queue still omits the answer: typed repo untouched (no diff in apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts)
- [x] Typed rule unchanged: computeNextSchedule untouched apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts:24; apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.test.ts green
- [x] Typed page tests pass, only change is the mode link: apps/web/src/routes/knowledge.answer.tsx:105-111; apps/web/src/routes/-knowledge.answer.test.tsx 4/4 green
