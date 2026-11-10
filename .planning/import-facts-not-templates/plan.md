# Plan: import-facts-not-templates (todos 1-3, one chain)

## Goal
Anki/text imports are read as plain facts and written into fresh direct-question cards (web example capped, falls back to none); cloze stays rare and short; pending verbatim-cloze import cards get rebuilt and the old ones superseded.

## Approach
- No brief.md exists; scope = `.planning/TODO.md` section + stated facts. All paths under `apps/api/src` unless noted.
- Fact path: for an Anki-import source, raw text is stripped of `{{cN::ans::hint}}` markup (and a leading `Back Extra:` label) at load time, then goes through the normal chunk, lessons, cards pipeline. The verbatim branch (`detectImportedCloze`) and the one-chunk collapse are deleted.
- Seam for stripping: orchestrator `generateItemsForSource` and durable `planStep`/`chunkStep` both load raw text; one shared helper makes plan and chunks agree. Quotes validate against the stripped chunk, so source-quote checks stay intact.
- Enrichment: after cards are validated inside `writeAndValidate` (shared by inline and durable paths), at most a few cheap web searches add an example + source links to drafts that have no example. Reuses `createKnowledgeBitWebTools` (caps, repeat-query guard, safe-url filter) and `webSearch` from the finished ai-web-enrichment work; no new search code.
- Cap: 2 searches per chunk, only chunks 0-1 of a source, so at most 4 per source with no shared state (works in durable steps). Search model forced to cheap tier. Any error or `ok:false` leaves the draft unchanged.
- Web results are untrusted: used only as example text (cut to 200 chars, markup-guarded), never fed to another prompt. Enriched bit is stored `isAiGenerated=true` with `sourceLinks`.
- Prompts: direct questions are the default; cloze/fill_blank only for statements <= `CLOZE_AI_STATEMENT_MAX_CHARS = 200`; validator rejects longer cloze (backstop).
- Backfill: operator script (dry run default, `--apply`, `--limit`, `--allow-remote`), same shape as `backfill-phrase-sentences.ts`. Retire = existing `approvalState: "superseded"` via `claimSourceForRegeneration`; no delete.

## Steps
1. `packages/shared/src/cloze.ts`: add `export const CLOZE_AI_STATEMENT_MAX_CHARS = 200;`.
2. `knowledge-bit/knowledge-bit-cloze-validation.ts`: `isValidAiCloze` returns false when `statement.length` exceeds the cap (reason surfaces as `bad_blank`; cloze is never kept as flagged, so it is dropped).
3. `mastra/knowledge-bit-source-items.agent.ts` INSTRUCTIONS kind list: reorder to why, basic (direct what/which/how, the default), fill_blank, cloze. Wording: "Default to a direct question. fill_blank and cloze are rare: only when the statement is at most ${CLOZE_AI_STATEMENT_MAX_CHARS} characters; a longer statement is always why or basic." Keep the fixed phrases the prompt test pins unless they change (see Tests).
4. `mastra/knowledge-bit-business-cards.prompt.ts`: add `CLOZE_RULE_V7` ("Default to a basic card with a direct what/why/how question. Use cloze only for one short sentence (<= 200 chars) with 2-5 testable terms; never for a long or multi-sentence passage; otherwise basic") and `BUSINESS_CARDS_PROMPT_V7_DIRECT_QUESTIONS = V6.replace(CLOZE_RULE_V4, CLOZE_RULE_V7)`; point `ACTIVE_BUSINESS_CARDS_PROMPT` at V7. Older versions untouched. `forceAtLeastOne` still uses V5 (rare retry; validator caps cloze).
5. New `knowledge-bit/knowledge-bit-import-facts.ts`: `importedFactText(raw: string): string` (regex `\{\{c\d+::(.+?)(?:::[^}]*)?\}\}` to `$1`, drop `Back Extra:` label, collapse blank runs) and `hasClozeMarkup(raw): boolean`.
6. Delete `knowledge-bit/knowledge-bit-cloze-import.ts`. `detect-knowledge-bits-chunk.ts`: remove the `detectImportedCloze` import/branch; `writeAndValidate` destructures `webSearchBudget` out of options (not passed to the model) and, when `budget > 0 && deps.enrichItems && cards.valid.length > 0`, sets `valid = await deps.enrichItems(cards.valid, budget)`.
7. `knowledge-bit/detect-knowledge-bits.types.ts`: `WriteOptions.webSearchBudget?: number`; `GenerateItemsDeps.enrichItems?: (items: readonly LessonDraft[], budget: number) => Promise<LessonDraft[]>`.
8. `knowledge-bit/knowledge-bit-source-item-validation.ts`: `LessonDraft.webSources?: string[]`.
9. New `knowledge-bit/knowledge-bit-import-enrichment.ts`: `IMPORT_ENRICH_SEARCHES_PER_CHUNK = 2`, `IMPORT_ENRICH_MAX_CHUNKS = 2`, `importEnrichBudget(ankiImport, chunkIndex)`; `cutExampleText` (moved from the deleted file, 200 chars, sentence-aware); `enrichImportedItems(items, budget)`: per draft with `example === null`, while budget remains, `tools.deps.searchWeb(statement)` from `createKnowledgeBitWebTools({ knowledgeBitId: "import-enrichment", searchOp: "knowledge_bit_import_enrichment", searchPurpose: "Give one short real-world example or nearby fact, at most two sentences, in the language of the query", maxSearches: budget, forceTier: "cheap" })`. On text: `hasInjectedMarkup` guard, cut, set `example` and `webSources` (safe `citations`, max `MAX_CARD_SOURCES`). Whole body in try/catch, `log.warn` on failure, return the draft unchanged.
10. `knowledge-bit/detect-knowledge-bits.orchestrator.ts`: wire `enrichItems: enrichImportedItems` in `defaultGenerateItemsDeps`; `rawText = ankiImport ? importedFactText(source.rawText) : source.rawText`; drop the `isImportedClozeSource` collapse (`chunks = planned`); pass `webSearchBudget: importEnrichBudget(ankiImport, index)` per chunk in the `processChunk` options. Net line count must not grow (file is already 333).
11. `knowledge-bit/durable-extraction.steps.ts`: add `loadSourceText(sourceId, deps)` (raw text + `loadIsAnkiImport` then `importedFactText`); use it in `planStep` (chunkCount = real count) and `chunkStep`; `writeOptionsFor` takes the chunk index and sets `webSearchBudget`. Remove the `isImportedClozeSource` import. Make sure `defaultDurableStepDeps` (find via the starter/workflow file) also gets `enrichItems`.
12. `knowledge-bit/knowledge-bit-source-items.repo.ts` insert: `isAiGenerated: Boolean(item.webSources?.length)`, `sourceLinks: item.webSources?.length ? item.webSources : sourceLinks`.
13. Backfill, new files in `knowledge-source/`: `import-cloze-backfill.ts` (`parseImportBackfillArgs`, default `--limit 25`) and `import-cloze-backfill.repo.ts` (`listVerbatimClozeImportCandidates`). Candidate = source with `importKey like 'anki:%'`, `status = 'bits_detected'`, `rawText` has cloze markup, and every non-superseded bit is `approvalState = 'pending'`, `decidedAt` null, with an active (`supersededAt` null) `cloze` variant whose `sentence` is contained in `rawText` (the verbatim signature; rewritten AI clozes differ). Any approved/inbox/chat/rejected live bit skips the whole source.
14. New `apps/api/scripts/rebuild-imported-cloze-cards.ts` + `package.json` script `backfill:import-facts`: `assertReextractTarget`, list, print the count and "expected model calls (about 2 per source plus up to 4 searches)"; with `--apply` per candidate `claimSourceForRegeneration(id)` (supersedes pending bits) then `generateItemsForSource(claim.source)`, log result, continue on error.
15. Docs: update the `detect` paragraph at `knowledge-bit/ingestion-pipeline.md:33` (markup stripped to facts, normal extraction, capped enrichment; no model-free cloze path).

