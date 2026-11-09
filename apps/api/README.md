# @post-anki/api

The domain API consumed by the web UI (`@post-anki/web`), the Telegram bot
(`apps/bot`) and the native apps. Owns HTTP controllers + Drizzle repositories + the Mastra agents.
Pure domain logic (progress, recommendation, attempt, gap, depth,
learning-status derivers) lives in `@post-anki/core`; all request/response
shapes are Zod schemas in `@post-anki/shared`.

Run: `npm run dev -w @post-anki/api` (defaults to port `5560`).

## Endpoints

| Method | Path                       | Body / Query              | Returns            |
| ------ | -------------------------- | ------------------------- | ------------------ |
| GET    | `/_healthz`                | —                         | `{ ok: true }`     |
| GET    | `/subjects`                | —                         | `Subject[]`        |
| POST   | `/subjects`                | `CreateSubjectInput`      | `Subject` (201)    |
| GET    | `/curricula`               | `?subjectId=`             | `Curriculum[]`     |
| POST   | `/curricula`               | `CreateCurriculumInput`   | `Curriculum` (202) |
| GET    | `/curricula/:id`           | —                         | `CurriculumDetail` |
| PATCH  | `/curricula/:id`           | `{ learningStatus }`      | `Curriculum`       |
| POST   | `/curricula/:id/confirm`   | —                         | `Curriculum`       |
| PATCH  | `/modules/:id`             | `{ learningStatus }`      | `{ id, learningStatus }` |
| PATCH  | `/topics/:id`              | `UpdateTopicInput`        | `Topic`            |
| POST   | `/topics/:id/probe`        | `{ mode }`                | `ProbeQuestion`    |
| POST   | `/topics/:id/probe/answer` | `{ gapId, mode, answer }` | `ProbeResult`      |

## The two-phase flow: create, then probe

**1. Create the curriculum (then confirm it).**
`POST /curricula` is asynchronous:

1. Persists the curriculum + its sources, responds `202` with status `curating`.
2. In the background: fetches each `link` source (strips HTML) / reads each
   `text` source, then the curriculum-architect agent breaks the material into
   **modules → topics → gaps**, each tagged with a **depth**
   (`awareness | working | deep`). No questions are generated here.
3. On success the curriculum flips to `ready`; on error to `failed`.

You then curate (opt topics in/out, set per-topic depth, skip/declare gaps) and
accept the structure with `POST /curricula/:id/confirm`, which moves it
`ready → confirmed`. Lifecycle: `draft → curating → ready → confirmed`
(or `failed`).

**2. Probe — only after confirmation.**
Both probe endpoints return `409 not_confirmed` until the curriculum is
`confirmed`. Once confirmed:

- `POST /topics/:id/probe` picks the next open gap (wanted gaps first, then
  shallowest) and the mentor-ask agent generates **one** question in your chosen
  `mode` (`socratic` to talk, `quick_test` for hands-only contexts).
