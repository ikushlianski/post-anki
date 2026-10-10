---
type: spec
branch: learn-from-doc-site
task: F-basic — basic front/back card variant (item 8)
complexity: complex
state: confirmed
updated: 2026-10-10
---
# Spec: F-basic — basic front/back card variant

### Summary
Each knowledge bit gets a simple Anki-style card: a short question on the front and the plain fact on the back, written by a low-cost AI model with its own instructions. It is generated in the background, after a paste and by a new 5-minute backstop job, in the same claim-first, retry-capped way as the existing why-question and fill-in-the-blank cards. Anki review then serves this card first for each bit. The typed, AI-graded mode never uses it, because that mode's grading rules exist only for the other two card types. The approval page labels every card by type so the reviewer can tell them apart.

### The ask
> Item 8: "Add simple front/back basic-card variant for plain recall facts".
>
> Binding architecture is .planning/classic-anki-review/brief.md:
> - knowledgeBitQuestionVariantKindSchema gains "basic".
> - A new cheap-tier LLM generator agent writes one front/back card per bit, through a claim-based generation scan that follows the existing wh-question and fill-blank claim/scan pattern.
> - It gets a new POST scan endpoint and one new Cloud Scheduler job in infra/index.ts.
> - The after-paste kick orchestrator gains the basic pass.
> - The typed queue excludes kind basic.
> - The Anki queue prefers basic > fill_in_the_blank > wh_question, one card per bit.
> - The approval page renders basic variants.
> - e2e-local/mock-openrouter must handle the new prompt.
>
> Read apps/api/src/mastra/knowledge-bit-question-generator.agent.ts. Its prompt says the questions are deliberately not Anki flashcards, so the basic generator needs its own prompt.

Binding architecture: `.planning/classic-anki-review/brief.md`. Row source: `.planning/classic-anki-review/breakdown.md` (F-basic, task 8). Prerequisites are assumed built: F-core (`.planning/classic-anki-review/01-anki-review-core/spec.md`), F-queue (`.planning/classic-anki-review/02-due-queue/plan.md`, not written yet, so the brief is assumed), F-kick (`.planning/classic-anki-review/04-after-paste-pipeline-kick/`, not written yet, so the brief is assumed), and the F-approval todos.

### Footprint
Every repo-root path created (C) or edited (E). `00NN_<generated>` is the next free migration number, which drizzle-kit assigns. F-core took 0083, and F-queue and F-session each own one migration before this one, so it is expected to be 0086. Paths marked † are outside the breakdown's footprint, and the reason is given in "Files to modify".

- C `apps/api/src/db/migrations/00NN_<generated>.sql`
- C `apps/api/src/db/migrations/meta/00NN_snapshot.json`
- E `apps/api/src/db/migrations/meta/_journal.json`
- E `apps/api/src/db/schema.ts`
- E `apps/api/src/db/migrations.integration.test.ts` †
- C `apps/api/src/mastra/knowledge-bit-basic-card-generator.agent.ts`
- C `apps/api/src/mastra/knowledge-bit-basic-card-generator.agent.test.ts`
- E `apps/api/src/mastra/mastra.ts` †
- C `apps/api/src/knowledge-bit/knowledge-bit-basic-card-validation.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-basic-card-validation.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-variant-kind-rules.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-variant-kind-rules.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-basic-card-claim.repo.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-basic-card-claim.repo.integration.test.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-basic-card-generation.orchestrator.ts`
- C `apps/api/src/knowledge-bit/knowledge-bit-basic-card-generation.orchestrator.test.ts`
- E `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts`
- E `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts`
- E `apps/api/src/knowledge-bit/list-next-question-variants.integration.test.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts`
- E `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts`
- E `apps/api/src/knowledge-bit/topic-due.repo.ts` †
- E `apps/api/src/knowledge-bit/topic-due.repo.integration.test.ts` †
- E `apps/api/src/knowledge-bit/knowledge-bit.repo.ts` †
- E `apps/api/src/knowledge-bit/knowledge-bit.repo.integration.test.ts` †
- E `apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts` †
- E `apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.test.ts` †
- E `apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.controller.ts` †
- E `apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.controller.test.ts` †
- E `apps/api/src/router-table.ts`
- E `apps/api/src/router.ts`
- E `apps/api/src/api-server.ts`
- E `apps/api/src/router.test.ts` †
- E `packages/shared/src/knowledge-bit.ts`
- C `apps/web/src/knowledge-bit/knowledge-bit-variant-kind-label.ts` †
- C `apps/web/src/knowledge-bit/knowledge-bit-variant-kind-label.test.ts` †
- E `apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx`
- E `apps/web/src/knowledge-bit/knowledge-bit-review-panel.test.tsx` †
- E `infra/index.ts`
- E `docs/architecture/knowledge-bit/anki-review.md` †
- C `docs/architecture/knowledge-bit/variant-generation.md` †

