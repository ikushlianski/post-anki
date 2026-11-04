# english-meeting-phrases: plan

Source of truth: the `english-meeting-phrases` block in `.planning/TODO.md` (line 1597). Nothing is implemented yet. No Notion call is made by this plan; the real page is read later through Notion MCP and its lines are posted to the new endpoint.

## Outcome

A list of raw phrase lines is posted to the API. Each new phrase becomes its own knowledge source under English / English for IT, is turned into one basic card (situation front, natural phrase back) by the existing background extraction, and lands in Triage as a pending card. Suspect phrases carry a Triage flag and an AI-suggested version with an AI badge. Posting the same lines again adds nothing.

## Reuse map (no parallel paths)

- Ingestion: `knowledge_sources` rows plus `kickSourcesAfterAdd` (`apps/api/src/knowledge-source/knowledge-source-kick.ts`), same as add-knowledge and the Notion import. New route copies `notion-knowledge-source.controller.ts`.
- Idempotency: same pattern as `notion_page_id` (unique column, `onConflictDoNothing`), see `knowledge-source.repo.ts:99`.
- Generation: `generateItemsForSource` and the durable steps both call `runKnowledgeBitSourceItems`, which already branches by subject kind. A third branch for phrase sources goes there, so the in-memory kick, DBOS and Inngest paths all get it.
- Triage: bits are inserted `pending` by `insertSourceItemsForChunk`; `review_flag` already gives the Triage banner, blocks bulk approve (`needs_manual_review`) and is cleared on approve.
- AI marking: `AiLabelBadge` (`apps/web/src/knowledge-bit/ai-label-badge.tsx`). Subject seeding: the generic parts of `subject/seed/business-sub-subjects.seed.ts`.
- No new dependency (stack file checked, nothing relevant). No new module boundary beyond one entity folder in core.

## Data contract

- `packages/core/src/meeting-phrase/parse-phrase-lines.ts`: `parsePhraseLines(lines: string[]): { phrases: ParsedPhrase[]; ignored: number; duplicatesInInput: number }`, `ParsedPhrase = { phrase: string; hint: string | null; unsure: boolean; key: string }`. `key` is `phrase:` plus the lowercased, punctuation-free, whitespace-collapsed phrase.
- `packages/shared/src/meeting-phrase.ts`: `MAX_PHRASE_LINES = 100`; `createPhraseSourcesInput = { lines: string[1..100], each max 500 chars }`; `createPhraseSourcesResult = { received, imported, skippedExisting, ignored, duplicatesInInput }`.
- Migration (one file): `knowledge_sources.import_key text null` with unique index `knowledge_sources_import_key_unique` (NULLs stay free, like `notion_page_id`); `knowledge_bits.ai_suggestion text null`. Generate with `npm run db:generate:api`, apply with `npm run db:migrate:api` (the existing migrate script). Never push through the ORM.
- Source row: `kind "phrase"`, `raw_text` = `Phrase: <phrase>` plus optional `\nHint: <hint>` (`formatPhraseSourceText` / `parsePhraseSourceText`, apps/api), status `pending`, `subject_id` = English for IT, `import_key` = key.
- Card: one `basic` variant. Front (`prompt`) = situation, plus `\n` + context when present. Back (`answer`) = the phrase as the user wrote it (hints removed). Bit `body` = phrase. Flagged phrases: `review_flag = "non_native_phrase"`, `ai_suggestion` = better version.
- Agent output (zod): `{ situation: string 1..200, context: string 0..200, looksNonNative: boolean, suggestion: string 0..200 }`.
- `LessonDraft` gets optional `aiSuggestion?: string | null` and `reviewFlag?: "non_native_phrase"`. `PendingKnowledgeBitForReview` and `ReviewCard` get `aiSuggestion: string | null` (additive, optional for old clients).

## Steps (in order)

