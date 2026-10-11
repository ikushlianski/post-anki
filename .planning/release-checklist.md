# Release checklist: learn-from-doc-site into main

Scope: `learn-from-doc-site` against `origin/main` (merge base `c6e151f`), 472 commits ahead. Merging into `main` deploys to production, because `.github/workflows/deploy.yml` runs on push to `main`. The PR base `ikushlianski/admin-settings-for-post-anki` deploys nothing and has only 4 migration journal entries, so it is not the real base.

## Before merge
- [ ] Take a production backup: a Neon branch of prod, or a `pg_dump` kept outside git. Repo precedent: `.gitignore` lines 31-33 ignore `.planning/<feature>/*.dump` (unverified: no backup taken yet).
- [ ] Fix the browser origin. `deploy.yml` sets `WEB_ORIGIN` from the Cloud Run `run.app` URL, but `infra/index.ts:7` serves the web app at `postanki.ilya.online`, which is the origin browsers send. Hypothesis: browser calls to the API then get 403 (`apps/api/src/api-server.ts:338`). Verify after deploy.
- [ ] If the web service does not exist yet (its deploy job is off unless `PROD_WEB_ENABLED` is `true`), `WEB_ORIGIN` falls back to `http://localhost:5540` (`apps/api/src/shared/env.ts:43`), which blocks every browser origin.
- [ ] Decide whether the highlight extension must work in prod. If yes, set `EXTENSION_ID` on the API. Nothing in `deploy.yml` sets it, and `apps/extension/public/manifest.json` has no `key`, so the ID depends on how the extension is published (unverified).
- [ ] Decide on `NOTION_TOKEN` (new in `apps/api/src/shared/env.ts:45`, not in `deploy.yml`). Without it the Notion client throws (`apps/api/src/notion-connector/notion.client.ts:22`). Matters only if the connector runs in prod (unverified).
- [ ] Confirm prod LLM calls should move to the tier system (behaviour change 3).
- [ ] Human read-only check of prod subject names that migrations 0048 and 0089 match: `Programming / Web Development`, `Business`, `Databases`, `Architecture`, `AI`, `Cloud Computing`. `.planning/LOG.md` line 132 says 8 subjects were seeded to prod, so these likely exist (unverified).
- [ ] Commit or drop the uncommitted web files (`apps/web/src/knowledge-bit/knowledge-bit-review-bulk-*.tsx`, `knowledge-bit-review-empty-state.tsx`). They are not on the branch, so they will not deploy.
- [ ] Gates: `npx tsc --noEmit` and project lint, zero issues. CI's `test` job also runs unit tests, integration tests on real Postgres, and the web bundle check.
- [ ] Merge at low traffic. Prod table sizes are unverified, and 0079 and 0077 lock tables.

## Migrations: 44 new (0047 to 0090)
The journal goes from 47 to 91 entries (`apps/api/src/db/migrations/meta/_journal.json`).
- Additive new tables (safe): 0049, 0054, 0055, 0056, 0059, 0065, 0068, 0069, 0075, 0078, 0083.
- Additive columns and indexes (safe): all other ADD COLUMN and CREATE INDEX files, including 0047, 0050-0053, 0057-0058, 0060-0064, 0066-0067, 0070-0074, 0076, 0080-0082, 0084-0088, 0090.
- Lock risk: 0079 adds three stored generated `tsvector` columns (`knowledge_bits`, `modules`, `topics`) and three GIN indexes without CONCURRENTLY. Table rewrite and lock duration are unverified.
- Brief gap: 0077 drops the unique index on `knowledge_bit_question_variants` and recreates it as partial (`superseded_at is null`).
- Data seed: 0048 inserts React topic nodes under Programming / Web Development. It checks for existing rows and does nothing if the subject is missing.
- Riskiest, data rewrite: 0089_nest-subjects-under-parents.sql. It sets `parent_id` on every subject whose name is exactly `Databases`, `Architecture`, `AI` or `Cloud Computing`, in any tree, and inserts six subjects (Time management, Sales, SMM, Negotiations, HR, Marketing) under the earliest `Business`. It deletes nothing, but it has no down step.
- NOT NULL columns all have defaults (0047, 0060, 0070, 0072, 0073, 0080, 0081, 0082, 0084, 0086, 0090), so existing rows fill without error.
- 0087 adds a unique constraint on the new `knowledge_bit_reviews.request_id`. All rows are NULL on add, so it is safe.

## At deploy (order from deploy.yml)
- [ ] Merge starts `test`. Then `review-factory-gate` and `infra` run in parallel, then `deploy` (bot), `deploy-api`, and `deploy-web` (off by default).
- [ ] `deploy-api` runs migrations first (`npm run db:migrate -w @post-anki/api` against `PROD_DATABASE_URL`), before the image builds or Cloud Run changes. The bot `deploy` job runs `db:migrate:bot` on the same URL in parallel.
- [ ] A failed migration fails `deploy-api`, so the new image does not ship. Drizzle runs one migration run inside one transaction (`node_modules/drizzle-orm/pg-core/dialect.js`, around line 60), so a failure rolls back the whole run. Read from the installed version; unverified at runtime.
- [ ] Between migration and rollout, the old API runs on the new schema. Additive columns are harmless to it. Effect of 0089 on old code: unverified.
- [ ] Pulumi (`infra` job, CI) creates the 10 new scheduler jobs in parallel with migrations. Calls may hit routes the old revision lacks, so expect 404s until rollout. Nothing was deployed from this session.
- [ ] Watch the `/_healthz` loops in `Verify API health` (12 tries).
- [ ] Never run `npm run db:migrate` from a laptop. `apps/api/.env` points at prod Neon. `apps/api/scripts/migrate.ts` refuses non-local hosts outside CI.

