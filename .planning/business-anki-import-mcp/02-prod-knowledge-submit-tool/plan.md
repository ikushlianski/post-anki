# Plan: prod-knowledge-submit-tool

Paths under `apps/api/src/` unless stated. Architecture: `.planning/business-anki-import-mcp/brief.md:18-22`.
## Goal
A token holding `knowledge:write` can call MCP tool `submit_knowledge` to file up to 100 keyed raw notes as
pending prose knowledge sources under the mapped Business sub-subject, retried batches adding nothing.
## Verified facts
- Auth context is `{ kind, scopes }` only, no user id (`auth/request-auth-context.ts:6-9`); the gate sets it
  at `api-server.ts:489`; `findActiveTokenByHash` does not return `api_tokens.user_id`
  (`api-token/api-token.repo.ts:58-77`, nullable column `db/schema.ts:733`).
- `knowledge_sources` (`db/schema.ts:1183-1231`) and `subjects` (`db/schema.ts:32-63`) have no user column; no
  content repo takes a user id (only `auth/`, `account/`, `api-token/` mention `userId`). The paste path
  inserts with no owner (`knowledge-source/knowledge-source.repo.ts:92-133`).
- `import_key` has a plain unique index (`db/schema.ts:1229`); a keyed `onConflictDoNothing ... returning()` insert
  already exists for phrases (`knowledge-source/phrase-knowledge-source.repo.ts:14-40`).
- `hasScope(scopes, "knowledge:write")` is true for `*` (`api-token/api-token.scopes.ts:11-13`). The factory
  receives auth but discards it (`mcp/mcp.server-factory.ts:13,24`).
- Tool pattern: `registerTool` + `withToolErrorHandling`, error results without `structuredContent`
  (`mcp/register-knowledge-source-tools.ts:55-63`, `mcp/tool-error-handling.ts:7-20`).
- Sub-subject lookup: `createSubjectSeedStore(getDb())` -> `findRootByName` (exact name, no parent,
  `subject/seed/subject-seed.store.ts:28-37`) and `findChildByName` (direct child, case/trim-insensitive,
  `subject-seed.store.ts:12-25`); root name `BUSINESS_SUBJECT_NAME = "Business"`, children Marketing, Sales, Loyalty,
  Finance, Hiring, Common (`subject/seed/business-sub-subjects.seed.ts:6-33`); seed script `apps/api/package.json:24`.
- Detection kick: paste calls `kickSourcesAfterAdd(ids)` after insert (`knowledge-source/knowledge-source.controller.ts:347,361`);
  phrase import calls it only when something was created (`knowledge-source/phrase-import.service.ts:21-23`). It
  never throws (`knowledge-source/knowledge-source-kick.ts:23-31`) and runs detached unless durable
  (`shared/background-dispatch.ts:25-29`). The first pass is `detect` over pending sources
  (`knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts:17-20`).
## Approach
New tool inside `apps/api/src/mcp` plus one new repo file, nothing else new. No schema or migration change.
Ownership: none to decide. Sources are global like every pasted source; the token's user is not used or read.
Sub-subject: Business root by exact name, child by mapped name; missing root or child -> `subject_missing`
telling the caller to run `db:seed:business-sub-subjects`; nothing is created by the tool.
Scope check lives in `submitKnowledge(input, auth)` (first statement, before any DB call) so the guard test can
call it directly; `register-write-tools.ts` only maps results to MCP results.
Kick: after insert, `if (created.length > 0) await kickSourcesAfterAdd(createdIds)` (mirrors the phrase path).
## Steps
1. `knowledge-source/knowledge-source-keyed-insert.repo.ts` (~40 lines): `insertKeyedKnowledgeSources(items:
   { importKey: string; rawText: string }[], subjectId: string, db: DbExecutor = getDb()): Promise<KnowledgeSource[]>`.
   Rows `{ id: newId("ks"), kind: "prose", rawText, status: "pending", subjectId, importKey }`, one
   `.insert().values(rows).onConflictDoNothing({ target: knowledgeSources.importKey }).returning()`, no
   transaction, no rollback. Returned rows are exactly the inserted ones. Model on the phrase repo file above.
2. `mcp/business-deck-mapping.ts` (~50 lines): `BUSINESS_DECK_TO_SUBJECT` (the seven decided entries);
   `resolveBusinessDeck(deck)` normalises with `trim().toLowerCase()` against lower-cased keys, returns the
   English name or `null`; `resolveDeckSubjectId(deck, store = createSubjectSeedStore(getDb()))` returns
   `{ subjectId, subjectName } | { error: "unknown_deck" | "subject_missing" }`. Unknown deck is decided before
   any DB access.
3. `mcp/submit-knowledge.tool.ts` (~90 lines): `submitKnowledgeInputSchema` =
   `{ deck: z.string().trim().min(1), notes: z.array(z.object({ key: z.string().regex(/^[a-z0-9:_-]{8,80}$/),
   text: z.string().trim().min(1).max(20000) })).min(1).max(MAX_SOURCES_PER_BATCH_ADD) }` (constant is 100,
   `knowledge-source.repo.ts:55`); `submitKnowledgeResultSchema` = `{ subjectId, subjectName, created, alreadyPresent,
   sourceIds }`; `submitKnowledge(input, auth)`: (a) `!hasScope(auth.scopes, "knowledge:write")` -> `{ error:
   "missing_scope" }`; (b) resolve deck; (c) dedupe notes by key (first wins); (d) insert via step 1;
   (e) `created = inserted.length`, `alreadyPresent = input.notes.length - created` (covers in-batch duplicates
   and existing rows), `sourceIds` = ids of the newly created rows; (f) kick when `created > 0`.
