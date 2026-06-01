# Decisions

## [2026-06-01] — adaptive settings + probe grounding (backend, implemented)
- **Adaptive settings** on the curriculum (deck): `speed` (slow|normal|fast), `hinting` (bool), `defaultDepth`. Migration `0001`. `PATCH /curricula/:id` now sets any of learningStatus/speed/hinting/defaultDepth. speed = probing pace/difficulty ramp; hinting = mentor adds a one-line hint — both threaded into the mentor-ask prompt. Depth stays per-topic (the 3-level slider, FE) via existing `PATCH /topics/:id`.
- **Probe grounding** (Principle 1): sources-first → web fallback. Pasted TEXT sources (≥200 chars) ground the mentor with no web; otherwise openrouter:web_search grounds it (two-pass, never raw training data). Applied to both ask + eval.
- **Contract change** (`@post-anki/shared`, FE-consumed, additive): `curriculumSchema` += speed/hinting/defaultDepth; `updateCurriculumInput` accepts them.
- Live-verified (real Neon+OpenRouter): settings persist + 400 on bad enum; depth slider per topic; `source=pasted` (0 web) vs `source=web` (2731 chars). typecheck clean, 67 core tests. Migration ledger healthy (`drizzle.drizzle_migrations_api`, 2 applied).
- Limits flagged in `.inbox`: text-source grounding only (link bodies not retained); web fallback latency ~21s on source-less; presence-based not per-gap coverage.

## [2026-06-01] — Principle 1 relaxed: probe-time grounding hierarchy
- Real-source grounding is no longer strict. At PROBE time the mentor grounds in this order: (1) pasted articles (curriculum sources), (2) accumulated knowledge (existing topics/gaps), (3) general knowledge.
- General knowledge is allowed *for now* but ONLY via the **web search tool** — never raw training-data hallucination. Web search stays out of capture (still paste-first); it belongs to the learning/probe phase.
- Implication: probe-time mentor needs the stored sources threaded into its prompt AND a web_search path for general knowledge. web_search + structured output can't share one call → two-pass where structure is needed (see [[project_openrouter_websearch_no_structured]]).

## [2026-06-01] — probe cold-start + lifecycle deletes (backend)
- **Probe cold-start** (closes the learning loop after gaps were removed from capture): zero-gap topic → `startProbe` returns a topic-level OPENER (gapId=null); mentor-eval discovers the first gaps from the answer; next question anchors on a discovered gap. Removed `no_open_gaps`. learningStatus = `reviewing` when no open gaps remain, else `probing`.
- **Contract change** (`@post-anki/shared`, FE-consumed): `ProbeQuestion.gapId`/`gapLabel` + `SubmitProbeInput.gapId` now nullable. FE flagged in `.inbox`.
- **Lifecycle deletes**: `DELETE /curricula/:id` (cascade modules/topics/gaps/sources), `DELETE /subjects/:id` (cascade owned curricula). 404 on missing.
- Verified live (real Neon + OpenRouter): opener→discover→next-gap loop; both cascade deletes. typecheck clean, 67 core tests. Endpoint surface now ~27 (minimal-complete for the core loop).

## [2026-06-01] — capture-first curriculum + manual shaping (backend)
- **Capture = paste-first.** Architect extracts modules + OPTIONALLY topics from pasted text/links (trained knowledge to organize, no web browse). Web search deferred to the learning/probe phase, per user.
- **No gaps at capture.** Architect no longer emits gaps; gaps are user-only (Socratic discovery + `POST /gaps`) — honors "auto-gap rebuilds the debt loop". `curriculumPlanSchema` dropped gaps + the ≥1-topic/module rule (topics optional).
- **Shaping endpoints** (full manual control of the captured tree): modules — `POST /curricula/:id/modules`, `PATCH /modules/:id` (rename/reorder/status), `PATCH /curricula/:id/modules/order`, `DELETE /modules/:id` (cascade); topics — `POST /modules/:id/topics`, `PATCH /topics/:id` (rename/re-depth/reorder/**move via moduleId**/skip/status), `PATCH /modules/:id/topics/order`, `DELETE /topics/:id` (cascade). Ordering = pure core deriver (`nextOrder`/`assignOrders`), unit-tested.
- Reverted the no-source web-research path added earlier same day (deleted `web-research.ts`); `CURRICULUM_MODEL=gpt-4o-mini` kept (cheap + strict structured output; needs `.nullable()` not `.optional()`).
- Verified live (real Neon + OpenRouter): capture (pasted text → modules, no gaps) + every shape op (add/rename/move/reorder/delete on modules & topics, zero-topic modules, 404/400 paths). shared/core/api typecheck clean, 67 core tests. Local dev needs `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"` (Node Happy-Eyeballs IPv6 issue to AWS/Neon, not a firewall).

