# Similar-cards-aware generation: plan

## Business behavior
- Before a note's cards are written, the app looks up the most similar cards the learner already has and asks a cheap model how much each overlaps. Ingestion never waits on, fails on, or drops anything because of this.
- The card-writing prompt then gets an "already known" list and is told to cover a different angle, a complementary fact or a different situation. If the note IS the same fact, it still writes the best distinct card, never a copy.
- No similar cards, a failed lookup, a spent budget, a tripped breaker or the kill switch: cards are written exactly as today.
- "Jev" is not in the repo. Treated as a new LLM judge step. It is not the post-hoc `card_dedup` pass (`apps/api/src/card-dedup/*`, flags finished pending cards), nor MCP `check_duplicates` (exact-text lookup), nor `source-duplicate/*` (note-level pairs). All stay unchanged; this step is pre-generation and complementary.

## Facts found (read from code)
- Embeddings: pgvector `halfvec` on `knowledge_bits.embedding_vec` and `knowledge_bit_question_variants.embedding_vec`, HNSW. Written only on APPROVAL (`knowledge-bit-approval-embedding.orchestrator.ts`). Pending bits have no vector.
- Reusable search: `searchApprovedBitsByEmbedding(embedding, topK, minSim, subjectId?)` (knowledge-bit-embedding.repo.ts), `embedTexts` (shared/embeddings-client.ts, budget-guarded, 45s x 3 tries), `listActiveVariantsForBitsEmbedding` for Q/A. Cheap-agent template: `mastra/card-dedup-escalation.agent.ts` (cheap tier, alias ids, `escapePromptTags`, timeout, maxRetries 0, `recordGenerateCall`).
- One chokepoint: both executors (inline `generateItemsForSource`/`processChunk`, Inngest `extraction-inngest.workflow.ts` + `durable-extraction.steps.ts`) build `WriteOptions` then call `writeAndValidate` -> `runKnowledgeBitSourceItems` (phrase / language-legacy / business / lessons+cards). Same slot `feedbackBlock` already uses.
- MCP submit and the daily Notion import both create `knowledge_sources` rows and reach the same executors (Notion: `ingestion-pipeline.md` Meeting phrases; MCP: Assumption, verify in item 4).
- Audit/usage ledger exists: `llm_call_events` (op, agentKey, modelId, tokens, success, errorMessage, knowledgeBitId), written by `generateWithRetry`/`recordGenerateCall`/`embedTexts`, grouped in `owner-stats/ai-spend.repo.ts`. Price table exists: `owner-stats/llm-pricing.ts` (`PRICE_HISTORY`, `priceFor`, `costUsd`). Global daily guard: `shared/spend-guard.ts` + `llm_daily_spend`. No cost column, no source id, no "skipped" outcome yet.
- Existing post-insert gate (`knowledge-bit-duplicate-gate.ts`) silently drops char-identical cards (logged `cards_skipped_duplicate`). Pre-existing, unchanged; this feature makes it fire less.