Breakdown paths that are **not** touched: `apps/web/src/curriculum/api-client.ts` (decision D9) and `e2e-local/mock-openrouter/` (decision D10, verify only).

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `validateBasicCard` in `apps/api/src/knowledge-bit/knowledge-bit-basic-card-validation.ts` | raw `{front, back}` from the model | `{ok: true, front, back}` (trimmed) or `{ok: false, reason: "empty" \| "too_long" \| "same_text" \| "answer_on_front"}` | SCENARIO 1, 7, 10 |
| `ANKI_VARIANT_KIND_PREFERENCE` and `ankiVariantKindRank(kind)` in `apps/api/src/knowledge-bit/knowledge-bit-variant-kind-rules.ts` | variant kind | `0` for basic, `1` for fill_in_the_blank, `2` for wh_question | SCENARIO 3 |
| `TYPED_VARIANT_KINDS` and `isTypedVariantKind(kind)` in the same file | variant kind | `true` for wh_question and fill_in_the_blank, `false` for basic | SCENARIO 4 |
| `variantKindLabel(kind)` in `apps/web/src/knowledge-bit/knowledge-bit-variant-kind-label.ts` | variant kind | "Front / back", "Fill in the blank" or "Why question". It is an exhaustive switch, so a future kind fails `tsc`. | SCENARIO 2 |

`validateBasicCard` rules. Comparison uses trim, collapsed whitespace and lowercase.
- Either side is empty after trim: `empty`.
- The front is longer than 300 chars or the back longer than 600 chars: `too_long`.
- The normalized front equals the normalized back: `same_text`.
- The normalized back is at least 4 chars and appears inside the normalized front: `answer_on_front`.

### Generator agent (`apps/api/src/mastra/knowledge-bit-basic-card-generator.agent.ts`)
- The model tier is `tierToModelId("cheap")`, the agent id is `knowledge-bit-basic-card-generator`, the AGENT_KEYS entry is `knowledgeBitBasicCardGenerator`, and the `generateWithRetry` op is `knowledge_bit_basic_card_generation`. These mirror `apps/api/src/mastra/knowledge-bit-fill-blank-generator.agent.ts`.
- The prompt builder wraps the body in `<bit>…</bit>`, the same way as the sibling builders. The bit body is the only input.
- Output schema: `{front: string.min(1), back: string.min(1)}`, each with a `.describe()`.
- The instructions are its own. They do not reuse the wh-question prompt, which says it is "not a spaced-repetition flashcard drill" (`apps/api/src/mastra/knowledge-bit-question-generator.agent.ts:15-17`). Required content:
  - Role: write one classic Anki basic card for plain recall of the single fact in `<bit>`. The why-reasoning and fill-in-the-blank cards are made elsewhere, so this card does not probe the reasoning.
  - The untrusted-content paragraph, copied verbatim from the sibling agents.
  - Front: one short question or cue of 300 chars or fewer that the learner answers from memory. It must not contain the answer.
  - Back: the minimal correct answer to that front, based only on the bit, in 600 chars or fewer, as plain text with no markdown.
  - Exactly one card. Don't add facts that are not in the bit.
- The agent test mirrors `apps/api/src/mastra/knowledge-bit-fill-blank-generator.agent.test.ts`: the prompt builder wraps the body, the result schema accepts and rejects the right shapes, and invalid output throws `knowledge_bit_basic_card_generator_invalid_output`.

