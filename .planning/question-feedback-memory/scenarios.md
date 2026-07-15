---
type: scenarios
branch: question-feedback-memory
task: Per-question/turn thumbs feedback that feeds future quiz and Socratic generation
state: confirmed
updated: 2026-07-15
---
# Scenarios: Question feedback memory

## Business Scenarios

SCENARIO 1: Thumbs-up a quiz question, no comment

The learner clicks 👍 on a quiz question in `ProbeSessionQuiz`. No popover text is required to register the vote.

What to verify:
- A feedback row is stored for that exact question (`itemType: "probe_question"`), rating `up`, comment `null`.
- No generation-prompt change results from a comment-less up-vote — it carries no actionable text, so the digest omits it (see SCENARIO 9).
- The button reflects the saved state after the click (optimistic or refetched).

Acceptance: [x]
- `apps/web/src/feedback/item-feedback-buttons.tsx:32-36` — `vote()` fires immediately on click with `comment: undefined` when the box is empty.
- `apps/api/src/feedback/feedback.controller.ts:76` — `comment: body.data.comment ?? null` persists `null` when omitted.
- `apps/api/src/feedback/feedback.repo.ts:36-81` — `upsertItemFeedback` inserts with `itemType: "probe_question"`, `rating: "up"`, `comment: null`.
- `packages/core/src/feedback/feedback-digest.test.ts:60-65` — "drops an up vote with no comment — it carries no actionable text".
- `apps/web/src/feedback/item-feedback-buttons.tsx:62-70` — `aria-pressed={rating === 'up'}` reflects local optimistic state right after the click.

SCENARIO 2: Thumbs-up with a comment

The learner clicks 👍, a popover opens, they type "great, exactly the kind of tradeoff question I want" and submit.

What to verify:
- The row stores rating `up`, the comment text, and the timestamp of submission.
- This comment becomes a "keep doing this" signal available to the digest (SCENARIO 7/8).

Acceptance: [x]
- `apps/web/src/feedback/item-feedback-buttons.tsx:32-49` — `vote()` opens the popover; `submitComment()` re-submits `{ rating, comment }` on explicit save.
- `apps/api/src/feedback/feedback.repo.ts:64-70` — insert row carries `comment`, `createdAt`/`updatedAt` set to `now`.
- `packages/core/src/feedback/feedback-digest.test.ts:47-58` — "renders an up vote with a comment as a well-received instruction".

SCENARIO 3: Thumbs-down with a comment ("what needs to be corrected")

The learner clicks 👎 on a Socratic turn, a popover opens, they type "this asked me to write code, I don't want coding challenges here."

