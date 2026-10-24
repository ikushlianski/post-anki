# Paid-service inventory

Every external service the repo touches, what it costs, and the free or local path that exists today. Goal: everything runs on a laptop with no paid service, and every paid service has a free or local path plus a spend guard.

Label key: **Fact** = read from the repo or an official page (URL given); **Assumption** = inferred, not verified.

## Services

| Service | Used by | Purpose | Needed in dev? | Cost | Free or local path today | Gap |
|---|---|---|---|---|---|---|
| OpenRouter (chat/LLM, `OPENROUTER_API_KEY`, `CURRICULUM_MODEL`, `TRANSCRIPTION_MODEL`) | apps/api (Mastra agents, voice transcription), apps/bot (voice) | All card, curriculum, grading and chat generation | Yes, `OPENROUTER_API_KEY` is required by the env schema and the API refuses to boot without it | Pay per token, no flat plan. Fact: `apps/api/src/mastra/model-tier.ts` maps cheap = deepseek-v4-flash, balanced = gpt-4o-mini, premium = deepseek-v4-pro. New accounts get a small free allowance, https://openrouter.ai/docs/faq | `OPENROUTER_BASE_URL` redirects all agent, transcription and embedding calls to any OpenAI-compatible server. `scripts/e2e-mock-openrouter.mjs` is an offline stand-in used by e2e and the phone check, but it only answers two fixture texts and returns `{}` otherwise | No dev switch that selects mock or Ollama without hand-editing env; mock is fixture-only; no Ollama recipe |
| OpenRouter embeddings (`EMBEDDING_MODEL`, default openai/text-embedding-3-small) | apps/api (`shared/embeddings-client.ts`; card, fact, variant embedding jobs) | Vector search and duplicate detection | Yes for embedding jobs and search | Pay per token, same key as chat. Assumption: very low per-token price | Same `OPENROUTER_BASE_URL` override | No local embedding model; no deterministic fake embedder for dev |
| Langfuse Cloud (`LANGFUSE_*`) | apps/api (Mastra exporter) | LLM tracing | No, keys blank disables tracing (Fact: `apps/api/.env.example`) | Hobby plan free, Core $29/mo, Pro $199/mo. Fact: https://langfuse.com/pricing | Blank keys; self-hosting is an option | None for dev. Prod keys come from GitHub secrets |
| Inngest (`INNGEST_*`) | apps/api durable extraction, cards, course jobs | Durable job engine (pilot, off by default; default engine is `dbos`) | No, flags are off by default | Free plan $0 (50k executions), paid from $99/mo. Fact: https://www.inngest.com/pricing | `INNGEST_DEV=1` with `npm run inngest:dev` (local Docker container, unsigned) | Not part of the one-command start |
| DBOS (`DBOS_*`, `DURABLE_EXTRACTION_ENGINE`) | apps/api | Durable workflow engine on Postgres | No, off by default | Open source library on the existing Postgres. Assumption: no fee | Local Postgres | None known |
| Neon Postgres | Prod and shared dev branch (`DATABASE_URL`, `ELECTRIC_DATABASE_URL` in root `.env.example`) | Hosted database | No, local Docker Postgres 16 on :5562 | Free plan is permanent, paid Launch and Scale. Fact: https://neon.com/pricing | `docker-compose.yml` (Postgres, `wal_level=logical`); `docker-compose.override.yml` pins Electric to it; e2e has its own Postgres on :5578 | Root `.env.example` still tells you to put a Neon string in `ELECTRIC_DATABASE_URL` (the override masks it) |
| ElectricSQL sync engine | apps/web (client), apps/api (proxy), `docker-compose.yml` | Local-first read sync | Yes for local-first views | Self-hosted image, no fee. Prod runs it as a Cloud Run service (and a drafted AWS Fargate stack) | `electricsql/electric:1.7.7` in compose, `ELECTRIC_AUTH_MODE=none` | None |
| PowerSync service (`apps/ios/spike`) | apps/ios spike, `SYNC_JWT_*` in the API | Native sync spike | Only when working on the Swift apps | Self-hosted container in the spike. Hosted PowerSync is a paid product, https://www.powersync.com/pricing (Assumption: not used) | `apps/ios/spike/docker-compose.powersync.yml` plus `scripts/setup.sh` | Separate compose file, not started by `npm run dev` |
| Notion (`NOTION_TOKEN`, `@notionhq/client`, `notion-connectors.json`) | apps/api, `scripts/notion-sync-agent` | Optional import and sync | No, optional | Assumption: API access is free with a Notion workspace | Unset token | None |
| Telegram Bot API (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OWNER_TELEGRAM_CHAT_ID`) | apps/bot, daily-push jobs | Reminders, voice notes | No | Assumption: Bot API is free | Do not run apps/bot | Bot voice path calls OpenRouter transcription, so it spends tokens when run |
| Google Cloud Run, Artifact Registry, Cloud Scheduler, IAM (Pulumi `infra/`) | Prod hosting for web, api, bot, Electric; about 15 scheduler jobs that call the API | Prod only | No | Pay per use above a free tier. Source: https://cloud.google.com/run/pricing (page not machine-readable, so the free-tier amounts are an Assumption) | Not needed locally | Scheduler jobs (knowledge-bit detect, embed, tag, place, question and card generation, doc scan) trigger LLM spend in prod with no budget cap |
| AWS ECS Fargate, ALB, ACM, SSM (Pulumi `infra-aws/`) | Shared-infra Electric deploy | Prod only | No | Pay per use, no free tier for ALB or Fargate. Assumption | Not needed locally | Drafted alongside GCP; confirm which one is live |
| GitHub Actions and secrets (`.github/workflows/deploy.yml`) | CI deploy | CI | No | Assumption: within free minutes for a personal repo | n/a | None |
| Doc sites fetched by research (guarded fetch) | apps/api | Doc-link research and changelog scan | No | Free public HTTP; the LLM calls they trigger cost money | `E2E_MOCK_TRACKED_TOOL_CONTENT`, `E2E_SOURCE_FETCH_ALLOWED_ORIGINS`, local mock docs site (`E2E_MOCK_DOCS_PORT`) in e2e | Mocks are e2e-only |
| Apple Developer account (`DEVELOPMENT_TEAM` in `apps/ios/Local.xcconfig`) | apps/ios | Device signing | Only for physical devices | Paid program, Assumption: $99/yr | Simulator and Mac run without it | None |
| Expo (apps/mobile), Tauri (apps/desktop), Chrome extension | Clients | Shells over apps/api and apps/web | Yes for the client you work on | Open-source tooling, no account needed for `expo start`. Assumption | Point `EXPO_PUBLIC_API_BASE_URL` or `DESKTOP_APP_URL` at localhost | None; none of them hold LLM keys (Fact: `apps/desktop/.env.example`) |

## Spend guard status

Fact (from `apps/api/src`):

- Model tiers exist (`mastra/model-tier.ts`) and a per-subject or per-curriculum tier cascade exists (`mastra/model.ts`). A tier is a choice of price, not a limit.
- `generate-with-retry.ts` bounds retries at 3 attempts per call.
- No monthly or daily budget cap, no token or cost counter that blocks calls, no per-request token ceiling applied across agents, and no switch such as `LLM_MODE=mock|cheap|real`.
- Langfuse records usage when keys are set, but nothing reads it back to stop spending.
- The default `CURRICULUM_MODEL` in `shared/env.ts` is `openrouter/google/gemini-2.5-flash`; `apps/api/.env.example` suggests gpt-4o-mini.

## Gaps

1. Fixed for dev: `LLM_MODE=mock` boots without `OPENROUTER_API_KEY` and `npm run dev` starts `scripts/mock-llm.mjs` (chat + embeddings). Real mode still requires the key.
2. No documented or scripted local LLM (mock or Ollama); the only mock covers two fixture texts.
3. No local or fake embedding path.
4. No spend guard of any kind (budget cap, kill switch, token ceiling, dev cheap-mode).
5. Prod scheduler jobs can run LLM work unattended with no cap.
6. `npm run dev` starts Postgres, Electric, api and web only. Inngest, PowerSync and the mock LLM are separate manual steps.
7. Root `.env.example` still points `ELECTRIC_DATABASE_URL` at Neon.
8. The iOS README lists the API's required env values as unverified.
