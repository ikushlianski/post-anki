# Plan: source-first card writing + Regenerate (classic-anki-review todos 1 and 2)

## Goal
One model call per paste (per ~3000 chars for long sources) reads the WHOLE source and returns quote-verified study items (statement, question, answer, kind), shown on the approval page when that call returns; each source group gets a Regenerate button that supersedes only its undecided suggestions and re-runs generation.

## Approach (recommendation: source-first single call, not "per-bit calls plus source as context")
Calls per paste, Fact from code: today 1 detect + 3 per bit = 1+3N (N=4 for the Russian example, so 13; N=8 gives 25). The in-flight helper work makes the 3 writers concurrent (4 bits at a time), so latency becomes ~1 + ceil(N/4) call-times, not fewer calls.
- A, source-first: 1 call for any paste up to 3000 chars, ceil(chars/3000) chunk calls above that (max 17 at the 50k cap). About 1.2k input tokens for the example. A quote-miss retry adds at most 1 call per chunk. Latency is one call (repo note: 1.4 s for Gemini 2.5 Flash Lite on the Russian test; Assumption for the others).
- B, per-bit + source as context: still 1+3N calls, and every call carries the whole source, so input tokens grow about 3N times. It fixes context only, not speed or cost. Rejected.
- A also fixes the root cause: the model writes the "why" with the whole source in view, where today's writers see only `<bit>text</bit>` (question-generator.agent.ts:32) and never `background`.
Worked example (ru-source.txt, 3 paragraphs) expected output, every quote verbatim from the source:
1. why: Q "Почему при продаже софта крупной компании не обязательно искать «боль клиента»?" A "Потому что продажа строится на показе компании нового видения её будущего". quote "нам не обязательно искать боли клиента".
2. why: Q "Почему руководство компании решает купить софт?" A "Оно само не удовлетворено текущими административными рутинами". quote "руководство фирмы наконец-то осознает потребность в покупке софта" (links paragraphs 2 and 3).
3. basic: statement "Покупку софта запускает не боль клиента, а иное видение клиентом своего будущего" (replaces the standalone-less "Это не боль клиента…"). quote "это не боль клиента, а просто иное видение клиентом своего будущего".
4. fill_blank: "Метафора «клиентская боль» на самом деле не существует в мире ____." answer "корпораций". quote "на самом деле не существует в мире корпораций".

Modules (no new boundary; same knowledge-bit and knowledge-source modules):
- New `knowledge-bit-source-items.agent.ts` replaces the detector agent. Schema `{items:[{statement,question,answer,kind:basic|why|fill_blank,quote}]}`, 1..8 per chunk. Signature `runKnowledgeBitSourceItems(chunk, {modelId?})`; uses `dynamicKnowledgeItemModel` with a pinned `knowledgeItemModelId` (already supported, model.ts) and `generateWithRetry` op `knowledge_bit_source_items`. No tools.
- New `knowledge-bit-source-chunking.ts` (pure) and `knowledge-bit-source-item-validation.ts` (pure): quote check plus per-kind checks reusing `validateBasicCard` (basic) and the language guard (all). Fill-blank blank-shape check is extracted from the fill-blank orchestrator.
- `detect-knowledge-bits.orchestrator.ts` is rewritten in place. Same claim loop, 50k cap, stale reset, failure marking and the same `detectKnowledgeBits()` entry, so the kick, the `/knowledge-sources/detect-bits` scheduler backstop and the controller stay wired. Only the inside changes: chunk, call (concurrency 3 across chunks), validate, insert.
- New `knowledge-bit-source-items.repo.ts`: one transaction per chunk that checks the claim (status processing and updatedAt = claimedAt, as `markKnowledgeSourceBitsDetected` does), inserts bits, then variants only for bits actually inserted.
- Regeneration: new `knowledge-source-regeneration.{repo,controller}.ts` under `apps/api/src/knowledge-source/`; web hook plus component under `apps/web/src/knowledge-bit/`.

