# Manual test sequence: Business Anki import through MCP

No confirmed scenarios, built from the brief (`brief.md`, `runbook.md`, `todo.md`, the three `0*/plan.md` files and the completed items).

Pending: the prod steps (deploy of migration 0152, Business sub-subject seed, minting the prod token, first batch on prod). Nothing below touches them.

Status per step is not tracked here.

## Start the local environment

Nothing was started and `~/ports.toml` was not touched when this file was written. The isolated e2e stack owns these localhost ports: Postgres 5578, API 5570, web 5550 (defaults of `scripts/e2e-stack.sh`; Postgres is `postgres://postanki:postanki@localhost:5578/postanki_e2e`).

```bash
cd /Users/ikushlianski/webdata/ilya-projects/post-anki
npm run e2e:stack:status
curl -fsS http://localhost:5570/health || true
curl -fsSI http://localhost:5550/ | head -1
```

If status shows everything healthy, reuse it and skip the next block. Otherwise start only what is missing:

```bash
npm run e2e:stack:up
npm run e2e:stack:status
```

Then confirm migration 0152 (the `scopes` column) is applied to the e2e database:

```bash
psql postgres://postanki:postanki@localhost:5578/postanki_e2e -c "\d api_tokens" | grep scopes
```

Work copy of the export (the original is never used):

```bash
mkdir -p /tmp/anki-manual && cp subjects/Business.txt /tmp/anki-manual/Business.copy.txt
printf '{"mcpServers":{"anki-batch-copy":{"type":"stdio","command":"npx","args":["tsx","apps/anki-batch-mcp/src/anki-batch-mcp.server.ts","/tmp/anki-manual/Business.copy.txt"]}}}' > /tmp/anki-manual/copy.mcp.json
```

Variables used below:

```bash
export API=http://localhost:5570
export DB=postgres://postanki:postanki@localhost:5578/postanki_e2e
```

Fixture facts (not tested here): the e2e database needs the Business sub-subjects `Common`, `Marketing`, `Sales`, `Finance`, `Loyalty`, `Hiring`; see Data gap check.

## Group 1: Read-only

1. Action: in `/Users/ikushlianski/webdata/ilya-projects/post-anki` run `claude --mcp-config /tmp/anki-manual/copy.mcp.json --strict-mcp-config`, then `/mcp`. Expect: `anki-batch-copy` shows connected with tools `get_next_batch`, `confirm_batch`, `status`.
2. Action: in the same session ask Claude to call `status`. Expect: `remaining` equals the notes count of the copy (1,685 for the current export), `backupExists` is false, `pendingBatches` is 0.
3. Action: ask Claude to call `get_next_batch` with `size: 5`. Expect: a non-empty `batchId`, 5 notes each with `hash`, `deck`, `front`, `back`, `rawText`; `deck` is one of the Business sub-deck names. The copy file is unchanged (`wc -l /tmp/anki-manual/Business.copy.txt` same as before).
4. Action: for the HTTP server, `claude mcp list` is not enough; mint nothing yet and run `curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/mcp -H 'content-type: application/json' -d '{}'`. Expect: 401 (no credentials).

## Group 2: Reversible

5. Action: ask Claude to call `confirm_batch` with the `batchId` from step 3. Expect: `removed` 5, `remaining` one less 5 than before.
6. Action: run `ls /tmp/anki-manual/` and `wc -l /tmp/anki-manual/Business.copy.txt`. Expect: `Business.copy.txt.bak` exists and holds the original content (`cmp` with `subjects/Business.txt` is identical); the copy is shorter than the `.bak`. Then ask for `status`: `backupExists` true. This is a direct consequence of step 5.
7. Action: ask Claude to call `confirm_batch` again with the same `batchId`. Expect: no further notes removed (error or `removed: 0`), `remaining` unchanged.

## Group 3: Scoped token and writes (local database only)