4. `mcp/register-write-tools.ts` (~60 lines): `registerWriteTools(server, auth)` registers `submit_knowledge`
   with annotations `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`, description stating
   raw text only, needs `knowledge:write`, up to 100 notes. Error mapping to `isError` text: `missing_scope` ->
   "Missing scope knowledge:write"; `unknown_deck` -> text listing the seven accepted deck names;
   `subject_missing` -> names the sub-subject and the seed script. Wrap in `withToolErrorHandling`.
5. `mcp/mcp.server-factory.ts`: import and call `registerWriteTools(server, auth)`; delete `void auth;` (line 24).
6. Tests (below), then run the verify commands.
## Tests
Unit (default config, repo and store mocked with `vi.mock` / `vi.mocked`):
- `mcp/business-deck-mapping.test.ts`: all seven deck names resolve to their sub-subject (Маркетинг воронка ->
  Marketing); upper-case / trailing space accepted; unknown name returns `unknown_deck` and the store is never called;
  root or child absent returns `subject_missing`.
- `mcp/submit-knowledge.tool.test.ts`: schema rejects 0 notes, 101 notes, key shorter than 8 or with upper
  case, blank text after trim, text over 20000; scopes `[]` returns `missing_scope` and neither store nor repo
  is called; scopes `["*"]` and `["knowledge:write"]` pass; unknown deck refused with repo not called; happy path
  passes the caller's keys as `importKey`, reports `created`/`alreadyPresent` from the repo's returned rows,
  calls `kickSourcesAfterAdd` once with created ids, and does not kick when `created` is 0.
Integration (`--config vitest.integration.config.ts`, per-file migrated DB as in
`mcp/mcp-read-only.integration.test.ts:24-40`; `vi.mock` the kick module so no pipeline/LLM runs):
- `mcp/submit-knowledge.integration.test.ts`: seed Business root + Marketing child with the seed store; submit
  three notes under "Маркетинг и СММ" -> three pending prose rows with those `import_key`s and the Marketing id;
  submit the same three plus one new -> `created: 1`, `alreadyPresent: 3`, four rows total; submit the same batch
  twice concurrently -> still one row per key; two notes with the same key in one batch -> one row; unknown deck
  -> `unknown_deck`, zero rows; deck with no Business root -> `subject_missing`, zero rows.
Guard and route:
- `mcp/mcp-read-only.integration.test.ts`: leave the first `it` and `tableSnapshot()` behaviour as is. Make the
  snapshot helper accept an option that omits the `knowledge_sources` line. Add a second `it`: `submitKnowledge`
  with scopes `[]` leaves the full snapshot unchanged; with `["knowledge:write"]` the snapshot without
  `knowledge_sources` is unchanged and `knowledge_sources` grew by the note count.
- `mcp/mcp.route.test.ts` (existing tools/list test, lines 89-115): also assert `submit_knowledge` is listed
  and is the only tool whose `readOnlyHint` is not `true`.
- `mcp/mcp-auth.route.test.ts` (has token-row mocking, lines 9-34, and a scoped-token pattern, line 178): a
  scopeless token calling `submit_knowledge` gets a 200 with `isError: true`, not a 401, and the mocked DB
  chain sees no extra query.
## Done when
- `submit_knowledge` is listed by `tools/list`, validates input with zod and returns the output shape.
- Scopeless auth gets `isError` with no DB access; `*` and `knowledge:write` pass.
- Unknown deck and missing sub-subject give `isError` and zero inserted rows.
- Re-sending any batch yields `created: 0` and no new rows.
- Guard test proves only `knowledge_sources` changes under the scoped call and nothing changes without it.
- From `apps/api`: `npx vitest run`, `npx vitest run --config vitest.integration.config.ts
  src/mcp/submit-knowledge.integration.test.ts src/mcp/mcp-read-only.integration.test.ts`, then
  `npx tsc --noEmit` and project lint, all zero-issue.
## Todo criteria and evidence
1. Up to 100 notes, zod, counts: schema unit tests (step 3) + integration counts `created`/`alreadyPresent`.
2. Deck mapping and refusal: mapping unit test (seven names) + integration unknown deck inserts nothing.
3. Caller keys, per-note skip, retry adds no rows: integration test (same batch twice, one extra note, concurrent).
4. No scope -> `isError`, other tools read-only: tool unit test, `mcp-auth.route.test.ts` case, guard `it`,
   `mcp.route.test.ts` only-writer assertion.
5. Picked up by the detection scan, pending cards appear: unit test that `kickSourcesAfterAdd` gets the created
   ids; rows are `kind: "prose"`, `status: "pending"` like paste. The review-screen check is a prod/manual
   proof owned by the Wave 3 first-batch task (`todo.md:66`), not by this todo's code.
## Defaults chosen
- No owner user: schema has none, and the paste path has none (`knowledge-source.repo.ts:92-133`).
- Counts come from the insert's `returning`, no pre-read: a pre-read is racy against a concurrent retry.
- `sourceIds` lists only newly created ids: those are the ones the kick needs; existing ids cost an extra query.
- `subjectName` is the mapped English name, not a DB read: the lookup is case-insensitive on that same name.
- Scope check inside `submitKnowledge`, not only in the registrar: the guard test calls the function directly.
- Tool never creates missing sub-subjects: the contract is an existing Business sub-subject.
- Kick only when `created > 0`, one call per request: mirrors `phrase-import.service.ts:21-23`.
