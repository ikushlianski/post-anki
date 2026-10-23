# Local development

Everything runs on a laptop. The only part that can cost money is the LLM provider, and it has a mock mode and a daily cap. See `paid-services.md` for every service and its free path.

## One-time setup

1. `npm install` at the repo root.
2. Install Docker (dev Postgres and Electric run in containers).
3. Copy `apps/api/.env.example` to `apps/api/.env.local` and fill what you need. `DATABASE_URL` for local dev is `postgres://postanki:postanki@localhost:5562/postanki_dev`. `.env.local` is gitignored and overrides `apps/api/.env`.

## Start the app

| Goal | Command |
|---|---|
| API, web, dev Postgres and Electric, migrations applied | `npm run dev` |
| Same, with no paid LLM calls | `LLM_MODE=mock npm run dev` (also starts the mock LLM on 127.0.0.1:4989; no `OPENROUTER_API_KEY` needed) |
| Only the API | `npm run dev:api` |
| Only the web app | `npm run dev:web` |
| Mock LLM on its own | `npm run dev:mock-llm` |
| Stop Postgres and Electric | `npm run db:dev:down` |

Ports: API 5560, web 5540, Postgres 5562.

## LLM modes and spend

- `LLM_MODE=real` (default) uses OpenRouter and needs `OPENROUTER_API_KEY`.
- `LLM_MODE=cheap` uses the cheapest model tier everywhere.
- `LLM_MODE=mock` answers from a local fake server. It writes text in the source's script (English or Cyrillic), so Russian knowledge extracts, but the cards are canned text, not real extraction.
- `LLM_DAILY_BUDGET_USD` (default 5, 0 means unlimited) caps spend per API process per UTC day. A spent cap returns HTTP 429 with `Retry-After`.
- With `LLM_MODE=mock`, Langfuse tracing is off.

## Native Mac and iOS apps

1. In `apps/ios`, copy `Local.xcconfig.example` to `Local.xcconfig` (gitignored).
2. Create an API token for the dev database, from `apps/api`: `DATABASE_URL=<your dev url> npx tsx scripts/create-api-token.ts "native-dev"`. The token is printed once.
3. Put it in `Local.xcconfig` as `POSTANKI_DEV_API_TOKEN = <token>`. Debug builds save it to the keychain at launch, so the app loads data with no manual step.
4. `bash scripts/shot-mac.sh` (from `apps/ios`) builds, launches and screenshots the Mac app. The app talks to `http://localhost:5560` by default in Debug.

Tokens belong to one database. After pointing the API at another database, create a new token.

## Known problems

- Electric can fail to start with `waiting_on_lock` after an interrupted run, which makes `npm run dev` wait forever. The native apps do not need Electric. Start the API by hand (`npm run dev:api`) while Electric is stuck, or run `docker compose restart electric`.
- Drizzle skips a migration whose journal timestamp is older than one already applied. Migration 0097 was fixed for this. If `db:migrate` reports success but a column is missing, compare the journal timestamps.
- `apps/bot` voice transcription is not covered by the spend cap.

## Not verified

The steps above were run on a machine that already had dependencies and containers. A run on a fresh clone has not been done.