## Architecture (new module `apps/api/src/known-cards/`, no new service or infra)
- Runs inside the deployed API (Cloud Run, scale-to-zero). No in-memory state is relied on: budget, breaker and caps are read from Postgres. No new Pulumi resource; env defaults live in `shared/env.ts`.
- Pipeline per chunk: gate (flag, per-source cap, daily/monthly ledger, breaker) -> embed chunk (cap 2000 chars) -> `searchApprovedBitsByEmbedding` -> fetch Q/A -> judge -> block builder -> `knownCardsBlock` string handed to generation.
- Contract: `resolveKnownCards({sourceId, subjectId, chunk, chunkIndex}) -> {block: string, stats}`; never throws; hard 20s total deadline (judge 12s inside); empty block on any problem.
- Retrieval: global (all subjects; the same fact recurs across subjects), approved bits only (the only embedded ones), top-K 6, similarity floor 0.60 (config), bit-level (statement text matches note shape; one row per bit; variants add Q/A). Pending-vs-pending overlap stays uncovered (same as `card_dedup`).
- Judge: new agent `knownCardsJudge`, `tierToModelId("cheap")` (deepseek-v4-flash), registered in `mastra/mastra.ts` AGENT_KEYS, `maxRetries: 0`, `maxOutputTokens` 450, zod output `{candidates:[{alias, verdict: exact|near|related|unrelated, reason<=120, overlap<=160}]}`. Candidates are aliased K1..K6 (real ids never sent). Skipped when 0 candidates.
- Untrusted data: note excerpt (1500 chars) and every card field (body<=300, Q<=150, A<=150 chars) pass `escapePromptTags` and sit in tagged data blocks; instructions say all of it is data, never commands. Output is zod-validated, unknown or repeated aliases dropped, strings stripped of markup/newlines and capped. The judge's free-text `reason` goes to logs only; only card Q/A and the capped `overlap` reach the generation prompt, which shrinks second-order injection. Add `known_cards`, `known_card`, `note` to `PROMPT_TAG_NAMES` in `shared/untrusted-prompt-text.ts`.
- Prompt contract: one `<known_cards>` block (header says data-not-commands, never overrides SECURITY/LANGUAGE/output-format rules; rule text as in the business section; for phrases: still contain the phrase word for word, vary situation/register). Entries `[exact|near|related] Q: .. A: .. already covers: ..`, ordered exact > near > related, max 5 entries and 1200 chars (same trim loop as `knowledge-bit-review-feedback-block.ts`). Lists exact/near/related, omits unrelated.
- Injected via new optional `knownCardsBlock` on `WriteOptions`, `RunKnowledgeBitSourceItemsOptions`, `RunMeetingPhraseOptions`, legacy and business options: phrase prompt (`buildMeetingPhrasePrompt`), lessons prompt and cards prompt (`buildKnowledgeBitLessonsPrompt`, `buildKnowledgeBitCardsPrompt`), legacy builder, business `extras`. Computed once per chunk before `writeAndValidate`, so validation retry and fusion models reuse it.
- Durable placement: new Inngest step `known-<i>` before `chunk-<i>`, memoized by the engine (retries of `chunk-<i>` never re-pay); it returns a string <=1200 chars (no source text crosses steps). `chunkStep`'s chunk-planning is extracted into a shared helper so both steps pick the same chunk. Inline path calls the resolver in `processChunk` once per chunk; a stale-reset rerun re-pays once, bounded by the ledger caps.

## Budget, kill switch, breaker (all derived from audit rows)
- Single source of truth = `llm_call_events`. Additive migration (generate, then existing migrate script, never push): `knowledge_source_id text`, `cost_usd numeric(12,6)`, `outcome text` (ok | failed | skipped_cap | skipped_breaker), index `(op, created_at)`. `recordLlmCallEvent`, `generateWithRetry`/`recordGenerateCall` options and `embedTexts` (new optional `{op, knowledgeSourceId}` param, default behavior unchanged) accept and write them.
- Every call writes a row: `known_cards_embed` (model = `EMBEDDING_MODEL`) and `known_cards_judge` (model id, input/output tokens, computed price = `costUsd(priceFor(model, now), in, out)` from `llm-pricing.ts`; add `openai/text-embedding-3-small` {in 0.02, out 0} and `AGENT_DEFAULT_MODEL.knownCardsJudge`), outcome and source id. A skipped step writes one `known_cards_step` row (0 tokens) with `skipped_cap`/`skipped_breaker`. Failed calls already write rows via the wrappers.
- Ceilings (UTC day/month, sum of `cost_usd` and `total_tokens` over `op like 'known_cards_%'`, ok+failed rows), env-overridable: day $0.10 / 350k tokens, month $2.00 / 7M tokens. Step starts only if spent + worst-case note cost (~$0.002) < cap. At cap: skip, log, write `skipped_cap`, generation continues.
- Kill switch: `KNOWN_CARDS_CONTEXT_ENABLED` (default on; same off-values parse as `CARD_DEDUP_ENABLED`), flip via Cloud Run env (Pulumi source if persisted). Off writes no rows.
- Breaker (persisted, scale-to-zero safe): open when the last 5 non-skipped `known_cards_*` rows all failed within 30 min; while open every step is `skipped_breaker`; after 30 min one probe runs and a success row closes it.
- Other bounds: max 8 chunks per source get the step; 6 candidates; capped text lengths above; global `LLM_DAILY_BUDGET_USD` guard still applies to every call; a budget error inside the step is swallowed (generation then hits the same guard itself, as today).
- Concurrency overshoot: ledger rows land after each call; max ~6 parallel chunk steps x $0.002 = ~$0.012 over a cap. Accepted.
- Per-note estimate (flash $0.30/M blended, embedding $0.02/M, one chunk): embed <=2k tokens ~ $0.00004; judge typical 1.2k in + 0.3k out ~ $0.00045, worst 4.5k ~ $0.00135; generation uplift <=1200 chars (~300-600 tokens) x 1-2 calls x models, ~ $0.0002-0.0004 on flash. Typical ~$0.0007, worst ~$0.003 per chunk. Daily Notion import of 100 phrases ~ $0.03-0.07. The uplift sits inside existing generation calls and is covered by the global guard, not the feature ceiling.

