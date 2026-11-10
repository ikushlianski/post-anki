# Plan: MCP tool to file keyed notes under any subject path

## Goal
Claude can file keyed raw-text notes under a free-form subject path like "Work/AIPeak", with missing subjects created, and with the same skip-existing-key retry behavior as `submit_knowledge`.

## Approach
- New tool `submit_knowledge_to_subject`. `submit_knowledge` (deck mapping, input, output, description) stays unchanged, so existing clients are not affected.
- Shared filing step: extract the "dedupe keys in batch, `insertKeyedKnowledgeSources`, `kickSourcesAfterAdd`, count created/alreadyPresent" body of `submitKnowledge` into `file-keyed-notes.ts`. Both tools call it. The notes zod schema is exported from `submit-knowledge.tool.ts` and reused.
- Subject creation is idempotent and concurrency-safe by reuse: `createChild` in `subject-seed.store.ts` already locks on the parent id and matches names case-insensitively. Roots have no such path (`createRoot` matches exact case, `findRootByName` is exact), so add one `ensureRoot(name)` to the same store: advisory lock on `root:<lower name>`, `lower(trim(name))` match with `parent_id is null`, oldest wins, insert otherwise. There is no unique index on subject names, so the lock is the duplicate guard.
- New subjects use the store defaults (kind `architecture-mentor` for roots, the parent's kind for children). No new tables or migrations.
- Business tree: no special case. "Business/Marketing" resolves to the existing subject, and a new "Business/X" is allowed like any other path.

## Contract
- Input: `{ subjectPath: string (trimmed, 1..130 chars), notes: same as submit_knowledge }` (key `^[a-z0-9:_-]{8,80}$`, text 1..20000, 1..MAX_SOURCES_PER_BATCH_ADD).
- Path syntax: segments split on "/", each trimmed, 1 or 2 segments, each 1..60 chars, no empty segment ("Work//X", "/Work", "Work/" are rejected). Names match existing subjects case-insensitively. Stored names keep the casing of the first creation.
- Output: `{ subjectId, subjectName, subjectPath (canonical, e.g. "Work/AIPeak"), createdSubjects: string[] (e.g. ["Work", "Work/AIPeak"]), created, alreadyPresent, sourceIds }`.
- Errors (isError text results): `missing_scope` ("Missing scope knowledge:write"), `invalid_path` (message states the rules). Unexpected failures go through `withToolErrorHandling("submit_knowledge_to_subject", ...)`.
- Annotations: readOnlyHint false, destructiveHint false, idempotentHint true. Scope stays `knowledge:write`.
- Description: files up to 100 keyed raw-text notes as pending knowledge sources under a subject path (max 2 levels, e.g. "Work/AIPeak"), creating missing subjects. Raw text only, no cards. Skips existing keys. Needs knowledge:write.

## Steps
1. `apps/api/src/subject/seed/subject-seed.store.ts`: add `ensureRoot(name)` to `RootCapableSeedStore` and the implementation (see Approach).
2. New `apps/api/src/subject/subject-path.ts`: `parseSubjectPath(raw)` returns `{ segments } | { error: "invalid_path" }`. `ensureSubjectPath(segments, store)` walks the segments: root via `ensureRoot` (returns `{ id, created }`), each child via `findChildByName` probe then `createChild`; returns `{ subjectId, subjectName, subjectPath, createdSubjects }`. The store parameter defaults to `createSubjectSeedStore(getDb())` like `resolveDeckSubjectId`.
3. New `apps/api/src/mcp/file-keyed-notes.ts`: `fileKeyedNotes(notes, subjectId)` returning `{ created, alreadyPresent, sourceIds }`. Edit `submit-knowledge.tool.ts` to use it and export `knowledgeNotesSchema` (output unchanged).
4. New `apps/api/src/mcp/submit-knowledge-to-subject.tool.ts`: input/result schemas, `submitKnowledgeToSubject(input, auth)`. Order: scope check, parse path, `ensureSubjectPath`, `fileKeyedNotes`. Outcome union `missing_scope | invalid_path`.
5. `apps/api/src/mcp/register-write-tools.ts`: register the second tool next to `submit_knowledge`, with an error mapper like the existing one.
6. `apps/api/src/mcp/mcp.route.test.ts` (line ~117): writers list becomes `["submit_knowledge", "submit_knowledge_to_subject"]`.
7. Add the tests below.

## Tests (pure-unit = mocked/fake store, no DB)
- `subject-path.test.ts` (pure-unit):
  - should accept "Work/AIPeak" and a lone "Work" and trim stray spaces around segments
  - should reject empty segments, a third level and an over-long segment
  - should create the root and the child when neither exists, and list both as created
  - should reuse an existing "work" root when asked for "Work/AIPeak", creating only the child
  - should create nothing when the full path already exists
- `submit-knowledge-to-subject.tool.test.ts` (pure-unit, mocks `ensureSubjectPath`, `insertKeyedKnowledgeSources`, `kickSourcesAfterAdd`, `../db/client.js` as in `submit-knowledge.tool.test.ts`):
  - should refuse a token without knowledge:write before touching subjects or sources
  - should refuse an invalid path and create no subject and no source
  - should file notes under the resolved subject, report counts, and kick only new sources once
  - should not kick when every key was already present
  - should store one row when two notes in a batch share a key
- `submit-knowledge.tool.test.ts`: existing tests must pass unchanged (guards the extraction).
- `submit-knowledge-to-subject.integration.test.ts` (DB-backed, copy the harness of `submit-knowledge.integration.test.ts`, one temp DB):
  - should create Work and AIPeak once and file notes under AIPeak
  - should leave one Work and one AIPeak subject when two calls create the same path concurrently
  - should skip already-filed keys when the batch is re-sent
  - should reuse an existing Business/Marketing subject for path "business/marketing"

## Done when
- A call with `Work/AIPeak` on an empty DB creates exactly two subjects and pending prose sources keyed as sent.
- Re-sending the batch, or running two calls at once, creates no duplicate subjects or sources.
- `submit_knowledge` behavior and schema are unchanged and its tests pass untouched.
- Tokens without `knowledge:write` get an error result and no DB writes.
- Tool list test shows both write tools; no file over 300 lines; no `any`.

## Checks
- Run one at a time: `npx vitest run apps/api/src/mcp/submit-knowledge-to-subject.tool.test.ts`, then `subject-path.test.ts`, `submit-knowledge.tool.test.ts`, `mcp.route.test.ts`.
- Integration file only if the local e2e DB is up: `npx vitest run apps/api/src/mcp/submit-knowledge-to-subject.integration.test.ts --maxWorkers=1`; otherwise leave it to CI.
- `npx tsc --noEmit` once at the end, then the project lint on changed files. No prod deploy, no prod writes.

## Defaults chosen
- New tool rather than an optional `subjectPath` on `submit_knowledge`: keeps the existing contract and its deck-validation error text intact.
- Max depth 2, "/" separator: enough for Work/AIPeak, trivially widened later.
- Case-insensitive, trimmed name match: same rule `createChild` already uses.
- Business tree gets no special handling: simplest, and existing names still resolve.
- Lock-based idempotency, no unique index or migration: matches the existing seed store and avoids a data migration on legacy duplicates.
- Extract `fileKeyedNotes` instead of copying: one place for the retry-safe keyed behavior.
END-OF-REPORT
