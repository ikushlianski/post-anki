# Plan: cloze cards (create by hand, with AI, and from Anki imports)

## Goal

A learner can create cloze cards by hand and with AI, and an Anki cloze note submitted by the import keeps its gaps and becomes a cloze card. Review screens already show cloze cards.

## Facts (cited)

- Task 1 is already shipped. `cloze` is a variant kind (`packages/shared/src/knowledge-bit.ts:16`). The note is stored in `sentence` and each gap number is one variant row with its own schedule (`apps/api/src/knowledge-bit/knowledge-bit-source-items.repo.ts:16-30`). Parser and renderers are in `packages/shared/src/cloze.ts`. `.planning/TODO.md:595-601` marks the work done. The "fill-in-the-blank" variant (`fill_in_the_blank`, one `____`) is a different, single-gap kind and stays as is.
- Web review renders cloze (`apps/web/src/knowledge-bit/anki-review-card.tsx:30-46`). iOS renders it (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/card-kinds.swift:7-25`, cloze fixtures in `PostAnkiAPITests/cloze-list-card-tests.swift`).
- No schema change is needed. Kinds are free text, `sentence` exists, the unique slot is (bit, kind, order).
- AI today: business subjects can emit multi-gap cloze (`apps/api/src/mastra/knowledge-bit-business-cards.agent.ts:97-110`, validator `knowledge-bit-cloze-validation.ts:4-19` requires 2 to 5 numbers). Other subjects emit only basic, why and fill_blank (`apps/api/src/mastra/knowledge-bit-source-items.agent.ts:124` enum, kind rules `:71-78`). Language subjects take the legacy path (`:249`), which is not touched.
- Manual create takes only front and back and writes one `basic` variant (`packages/shared/src/knowledge-bit.ts:231-243`, `apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts:18-65`, route `POST /knowledge-sources/:id/items`, controller `apps/api/src/knowledge-source/knowledge-source-item.controller.ts:15`).
- The web manual form (`knowledge-bit-review-draft-card.tsx`, `knowledge-bit-review-draft-save.ts`, `knowledge-bit-review-manual-drafts.ts`) is not mounted by any screen today (only its own test imports it). The cloze note editor for existing cards is `knowledge-bit-review-note-field.tsx` and `draftNote` in `knowledge-bit-review-note-edit.ts:45`.
- Import today: `submit_knowledge` stores the text unchanged as a prose source (`apps/api/src/mcp/submit-knowledge.tool.ts:56-66`, `knowledge-source-keyed-insert.repo.ts:22-29`). The local parser turns a `data-cloze` span into the plain answer, so the gap is lost (`apps/anki-batch-mcp/src/anki-html-text.ts:22-27`, `anki-export-parser.ts:63-67`). The Business.txt export spans carry `data-ordinal` and a `[...]` or `[hint]` placeholder (`src/test-fixtures/small-export.txt:19,24`).
- Every extraction path, legacy scan and durable workflow, calls `writeAndValidate` per chunk (`apps/api/src/knowledge-bit/detect-knowledge-bits-chunk.ts:81`, `durable-extraction.steps.ts:161`). Chunks are at most 3000 chars (`knowledge-bit-source-chunking.ts:1`). Insert does no validation of its own, so a draft built in code goes straight in.
- `apps/anki-batch-mcp/**` is staged but uncommitted in the working tree. Edit in place; do not reset or restage it.

## Approach

No new table, column, migration or route. Three contract changes:

1. Shared input: manual create also accepts `{ note, example?, aiGenerated?, sourceLinks? }` (cloze). Basic input is unchanged, so the web chat card, derived-items and existing callers keep working.
2. Wire text for imports: the local MCP emits `{{cN::answer}}` or `{{cN::answer::hint}}` inside `rawText`. The API owns turning it into cards. The MCP does not import `@post-anki/shared`; the `{{cN::..}}` syntax is the only contract.
3. AI card output for "other" subjects gains `kind: "cloze"` with `question` holding the marker text. This is the same convention as the business path and the existing insert already handles it.

Ownership: shared owns the input schema. The API owns cloze rows (one helper shared by the AI insert, manual insert and import) and import detection. The MCP owns only the text conversion. The web owns the form mode.

Import detection is deterministic code, no model call: a chunk whose text up to the end of the line holding its last cloze marker parses with `parseCloze`, is at most `CLOZE_NOTE_MAX_CHARS`, and leaves a remainder becomes one cloze bit; the remainder becomes the bit's background (example, cut at 200 chars). Any other chunk, or a parse error, falls through to the normal model path. A single-gap import note stays a cloze (the 2-number minimum applies only to AI output).

iOS and Mac: no change. Cloze cards review correctly already, no variant field is added, the manual form and import are web and server only. (The pending-triage kind preference in `apps/ios/Sources/Shared/pending-review-triage-selection.swift:6` omits cloze, but a cloze bit holds only cloze variants, so ranking ties are harmless.)

## Steps (build units)

Units U1, U3, U4 and U5 run in parallel. U2 needs U1. U6 needs U1 and U2.

**U1 shared input.** Owns `packages/shared/src/knowledge-bit.ts`, `packages/shared/src/knowledge-bit.test.ts`.
- Add `createClozeKnowledgeItemInput` (`note` via the `editClozeNoteInput` rules, plus `example`, `aiGenerated`, `sourceLinks` with the same caps as basic). Export `createKnowledgeItemInput = z.union([cloze, basic])` and its input type.

**U2 manual cloze on the API.** Owns `apps/api/src/knowledge-bit/knowledge-bit-cloze-rows.ts` (new), `knowledge-bit-source-items.repo.ts`, `knowledge-bit-manual-item.repo.ts`, `apps/api/src/knowledge-source/knowledge-source-item.controller.ts` and their tests.
- Move `clozeVariantRows` out of the source-items repo into `knowledge-bit-cloze-rows.ts`, export it, and import it back.
- In `insertPendingManualItem`, when the input has `note`: parse with `parseCloze`, store the bit with `body = stripClozeMarkers`, `origin: "manual"`, the same generated-at stamps as today, and insert the rows. Return all variants with `sentence`. A parse error returns `{ ok: false, error: "invalid_cloze" }` which the controller maps to 400 with the `CLOZE_ERROR_MESSAGES` text.
- The controller reads `createKnowledgeItemInput`. The derived-items controller stays on basic.

**U3 AI generation, other subjects.** Owns `apps/api/src/mastra/knowledge-bit-source-items.agent.ts` and `knowledge-bit-source-items.agent.prompt.test.ts`.
- Change the card kind enum to `[...SOURCE_ITEM_KINDS, "cloze"]`. Add a numbered kind rule between fill_blank and basic: use cloze only when one sentence holds 2 to 5 independently testable terms. `question` is the statement with each term wrapped `{{c1::term}}`, `{{c2::term}}`, optional `::hint`, never nested, term at most 120 chars. `answer` is the terms in order joined by `" / "`.
- No change to validation (`knowledge-bit-source-item-rules.ts:180` already routes cloze to `isValidAiCloze`), insert, or the language and business paths. No extra model call.

**U4 import detection.** Owns `apps/api/src/knowledge-bit/knowledge-bit-cloze-import.ts` (new) with its test, `detect-knowledge-bits-chunk.ts`, `apps/api/src/knowledge-bit/ingestion-pipeline.md`.
- `detectImportedCloze(chunk): LessonDraft | null` builds one draft: `statement = stripClozeMarkers`, `quote = statement`, `example` = remainder, one card `{ kind: "cloze", question: note, answer: gap answers joined by " / ", statement, quote }`.
- In `writeAndValidate`, before the fusion branch, return `{ valid: [draft], flagged: [] }` when detection hits. This skips the model, so no token cost and no retries.
- Document the deterministic path in `ingestion-pipeline.md` (detect pass).

**U5 local export converter.** Owns `apps/anki-batch-mcp/src/anki-html-text.ts`, `anki-export-parser.ts`, their tests, `src/test-fixtures/small-export.txt`, `.planning/business-anki-import-mcp/runbook.md`.
- Add `htmlToClozeText(html)`: each `data-cloze` span becomes `{{c<data-ordinal, default 1>::answer}}`, with `::hint` when the placeholder text (brackets stripped, entities decoded) is not `...` or an ellipsis. If the answer or hint contains `::` or `}}`, leave that span as plain answer.
- `anki-export-parser.ts`: `isCloze` is also true when field 1 holds `{{c<digits>::`. For cloze notes `rawText = clozeText [+ "\n\n" + back]`, using the existing `reconcileClozeBack` on the plain text. `front` and `back` stay plain.
- Runbook: one line saying `rawText` of cloze notes carries `{{cN::..}}` and must be sent unchanged.

**U6 web manual form, cloze mode.** Owns `apps/web/src/knowledge-bit/knowledge-bit-review-draft-card.tsx`, `knowledge-bit-review-draft-save.ts`, `knowledge-bit-review-manual-drafts.ts`, `knowledge-bit-review.api.ts`, `apps/web/src/curriculum/api-client.ts` and their tests.
- Add a Front/Back or Cloze toggle. In cloze mode show one textarea with the existing hint text and a live preview from `draftNote("cloze", text)`, and block create while `problem` is set.
- Create sends `{ note, example }`. After creation, edits go through the existing note-edit save (the same call `KnowledgeBitReviewNoteField` uses), not the single-variant save.
- `createManualKnowledgeItemForReview` and `createManualKnowledgeItem` accept the union. The form stays unmounted as today.

## Tests (vitest, co-located, `describe` / `it should`)

- U1 (`knowledge-bit.test.ts`): should accept a cloze note with a gap and trim it; should reject a note with no gaps; should keep accepting the front/back shape.
- U2: controller test: should answer 400 with the readable message for an unclosed gap. Integration (local Postgres `postgres://postanki:postanki@localhost:5578/postanki_e2e`, copy the temp-database setup of `knowledge-bit-cloze.repo.integration.test.ts`): should create one pending bit with a variant per gap number and the note in `sentence`; should keep the basic manual card working.
- U3 (`...agent.prompt.test.ts`): should tell the model when to use cloze and how to write the markers; should parse a cloze card from the cards schema; should still reject an unknown kind.
- U4: `detectImportedCloze` should keep two gaps and a hint, should treat a Back Extra remainder as the example, should keep a single-gap note as cloze, should return null for prose, a nested gap, an unclosed gap or a note over the cap. Chunk test (`detect-knowledge-bits-chunk.*.test.ts` pattern): should not call the model for a cloze note and should call it for prose. Integration: should store a cloze bit with one variant per number when a source holding `{{c1::..}}` is processed.
- U5: `anki-html-text.test.ts` should emit the number and the hint, should ignore the `[...]` placeholder, should fall back to the plain answer when the answer contains `::`. `anki-export-parser.test.ts` should put markup into `rawText` while `front` stays plain, and a raw `{{c1::..}}` field should set `isCloze` and pass through unchanged.
- U6: draft card tests should show the preview and the error, should send `{ note }` once valid, and should leave Front/Back mode as it is. API client test should post the cloze body.

## Done when

- A cloze note created through the manual route shows up pending with one card per gap and reviews on web and iOS with no further change.
- AI extraction for non-language, non-business subjects can return a cloze card that passes the existing validator.
- An Anki HTML export note with cloze spans yields `rawText` containing `{{cN::..}}`, and processing the submitted source creates cloze cards with no model call. Prose notes are unchanged.
- The affected packages pass `npx vitest run`, `npx tsc --noEmit` and lint with zero issues.

## Defaults chosen

- Import detection is code, not the model: it is exact, free, and keeps hundreds of imported notes from drifting into basic cards.
- Single-gap imported notes stay cloze, but AI output keeps the existing 2 to 5 minimum, because the single-term AI case is already served by fill_blank.
- A malformed imported cloze falls back to the normal model path instead of failing the source, so no note is lost.
- Back Extra becomes the card example, the closest existing field.
- Chat-drafted cards, the business prompt and the language path are not changed; the business path already emits multi-gap cloze.
- The manual form is extended but not mounted, because mounting it is a separate existing gap.
- No iOS or Mac change, since no review contract changes.
- No backfill of existing `____` cards (out of scope).
