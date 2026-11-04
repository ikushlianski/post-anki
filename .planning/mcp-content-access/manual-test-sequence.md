# Manual test sequence: mcp-content-access (knowledge sources and bits)

No confirmed scenarios, built from the brief (Scope in `.planning/TODO.md` under `## mcp-content-access`, plus the shipped items and `.planning/mcp-content-access--knowledge-sources/spec.md`).

Shipped: three read-only MCP tools, `list_knowledge_sources`, `get_source_knowledge_bits`, `get_knowledge_bit`, registered in `apps/api/src/mcp/mcp.server-factory.ts` (via `register-knowledge-source-tools.ts`). Not done: none.

The MCP client is the product surface for this feature (the Scope says "MCP clients are the interface"), so tool calls are made from a real MCP client. Content is created and approved in the web app.

## Start the local environment

Ports come from the devports registry (`node ~/.claude/devports/cli.mjs resolve post-anki --json`, lane `dev`): API 5560, web 5540. Reuse them if they are already serving this project; launch only what is missing.

Check what is already running:

```bash
lsof -i :5560 -sTCP:LISTEN
lsof -i :5540 -sTCP:LISTEN
curl -s http://localhost:5560/_healthz        # expect {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5540/   # expect 200
```

The database is this project's own docker-compose service `postgres` (container `post-anki-dev-db`, localhost:5562, database `postanki_dev`). `apps/api/.env.local` points the API at it and overrides the `DATABASE_URL` in `apps/api/.env`, so no `DATABASE_URL` is set on the command line. Run from the repo root:

```bash
cd /Users/ikushlianski/webdata/ilya-projects/post-anki
docker compose up -d postgres
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c 'select 1'
npm run db:migrate:api
npm run dev:apps
```

`npm run dev:apps` starts the API (port 5560) and web app (port 5540) together in one terminal.

## Connect an MCP client to /mcp (how auth works)

Fact (`apps/api/src/api-server.ts`, `authorized()`): every request, `/mcp` included, needs `Authorization: Bearer <token>` when `API_SHARED_SECRET` is set. The token is either the value of `API_SHARED_SECRET` or a raw token whose SHA-256 hex matches a non-revoked row in the `api_tokens` table. No code in the repo creates `api_tokens` rows, so use the shared secret.

Fact (`apps/api/src/mcp/mcp.route.ts`): the endpoint is stateless Streamable HTTP, `POST http://localhost:5560/mcp`; `GET` returns 405. A missing or wrong token returns 401 `{"error":"unauthorized"}`.

```bash
SECRET=$(grep '^API_SHARED_SECRET=' /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/.env | cut -d= -f2-)
claude mcp add --transport http post-anki-local http://localhost:5560/mcp --header "Authorization: Bearer $SECRET"
```

Any other MCP client works the same way: URL `http://localhost:5560/mcp`, header `Authorization: Bearer <API_SHARED_SECRET>`. Server name reported on connect: `post-anki-mcp`.

## Before you start

- Fixture: the sequence creates its own content. Step 1 pastes one source, step 2 approves some of its bits, so every later step is caused by those.
- The paste triggers bit detection and question generation, which call the model provider configured in `apps/api/.env` (`OPENROUTER_API_KEY`) and the extraction workflow; this is a real cost, keep the pasted text short (4 to 6 facts).
- Pass/fail is tracked outside this file.

## Group 1: Read-only browsing (empty state)

1. Action: in the MCP client, list the server's tools. Expect: `list_knowledge_sources`, `get_source_knowledge_bits` and `get_knowledge_bit` appear, each marked read-only.
2. Action: call `list_knowledge_sources` with no arguments before any content exists. Expect: an empty `items` list, no error.
3. Action: call `get_source_knowledge_bits` with `sourceId` `does-not-exist`. Expect: an error result with a "not found" message (`isError`), not a crash.
4. Action: call `get_knowledge_bit` with id `does-not-exist`. Expect: the same kind of not-found error.

## Group 2: Create content in the web app

5. Action: open `http://localhost:5540/add-knowledge`, paste 4 to 6 short facts into a text block (no article link, a subject selected), submit. Expect: the form confirms the source was added.
6. Action: open `http://localhost:5540/knowledge-bit-review` and wait until the new source's bits appear as pending. Expect: bits listed for the pasted source.
7. Action: approve at least 2 bits and leave at least 1 pending (or reject one). Expect: approved bits leave the review queue; the pending one stays.

## Group 3: Reading it back through MCP

8. Action: call `list_knowledge_sources` with no arguments. Expect: the pasted source is first (newest first); its label is the start of the pasted text cut at about 120 characters (no summary for pasted text); status is set; `approvedBitCount` equals the number approved in step 7, not the number detected.
9. Action: call `list_knowledge_sources` with `subjectId` set to the subject chosen in step 5, then with a different subject id. Expect: the first call returns the source, the second does not.
10. Action: call `list_knowledge_sources` with `limit` 1, then `limit` 1 `offset` 1; also `limit` 500. Expect: paging returns one item per page; `limit` 500 is clamped to 200 (or rejected with a clear message), never more than 200 items. Offset paging needs two sources: repeat step 5 once more with different text if only one exists.
11. Action: call `get_source_knowledge_bits` with the source id from step 8. Expect: only the approved bits from step 7, in source order; each has id, body, background, source links, topic id and its active question variants (kind, prompt, answer, sentence); the pending/rejected bit is absent.
12. Action: call `get_knowledge_bit` with the id of an approved bit from step 11. Expect: the same bit fields, its approval state labelled approved, its source (id, label, URL) and the same question variants.
13. Action: call `get_knowledge_bit` with the id of the bit left pending in step 7 (copy the id from step 6 or from `search_knowledge_items`). Expect: the bit is returned, labelled pending, with its source.

## Group 4: Reversible and expensive actions

14. Action: in the web app, regenerate or edit questions for an approved bit (if the review screen offers it), then repeat step 11. Expect: only the current question variants appear; replaced (superseded) variants are not shown.

## Not verifiable through the product UI

- Variants marked superseded never reach the tools: covered by `apps/api/src/mcp/knowledge-source-tools.integration.test.ts` and `get-source-knowledge-bits.tool.test.ts`; check with `docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "..."` if needed.
- Read-only guarantee (no write tools registered): covered by `apps/api/src/mcp/mcp-read-only.integration.test.ts`.
- Auth rejection paths (no token, wrong token, revoked token): covered by `apps/api/src/mcp/mcp-auth.route.test.ts`; manually, `curl -i -X POST http://localhost:5560/mcp` without the header returns 401.

## Data gap check

- Gap: local `postanki_dev` currently has 0 knowledge sources and 0 knowledge bits, so every tool returns empty results until content exists. Not fixed here. A tester creates one by pasting a source in the web app (step 5), then approving bits (step 7).
- Gap: no example rows or ids are cited in this file, because there are none to cite. Once content exists, pick examples as the newest rows, ordered by timestamp descending:

```bash
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c \
 "select id, kind, status, subject_id, created_at from knowledge_sources order by created_at desc limit 3;"
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c \
 "select id, knowledge_source_id, ordinal, approval_state, created_at from knowledge_bits order by created_at desc limit 5;"
```

- Gap: step 13 and step 10 (offset paging) need a pending bit and a second source; both come from the steps above, no seeding needed.
- Gap: `api_tokens` has no rows and nothing in the repo creates them; the sequence authenticates with `API_SHARED_SECRET` instead. Not fixed.
- Not testable locally: none.

END-OF-REPORT