1. Parse rules (core). Create `packages/core/src/meeting-phrase/parse-phrase-lines.ts`, `index.ts`; export from `packages/core/src/index.ts`. Rules, each in one small function: strip bullets, numbering, checkboxes, `**`/`_`/backticks; drop blank lines and lines without a Latin letter (count as `ignored`); cut a trailing `( ... )`, an ` = ...` tail and a Cyrillic run into `hint`; a `???` is removed and sets `unsure`; build `key`; drop repeats inside the input, keeping the first.
2. Shared contract. Add `packages/shared/src/meeting-phrase.ts` (export from the shared index). In `packages/shared/src/extraction-failure.ts` add `non_native_phrase` to `CARD_FLAG_WORDING` ("This phrase may be misheard or not native. An AI-suggested version is shown beside it"). Add `aiSuggestion` to `PendingKnowledgeBitForReview` (`packages/shared/src/knowledge-bit.ts`) and `reviewCardSchema` (`packages/shared/src/knowledge-bit-review.ts`).
3. Schema + migration. Edit `apps/api/src/db/schema.ts` (`knowledgeSources.importKey` plus unique index; `knowledgeBits.aiSuggestion`). Generate and run as stated above; commit the generated SQL and `meta` files.
4. Subject ensure. Extract the DB-backed `SubjectSeedStore` from `apps/api/scripts/seed-business-sub-subjects.ts` into `apps/api/src/subject/seed/subject-seed.store.ts` (takes a `DbExecutor`; the script then imports it). Generalise `seedBusinessSubSubjects` to `seedSubSubjects(store, rootName, nodes)` (Business wrapper unchanged). Add `apps/api/src/subject/seed/english-sub-subjects.seed.ts` (`English` root, child `English for IT`) and `ensureEnglishForItSubject(): Promise<string>`: find root `English` (create it with the same defaults as `scripts/seed-subjects.ts` if absent), find or create the child, return the child id. Subject kind then resolves to `language` through the root name, as it does today.
5. Insert + route. Create `apps/api/src/knowledge-source/phrase-knowledge-source.repo.ts` (`insertPhraseKnowledgeSources(items, subjectId, db)`: `onConflictDoNothing({ target: knowledgeSources.importKey }).returning()`) and `phrase-knowledge-source.controller.ts` (validate with `createPhraseSourcesInput`, `parsePhraseLines`, `ensureEnglishForItSubject`, insert, `kickSourcesAfterAdd` only when ids were inserted, answer 200 with the result; 400 `invalid_input` when nothing parseable). Add route `POST /knowledge-sources/phrases` named `createKnowledgeSourcesFromPhrases` in `apps/api/src/router.ts`, `router-table.ts`, `api-server.ts` (and the names list in `router.test.ts`).
6. Source-kind plumbing. Add `loadSourceKind?: (sourceId) => Promise<string>` to `GenerateItemsDeps` (`detect-knowledge-bits.types.ts`), default DB read in `defaultGenerateItemsDeps`; add `sourceKind?: string` to `WriteOptions`; set it in `generateItemsForSource` (`detect-knowledge-bits.orchestrator.ts`) and `writeOptionsFor` (`durable-extraction.steps.ts`), mirroring `loadSubjectKind`. Do not change `PendingKnowledgeSource`.
7. Phrase agent. Add `apps/api/src/mastra/knowledge-bit-meeting-phrase.prompt.ts` (instructions) and `knowledge-bit-meeting-phrase.agent.ts` (factory plus `runMeetingPhraseCard(chunk, options): Promise<LessonDraft[]>`), register `knowledgeBitMeetingPhrase` in `AGENT_KEYS` and the agent map in `apps/api/src/mastra/mastra.ts`. The runner uses `generateWithRetry`, `structuredOutput`, the same model resolution as the legacy agent, passes `<phrase>`/`<hint>` inside escaped tags (`escapePromptTags`), and has no tools. In `knowledge-bit-source-items.agent.ts` add `if (options.sourceKind === "phrase") return runMeetingPhraseCard(...)` before the subject-kind branches.
8. Draft builder. `apps/api/src/knowledge-bit/meeting-phrase-draft.ts`: pure `buildPhraseLesson(parsedSource, agentOutput): LessonDraft`. Rules live here (see Rules). `quote` is the whole source chunk (set by code, not the model, so the 12-character minimum never rejects short phrases like "touch base").
9. Persist. `knowledge-bit-source-item-validation.ts`: carry `aiSuggestion` and `reviewFlag` from the draft into the `valid` lesson. `knowledge-bit-source-items.repo.ts`: write `reviewFlag: entry.reviewFlag ?? item.reviewFlag ?? null` and `aiSuggestion: item.aiSuggestion ?? null` on the bit row.
10. Read paths. `knowledge-bit-approval.repo.ts` (`listPendingKnowledgeBitsForReview`) and the review-queue repos that select `background` next to `isAiGenerated` (`knowledge-bit-review-queue-cards.repo.ts`, `-learning.repo.ts`, `-picked.repo.ts`) return `aiSuggestion`.
11. Web. New `apps/web/src/knowledge-bit/ai-suggestion-block.tsx` ("Your phrase: ..." beside "AI suggestion: ..." with `AiLabelBadge isAiGenerated`), used in `knowledge-bit-review-item.tsx` and `knowledge-bit-focus-card.tsx` (Triage) and after reveal in `anki-review-card.tsx`. Renders nothing when `aiSuggestion` is null.
12. Docs. Add a "Meeting phrases" section to `apps/api/src/knowledge-bit/ingestion-pipeline.md` (trigger, key, flag, current behaviour only).

## Rules and where they live