### Generation scan contract
- `POST /knowledge-bits/basic-card-generation-scan` takes no body. It returns 200 `{scanned, generated, failed, skipped}`, or 502 `scan_failed` with a message. Route name: `triggerKnowledgeBitBasicCardGenerationScan`. Auth goes through the existing `authorized()` gate (`apps/api/src/api-server.ts:288-316`).
- Orchestrator `generateKnowledgeBitBasicCards()`: `BASIC_CARD_GENERATION_CAP = 50`. For each bit it claims first, then calls the agent, then runs `validateBasicCard`. If the card is valid, it calls `recordGeneratedBasicCardVariant(bitId, "basic", 0, front, back, token)`, which inserts the card and marks the bit generated in one transaction. On any error it logs `knowledge_bit_basic_card_generation_failed` and calls `markBasicCardGenerationFailed`. A failure in that mark write is logged and the loop continues. This is a line-for-line mirror of `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:67-127`.
- The claim repo mirrors `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-claim.repo.ts` with the `basicCard*` columns:
  - `BASIC_CARD_GENERATION_MAX_ATTEMPTS = 3` and `BASIC_CARD_GENERATION_CLAIM_STALE_MINUTES = 10`. The claim token prefix is `bcgc`.
  - The candidate filter: not generated, not rejected, under the attempts cap, and claim empty or stale. Candidates are ordered by `createdAt` ascending.
  - The claim UPDATE re-checks every condition plus `body = expectedBody`.
  - Both mark functions throw `BasicCardGenerationClaimLostError` on 0 rows.

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | generator agent (+test), `mastra.ts`, `validateBasicCard` (+test), claim repo (+int test), generation orchestrator (+test), `knowledge-bit-pipeline-kick.orchestrator.ts` (+test), `packages/shared/src/knowledge-bit.ts` (kind enum), `schema.ts` + migration | None | None |
| SCENARIO 2 | None. The approval list and the PATCH variant edit are kind-agnostic (`apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:46-117`, `:119-194`). | `knowledge-bit-variant-kind-label.ts` (+test), `knowledge-bit-review-item.tsx`, `knowledge-bit-review-panel.test.tsx` | None |
| SCENARIO 3 | `knowledge-bit-variant-kind-rules.ts` (+test), `knowledge-bit-review-queue.repo.ts` (+int test) | None. The Anki card UI is kind-agnostic, and `anki-review.api.ts` parses with the shared enum. | None |
| SCENARIO 4 | `knowledge-bit-variant-kind-rules.ts`, `knowledge-bit-question-variant.repo.ts`, `list-next-question-variants.integration.test.ts`, `topic-due.repo.ts` (+int test), `grade-knowledge-bit-variant-answer.orchestrator.ts` and `.controller.ts` (+tests) | None | None |
| SCENARIO 5 | `knowledge-bit.repo.ts` (reset `basicCard*`), `knowledge-bit.repo.integration.test.ts` | None | None |
| SCENARIO 6 | claim repo candidate query (no approval filter beyond "not rejected"), orchestrator cap | None | None |
| SCENARIO 7 | `validateBasicCard`, generation orchestrator (+test), claim repo attempts cap (+int test) | None | None |
| SCENARIO 8 | claim repo (+int test: race, stale takeover, lost-claim rollback), existing partial unique index `knowledge_bit_question_variants_bit_kind_order_unique` (`apps/api/src/db/schema.ts:1203`) | None | None |
| SCENARIO 9 | `detect-knowledge-bits.controller.ts` (+test), `router-table.ts`, `router.ts`, `api-server.ts`, `router.test.ts` | None | `infra/index.ts` (config key, job, export) |
| SCENARIO 10 | generator agent instructions (untrusted `<bit>` paragraph), `validateBasicCard`, agent test | `knowledge-bit-review-item.tsx` (React text only) | None |

(Backend paths are under `apps/api/src/knowledge-bit/` unless noted. Frontend paths are under `apps/web/src/knowledge-bit/`.)