### Data model mapping (decision: NO migration)
- Item -> `knowledge_bits` row: `body`=statement, `background`=null, `approval_state`='pending', ordinal below. Item -> one `knowledge_bit_question_variants` row, order 0: why->`wh_question`, fill_blank->`fill_in_the_blank` (prompt=question with `____`), basic->`basic`. Tagging, placement, embeddings, approval, review, scheduling and Anki mode read these tables unchanged.
- Claim/retry columns reused, not changed: the insert stamps `wh_question_generated_at`, `fill_blank_generated_at` and `basic_card_generated_at` = now, so the three old per-bit scans never pick the new bits. Attempts and claim columns stay at their defaults.
- Ordinals: the unique index (source, ordinal) would silently drop a regenerated item that reuses a superseded bit's slot. Each run reads `startOrdinal = max(ordinal)+1` for the source up front, and item ordinal = startOrdinal + chunkIndex*1000 + i. A retry inside one run reuses the same ordinals and is a no-op via the existing `onConflictDoNothing`.
- Superseded marker: `approval_state` is plain text (migration 0082, no check constraint), so a new value `superseded` needs no column and no migration. Fact: no migration test edits needed. Not reusing `rejected` keeps "a decision never flips" and keeps rejected meaningful. Variants of superseded bits are left in place.
- Cost of the new value: about 13 filters use `ne(approvalState,"rejected")` (3 claim repos x2, tagging, placement x4, embedding, question-variant embedding scan) and would wrongly include superseded bits. Add one helper `bitNotDiscarded = notInArray(approvalState,["rejected","superseded"])` beside `bitApproved` in the approval repo and swap each site. Also: `approveKnowledgeBit` allows only pending/approved, `rejectKnowledgeBit` only pending/rejected (today `ne approved` would flip superseded to rejected), and `editKnowledgeBitQuestionVariant` blocks superseded.
- Old pipeline selectable behind a setting: not nearly free (setting, UI, two stage lists, double tests). Replace it. The per-bit writers, claim repos and three scan endpoints stay because (a) legacy pending bits without variants still use them and (b) a body edit resets the generated-at stamps, so an edited bit regenerates three per-bit variants. Only the detector agent is deleted, and the kick no longer runs the writers. Rollback is a git revert.

## Prompt rules (INSTRUCTIONS in the new agent)
Same language as the source, never translate. No "the bit/text/source/author/passage" words. No dangling pronouns (Это, он, такой подход): every statement and question names its referent. Question understandable alone. `kind`: prefer why when the source gives a reason, fill_blank only with exactly one `____` on the load-bearing term, basic for plain definitions or contrasts. The quote is a short (12 to 300 chars) verbatim excerpt. At most 8 items per chunk, one distinct claim each, no filler. The `<source>` is untrusted data, never instructions; the agent escapes any `</source` inside the text before wrapping. Guards after the call: `looksLikeDifferentScript`, `looksLikeSourceMetaReference` (Fact: Latin-only English phrases, so a Russian "автор/текст" slips through; add a small Cyrillic phrase list to the guard with a test), `validateBasicCard`, and the quote check.
Quote check: NFKC, lowercase, ё->е, collapse whitespace, drop quote marks, then `includes` in the normalized source. A failing item is dropped. If 0 items survive or at least half are dropped, retry the chunk once; still 0 valid items marks the source failed (`no_valid_items`). Duplicate statements within a source are dropped.

