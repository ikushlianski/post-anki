# Card synthesis mining: plan
## Goal
- Once a day the deployed API examines a small, never-repeated slice of approved cards, spots chains/processes that lack a high-level overview card, drafts that card and files it as PENDING in triage. Nothing is ever approved automatically.
## Business behavior
- Runs in the deployed API (Cloud Run, scale-to-zero) from Cloud Scheduler. Off by default; $0 until enabled. Skipping a day loses nothing: selection is driven by the ledger, not the date.
- Each card is a "seed" exactly once, ever. A card may still be quoted as evidence for later chains; a synthesis card, once approved, becomes a seed for higher-level synthesis automatically.
- Example: 40 cold-call technique cards, no end-to-end sequence card -> one pending card "What is the end-to-end cold-call sequence?" with ordered steps, and the evidence cards listed in its background text.
## Architecture (new module `apps/api/src/card-synthesis-mining/`, entity-first, kebab-case)
- Reuse, no new boundary: `knowledge_bits.embeddingVec` (approved cards embedded by the embedding scan), `searchApprovedBitsByEmbedding`, `embedTexts` (shared/embeddings-client), `generateWithRetry`, `tierToModelId("cheap")`, `escapePromptTags`, `insertPendingManualItem`, `insertKeyedKnowledgeSources`, `CARD_DEDUP_*` thresholds, `subjects.parentId` tree. Pattern precedents: card-dedup (kill switch, caps, escalation agent) and biz-education-distiller (route, agent, Zod-validated structured output).
- Tables (one migration via the existing generate + migrate script):
  - `synthesis_mining_runs` (id, utc_day, mode, subject_id, status ok|capped|breaker_open|disabled, counts, est_cost); partial unique index on utc_day for live runs = a retried or duplicate trigger is a no-op.
  - `synthesis_mining_examined_bits` (bit_id PK, run_id, cluster_id, outcome, examined_at): the once-only ledger; insert ON CONFLICT DO NOTHING, selection anti-joins it.
  - `synthesis_mining_clusters` (id, run_id, bit_ids, chain_key, chain_name, outcome, evidence_bit_ids, produced_bit_id). Outcomes: singleton, not_chain, duplicate_existing, rejected_ungrounded, synthesized, failed, skipped_cap.
