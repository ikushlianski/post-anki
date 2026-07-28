---
type: spec
branch: workplace-scenario-packs
task: Port workplace scenario packs to the English subject
complexity: medium
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/workplace-scenario-packs/playwright.md
  stateFixtures: .planning/workplace-scenario-packs/state-fixtures.md
---

# Spec: Port workplace scenario packs to the English subject

Plan auto-confirmed by grand-loop-playwright (no human present to review).

### Headline finding — read this before "Files to touch" looks too small

**The application code for this feature already exists on `main` and is fully wired.** It landed as
scaffolding-ahead-of-need during two earlier, already-shipped wishlist items — "Port the English
batch-practice engine" (commit `5a21fa1`) and "Port phrase-bank spaced repetition with mastery
tracking" (commit `eb12c04`) — not as part of any prior workplace-scenario-packs work. This
worktree's HEAD is identical to `main`'s HEAD (`b2dc693`); nothing was ported into it before this
plan started. Confirmed present and correct, matching the source app's own
`.bmad/workplace-scenario-packs/spec.md` decisions item-for-item:

- `packages/shared/src/practice.ts` — `packSchema` (General/StandupUpdates/CodeReview/
  IncidentPostmortems/GivingFeedback), `practiceSettingsSchema.pack`, `phraseSchema.pack`.
