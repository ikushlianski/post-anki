---
type: spec
branch: check-my-writing-mode
task: Port "check my writing" freeform scoring to the English subject
complexity: medium
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/check-my-writing-mode/playwright.md
  stateFixtures: .planning/check-my-writing-mode/state-fixtures.md
---

# Spec: Port "check my writing" to the English subject

### What to do

On a `language-practice` subject, add a new page at `/practice/:subjectId/check-writing` where the
user pastes arbitrary English text (no reference translation — a Slack message, PR description,
email) and clicks Check. The text is graded by a new Mastra agent for native-soundingness, reusing
the existing `Verdict` scale (`Ok` 7-10 / `NeedsReview` 5-6 / `NeedsDeepDive` 0-4) already defined
in `packages/shared/src/practice.ts`, returning a 0-10 score, verdict, 1-2 sentences of feedback,
and 1-2 full rewrites of the *entire* text in natural native phrasing. The graded entry is
persisted to a new `writing_checks` table, scoped to the subject, and shown newest-first in a
history list on the same page that survives a full page reload via a plain REST GET (not Electric).

### Grading mechanism (decided)

- **New Mastra agent, not an extension of the existing `gradeBatch` agent.** `gradeBatch`'s prompt
  and schema (`apps/api/src/practice/practice-batch.schemas.ts`) grade an array of items, each
  against a `referenceEnglish` translation — freeform writing has no reference and is graded as one
  aggregate unit, not per-sentence. Reusing `gradeBatch` would mean threading a fake reference
  through a schema shape (`gradedAnswers: [...]`) that doesn't match a single-submission result.
  New agent `createWritingCheckAgent()` in a new file `apps/api/src/mastra/writing-check.agent.ts`,
  registered under a new `AGENT_KEYS.writingCheck` entry — **the existing 8 agent files and their
  instructions are never touched**, matching the standing reversibility constraint from
  `english-subject-merge` ("new agent files registered under new AGENT_KEYS entries alongside the
  existing ones — never edit the existing 7 [now 8] agent files or their instructions").
- **One aggregate score/verdict per submission**, not per-sentence — matches the wishlist's "get it
  scored" (singular) and the source app's own settled decision.
- **Rewrites are of the entire text**, not a single word/phrase fix — encoded in the agent's
  instructions and enforced by the schema (`nativeAlternatives: z.array(z.string()).min(1).max(2)`
  — always 1-2, unlike `gradeBatchSchema`'s unconstrained array which the mock stub sometimes
  returns empty for non-`Ok` verdicts; this agent's own prompt states rewrites are given "even when
  the score is high", so the schema enforces that as a hard floor of 1).
- **Same scoring bands as `gradeBatch`, reusing `verdictSchema` from `@post-anki/shared` directly**
  — no new scale invented.
- **Structured output via `agent.generate(prompt, { structuredOutput: { schema } })`**, the same
  mechanism every other Mastra agent in this codebase uses — not `experimental_output`, not tool
  calls. Model resolution goes through the existing shared `resolveAgentModel(env)` — no per-agent
  override.

### Data model (decided)

- **New table `writingChecks`**, mirroring `attempts`' shape (`id`, `subjectId`, `score`, `verdict`,
  `feedback`, `nativeAlternatives` as `jsonb.$type<string[]>()`, `createdAt`) but with `text`
  (the submitted content) in place of `attempts`' `phraseId` + `userAnswer` — there is no
  originating phrase, so forcing this through `attempts` would mean a nullable FK into `phrases`
  that never resolves for this row, which is semantically wrong.
- **Real Drizzle migration**, not the source app's ad-hoc `CREATE TABLE` — post-anki has a working
  migration pipeline (`npm run db:generate:api` → `npm run db:migrate:api`, 20 existing numbered
  `.sql` files under `apps/api/src/db/migrations/`, latest `0019`). The source app's own reasoning
  for going ad-hoc ("no migration tool exists in this repo") does not carry over; the *table shape*
  is what's ported, not that reasoning.
- **`subjectId` column, not present in the source app** — the source app is globally English-only;
  post-anki scopes everything language-practice under a `subjects.kind = 'language-practice'` row.
  No FK constraint from `writingChecks.subjectId` to `subjects.id` — matches this codebase's
  existing convention (grep-confirmed: no table in `schema.ts` FKs into `subjects`, including
  `phrases`/`attempts`/`phraseBankEntries`, all of which carry a plain `subjectId` text column).
- **No Electric sync.** The Phrase Bank panel (`apps/web/src/practice/phrase-bank-panel.tsx`)
  already established the precedent for a language-practice read surface that stays off Electric —
  explicit code comment citing "decision 9 in architecture.md" for that choice. Check-writing
  history has the same shape (a list, read on page load, invalidated after a local mutation, no
  cross-device live-sync requirement) and follows the same plain REST + react-query pattern:
  `queryOptions` + `useQuery` for `GET /subjects/:id/writing-checks`,
  `queryClient.invalidateQueries` after a successful submit. This also sidesteps the Electric-only
  read-path hang that `batch-practice-electric-fallback` (the wishlist item immediately before this
  one) just fixed for a different surface — no need to reintroduce that failure mode here.

### Route protection (no new surface to reason about)

Post-anki's auth is one global gate — `apps/api/src/server.ts`'s `authorized()`, called once in
`handleRequest()` before any route dispatch (checks `Authorization: Bearer <API_SHARED_SECRET>` or a
PAT). Every new endpoint (`POST`/`GET /subjects/:id/writing-checks`) inherits this automatically —
there is no per-route middleware to attach or forget, unlike the source app's per-server-function
`requireAdminMiddleware`. See `playwright.md`'s scenario triage for why this means the source app's
auth scenario (S3) does not port as its own scenario.

### Decisions made autonomously (no human present — see `discussion.md` for full reasoning)

1. **New agent file (`writing-check.agent.ts`), not appended to `language-practice.agent.ts`.**
   Mirrors the source app's own entity-first-separation reasoning for keeping `writing_check.baml`
   separate from `practice.baml`, adapted to Mastra's flat `*.agent.ts` file convention. Reversible
   — agent files are purely organizational.
2. **New repo file `writing-check.repo.ts`**, not added to the already-166-line `practice.repo.ts`.
   Matches this folder's existing precedent: `phrase-bank.repo.ts` is already a separate file from
   `practice.repo.ts` for a finer-grained entity within the same `practice/` folder, and keeps each
   file under this project's ~150-300 line guideline.
3. **New route `/practice/:subjectId/check-writing`, not a section on the existing
   `/practice/:subjectId` page.** That page already manages `BatchPractice`'s own
   generating/grading loading state plus the Phrase Bank panel; adding a third
   generating/grading-shaped surface (check-writing's own "Checking…" state) would recreate the
   exact UX collision the source app's own decision #4 explicitly avoided by choosing a separate
   route.
   **File name is `practice.$subjectId_.check-writing.tsx` (trailing underscore on
   `$subjectId_`), not `practice.$subjectId.check-writing.tsx`.** Checked:
   `practice.$subjectId.tsx`'s `PracticePage` component renders no `<Outlet/>` — a plain
   `practice.$subjectId.check-writing.tsx` would file-route-nest under it with nowhere to mount,
   and adding an `<Outlet/>` would put `BatchPractice`/`PhraseBankPanel` back on the same page
   above check-writing, defeating this decision's own reasoning. This codebase already has the
   exact precedent for a subject-scoped sibling route that opts out of nesting:
   `curriculum.$curriculumId_.assess.tsx` and `curriculum.$curriculumId_.stats.tsx` both use the
   trailing-underscore escape against `curriculum.$curriculumId.tsx` (also `<Outlet/>`-less) —
   same shape, same fix. `practice.$subjectId.tsx` itself is untouched by this route split.
   The new route's own loader reuses the identical `subject.kind !== 'language-practice' →
   notFound()` guard already proven in `practice.$subjectId.tsx`'s loader — copied, not new logic
   (required anyway, since the underscore escape means no shared layout to inherit the guard
   from), so no dedicated e2e scenario is added for it (see `playwright.md`'s "Not e2e" section).
   A nav link on `/practice/:subjectId` points to the new route (mirrors that page's existing
   "← All curricula" link pattern).
4. **Shared Zod additions land in `packages/shared/src/practice.ts`**, alongside the existing
   `verdictSchema`/`gradeBatchSchema` — a `submitWritingCheckInput` (`z.object({ text:
   z.string().trim().min(1).max(5000) })`, same length cap the source app applied, same reasoning:
   an unbounded textarea feeding an LLM call directly is a cheap, reversible guard) and a
   `writingCheckSchema`/`WritingCheck` type (`{ id, subjectId, text, score, verdict, feedback,
   nativeAlternatives, createdAt }`) for the persisted-row shape, shared verbatim between the POST
   response and each GET history-list row. Reused by both
   `apps/api` (request validation) and `apps/web` (typed API client), matching how
   `gradeBatchSchema`/`Verdict` are already shared today.
5. **No `architecture.md`.** Checked against the trigger list (new async boundary, new service,
   sync→async change, significant ownership shift, infrastructure change) — none apply. A new table
   on the already-built Drizzle/Postgres pipe and a new agent on the already-built Mastra registry
   are feature additions on existing architecture, not shifts to it — same reasoning the source
   app's own plan used to skip one.
6. **Consistency-gate auto-confirmation.** All consistency-gate checks passed with 0 gaps (see the
   gate run recorded in `discussion.md`); per this run's explicit unattended-planning instruction,
   `state: draft` was flipped to `state: confirmed` in every plan file immediately once the gate
   passed, without a human review step in between. Plan auto-confirmed by grand-loop-playwright
   overnight planning run 2026-07-28 — no human reviewer available; every fork in this section used
   the project's documented recommended-default rule instead of blocking on a question.

### Files to touch

```
packages/shared/src/
  practice.ts                              — submitWritingCheckInput, writingCheckSchema/WritingCheck
                                              type, added alongside existing verdictSchema/gradeBatchSchema

apps/api/src/
  db/
    schema.ts                              — new writingChecks table (id, subjectId, text, score,
                                              verdict, feedback, nativeAlternatives jsonb, createdAt)
    migrations/00XX_*.sql                  — new, generated via `npm run db:generate:api`
  mastra/
    writing-check.agent.ts                 — NEW, createWritingCheckAgent()
    mastra.ts                              — AGENT_KEYS gains `writingCheck`; getMastra() registers
                                              createWritingCheckAgent() alongside the existing 9
                                              (never edits an existing entry)
  practice/
    writing-check.schemas.ts               — NEW, writingCheckAgentSchema (agent structured-output
                                              shape; internal, distinct from the shared response type)
    writing-check.repo.ts                  — NEW, insertWritingCheck, getWritingChecksForSubject
    writing-check.repo.test.ts             — NEW, unit coverage for insert/list (named in DoD)
    writing-check.orchestrator.ts          — NEW, gradeAndStoreWritingCheck(subjectId, text)
    writing-check.orchestrator.test.ts     — NEW, unit coverage, mocked agent (named in DoD)
    practice.controller.ts                 — handleCreateWritingCheck, handleListWritingChecks,
                                              both guarded by the existing requireLanguagePracticeSubject
  router.ts                                — POST /subjects/:id/writing-checks,
                                              GET /subjects/:id/writing-checks
  server.ts                                — switch cases for the two new route names

apps/web/src/
  practice/
    writing-check.api.ts                   — NEW, createServerFn wrappers (submitWritingCheck GET/POST),
                                              mirrors phrase-bank.api.ts / practice.api.ts
    check-writing.tsx                      — NEW, textarea + submit + result card + history list,
                                              mirrors phrase-bank-panel.tsx's react-query GET pattern
  routes/
    practice.$subjectId_.check-writing.tsx — NEW route (trailing underscore — see decision 3),
                                              loader repeats the kind-check + notFound() guard from
                                              practice.$subjectId.tsx
    practice.$subjectId.tsx                — add a nav link to the new route; otherwise untouched

verification-repo/projects/post-anki/post-anki/
  features/practice/
    actions/check-writing.action.ts        — NEW — checkWriting({ page, text }) -> graded result
    actions/index.ts                       — barrel update
    fixtures/mock-data/                    — 2 new fixture entries (slack-message, stiff-email)
    tests/<scenario-slug>.test.ts          — 3 files, one per scenario (written by /write-playwright-tests)
  mock-openrouter/responses.ts             — new `writing-check` responder. Post-anki's mock has NO
                                              enqueue/dequeue-a-response-queue mechanism (confirmed
                                              by reading the file — every responder is a pure
                                              function of the request, matched by schemaProps and/or
                                              ctx.userText content); the source app's BAML
                                              `dequeueStub`/`POST /api/test/mock-baml` FIFO idiom
                                              does NOT port. Matcher: schemaProps includes
                                              `nativeAlternatives` AND excludes `gradedAnswers`
                                              (confirmed unique — no other of the 15 existing
                                              responders' schemas carry `nativeAlternatives` at the
                                              top level). Response SELECTION for the two fixtures
                                              (S2 needs two different graded results from one test)
                                              branches on ctx.userText containing the submitted
                                              text — the agent's prompt embeds the submitted text
                                              verbatim (same technique already used for
                                              ENRICHMENT_REDUNDANT_MARKER/
                                              LECTURE_COMPILE_FORCE_FAIL_MARKER): the Slack-message
                                              fixture text selects MOCK_WRITING_CHECK_SLACK_MESSAGE,
                                              the stiff-email fixture text selects
                                              MOCK_WRITING_CHECK_STIFF_EMAIL. Must be placed before
                                              the generic catch-alls (study-chat, web-grounding).
```

### Files NOT touched (confirm explicitly)

- No existing agent file, no existing `AGENT_KEYS` entry — additive only.
- No existing table's columns change — additive only (one new table).
- `apps/web/src/practice/batch-practice.tsx`, `phrase-bank-panel.tsx`, `use-practice-batch.ts` —
  untouched; this plan adds a sibling surface, not a change to the existing practice loop.
- No infrastructure/cloud resource files — application-level Drizzle migration only.

### Documentation changes

No existing doc names this ticket as pending. No `architecture.md` was written (see decision 5), so
no mandatory documentation-impact section is triggered by this plan's own consistency gate check 7.

### Scope boundary

Out of scope for this plan:
- Migrating the source app's own historical writing-check data (that's the separate, already-listed
  wishlist item "Migrate existing English practice data into post-anki").
- Any change to the existing batch-practice or phrase-bank UI/data model.
- A dedicated e2e scenario for the wrong-kind-subject 404 guard on the new route (reuses an
  already-proven guard verbatim — see decision 3 and `playwright.md`'s "Not e2e" section).

### Implementation order

1. `packages/shared/src/practice.ts` — `submitWritingCheckInput`, `writingCheckSchema`/`WritingCheck`.
2. `apps/api/src/db/schema.ts` — `writingChecks` table; `npm run db:generate:api` then
   `npm run db:migrate:api` against local dev.
3. `apps/api/src/mastra/writing-check.agent.ts` + `mastra.ts`'s additive registration.
4. `apps/api/src/practice/writing-check.schemas.ts`, `writing-check.repo.ts` +
   `writing-check.repo.test.ts`, `writing-check.orchestrator.ts` +
   `writing-check.orchestrator.test.ts`.
5. `apps/api/src/practice/practice.controller.ts` + `router.ts` + `server.ts` — the two new routes.
6. `apps/web/src/practice/writing-check.api.ts`, `check-writing.tsx`.
7. `apps/web/src/routes/practice.$subjectId_.check-writing.tsx` (new route, trailing-underscore
   escape — see decision 3) + `practice.$subjectId.tsx` (nav link only, untouched otherwise).
8. `verification-repo/projects/post-anki/post-anki/mock-openrouter/responses.ts` — new responder,
   content-matched on submitted text (see "Files to touch" note — no enqueue mechanism exists).
9. `verification-repo/.../features/practice/actions/check-writing.action.ts` + 2 fixtures.
10. `/write-playwright-tests` authors S1-S3's red tests against the plan above.

### Definition of Done — per layer

**Backend**
- `npm run db:generate:api && npm run db:migrate:api` completes with no errors and produces a
  migration adding the `writing_checks` table (`id`, `subject_id`, `text`, `score`, `verdict`,
  `feedback`, `native_alternatives` jsonb, `created_at`).
- `POST /subjects/:id/writing-checks` with `{ text: "hey can u take a look at this PR when u get a
  sec" }` against a `language-practice`-kind subject returns `200` with a body shaped
  `{ id, subjectId, text, score, verdict, feedback, nativeAlternatives, createdAt }` (createdAt
  included so the POST response and the GET history-list rows share one `WritingCheck` shape — S2's
  newest-first ordering depends on it being present), and the same shape is visible via a real
  `SELECT * FROM writing_checks WHERE subject_id = $1` afterward — proven by
  `@check-my-writing-mode.S1` (real HTTP call through the running e2e stack, real Postgres row,
  mocked-LLM response for determinism).
- `GET /subjects/:id/writing-checks` returns all rows for that subject ordered `created_at DESC` —
  proven by `@check-my-writing-mode.S2` (two real submissions, one real `page.reload()`, history
  order asserted against fixture content — not raw timestamps, per this project's own documented
  near-simultaneous-insert collision risk under stub-mode).
- `POST /subjects/:id/writing-checks` with `{ text: "   " }` (whitespace-only) is rejected by the
  shared `submitWritingCheckInput` validator before `gradeAndStoreWritingCheck`/the agent is ever
  called, and no row is inserted — proven by `@check-my-writing-mode.S3`.
- `POST`/`GET /subjects/:id/writing-checks` against an `architecture-mentor`-kind subject id return
  `400 not_a_language_practice_subject` (existing `requireLanguagePracticeSubject` guard, reused
  verbatim — not a new code path, so not independently re-proven by a new scenario).
- `npx tsc --noEmit` clean across `apps/api` and `packages/shared`.
- `npx vitest run apps/api/src/practice/writing-check.orchestrator.test.ts
  apps/api/src/practice/writing-check.repo.test.ts` — new unit coverage for the orchestrator
  (mocked-agent) and repo insert/list functions — passes.

**Frontend**
- Navigating to `/practice/:subjectId/check-writing` for a `language-practice` subject renders
  `check-writing-input` (empty, textarea) and `check-writing-submit-button` (disabled).
- Typing non-whitespace text enables the submit button; clicking it and waiting for the real
  `checkWriting` network response (not a DOM poll — this project's own regression history,
  `fix-duplicate-generatenextbatch-call`, is the reason `submitChunk`'s network-response-wait
  pattern is the one to copy) shows `check-writing-result` with `data-verdict` set, plus
  score/verdict/feedback/1-2 rewrites rendered — proven by `@check-my-writing-mode.S1`.
- Reloading after two submissions shows `check-writing-history-item-0`/`-1` in newest-first order
  with no resubmission — proven by `@check-my-writing-mode.S2`.
- Typing only whitespace keeps `check-writing-submit-button` disabled; appending real text enables
  it; clearing back to whitespace-only re-disables it (the required tinker step) — proven by
  `@check-my-writing-mode.S3`.
- `npx tsc --noEmit` clean across `apps/web`.

**Infrastructure** — N/A. No new cloud resources, IaC, or deploy-pipeline changes. The schema
change is an application-level Drizzle migration only, proven above under Backend — same as
`phrase-bank-concurrency-fix/spec.md`'s precedent for this exact wording.

**E2E (this plan's actual proof mechanism — run against the merged `main` checkout, since
`verification-repo/playwright.post-anki.config.ts` pins `SOURCE_REPO` to the main tree; a
worktree-local pass here is not proof, per this project's own documented `LOG.md` gotcha):**
- `@check-my-writing-mode.S1` — user checks a piece of writing and gets a score + rewrites.
- `@check-my-writing-mode.S2` — checked entries persist across reload, newest-first.
- `@check-my-writing-mode.S3` — empty/whitespace-only text cannot be submitted.
