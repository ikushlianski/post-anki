# Plan — answer-screen (Build a screen where the learner can actually answer knowledge-bit questions)

## Why this exists
Discovered via advisor consult while scoping the deepen-recommendation-extension item: the
grading endpoint (`POST /knowledge-bits/question-variants/:id/answers`, already shipped and
covered by 3 review-reviewed items this run) has **no caller anywhere in `apps/web`** — grepped,
confirmed zero matches. Every knowledge-bit variant ever generated is therefore unanswerable by a
real learner today. The just-shipped tag-strength badge (`weak`/`shallow`/`strong`/`untested`)
links to `/probe/tag/$tagId`, which only surfaces gap-mastery topic questions, not knowledge-bit
variants — so a tag whose strength comes purely from bit answers reads "untested" forever with no
way to change that. This item is the missing steel thread; it blocks the deepen-recommendation
item and the tag badge from ever doing anything for the learner.

## Scope
- A GET endpoint returning the next batch of knowledge-bit question variants to answer.
- A web screen: one question at a time, textarea answer, submit calls the existing grading
  endpoint, shows verdict/feedback/follow-up question, then advances.
- Reachable from real navigation (linked from the tags page and/or a new nav entry).

## Non-goals
- No spaced-repetition scheduling/due-list logic (gap-mastery's `scheduledForSequence` machinery)
  — out of scope, per learning-brain's pull-only rule and to keep this a steel thread, not a
  second recall-recycling system. Simplest fair ordering: fewest attempts first, ties broken by
  bit ordinal — naturally surfaces never-answered variants before over-practiced ones, cycles
  through everything over time.
- No accept/reject, no due-count badge anywhere (learning-brain's rule, reused from the
  deepen-recommendation item's own constraint).
- No change to the grading endpoint, orchestrator, or grader/follow-up agents — all reused as-is.

## Design
1. **Phase 1 — endpoint.** `GET /knowledge-bits/question-variants/next?limit=5&tagId=<optional>`.
   Repo query: LEFT JOIN `knowledge_bit_variant_attempts` (count per variant), order by attempt
   count ascending then `knowledgeBitQuestionVariants.createdAt` ascending (or bit ordinal),
   optional filter to variants whose bit carries `tagId` (via `tagAssignments`, reusing the same
   join shape as `getTagMasteryLevels`) — this is what lets the tag badge deep-link into a
   tag-scoped queue later. Return `{ variantId, kind, prompt, knowledgeBitId, bitBody }[]`
   (`bitBody` from `knowledgeBits.body`, for on-screen context — the learner needs to see the
   source text, not just the bare question).
2. **Phase 2 — UI.** New route (e.g. `apps/web/src/routes/knowledge.answer.tsx`), one
   component: fetches a batch via the new endpoint, shows bit body + question one at a time, a
   textarea + submit button that POSTs to the existing `/knowledge-bits/question-variants/:id/
   answers` endpoint (follow `apps/web/src/curriculum/probe-session-quiz.tsx`'s existing
   answer-submit pattern for conventions), displays verdict/feedback/follow-up question inline,
   then a "Next" control to advance through the batch (re-fetching a new batch when exhausted).
   Add a nav link (wherever the app's other primary nav entries live) and/or wire the tags page's
   existing "weak"/"shallow" badges to link here with `?tagId=<tag.id>` — small follow-up wiring,
   not a new component.
3. **Phase 3 — tests.** Repo/controller unit + integration tests for the new endpoint; an RTL
   component test for the answer flow (submit -> shows feedback -> advances), same pattern as
   `probe-session-quiz.test.tsx`.

## Files by scenario
| Scenario | Files |
|---|---|
| Endpoint returns a fair, cycling queue | new repo query (knowledge-bit-variant-attempt.repo.ts
or a new file), controller, router-table.ts entry, tests |
| Learner can answer and see feedback in a real screen | new route/component, api-client function,
RTL test, nav/badge-link wiring |