- `apps/api/src/db/schema.ts` — `languagePracticeSettings.pack` and `phrases.pack` columns exist,
  with a real Drizzle migration (not the source app's ad-hoc `ALTER TABLE`) and a unique index on
  `(subjectId, level, pack, sequenceNumber)`.
- `apps/api/src/mastra/language-practice.agent.ts` — `PHRASE_BATCH_INSTRUCTIONS` already contains a
  full "Content mix per pack" section with distinct instructions per pack, General included.
- `apps/api/src/practice/generate-phrase-batch.orchestrator.ts` — `buildPhraseBatchPrompt(level,
  pack, ...)` embeds `Pack: ${pack}` in the prompt; `generatePhraseBatch` scopes
  `recentRussianForSubject` and the advisory lock (`pg_advisory_xact_lock(hashtext(subjectId ||
  level || pack))`) by subject+level+pack.
- `apps/api/src/practice/practice.controller.ts`'s `handleCreatePhraseBatch` reads
  `settings.pack` via `getOrCreatePracticeSettings` and passes it to `generatePhraseBatch` —
  confirmed by direct read, not defaulted.
- `apps/web/src/practice/pack-select.tsx` — `PackSelect`, structurally identical to the source
  app's, wired into `apps/web/src/routes/practice.$subjectId.tsx` alongside `LevelSelect`.
- `apps/web/src/practice/batch-practice.tsx` — `batch-pack-label` testid sourced from
  `phrases[0]?.pack ?? pack` (the actually-rendered batch's pack, not the settings pointer —
  matches the source spec's decision to avoid a display race on pack switch).
- `apps/api/src/practice/practice.repo.ts` — `recentRussianForSubject` scoped by level AND pack.
- Settings load through a plain server-side REST loader
  (`practice.$subjectId.tsx`'s route loader calling `getPracticeSettings`), not Electric-only —
  this is what makes "persists across reload" provable without a live-sync dependency.

**This is a verification-gap ticket, not a build ticket.** Nothing above needs to change. The gap is
that no e2e scenario currently proves pack selection actually reaches the model, themes the stored
content, and survives a reload — and the e2e mock LLM's phrase-batch responder currently ignores
which pack was requested.

### What to do

Close the verification gap: prove, end to end, that (1) a selected pack persists across a page
reload, (2) selecting a named pack changes what gets generated and stored — not just what the UI
button shows — and (3) switching back to General clears any themed residue. Three e2e scenarios;
zero application code changes.

The one real piece of work is making the e2e mock LLM's phrase-batch responder pack-aware, mirroring
the property the source app's own commit called out and fixed ("closed by requiring every stub to
declare the pack it's meant to satisfy, no wildcard fallback") — ported as a strict-parse-or-error
rule rather than a queue/tagging mechanism, since post-anki's mock has a different shape (see below).

### Mock LLM mechanism (decided)

- **`buildPhraseBatchStub` becomes pack-aware by parsing the real prompt, not by adding a new control
  surface.** `verification-repo/projects/post-anki/post-anki/mock-openrouter/responses.ts`'s
  `phrase-batch-generate` responder currently calls `buildPhraseBatchStub()` with no arguments —
  `content: () => JSON.stringify(buildPhraseBatchStub())` — so it returns the same generic stub
  content no matter which pack was requested. The `content` callback already receives `ctx:
  MockContext` (unused today for this responder); the fix is `content: (ctx) =>
  JSON.stringify(buildPhraseBatchStub(ctx.userText))`, and `buildPhraseBatchStub` parses the literal
  `Pack: <X>` line that `buildPhraseBatchPrompt` (the real orchestrator code, unchanged) already
  embeds in every generation prompt.
- **Strict match, no wildcard fallback — this is the property being ported.** An unparseable or
  unrecognized pack value throws inside the mock (surfaces as a loud test failure, not a silently
  wrong stub) rather than defaulting to General or any other pack's content. This is the same
  invariant the source commit's message names ("no wildcard fallback"), adapted to this mock's
  pure-function-of-the-request shape instead of its queue-and-tag mechanism (post-anki's mock has no
  enqueue/dequeue at all — confirmed by reading the file; every responder is a pure function of the
  request, the same pattern `check-my-writing-mode`'s plan already documented).
- **General's stub content is byte-for-byte unchanged.** `buildPhraseBatchStub` already has callers
  outside this ticket's scope — every existing batch-practice/phrase-bank-concurrency/retry-storm
  test that doesn't touch packs relies on its current output shape and its
  `phraseBatchGenerateCallIndex` per-call uniqueness counter (proves "the second/prefetched batch
  differs from the first"). The pack-aware version must preserve that counter's behavior *within*
  each pack's content, not just add a pack switch on top of static content — otherwise
  `@english-batch-practice.S1`/`.S4`-style assertions on cross-call distinctness silently regress.
  Concretely: keep one shared `phraseBatchGenerateCallIndex`, keep interpolating it into every pack's
  stubbed Russian/English text, and add the pack-specific *theme* as a prefix/marker inside that same
  templated string (e.g. `Code review stub, generation ${generation}, item ${index + 1}` for
  CodeReview) so both properties — per-call uniqueness and per-pack theming — hold simultaneously.
- **Only two pack entries need real themed content for this ticket's scenarios: `General`
  (unchanged) and `CodeReview` (S2/S3's exercised pack).** The other three named packs
  (StandupUpdates, IncidentPostmortems, GivingFeedback) get the same strict-match treatment (a real,
  distinct — if minimal — themed content block each) rather than being left to throw, since a future
  ticket picking a different pack for its own scenario shouldn't have to revisit this file's
  match-or-throw contract. Content for those three can be a straightforward extension of the same
  templated shape; no scenario in this plan asserts on their specific content.

### Two-layer assertion pattern (decided)

Mirrors `check-my-writing-mode`'s S1 (`features/practice/tests/check-writing-scores-a-submission/
test.ts`), not the source app's `queries/read-settings-pack.ts` layer — post-anki's verification-repo
feature folder (`features/practice/`) has no `queries/` directory, only `actions/`, `fixtures/`,
`tests/`. DB-layer proof uses the project's existing `countWhere`/`getRow` helpers
(`verification-repo/projects/post-anki/post-anki/db/pg.ts`) directly against the `phrases` table's
`pack` column (and `language_practice_settings.pack` for S1), not a new query-layer abstraction.

### Decisions made autonomously (no human present — see `discussion.md` for full reasoning)

1. **No new actions.** `changePack`, `generatePhraseBatch`, `openPracticePage`, `changeLevel` all
   already exist in `verification-repo/projects/post-anki/post-anki/features/practice/actions/` and
   already carry the correct testids (`PACK_TESTIDS` in `change-pack.action.ts` matches
   `pack-select.tsx`'s testids exactly). This plan composes them; it adds zero action gaps.
2. **The retry-storm-guard bug the source commit bundled is explicitly out of scope — already
   independently handled.** `apps/web/src/practice/use-practice-batch.ts` has its own guard
   (`isRequestingFirstBatchRef`, `lastFailedKeyRef` keyed on `level:pack`,
   `inFlightControllersRef` with `AbortController` cleanup for stale in-flight calls,
   `lastResetKeyRef` for reset idempotency) — strictly stronger than the source app's fix (it also
   handles a dev-mode remount re-invocation case the source app's guard doesn't). Already e2e-proven
   by `@english-batch-practice.S5`
   (`features/practice/tests/retry-storm-guard-bounds-failed-generate/test.ts`), which exercises a
   real pack switch (to `StandupUpdates`) as part of proving the guard clears correctly on a genuine
   key change. Not reopened by this plan.
3. **No new auth/route-protection scenario.** Post-anki's auth is one global gate
   (`apps/api/src/server.ts`'s `authorized()`, called once before any route dispatch) — same finding
   `check-my-writing-mode`'s spec.md already documented. Pack selection doesn't add a new endpoint;
   `settings.pack` flows through the existing `updatePracticeSettings` route, already covered by
   whatever auth proof exists for that route today.
4. **Settings-row cross-test contamination risk considered and ruled out.** The source app's own
   `.planning/LOG.md` 2026-07-18 entry documents a real bug it hit: `settings` was a single shared
   row with no per-test reset, so a pack left non-General by one test silently leaked into the next
   test's first page load. Post-anki's architecture doesn't share this risk — every practice e2e test
   (this plan's three included) creates its own fresh `language-practice` subject via
   `setupLanguagePracticeSubject`, and `language_practice_settings` is keyed by `subjectId`
   (primary key). No two tests ever read or write the same settings row, so no end-of-test reset to
   'General' is needed the way the source app's tests required.
5. **No `architecture.md`.** Checked against the trigger list (new async boundary, new service,
   sync→async change, significant ownership shift, infrastructure change) — none apply. This plan
   changes zero application-layer files; the one file it touches
   (`verification-repo/.../mock-openrouter/responses.ts`) is test infrastructure, not product
   architecture.
6. **Consistency-gate auto-confirmation.** All consistency-gate checks passed with 0 gaps (recorded
   in `discussion.md`); per this run's explicit unattended-planning instruction, `state: draft` was
   flipped to `state: confirmed` in every plan file immediately once the gate passed, without a human
   review step in between. Plan auto-confirmed by grand-loop-playwright overnight planning run
   2026-07-28 — no human reviewer available; every fork in this section used the project's documented
   recommended-default rule instead of blocking on a question.

### Files to touch

```
apps/**                                          — UNTOUCHED. No application code changes (see
                                                    "Headline finding" above).
packages/shared/**                               — UNTOUCHED.

verification-repo/projects/post-anki/post-anki/
  mock-openrouter/
    responses.ts                                 — buildPhraseBatchStub gains a userText param;
                                                    parses `Pack: <X>` out of the prompt; returns
                                                    pack-specific themed content (General unchanged,
                                                    CodeReview themed for S2/S3, the other 3 named
                                                    packs get minimal-but-distinct themed content);
                                                    throws on an unparseable/unrecognized pack — no
                                                    wildcard fallback. phraseBatchGenerateCallIndex's
                                                    per-call uniqueness is preserved inside every
                                                    pack's branch. The `phrase-batch-generate`
                                                    responder's `content` callback is updated to pass
                                                    `ctx.userText` through.
  features/practice/
    tests/
      pack-select-persists-across-reload/test.ts   — NEW, S1 (written by /write-playwright-tests)
      pack-themes-generated-batch/test.ts           — NEW, S2 (written by /write-playwright-tests)
      pack-switch-back-to-general/test.ts           — NEW, S3 (written by /write-playwright-tests)
      README.md                                     — 3 rows added, one per new scenario
```

### Files NOT touched (confirm explicitly)

- No file under `apps/` or `packages/` — this plan proves existing, already-shipped behavior; it
  does not change it.
- No new `verification-repo` action — all four actions this plan composes
  (`openPracticePage`, `generatePhraseBatch`, `changePack`, `changeLevel`) already exist.
- No new state-mock file — `features/practice` has no `fixtures/state-mocks/` pattern; every
  scenario creates its own subject front-door, same as every existing practice test.
- No infrastructure/cloud resource files.

### Documentation changes

No existing doc names this ticket as pending, and no `architecture.md` was written (see decision 5),
so no mandatory documentation-impact section is triggered by this plan's own consistency gate check
7. `docs/architecture/english-batch-practice/` (if it exists) is not touched — nothing about the
batch-practice architecture changed; only its e2e proof surface grew.

### Scope boundary

Out of scope for this plan:
- Any application code change (packs are already fully implemented — see "Headline finding").
- The retry-storm-guard fix bundled in the source commit — already independently handled by
  `use-practice-batch.ts`, already e2e-proven by `@english-batch-practice.S5` (decision 2).
- Themed stub content for StandupUpdates, IncidentPostmortems, GivingFeedback beyond the minimal
  strict-match requirement (decision in "Mock LLM mechanism" above) — no scenario in this plan
  asserts on their specific content; a future ticket that needs to assert on one of them can extend
  the same `buildPhraseBatchStub` branch.
- Migrating the source app's own historical practice data (separate wishlist item, "Migrate existing
  English practice data into post-anki").

### Implementation order

1. `verification-repo/projects/post-anki/post-anki/mock-openrouter/responses.ts` —
   `buildPhraseBatchStub(userText)` pack-aware rewrite; update the `phrase-batch-generate`
   responder's `content` callback to pass `ctx.userText`.
2. `/write-playwright-tests` authors S1-S3's red tests against the plan above (all three compose
   existing actions only).

### Definition of Done — per layer

**Backend** — N/A. No backend application code changes (confirmed: `apps/api/src/practice/
generate-phrase-batch.orchestrator.ts`, `practice.controller.ts`, `practice.repo.ts`, and
`apps/api/src/db/schema.ts` are all untouched by this plan). The behavior this plan proves —
`settings.pack` read and passed to `generatePhraseBatch`, `phrases.pack` written per row, the
advisory lock and repeat-avoidance scoped by pack — already exists and is exercised (not newly
tested) by the E2E scenarios below.

**Frontend** — N/A. No frontend application code changes (confirmed: `pack-select.tsx`,
`batch-practice.tsx`, `use-practice-batch.ts`, `use-practice-settings.ts`, and
`practice.$subjectId.tsx` are all untouched by this plan). `npx tsc --noEmit` across `apps/web`
stays clean trivially, since nothing in it changed.

**Infrastructure** — N/A. No new cloud resources, IaC, or deploy-pipeline changes. No local infra
change either — the e2e Postgres/mock-LLM stack topology is unchanged, only one mock response
function's content logic changes.

**Retry-storm-guard concern (from the source commit) — explicitly OUT OF SCOPE, already handled.**
`apps/web/src/practice/use-practice-batch.ts` independently implements a strictly stronger guard
(in-flight ref + `lastFailedKeyRef` keyed on `level:pack` + `AbortController` cleanup + reset
idempotency) than the one the source commit introduced, and it is already e2e-proven —
`@english-batch-practice.S5` (`retry-storm-guard-bounds-failed-generate`) exercises a real pack
switch as part of its proof. This plan does not touch that guard and does not add a duplicate
scenario for it.

**E2E (this plan's actual proof mechanism — run against the merged `main` checkout, per this
project's established convention that a worktree-local pass is not proof):**
- `@workplace-scenario-packs.S1` — selecting a named pack (`StandupUpdates`) persists: a page
  reload shows `pack-select-standup-updates` with `aria-pressed="true"`, and
  `language_practice_settings.pack = 'StandupUpdates'` for that subject in Postgres.
- `@workplace-scenario-packs.S2` — selecting `CodeReview` and generating a batch shows
  `batch-pack-label` reading "Code review", the rendered `phrase-russian-0..9` content matches the
  CodeReview-themed mock stub (not the General stub), and `countWhere('phrases', { subject_id,
  pack: 'CodeReview' })` equals 10 for that subject's newest batch in Postgres — proving the pack
  parameter traveled prompt → mock → stored rows, not just UI state.
- `@workplace-scenario-packs.S3` — after S2's themed state, clicking back to `pack-select-general`
  regenerates a batch with `batch-pack-label` reading "General", content matching the (unchanged)
  General stub, and `countWhere('phrases', { subject_id, pack: 'General' })` equal to 10 for the new
  batch, with the prior `CodeReview` rows for that subject still present and unaffected (proving a
  pack switch doesn't retroactively rewrite history, only what gets generated next).