## Env and config
- New in `apps/api/src/shared/env.ts`: `EXTENSION_ID` (optional), `NOTION_TOKEN` (optional), `WEB_ORIGIN` (default `http://localhost:5540`; prod sets it only through `deploy.yml`).
- `PORT` default moves from 8030 to 5560. `deploy.yml` passes `--port 8030` to Cloud Run; Cloud Run sets `PORT` itself (unverified).
- Local ports in the `.env.example` files moved (dev DB 5437 to 5562, e2e DB 5436 to 5578, API 8030 to 5560). Anyone with a local stack must update.
- `CURRICULUM_MODEL` is still set in `deploy.yml` but no code path reads it now (`apps/api/src/mastra/model.ts` comment).
- No new secret for the DeepSeek models. Calls go through OpenRouter with the existing `OPENROUTER_API_KEY`. Account access is unverified.

## New infra (`infra/index.ts`, +214 lines)
- 10 Cloud Scheduler jobs, each POST to `api.postanki.ilya.online` with the shared secret as bearer, 300s deadline, Europe/Warsaw time zone:
  - Every 5 min: knowledge-bit detect, embed, tag, place, question-gen, fill-blank-gen, basic-card-gen (`/knowledge-bits/basic-card-generation-scan`), variant-embed.
  - Every 6 h: card-embedding-scan (`/cards/embedding-scan`).
  - Every 15 min: biz-education-distill (`/biz-education-distills`).
- Pulumi/CI applies these. Nothing was deployed from this session.

## Behaviour changes to expect
1. CORS: a browser request whose `Origin` is not on the allow-list gets 403 `origin_not_allowed` (`apps/api/src/shared/cors.ts`). Requests with no Origin (scheduler) pass.
2. Review queue: only approved bits that are due, or never scheduled, are counted and served (`apps/api/src/knowledge-bit/topic-due.repo.ts` around lines 47-49). Pending bits do not appear. Review lives at `/knowledge/review` (`apps/web/src/routes/knowledge.review.tsx`).
3. Models: the tier cascade (`apps/api/src/mastra/tier-resolver.ts`) replaces `CURRICULUM_MODEL` for agents. The global tier defaults to `cheap` (0047). `cheap` now maps to `openrouter/deepseek/deepseek-v4-flash` (`apps/api/src/mastra/model-tier.ts`, previously `-latest`). Quality and cost effects on all agents: unverified.
4. Knowledge-item model switcher defaults to DeepSeek V4 Flash (0090, `packages/shared/src/knowledge-item-model.ts`). Existing settings rows get that value.
5. After paste: the endpoint replies 201 and processes in the background. Cloud Run allocates CPU only during requests (max 1 instance, min 0), so work can wait for the next request or scheduler tick. Documented worst case is 15-20 minutes (`docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md`, lines 6 and 20-21).
6. Basic cards: the scan (`apps/api/src/knowledge-bit/knowledge-bit-basic-card-claim.repo.ts`) picks every non-rejected bit that lacks a basic card, pending or approved, oldest first. It is not limited to approved items. Existing bits will trigger LLM calls on the first ticks. Cost per tick: unverified.

## After deploy (manual checks)
- [ ] The `deploy-api` health check passed in the Actions run.
- [ ] Open the web app with devtools. No 403 `origin_not_allowed`.
- [ ] Paste one text item on `/add-knowledge`. Bits reach the approval page within about 20 minutes (unverified timing).
- [ ] Approve one bit. It leaves pending.
- [ ] `/knowledge/review` shows only due cards. Grade one, then undo it.
- [ ] Dashboard due counts load (commit `8200dbe`).
- [ ] Subject menu: Databases, Architecture, AI and Cloud Computing sit under Programming / Web Development. Business has the six new children.
- [ ] Admin settings show DeepSeek V4 Flash as the knowledge-item model.
- [ ] Extension: send one highlight, expect 201 (needs `EXTENSION_ID`).
- [ ] Cloud Scheduler: the 10 `post-anki-*` jobs exist and their last runs are not 401 or 404.
- [ ] Logs: `knowledge_bit_pipeline_kick_run_done` appears, and `_pass_failed` does not repeat.
- [ ] Langfuse: call volume after the first basic-card runs.

## Rollback
- [ ] Code: shift Cloud Run `post-anki-api` traffic back to the previous revision. Safe for the additive schema, since old code ignores new columns. The new scheduler routes will return 404 until redeployed.
- [ ] Or revert the merge commit on `main` and let deploy run. The migrator skips migrations already applied.
- [ ] Schema: there are no down migrations. Additive objects need hand-written DROP statements. To reverse 0089, set `parent_id` back to null on the four named subjects and delete the six inserted Business subjects, but only after confirming they have no children or cards (unverified).
- [ ] Reverse 0077 only if no duplicate `(knowledge_bit_id, kind, order)` rows exist among superseded rows.
- [ ] Scheduler and CORS config: revert `infra/index.ts` and let CI apply it. Do not edit jobs in the console (CLAUDE.md infra rule).
- [ ] Restore from the snapshot only for real data damage. A restore loses writes made after the snapshot.

END-OF-REPORT