## Tests (vitest, co-located)
- New `knowledge-bit-import-facts.test.ts`: markers/hints stripped, label dropped, plain text untouched, malformed markers left readable.
- New `knowledge-bit-import-enrichment.test.ts` (mock `../probe/probe-grounding.js`): fills example + sources; skips drafts that have an example; never exceeds budget; `ok:false`/throw leaves drafts unchanged; injected markup dropped; budget is 0 for non-import and chunk >= 2.
- Rewrite `detect-knowledge-bits-chunk.cloze-import.test.ts`: an import chunk with markup is handed to `writeItems` (model called, no verbatim card); `enrichItems` called only with budget > 0.
- Delete `knowledge-bit-cloze-import.test.ts`; rewrite `knowledge-bit-cloze-import.integration.test.ts` (rename to `knowledge-bit-import-facts.integration.test.ts`): `writeItems` receives stripped text, no tail in `background`, enriched bit stores `is_ai_generated` and links (run in CI only).
- `knowledge-bit-cloze-validation` test: 200-char cloze accepted, 201 rejected. Extend `durable-extraction.steps.test.ts`: plan chunk count uses stripped text; chunk 0 gets a budget.
- `knowledge-bit-source-items.agent.prompt.test.ts`: update the pinned cloze line, add direct-question default and the 200 cap. `knowledge-bit-business-cards.agent.test.ts`: ACTIVE is V7, contains the cap, V4 unchanged. `knowledge-bit-source-items.repo.test.ts`: web draft sets AI flag and links.
- New `import-cloze-backfill.test.ts` (args) and `import-cloze-backfill.repo.integration.test.ts` (CI only): verbatim pending listed; approved, mixed-state, rewritten-cloze and non-anki sources skipped.
- Local runs: touched files only, `--maxWorkers=2`.

## Done when
- A cloze import row reaches the model as plain prose; no cloze markers or tail text in the example; cards read as direct questions.
- At most 2 searches per chunk and 4 per source; a search failure still yields cards, with no example.
- Over-200-char cloze statements are rejected; prompts say direct questions first.
- Dry run lists only pending verbatim candidates; `--apply` supersedes them and inserts fresh cards; approved cards unchanged.
- No new `any`; files under 300 lines (orchestrator/steps no larger than now); `npx tsc --noEmit`, lint, touched vitest files pass.

## Defaults chosen
- Reuse `createKnowledgeBitWebTools`/`webSearch` over new search code: caps and URL safety already exist.
- Enrich only when the lesson has no example and only for Anki imports: keeps cost and prompt-injection exposure small.
- Enrichment inside `writeAndValidate`: the one seam shared by inline and durable paths.
- Search cap is per chunk plus a chunk limit: needs no state across durable steps; Anki imports are one note per source anyway.
- Cap 200 chars: matches `LESSON_EXAMPLE_MAX_CHARS`, fits one short sentence.
- Over-cap cloze is dropped, not downgraded: converting question shapes by code risks wrong cards; the retry/prompt handle it.
- New prompt version V7 instead of editing V4: older versions stay as history.
- Script, not admin route or new `BackgroundJob` kind: matches the phrase backfill and reextract scripts, no new endpoint.
- Skip a source when any live bit is not plain pending: protects triaged work.
- Verbatim signature = cloze variant `sentence` found inside raw text: no schema change; a rewrite that equals the old note could be rebuilt once more on a later run (cheap).
- Highlight offsets are not remapped after stripping: Anki imports carry no highlights.

END-OF-REPORT