- Cleanup, hints, `???`, repeats, key: step 1 (core, pure).
- Situation wording (English, as a Russian speaker might clumsily say it, short, optional context line, never contains the phrase): prompt in step 7; the "front must not contain the phrase" part is enforced by the existing `answer_on_front` check in `validateBasicCard`.
- Flagging: the model sets `looksNonNative`; the builder forces it when `unsure` is true; it drops the flag when the suggestion equals the phrase (case and punctuation ignored) and drops the suggestion when not flagged. A flagged phrase without a usable suggestion keeps the flag and a null suggestion.
- Idempotency: the unique `import_key`; a second post returns `skippedExisting`, adds no rows and starts no job.
- Triage hand-off: unchanged, bits are `pending`; flagged ones are excluded from bulk approve and need a single approve.
- Safety: phrases are untrusted text. Output is schema-only, passes `validateSourceItems` (markup guard, language guard), and nothing is ever written to Notion.

## Tests (vitest, co-located, `describe` / `it should`)

- `parse-phrase-lines.test.ts`: bold and bullet cleanup, `(not click on..)` and `= was sidetracked` become hints, Russian gloss becomes hint, `???` sets `unsure`, blank and Cyrillic-only lines ignored, repeats removed with counts, key stable across case and punctuation.
- `phrase-source-text.test.ts`: format and parse round-trip with and without hint.
- `meeting-phrase-draft.test.ts`: front with and without context, back equals phrase, flag forced by `unsure`, flag dropped when suggestion equals phrase, suggestion dropped when not flagged, quote passes `validateSourceItem` for a 10-character phrase.
- `knowledge-bit-meeting-phrase.agent.test.ts`: mocked agent, invalid output retried then thrown, prompt escapes tag-closing text in a phrase, no tools configured.
- `phrase-knowledge-source.controller.test.ts`: 400 on empty or oversized input, repeat post returns `imported: 0` and does not kick, kick called with new ids only.
- `phrase-knowledge-source.repo.integration.test.ts`: two concurrent identical posts insert one row.
- `english-sub-subjects.seed.test.ts` plus an integration case for `ensureEnglishForItSubject`: creates both when missing, creates nothing on the second call, reuses an existing English.
- Extend `detect-knowledge-bits.orchestrator.test.ts` and `durable-extraction.steps.test.ts`: `sourceKind: "phrase"` reaches the writer; `knowledge-bit-source-items.repo.integration.test.ts`: flag and suggestion persisted; `knowledge-bit-approval.repo` listing returns `aiSuggestion`; `router.test.ts` lists the new route.
- Web: `ai-suggestion-block.test.tsx` (badge and both texts shown, nothing when null); extend `knowledge-bit-review-item` and `anki-review-card` tests.
- Manual (separate todo): run on the real page once through Notion MCP after tests pass.

## Done when

- Posting 300 mixed lines creates one source per distinct phrase and no row for blank, Cyrillic-only or repeated lines.
- A second identical post returns `imported: 0` and starts no extraction.
- Each phrase ends as one pending card under English / English for IT; the subject pair exists after the first post even on an empty database.
- A suspect phrase shows the Triage banner, the original beside the AI-suggested version with an AI badge, in Triage and in review after reveal.
- `npx tsc --noEmit` and lint are clean in api, web, core, shared; `npx vitest run` passes; migration applied through `db:migrate`.

## Defaults taken

- Endpoint takes `lines: string[]` (page text split by the caller); max 100 lines per post (same as `MAX_SOURCES_PER_BATCH_ADD`), so the caller sends 3 posts for 300 phrases; durable extraction starts workflows one by one and awaits them inside the request, so a larger post could run long.
- One knowledge source per phrase (phrase-by-phrase processing, per-phrase retry through the existing regeneration route).
- Dedupe key is the normalized phrase only, so a changed hint does not re-import it.
- Back shows the user's original; the AI version is a separate field, never overwrites it.
- Flagged cards use the existing `review_flag` banner and need single approval (bulk approve skips them).
- `???` always flags the phrase.
- Root `English` is created if missing, with the seed defaults.
- A failed or discarded phrase source: a failed row keeps its key (retry via regeneration); a discarded one frees the key and re-imports next time.
- Existing knowledge-item model and cost guards apply; no new model tier or setting.

## Risks

- Cost: 300 model calls on first run. Mitigated by one cheap call per phrase, existing retry wrapper, the daily spend guard (`llm_budget_paused`) and the 100-line cap per post. The in-memory path handles 20 sources per scan, so without `DURABLE_EXTRACTION` a full import finishes over several scans.
- Migration touches two hot tables; both columns are nullable, so no backfill.
- Model may over-flag natural slang ("my plate is open"). Prompt must say that informal native idioms are not flagged; verify on the manual run before trusting the flag rate.
- iOS decodes with Swift JSONDecoder (unknown keys ignored) and the Electric folder does not read these columns, so the additive field is safe; re-check only if a native fixture fails.
- Discarding a source in Triage frees its key (see defaults).
