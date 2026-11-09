# Runbook: Business Anki import to prod

Superseded by the Inngest job `import-anki-notes` (plan: `04-inngest-import-job/plan.md`). The MCP batch loop below is kept only until the import is confirmed.

## Run steps (job) [user]
1. Prod Inngest: create the app, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` on the API service and `DURABLE_EXTRACTION=1`, sync `https://api.postanki.ilya.online/api/inngest`.
2. Deploy with `release-postanki` (applies the migration and the function).
3. Seed sub-subjects: `DATABASE_URL='<neon>' npm run db:seed:business-sub-subjects -w @post-anki/api`.
4. From `apps/api`, with the prod `DATABASE_URL` (and `INNGEST_EVENT_KEY` for `--send`): `npm run db:stage-anki-import -- <path>/Business.txt --import-id business-1 --limit 40 --send`. Check `/knowledge-bit-review`, then rerun without `--limit` (same import id, no duplicates).
5. Progress: Inngest run page, or `npm run db:stage-anki-import -- --import-id business-1 --status`.
6. After a failure: fix the cause (seed, keys, flag), then run the script with `--send` again.
7. Confirm the finished import, then retire the MCP server and revoke the old MCP token if unused.

---

# Old runbook (MCP batch loop)

Yulia Trus' notes in `subjects/Business.txt` move to prod in batches of 20. Claude calls the local `anki-batch`
server and the prod `post-anki-prod` server. Prod writes are run by the user only.

## User steps before the first batch
1. Deploy the staged API changes (migration 0152 and cloze import detection) through the normal deploy
   (`release-postanki`). Deploy cloze detection before the first batch: 1,571 of the 1,685 notes carry `{{cN::..}}`
   gaps, and a note submitted earlier keeps the cards it already got, because its key is then already present.
2. Seed the Business sub-subjects on prod.
3. Mint the API token.
4. Export `POST_ANKI_MCP_TOKEN` and restart Claude Code.
5. Run the first batch and check `/knowledge-bit-review`.

## Prerequisites
The deploy runs migrations only. Marketing, Sales, Loyalty and Hiring exist only after the seed; Common and
Finance come from migrations.

## Seed [user]
In a subshell: `DATABASE_URL='<neon string>' npm run db:seed:business-sub-subjects -w @post-anki/api`.
It prints "N created, M already present". A rerun changes nothing.

## Token [user]
From `apps/api`, once: `DATABASE_URL='<neon string>' node --import tsx scripts/create-api-token.ts "anki import" --scopes knowledge:write`
(add `--email <owner>` if needed). No `--env-file`, so no local `.env` is read. The printed `pat_...` value goes
into `export POST_ANKI_MCP_TOKEN=...` in the shell profile, never a file in the repo. Restart Claude Code.
Revoke later [user] with `DATABASE_URL='<neon string>' ALLOW_REMOTE_DB_MIGRATE=1 npm run db:revoke-api-token -w @post-anki/api -- "anki import"`
(the npm script reads `apps/api/.env` when `DATABASE_URL` is not set in the shell, so always set it).

## Check
`/mcp` lists `anki-batch` and `post-anki-prod`. `status` reports 1,685 remaining; `backupExists` is true after batch 1.

## Loop (batch size 20) [user starts, Claude runs]
Claude never starts this loop on its own; the user says go after the user steps above are done.
1. `get_next_batch {size: 20}`. An empty `notes` list with `batchId: ""` means the file is done; never call `confirm_batch` with an empty id.
2. Group the notes by `deck`. Send one `submit_knowledge {deck, notes: [{key: "anki:" + hash, text: rawText}]}` per deck.
   `rawText` goes unchanged: no rewriting, translating or trimming. For cloze notes `rawText` carries `{{cN::answer}}` or `{{cN::answer::hint}}` gaps, which the API turns into cloze cards, so they must not be altered.
3. `confirm_batch {batchId}` only when every deck call returned without `isError`.
4. Repeat until `confirm_batch` returns `remaining: 0` or `get_next_batch` returns no notes (two header lines stay in the file;
   the `remaining` of `get_next_batch` still counts the batch just handed out).

Notes with empty `rawText` are skipped (not sent) and confirmed with their batch; the `.bak` file keeps them.
Skipped image-occlusion notes, all deck `Маркетинг воронка`:
`495424e54fc5bd0f`, `4b0cd5272f313dd5`, `db1492e21c80321a`, `26bca7921322260c`, `ba75f9ba1d20a432`.

## Stop conditions
A note with `deck: null`, or an `unknown_deck` / `subject_missing` / `missing_scope` error: stop, report the hashes,
do not confirm.

## Resume
- Same session, batch id still known: resend the same notes; per deck `created + alreadyPresent` equals the sent count
  (`created` is 0 only if the earlier submit fully succeeded), then `confirm_batch`.
- New session or restarted server (ids are lost): `get_next_batch` returns the same notes under a new id; resend, then confirm.
- Batch id unknown while the server is alive (`pendingBatches > 0` after a context reset): restart the `anki-batch` server
  (reconnect in `/mcp`), then `get_next_batch` hands the same notes again; prod keys dedupe the resend.
- `status.pendingBatches > 0` means a batch is open. Settle it before calling `get_next_batch` in the same
  session, otherwise its notes are skipped.

## First batch [user starts, Claude runs]
Submit, then check `/knowledge-bit-review` after detection (a few minutes): pending cards show the expected source
subject and stay faithful to the note. Resend the same notes: `created` is 0. Then `confirm_batch`. Expect `created` plus
skipped = 20, `remaining` down by 20, `.bak` still 8,813 lines. Stop here for the user. Check the deck mapping again on
the first batch with a different deck.