## [2026-05-31] — daily-push cron + API service in IaC
- Added to `infra/index.ts` (Pulumi, source of truth): a `post-anki-api` Cloud Run service (own SA `post-anki-api`, port 8030, min0/max1, allUsers invoker + app-level `API_SHARED_SECRET` gate), an `api.postanki.ilya.online` DomainMapping, and a **Cloud Scheduler job `post-anki-daily-push`** that GETs `https://api.../daily-push` daily (config: `dailyPushSchedule` default `0 8 * * *`, `dailyPushTimeZone` default `Europe/Warsaw`, bearer from secret `apiSharedSecret`). Enabled `cloudscheduler.googleapis.com`. Syntax-validated via esbuild (infra is a standalone package, deps installed only in CI).
- This closes the daily-push "cron trigger" item at the IaC level: selection endpoint (app) + scheduler (infra) both exist.

## [2026-05-31] — API deploy pipeline (Dockerfile + CI job)
- Correction: `deploy.yml` was NOT a skeleton — it fully builds/pushes/migrates/deploys/health-checks the bot. Added the parallel **`deploy-api`** job: `npm ci` → API migrations (`db:migrate -w @post-anki/api`) → build `apps/api/Dockerfile` → push → `gcloud run deploy post-anki-api` (port 8030, env DATABASE_URL/OPENROUTER_API_KEY/CURRICULUM_MODEL/API_SHARED_SECRET) → `/healthz` gate at `PROD_API_DOMAIN`. Needs `test` + `infra` first. YAML parse-verified (4 jobs: test, infra, deploy, deploy-api).
- New `apps/api/Dockerfile`: root-context multi-stage (API imports `@post-anki/shared`+`@post-anki/core`, so unlike the standalone bot it builds from repo root — `docker build -f apps/api/Dockerfile .`). Copies the three workspace package.jsons, `npm ci --workspace @post-anki/api --include-workspace-root`, runs via tsx.
- New required CI config for the API: vars `PROD_API_DOMAIN`; secret `PROD_API_SHARED_SECRET` (reuses existing `PROD_DATABASE_URL`, `PROD_OPENROUTER_API_KEY`, `PROD_REGISTRY`, WIF). Pulumi config: secret `apiSharedSecret`, optional `apiDomain`/`dailyPushSchedule`/`dailyPushTimeZone`.
- TRULY remaining for a literal full-stack 100% (all need credentials/access I don't have here, none are code): a live `pulumi up` + first deploy run; an end-to-end create→parse→confirm→probe against real Neon + OpenRouter; the `ilya.online` DNS CNAME for `api.` subdomain; web BFF→real-HTTP wiring (FE agent owns those files); `apps/bot` Mastra 1.x rejoin.

## [2026-05-31] — curriculum re-parse + add-sources-and-merge (backend)
- `POST /curricula/:id/sources` (`AddSourcesInput`): adds new sources to an existing curriculum, async `202 curating` → background merge. The architect is fed the EXISTING module+topic titles and told to emit ONLY genuinely-new modules/topics; new modules are appended with an order offset so existing topics/gaps/progress are untouched. Empty result = nothing new, just back to `ready`.
- `POST /curricula/:id/reparse`: re-runs parse from the curriculum's existing sources (for retry after `failed`, or to regenerate). Clears the old module/topic/gap structure first, then full parse. `409 already_curating` if a parse is in flight.
- New `curriculumMergePlanSchema` allows zero new modules (base plan requires ≥1); `saveCurriculumPlan` gained an `orderOffset` param for append. Repo: `getCurriculumBasics`, `getCurriculumSourceDrafts`, `addCurriculumSources`, `existingStructureTitles`, `clearCurriculumStructure`, `countModules`.
- Fixed a stray duplicate import line in `curriculum.repo.ts` (introduced by a concurrent edit) that briefly broke the api build.
- These were the last two BACKEND-domain items from the coverage audit's "out of scope" list. Remaining out-of-scope items are genuinely non-backend: daily-push cron (needs the API deployed to Cloud Run first — only the bot service exists in infra/), web BFF wiring (FE-owned), bot rejoin (Mastra 1.x upgrade), live-secrets end-to-end run (no DATABASE_URL/OPENROUTER_API_KEY here).

## [2026-05-31] — close FE contract hole: GET /topics/:id/gaps
- FE flagged (OPEN-QUESTIONS) that the gap UI had no real data source — `GET /curricula/:id` returns topics without gaps and there was no list-gaps route. Added `GET /topics/:id/gaps` → `Gap[]` (404 if topic missing). FE gap checklist/declare/curate/progress now have a real source per topic.
- Deferred (not blocking): folding gaps into `CurriculumDetail` topics directly — the per-topic route is enough for the probe/gap UI; revisit if the tree view needs all gaps in one payload.

## [2026-05-31] — completing basic-level coverage: daily push, /decide, gap curation, cross-cutting
- **Gap declare/curate endpoints**: `POST /gaps` (user declares own gap, origin=user, auto-wanted) and `PATCH /gaps/:id` (skip/want/re-depth/re-tag concern). Wires the collaborative-curation model end-to-end.
- **Daily push**: `GET /daily-push` selects one gap across all *confirmed* curricula via pure `selectDailyPush` — wanted-first, then weakest (shallowest open), then a ≥90-day stale-covered `refresh`. Cron firing is infra (Cloud Scheduler → endpoint), not app code. `isStale` = opt-in staleness, never a penalty (honors no-passive-decay).
- **/decide mode**: `POST /decide` — opinion-first. Caller sends decision + their own opinion; the decide agent returns strengths/blindSpots/questions/verdict, engaging their reasoning rather than handing an answer (anti-AI-relay). Graceful 502 if evaluator down.
- **Cross-cutting concerns**: gaps carry a nullable `concern` (security/performance/observability/cost/reliability/developer_experience); architect + mentor-eval tag them; `GET /cross-cutting` rolls them up across confirmed curricula via pure `summarizeConcerns`. New DB column `gaps.concern`.
- All selection/rollup logic is pure `@post-anki/core` (`daily-push.ts`, `concern.ts`) with unit tests (65 core tests total). New entity folders `push/`, `decide/`, `concern/`. Backend now covers every `.product` doc at least at basic level — see `.product/BACKEND-COVERAGE.md`.

## [2026-05-31] — confirm gate: creation before probing
- New curriculum status `confirmed` after `ready`. Lifecycle: `draft → curating → ready → confirmed` (+ `failed`). `ready` = AI finished parsing; `confirmed` = the USER reviewed/curated (opt in-out topics, set depth, skip/declare gaps) and accepted it.
- `POST /curricula/:id/confirm` transitions `ready → confirmed` (idempotent if already confirmed; `409 not_ready` otherwise, `404` if missing).
- Both probe endpoints now REFUSE until confirmed: `startProbe`/`submitProbe` check the topic's curriculum status and return `409 not_confirmed` unless `confirmed`. So probing can only begin once creation is locked in. Smoke-verified routes reached + auth + 404 for unknown.
- Rationale (user): "curriculum creation should come first, then probing starts only after the curriculum is confirmed" — prevents probing a half-curated structure the user hasn't agreed to.

## [2026-05-31] — FE gap-curation parity with BE (web UI)
- Brought FE up to the BE gap model: gaps gain `origin` (ai|user), `status` adds `skipped`, and a `wanted` flag (FE keeps `status`; BE uses `state` — map at reconcile).
- New FE actions mirroring BE `declareGap`/`curateGap`: user can **add their own gap** (origin user, auto-wanted), **skip** a gap, **want** a gap. Skipped gaps leave scope (excluded from mastery), can't be resurrected; probing serves **wanted gaps first**.
- Verified live 2026-05-31: declare → "yours"+★ and counts into scope; skip → struck + leaves scope + recomputes %; typecheck + console clean.
- STILL diverging FE↔BE (reconciliation backlog): (1) BE create is async `202 curating → ready/failed`; FE create is sync + manual "Draft with the mentor", no `failed` state. (2) BE now has live probing endpoints `POST /topics/:id/probe[/answer]` with `ProbeEvaluation`; FE probe uses its own `getNextQuestion`/`recordAttempt` mock shapes. (3) Depth enum: FE `aware` vs BE `awareness`. (4) BE topic detail still carries `questions[]`; FE is gap-based.

## [2026-05-31] — probing session (live Socratic loop) in the backend
- Two new endpoints: `POST /topics/:id/probe` (start — picks the next open gap via `nextGapToProbe`, asks the mentor to generate ONE question in the chosen mode) and `POST /topics/:id/probe/answer` (submit — evaluates the answer, updates gaps + progress, returns the next question). Smoke-verified 400/401/route-reached.
- Mode is the user's per-session choice (`socratic` | `quick_test`) — the subway/voice context switch, never an auto-default.
- Two Mastra agents (`mentor-ask`, `mentor-eval`) on the same OpenRouter model; both use native structured output (no tools → reliable on Gemini 2.5). Ask emits {prompt, options, correctAnswerIndex}; eval emits `ProbeEvaluation` {verdicts, newGaps, nextPrompt}.
- Honest+generous evaluation wired live: eval can mark the probed gap AND any other open gap the answer covered in passing (no re-probing known material), can discover new in-scope gaps (never deeper than the depth ceiling), and ids are filtered to the gaps actually sent (no invented ids). All gap-state math is the pure `@post-anki/core` derivers (`applyGapVerdicts`/`progressFromGaps`/`openGaps`); the service only does IO + LLM.
- Topic learningStatus auto-advances on answer: `probing` while open gaps remain, `reviewing` once in-scope gaps are all covered (mastered). Manual override via PATCH still wins between sessions.
- Both agents degrade gracefully: LLM/parse failure → a sensible fallback question / empty evaluation, never a 500 to the client.
- New files: `packages/shared/src/probe.ts` (contract), `apps/api/src/probe/{probe.service,probe.controller,probe-question}.ts`, `apps/api/src/mastra/mentor.agent.ts`, `apps/api/src/gap/gap.repo.ts`, `apps/api/src/topic/topic-progress.repo.ts`.

## [2026-05-31] — learning status + gap curation in the backend contract
- `learningStatus` (`not_started → probing → going_deeper → skipping → reviewing → done`) is now in `@post-anki/shared` on topic, module, AND curriculum; DB columns on all three (`learning_status`, default `not_started`). Distinct axis from gap-based progress.
- Manual control endpoints: `PATCH /curricula/:id` and `PATCH /modules/:id` set learningStatus directly (the user re-steers / skips a dragging topic); `PATCH /topics/:id` already carried it. `skipping` ⇔ `included=false` kept in sync in the topic repo. Smoke-verified 400 on bad enum, route reached on valid.
- Module/curriculum learningStatus is **stored & manually set** (no auto roll-up) — manual override wins, matching the web decision. Core has `rollUpLearningStatus` helpers available if a computed view is ever wanted, but the API returns the stored value.
- Gap model gained collaborative curation: `origin` (`ai`|`user`), `state` adds `skipped`, `wanted` flag; derivers exclude skipped from scope/maturity, can't resurrect a skipped gap, and probe `wanted` gaps first. 49 core tests.
- LESSON: a parallel agent and this session both edited web `model.ts`/`store.ts`/`mock-data.ts` and collided (workflowStatus vs learningStatus); I then mistakenly overwrote web's richer model. Web's local model is the canonical FE contract and is intentionally decoupled — DO NOT rewrite it; only the parallel FE agent owns those files. Serialize edits across agents.

## [2026-05-31] — api curriculum slice 1 + package split
- Packages: `packages/shared` (Zod schemas = single source of truth) + `packages/core` (PURE derivers only — progress, recommendation, attempt, gap, depth; entity-first by folder, NO controllers/repos). Supersedes `packages/contract`. `apps/api` owns controllers + Drizzle repos + Mastra agent.
- Dependency direction: `shared` ← `core` ← `api`; `web` imports `shared` (`curriculum/model.ts` re-exports `@post-anki/shared`; vite `ssr.noExternal: ['@post-anki/shared']`). `core` never imports `api`. Web held the canonical contract first; on reconcile its model won and the old `apps/api/src/contract` stub was deleted.
- Real endpoints (were stub/501): `GET/POST /subjects`, `GET/POST /curricula`, `GET /curricula/:id`, `PATCH /topics/:id`. Auth = optional `API_SHARED_SECRET` bearer; `/healthz` open. Smoke-verified: 200/401/404/400 all correct.
- Create is async: `202 curating` → background parse → `ready`/`failed`. Backend fetches link/text itself (no agent tool) so the architect agent uses native structured output (reliable on Gemini 2.5).
- Architect emits modules+topics+gaps only, each gap+topic depth-tagged; NEVER questions (those are dynamic at session time).
- DB tables (subjects, curricula, sources, modules, topics, gaps) share the bot's Neon DB, isolated via `drizzle_migrations_api` ledger.

## [2026-05-31] — learning status + tree dashboard (web UI)
- New axis `learningStatus` per curriculum/module/topic: `not_started → probing → going_deeper → reviewing → skipping → done`. Distinct from gap-based progress (demonstrated) — this is the **activity/intent** the user steers manually.
- Stored + manually settable at every level (no auto roll-up — manual override wins; user wanted to re-steer/skip a dragging topic). `skipping` ⇔ `included=false` kept in sync.
- New `/dashboard` route: tree Subject → Curriculum → Module → Topic, each node a status dropdown; "Currently probing" banner points at the probing topic. Nav: Curricula | Dashboard.
- COLLISION resolved: a parallel agent added this as `learningStatus` in `store.ts` (with a roll-up) while this session added `workflowStatus` in `model.ts`/`mock-data.ts`; the repo broke. User chose `learningStatus`; I reconciled to it and dropped the roll-up. Lesson: serialize edits to `model.ts`/`store.ts`/`mock-data.ts` across agents.
- Still FE-only mock — `learningStatus` is NOT in `@post-anki/shared`; add to the contract at reconciliation.
- Verified live 2026-05-31: tree renders full hierarchy, manual topic status change persists + focus banner reacts, typecheck + console clean.

## [2026-05-31] — gap-driven model + depth ceiling (web UI)
- Drafting produces **modules (+ topics) only — NOT questions**. Questions are generated dynamically at probe time, targeting an open gap. Topic carries `gaps`, not a question list.
- A **gap** = a specific sub-point within a topic (status open/covered). Progress = gaps closed / in-scope gaps. Mastered = all in-scope gaps covered.
- Honest evaluation: an answer (often dictated, covering more than asked) checks off the asked gap AND adjacent gaps it demonstrably covers — so we never re-probe known material, only drill open gaps. (Stub covers asked + 1 adjacent; real multi-gap evaluation is the LLM's job.)
- **Depth ceiling** per topic (`targetDepth`: aware < working < deep): the bottom past which we don't dig ("what a socket is", not the electronics). Gaps deeper than the ceiling are parked out-of-scope — not probed, not counted. The mentor asks how deep; default `working`.
- Sources: multiple per curriculum, addable at creation AND on an existing curriculum; `link | text` now, `file` reserved/marked "soon".
- Verified live 2026-05-31: dynamic gap-targeted probe, "answer covered more → 2 gaps closed → mastered", depth dial re-scopes gaps + recomputes %, add-sources-to-existing, console + typecheck clean.

## [2026-05-31] — adaptive learning loop (web UI)
- Hierarchy gains a level: Curriculum → **Module** → Topic → Question (modules track progress; matches discussion.md "modules and topics").
- Questions have a **kind**: `socratic` (free-text, user self-marks pass/fail) or `quick_test` (multiple-choice, auto-graded). A topic can carry both; user picks one or multiple to "poke" themselves.
- Progress = per-topic `maturity` 0–100 + status (not_started/in_progress/mastered); pass +25, fail −15. Module & curriculum progress = avg maturity over included topics. Aligned to the engineer's `progress.ts`.
- "Smart next step" = recommend the weakest included topic (lowest maturity, tiebreak lowest self-grade) — this is how self-grade is "taken into account".
- AI-guided creation = a draft (no modules) shows "Draft with the mentor" → stub generates modules/topics/questions, status draft→curating. Real generation is the other engineer + Mastra.
- DECOUPLING: web wires off a **local mock model** (`apps/web/src/curriculum/model.ts` + `mock-data.ts`), NOT the shared `@post-anki/api` contract — because the other engineer is actively authoring that contract + the endpoints. Web's `stub/store.ts` is the seam. Reconcile web-local types → contract at integration (the local progress shape already matches their `progress.ts`).
- Verified live 2026-05-31: AI-draft, Socratic + quick-test probes, maturity/status updates, per-module + overall progress bars, recommendation shift, console clean, web typecheck clean.

## [2026-05-31] — monorepo structure
- Repo = npm workspaces. `apps/{bot,api,web}`. `infra/` stays standalone (own lockfile, separate CI install).
- Shared Zod schemas live INSIDE `apps/api` (`src/contract`, exported as `@post-anki/api`) — one package owns the contract AND its implementation. No separate `packages/contract`. Consumed via `ssr.noExternal: ['@post-anki/api']` in web. `src/server.ts` is the runtime entry, never imported by the browser.
- `apps/api` = stub now (mock reads, 501 mutations); a separate engineer implements real domain logic against the contract.
- Bot deps broken: `@mastra/memory`/`@mastra/pg` have no `0.20.x` (Mastra reset to `1.x`). So `apps/bot` is temporarily OUT of the `workspaces` array (set to `["apps/api","apps/web"]`) to keep install/CI green; flip back to `["apps/*"]` after the bot's Mastra upgrade.
- Verified 2026-05-31: web boots, both screens render (subjects/curricula + topic builder with opt-in/out, 1–5 self-grade, questions), stub mutation loop works, console clean.
- `apps/web` BFF: server functions hit an in-memory `stub/store.ts` seeded from contract mocks — the seam that swaps to real HTTP `apps/api` calls later.
- Bot moved root → `apps/bot` (untracked/greenfield, so safe). Dockerfile pnpm→npm, build context `apps/bot` (standalone). Root-context build deferred until bot imports `@post-anki/contract`.
- Auth deferred: single hardcoded user, no login (web draft only).

## [2026-05-31] — web UI + boundary
- Rendering layer = TanStack Start (React SSR, Vite + Nitro). Its own Node process.
- Node domain backend (grammY + Mastra + Drizzle/Postgres) stays the source of truth.
- Boundary = API (option A): Start calls the domain service over HTTP; its server functions are a thin BFF. No direct DB access from Start.
- Rationale: Telegram is a future client too — both faces (web + TG) consume one shared domain API, avoiding logic drift.

## [2026-04-19] — vocabulary
- Atom and Concept are the same construct — "atom" is informal shorthand; "concept" is the canonical term.

## [2026-05-23] — deployment + stack
- Deploy = GCP Cloud Run (europe-west1), webhook, min=0/max=1, GH Actions CI, secrets as env vars.
- Framework = Mastra; LLM via OpenRouter.
- Supersedes: Mac Mini deploy; long-polling (Decision 116).

## [2026-05-31] — deployment IaC (port bedtime-agent pattern)
- IaC = Pulumi (`infra/`, ESM), state in `gs://post-anki-pulumi-state` (versioned, in `post-anki`).
- **Single project `post-anki`** (number 690573462691) holds everything — state bucket, registry, Cloud Run, WIF, domain. Collapsed from the planned bootstrap+`post-anki-prod` split because the billing account is at its 5-project cap; only one new billed `post-anki*` project was possible. `post-anki-prod` created then deleted.
- Keyless CI auth via WIF: pool `github` + OIDC provider `github-actions` (pinned to `ikushlianski/post-anki`), CI SA `github-ci@post-anki.iam.gserviceaccount.com` (owner). No SA JSON key.
- Pulumi owns registry + runtime SA + Cloud Run shell + DomainMapping; `gcloud run deploy` owns image + env vars (`ignoreChanges: template`).
- Webhook domain `postanki.ilya.online` via Cloud Run DomainMapping (no load balancer; europe-west1 supports it).
- "Near-zero infra" = runtime footprint (min=0 + Neon serverless), not minimal Pulumi code.
- CI = test → pulumi up → migrate → build → deploy → /healthz gate. Bootstrap: `docs/ci-cd/gcp-setup.md`.
- Caveat: state co-located with app project (versioned bucket mitigates); future `post-anki-dev` needs a freed billing slot or quota increase.

## [2026-05-24] — slice-1 persistence
- DB included in slice 1. Method = Socratic only. Anki-style cards = future.
- DB engine = Neon serverless Postgres.
- DB owns: study profile + Mastra-managed conversation memory.
- Schema split: Mastra `Memory` (Postgres adapter) owns chat/working-memory tables; Drizzle owns `study_profile` and future domain tables.

## [2026-04-19]
- Both ingestion paths ship in Phase 1 — article is the core loop, docs path is structurally parallel.
- One atom store, two parent types — same Socratic mechanics for both; splitting stores doubles the codepath.
- Cadence = daily push + on-demand only — "immediate" is redundant with on-demand.
- Gap creation is user-only, supersedes PRD "Created by AI" spec — auto-logging recreates Anki guilt.
- Paste and link ingestion produce candidate atoms only — auto-gap from paste rebuilds the debt loop.
- ~~Deployment = local Mac Mini + Telegram bot~~ — SUPERSEDED 2026-05-23.
- Phase 2 scope = web dashboard + gap map + cross-cutting tracking + dismissed-gap nudge system — contingent on Phase 1 phase gate.
- Phase 3 scope = ecosystem scanner (GitHub/RSS for stack updates) + /decide judgment mode — contingent on Phase 2 phase gate.
