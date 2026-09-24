# Ask a knowledge-fisher follow-up question after the learner answers

## Goal
After a learner's answer to a question variant is graded, generate one follow-up question — in
the same knowledge-fisher persona used to generate the original questions — that digs one level
deeper into the WHY/reasoning behind the bit, and return it alongside the grade.

## Non-goals
- No persistence of the follow-up question or its own answer (no new table/column) — it's
  returned synchronously to the caller, not tracked as history. A future item can add that if a
  UI actually needs to show/re-answer stored follow-ups.
- No change to how the original question variants (wh_question/fill_in_the_blank) are generated.
- No per-tag/per-topic knowledge-level aggregation — separate, later backlog item.

## Design
1. **New agent** `apps/api/src/mastra/knowledge-bit-followup-generator.agent.ts`, cheap tier,
   mirroring `knowledge-bit-question-generator.agent.ts`'s knowledge-fisher persona. Input: the
   original question, reference answer, learner's answer, and the grade verdict/feedback already
   produced. Output: one open follow-up question that pushes toward the reasoning still missing
   (when verdict is NeedsReview/NeedsDeepDive) or one level deeper into the mechanism (when
   verdict is Ok) — the model decides the right depth from the verdict/feedback it's given, not a
   hardcoded branch in application code.
2. **Orchestrator wiring**: extend `gradeKnowledgeBitVariantAnswer` in
   `grade-knowledge-bit-variant-answer.orchestrator.ts` to call the new agent after grading and
   include `followUpQuestion` in its returned `{ ok: true, ... }` shape. Runs only on the success
   path (never on `variant_not_found`).
3. **Route**: no new route — same
   `POST /knowledge-bits/question-variants/:id/answers` response now carries `followUpQuestion`.
4. **Tests**: agent unit tests (prompt delimiters, schema validation, generate-call), orchestrator
   test (follow-up generated and included, not called on variant_not_found), controller test
   (response includes `followUpQuestion`).

## Files by scenario
| Scenario | Files |
|---|---|
| Follow-up generated for a correct answer, probing one level deeper | `knowledge-bit-followup-generator.agent.ts`, `grade-knowledge-bit-variant-answer.orchestrator.ts` |
| Follow-up generated for an incomplete/wrong answer, probing the actual gap | same |
| No follow-up generated when the variant doesn't exist | `grade-knowledge-bit-variant-answer.orchestrator.ts` |
| Response includes the follow-up question over HTTP | `grade-knowledge-bit-variant-answer.controller.ts` |
