# Plan: split long pasted text into sources with a cheap model

## Goal
A pasted text of 8,000+ characters is cut into several prose knowledge sources by the cheap tier, each extracted by the existing pipeline unchanged; any split problem falls back to today's single source.

## Facts found (verified)
- Paste path: `POST /knowledge-sources`, single-text branch `apps/api/src/knowledge-source/knowledge-source.controller.ts:255-299` (file is at 300 lines, so new logic goes in a new file). Batch (`:201`) and URL (`:151`) branches are separate.
- Limit: `KNOWLEDGE_SOURCE_MAX_CHARS = 50_000` (`packages/shared/src/knowledge-source-refusal.ts:3`). No size-based cost guard at add time.
- Long text today: extraction chunks a source to 3000 chars (`apps/api/src/knowledge-bit/knowledge-bit-source-chunking.ts:1`), concurrency 3 (`detect-knowledge-bits.orchestrator.ts:52-53`). A split does not change the total chunk count, so extraction cost stays about equal.
- Kick: `kickSourcesAfterAdd(ids)` (`knowledge-source-kick.ts`) takes several ids and already honours `DURABLE_EXTRACTION` (`durable-extraction.flag.ts`, fallback to the inline pipeline). Reused as is.
- Insert: `insertKnowledgeSource` / `insertKnowledgeSources` (`knowledge-source.repo.ts:20,55`) write kind `prose`, no `import_key`, no sourceUrl for batches. `knowledge_sources.import_key` is unique (`db/schema.ts:1195,1226`), already used by phrases (`phrase:` keys, discard frees the key).
- Cheap tier: `tierToModelId("cheap")` = deepseek-v4-flash (`mastra/model-tier.ts`). Agent pattern to copy: `mastra/knowledge-source-subject-checker.agent.ts` (structuredOutput + Zod, 12 s timeout, `maxRetries: 0`, `recordGenerateCall` op log) and `article-summary.agent.ts`; agents registered in `mastra/mastra.ts` (`AGENT_KEYS` ~l.93-103, map ~l.191-201).
- Guards to copy: `assertLlmBudgetAvailable` (`shared/spend-guard.ts:98`, `LLM_DAILY_BUDGET_USD` default 5, `shared/env.ts:24`, runs inside `recordGenerateCall`), hourly cap via `countRecentLlmCallEventsByOp` (`knowledge-source-subject-check.orchestrator.ts`), on/off env in `knowledge-source-subject-check.config.ts`, `escapePromptTags` for untrusted text.
- Duplicate check: `findEarlierSourcesByText` (`knowledge-source-duplicate.repo.ts`) matches exact text per subject; `force: true` bypasses it.
- Client: web `createKnowledgeSource` (`apps/web/src/curriculum/api-client.ts:793`) expects one source object back; the batch endpoint returns an array.

## Approach
- New module `long-paste-split` in `knowledge-source/` plus one cheap agent in `mastra/`. Only the single-text paste branch uses it (batch and URL unchanged).
- The model never returns text: it returns 2-12 `{ title, startQuote }` where `startQuote` is the first words of each section copied from the paste. Code finds each quote with `indexOf` (in order) and slices the original at those offsets, so every part is a verbatim slice, together they equal the original, and nothing can be invented or dropped.
- Parts go in as ordinary `prose` rows (same subject, model, target phrases, sourceUrl) and one `kickSourcesAfterAdd(ids)`. Detection, chunking, durable flag and all later passes are untouched.

