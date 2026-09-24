---
type: plan
item: wh-question-variant
direction: prose-knowledge-fisher
stakes-tier: Guarded
---

# Generate a Wh-question variant for each knowledge bit

## The ask

Each `knowledgeBits` row is raw prose with no way to test whether the learner actually understood
it. This item adds the first AI-generated question variant per bit: an open "Wh-question" (who,
what, when, where, why, how) written by a "knowledge fisher" persona that specifically probes for
the WHY behind the fact, not rote recall of the sentence. A capped batch scan (mirrors the tagging
scan) generates one Wh-question + model answer per untouched bit and stores it. This is phase 1 of
a family of variants — fill-in-the-blank (a separate backlog item) reuses the same table/schema,
just a different `kind` and a different generator prompt.

## Existing infrastructure (from research — reuse, do not rebuild)

- **`apps/api/src/mastra/knowledge-bit-tagger.agent.ts`** — the exact Mastra agent pattern to
  mirror: cheap-tier model (`tierToModelId("cheap")`), one `Agent` with static `instructions` +
  a per-call prompt builder, `structuredOutput: {schema}` via `generateWithRetry`, registered under
  `AGENT_KEYS` in `apps/api/src/mastra/mastra.js` and fetched via `getMastra().getAgent(...)`.
- **`apps/api/src/knowledge-bit/knowledge-bit-tagging.orchestrator.ts`** — the exact scan-loop
  pattern to mirror: `listXForScan(CAP)` → per-bit try/catch → success path writes results +
  `markXDone`, failure path calls `markXFailed` (itself wrapped in its own try/catch so a failed
  mark-failed write doesn't crash the loop) → returns `{scanned, done, failed}` counts.
  `TAGGING_CAP = 50`, kept low because this is a paid LLM call per bit — mirror the same cap.
  `knowledge-bit-tagging.repo.ts` (list/mark helpers) is the repo-file shape to mirror too.
- **`apps/api/src/db/schema.ts:995-1006`, `topicCardVariants`** — the closest existing "one prompt
  + one answer + optional embedding" table shape. Not reused directly (different parent FK); mirror
  its column shape for the new table below.
- **`apps/api/src/db/schema.ts:1062-1091`, `knowledgeBits`** — the `*CheckedAt`/`*FailedAt`
  nullable-timestamp convention this table already uses three times (`embeddedAt`/`taggedAt`/
  `placementCheckedAt` pairs) — the new generation-tracking columns follow the same shape.
  `packages/shared/src/knowledge-bit.ts` is where `PendingPlacementSuggestion` and
  `resolvePlacementSuggestionInput` already live — the new shared types/schemas for this item go in
  the same file.
- **Route wiring convention** — `apps/api/src/router-table.ts:24-29` (tagging-scan/placement-scan
  entries), `apps/api/src/router.ts:11` (RouteName union), `apps/api/src/server.ts:17,354-355`
  (import + switch case). Mirror exactly for a new `POST /knowledge-bits/question-generation-scan`
  trigger route.

## Non-goals (Guarded tier — explicit)

- **No fill-in-the-blank generation in this item.** That's a separate backlog item; the schema and
  orchestrator below are written generically (a `kind` column, a generator function keyed by kind)
  so that item only adds a second prompt + a second `kind` value, not a new table.
- **No embedding of the generated question/answer in this item.** A later backlog item
  ("Embed each generated question and answer...") owns that — this item only stores plain text.
  `embedding`/`embeddingHash`/`embeddedAt` columns are added now (mirroring `topicCardVariants`)
  so that later item is additive, but nothing populates them yet.
- **No serving these questions to a learner yet** (no probe/study-session integration). This item
  only generates and stores; a later item wires them into an actual review flow.
- **No touching the tagging system.** `tag-auto-assign.ts`, `tag-cap-guard.repo.ts`,
  `match-closest-tag.ts`, `apps/api/src/biz-education-distiller/` stay untouched, per the
  direction's standing Non-goals.
- **No admin UI in this item.** Storage + generation only; nothing user-facing to build/review here
  (unlike the placement-suggestion item, there's no accept/reject decision to make).

## Design

1. **Schema** — new table `knowledgeBitQuestionVariants` (mirrors `topicCardVariants`):
   ```ts
   export const knowledgeBitQuestionVariantKindSchema = z.enum(["wh_question"]);
   // (fill_in_the_blank added by the next backlog item, not this one)

   export const knowledgeBitQuestionVariants = pgTable("knowledge_bit_question_variants", {
     id: text("id").primaryKey(),
     knowledgeBitId: text("knowledge_bit_id").notNull(),
     kind: text("kind").notNull(), // "wh_question" for now
     order: integer("order").notNull(),
     prompt: text("prompt").notNull(),
     answer: text("answer").notNull(),
     embedding: jsonb("embedding").$type<number[]>(),
     embeddingHash: text("embedding_hash"),
     embeddedAt: timestamp("embedded_at", { withTimezone: true }),
     createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
   });
   ```
   Plus two nullable timestamps on `knowledgeBits`, same convention as `taggedAt`/`tagFailedAt`:
   `whQuestionGeneratedAt`, `whQuestionGenerationFailedAt`. Generate + apply the migration.

2. **Agent** — `apps/api/src/mastra/knowledge-bit-question-generator.agent.ts`. Cheap tier
   (`tierToModelId("cheap")`). Instructions write the **knowledge-fisher persona** explicitly: "You
   are a knowledge fisher — given a fact, you don't ask learners to repeat it back, you ask the
   question whose answer IS the fact, framed so answering it requires understanding *why* the fact
   is true or *why* it matters, not just recognizing the words." Structured output:
   `z.object({ question: z.string().min(1), answer: z.string().min(1) })`. Same untrusted-content
   framing as the tagger's `<bit>...</bit>` wrapping (bit text is never instructions).

3. **Repo** — `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts`:
   `listKnowledgeBitsForQuestionGenerationScan(limit, db?)` (bits where
   `whQuestionGeneratedAt IS NULL AND whQuestionGenerationFailedAt IS NULL`),
   `insertQuestionVariant(knowledgeBitId, kind, order, prompt, answer, db?)`,
   `markWhQuestionGenerated(bitId, db?)`, `markWhQuestionGenerationFailed(bitId, db?)`.

4. **Orchestrator** — `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts`,
   exports `generateKnowledgeBitQuestions()`, `QUESTION_GENERATION_CAP = 50` (same cap as tagging,
   same cost rationale). Per bit: call the agent, validate the structured result (non-empty
   question/answer, reasonable length caps mirroring `candidateNameSchema`'s pattern in the tagging
   orchestrator), insert one `knowledgeBitQuestionVariants` row with `kind: "wh_question", order: 0`,
   mark generated. Failure → mark failed, continue (never let one bit's failure stop the batch,
   same isolation as tagging).

5. **Route** — `POST /knowledge-bits/question-generation-scan` (trigger, same auth/shape as
   `triggerKnowledgeBitTaggingScan`), returns `{scanned, generated, failed}`.

## Rollback note

Additive: one new table (no FK constraint, matching this schema's existing convention of no FKs on
`knowledgeBits`-adjacent tables), two new nullable columns on `knowledgeBits`, one new agent file,
one new repo file, one new orchestrator file, one new route. Revert by dropping the migration and
removing the route entries; no existing table or route is modified.
