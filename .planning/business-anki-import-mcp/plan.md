# Plan: Business Anki import through MCP

Todo: `.planning/business-anki-import-mcp/todo.md`. Four focus areas, built in two waves:
wave 1 `local-batch-server` and `token-scopes` side by side (no shared files), wave 2
`prod-knowledge-submit-tool` (needs the scopes context), wave 3 `yulia-trus-import-workflow` (needs
both servers live).

Fixed decisions: raw notes go to prod as knowledge sources and the existing detection pipeline makes
the cards; no rewriting in Claude or in the tool. Examples stay in `knowledge_bits.background`.
Deck to sub-subject: Основы→Common, Маркетинг и СММ→Marketing, Продажи→Sales,
Финансы и планирование→Finance, Лояльность→Loyalty, Персонал и зарплаты→Hiring.

## Facts the plan rests on

- Auth gate for every route including `POST /mcp` is `authorized()` in
  `apps/api/src/api-server.ts:461-489`, called at `apps/api/src/api-server.ts:626`. It accepts the
  shared secret, an active `api_tokens` row via `findActiveTokenByHash`
  (`apps/api/src/api-token/api-token.repo.ts:49`), or a session token. It returns only a boolean, so
  nothing about the token reaches `handleMcpRequest` (`apps/api/src/api-server.ts:699`), which calls
  `createMcpServer()` with no arguments (`apps/api/src/mcp/mcp.route.ts:12`).
- `api_tokens` columns: id, label, token_hash, user_id, created_at, last_used_at, revoked_at
  (`apps/api/src/db/schema.ts:729-737`). No scope today.
- `insertSplitKnowledgeSources` (`apps/api/src/knowledge-source/knowledge-source.repo.ts:92-133`)
  inserts rows with `importKey = <base>:<index>`, `onConflictDoNothing` on `import_key`, and rolls the
  whole batch back if any row conflicted, returning `[]`. So one all-or-nothing call per batch: a
  retry of an already-saved batch returns `[]`, and `addSplitSources`
  (`apps/api/src/knowledge-source/knowledge-source-split-add.ts:62-66`) treats that as "duplicate" by
  looking up the earlier source through `findEarlierSplitSource`.
- Sources are created with `status: "pending"` and are claimed by the detection scan
  (`claimPendingKnowledgeSources`, `apps/api/src/knowledge-bit/knowledge-bit-source-claim.repo.ts:18`,
  wired at `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts:271`). To verify during
  build: whether the paste controller kicks the pipeline right away or the scan is periodic; if it is
  kicked, `submit_knowledge` must call the same kick after inserting.
- Sub-subject lookup by name exists: `findRootByName` and `findChildByName` in
  `apps/api/src/subject/seed/subject-seed.store.ts:28-38`, case- and whitespace-insensitive; the root is
  `BUSINESS_SUBJECT_NAME = "Business"` (`apps/api/src/subject/seed/business-sub-subjects.seed.ts:6`).
- Read-only guard: `apps/api/src/mcp/mcp-read-only.integration.test.ts` runs every tool function
  directly and compares an md5 of all content tables before and after (`tableSnapshot`, lines 76-95).
- Token scripts: `apps/api/scripts/create-api-token.ts` (positional label, `--email`) and
  `apps/api/scripts/create-web-api-key.ts` (`npm run db:create-web-key`), both calling `insertApiToken`
  (`apps/api/src/api-token/api-token.repo.ts:14`).
- Workspaces are `packages/shared`, `packages/core`, `apps/*` (root `package.json`); there is no
  `tools/`. `@modelcontextprotocol/sdk ^1.31.0`, `zod ^3.23`, `tsx` are already in `apps/api`.
- `subjects/Business.txt`: `#separator:tab`, `#html:true`, then 1,685 two-field records (checked with
  a CSV parser, tab delimiter, `"` quote, doubled quotes inside). Field 1 starts with
  `<div class="subdeck-label">Business::<deck></div>` then the question HTML; field 2 is the answer
  HTML, empty in 103 records. Cloze notes (about 1,571 spans) hold `<span class="cloze"
  data-cloze="<html-escaped hidden text>" data-ordinal="n">[...]</span>` and
  `<span class="cloze-inactive" data-ordinal="n">visible text</span>`; in those records field 2 repeats
  the label and the sentence with the hidden text shown. Five records carry the label inside a hidden
  div as `Маркетинг воронка` (a sub-deck of Маркетинг и СММ in the original Anki tree).

## Wave 1a: local-batch-server

