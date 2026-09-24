# Plan — variant-attempts

## Goal
Let a learner answer a knowledge-bit question variant (Wh-question or fill-in-the-blank) in free
text, grade it with an AI verdict/score/feedback, and store every attempt as its own history row —
the missing foundation the follow-up-question, scoring, and per-tag-tracking items all depend on.

## Why a new table, not an existing one (judgment call, per advisor)
Checked `attempts` (phrase-only, hard-keyed to `phraseId`/`subjectId`), `gapMastery` (1:1 per gap,
no free-text answer or per-attempt history), `probeSessionQuestions` (MCQ option-index shaped, not
free text). None accept a free-text answer tied to a knowledge-bit variant with its own
score/verdict/feedback. A new table mirroring `attempts`' own shape is the smallest correct fit.

## Non-goals (this item)
- No phrase-bank-style mastery scheduling (that's `applyAttemptToPhraseBankEntry`'s own concern,
  language-practice-specific — not reused or reimplemented here).
- No per-tag/per-topic score aggregation — that's the next backlog item
  ("Score each answer against its bit's tags...").
- No follow-up question generation after grading — that's the item this unblocks, not this one.

## Design
1. **Schema**: `knowledgeBitVariantAttempts` — `id`, `variantId` (plain text, references
   `knowledge_bit_question_variants.id` by value, matching this schema's dominant no-FK
   convention), `userAnswer`, `score` (0-10 int), `verdict` (reuse `verdictSchema` from
   `@post-anki/shared` — `Ok`/`NeedsReview`/`NeedsDeepDive`, already the app-wide grading verdict
   vocabulary), `feedback`, `createdAt`. One row per attempt — never updated, only inserted, so
   spaced-repetition re-answering is a new row, not an overwrite.
2. **Grading agent** (new, cheap tier): `knowledge-bit-answer-grader.agent.ts` — a knowledge-fisher
   persona that grades a learner's free-text answer against the variant's own `prompt`/`answer`,
   not the raw bit body (so grading reflects the actual asked question). Returns
   `{ score, verdict, feedback }`, reusing `verdictSchema`.
3. **Repo**: `knowledge-bit-variant-attempt.repo.ts` — `getQuestionVariantById`,
   `insertVariantAttempt`.
4. **Orchestrator**: `grade-knowledge-bit-variant-answer.orchestrator.ts` —
   `gradeKnowledgeBitVariantAnswer(variantId, userAnswer)`: fetch the variant, 404 if missing,
   grade via the agent, insert the attempt row, return the graded result.
5. **Route**: `POST /knowledge-bits/question-variants/:id/answers` with `{ userAnswer }` body.

## Files by scenario
| Scenario | Files |
|---|---|
| 1, 2 (grade correct/incorrect) | `knowledge-bit-answer-grader.agent.ts`, `grade-knowledge-bit-variant-answer.orchestrator.ts` |
| 3 (history preserved) | `knowledge-bit-variant-attempt.repo.ts` (insert, no update path) |
| 4 (missing variant 404) | `grade-knowledge-bit-variant-answer.orchestrator.ts`, controller |
| 5 (grades against variant, not raw bit) | `knowledge-bit-answer-grader.agent.ts` prompt builder |