### Files to create
```
apps/api/src/
  db/migrations/00NN_<generated>.sql              — ALTER TABLE knowledge_bits ADD 5 basic_card_* columns (generated)
  db/migrations/meta/00NN_snapshot.json           — generated
  mastra/
    knowledge-bit-basic-card-generator.agent.ts   — own plain-recall prompt, {front, back} schema, cheap tier
    knowledge-bit-basic-card-generator.agent.test.ts
  knowledge-bit/
    knowledge-bit-basic-card-validation.ts        — pure validateBasicCard
    knowledge-bit-basic-card-validation.test.ts   — one business case per rejection reason + happy path
    knowledge-bit-variant-kind-rules.ts           — Anki preference rank + typed-servable kinds (pure). If F-queue already owns an equivalent preference constant, move it here or extend it in place. One source only.
    knowledge-bit-variant-kind-rules.test.ts
    knowledge-bit-basic-card-claim.repo.ts        — list/claim/markGenerated/markFailed/recordGeneratedBasicCardVariant (~150 lines)
    knowledge-bit-basic-card-claim.repo.integration.test.ts
    knowledge-bit-basic-card-generation.orchestrator.ts
    knowledge-bit-basic-card-generation.orchestrator.test.ts
apps/web/src/knowledge-bit/
  knowledge-bit-variant-kind-label.ts             — exhaustive kind → label
  knowledge-bit-variant-kind-label.test.ts
docs/architecture/knowledge-bit/
  variant-generation.md                           — the three claim-based generation passes, kick + scheduler triggers
```

### Files to modify
```
packages/shared/src/knowledge-bit.ts              — enum gains "basic". Nothing else changes.
  used by: packages/shared/src/knowledge-bit-review.ts, packages/shared/src/index.ts, every KnowledgeBitQuestionVariantKind importer in apps/api
  tests: none in shared
apps/api/src/db/schema.ts                         — knowledge_bits: basicCardGeneratedAt, basicCardGenerationFailedAt, basicCardGenerationAttempts (int not null default 0), basicCardGenerationClaimedAt, basicCardGenerationClaimToken. Update the variants-table comment to list the "basic" kind. No change to other tables.
  used by: all repos
  tests: apps/api/src/db/migrations.integration.test.ts
apps/api/src/db/migrations.integration.test.ts    — † add the 5 column rows next to the fill_blank rows (:570-605)
apps/api/src/mastra/mastra.ts                     — † AGENT_KEYS.knowledgeBitBasicCardGenerator + registration. A new agent has no other registration point.
  used by: ~40 orchestrators/services (registry only)
  tests: agent tests mock getMastra
apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts — add handleTriggerKnowledgeBitBasicCardGenerationScan (same shape as :102-118). 192 → ~212 lines.
  used by: apps/api/src/api-server.ts
  tests: apps/api/src/knowledge-bit/detect-knowledge-bits.controller.test.ts (add 200 + 502 cases)
apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts — (created by F-kick) append the basic pass after fill-blank, using the same per-pass error isolation F-kick uses. Do not change the coalescing.
  tests: its co-located test (assert the basic pass runs, and a basic failure doesn't fail the kick)
apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts — listNextQuestionVariantsToAnswer adds inArray(kind, TYPED_VARIANT_KINDS) to both the scoped and unscoped conditions (:158-160). Insert and embedding-scan functions are unchanged.
  used by: wh/fill claim repos, variant-embedding orchestrator, list-next controller
  tests: apps/api/src/knowledge-bit/list-next-question-variants.integration.test.ts (add: basic never served, in any scope)
apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts — F-queue's one-card-per-bit pick orders by ankiVariantKindRank. If F-queue already ranks "basic" first, the edit is to import the shared constant instead.
  used by: apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts
  tests: apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts (add: basic beats fill and wh; fill beats wh when no basic)
apps/api/src/knowledge-bit/topic-due.repo.ts       — † hasQuestionVariant (:30-40) adds inArray(kind, TYPED_VARIANT_KINDS). The due badge links to typed mode (apps/web/src/routes/index.tsx:201), and its own comment says it counts only what "the practice queue can ever actually serve".
  used by: apps/api/src/curriculum/curriculum.repo.ts, apps/api/src/topic/topic.controller.ts
  tests: apps/api/src/knowledge-bit/topic-due.repo.integration.test.ts (add: basic-only bit not counted)
apps/api/src/knowledge-bit/knowledge-bit.repo.ts  — † updateKnowledgeBitBody's cascade (:206-216) also nulls the 5 basicCard* columns (attempts → 0). Without this, an edited pending bit would never regenerate its basic card. 279 → ~284 lines.
  used by: edit, chat-draft and chat services, detect orchestrator
  tests: apps/api/src/knowledge-bit/knowledge-bit.repo.integration.test.ts (add a reset case like :320)
apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts — † after the approval check, return {ok:false, error:"kind_not_typed"} when !isTypedVariantKind(variant.kind), before any grader call
apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.controller.ts — † map kind_not_typed → 409
  tests: both co-located tests (add the refused-basic case; assert the grader mock was not called)
apps/api/src/router-table.ts, router.ts, api-server.ts — add the route after the fill-blank scan entry (router-table.ts:41-44, router.ts:16, api-server.ts:405-406)
  tests: apps/api/src/router.test.ts († append resolve case)
apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx — show variantKindLabel(variant.kind) above each variant's prompt/answer. For basic, prefix the lines "Front:"/"Back:". The editor, approve gate and test ids are unchanged. 274 → ~285 lines. If F-approval's bulk-approve edits push it past 300, split the variant row into its own component.
  used by: apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx
  tests: apps/web/src/knowledge-bit/knowledge-bit-review-panel.test.tsx († add a basic-variant fixture case)
infra/index.ts                                    — knowledgeBitBasicCardGenSchedule config key (default "*/5 * * * *") next to :46-47. New gcp.cloudscheduler.Job "knowledge-bit-basic-card-gen" (name post-anki-knowledge-bit-basic-card-gen), copied from :530-546 with the uri /knowledge-bits/basic-card-generation-scan. Export knowledgeBitBasicCardGenJobName. No other resource changes.
docs/architecture/knowledge-bit/anki-review.md    — † add the variant preference and the basic kind to the current-state narrative
```

