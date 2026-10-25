# @post-anki/api

The domain API consumed by the web UI (`@post-anki/web`) and, later, the
Telegram bot. Owns HTTP controllers + Drizzle repositories + the Mastra agents.
Pure domain logic (progress, recommendation, attempt, gap, depth,
learning-status derivers) lives in `@post-anki/core`; all request/response
shapes are Zod schemas in `@post-anki/shared`.

Run: `npm run dev -w @post-anki/api` (defaults to port `5560`).

## Endpoints

| Method | Path                       | Body / Query              | Returns            |
| ------ | -------------------------- | ------------------------- | ------------------ |
| GET    | `/healthz`                 | —                         | `{ ok: true }`     |
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

## Auth

If `API_SHARED_SECRET` is set, every route except `/healthz` requires
`Authorization: Bearer <secret>`. Unset = open (local dev).

## Config (env)

`DATABASE_URL` (local docker Postgres on :5562 in `.env.local` for local work; Neon only in deployed environments), `OPENROUTER_API_KEY`, `CURRICULUM_MODEL`
(default `openrouter/google/gemini-2.5-flash`), `API_SHARED_SECRET` (optional),
`PORT` (5560), `LOG_LEVEL`.

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
calls throw `LlmBudgetExceededError` (code `LLM_BUDGET_EXCEEDED`). pino warns at 80%
and at the cap. Mock mode never counts or refuses. The counter is in memory per API
process (resets on restart and per Cloud Run instance) and uses blended per-token
estimates, so treat it as a safety net, not billing; set an OpenRouter key credit
limit as the hard stop.

## Local development — Inngest

Run `npm run inngest:dev` from the project root to start the local Inngest
server. The dev UI is available at http://localhost:8288.

Inngest is the default engine (`DURABLE_EXTRACTION_ENGINE=inngest`). To run all
background work durably against the Neon `dev` branch, set these variables in
`apps/api/.env.local` (no keys needed in dev):

```
INNGEST_DEV=1
DURABLE_EXTRACTION=1
DURABLE_CARDS=1
DURABLE_COURSE_JOBS=1
DURABLE_BACKGROUND_JOBS=1
```

Then run `npm run inngest:dev`. With a flag off, that kind of work runs in the
API process and can stall once the reply is sent.

Outside local dev (`INNGEST_DEV` not `1`) with any of the four `DURABLE_*` flags
on, the API refuses to boot without `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`:
the signing key means only signed requests reach `/api/inngest`, and without the
event key every send would fail and fall back to the in-process path. Set
`INNGEST_SIGNING_KEY_FALLBACK` to the previous key while rotating. In prod, set
`INNGEST_SERVE_ORIGIN` to the API's public URL so Inngest can call
`/api/inngest`.

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
