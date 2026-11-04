# @post-anki/bot

The Telegram bot for post-anki. It receives Telegram updates on a webhook, talks to the domain API (`@post-anki/api`) and keeps its own small state in Postgres.

Run locally: `npm run dev:bot` from the repo root (listens on `PORT`, default 8080). Tests: `npm run test -w @post-anki/bot`.

## Commands

The table is the `HELP_COMMANDS` list in `src/telegram/help-command.ts`; `/help` replies with the same list.

| Command | What it does |
| --- | --- |
| `/start` | Introduce the bot and begin a session. |
| `/help` | Show this list of commands. |
| `/today` | Get today's question. |
| `/push` | Same as `/today`. |
| `/chat [page]` | List your Chat cards, optionally a given page. |
| `/digest` | Get your weekly numbers. |
| `/rejected [reason\|words]` | List rejected cards, filtered by a reason or words. |
| `/inbox` | Show how many cards wait in your Inbox, with a link. |
| `/find <words>` | Search your subjects, curricula and topics. |
| `/streak` | Show cards due, your streak and recent accuracy. |
| `/pause [days]` | Pause daily reminders (default 7 days, max 30). |
| `/resume` | Turn daily reminders back on. |
| `/done` | Finish the current question. |
| `/study [topic]` | Start studying a topic (or continue where you left off). |
| `skip` | Skip the current question. |
| `let's continue [with tool]` | Resume your last session or a named tool. |

## Owner-only

The bot serves one person. An update is handled only when its chat id equals `OWNER_TELEGRAM_CHAT_ID`; updates from any other chat are logged as unauthorised and dropped without a reply.

## Environment variables

Names only; values live in the environment or in the deploy secrets. `src/env.ts` validates them at boot.

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OWNER_TELEGRAM_CHAT_ID`
- `API_BASE_URL`
- `API_SHARED_SECRET` (optional)
- `WEB_BASE_URL` (optional)
- `DATABASE_URL`
- `PORT` (optional)
- `LOG_LEVEL` (optional)

## HTTP endpoints

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/_healthz` | none |
| POST | `/telegram` | Telegram secret-token header equal to `TELEGRAM_WEBHOOK_SECRET` |
| POST | `/push` | `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>` |
| POST | `/gap-resurface` | `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>` |
| POST | `/session-idle-sweep` | `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>` |

## Webhook setup

Telegram delivers nothing until the webhook is registered. After the service is reachable at a public URL, run once:

```bash
npm run set-webhook -w @post-anki/bot -- https://<host>/telegram
```

The script (`scripts/set-webhook.ts`) reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from the environment and registers the URL with that secret. The production steps are in `docs/ci-cd/gcp-setup.md`.

## Database

The bot has its own migrations: `npm run db:migrate:bot` from the repo root.