### Data model changes
- `knowledge_bits` gets 5 nullable or defaulted columns: `basic_card_generated_at timestamptz`, `basic_card_generation_failed_at timestamptz`, `basic_card_generation_attempts integer not null default 0`, `basic_card_generation_claimed_at timestamptz`, `basic_card_generation_claim_token text`.
- `knowledge_bit_question_variants.kind` is `text` with no CHECK (`apps/api/src/db/schema.ts:1183`, and no migration references the kind values). The "enum change" is therefore Zod-only and needs no migration.
- Generate with `npm run db:generate:api` and apply with `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev npm run db:migrate:api`. The shell variable wins over the `--env-file` values, and `apps/api/scripts/migrate.ts:18-38` refuses non-local hosts outside CI. Never use `drizzle-kit push`.

### Risk & rollout
- **Blast radius:** the shared kind enum. F-core's Anki response parse (`anki-review.api.ts`) and the approval list accept "basic" only after this ships. Code reverted with basic rows still in the DB would make the Anki screen fail to parse. Rollback therefore also needs a generated data migration that supersedes basic rows. See architecture.md "Rollout".
- **Behaviour change for existing approved bits:** once their basic cards arrive, Anki review serves those cards (unreviewed, and following the preference rule) instead of the reviewed why or fill cards. Each bit keeps its schedule. See decision D3 and the todo review item.
- **Typed mode regressions:** the typed queue, the topic due counts and typed grading change only for kind basic. The existing typed tests must stay green unchanged.
- **Coordination:** the migration is applied by CI before the API deploys. The scheduler job is applied by the existing infra pipeline, depends on the API service, and needs no new secret. Don't deploy from here.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 1, 2, 3 | One real pasted technical article producing 6–8 pending bits, approved after its cards generate | Existing paste → kick/scan → approval flow, run locally. No checked-in knowledge-bit seed exists, and integration tests insert their own rows. |
| SCENARIO 6 | 2–3 approved bits that already have why and fill cards and at least one Anki grade, created before the migration is applied | Same flow on the pre-change build, then migrate and run the basic scan |

### Documentation changes
- knowledge-bit domain: update `docs/architecture/knowledge-bit/anki-review.md` (sections "What changes structurally" and "Data model evolution") with the basic kind, the one-card preference, and typed mode excluding basic.
- knowledge-bit domain: create `docs/architecture/knowledge-bit/variant-generation.md`. It describes the three claim-based generation passes, their markers and retry cap, the after-paste run, and the scheduled backstop jobs. No such doc exists today.

