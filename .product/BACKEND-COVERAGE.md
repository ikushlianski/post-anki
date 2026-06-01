# Backend coverage audit

Maps every product doc to what the backend (`packages/shared`, `packages/core`, `apps/api`) covers today. Status: **Covered** (built + tested) · **Modeled** (schema/derivers exist, endpoint/agent not wired) · **Deferred** (out of scope, with reason).

**Verification (2026-05-31):** 4/4 workspaces typecheck clean · 61 core unit tests pass · server boots and all 17 routes respond (smoke-tested: 200 health, 401 auth gate, 404 unknown, 400 validation, 500 at DB layer with no real Postgres, 502 graceful agent-down). Endpoints: subjects/curricula CRUD + confirm, PATCH learningStatus ×3 levels, `GET /topics/:id/gaps`, `POST /gaps`, `PATCH /gaps/:id`, `POST /topics/:id/probe[/answer]`, `GET /daily-push`, `POST /decide`, `GET /cross-cutting`.

## Learning status (tree dashboard)
- `learningStatus` per topic/module/curriculum (`not_started/probing/going_deeper/skipping/reviewing/done`) → **Covered** in contract + DB + manual-set endpoints (`PATCH /curricula/:id`, `/modules/:id`, `/topics/:id`). This is the activity axis the user steers from the tree dashboard. The dashboard *UI* (tree view) lives in `apps/web` (FE agent); the backend exposes the read (`CurriculumDetail`) + the per-node status writes it needs.

## VISION.md
- "Tracks what you don't know through gaps" → **Covered** (gap model in `shared/gap.ts`, derivers in `core/curriculum/gap.ts`).
- "Discovered in Socratic conversation" → **Covered** — `POST /topics/:id/probe` + `/probe/answer` run the live loop: mentor-ask generates one question, mentor-eval judges the answer, gaps move covered/open, new gaps get discovered, progress + learningStatus advance. Both modes (socratic / quick_test) supported.
- "Daily push of a question on your own tools/reading" → **Covered (selection).** `GET /daily-push` picks the day's gap across all *confirmed* curricula (wanted-first, then weakest, then a stale ≥90-day refresh) via `selectDailyPush`. The cron trigger itself is infra (Cloud Scheduler → this endpoint); the selection logic + endpoint are done.
- "Architectural judgment, not recall" → **Covered** at the data level (topics/gaps are judgment-framed; architect prompt forbids syntax/trivia).

## PRINCIPLES.md
- **Gaps are discovered, never declared** → **Covered as collaborative curation.** Architect proposes candidates; conversation marks them covered/open (`/probe/answer`); the user can also `POST /gaps` (declare own), `PATCH /gaps/:id` (skip/want/re-tag). Nothing auto-accumulates as silent debt. See "Potential tensions" #1.
- **Maturity moves only on interaction** → **Covered.** `deriveTopicStatus`/`gapMaturity` change only on attempts/verdicts; nothing decays on a timer. The 90-day staleness signal is *opt-in* (drives the daily-push `refresh` reason via `isStale`), never a penalty.
- **Architecture judgment over recall** → **Covered** in the architect + mentor + decide prompts and gap framing.
- **One question at a time** → **Covered** — `/probe` emits exactly one question per call; the backend never returns a battery.
- **Calibrated to the senior developer** → **Covered** via the depth ceiling (`awareness`/`working`/`deep`, default `working`) + architect prompt targeting a senior who codes with AI.
- **Self-hosted and personal** → **Covered.** No accounts, no user table, no per-user scoping; single optional shared-secret bearer (`API_SHARED_SECRET`), not multi-tenant auth.
- **Progress visible but not gamified** → **Covered.** Progress = maturity %/status only; no streaks, points, or badges in the schema.

## REJECTED.md (must NOT be present)
- **Spaced-repetition scheduling** → **Honored.** No intervals, due-dates, or review queue anywhere in the schema.
- **Manual card/knowledge creation** → **Honored.** User creates subjects/curricula and supplies *sources*; the AI derives structure. No card/entry authoring endpoint.
- **MCQ quizzes as primary mode** → **Honored, with care.** `quick_test` exists only as an optional peer of `socratic` (the product explicitly allows it as a secondary self-check). It is never the core loop and is never auto-generated as the default probe.

