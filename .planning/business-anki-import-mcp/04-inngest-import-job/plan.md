# Plan: one resumable Inngest job for the Business.txt import

Goal: one Inngest job replaces the 85-batch MCP loop; after a failure, re-sending one event continues.
## Decision: how the file reaches prod
- Chosen: a one-time local script parses the file with the existing parser and stages the notes in a new prod
  table (about 2 MB, like `apps/api/scripts/seed-business-sub-subjects.ts`), then sends one event. Rejected:
  blob upload (bucket, credentials, new read path); the MCP loop (what we replace); notes inside the event.
- Fact: import keys `anki:<hash>` already make re-inserts safe (`knowledge-source-keyed-insert.repo.ts`).
  Fact: `deploy.yml` and `infra/index.ts` hold no Inngest keys or `DURABLE_*` flags: prod Inngest is not set up.
- MCP pieces: keep the parser files and `submit_knowledge` with scopes; retire the stdio server after the import.

## Coding tasks (in order)
1. `apps/api/src/db/schema.ts`: table `anki_import_notes` (import_id, note_key, deck, raw_text, position, status
   `staged|imported`, source_id, timestamps; unique on import_id + note_key). `db:generate`, never push.
2. `anki-import/anki-import.repo.ts`: stage rows (`onConflictDoNothing`), next N staged by position, mark
   imported with source id, count by status. Add `findSourcesByImportKeys(keys)` (id, key, status) to
   `knowledge-source-keyed-insert.repo.ts` so a retried batch finds sources made before a crash.
3. `anki-import/anki-import-staging.ts` (pure): skip empty text and list their hashes, refuse the whole file on
   a null or unmapped deck (`resolveBusinessDeck`), key regex, text max 20,000, cap `MAX_IMPORT_NOTES = 2000`.
4. `apps/api/scripts/stage-anki-import.ts` + npm script `db:stage-anki-import`: file path and `--import-id`;
   parses via relative import of `anki-export-parser.ts`, stages in chunks of 200. Flags `--limit N`, `--send`
   (needs `INNGEST_EVENT_KEY`; else prints the event JSON), `--status`. Needs `DATABASE_URL`.
5. `anki-import/anki-import.events.ts`, `.limits.ts`: event `anki-import/requested`, data `{ importId }` only
   (zod `^[a-z0-9-]{3,40}$`, no note text); `BATCH_SIZE = 20`.
6. `anki-import/anki-import.steps.ts` (injected deps, like `extraction-inngest.steps.ts`): `planStep` counts staged
   notes, checks each deck has its sub-subject and durable extraction is on; `importBatchStep` takes the next 20,
   groups by deck, inserts via `insertKeyedKnowledgeSources`, looks sources up by key, marks notes imported,
   kicks only still-pending ids with `kickSourcesAfterAdd`; `summaryStep` returns counts.
7. `anki-import/anki-import-inngest.workflow.ts`: function `import-anki-notes`, `retries: 3`, concurrency 1,
   `singleton` on `importId` mode `skip`, `timeouts.finish: "30m"`. Steps `plan`, `batch-0..batch-(n-1)` (n from
   the memoized plan, so the loop is bounded), `summary`; `NonRetriableError` for unknown deck, missing
   sub-subject, durable off; log per batch. Register it in `createInngestServeHandler([...])` in `api-server.ts`.
8. Docs: a paragraph in `docs/architecture/knowledge-bit/ingestion-pipeline.md`; mark `runbook.md` superseded.
9. After user confirmation: delete the stdio server files, `anki-batch` in `.mcp.json` and `runbook.md`.

## Progress and resume
- Progress: Inngest run page (one step per 20 notes), a log line per batch, `--status`, cards in
  `/knowledge-bit-review`. A failed step retries 3 times; finished steps never repeat. After a failed or
  cancelled run, send the same event again: imported notes are skipped; the singleton skips a start while one runs.

## Detection cost and guards
- Fact: each kicked source is one extraction event, throttled to 10 per minute with 2 in parallel
  (`extraction-inngest.limits.ts`): 1,685 sources drain in about 3 hours, no flood. `DETECT_BITS_BATCH_CAP = 20`
  only caps the old non-durable scan.
- Fact: the 1,571 cloze notes become cards by code, no model call; about 110 reach the model.
- Guards: `plan` refuses when durable extraction is off (the kick would be fire-and-forget on scale-to-zero
  Cloud Run), note cap, bounded loop, singleton, concurrency 1, no text in events. First run `--limit 40`,
  then stage the rest with the same import id (no duplicates).
- Untrusted input: note text is data, validated at staging, passed as prose to the pipeline with its injection
  guard; decks must match the fixed map. Defaults chosen: staging in the prod DB with one table (no run
  table, follows the seed pattern); kick per batch (throttle paces cost); own function, not `background-job`
  (0 retries).

## Tests (vitest, co-located)
- `anki-import-staging.test.ts`: empty skipped and listed; bad deck refuses the file; cap. Repo integration
  test: staging twice adds no rows; next-N order; mark imported.
- `anki-import.steps.test.ts`: a batch retried after a crash adds no duplicates and still marks notes imported;
  only pending sources are kicked; missing sub-subject and durable-off are non-retriable.
- Workflow + config tests (as `extraction-inngest.workflow.test.ts`): n batch steps, a failed step resumes.

## User-only steps
1. Prod Inngest: create the app, set `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `DURABLE_EXTRACTION=1` on the API
   service, sync `https://api.postanki.ilya.online/api/inngest`.
2. Deploy with `release-postanki` (migration and function), then seed with
   `DATABASE_URL='<neon>' npm run db:seed:business-sub-subjects -w @post-anki/api`.
3. Run the staging script with the prod `DATABASE_URL`: `--limit 40 --send`, check the review, then the full file.
4. After a failure: fix the cause (seed, keys, flag), rerun with `--send`. When done, approve task 9.

END-OF-REPORT