### Phase 3 — resilience and infra-security pass
- **LLM cost bound:**
  - One cheap-tier call per bit on success. The worst case is 3 attempts × 3 tries (`AGENT_GENERATE_RETRIES = 2`, `apps/api/src/mastra/generate-with-retry.ts:10`), which is 9 calls per bit over its lifetime. `basic_card_generated_at` is terminal, so a bit is never regenerated except after a pending-bit body edit.
  - Per run: at most 50 bits, so at most 150 calls in the worst case. Runs come from 12 scheduler ticks per hour plus coalesced kicks.
  - Rollout backfill: about one call per existing non-rejected bit, spread at 50 per run.
  - Steady state goes from 2 to 3 generation calls per bit.
  - Every call lands in `llm_call_events` under op `knowledge_bit_basic_card_generation`, which keeps cost observable.
  - Input is the bit body only. Bodies are not length-capped in any of the three generators. This is an existing gap, out of scope (D12). Output is capped by `validateBasicCard`.
- **Prompt injection from source text:**
  - The bit body comes from user-pasted, untrusted text. It is wrapped in `<bit>`, and the instructions carry the sibling agents' untrusted-content paragraph.
  - The agent has no tools. Output is structured `{front, back}` only, validated by Zod and `validateBasicCard`, and rendered as React text, never as HTML.
  - Pending bits are human-reviewed on the approval page. Backfilled cards for already-approved bits are not reviewed, which matches today's post-approval why and fill generation (D3).
- **Scheduler auth:**
  - The job sends `Authorization: Bearer <apiSharedSecret>`. That header is compared timing-safely in `authorized()` (`apps/api/src/api-server.ts:281-316`), and the route is not public. A test asserts 401 without a token.
  - Existing posture, unchanged: when `API_SHARED_SECRET` is unset, every route is open (`apps/api/src/api-server.ts:291-293`). This is assumed set in production.
- **Idempotent claims:**
  - The claim is an atomic conditional UPDATE with a token, written before the LLM call.
  - The card insert and the generated mark share one transaction, and a lost claim throws, which rolls back the insert.
  - Claims go stale after 10 minutes.
  - The partial unique index on (bit, kind, order) for active variants is the database backstop.
  - The scan endpoint takes no input, so replaying it is safe.
- **Runaway-loop risk:** the attempts cap of 3 ends retries. The kick's in-flight flag coalesces repeated pastes, and the scheduler does not retry, because no retryConfig is set, matching the sibling jobs.
- **Infra:** one scheduler job is added. It copies an existing resource shape from the same file and the same installed provider, so no external API contract changed and no docs lookup was needed. Pricing for one more job is an **assumption** (Cloud Scheduler bills per job per month beyond a small free allowance, which is negligible) and was not verified.

### Grill phase (self-run)
The grill-plan-ie red-team subagent could not be dispatched, because this session has no Agent tool, and AskUserQuestion is barred for this run. Grill-me ran as a self-critique. Findings, ranked by cost of being wrong:
1. Body-edit reset missing from the breakdown footprint. Without it, an edited pending bit keeps `basic_card_generated_at` set and never gets a new card. Adopted: `knowledge-bit.repo.ts` and its test (SCENARIO 5).
2. Topic due badges would count basic-only bits that typed mode can't serve, so a topic shows "N due" and serves nothing. Adopted: `topic-due.repo.ts` (SCENARIO 4).
3. A basic card posted straight to typed grading would pay for a grader call that has no rule for its kind. Adopted: refused with 409 before the LLM call (SCENARIO 4).
4. A rollback with basic rows in place breaks Anki parsing. Adopted: Risk and architecture Rollout name the data-migration step.
5. The local migrate script loads `apps/api/.env`, which points at production. Adopted: the explicit `DATABASE_URL` command, plus the script's existing remote-host guard.