## HYPOTHESES.md (active — backend enables testing them)
- "Socratic surfaces gaps more honestly than self-assessment" → **Enabled.** `selfGrade` is stored as a soft hint, deliberately separate from gap state, so the system can later compare claimed vs demonstrated knowledge.
- "Daily low-friction prompts sustain engagement" → **Enabled.** `GET /daily-push` produces the one low-friction prompt; engagement data can be measured off probe attempts.
- "Judgment trained through repeated tradeoff-reasoning" → **Enabled** (gap/depth model; probing slice exercises it).
- "Senior needs gap discovery over content delivery" → **Covered** — the system delivers no content, only structure + probes.

## GLOSSARY.md
- Subject, Curriculum, Source, Module, Topic, Gap, Depth → **Covered** (all in `packages/shared`, canonical). Tool/Concept remain Phase-1b bot vocabulary, unchanged.
- **Daily push** → **Covered** (`GET /daily-push`). **Quiz mode** & **Discussion mode** → **Covered** as the two probe modes (`quick_test` / `socratic`) on `/probe`. **/decide mode** → **Covered** (`POST /decide`, opinion-first decision pressure-test). **Cross-cutting concern** → **Covered** — gaps carry a `concern` (security/performance/observability/cost/reliability/developer_experience); `GET /cross-cutting` rolls them up across confirmed curricula.

## SCENARIOS.md
- File is empty (only a header). Nothing to cover; **N/A**.

## INBOX.md
- "adaptive: speed / detail level / hinting on/off, saved per deck/concept" → **Covered (2026-06-01).** `speed` (slow/normal/fast = probing pace) + `hinting` (on/off) live on the curriculum (deck), settable via `PATCH /curricula/:id`, and both feed the mentor-ask prompt. "Detail level" = depth: per-topic ceiling (the 3-level slider) via `PATCH /topics/:id` + a deck-level `defaultDepth`. Migration `0001`.

## OPEN-QUESTIONS.md
- The api-curriculum-slice section already enumerates every deferred item (probing endpoint, gaps-in-detail, re-parse/merge, conversational depth-asking, web BFF wiring, bot rejoin). Kept in sync with this audit.

## Potential tensions (flagged honestly)
1. **Parse-time gaps — RESOLVED as collaborative curation.** The model is layered: (a) the architect proposes *candidate* gaps by probing every module/topic at a high level; (b) the user steers — confirm, flag `wanted` ("hot, I want this"), or `skipped` ("too detailed, don't probe/count this"); the user can also `declare` their own gap. The AI may argue back with facts, but the user decides. This is neither AI-auto-logging (the rejected failure mode — nothing accumulates as silent debt) nor pure user-only; it honors the principle's *intent*. Encoded in schema: `origin` (`ai`|`user`), `state` adds `skipped`, `wanted` flag. Derivers: `skipped` gaps are excluded from scope/maturity and can't be resurrected by a verdict; `nextGapToProbe` surfaces `wanted` gaps first.
2. **`quick_test` as a first-class schema peer — RESOLVED.** Quiz is not a demoted MCQ-as-default; it is a **context-switched input mode**: Socratic (voice/free-text) when the user can talk, quick_test (taps) when they're in public with ~5 min and can't. Both are first-class, chosen by *situation*, not by effort. The schema's equal treatment of the two kinds is therefore correct. REJECTED's concern was MCQ-as-the-core-learning-loop; that's still honored because quiz never auto-replaces Socratic — the *user* picks the mode for the moment. The probing endpoint must let the user choose the mode per session, never default to quiz.

## Status: basic-level coverage of all product docs reached
Every product doc is covered at least at the basic level. Built across slices: subjects/curricula CRUD, async AI parse → modules/topics/gaps, depth ceilings, collaborative gap curation (declare/curate/skip/want), confirm gate, live probing (socratic + quick_test), learning-status steering, daily-push selection, `/decide`, and cross-cutting-concern rollup. 65 core unit tests; all four workspaces typecheck.

### Now also built (closing the backend-domain items)
- **Curriculum re-parse** — `POST /curricula/:id/reparse` (retry after `failed`, regenerate from existing sources).
- **Add-sources-and-merge** — `POST /curricula/:id/sources` (architect appends only genuinely-new modules/topics; existing progress untouched).
- **Read a topic's gaps** — `GET /topics/:id/gaps` (closed the FE data-source hole).

