# Difficult-card reworded versions — plan

## Business behaviour
- A card (plain note-level card, card key `''`) is **difficult** when all hold, counting only non-undone reviews of that card:
  - first review 7+ days ago, and 4+ reviews;
  - and any of: 2+ Again; Again+Hard on at least half its reviews; an Again whose `prev_schedule.intervalDays >= 3`.
- **Retired**: a card stops being difficult while its last two reviews are both Good/Easy, each with `prev_schedule.intervalDays >= 7`. A later Again breaks that pair, so the card turns difficult again on its own.
- Difficult cards get up to 3 reworded fronts (angles: outcome→cause, real situation, fill the gap, ask for the reason). The answer stays the original answer.
- Reworded fronts wait for approval in web Triage. Approved ones become extra versions of the same card: one schedule, one review history, rotation picks the least-recently-shown version.
- Reworded versions show in review only while the card is difficult. Rows are kept after retirement, just not picked.
- Near-duplicate report: read-only list of approved Business+Sales card pairs that say nearly the same thing, for the user to decide.

## Architecture / ownership
- Difficulty is computed on the fly in SQL. There is no new column: review history is small and the condition only runs for `reworded` rows.
- `knowledge-bit` owns the difficulty rule (`knowledge-bit-card-difficulty.repo.ts`). It is the single source used by the review queue, the alternate-variant pick and the generation scan.
- New entity folder `apps/api/src/card-rewording/` owns:
  - pending drafts;
  - generation;
  - approve/reject.
- Drafts live in their own table until approved, so no existing variant reader (browser, export, triage, MCP) ever sees an unapproved front. Approval inserts a real variant of kind `reworded`.
- Generation runs as a new pass in the knowledge-bit pipeline kick (after card_dedup). There is also a manual script. Both are capped at 10 cards per run and 3 drafts per card.

## Data contracts
- Shared: add `"reworded"` to `knowledgeBitQuestionVariantKindSchema` and append it to `ANKI_VARIANT_KIND_PREFERENCE`.
  - Swift decodes `kind` as String, so native apps are safe.
  - Verify the card-key SQL maps `reworded` to `''`.
- New table `knowledge_bit_reworded_drafts`:
  - `id` (`kbrd_` prefix), `knowledge_bit_id`, `prompt`, `answer`, `angle` (`cause|situation|gap|reason`), `model_id`, `created_at`;
  - `decision` (`approved|rejected|null`), `decided_at`, `variant_id` (nullable);
  - index on `(knowledge_bit_id)`.
- Migration: `npm run db:generate -w @post-anki/api`. It is applied by the existing migrate step in deploy; never `drizzle-kit push`.
- Zod in shared `reworded-draft.ts`:
  - `rewordedDraftSchema`: id, knowledgeBitId, originalPrompt, answer, prompt, angle, createdAt;
  - `decideRewordedDraftInputSchema`: `{ decision: "approved" | "rejected" }`.
- Routes:
  - `GET /reworded-drafts` returns pending drafts with the original front.
  - `POST /reworded-drafts/:id/decision` takes `{decision}`. It returns 404 for unknown ids, and 409 if the draft is already decided or the bit is no longer approved.

## Build units (in order)
1. **Difficulty rule + retire rule** (items: flag difficult, retire).
   - Files: `apps/api/src/knowledge-bit/knowledge-bit-card-difficulty.repo.ts`, constants in `knowledge-bit-card-difficulty.config.ts`.
   - Exports:
     - `cardIsDifficultSql(bitIdCol, cardKeyCol, now)`, an EXISTS-style SQL fragment;
     - `listDifficultPlainCards(db, { subjectIds?, limit, excludeWithDrafts })` returning bitId, basic front/back, subjectId.
   - Tests: `knowledge-bit-card-difficulty.repo.integration.test.ts`, which should:
     - flag 2 Agains;
     - flag half Again/Hard;
     - flag Again after a 3-day gap;
     - not flag under 4 reviews or first review <7 days;
     - ignore undone reviews;
     - un-flag after two Good/Easy at 7+ day gaps;
     - re-flag after a later Again.