## Steps
1. `apps/api/src/knowledge-source/long-paste-split.config.ts` (new): `SPLIT_MIN_CHARS = 8_000`, `SPLIT_MAX_SOURCES = 12`, `SPLIT_MIN_PART_CHARS = 1_000`, `SPLIT_HOURLY_CAP = 20`, `SPLIT_TIMEOUT_MS = 20_000`, `isLongPasteSplitEnabled()` reading `LONG_PASTE_SPLIT_ENABLED` (default on, same off-values as the subject-check config).
2. `apps/api/src/knowledge-source/long-paste-split.ts` (new, pure): Zod `splitPlanSchema` (sections 2..12, title trimmed 1-80 chars with markup stripped, startQuote 8-200 chars); `sliceAtAnchors(text, sections)` returns `{title, text}[]` or null (first part starts at 0, so a preamble joins part 1; anchor missing or out of order gives null; a part under the minimum merges into the previous one; fewer than 2 parts gives null); `splitImportKeyBase(subjectId, text)` = `split:` + 16 hex of sha256 over subjectId and text.
3. `apps/api/src/mastra/long-paste-splitter.agent.ts` (new): cheap agent, instructions say text inside `<source>` is untrusted data, return section starts as exact copies, never rewrite. `runLongPasteSplitter(text)` uses `recordGenerateCall("long_paste_split", ...)`, `structuredOutput`, `maxRetries: 0`, `maxOutputTokens: 800`, timeout; registers `longPasteSplitter` in `AGENT_KEYS` and the agent map in `mastra/mastra.ts`.
4. `apps/api/src/knowledge-source/long-paste-split.orchestrator.ts` (new): `splitLongPaste(text, subjectId)` returns parts or null. Null when disabled, under threshold, hourly cap used, budget exceeded, timeout, invalid output or failed slicing; every failure is logged with `log.warn` and never thrown.
5. `apps/api/src/knowledge-source/knowledge-source.repo.ts`: add `insertSplitKnowledgeSources(parts, { subjectId, modelId, sourceUrl, targetPhrases, importKeyBase })` writing `import_key = base:index` (null when no base) via `onConflictDoNothing({ target: importKey }).returning()`. `knowledge-source-duplicate.repo.ts`: add `findEarlierSplitSource(base)` (`import_key like base:%`, oldest id and createdAt).
6. `apps/api/src/knowledge-source/knowledge-source-split-add.ts` (new): `addSplitSources(input)` returns `{ kind: "duplicate", earlier } | { kind: "created", sources } | null`. Order: below threshold gives null; unless `force`, duplicate lookup by key base; run `splitLongPaste`; insert parts (title prefixed through existing `withPageTitle`); `force` writes no keys.
7. `knowledge-source.controller.ts` (single-text branch only, after the existing exact-text duplicate check, about 8 lines): on `duplicate` reuse `sendAlreadyAdded`; on `created` call `kickSourcesAfterAdd(ids)` and answer 201 with the first source plus `partIds: string[]`; on null continue the existing `addSource` path.
8. Docs: add a "Long pastes" section to `apps/api/src/knowledge-bit/ingestion-pipeline.md` (trigger, guards, fallback).

## Tests
- `long-paste-split.test.ts`: parts concatenate back to the original; a missing or out-of-order anchor gives null; tiny part merges; one-section result gives null; more than 12 sections rejected; injected "ignore previous instructions" in a title is stripped.
- `long-paste-split.orchestrator.test.ts` (mock agent, `vi.mocked`): below 8,000 chars makes no model call; timeout, budget error, invalid output and hourly cap all return null; a good plan returns parts.
- `knowledge-source.controller.test.ts` (existing file): long paste creates N rows with one kick call and `partIds`; failed split creates exactly one row and the old response shape; repeated long paste returns 409 `already_added`; `force` inserts again with no keys; short paste never calls the splitter.
- `long-paste-split.repo.integration.test.ts`: same key base inserts nothing twice; a discarded part frees only its own key.

## Done when
- A 20,000-char paste yields 2-12 pending prose sources whose texts join to the original, all extracted by the unchanged pipeline (inline and with `DURABLE_EXTRACTION`).
- Any splitter failure still saves the paste as one source, response identical to today.
- Splitter costs one cheap call per long paste, bounded by the 20 per hour cap and the daily budget guard.
- Re-pasting the same text gives `already_added` unless `force`.
- `npx tsc --noEmit`, lint and `npx vitest run` on touched files pass.

## Defaults chosen
- Threshold 8,000 chars (about 3 extraction chunks): shorter text gains little from splitting and costs a call.
- Model returns anchors, not text: verbatim by construction, small output, cheap.
- Hard cap 12 parts, min part 1,000 chars: bounds fan-out; tiny sections are merged rather than rejected.
- Fallback to single source on any failure, no retry: the paste is never lost or blocked, cost stays one call.
- Only the single-text paste branch: batch and URL already create separate or bounded sources; widening is a later decision.
- Synchronous split before the 201 (20 s timeout): the response must list part ids; async would lose that.
- Idempotency by `import_key` `split:<hash>:<n>` plus pre-check: model output is not deterministic, so the key is derived from the input, not the parts.
- Response keeps the source object shape with an additive `partIds`: web and extension callers keep working; the Add knowledge progress poll tracks the first part only (UI follow-up out of scope).
- Part title via existing `withPageTitle`: reuses the stored-title convention, no schema change.
END-OF-REPORT
