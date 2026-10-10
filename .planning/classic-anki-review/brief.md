# BRIEF: classic-anki-review

Goal: add a classic Anki review mode on top of the existing pipeline. The user pastes text,
bits are suggested, the user approves them, and approved bits are reviewed by showing the
question, revealing the answer and self-grading Again/Hard/Good/Easy against the existing bit
schedule. The typed-answer LLM-graded mode at /knowledge/answer stays as a separate mode.

## Ownership (entity-first, all under the knowledge-bit entity)
- Self-grade API: apps/api/src/knowledge-bit/knowledge-bit-review*. It holds the queue repo, the
  review-log repo, the self-grade orchestrator and the controller. No LLM calls on this path.
- Schedule maths: a new pure deriver, knowledge-bit-grade-schedule.ts, takes (state, grade, now)
  and returns the next state. computeNextSchedule(state, verdict) stays untouched for typed mode.
  Both write the same knowledge_bit_schedules row (one schedule per bit).
- Grade mapping (review phase): Again counts as a lapse (lapses+1, ease -0.20, relearn).
  Hard: interval x1.2, ease -0.15, no 14-day cap. Good: interval x ease. Easy: interval x ease
  x1.3, ease +0.15. Ease stays clamped 1.3-3.0 and intervals 1-180 days, as today.
  New cards: Good/Again go through learning steps 1m,10m and graduate at 1d. Easy graduates at 4d.
  Relearning step is 10m. Typed-mode verdicts keep their own formula and set phase=review.
- Schema (knowledge_bit_schedules): add phase (new|learning|review|relearning, default review
  for existing rows), learning_step, lapses, suspended_at, buried_until. A leech is derived
  (lapses >= 8); auto-suspend sets suspended_at, so there is no leech column.
- New append-only table knowledge_bit_reviews: id, knowledge_bit_id, variant_id, grade,
  was_new, duration_ms, prev_schedule (jsonb snapshot or null), reviewed_at, undone_at.
  It feeds undo, the new-cards-per-day count and leech history.
- Due-queue rule (unscoped, both modes): the bit is approved, the variant is active, the topic
  is not "skipping", the bit is not suspended, buried_until is null or <= now, and it has no
  schedule row or due_at <= now. Anki order: learning/relearning first, then review due
  (due_at asc), then new (created_at asc) capped by the remaining daily new limit (20).
  One card per bit per batch, with variant preference basic > fill_in_the_blank > wh_question.
  Scoped queues (tagId/topicId/knowledgeBitId) keep today's behaviour.
- After-paste trigger: in-process fire-and-forget kick from knowledge-source.controller after
  a successful insert. It runs detect, then the wh, fill-blank and basic generation passes,
  coalesced by an in-flight flag. This follows the existing `void x().catch(log)` pattern in
  curriculum.controller. Cloud Scheduler (5 min) stays as the backstop.

## Contracts (packages/shared/src/knowledge-bit-review.ts, Zod; approval ones in knowledge-bit.ts)
- reviewGrade: enum again|hard|good|easy. cardPhase: enum new|learning|review|relearning.
- GET  /knowledge-bits/review-cards?limit&tz&tagId&topicId&knowledgeBitId returns
  {cards:[{variantId,knowledgeBitId,kind,prompt,answer,background|null,phase,
  intervalPreview:{again,hard,good,easy} seconds}], counts:{new,learning,review},
  newRemainingToday, nextDueAt|null}
- POST /knowledge-bits/reviews {variantId, grade, durationMs?} returns 201
  {reviewId, knowledgeBitId, phase, dueAt, intervalDays, lapses, leech, suspended}
- DELETE /knowledge-bits/reviews/:id restores prev_schedule. It returns 200 {knowledgeBitId},
  or 409 not_latest if the review is not the latest one or was already undone.
- PATCH /knowledge-bits/:id/schedule {suspended?: boolean, buried?: boolean} returns 200 state.
- POST /knowledge-bits/approvals {knowledgeBitIds[1..200]} returns {approved[], skipped[{id,reason}]}
- GET  /knowledge-bits/pending-review/count returns {count}
- knowledgeBitQuestionVariantKindSchema gains "basic".
- PATCH /knowledge-bits/question-variants/:id is reused for in-review edits. Its gate is
  relaxed from pending to "not rejected".

## Web
- Separate route /knowledge/review for Anki mode, with its own files under
  apps/web/src/knowledge-bit/anki-review*. knowledge.answer.tsx stays as the typed mode and
  only gains a "Switch to Anki review" link. Each header links to the other mode and keeps
  the search params. The sidebar shows "Review" (Anki), "Answer (typed)" and "Approve
  suggestions (N)".
- Anki mode never renders bitBody, and the chat panel appears only after reveal. Session
  stats, the undo stack and keyboard handling live in client state. The summary comes from
  this client state, with no endpoint.

## Runtime and infra
- No new runtime or worker process. The kick runs in the existing API process.
- infra/index.ts gets one new Cloud Scheduler job, for the basic-card generation scan.
- Known risk: the API Cloud Run service uses default CPU throttling with minScale 0, so a kick
  may stall after the response is sent. The scheduler covers that, and cpu-throttling stays
  unchanged to avoid the cost.

## Decisions (each with a reason)
- New deriver instead of reusing 3 verdicts: Hard/Easy have no faithful verdict mapping, and
  this leaves typed mode with no regressions.
- Learning steps stored as phase+step columns: minute steps need state beyond intervalDays.
- Prior schedule snapshot in the review log from task 1: undo and leech need no later migration.
- Leech is derived: one fewer column, and the threshold stays tunable in code.
- One card per bit: siblings share a schedule, so serving both would double-grade a bit.
- Typed queue excludes kind basic: the grader/follow-up prompts are kind-specific and basic
  cards are for recall.
- Interval previews are computed on the server: the schedule state lives on the server.
- tz query param (IANA): the new-card day boundary follows the learner's local day.
- Separate route: knowledge.answer.tsx stays under 300 lines and the modes do not affect
  each other.
- Single-user assumption kept: schedules and reviews have no user id today.