8. Action: from `apps/api` mint a token without scopes: `DATABASE_URL=$DB node --import tsx scripts/create-api-token.ts "manual read" ` and `export READ_TOKEN=<printed pat_...>`. Expect: the output says "with no scopes (read access only)".
9. Action: mint a scoped token: `DATABASE_URL=$DB node --import tsx scripts/create-api-token.ts "manual write" --scopes knowledge:write` and `export WRITE_TOKEN=<printed pat_...>`. Expect: output says "with scopes knowledge:write". Check `psql $DB -c "select label, scopes from api_tokens where label like 'manual %' order by created_at desc"`: `{}` for the first, `{knowledge:write}` for the second.
10. Action: start a Claude Code session with an HTTP config pointing at the local API: write `/tmp/anki-manual/local.mcp.json` as `{"mcpServers":{"post-anki-local":{"type":"http","url":"http://localhost:5570/mcp","headers":{"Authorization":"Bearer <WRITE_TOKEN>"}}}}`, run `claude --mcp-config /tmp/anki-manual/local.mcp.json /tmp/anki-manual/copy.mcp.json --strict-mcp-config`, `/mcp`. Expect: both `post-anki-local` and `anki-batch-copy` connected; the local one lists the read tools plus `submit_knowledge`.
11. Action: call `submit_knowledge` with the READ_TOKEN (swap it into the config, or use curl: `curl -s $API/mcp -H "Authorization: Bearer $READ_TOKEN" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"submit_knowledge","arguments":{"deck":"Продажи","notes":[{"key":"anki:manual-test-0001","text":"manual test note one"}]}}}'`). Expect: result with `isError: true` and a missing-scope message; `select count(*) from knowledge_sources where import_key='anki:manual-test-0001'` is 0.
12. Action: repeat the same call with `$WRITE_TOKEN`. Expect: `created: 1`, `alreadyPresent: 0`, `subjectName` is Sales (mapped from Продажи); the row now exists in `knowledge_sources` with status `pending`.
13. Action: call it with deck `Несуществующая` and the write token. Expect: `isError: true`, the deck is refused, no row added.
14. Action: re-send the exact call from step 12 with the write token. Expect: `created: 0`, `alreadyPresent: 1`; the row count for the key is still 1.
15. Action: with the write token send a real note batch: ask Claude (in the session from step 10) to run `get_next_batch` size 5 on the copy, call `submit_knowledge` once per deck with `key: "anki:" + hash` and unchanged `rawText`, then send the identical calls again. Expect: first pass `created` summing to the notes sent (empty-`rawText` notes skipped), second pass `created: 0`.

## Group 4: Review screen

16. Action: open `http://localhost:5550/knowledge-bit-review` and wait for the detection scan to pick up the sources (a minute or two). Expect: pending cards appear under the matching Business sub-subjects (for example Sales for Продажи) from the step 15 notes.
17. Action: confirm the batch from step 15 with `confirm_batch`. Expect: `remaining` drops by that batch and the copy shrinks; the original `subjects/Business.txt` is untouched (`git status subjects/Business.txt` clean).

Example rows from the database (picked as the 5 most recent sources by creation time, newest first):

```bash
psql $DB -c "select id, import_key, subject_id, status, created_at from knowledge_sources where import_key like 'anki:%' order by created_at desc limit 5"
```

## Not verifiable through the product UI

- The `.mcp.json` entry `post-anki-prod` expands `${POST_ANKI_MCP_TOKEN}`: needs `claude mcp list` and the env var, covered by `apps/anki-batch-mcp/src/mcp-config.test.ts`.
- Read-only guard for every other tool: `apps/api/src/mcp/mcp-read-only.integration.test.ts`, run with `npx vitest run`.

## Data gap check

- Not testable locally: the prod import itself (deploy of migration 0152, seed on prod, prod token, first prod batch). Left out of the sequence.
- Gap, not fixed: the e2e database may lack the sub-subjects Marketing, Sales, Loyalty and Hiring (only created by `npm run db:seed:business-sub-subjects -w @post-anki/api`), so steps 12 to 16 would return a missing-subject error until they exist. Not checked against the database (the file-only rule forbids running anything).
- Gap, not fixed: the e2e database may not have migration 0152 applied; step 9 would fail on the `scopes` column.
- Gap, not fixed: no `~/ports.toml` entry was read or written, so the ports above are the script defaults, not confirmed free.
- Gap, not fixed: the review screen needs the detection scan and the mock LLM (:4999) to be up; card contents come from the mock, not real content.
- Gap, not fixed: example rows could not be cited because no import has run yet; the query above picks them by `created_at` descending.