### Decisions made autonomously
| # | Decision | Reason |
|---|---|---|
| D1 | Generate a basic card for every non-rejected bit, pending or approved | The brief says "one front/back card per bit". This mirrors the sibling candidate filter. |
| D2 | Order of the kick passes: detect, wh, fill-blank, basic | The brief lists them in that order. The scheduler covers any stall. |
| D3 | Already-approved bits get basic cards with no re-review, and Anki prefers them | The brief's preference rule, plus today's precedent of post-approval why/fill generation (`apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx:107-118` comment). Reversible: narrow the candidate filter to pending bits. |
| D4 | Input is the bit body only, without background | Mirrors the sibling generators. The background is shown after reveal in Anki. |
| D5 | Front ≤ 300 chars, back ≤ 600 chars, no identical sides, no answer on the front | Keeps basic cards short and recall-only. A violation counts as a failed attempt, like fill-blank's format check. |
| D6 | Claim code is a third mirrored copy, not a generic claim helper | Follows the existing pattern exactly. Refactoring the siblings is out of scope. |
| D7 | The preference and typed-kind rules live in one pure API module | One source for the Anki ranking, the typed exclusion, topic due and the grade guard. |
| D8 | The typed exclusion applies in every scope (unscoped, tag, topic, bit) | The brief says "the typed queue excludes kind basic" with no scope carve-out. |
| D9 | `apps/web/src/curriculum/api-client.ts` keeps its typed `NextQuestionVariant.kind` union unchanged | Typed mode never receives basic, so widening the union would be dishonest. |
| D10 | `e2e-local/mock-openrouter/` is unchanged and only verified | Its generic schema filler (`e2e-local/mock-openrouter/schema-fill.ts:62-64`) returns distinct strings for `front` and `back`, which pass `validateBasicCard`. A manual check is in todo.md. |
| D11 | The approval page shows a type label for all kinds, not only basic | "Renders basic variants" needs the reviewer to tell the types apart, and one label path is simpler. |
| D12 | No input length cap on the bit body | Matches the siblings. A cap would be a cross-generator change. |
| D13 | Typed grading of a basic card returns 409 `kind_not_typed` | Avoids a paid grader call with undefined semantics. 409 matches "valid id, wrong state". |
| D14 | The schedule config key defaults to `*/5 * * * *`, with the shared knowledge-bit time zone | The brief says 5 minutes, and this mirrors the sibling jobs. |
| D15 | Variant embedding still covers basic cards | The embedding scan is kind-agnostic today, and excluding basic would be an unasked change. |

### Implementation order
1. `validateBasicCard`: red-green-refactor, covers SCENARIO 7 and 10
2. `knowledge-bit-variant-kind-rules`: red-green-refactor, covers SCENARIO 3 and 4
3. `variantKindLabel` (web): red-green-refactor, covers SCENARIO 2
4. Shared enum gains "basic". Then `npx tsc --noEmit` per workspace, and fix any exhaustiveness fallout (SCENARIO 1)
5. Schema columns, `npm run db:generate:api`, apply to the local DB with the explicit `DATABASE_URL`, and the migrations test rows (SCENARIO 1, 8)
6. Generator agent, its test and its mastra registration (SCENARIO 1, 10)
7. Claim repo and its integration test, covering the race, stale takeover, lost-claim rollback, attempts cap, rejected exclusion and body mismatch (SCENARIO 7, 8)
8. Generation orchestrator and its test (SCENARIO 1, 7)
9. Body-edit reset and its test (SCENARIO 5)
10. Scan controller handler, RT3, router test and controller test (SCENARIO 9)
11. Kick orchestrator pass and its test (SCENARIO 1)
12. Read side: typed queue, topic due, grade guard and Anki preference, with their tests (SCENARIO 3, 4)
13. Approval item label and the panel test (SCENARIO 2)
14. `infra/index.ts` job and export. Then the docs. Then the gates: `npx tsc --noEmit` per workspace, `npm run depcruise`, `npm run check-no-dynamic-imports`, `npx vitest run` in api and web, and the integration tests for the claim, queue, topic-due, repo and migrations files. Run the manual checks in todo.md.

### Scope boundary
- Basic cards are not generated for card types other than one per bit (order 0 only).
- No refactor of the wh and fill-blank claim code into a shared helper.
- No input length cap on the bodies the generators receive.
- No UI to filter or hide basic cards in Anki review, and no per-kind settings.
- No change to typed-mode grading or follow-up prompts, beyond refusing basic.
- No change to Cloud Run CPU throttling or minScale (brief).
- No backfill throttling beyond the existing per-run cap.

### Consistency gate
Checks 1–4 pass. Every deriver names scenarios, every scenario has a files row, all scenarios are tagged `asked`, and Risk names real regressions. Checks 5–8, 10 and 13 pass: every scenario has an Acceptance block (pending), scenario coverage is complete, the todo manual steps are reflected in the implementation order and the Data model section, and the plan follows the constitution (derivers first, generated migration, IaC only). Check 9 passes with two docs in the knowledge-bit domain. Checks 11 (no BAML) and 12 (no research.md) do not apply. Plan confirmed.

END-OF-REPORT
