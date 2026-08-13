---
type: scenarios
branch: open-questions-review
task: Capture open questions raised mid-study and periodically resurface unanswered ones for review
state: confirmed
updated: 2026-08-13
---

# Scenarios: Open questions review

## Business Scenarios

SCENARIO 1: Capture a question during a quiz question

The learner is answering a quiz question in `ProbeSessionQuiz` and something occurs to them that
isn't answered by the question itself. They click the "❓ Ask later" control next to the question,
type the question text into the popover, and save.

What to verify:
- A row is stored (`sourceType: "probe_question"`, `sourceItemId`: the question's id), with
  `topicId`/`topicTitle` resolved server-side from the question (not trusted from the client),
  `status: "open"`.
- The control reflects the saved state after submit (a "Saved" confirmation, matching
  `item-feedback-buttons.tsx`'s `feedback-saved-*` precedent).
- No LLM call happens on this write path.

Acceptance: [x]

SCENARIO 2: Capture a question during a Socratic turn

The learner is mid-conversation in `SocraticChat` and wants to note a question about the current
turn. They click the same capture control on that turn's message bubble.

What to verify:
- A row is stored (`sourceType: "socratic_turn"`, `sourceItemId`: the turn's id), `topicId`
  resolved from the turn's session (`socratic_sessions.topic_id`, which is `NOT NULL`, so this path
  always carries a topic).
- Same save/confirmation behavior as SCENARIO 1.

Acceptance: [x]

SCENARIO 3: Captured question appears in the review list

After capturing a question (SCENARIO 1 or 2), the learner navigates to `/open-questions`.

What to verify:
- The captured question appears as a row, showing its text and the topic it arose from.
- Multiple open questions are ordered oldest-first (longest-unanswered surfaces first).
- The list is global across all topics — not scoped to the topic/subject the learner happened to
  be studying when they navigated there.

Acceptance: [x]

SCENARIO 4: Empty question text is rejected

The learner opens the capture popover but submits with the text field empty.

What to verify:
- The submit control is disabled (or the submit is a no-op) when the trimmed input is empty —
  mirrors `submit-comment`'s non-empty requirement pattern is NOT required here (feedback's comment
  is optional), but a captured *question* with no text is meaningless, so this field is required,
  unlike feedback's comment.
- No row is written to the database for an empty submission.

Acceptance: [x]

SCENARIO 5: An open question surfaces on `/today`

The learner has one captured, unanswered open question. They load `/today` (the daily-visited
page).

What to verify:
- A banner distinct from the existing `CrossCuttingNudgeBanner` renders, showing the question text
  and its topic.
- The banner is computed live on every load (no stored "already shown" flag) — reloading `/today`
  again still shows it, exactly like the existing cross-cutting nudge banner's behavior.
- If the learner has zero open questions, the banner section does not render its content area but
  DOES render an explicit empty marker (see SCENARIO 9) rather than being silently absent.

Acceptance: [x]

SCENARIO 6: Mark a question answered

On `/open-questions`, the learner types an answer into a captured question's inline answer field
and submits.

What to verify:
- The row's `status` moves from `open` to `answered`, `answerText` is stored, `resolvedAt` is set.
- The row visibly changes state in place — `data-status="answered"` on the row element — rather
  than disappearing without explanation; an "answered" filter/tab shows it going forward.
- The question no longer appears in the `/today` banner or the default (open-only) list view on
  next load.

Acceptance: [x]

SCENARIO 7: Dismiss a question as no longer relevant

On `/open-questions`, the learner clicks "Not needed" on a captured question instead of answering
it.

What to verify:
- The row's `status` moves from `open` to `dismissed`, `answerText` stays `null`, `resolvedAt` is set.
- The question no longer appears in the `/today` banner or the default open-only list view.
- Dismissing requires no confirmation dialog — matches this app's low-friction, no-nagging posture
  elsewhere (e.g. feedback's re-vote is also a single click).

Acceptance: [x]

SCENARIO 8: The `/today` banner caps at 3 and links to the full list

The learner has 5 open questions.

What to verify:
- The banner shows only the 3 oldest (by `created_at ASC`).
- A "+2 more" (or equivalent) link is present and points at `/open-questions`, where all 5 appear.

Acceptance: [x]

SCENARIO 9: Empty states render calmly

The learner has zero open questions (never captured any, or has answered/dismissed all of them).

What to verify:
- `/today` renders an explicit `open-questions-banner-empty` marker — not an absent section, not
  an error — so the state is distinguishable from a broken loader in both a screenshot and an
  automated assertion.
- `/open-questions` renders an `open-questions-list-empty` marker with calm copy (no error styling).

Acceptance: [x]

SCENARIO 10: Question text is capped at 1000 characters

The learner pastes a very long question (1001+ characters) into the capture popover and tries to
submit.

What to verify:
- Client-side validation prevents submission past the cap (submit stays disabled or shows an
  inline length error) — mirrors `submitItemFeedbackInput`'s `.max(500)` precedent, sized larger
  here (1000) because a genuine question needs more room than a reaction comment.
- Server-side, `captureOpenQuestionInput`'s `.max(1000)` rejects any request that somehow bypasses
  the client check, returning `400 invalid_input`.

Acceptance: [x]
