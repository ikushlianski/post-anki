# Plan 04: server route creating one hand-made knowledge item on an entry (todos 4 and 6)

Starts after feature 01 lands (migration 0096: `knowledge_bits.origin`, schema field `knowledgeBits.origin`).

## Goal
`POST /knowledge-sources/:id/items` saves one pending, manual, scan-proof knowledge item with one basic variant, only when front and back are non-empty after trim.

## Approach
Same shape as extraction insert and the regeneration route; no new module or contract beyond brief.md.
- Facts (code): extraction stamps `whQuestionGeneratedAt`/`fillBlankGeneratedAt`/`basicCardGeneratedAt` on the bit (`apps/api/src/knowledge-bit/knowledge-bit-source-items.repo.ts:83-85`); the three scans select only `isNull(...GeneratedAt)` (`knowledge-bit-basic-card-claim.repo.ts:31`, `-wh-question-claim.repo.ts:31`, `-fill-blank-claim.repo.ts:31`), so stamping skips them.
- Ordinal: `max(ordinal)+1` over all bits of the entry, superseded included (`knowledge-bit-source-items.repo.ts:22-35`); unique index (entry, ordinal) is the backstop (`db/schema.ts:1198`). Variant: `kind: "basic"`, `order: 0`, `prompt`/`answer` (`knowledge-bit-source-items.repo.ts:7-11,101-109`).
- Transaction lock: `select ... for("update")` on the entry row, as extraction does (`knowledge-bit-source-items.repo.ts:58-68`). Under the lock: missing -> not_found; status `processing` -> already_running; else compute ordinal, insert bit, insert variant. This serializes concurrent creates and races with regeneration's claim (`knowledge-source-regeneration.repo.ts:20-45`).
- Routes: name in `apps/api/src/router.ts:3` union, pattern row in `apps/api/src/router-table.ts` (regex + `param: "id"`, next to the regeneration rows at :20-31), `case` in `apps/api/src/api-server.ts` switch (next to :485).
- Validation: zod in `packages/shared/src/knowledge-bit.ts` (like `editKnowledgeBitInput`, `knowledge-bit-chat.ts:35`), parsed by `readJsonBody`; failure -> `400 {error:"invalid_input"}` (`knowledge-source-regeneration.controller.ts:23-28`). Controller maps `{ error }` to status via a table (`knowledge-bit-edit.controller.ts:6-8`).
- Body column (NOT NULL): `${front}\n${back}` so search, embedding and tagging see the whole card.
- Response `201` with `PendingKnowledgeBitForReview` (`packages/shared/src/knowledge-bit.ts:77-83`): `{ id, body, background: example|null, variants:[{id,kind:"basic",prompt,answer}], feedback: null }`.
- Never calls a model, never writes `knowledge_bit_feedback` rows.

## Steps
1. `packages/shared/src/knowledge-bit.ts`: add `MANUAL_ITEM_FRONT_MAX_CHARS=300`, `MANUAL_ITEM_BACK_MAX_CHARS=600`, `MANUAL_ITEM_EXAMPLE_MAX_CHARS=300`, `createManualKnowledgeItemInput` (`front`,`back`: `z.string().trim().min(1).max(N)`; `example`: trimmed, max N, optional, empty -> undefined) and type. Caps equal `BASIC_CARD_FRONT_MAX_CHARS`/`BACK` (`knowledge-bit-basic-card-validation.ts:6-7`) and `SOURCE_ITEM_QUOTE_MAX_CHARS` (`knowledge-bit-source-item-validation.ts:24`).
2. Create `apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts`: `insertManualKnowledgeItem(entryId, input, db = getDb())` returning `{ ok:true, item } | { ok:false, error:"not_found"|"already_running" }`; logic per Approach; ids via `newId("kb")`/`newId("kbqv")`; `origin: "manual"`, `approvalState: "pending"`.
3. Create `apps/api/src/knowledge-source/knowledge-source-item.controller.ts`: `handleCreateKnowledgeSourceItem(req, res, id)`; `ERROR_STATUS = { not_found: 404, already_running: 409 }`; success `sendJson(res, 201, item)`.
4. Register: `router.ts` (name `createKnowledgeSourceItem`), `router-table.ts` (row), `api-server.ts` (import + case).