What it does: a stdio MCP server Claude starts from `.mcp.json`. It reads one Anki export file, backs
it up once, hands out batches of parsed notes with a batch id, and deletes a batch from the file only
when `confirm_batch` names that id. No network, no database.

Place: `apps/anki-batch-mcp/` as a new workspace (`"apps/anki-batch-mcp"` added to root
`package.json` workspaces, matching the `apps/*` convention). Dependencies: `@modelcontextprotocol/sdk`
and `zod` at the versions `apps/api` uses; `tsx` as a dev dependency so `.mcp.json` can run it without a
build step. No new library; the parser is small and hand-written because the record shape is fixed.

Files (all under `apps/anki-batch-mcp/`):
- `package.json`, `tsconfig.json` (copy `apps/api` strictness), `vitest.config.ts`.
- `src/anki-export-parser.ts`: header lines, tab-separated quoted records, cloze restore.
- `src/anki-export-parser.test.ts`.
- `src/batch-file-store.ts`: backup-once, read remaining records, remove a set of records by their
  stable hash, atomic rewrite (`.tmp` then rename).
- `src/batch-file-store.test.ts` (temp dir fixtures).
- `src/batch-session.ts`: in-memory map batchId → record hashes handed out; refuses unknown ids.
- `src/anki-batch-mcp.server.ts`: `McpServer` with the three tools over `StdioServerTransport`; file
  path from `process.argv[2]`, batch size default 10, max 50.
- `.mcp.json` entry at repo root:
  `{"type":"stdio","command":"npx","args":["tsx","apps/anki-batch-mcp/src/anki-batch-mcp.server.ts","subjects/Business.txt"]}`.
  Relative paths resolve from the repo root where Claude Code starts the process; the server resolves
  the argument against `process.cwd()`.

Parser rules (`anki-export-parser.ts`):
- Skip lines starting with `#` before the first record. Records are RFC-4180 style: a field in `"`
  may span lines and contains `""` for a literal quote; fields split on a tab outside quotes.
- `deck`: regex `subdeck-label[^>]*>(?:Business::)?([^<]+)<` on field 1, trimmed; when absent, `null`.
- `front`: field 1 after the label div, HTML stripped (`<br>` and block ends become newlines,
  entities decoded including `&#x20;`-style hex escapes, `&nbsp;` to space, tags removed, whitespace
  collapsed). `back`: field 2 the same way, with its label div removed too; empty string when blank.
- Cloze restore: before stripping, replace each `<span class="cloze" data-cloze="X" ...>[...]</span>`
  with the decoded `X`, and each `cloze-inactive` span with its inner text. A record whose front
  contained a cloze span gets `isCloze: true`, and its `back` is dropped when it equals the restored
  front, so the raw text is the full fact once, not twice.
- `rawText` (what prod receives): `front` and, when non-empty, a blank line then `back`.
- `hash`: sha256 of the two raw fields, hex, first 16 chars. Confirming a batch removes records by
  hash, so the file may be edited by hand between batches without breaking ids.

Tool contracts (zod, `anki-batch-mcp.server.ts`):
- `get_next_batch` input `{ size: z.number().int().min(1).max(50).default(10) }`; output
  `{ batchId: string, remaining: number, notes: Array<{ hash, deck: string | null, front, back,
  rawText, isCloze }> }`. First call creates `<file>.bak` if missing (never overwrites). Returns the
  first `size` records still in the file that are not in an unconfirmed batch.
- `confirm_batch` input `{ batchId: z.string().min(1) }`; output `{ removed: number, remaining: number }`.
  Unknown or already-confirmed id → `isError` result with a plain message. Rewrites the file keeping
  the two header lines.
- `status` input `{}`; output `{ file, backupExists, remaining, pendingBatches }`.

Tests (vitest, co-located):
- parser: plain record with empty answer; record with answer; multi-line quoted field with `""`; cloze
  record restores hidden text and drops the duplicated back; deck extraction for the normal label and
  the hidden-div `Маркетинг воронка` variant; header lines skipped.
- file store: backup created once and left alone on a second run; confirm removes exactly the
  handed-out hashes and keeps the headers; a hash not in the file is ignored, not an error.
- session: unknown batch id refused; the same records are not handed out twice while a batch is open.
- server: through `Client` + `InMemoryTransport` from the SDK, list tools and run the three in order on
  a temp copy of a six-record fixture.

Verify: `npx vitest run` in the package; `npx tsc --noEmit`; in Claude Code `/mcp` shows
`anki-batch` with three tools and `status` reports 1,685 remaining before any confirm.

## Wave 1b: token-scopes