### Capture + shape (the create→curate flow)
- **Capture is paste-first, no web, no gaps.** `parseCurriculum` extracts MODULES and OPTIONALLY TOPICS from the user's pasted text/links (trained knowledge to organize, grounded in what was pasted). It does NOT browse the web and does NOT emit gaps — honoring DECISIONS "gap creation is user-only / auto-gap rebuilds the debt loop." Gaps emerge later: Socratic probe discovery + user-declared `POST /gaps`. Web search is deferred to the learning phase (probe-time grounding), not capture.
- **Topics are optional.** A module may have zero topics (`curriculumPlanSchema` no longer requires ≥1 topic/module). Capture splits into topics only when the material has distinct sub-areas.
- **Manual shaping endpoints** (full structural control over the captured tree):
  - Modules: `POST /curricula/:id/modules` (add), `PATCH /modules/:id` (rename / reorder / learningStatus), `PATCH /curricula/:id/modules/order` (bulk reorder), `DELETE /modules/:id` (cascades its topics + gaps).
  - Topics: `POST /modules/:id/topics` (add), `PATCH /topics/:id` (rename / re-depth / reorder / **move to another module** via `moduleId` / include-skip / learningStatus), `PATCH /modules/:id/topics/order` (bulk reorder), `DELETE /topics/:id` (cascades gaps).
  - Ordering is a pure `@post-anki/core` deriver (`nextOrder`, `assignOrders`) with unit tests; repos do IO only.

### Learning loop cold-start + lifecycle deletes (2026-06-01)
- **Probe cold-start.** A freshly captured curriculum has no gaps (gaps are user-only / Socratic-discovered). `startProbe` now opens with a topic-level question (gapId=null) instead of erroring; the first answer makes mentor-eval discover the initial gaps, and probing proceeds gap-by-gap from there. This is what makes the capture→confirm→learn loop actually close. `ProbeQuestion.gapId`/`gapLabel` + `SubmitProbeInput.gapId` are now nullable (FE-consumed change, flagged in `.inbox`).
- **Lifecycle deletes.** `DELETE /curricula/:id` (cascades modules→topics→gaps + sources) and `DELETE /subjects/:id` (cascades all owned curricula). Completes basic create/shape/remove lifecycle. 404 on missing.
- Verified live (real Neon + OpenRouter): 0-gap topic → opener → answer → 2 gaps discovered → next question on a real gap; curriculum + subject cascade deletes confirmed (404 after).

### Model (decided)
- **`CURRICULUM_MODEL=openrouter/openai/gpt-4o-mini`** — cheapest model ($0.15/$0.60 per M) that *enforces* strict structured output; ~3–4× cheaper output than Gemini 2.5 Flash. Used by architect (capture) + mentor (probe) + decide.
- **OpenAI strict-mode constraint:** strict structured output requires *every* schema property in `required`; express optionals as `.nullable()`, never `.optional()`. All agent-output schemas comply. (For later: OpenRouter's server-side `web_search` tool silently drops `response_format`, so probe-time web grounding will need a two-pass split — search then structure.)

### Genuinely NOT backend-domain (cannot be built/verified here)
- **Daily-push cron trigger** — the *selection* endpoint (`GET /daily-push`) exists and is tested; firing it daily needs the API deployed to Cloud Run (only the bot service exists in `infra/` today) + a Cloud Scheduler job. Writing that IaC now would point at a nonexistent service.
- **`apps/web` BFF → real HTTP wiring** — owned by the FE agent; backend contract + typed client are ready.
- **`apps/bot` rejoin** after its Mastra `1.x` upgrade (separate app).
- **Live-secrets end-to-end run** — DONE against real Neon (`cool-night`) + OpenRouter. Capture→shape verified live: pasted text → 2 modules (no gaps), then add/rename/move/reorder/delete on modules AND topics, optional (zero-topic) modules, 404 on missing, 400 on empty title — all correct. Earlier: full create→confirm→probe passed; all four agents structure on gpt-4o-mini. LOCAL-DEV: node-postgres→Neon needs `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"` on this Mac (Node Happy-Eyeballs mishandles the IPv6→IPv4 fallback to AWS); without it the pg connect times out. Not a firewall.
- **Adaptive speed / hinting toggles** (INBOX) — UI-preference layer, not backend domain.
- **Auth beyond the single shared-secret** — single-owner by design (PRINCIPLES: self-hosted/personal).