## Tests
- `packages/shared/src/knowledge-bit.test.ts` (create): trims; rejects empty/whitespace front or back; rejects over-cap; empty example becomes absent; caps equal the extraction constants.
- `apps/api/src/knowledge-source/knowledge-source-item.controller.test.ts` (mock repo, `fakeReq`/`fakeRes` as in the regeneration controller test): 201 shape; 400 invalid_input and repo not called; 404; 409 while processing.
- `apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.integration.test.ts`: copy the harness of `knowledge-bit-source-items.repo.integration.test.ts:1-100` (throwaway DB per run, migrations applied). Run with `DATABASE_URL=postgres://...@127.0.0.1:5999/...` (pet-projects lane); never the Docker DB on 5562. Cases: pending + origin manual + three stamps set + one basic variant (prompt=front, answer=back, background=example); ordinal = last+1 including after superseded bits; two concurrent creates get distinct ordinals; processing entry -> already_running and no rows; missing entry -> not_found; no feedback rows; the three generation scan lists skip the new bit.
- `router.test` (if one exists, else a case in the controller test) resolving `POST /knowledge-sources/ks_1/items` to the new name; `/knowledge-sources/detect-bits` still resolves to its own route.

## Done when
- Whitespace-only front or back returns 400 and writes nothing; overlong fields return 400.
- A valid call returns 201 in the pending-review item shape and the bit appears in `GET /knowledge-bits/pending-review`.
- Generation scans never pick up the item; no model call, no feedback row.
- Two simultaneous calls on one entry never collide on ordinal.
- Unknown entry 404; processing entry 409.
- `npx tsc --noEmit`, lint, `npx vitest run` clean.

## Security notes
- Entry id is a path segment used only as a parameterized drizzle value; no format check beyond existence. Lengths capped (300/600/300) and the 1 MB body cap in `readJsonBody` (`apps/api/src/shared/http.ts:4`).
- No escaping at write time: stored text reaches a prompt only through paths that already escape. Fact: `escapePromptTags` wraps bit text in the tagger, placer, the three generators, grader and followup agents (`apps/api/src/mastra/knowledge-bit-tagger.agent.ts:28`, `knowledge-bit-placer.agent.ts:35`, `knowledge-bit-basic-card-generator.agent.ts:32`, `knowledge-bit-answer-grader.agent.ts:51-57`). The reviewer-feedback block only reads feedback rows and escapes them (`knowledge-bit-review-feedback-block.ts:28`); manual items have none. Assumption, to verify: the item chat agent (`mastra/knowledge-bit-chat.agent.ts`) does not use `escapePromptTags`; it runs only on approved items, so it is outside this route, but the same gap applies to extracted bits.
- Embedding, tagging and placement scans do read `body` for pending manual bits (their columns are unstamped), as for extracted bits; they escape.

## Risks to flag to parent (not fixed here)
- `claimSourceForRegeneration` supersedes every pending bit of the entry (`knowledge-source-regeneration.repo.ts:68-72`), which would discard pending hand-made items; needs `origin <> 'manual'` (feature 01 or a follow-up).
- `updateKnowledgeBitBody` nulls the generation stamps on a body edit (`knowledge-bit.repo.ts:312-326`), which would let scans call a model on a manual item; the web should edit the variant for manual items, or the edit service should skip the reset when origin is manual.

## Defaults chosen
- Path `POST /knowledge-sources/:id/items`: plural noun, sub-resource nesting; entry rename stays a later step.
- Reuse `already_running` (409) for the processing refusal: matches the regeneration route.
- No idempotency key: row lock plus unique ordinal keep data consistent and the web draft is created once; a double click would add a duplicate the user can reject.
- Only trim, emptiness and length checks; no language/meta/same-text guards: the author is the user.
- Status 201 for the create, body = front + newline + back.
- Repo in `knowledge-bit/`, controller in `knowledge-source/`: matches the regeneration split.

## Footprint
Create:
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.integration.test.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-source/knowledge-source-item.controller.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-source/knowledge-source-item.controller.test.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/packages/shared/src/knowledge-bit.test.ts
Edit:
- /Users/ikushlianski/webdata/ilya-projects/post-anki/packages/shared/src/knowledge-bit.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/router.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/router-table.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/api-server.ts