- `POST /topics/:id/probe/answer` sends your answer to the mentor-eval agent,
  which marks the probed gap — and any other open gap your answer covered in
  passing — covered or open, may discover new in-scope gaps (never past the
  topic's depth ceiling), updates progress, advances `learningStatus`
  (`probing → reviewing` once all in-scope gaps are covered), and returns the
  next question.

Probing is generated entirely from creation output: the topic title/summary, the
architect's gaps, and the depth ceiling chosen during creation.

## Errors

Failed requests answer with JSON `{ "error": "<code>", "message"?: "<text>" }`. `error` is a stable code; `message` is human-readable and present only on some codes. A few responses carry extra fields next to these two (for example `reason`, `existingId`, `duplicates`). Every route except `/_healthz` can also return the auth and server codes below.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_input` | The body or query failed validation; `message` lists the failing fields. For a note that exceeds the length limit the response also carries `reason: "text_too_long"`. |
| 400 | `invalid_query`, `invalid_id`, `invalid_body`, `invalid_status`, `missing_params` | Route-specific request problems. |
| 401 | `unauthorized` | The bearer secret or session is missing or wrong. |
| 401 | `no_user_session` | The route needs a signed-in user session. |
| 403 | `origin_not_allowed` | The request origin is not on the allow list. |
| 404 | `not_found` | The target does not exist. Some routes use a specific code such as `subject_not_found` or `account_not_found`. |
| 409 | `already_added` | The knowledge source was added before; the body also has `existingId`, `addedAt` and `duplicates`. |
| 409 | `not_confirmed` | A probe was requested before the curriculum was confirmed. |
| 409 | `already_resolved`, `already_curating`, `already_finished`, `not_awaiting_decision`, `session_finished`, `not_finished`, `not_rejected`, `not_in_chat`, `in_flight` | The target is not in a state that allows the action. |
| 413 | `invalid_input` | Only on the knowledge-source create route: the request body exceeds 1,000,000 bytes; the body carries `reason: "text_too_long"`. |
| 422 | `unresolved_target`, `missing_url`, `not_assistant_message` | The request was understood but cannot be applied. |
| 423 | `budget_paused` | Chat is paused because the daily LLM budget is used up (chat-queue routes). |
| 429 | `llm_budget_exceeded` | The daily LLM budget is used up; the `Retry-After` header holds the seconds until the next UTC day. |
| 429 | `cap_reached`, `search_rate_limited` | A chat or search rate limit was hit. |
| 500 | `internal_error` | An unhandled server error; details are in the API log only. |
| 502 | `model_failed`, `scan_failed`, `classification_failed`, `transcription_failed`, `review_failed`, `mapping_failed`, `grading_failed`, `embedding_failed`, `evaluator_unavailable` | An upstream model or service call failed. |
| 503 | `llm_budget_check_unavailable` | The daily budget could not be read, so the paid call was refused; `Retry-After` is 30 seconds. |

The lists are the codes in the controllers and `src/api-server.ts`; a route may add its own code next to these.

## Auth

If `API_SHARED_SECRET` is set, every route except `/_healthz` requires
`Authorization: Bearer <secret>`. Unset = open (local dev).

The repo's `.mcp.json` reads the client-side env var `POST_ANKI_MCP_TOKEN` (a `pat_...` API token with the
`knowledge:write` scope) for the `post-anki-prod` server. Steps: `.planning/business-anki-import-mcp/runbook.md`.

## Config (env)

Local: `DATABASE_URL` (local docker Postgres on :5562 in `.env.local`; Neon only in deployed environments), `OPENROUTER_API_KEY`, `CURRICULUM_MODEL`
(default `openrouter/google/gemini-2.5-flash`), `API_SHARED_SECRET` (optional),
`PORT` (5560), `LOG_LEVEL`.

Production (set by the `deploy-api` job in `.github/workflows/deploy.yml`): `DATABASE_URL`, `OPENROUTER_API_KEY`, `CURRICULUM_MODEL`, `API_SHARED_SECRET`, `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGINS`, `WEB_ORIGIN` (when the web service exists), `AUTH_EMAIL_FROM`, `OWNER_EMAIL`, `LOG_LEVEL`, `NODE_ENV`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`, `CONNECTOR_SECRET_KEY`, `NOTION_TOKEN`, `EXTENSION_ID`, and `ELECTRIC_SERVICE_URL` (only when `PROD_ELECTRIC_ENABLED` is `true`).

## Local development — zero-cost mock LLM

Set `LLM_MODE=mock` in `apps/api/.env.local` (or the shell) and run `npm run dev`
from the project root. No `OPENROUTER_API_KEY` is needed: `scripts/dev.sh` starts
`scripts/mock-llm.mjs` (port `MOCK_LLM_PORT`, default 4989) and the API sends all
chat and embedding calls there. Chat answers match the requested JSON schema with
placeholder values; embeddings are deterministic 1536-number vectors
(`MOCK_EMBEDDING_DIM` overrides). Content is fake, so use it to exercise flows,
not to judge quality. Run the mock alone with `npm run dev:mock-llm`. With
`LLM_MODE` unset or `real`, the API still refuses to boot without a key.

## LLM spend guard

`LLM_MODE=real|cheap|mock`. `cheap` makes real calls but forces the cheapest tier
(`mastra/model-tier.ts`) for every agent. `LLM_DAILY_BUDGET_USD` (default 5, 0 = off)
caps estimated spend per UTC day; once reached, chat, embedding and transcription
calls throw `LlmBudgetExceededError` (code `LLM_BUDGET_EXCEEDED`, HTTP 429). pino warns at 80%
and at the cap. Mock mode never counts or refuses. The day's total is stored in the
database (`llm-daily-spend.repo.ts`), so it is shared across API processes and survives
restarts; a UTC day change starts a new total. If the total cannot be read, the paid call
is refused (`llm_budget_check_unavailable`, HTTP 503). Amounts use blended per-token
estimates, so treat the guard as a safety net, not billing; set an OpenRouter key credit
limit as the hard stop.

## Inngest

Prod: Inngest Cloud free plan (50k executions a month). Set `INNGEST_EVENT_KEY` and
`INNGEST_SIGNING_KEY`, then sync `https://<api domain>/api/inngest` after the first
deploy. Prod forces durable mode on and refuses to boot without both keys (or with
`INNGEST_DEV=1`). Set `INNGEST_SERVE_ORIGIN` to the public API URL;
`INNGEST_SIGNING_KEY_FALLBACK` holds the previous key while rotating.

- A failed send leaves the source pending; the 5-minute sweep (`POST /knowledge-pipeline-sweeps`) re-queues it.
- After an extraction, the follow-up passes run as one debounced job.
- DBOS is gone; there is no in-process fallback in prod.
- Details and budget: `docs/architecture/knowledge-bit/durable-extraction.md`.

## Local development — Inngest

Run `npm run inngest:dev` from the project root to start the dev server (UI at
http://localhost:8288). Put this in `apps/api/.env.local` (no keys needed in dev):

```
INNGEST_DEV=1
DURABLE_EXTRACTION=1
DURABLE_CARDS=1
DURABLE_COURSE_JOBS=1
DURABLE_BACKGROUND_JOBS=1
```

With a flag unset, that kind of work runs in the API process (the e2e and
playwright stacks do this; they have no Inngest). Tests use fakes and
`@inngest/test`, never the dev server.

## Migrations

`npm run db:generate -w @post-anki/api` then `npm run db:migrate -w @post-anki/api`.
Uses its own `drizzle_migrations_api` ledger table so it can share a database
with the bot without collision. Run migrations against the local DB; deployed Neon
migrations are a separate, deliberate step.

Vector search needs the `vector` extension (pgvector 0.7.0 or newer for `halfvec`;
Neon offers 0.8.0). The migrations install it, add the `embedding_vec` columns,
copy existing 1536-number embeddings into them and build the HNSW indexes, so a
deploy needs no manual step. Take a Neon backup branch before the first deploy that
applies them, and apply the same migrations to the Neon `dev` branch so local dev
matches prod.

## Data safety: backup and restore

The database holds everything: subjects, cards and their review history, chat threads, tokens. The downloads below are convenience copies, not a backup.

Full copy (uses the `DATABASE_URL` env var; never paste its value into docs, tickets or chat):

```
pg_dump --format=custom --no-owner --file=post-anki.dump "$DATABASE_URL"
```

Restore into an empty database whose connection string is in `RESTORE_DATABASE_URL` (a scratch variable you set yourself):

```
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" post-anki.dump
```

Restore checklist:

1. Restore into a new database or branch first, never over production.
2. The vector extension must exist before restore (`CREATE EXTENSION IF NOT EXISTS vector;`); the dump needs pgvector 0.7.0 or newer.
3. Point a local API at the restored copy (`DATABASE_URL` in `apps/api/.env.local`) and open the card list and one review session.
4. Compare card counts with the source (`select count(*) from knowledge_bits`).
5. Store dumps like secrets: they contain personal study data and API token hashes.

Hosted Postgres (Neon) also offers point-in-time restore and backup branches in its console. Take a branch before a risky migration, as noted under Migrations.

What the downloads cover:

- `GET /knowledge-bits/export?format=json|csv`: every card with its answer, subject, source links, schedule (state, due date, interval, ease, lapses), review history, topic and tags. It does not include chat threads, curricula, modules, settings or tokens, and it cannot be re-imported by a script in this repo.
- `GET /knowledge-bits/chat-queue/export`: Markdown for one subject's cards currently in the Chat queue, with their chat messages. It covers only that queue, not other cards or review data.