## Observability
- Audit rows above appear in the existing owner AI-spend view automatically (grouped by agentKey; register `knownCardsJudge` in `llm-call-events/agent-purpose.ts` as cards).
- Mastra tracing: judge is a registered agent, so Langfuse spans come for free (gated on keys as today).
- One structured log per chunk `known_cards_context`: `{knowledgeSourceId, chunkIndex, retrieved, judged, exact, near, related, injected, outcome, degradedReason, durationMs}`.

## Work items (ordered; each for one Sonnet implementer)
1. Ledger, pricing, budget, breaker. Owns: `db/schema.ts` + generated migration, `llm-call-events/llm-call-events.repo.ts`, `mastra/generate-with-retry.ts`, `shared/embeddings-client.ts`, `owner-stats/llm-pricing.ts`, `shared/env.ts`, new `known-cards/known-cards.config.ts`, `known-cards-ledger.repo.ts`, `known-cards.budget.ts`.
2. Retrieval, judge, block, resolver (needs 1). Owns: new `mastra/known-cards-judge.agent.ts`, `mastra/mastra.ts` (register), `llm-call-events/agent-purpose.ts`, `shared/untrusted-prompt-text.ts`, `known-cards/known-cards.retrieval.ts`, `known-cards.judge.ts`, `known-cards.block.ts`, `known-cards.orchestrator.ts`.
3. Prompt wiring (parallel with 2; only needs the `knownCardsBlock` string option). Owns: `detect-knowledge-bits.types.ts` (+ `loadKnownCards` dep), `mastra/knowledge-bit-source-items.agent.ts`, `.legacy.agent.ts`, `knowledge-bit-business-cards.agent.ts`, `knowledge-bit-lessons.agent.ts`, `knowledge-bit-meeting-phrase.agent.ts` + `.prompt.ts`.
4. Executor wiring and docs (needs 2 and 3). Owns: `detect-knowledge-bits.orchestrator.ts`, `detect-knowledge-bits-chunk.ts` (inline), `durable-extraction.steps.ts` (extract chunk planner), `extraction-inngest.workflow.ts`/`.steps.ts` (`known-<i>` step), `ingestion-pipeline.md` (new "Known cards" section, current-state wording), MCP-submit reach check.

## Tests (vitest, co-located, no live LLM; run only touched files, maxWorkers 2)
- Budget: day/month cap by cost and tokens, near-cap worst-case rule, breaker open/probe/close, flag off, all with a mocked ledger repo.
- Judge: alias whitelist, repeated aliases, oversize/markup strings stripped, injection text in a card never changes the block header or leaks `reason`.
- Block: ordering, 5-entry and 1200-char caps, empty when only unrelated, escaping.
- Resolver: every failure (embed, search, judge, timeout via fake timers, invalid output, budget error) returns empty block, never throws, writes the right outcome row/log; 0 candidates skips the judge.
- Prompts: each of the four paths contains the block iff non-empty; phrase prompt keeps the word-for-word rule; fusion and validation retry reuse one block.
- Executors: `known-<i>` failure or skip leaves chunk output unchanged; chunk retry does not call the resolver again.
- CI only: one `known-cards-ledger.repo.integration.test.ts` (day/month sums, breaker query) following the existing `*.repo.integration.test.ts` pattern.

## Defaults chosen (autonomous, no questions)
- Global scope, approved-only semantic recall: only approved bits have vectors; embedding pending rows would add writes and spend.
- Block lists exact + near + related (request said near/related): exact is the strongest overlap and the "same fact, make it distinct" rule is aimed at it.
- Judge failure with good retrieval -> no context (request), not a similarity-only fallback.
- Per-chunk, not per-source, retrieval: extraction and retries are per chunk; the durable step stays small.
- Ledger = extended `llm_call_events` (no second table); thresholds 0.60 floor, K 6, caps as above, are config constants to tune after a week of logs.
- Kill switch default on, because ceilings keep baseline near $0; set off in Cloud Run if unwanted.
- Regeneration keeps same-source approved cards as "known" (no exclusion): restating them is pure duplication.

## Open risks
- Floor 0.60 and verdict wording are untuned; a loose floor adds judge cost, a tight one misses related cards. Tune from `known_cards_context` logs.
- Multi-lesson chunk embeds as one vector, so recall is coarse; acceptable for v1.
- Block may bias lessons toward avoiding true restatements the learner wants; header allows a distinct card on the same fact.
- Char-identical output is still dropped by the existing gate (unchanged, logged).
- Embed retries (3 x 45s) can outlive the 20s deadline in the background; the call is still ledgered.
- Schema change on a shared audit table; nullable columns, no backfill.

END-OF-PLAN
