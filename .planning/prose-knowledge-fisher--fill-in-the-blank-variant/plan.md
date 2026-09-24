---
stakes-tier: Guarded
---

# Generate a fill-in-the-blank variant for each knowledge bit

## The ask

Second question-type variant in the question-variant family (see the just-completed "Generate a
Wh-question variant" item). Add a fill-in-the-blank probe for each knowledge bit, reusing the
`knowledgeBitQuestionVariants` table added by that item (`kind="fill_in_the_blank"`), scanned and
generated independently of the wh_question pass.

## Existing infrastructure to mirror

- `apps/api/src/mastra/knowledge-bit-question-generator.agent.ts` — cheap-tier agent shape, `<bit>`
  untrusted-content wrapping, structured-output schema, `generateWithRetry`.
- `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts` — `recordGeneratedQuestionVariant`
  (transactional insert+mark), `listKnowledgeBitsForQuestionGenerationScan`-shaped filtered scan.
- `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts` — capped batch scan,
  per-bit try/catch isolation, output length validation.
- `knowledgeBits`' `*GeneratedAt`/`*FailedAt` nullable-timestamp terminal-state convention
  (`whQuestionGeneratedAt`/`whQuestionGenerationFailedAt`, schema.ts).
- `knowledgeBitQuestionVariantKindSchema` shared Zod enum (`packages/shared/src/knowledge-bit.ts`) —
  currently `z.enum(["wh_question"])`.
- The unique index `knowledge_bit_question_variants_bit_kind_order_unique` on
  `(knowledge_bit_id, kind, order)` already covers a second `kind` value with no further migration
  needed on that table.
- router-table.ts/router.ts/server.ts route-wiring convention (see `question-generation-scan`).

## Non-goals

- No changes to the wh_question generation path, its agent, or its columns.
- No embedding of the new variant yet (embedding columns already exist on the table, unpopulated).
- No learner-facing serving of either variant kind.
- No tagging-system or taxonomy-cap touches.
- No admin UI for fill-in-the-blank review.
- No retry loop for a failed generation — a `fillBlankGenerationFailedAt` bit stays terminal, same
  posture as every other generation/tagging/placement failure in this codebase.

## Design

1. **Schema + migration**: add two new nullable columns to `knowledgeBits` —
   `fillBlankGeneratedAt`, `fillBlankGenerationFailedAt` — same terminal-state convention as the
   wh_question columns, tracked independently since this is a separate generation pass over the
   same bits. No table-level change needed on `knowledgeBitQuestionVariants` itself (the unique
   index and generic `kind: text` column already accommodate a second kind value).
2. **Shared type**: extend `knowledgeBitQuestionVariantKindSchema` to
   `z.enum(["wh_question", "fill_in_the_blank"])`.
3. **Agent** (`apps/api/src/mastra/knowledge-bit-fill-blank-generator.agent.ts`): cheap tier via
   `tierToModelId("cheap")`. Same knowledge-fisher framing as the wh_question agent — the blanked
   term must be the load-bearing word for the bit's WHY/mechanism, not an arbitrary noun, so filling
   it in correctly requires understanding the fact, not pattern-matching a keyword. Structured
   output: `z.object({ prompt: z.string().min(1), answer: z.string().min(1) })` — `prompt` contains
   a literal `____` blank marker, `answer` is the exact word/phrase that fills it.
4. **Repo** (`apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts`, extended in place):
   `listKnowledgeBitsForFillBlankGenerationScan`, `markFillBlankGenerated`,
   `markFillBlankGenerationFailed`, `recordGeneratedFillBlankVariant` (transactional insert + mark,
   mirroring `recordGeneratedQuestionVariant`).
5. **Orchestrator** (`apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts`):
   `generateKnowledgeBitFillBlanks()`, `FILL_BLANK_GENERATION_CAP = 50`, same per-bit isolation and
   output-validation shape as the wh_question orchestrator, requiring the agent's `prompt` output to
   contain a `____` blank marker before accepting it.
6. **Route**: `POST /knowledge-bits/fill-blank-generation-scan`, wired through
   router-table.ts/router.ts/server.ts/detect-knowledge-bits.controller.ts exactly like
   `question-generation-scan`.
7. **Tests**: agent (prompt build, schema, invalid-output throw, missing-blank-marker throw),
   orchestrator (success/failure/isolation/cap), route (200/502), repo integration (scan filter,
   transactional record, unique-index coexistence with a wh_question row for the same bit).

## Rollback note

Fully additive: two new nullable columns, one new agent/repo-function-set/orchestrator/route, one
enum member added to an existing shared type. No FK constraints, matching this schema's existing
convention. Revert path: drop migration, delete new files, remove route entries, drop the enum
member.