2. **Model trial** (item: compare models). Depends on 1.
   - Files:
     - `apps/api/src/card-rewording/card-rewording.prompt.ts`: instructions, Zod output `{versions:[{angle,prompt}]}` (2–3 items), prompt builder with `escapePromptTags`;
     - `apps/api/scripts/compare-reword-models.ts`.
   - Script behaviour:
     - read-only transaction;
     - takes 5 difficult cards from the Business tree;
     - runs each through `openrouter/google/gemma-4-31b-it`, `openrouter/openai/gpt-4o-mini`, `openrouter/deepseek/deepseek-v4-pro`, using an Agent pinned via requestContext `knowledgeItemModelId`;
     - writes `.planning/difficult-card-versions/model-trial.md` (card, each model's versions, tokens/cost if reported, failures).
   - Tests: `card-rewording.prompt.test.ts` should keep the answer out of the instructions and escape untrusted card text.
   - Run it once (small OpenRouter spend). The implementer picks the model and records it as `CARD_REWORDING_MODEL_ID` in `card-rewording.config.ts`.
3. **Drafts table + generation**.
   - Files:
     - schema + migration;
     - shared enum + `reworded-draft.ts`;
     - `apps/api/src/mastra/card-rewording.agent.ts` (registered in mastra AGENT_KEYS, `generateWithRetry`);
     - `apps/api/src/card-rewording/card-rewording.repo.ts`, `card-rewording.orchestrator.ts` (`runCardRewordingScan`), `card-rewording.validate.ts`;
     - add pass `reworded_versions` to `KNOWLEDGE_BIT_PIPELINE_PASSES`;
     - `apps/api/scripts/reword-difficult-cards.ts` (`--dry-run`, `--limit`) + npm script.
   - Validation drops a version when:
     - its front equals the original;
     - its front contains the answer (normalized);
     - it is empty or over the front max chars;
     - it duplicates another version.
   - Cards that already have any draft (any decision) are skipped, so rejected ones are not regenerated.
   - Tests:
     - validate unit tests;
     - orchestrator unit test with mocked agent/repo: it should cap at 10 cards, skip cards with drafts, and store at most 3.
4. **Approval in web Triage**.
   - Files:
     - `apps/api/src/card-rewording/card-rewording.controller.ts` + router-table entries;
     - repo `decideRewordedDraft` (tx: lock draft; approve inserts variant kind `reworded`, next free `order`, `cardKey: cardTextKey(prompt, answer)`, sets `variant_id`; reject sets the decision);
     - web `apps/web/src/card-triage/reworded-drafts-section.tsx` + `reworded-drafts.api.ts`, rendered on the triage page.
   - Tests:
     - controller tests (404/409/validation);
     - repo integration: approve creates an active `reworded` variant sharing the bit's schedule;
     - RTL: shows the original vs the reworded front, and approve/reject calls the API.
5. **Review visibility**.
   - Files: `knowledge-bit-review-queue-picked.repo.ts` `eligibility()` gains `or(ne(kind,'reworded'), cardIsDifficultSql(...))`; same filter in `knowledge-bit-review-alt-variant.repo.ts`.
   - Tests: extend the rotation integration test:
     - a difficult card should rotate its approved reworded version;
     - a non-difficult or retired card should never show it;
     - grading a reworded version should update the shared schedule.
6. **Near-duplicate report** (duplicate-detection item). Independent; can run alongside 1.
   - File: `apps/api/scripts/list-near-duplicate-cards.ts --subject Business`.
   - Behaviour:
     - read-only;
     - covers approved bits in the subject tree;
     - pgvector self-join on active basic variants' `embedding_vec`, similarity ≥ `CARD_DEDUP_BORDERLINE_THRESHOLD` (0.85);
     - cards without embeddings are embedded in memory via `embedTexts` (no writes);
     - writes `.planning/near-duplicate-cards/report.md` (pairs, similarity, both fronts/backs, ids).
   - Tests: pair-building/formatting pure function test.

## Defaults taken
- Difficulty is computed on the fly; no stored flag or migration for it.
- Drafts use a separate table instead of a pending state on variants, to avoid leaking unapproved fronts to every variant reader.
- Approval is web Triage only. iPhone/Mac triage of reworded drafts is deferred (Swift tolerates the new kind in review).
- Generation runs in the pipeline kick plus a manual script, not on every grade.
- Caps: 10 cards per run, 3 drafts per card. A card with any draft is never regenerated.
- The trial uses prod data read-only, at a few cents of OpenRouter spend. The generation model is fixed in config from the trial result, not taken from the admin knowledge-item setting.
- The near-duplicate report is a script output for the user, with no UI.