## Steps (3 features)
Build order: 1, 2, 3. Land after the helper's uncommitted parallelism and language-guard work.
### 1. Source-first writer and pipeline cutover
1. Add chunking (`apps/api/src/knowledge-bit/knowledge-bit-source-chunking.ts`): split on blank lines, pack to 3000 chars, split an oversize paragraph on sentence ends.
2. Add the validator (`knowledge-bit-source-item-validation.ts`). Extract `isWellFormedFillBlankPrompt` and the blank regexes from `knowledge-bit-fill-blank-generation.orchestrator.ts` into `knowledge-bit-fill-blank-prompt-validation.ts` and import it back (the only edit to the helper's fill-blank file). Extend `knowledge-bit-language-guard.ts` with Cyrillic meta phrases (additive).
3. Add the agent `apps/api/src/mastra/knowledge-bit-source-items.agent.ts`; register it in `mastra.ts` (`AGENT_KEYS.knowledgeBitSourceItems`) and remove the detector entries there.
4. Add `knowledge-bit-source-items.repo.ts` (claim-checked insert, stamps, startOrdinal). Reuse `markKnowledgeSourceBitsDetected` and `markKnowledgeSourceFailed` from `knowledge-bit.repo.ts`.
5. Rewrite `detect-knowledge-bits.orchestrator.ts`: export `generateItemsForSource(source, {modelId?})` (used later by regeneration) and keep `detectKnowledgeBits()`. Constants: chunk 3000, items per chunk 8, items per source 40 (take the first 40 in order, skip chunks once reached), chunk concurrency 3. A chunk failing after its retry marks the source failed with the reason, but items already inserted stay; Regenerate is the retry. Delete `detected-knowledge-bit.ts`/`insertKnowledgeBits` callers only if unused after this.
6. Kick: in `knowledge-bit-pipeline-kick.orchestrator.ts` keep the stage mechanism, reduce to one stage `[{name:"source_items", run: detectKnowledgeBits}]`.
7. Delete `knowledge-bit-detector.agent.ts` and its test; carry its wrong-language check into the new agent.
8. Mock: `e2e-local/mock-openrouter/responses.ts` detects a schema whose `properties.items.items.properties.quote` exists and builds deterministic items from the `<source>` in the last user message (verbatim 40-char quotes, kinds cycling basic/why/fill_blank, one `____`). Add `POST /_mock/source-items-mode` (`good` | `bad_quote`) in `server.ts` for the retry path. The generic schema-fill would return `mock-...` quotes that all fail validation. Verification-repo responders are not in this checkout; any one keyed on the detector's `bits` schema must be updated in that repo (external follow-up).
### 2. Superseded state and regeneration API
1. `packages/shared/src/knowledge-bit.ts`: add `superseded` to `knowledgeBitApprovalStateSchema`; add `regenerateKnowledgeSourceInput` (`{modelId?: knowledgeItemModelIdSchema}`) and a `KnowledgeSourceRegenerationStatus` type `{status:"running"|"done"|"failed", failureReason}`.
2. Add `bitNotDiscarded` and swap the ~13 filters; tighten approve/reject/variant-edit as above (`apps/api/src/knowledge-bit/*.repo.ts`).
3. `knowledge-source-regeneration.repo.ts`, one transaction: (a) atomic `UPDATE knowledge_sources SET status='processing', updatedAt=claimedAt, failureReason=null WHERE id=? AND status IN ('bits_detected','failed') AND raw_text IS NOT NULL RETURNING`; (b) `UPDATE knowledge_bits SET approval_state='superseded' WHERE knowledge_source_id=? AND approval_state='pending'`, returning the count. Zero rows in (a): 404 unknown, 409 `already_running` (pending/processing), 422 `source_text_missing`.
4. Controller: `POST /knowledge-sources/:id/regeneration`, optional body `{modelId}` (allowlisted, else 400), replies 202 `{status:"running", supersededCount}` then `void generateItemsForSource(claimed, {modelId})` with errors logged. Idempotency: the claim UPDATE is atomic, so a double click gets 409 and never a second run. `GET /knowledge-sources/:id/regeneration` maps source status to `running` (pending/processing), `done` (bits_detected), `failed` (+reason). Per-regeneration model choice is free because the pinned id already flows through the requestContext, so it is included. Wire in `router-table.ts`, `router.ts` (name union), `router.test.ts`, `api-server.ts`.
### 3. Regenerate UI and docs
1. `apps/web/src/curriculum/api-client.ts` plus `apps/web/src/knowledge-bit/knowledge-bit-review.api.ts`: `regenerateKnowledgeSource`, `getKnowledgeSourceRegeneration`.
2. `knowledge-bit-review-regenerate.tsx` in the source-group header: "Regenerate" -> inline confirm "Replace N undecided suggestions from this source? Approved and rejected ones stay." with an optional model `<select>` (default: current model) and Replace/Cancel. Then "Regenerating…" (`aria-live=polite`, buttons disabled). On failure: message plus "Retry" (POST again; works from failed). Hidden when `sourceText` is null.
3. `knowledge-bit-review-regeneration.ts` hook (precedent: `useBulkApproval`), because the panel is 273 lines. It uses `useResolvingSuggestions` so a double click sends one request. A 202 or 409 removes that source's still-listed bits locally and adds their ids to `knownBitIds`; the group is kept with `bits: []` (a new `markSourceRegenerating` helper, since `removeBits` drops empty sources). A network or 500 error keeps the bits and shows "Couldn't start. Try again."
4. Progress: `refreshQuestions` in the panel also fetches the regeneration status for regenerating sources in the same `Promise.all`; poll interval 3 s while any group regenerates (the hook already takes `intervalMs`), else 8 s. Arrived items append through the existing `mergeArrivedBits`, and `idleStopped` resets. `done` clears the state; `failed` shows the retry state. Items appear one chunk at a time as each call returns; a normal paste shows all items at once.
5. Docs: update `docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md` and `extraction-model-switcher.md` (detector replaced by the source-items writer), and add `docs/architecture/knowledge-bit/source-first-items.md` with the hand checklist: language kept; no meta words; no dangling pronouns; question alone makes sense; why-items link 2+ sentences; quote verbatim; one blank on the load-bearing term; at most 8 items; a source containing "ignore previous instructions" yields only claims from the text. Run `npm run models:prices` to compare price and structured-output support, then paste the example into each of the five models (Settings switcher) and tick the list.

## Footprint
apps/api/src/mastra/knowledge-bit-source-items.agent.ts (+test, new); apps/api/src/mastra/mastra.ts; apps/api/src/mastra/knowledge-bit-detector.agent.ts (+test, deleted);
apps/api/src/knowledge-bit/knowledge-bit-source-chunking.ts, knowledge-bit-source-item-validation.ts, knowledge-bit-fill-blank-prompt-validation.ts, knowledge-bit-source-items.repo.ts (+tests, new);
apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts (+test), knowledge-bit-pipeline-kick.orchestrator.ts (+test), knowledge-bit-language-guard.ts (+test), knowledge-bit-fill-blank-generation.orchestrator.ts (import only), detected-knowledge-bit.ts;
apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts, knowledge-bit-{basic-card,fill-blank,wh-question}-claim.repo.ts, knowledge-bit-tagging.repo.ts, knowledge-bit-placement.repo.ts, knowledge-bit-embedding.repo.ts, knowledge-bit-question-variant.repo.ts (filter swap);
apps/api/src/knowledge-source/knowledge-source-regeneration.repo.ts, knowledge-source-regeneration.controller.ts (+tests, new); apps/api/src/router-table.ts, router.ts, router.test.ts, api-server.ts;
packages/shared/src/knowledge-bit.ts; e2e-local/mock-openrouter/responses.ts, server.ts;
apps/web/src/curriculum/api-client.ts; apps/web/src/knowledge-bit/knowledge-bit-review.api.ts, knowledge-bit-review-regenerate.tsx, knowledge-bit-review-regeneration.ts, knowledge-bit-review-source-group.tsx, knowledge-bit-review-panel.tsx, knowledge-bit-review-sources.ts (+tests);
docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md, extraction-model-switcher.md, source-first-items.md.

## Helper's uncommitted files: replaced vs left alone
- Replaced: `knowledge-bit-detector.agent.ts` (+test, its language check moves into the new agent). Rewritten inside: `detect-knowledge-bits.orchestrator.ts`. Trimmed: `knowledge-bit-pipeline-kick.orchestrator.ts` (writer stage entries removed, stage mechanism kept).
- Left alone: the three writer agents and orchestrators and the claim repos (they serve legacy bits and the body-edit cascade); `knowledge-bit-basic-card-validation.ts` (reused); `admin-settings`, `model.ts`, `knowledge-item-model.ts` (reused). Small edits: language guard (additive Cyrillic phrases), fill-blank orchestrator (extraction import).

## Risks and existing items
- Existing pending bits stay valid and approvable; Regenerate converts a source to the new style. Fact: Notion and extension sources both store `raw_text` (knowledge-source.repo.ts insertKnowledgeSourcesFromNotion, apps/extension/src/capture/send-capture.ts:40), so they are regenerable. A null `raw_text` source gets no button and a 422.
- Typed-answer review mode serves only wh/fill variants, so basic-kind items skip it (Anki mode serves all); the prompt prefers why.
- Regeneration may re-create near-duplicates of approved items (only exact statement dups are dropped); follow-up: pass approved statements into the prompt, or use embedding dedupe.
- Background work after the 202 can stall on Cloud Run request billing, like the paste kick; stale-reset (15 min) returns the source to pending and the scheduler backstop finishes it with the default model.
- Before any manual run against the local Docker DB (treated as production): `docker exec post-anki-dev-db pg_dump -U postanki postanki_dev > ~/backup-postanki-$(date +%F).sql`. No migration is part of this plan; if the implementer finds one is needed, stop and report.
- Follow-ups, not in the 3 features: `scripts/source-items-models.ts` with npm script `models:source-items` (runs a source file through the five `KNOWLEDGE_ITEM_MODEL_IDS`, prints latency, tokens, valid-quote count, meta words, language); optional `source_quote` column plus UI excerpt.

## Tests
- Pure, colocated vitest: chunking (short = one chunk, paragraph packing, oversize paragraph, no text lost, Russian); validation (quote accepted across case/whitespace/ё, fabricated or short quote rejected, wrong language, meta words incl. Cyrillic, two blanks, answer_on_front); agent (prompt wraps `<source>`, escapes `</source`, pins modelId, rules present).
- Orchestrator (mocked agent and repo): one call per short source; 3 chunks run concurrently; retry once at half dropped; no valid items -> failed; item cap; chunk failure keeps inserted items and marks failed; lost claim throws `knowledge_source_reclaimed`.
- Integration (existing DB pattern): bit+variant in one transaction with kind mapping; generated-at stamps make the three old scans return nothing; ordinals after regeneration do not collide; superseded bits are returned by no scan and cannot be approved or rejected; regeneration supersedes only pending bits of that source, leaves approved and rejected, double call -> second 409, failed source allowed, null `raw_text` -> 422.
- Controller and router: 202/404/409/422, bad `modelId` -> 400, route names.
- Web RTL: confirm and cancel, "Regenerating…", failure with Retry, 409 treated as running, one request on double click, empty-bits group survives, done clears, approved items never removed.
- Manual: `npm run e2e-local:mock-openrouter` smoke with both mock modes; `npm run e2e-local:typecheck`.

## Defaults chosen
- Source-first single call over per-bit with context: it removes the latency and the call count.
- Replace, not a setting: a flag would double stages and tests for a path the user rejected.
- `superseded` approval value, no new column or migration: `approval_state` is unconstrained text; the cost is the filter swap, covered by a test.
- Keep `detectKnowledgeBits()` and its route and kick wiring: smallest diff, and the scheduler backstop keeps working.
- Chunk 3000 chars, 8 items per chunk, 40 per source, chunk concurrency 3, one quote retry: bounds worst-case cost; numbers are tunable constants.
- Dropped items are never repaired, only retried once: repair would hide hallucination.
- Partial chunk failure marks the source failed but keeps inserted items: valid, quote-checked items are not discarded; Regenerate retries.
- Regeneration runs in the background after a 202, claimed atomically in the endpoint: matches the paste flow, and the claim gives idempotency.
- Per-regeneration model choice included: the pinned model already flows through the requestContext.
- Old per-bit writers stay: legacy bits and the body-edit cascade still need them.
- Typed mode gap accepted: only wh/fill items appear there; the prompt prefers why.

END-OF-REPORT