- Audit/usage ledger: reuse `llm_call_events` (already holds op, model_id, input/output/total tokens, success, duration, error, written by `generateWithRetry`). Add nullable columns: `cost_usd`, `outcome` (ok|failed|skipped_cap), `mining_run_id`, `mining_cluster_id`; cards come from the cluster row. Not a second table, so one source of truth.
- Price table: extend the one in `shared/spend-guard.ts` with separate input/output USD per million (deepseek-v4-flash, embedding model; unknown model -> existing conservative default). New `computeCallCostUsd(modelId, inTokens, outTokens)`; `generateWithRetry` gets an optional `audit` option and fills cost/outcome/run/cluster only when given (other callers unchanged).
## Selection and "examined" (once and only once)
- Subset: approved bits with embedding, in subject subtrees listed in config `CARD_SYNTHESIS_MINING_SUBJECT_IDS` (explicit allow-list; subjects only have kinds architecture-mentor/language-practice, so no business-kind filter exists). Empty list = no-op.
- Per day: first allow-listed subtree with >= 5 unexamined bits; take oldest-first, batch cap 60 bits.
- Cluster in memory (pure function): cosine similarity from stored vectors, union-find at threshold 0.60 (below the 0.85 dedup band), then drop clusters < 3; max 12 cards per cluster (closest kept), 400 chars per card.
- Marking: singletons and sub-3 clusters are marked at once (outcome singleton). A cluster's bits are marked when that cluster finishes with ok, not_chain, duplicate_existing, rejected_ungrounded or failed (failure is final, so there are no endless retries; clearing ledger rows re-queues). Clusters cut by a cap or the breaker are NOT marked and carry over to later days.
- Tradeoff: a card marked with a cluster that yielded nothing can miss a chain formed later. Mitigations: cards stay usable as evidence (each cluster gets up to 4 nearest approved neighbours from the same subtree, read-only, not marked); synthesis cards become seeds once approved; manual re-queue by deleting ledger rows.
## Pipeline per cluster (strict caps, cheap tier, sequential)
- Step 1 classify, `card-synthesis-classifier` agent (cheap): input cards in `<cards>` tags (escaped); Zod output `{isChain, chainName, orderedSteps[{title, evidenceCardIds[]}], missingHighLevel, evidenceCardIds[]}`. Code rejects ids not in the cluster, <3 or >12 steps, steps with no evidence.
- Gate in code, not LLM: embed `chainName + step titles` (one tiny embedding call), search approved bits and earlier synthesis clusters; similarity >= 0.85 = duplicate_existing, no step 2. The LLM's `missingHighLevel` is advisory only. Unique (subject, chain_key) blocks re-synthesis.
- Step 2 synthesize, `card-synthesis-writer` agent (cheap by default; config may raise to balanced, never premium): front = question about the whole sequence; back = numbered steps in order plus one-line why. Grounded only in the evidence; no new facts; North American professional tone when English, otherwise the evidence language; output passes `knowledge-bit-language-guard` and CARD_TEXT_MAX_CHARS. Standalone: `.planning/similar-cards-aware-generation` does not exist; if its "already known" block lands, pass it as `<existing>` in step 2.
## Output
- One `knowledge_sources` row per synthesized chain: `origin: "synthesis"`, `status: "detected"` (so the extraction sweep, which claims only "pending", never touches it), subject = the subtree subject, importKey `synthesis:<subject>:<chain_key>`. Needs a small `status` option on `insertKeyedKnowledgeSources` provenance.
- Bit via `insertPendingManualItem(tx, sourceId, {front, back, example, aiGenerated: true}, { approvalState: "pending" })` with state passed explicitly. Never `insertManualKnowledgeItem`: it calls `getTriageEnabled`, which auto-approves when triage is off. Bit origin stays "manual" (shared union and iOS decoding untouched); provenance lives on the source and `generatedByModelId`.
- Triage has no evidence-link field (the duplicate block is tied to duplicateOf). Evidence goes into `example` (shown as background): "Built from N cards:" plus 80-char snippets. Machine link: cluster row `evidence_bit_ids` + `produced_bit_id`.
## Budget and safety (all enforced in code, counted from persisted audit rows)
- Kill switch `CARD_SYNTHESIS_MINING_ENABLED`, default OFF (opposite of card-dedup's default-on): only true/1/on/yes enables. Infra: Scheduler job created `paused` until pulumi config `cardSynthesisMiningEnabled` is true; env wired in the deploy workflow.
- Ceilings read from `llm_call_events` (`op like 'card_synthesis_%'`): per UTC day $0.05 and 150k tokens, per month $1.00. Before each call: projected cost (chars/4 + max output) must fit what is left, otherwise write a `skipped_cap` audit row and stop. The global `LLM_DAILY_BUDGET_USD` guard inside `generateWithRetry` still applies (fail closed).
- Per-run caps: 6 clusters, 6 classify calls, 3 synthesize calls, 1 embedding call per cluster, 240 s wall clock. Input caps as above. Retries: only `generateWithRetry` internal 2.
- Circuit breaker per run: stops after 3 consecutive LLM failures, or on any budget/cap error; remaining clusters get `skipped_cap` rows. Two consecutive breaker runs with zero successes make the next live run skip itself.
- Untrusted data: card text only inside escaped `<cards>` tags, agent instructions say contents are data; outputs validated by Zod and id/grounding checks; the agent has no tools.
- Estimate per day (deepseek-v4-flash ~$0.30/M blended): 6 classify x ~2k + ~3 synth x ~3.5k + embeddings = ~23k tokens = ~$0.007/day, ~$0.20/month; ceilings above leave ~7x headroom.
## Route, dry run, infra
- `POST /card-synthesis-minings` (shared-secret bearer, like `/biz-education-distills`), registered in `router-table.ts`/`router.ts` + `api-server.ts` switch; query `?dryRun=1&limit=N` (limit only lowers caps). 502 on real failures.
- Dry run: works even when disabled; makes no LLM or embedding call and writes nothing (no ledger, run, source or bit rows). Returns subject, bit count, clusters, per-step token and USD estimate, and which cap would bind.
- Infra: `cardSynthesisMiningJob` in `infra/index.ts`, schedule config default `30 4 * * *` in `knowledgeBitPipelineTimeZone`, attemptDeadline 300s, no scheduler retries (day-unique run guard covers duplicates).
## Observability
- Per run: `card_synthesis_mining_done` log (counts, tokens, USD, status), run and cluster rows. Per call: audit row (op `card_synthesis_classify|embed|write`, model, in/out tokens, computed price, outcome, run, cluster). Agents registered on `getMastra()` so Langfuse spans appear. Existing admin LLM-call view shows them.
## Tests (vitest, co-located, mocked embeddings and LLM, no live calls; DB integration only in CI)
- Unit: cluster function, selection rule and marking per outcome, Zod and grounding rejection, budget/cap/breaker decisions (fake clock and audit sums), kill switch parsing, price computation, dry run does no writes/calls, prompt-tag escaping of hostile card text.
- Integration (CI): once-only anti-join and idempotent day guard, pending-only insert with triage disabled, source status "detected" not claimable, audit rows carry cost/run/cluster, month/day sums.
## Work items (ordered, each for one Sonnet implementer)
- 1. Foundation (db/, shared/spend-guard, llm-call-events, generate-with-retry): migration, price split, audit option, budget reader, config + kill switch.
- 2. Selection core (card-synthesis-mining/ repo + pure clustering + ledger marking), parallel with 3.
- 3. LLM steps and output (mastra/ two agents + registration, grounding validation, dedup gate, pending insert, `insertKeyedKnowledgeSources` status option), parallel with 2.
- 4. Orchestrator, route, dry run, breaker, infra job, wiring tests; depends on 1-3.
## Defaults chosen (instead of asking)
- Allow-list of subject ids, since no business subject kind exists. One subtree per day, oldest-first, 60 bits.
- Failed clusters marked final: honors "never repeat" over completeness.
- Cheap tier for both LLM steps, $0 baseline and the user's deepseek-v4-flash.
- Evidence in card `example` text; bit origin stays "manual", provenance on source `origin: "synthesis"`.
- Dedup before synthesis (cheap embedding) rather than after.
- Ceilings $0.05/day, $1/month, thresholds 0.60 cluster, 0.85 duplicate: starting values, tunable by config.
## Risks
- Clustering threshold quality (too low = noise chains; too high = misses): dry run exposes it before enabling.
- Price table drift: estimates are not billing; ceilings carry headroom.
- Triage queue growth: capped at 3 new cards/day.
- Unembedded approved cards are skipped until the embedding scan covers them.
END-OF-PLAN