What to verify:
- The row stores rating `down`, the comment, and the timestamp.
- The comment is exactly what "needs correcting" — no separate summarization field or extra LLM call is introduced (see architecture.md's resolution of the summarization fork).
- This becomes an "avoid" signal in the digest.

Acceptance: [x]
- `apps/api/src/feedback/feedback.repo.ts:36-81` — `upsertItemFeedback` stores `rating`, `comment` verbatim, no summarization step anywhere in the write path.
- `packages/shared/src/feedback.ts:24-28` — `submitItemFeedbackInput` has only `rating` + `comment`, no separate correction field.
- `packages/core/src/feedback/feedback-digest.ts:44-47` — `- Avoid: ${row.comment!.trim()}` — the stored comment is rendered verbatim as the avoid line.
- `packages/core/src/feedback/feedback-digest.test.ts:19-27` — "renders a down vote with a comment as an avoid instruction".

SCENARIO 4: Thumbs-down with no comment

The learner clicks 👎 and closes the popover without typing anything.

What to verify:
- The row still stores rating `down`, comment `null`.
- The digest still surfaces this as a weak "disliked, no reason given" signal referencing the item's own text (not fabricated) — never silently dropped, never treated as equivalent to no feedback at all.

Acceptance: [x]
- `apps/api/src/feedback/feedback.controller.ts:76` — `comment: body.data.comment ?? null` persists `null` for a comment-less down vote.
- `packages/core/src/feedback/feedback-digest.ts:44-47` — down + no comment renders `- Disliked, no reason given: "<itemText>"`, never dropped (unlike the up-no-comment branch).
- `packages/core/src/feedback/feedback-digest.test.ts:29-35` — "renders a down vote with no comment as a weak dislike signal referencing the item's own text".
- `packages/core/src/feedback/feedback-digest.test.ts:37-45` — long item text is truncated, never fabricated (uses the real `itemText`, just shortened).

SCENARIO 5: Changing a vote

The learner already thumbs-upped a question, then reconsiders and clicks 👎 instead (or edits the comment).

What to verify:
- The existing row for that item is updated in place (rating and/or comment), not duplicated — one feedback row per item, enforced by a unique constraint on (itemType, itemId).
- `updatedAt` moves forward; `createdAt` (first-given date) is preserved.

Acceptance: [x]
- `apps/api/src/db/schema.ts:171-172` — `uniqueIndex("study_item_feedback_item_unique").on(table.itemType, table.itemId)`.
- `apps/api/src/feedback/feedback.repo.ts:45,52-70` — `upsertItemFeedback` looks up `existing` first; if found, runs an `UPDATE` (not insert), setting only `rating`/`comment`/`topicId`/`itemText`/`updatedAt` — `createdAt` is never touched on the update path.
- `apps/web/src/feedback/item-feedback-buttons.tsx:32-36` — clicking the opposite thumb re-submits with the currently-held `comment`, so an in-session rating change doesn't silently wipe a prior comment.

SCENARIO 6: Feedback on a Socratic turn works the same as on a quiz question

The learner leaves 👍/👎 + optional comment on a turn inside `SocraticChat`.

What to verify:
- Same table, same upsert semantics, `itemType: "socratic_turn"`, `itemId` = the turn's id.
- `topicId` is always populated for a turn (Socratic sessions are always topic-scoped) — unlike quiz questions, this scope is never missing.

Acceptance: [x]
- `apps/api/src/feedback/feedback.controller.ts:26-42,82-95` — `resolveSocraticTurnItem` + `handleSubmitSocraticTurnFeedback` route to the same `handleSubmitFeedback` with `itemType: "socratic_turn"`.
- `apps/api/src/db/schema.ts:130` — `socraticSessions.topicId` is `notNull()`, so `resolveSocraticTurnItem`'s `sessionRow.topicId` is never null for a real turn.
- `apps/web/src/curriculum/socratic-chat.tsx:147` — `ItemFeedbackButtons itemType="socratic_turn" itemId={message.turnId}` rendered per mentor turn bubble.

SCENARIO 7: Next quiz batch for a topic reflects prior feedback

The learner previously left "avoid coding challenges" on a question in Topic X, then requests a new quiz batch for Topic X (`prepareProbeSession` with `regenerate: true`, or a fresh topic with no active session).

What to verify:
- The generation prompt for Topic X includes a compact feedback block built from stored rows for that topic (both `probe_question` and `socratic_turn` items, since both are "how questions should be asked for this topic" signals) — capped, not an unbounded dump (SCENARIO 10).
- `probe-quiz.agent.ts`'s instructions explicitly tell the model to respect an "avoid" list and lean into a "keep" list when present.
- A topic with no feedback yet produces a prompt with no feedback section at all (SCENARIO 9) — behavior is unchanged from today.

Acceptance: [x]
- `apps/api/src/probe-session/probe-session.generate.ts:222-225,238` — `getFeedbackForTopic(t.id)` (no `itemType` filter, so both kinds contribute) feeds `feedbackByTopic.set(t.id, buildFeedbackDigest(selectRecentFeedback(...)))`.
- `apps/api/src/probe-session/probe-session.generate.ts:87-104,160-165,185-192` — `topicBlock(...)` splices the digest into both the topic-scope and module-scope prompt paths.
- `apps/api/src/mastra/probe-quiz.agent.ts:40-41` — "If a \"Prior feedback\" section is present ... honor it: never repeat anything listed under 'Avoid' ... lean into ... 'Well received'."
- SCENARIO 10 covers the cap; SCENARIO 9 covers the empty case.

SCENARIO 8: Next Socratic turn for a topic reflects prior feedback

The learner starts a new Socratic turn on a topic that has prior feedback (from either quiz questions or earlier turns on that topic).

What to verify:
- `generateQuestion` (in `apps/api/src/probe/probe.service.ts`, the real generator of Socratic turn prompts via `mentorAsk`) includes the same feedback block in its prompt assembly.
- `mentor.agent.ts`'s ASK_INSTRUCTIONS are updated with the same "respect avoid/keep" rule as `probe-quiz.agent.ts`.
- This also benefits the pre-existing self-graded `apps/probe` flow and `today.tsx`'s quick-test path, since they share `generateQuestion` — an accepted side effect, not new scope (mirrors topic-study-experience spec.md's decision #13 for the same shared function).

Acceptance: [x]
- `apps/api/src/probe/probe.service.ts:225-226,239` — `generateQuestion` fetches `getFeedbackForTopic(topic.id)`, builds the digest, and splices `feedbackDigest ?? ""` into the prompt array before `Question kind:`.
- `apps/api/src/mastra/mentor.agent.ts:23-24` — ASK_INSTRUCTIONS carries the same "If a \"Prior feedback\" section is present ... honor it" rule.
- `apps/api/src/probe/probe.service.ts:startProbe,buildProbeQuestionForGap` both route through the same `buildQuestion` → `generateQuestion` call, so the old self-graded flow and `today.tsx`'s quick-test path inherit the digest for free — no separate wiring needed, matching the accepted side effect.

SCENARIO 9: No feedback exists for a topic yet

A brand-new topic, or a topic where every item ever rated is still `up` with no comment.

What to verify:
- The feedback digest step returns nothing to inject (not an empty "## Feedback" heading with nothing under it) — the prompt is byte-for-byte identical to today's behavior when there is nothing to say.

Acceptance: [x]
- `packages/core/src/feedback/feedback-digest.ts:53-59` — returns `null` (not an empty-heading string) whenever `lines.length === 0`.
- `packages/core/src/feedback/feedback-digest.test.ts:15-17` — "returns null when there is nothing to say" for `[]` input; `:79-84` — "ignores an all-noise row set and still returns null" for up-only-no-comment rows.
- `apps/api/src/probe-session/probe-session.generate.ts:87-104` — `topicBlock(...)` appends `feedbackDigest ?? ""` then `.filter(Boolean).join("\n")` drops the empty string, so the assembled block is unchanged from before this plan when digest is `null`.
- `apps/api/src/probe/probe.service.ts:230-240` — same `.filter(Boolean).join("\n")` pattern drops `feedbackDigest ?? ""` when null.

SCENARIO 10: Feedback volume is bounded before it reaches a prompt

A topic accumulates many feedback rows over weeks of study.

What to verify:
- Retrieval caps at the most recent 10 `down` rows and 5 `up`-with-comment rows per topic, most-recent-first — old feedback ages out of the prompt rather than growing it unbounded.
- This is a pure, unit-testable selection+formatting step (a deriver), not business logic buried in the repo query beyond the cap/order itself.

Acceptance: [x]
- `packages/core/src/feedback/feedback-digest.ts:1-2,23-38` — `MAX_DOWN_ROWS = 10`, `MAX_UP_WITH_COMMENT_ROWS = 5`, applied in `selectRecentFeedback` via `.slice(0, MAX_...)` after a recency sort.
- `packages/core/src/feedback/feedback-digest.test.ts:98-109` — "caps down rows at the 10 most recent, dropping older ones"; `:111-121` — "caps up-with-comment rows at the 5 most recent"; `:135-146` — "sorts the combined selection most-recent-first across both categories".
- `packages/core/src/feedback/feedback-digest.ts` has zero DB imports and zero async — pure deriver; the DB query itself (`apps/api/src/feedback/feedback.repo.ts:85-99` `getFeedbackForTopic`) does no ordering/capping business logic beyond `orderBy(desc(updatedAt))` for a stable base ordering.

## Technical/Architectural Scenarios

None beyond what's covered above — no new async boundary, no new service, and the one new table has no consumer outside this plan's own generation call sites.