What it does: an `api_tokens` row can carry scopes, the gate resolves them, and the MCP server factory
receives them so a tool can refuse. Tokens with no scopes keep today's behaviour everywhere.

Files:
- `apps/api/src/db/schema.ts:729`: add `scopes: text("scopes").array().notNull().default(sql\`'{}'\`)`
  (the Drizzle array column with an empty-array default). Then `npm run db:generate -w @post-anki/api`
  and `npm run db:migrate -w @post-anki/api`. Never `drizzle-kit push`.
- `apps/api/src/api-token/api-token.scopes.ts` (new): `export const API_TOKEN_SCOPES = ["knowledge:write"]
  as const`, `apiTokenScopeSchema = z.enum(...)`, `hasScope(scopes, scope)`.
- `apps/api/src/api-token/api-token.repo.ts`: `insertApiToken` takes optional `scopes: string[]`;
  `findActiveTokenByHash` returns `{ id, revokedAt, scopes }`.
- `apps/api/src/auth/request-auth-context.ts` (new): `export interface RequestAuthContext { kind:
  "shared_secret" | "device_token" | "session_token"; scopes: string[] }` and a `WeakMap<IncomingMessage,
  RequestAuthContext>` with `setRequestAuthContext` / `getRequestAuthContext`. The shared secret and a
  session token get `scopes: ["*"]` so existing write routes are untouched. A WeakMap keeps the change to
  `authorized()` a one-line side effect rather than a new return type threaded through the router.
- `apps/api/src/api-server.ts:461-489`: in `authorized()`, set the context on each success path.
- `apps/api/src/mcp/mcp.route.ts:12`: `createMcpServer(getRequestAuthContext(req) ?? { kind: "none",
  scopes: [] })`.
- `apps/api/src/mcp/mcp.server-factory.ts:9`: `createMcpServer(auth: McpAuthContext)` and pass `auth`
  to the register functions that need it (only the write tool in wave 2; read tools ignore it).
- `apps/api/scripts/create-api-token.ts`: parse `--scopes knowledge:write[,other]`, validate with
  `apiTokenScopeSchema`, pass to `insertApiToken`. Print the scopes in the confirmation line.

Tests:
- `api-token.scopes.test.ts`: `hasScope` with `*`, exact match, missing.
- `api-token.repo.integration.test.ts` (extend): a token minted with scopes comes back with them; a
  token minted without reads as `[]`.
- `mcp-auth.route.test.ts` (extend): the `TokenRow` mock gains `scopes`; existing five cases stay green;
  new case: the auth context handed to `createMcpServer` carries the token's scopes (spy on the factory).
- `apps/api/src/db/migrations.integration.test.ts` runs as is and proves the migration applies.

Verify: `npm run db:generate` produces one migration adding the column; `npx vitest run` and the
integration suite pass; `npx tsc --noEmit` clean.

## Wave 2: prod-knowledge-submit-tool

What it does: `submit_knowledge` stores up to 100 raw texts as pending prose knowledge sources under
the Business sub-subject the deck maps to, keyed so a retried batch is reported as already present.
Detection then runs exactly as for pasted prose.

Files:
- `apps/api/src/mcp/business-deck-mapping.ts`: the six-entry map plus `Маркетинг воронка` →
  Marketing; `resolveDeckSubjectId(deck)` uses `createSubjectSeedStore(getDb())` (`subject-seed.store.ts:11`)
  to find the Business root and the child by name; unknown deck or missing subject → `{ error:
  "unknown_deck" | "subject_missing" }`.
- `apps/api/src/mcp/submit-knowledge.tool.ts`: schemas and `submitKnowledge(input, auth)`.
- `apps/api/src/mcp/register-write-tools.ts`: `registerWriteTools(server, auth)`; checks
  `hasScope(auth.scopes, "knowledge:write")` first and returns `isError` "missing scope knowledge:write"
  without touching the database. Registered from `mcp.server-factory.ts`. Annotation
  `readOnlyHint: false, idempotentHint: true`.
- `apps/api/src/knowledge-source/knowledge-source-keyed-insert.repo.ts` (new, small): `insertKeyedKnowledgeSources(items: { importKey, rawText }[], { subjectId })`
  inserts `kind: "prose"`, `status: "pending"` rows with the caller's explicit import keys using
  `onConflictDoNothing` on `import_key` and returns the written rows. Unlike `insertSplitKnowledgeSources`
  it does not roll back on a partial conflict: the rows already present are simply skipped, so a retry
  after a crash, or a note that appears twice in the export, is a no-op for that note only. Before
  inserting, the tool reads the existing keys (`select importKey where importKey in (...)`) to report them
  as `alreadyPresent`. Pipeline kick: mirror whatever the paste controller does after `addSplitSources`
  (to verify).

