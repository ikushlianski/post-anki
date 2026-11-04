# Manual test sequence: durable background jobs

No confirmed scenarios, built from the brief.

Shipped: extraction, approval pipeline kick and request signing run on the Inngest engine when the flag is on. Contract: `.planning/durable-background-jobs/spec.md`, `signing-impl-report.md`, `extraction-impl-report.md`, `pipeline-kick-impl-report.md`.

## Start the local environment

Lane `dev` from `~/.claude/devports` (`node ~/.claude/devports/cli.mjs resolve post-anki --json`): web 5540, API 5560, Electric 5561, DB 5562. Check first, launch only what is missing:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5540/        # web
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5560/        # API (any HTTP status means it is up)
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select 1"
```

Set `DURABLE_EXTRACTION=1` and `INNGEST_DEV=1` in `apps/api/.env`, then restart the API (`npm run dev:api`). In a second terminal at the repo root run `npm run inngest:dev` and open the dev UI at http://localhost:8288.

## Group 1: Extraction run (reversible, one model call per chunk)

1. Action: open http://localhost:8288 and the Functions tab. Expect: the extraction and pipeline-kick functions are registered.
2. Action: paste a short text source in the app. Expect: in the dev UI Runs tab one extraction run appears and completes, with steps claim, plan, chunk-N (one per chunk) and finish; the source ends as detected.
3. Action: open a step output. Expect: only counts or status values, no source text.
4. Action: paste two different long sources back to back, then paste the first one again. Expect: both runs start and finish, at most 10 starts a minute (extra ones wait in the queue); the repeat paste shows the "already added" warning and starts no run. Regenerate a finished source: a new run starts and the source ends detected.

## Group 2: Approval pipeline kick (reversible)

5. Action: approve a source in http://localhost:5540/knowledge-bit-review. Expect: a pipeline-kick run appears with three steps: pass-detect, pass-wh_question, pass-fill_blank; each returns a status string.
6. Action: approve several sources within a few seconds. Expect: the kicks collapse into one follow-up run, never two at once.

## Group 2b: Course card generation (reversible, one model call per topic; needs `DURABLE_CARDS=1`)

6a. Action: set `DURABLE_CARDS=1` in `apps/api/.env`, restart the API, then confirm a course structure with several topics. Expect: one cards-compile run per topic in the dev UI, at most 3 running at once, each with steps begin, compile and embed; every topic's cards end ready.
6b. Action: while topics are still generating, stop the API and start it again. Expect: the runs resume and every topic ends ready or failed, never stuck generating.
6c. Action: click generate cards on a topic that is already generating. Expect: no second run starts for that topic.

## Group 2c: Course research, drafting and reparse (reversible, paid model calls; needs `DURABLE_COURSE_JOBS=1`)

6d. Action: set `DURABLE_COURSE_JOBS=1`, restart the API, and create a course from a name. Expect: a curriculum-research run with steps prepare, gather and finalize; the course reaches the source-approval step.
6e. Action: approve the sources. Expect: a curriculum-draft run with steps begin, approve, placeholder and draft; the course shows a drafted structure.
6f. Action: create a course from pasted material. Expect: a draft run starts with no text in the event payload (open the event in the dev UI).
6g. Action: use Reparse on a ready course, then add sources to it (merge). Expect: one curriculum-parse run each; the course ends ready.
6h. Action: stop the API during a draft run and start it again. Expect: the course ends drafted or failed with Retry shown, never stuck.
6i. Action: while a draft run is still running, stop the Inngest dev server and click Retry on the course. Expect: no second draft starts in the API log (`curriculum_draft_fallback_skipped_live_run`); restart the dev server and the first run finishes or the course ends failed with Retry shown.

## Group 3: Restart and startup checks (reversible)

7. Action: paste a long source and, while its run shows Running in the dev UI, stop the API and start it again. Expect: the run resumes and finishes without repeating completed steps.
8. Action: remove `INNGEST_DEV` and leave `INNGEST_SIGNING_KEY` unset in `apps/api/.env` (keep `DURABLE_EXTRACTION=1`), then start the API. Expect: it refuses to boot with an error naming `INNGEST_SIGNING_KEY`; no key value is printed.
9. Action: restore `INNGEST_DEV=1` and start the API. Expect: it boots normally.

## Not verifiable through the product UI

- 429 wait-and-retry, 30-minute timeout cancel, throttle of 10 starts per minute: `apps/api/src/knowledge-bit/extraction-inngest.errors.test.ts` and `extraction-inngest.config.test.ts`.
- Event-send failure falling back to the in-process kick: `apps/api/src/knowledge-bit/pipeline-kick.starter.test.ts`.

## Data gap check

- Local dev DB has no knowledge sources or cards; steps 2-7 create their own sources. Check:
```bash
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_sources"
```
- Not testable locally: none.

END-OF-REPORT
