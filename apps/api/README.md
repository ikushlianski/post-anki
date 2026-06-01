# @post-anki/api

The domain API consumed by the web UI (`@post-anki/web`) and, later, the
Telegram bot. Owns HTTP controllers + Drizzle repositories + the Mastra agents.
Pure domain logic (progress, recommendation, attempt, gap, depth,
learning-status derivers) lives in `@post-anki/core`; all request/response
shapes are Zod schemas in `@post-anki/shared`.

Run: `npm run dev -w @post-anki/api` (defaults to port `8030`).

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

`DATABASE_URL` (Neon), `OPENROUTER_API_KEY`, `CURRICULUM_MODEL`
(default `openrouter/google/gemini-2.5-flash`), `API_SHARED_SECRET` (optional),
`PORT` (8030), `LOG_LEVEL`.

## Migrations

`npm run db:generate -w @post-anki/api` then `npm run db:migrate -w @post-anki/api`.
Uses its own `drizzle_migrations_api` ledger table so it can share the Neon DB
with the bot without collision.