Contracts:
- input `{ deck: z.string().min(1), notes: z.array(z.object({ key: z.string().regex(/^[a-z0-9:_-]{8,80}$/),
  text: z.string().trim().min(1).max(20000) })).min(1).max(100) }` (no 20-character floor: 2 real
  notes are short questions such as "Что такое LTV"; empty-text notes never reach prod because the
  runbook confirms them without submitting). The caller passes each note's `hash` from
  the local server as `anki:<hash>`, so the key depends only on the note's content, never on a batch id:
  a batch re-sent after a crash, with a new batch id, adds nothing.
- output `{ subjectId, subjectName, created: number, alreadyPresent: number, sourceIds: string[] }`.
- Errors as `isError` results: unknown deck, subject missing (tells the caller to run
  `db:seed:business-sub-subjects`), missing scope.

Tests:
- `business-deck-mapping.test.ts`: each of the seven names resolves, case and trailing space tolerant,
  unknown refused (store mocked).
- `submit-knowledge.tool.test.ts`: input rejected on empty texts, over 100, bad key base; missing scope
  short-circuits before the repo is called (repo mocked); happy path returns counts.
- `submit-knowledge.integration.test.ts` (same harness as `mcp-read-only.integration.test.ts`): seed a
  Business root and a Marketing child, submit three notes, assert three pending prose sources with the
  given keys and the subject id; submit the same three plus one new, assert `created: 1`,
  `alreadyPresent: 3` and four rows total; unknown deck inserts nothing.
- `mcp-read-only.integration.test.ts`: keep the existing all-tools snapshot test untouched and add a
  second `it`: calling `submitKnowledge` with scopes `[]` leaves the snapshot unchanged; calling with
  `["knowledge:write"]` changes only `knowledge_sources` (take a second digest that excludes that table
  and assert it is equal). This keeps the guarantee "every other tool is read-only" explicit.
- `mcp.route.test.ts` or a new `mcp-write.route.test.ts`: through the real HTTP route with a mocked
  token row, `tools/list` includes `submit_knowledge`, and a call with a scopeless token returns an
  `isError` tool result, not a 401.

Verify: both vitest suites, `npx tsc --noEmit`, lint; after deploy, `tools/list` on prod shows the
tool and a scopeless token gets the `isError` text.

## Wave 3: yulia-trus-import-workflow

What it does: the repeatable loop and its token, run by Claude in a session with both MCP servers.

Steps:
1. Mint the token on prod: `npm run db:create-web-key` is owner-bound and has no flags, so use
   `node --env-file=.env --import tsx scripts/create-api-token.ts "anki import" --email <owner>
   --scopes knowledge:write` from `apps/api` with the prod `DATABASE_URL`. Store it as
   `POST_ANKI_MCP_TOKEN` in the shell profile; add the prod entry to `.mcp.json` as
   `{"type":"http","url":"<prod api base>/mcp","headers":{"Authorization":"Bearer ${POST_ANKI_MCP_TOKEN}"}}`.
   Never a literal.
2. Runbook `.planning/business-anki-import-mcp/runbook.md` (short): batch size 20; per batch call
   `get_next_batch`, group notes by deck, one `submit_knowledge` per deck with each note keyed
   `anki:<hash>`, then `confirm_batch` only when every deck call returned without `isError`. On an
   interrupted batch, call `get_next_batch` again: the same notes come back (they were never confirmed),
   resend them, and prod reports them as already present. Unknown-deck notes: pass the deck the
   mapping table expects (`Маркетинг воронка` is handled; anything else stops the loop). Notes with an
   empty `rawText` (the 5 image-occlusion notes carry no prose) are skipped and confirmed with the
   batch, and the runbook lists their hashes so the user can recreate them by hand if wanted.
3. First batch only: check the review screen shows pending cards under Marketing/Sales/etc. before
   continuing. Then loop until `status.remaining` is 0.

Verify: criteria in the todo; final `status` reports 0 remaining and `.bak` still has 8,813 lines.

## Risks and open checks

- Detection trigger: if pasted prose kicks the Inngest pipeline explicitly, `submit_knowledge` must do
  the same or sources wait for the next scan. Resolve in wave 2 by reading the paste controller.
- Drizzle array default syntax for `text[]` should be checked against the generated SQL before running
  the migration on prod.
- Detection quality on short Russian notes is the pipeline's business; if many notes yield no bits,
  that is feedback for the extraction prompts, not for this import.
