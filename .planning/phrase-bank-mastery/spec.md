---
type: spec
branch: phrase-bank-mastery
task: Port phrase-bank spaced repetition with mastery tracking to the English subject
complexity: complex
state: confirmed
updated: 2026-07-25
---
# Spec: Phrase-bank spaced repetition with mastery tracking

### Implementation Phases

Split into two phases after a red-team pass on an earlier single-phase draft found that bundling
the fully deterministic backend algorithm with UI wiring hid the feature's real risk (the
mastery/adjacency arithmetic) behind whether the UI layer's proof happened to land too. Splitting
lets the algorithm be proven correct and deterministic on its own, before any UI work depends on it.

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|-------|-----------|------------------|-------------------|---------------|----------------------|
| 1 — Bank, derivers, orchestrators | 1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13 | New tables + `phrases` columns; `phrase-bank.ts` derivers; `phrase-bank.repo.ts`; both orchestrators updated; `handleGetPhraseBank` endpoint | None | None | N/A — no latency-sensitive path added |
| 2 — UI wiring | 2, 6 | `phraseBankUpdates` already returned by Phase 1's `handleCreateAttempts` | Recycled badge, mastered indicator, `PhraseBankPanel`, route wiring | Phase 1 complete and its DoD proven | N/A |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|--------------------|
| `selectDuePhrases` | `entries: PhraseBankEntryState[]`, `currentSequenceNumber: number`, `maxDue: number` | Due entries (`status` is `struggling` or `practicing`, `scheduledForSentenceCount <= currentSequenceNumber`), most-overdue first, capped at `maxDue` | SCENARIO 5, SCENARIO 8, SCENARIO 10 |
| `applyAttemptToPhraseBankEntry` | `entry: PhraseBankEntryState`, `attempt: { sequenceNumber: number; verdict: Verdict }` | `{ entry: PhraseBankEntryState; appearance: { result: "correct" \| "incorrect"; wasOverdue: boolean } }` — new/practicing/struggling/mastered transition (verdict→correct mapping happens inside), non-adjacency-guarded mastery count, isolation rollback preserving lifetime counters | SCENARIO 1, SCENARIO 3, SCENARIO 4, SCENARIO 10, SCENARIO 11 |
| `matchExistingPhraseBankEntry` | `candidates: { id: string; phraseText: string; status: PhraseBankStatus }[]`, `phraseText: string` | Matched entry `id`, or `null` if no active (non-`mastered`) candidate matches (case-insensitive, trimmed exact match) | SCENARIO 1, SCENARIO 10 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 (new phrase enters bank) | `generate-phrase-batch.orchestrator.ts`, `grade-attempts.orchestrator.ts`, `phrase-bank.repo.ts`, `packages/core/src/phrase-bank/phrase-bank.ts` | None | None |
| SCENARIO 2 (struggling rescued, visible) | None (backend already covered by SCENARIO 1/11) | `apps/web/src/practice/batch-practice.tsx` — recycled badge | None |
| SCENARIO 3 (mastery archive) | `grade-attempts.orchestrator.ts`, `phrase-bank.repo.ts`, `packages/core/src/phrase-bank/phrase-bank.ts` | `batch-practice.tsx` — mastered indicator | None |
| SCENARIO 4 (non-adjacency guard) | `packages/core/src/phrase-bank/phrase-bank.ts` | None | None |
| SCENARIO 5 (active recycling in generation) | `generate-phrase-batch.orchestrator.ts`, `practice-batch.schemas.ts`, `language-practice.agent.ts`, `phrase-bank.repo.ts` | None | None |
| SCENARIO 6 (discoverable in UI) | `practice.controller.ts` (GET endpoint already exists from Phase 1), `router.ts` | `phrase-bank-panel.tsx` (new), `phrase-bank.api.ts` (new), `routes/practice.$subjectId.tsx` | None |
| SCENARIO 7 (level/pack scoping) | `phrase-bank.repo.ts` | None | None |
| SCENARIO 8 (first-ever batch, nothing due) | `generate-phrase-batch.orchestrator.ts`, `packages/core/src/phrase-bank/phrase-bank.ts` | None | None |
| SCENARIO 9 (untagged sentence, no writes) | `grade-attempts.orchestrator.ts` | None | None |
| SCENARIO 10 (pure derivers) | `packages/core/src/phrase-bank/phrase-bank.ts` + co-located test | None | None |
| SCENARIO 11 (isolation rollback, not reset) | `grade-attempts.orchestrator.ts`, `packages/core/src/phrase-bank/phrase-bank.ts` | None | None |
| SCENARIO 12 (bad id-echo never crashes generation) | `generate-phrase-batch.orchestrator.ts` | None | None |
| SCENARIO 13 (exact sequence number, not approximated) | `apps/api/src/db/schema.ts`, `generate-phrase-batch.orchestrator.ts`, `phrase-bank.repo.ts` | None | None |

### Files to create

```
packages/core/src/phrase-bank/
  phrase-bank.ts             — selectDuePhrases, applyAttemptToPhraseBankEntry,
                                matchExistingPhraseBankEntry (all pure)
  phrase-bank.test.ts        — co-located Vitest cases in business language

packages/shared/src/
  phrase-bank.ts             — phraseBankStatusSchema, phraseBankEntrySchema,
                                phraseBankAppearanceSchema, phraseBankSummarySchema

apps/api/src/practice/
  phrase-bank.repo.ts        — queries/writes for the two new tables + sequenceNumber assignment
  phrase-bank.repo.test.ts

apps/web/src/practice/
  phrase-bank.api.ts         — server fn + api-client wrapper for GET phrase-bank
  phrase-bank-panel.tsx      — active/mastered summary list
  phrase-bank-panel.test.tsx
```

### Files to modify

```
apps/api/src/db/
  schema.ts                  — add phraseBankEntries, phraseBankAppearances tables;
                                add phrases.targetPhraseBankEntryId (nullable FK, text) and
                                phrases.sequenceNumber (integer, not null, backfilled in the
                                same migration for pre-existing rows — see architecture.md)

apps/api/src/practice/
  practice-batch.schemas.ts  — phraseBatchSchema: per-item targetPhraseBankEntryId (nullable
                                string, id-echo) + newTargetPhrase (nullable {text, category})
  generate-phrase-batch.orchestrator.ts
                              — fetch due entries, extend prompt, validate echoed ids against the
                                due-entry set sent (drop invalid/duplicate echoes to null), link
                                or create bank entries via matchExistingPhraseBankEntry, assign
                                sequenceNumber and targetPhraseBankEntryId on insert
  grade-attempts.orchestrator.ts
                              — for graded items with a linked bank entry, call
                                applyAttemptToPhraseBankEntry with the raw verdict, persist entry +
                                appearance, include phraseBankUpdates in result
  practice.controller.ts     — handleCreateAttempts returns phraseBankUpdates alongside attempts;
                                new handleGetPhraseBank(res, subjectId)
  practice.repo.ts           — no change beyond what phrase-bank.repo.ts adds (kept separate,
                                mirrors the entity's existing repo/orchestrator split)

apps/api/src/
  router.ts                  — GET /subjects/:id/phrase-bank -> "getPhraseBank"
  server.ts                  — wire handleGetPhraseBank into the switch

apps/api/src/mastra/
  language-practice.agent.ts — PHRASE_BATCH_INSTRUCTIONS: explain due-phrase recycling (echo the
                                given id, don't invent one) and target-phrase tagging; must not
                                change GRADE_BATCH_INSTRUCTIONS (grading logic is unaffected —
                                mastery is computed from the existing score/verdict, not a new
                                grading concept)

packages/shared/src/
  practice.ts                — phraseSchema gains targetPhraseBankEntryId (nullable string) and
                                sequenceNumber (number)
  index.ts                   — export * from "./phrase-bank"

apps/web/src/practice/
  practice.collection.ts     — PhraseRow/mapPhraseRow gain target_phrase_bank_entry_id
  batch-practice.tsx         — recycled badge on phrase cards, mastered indicator on results,
                                submitChunk captures phraseBankUpdates from the response
  practice.api.ts / practice.api-client.ts
                              — submitAttempts return type carries phraseBankUpdates
  routes/practice.$subjectId.tsx
                              — renders <PhraseBankPanel /> alongside <BatchPractice />
```

### Data model changes

See `architecture.md`'s "Data model evolution" for full column lists and reasoning. Summary: two
new tables (`phrase_bank_entries`, `phrase_bank_appearances`), two new columns on the existing
`phrases` table — `targetPhraseBankEntryId` (nullable, no backfill needed) and `sequenceNumber`
(not null, backfilled for pre-existing rows in the same migration via a window-function `UPDATE`
ordered by `createdAt` within each subject/level/pack group).

### Documentation changes

No existing doc under `docs/architecture/` covers phrase-bank/mastery tracking (only
`docs/architecture/english-batch-practice/` exists, covering the batch-generation/grading loop
this plan extends, not the mastery layer). New — a short Mermaid version of the diagram in
`architecture.md` will be published to `docs/architecture/phrase-bank-mastery.md` during
implementation, per the constitution's documentation-impact rule.

### Decisions made autonomously

This is an overnight run with no human available to answer interview questions; every decision
below was made using a safe, reversible default per the project's standing autonomy rule, and is
listed here instead of having blocked on a question. Items 2, 4, and 5 were revised mid-planning
after an independent red-team pass (`/grill-plan-ie`) found the first draft of each one flawed —
noted inline rather than silently overwritten, since a wrong-then-corrected call is useful history.

1. **New tables, not an extension of `phrases`.** `phrases` rows are one-off generated-sentence
   instances with no cross-batch identity; a target expression needs identity that outlives any
   single sentence and gets referenced by many future sentences. Reversible: the new tables can be
   merged into `phrases` later if that ever proves simpler, with no data loss either way.
2. **Sentence sequence is a real stored column (`phrases.sequenceNumber`), assigned once at
   generation time — revised from an earlier draft's lazy `COUNT(*)`.** The `COUNT(*)` approach was
   found semantically broken, not just unoptimized: grading happens per chunk, so every item in one
   generated batch would read back an identical count, and two truly adjacent appearances straddling
   a batch boundary could read as far apart. A stored per-row sequence number, scoped to
   subject/level/pack, gives exact adjacency and due-date arithmetic instead of an approximation
   that fails at exactly the boundary cases the mastery rule most needs to get right. See
   `architecture.md`'s "Sentence sequence" section for the full reasoning and the migration/backfill
   approach.
3. **Due-phrase linking uses id-echo (the model echoes back a due entry's id), not text matching.**
   New-phrase detection (no id exists yet) falls back to text via `matchExistingPhraseBankEntry`,
   which is the only case where it can. Chosen over the grading step's existing positional-trust
   pattern because id-echo is strictly more reliable and the schema is new anyway. Every echoed id
   is validated against the actual due-entry set sent (SCENARIO 12) before being trusted, since
   `targetPhraseBankEntryId` is a real foreign key and an unvalidated bad echo would otherwise crash
   the whole batch insert, not just mistag one item.
4. **The verdict→correct mapping lives inside `applyAttemptToPhraseBankEntry`, not in
   `grade-attempts.orchestrator.ts` — revised from an earlier draft that left it in the
   orchestrator.** A red-team pass correctly flagged that as a business-logic leak: SCENARIO 10's
   guarantee that "no independent copy of the mastery rules exists" outside the deriver only holds
   if the deriver itself owns this mapping. The deriver now takes the raw `verdict` (`Ok` = correct;
   `NeedsReview`/`NeedsDeepDive` = incorrect for phrase-bank purposes) and applies the mapping
   internally, where it's covered by the same unit tests as the rest of the state machine.
5. **Non-adjacency is enforced by comparing exact `sequenceNumber` values, not by relying on the
   scheduling gap to make adjacency rare — revised from an earlier draft that leaned on the
   `+3` schedule as the primary defense.** At `BATCH_SIZE = 10`, a `+3` reschedule offset can never
   actually delay a due phrase past the very next batch, so it provided far less protection than
   the first draft assumed; the exact `sequenceNumber` comparison (SCENARIO 13) is the real and only
   mechanism the mastery count relies on, not a backstop on top of scheduling.
6. **A struggling phrase returns to `practicing` on its first correct attempt while in isolation
   mode**, rather than requiring a fixed 2-3 successful isolated reps before exiting. The source
   app's CLAUDE.md text ("retry after 2-3 isolated reps") is genuinely ambiguous between "the
   recycling cadence is 2-3 sentences" and "N successes required to exit isolation" — no
   ground-truth code exists to disambiguate, since the source app never implemented this in
   software. Chosen as the simpler, reversible reading; the entry's lifetime `incorrectCountInCycle`
   is preserved rather than erased (SCENARIO 11), so nothing about the phrase's difficulty history
   is lost by exiting isolation quickly. This remains the single most debatable business-logic call
   in this plan — flagged again in `todo.md` as a non-blocking item worth a human glance, not because
   the plan is incomplete without it, but because it's the one rule with no way to have been more
   certain tonight.
7. **Due-phrase cap per batch: 3 out of 10 generated items.** Approximates the source app's "every
   3-5 sentences" cadence. Reversible: a single constant in `generate-phrase-batch.orchestrator.ts`.
8. **Phrase-bank scoping: subjectId + level + pack**, matching `recentRussianForSubject`'s existing
   scoping. Switching level/pack orphans (does not delete) the previous scope's bank entries; they
   resume exactly where they left off if the learner switches back (SCENARIO 7), since nothing about
   them is time-boxed to a session.
9. **The Phrase Bank summary panel is a plain REST GET endpoint, not a new Electric-synced
   collection.** Tonight's own architecture review (`docs/architecture/english-batch-practice/
   review.md`) already flagged the Electric pipeline as an unconfigured single point of failure in
   production; adding a second collection to that same fragile pipeline the same night is an
   avoidable risk for a panel that doesn't need multi-tab real-time sync. The recycled-phrase badge
   on phrase cards during a live batch still goes through Electric, because it rides the
   already-synced `phrases` row (a new column, not a new collection).
10. **No fuzzy deduplication of near-duplicate phrase text.** `matchExistingPhraseBankEntry` matches
    purely on exact (case-insensitive, trimmed) text, so the model could occasionally create a new
    entry that's a near-duplicate of an existing one (e.g. "drowning in work" vs. "drowning
    (in work/busy/stuff)"). Accepted as a v1 limitation, not a data-loss risk — duplicate entries
    just recycle independently; a later cleanup pass can merge them without touching attempt
    history, since `phrase_bank_appearances` rows point at whichever entry they were graded against.
11. **A duplicate id-echo within one batch keeps only the first occurrence.** If two generated items
    both echo the same due entry's id (SCENARIO 12), only the first (generation order) is linked;
    the second is treated as untracked. Simpler than asking the model to correct itself, and the
    cost is bounded — one fewer tracked appearance in the rare case this happens, never a crash.
12. **Two-phase split, backend-then-UI.** Adopted from the red-team pass: a single-phase plan would
    gate sign-off on the deterministic, fully-testable backend algorithm behind whatever the UI
    layer's harder-to-verify proof happens to show, when the two have very different risk profiles.
    See "Implementation Phases" above.
13. **Consistency-gate auto-confirmation.** All ten consistency-gate checks passed with no gaps
    found after the red-team revisions above were folded in (see the gate run recorded at the end
    of this planning session); per the invoking task's explicit instruction for this overnight run,
    `state: draft` was flipped to `state: confirmed` in every plan file immediately once the gate
    passed, without a human review step in between.

### Implementation order

**Phase 1 — Bank, derivers, orchestrators:**
1. `/tdd selectDuePhrases` — covers SCENARIO 5, SCENARIO 8, SCENARIO 10
2. `/tdd matchExistingPhraseBankEntry` — covers SCENARIO 1, SCENARIO 10
3. `/tdd applyAttemptToPhraseBankEntry` — covers SCENARIO 1, SCENARIO 3, SCENARIO 4, SCENARIO 10, SCENARIO 11
4. `packages/shared/src/phrase-bank.ts` + `practice.ts` extension (schemas/types the rest depends on)
5. `apps/api/src/db/schema.ts` — new tables + `phrases.targetPhraseBankEntryId` + `phrases.sequenceNumber`; generate + apply migration with backfill
6. `apps/api/src/practice/phrase-bank.repo.ts` — persistence around the derivers
7. `generate-phrase-batch.orchestrator.ts` + `practice-batch.schemas.ts` + `language-practice.agent.ts` prompt update — covers SCENARIO 5, SCENARIO 8, SCENARIO 12, SCENARIO 13
8. `grade-attempts.orchestrator.ts` — covers SCENARIO 1, SCENARIO 3, SCENARIO 9, SCENARIO 11
9. `practice.controller.ts` + `router.ts` + `server.ts` — `handleGetPhraseBank`, `phraseBankUpdates` on attempts response
10. Phase 1 Definition of Done proven (see below) before Phase 2 starts.

**Phase 2 — UI wiring:**
11. `apps/web/src/practice/practice.collection.ts`, `phrase-bank.api.ts`, `phrase-bank-panel.tsx`, `batch-practice.tsx` wiring — covers SCENARIO 2, SCENARIO 3, SCENARIO 6
12. `routes/practice.$subjectId.tsx` wiring + `docs/architecture/phrase-bank-mastery.md` publish

### Scope boundary

Out of scope for this plan:
- Migrating the source app's real `learning/active-phrases.json` / `mastered-phrases.json` history
  into these new tables — that is its own wishlist item ("Migrate existing English practice data
  into post-anki's database") and explicitly deferred until this schema is stable.
- Fixing the pre-existing Electric-sync single-point-of-failure gap for the practice feature in
  general (documented in `docs/architecture/english-batch-practice/review.md`) — this plan works
  around it for the new panel (decision 9) but does not repair the underlying gap.
- Quiz-mode integration (Type 1/Type 2 appropriateness/naturalness quizzes) mentioned in the source
  CLAUDE.md — no quiz mode exists anywhere in post-anki today; out of scope here.
- Workplace scenario packs and "check my writing" freeform scoring — separate, already-listed
  wishlist items.
- Fuzzy/semantic deduplication of near-duplicate phrase-bank entries (decision 10).

### Definition of Done — per layer

**Backend**
- `npm run db:generate -w @post-anki/api && npm run db:migrate -w @post-anki/api` completes with no
  errors and produces a migration creating `phrase_bank_entries`, `phrase_bank_appearances`, and
  `phrases.target_phrase_bank_entry_id` / `phrases.sequence_number` (with the backfill statement for
  pre-existing rows).
- `npx vitest run packages/core/src/phrase-bank/phrase-bank.test.ts` — all cases pass, including:
  a case asserting 3 correct attempts at non-adjacent `sequenceNumber` values (e.g. 1, 5, 9) reach
  `status: "mastered"`; a case asserting 2 attempts at adjacent `sequenceNumber`s (e.g. 5, 6) plus
  one more correct attempt do NOT yet reach `mastered`; a case asserting an incorrect attempt on a
  `practicing` entry rolls back to `struggling` with `masteryStage`/`correctCountInCycle` at 0 while
  `incorrectCountInCycle` increments (SCENARIO 11); a case asserting `applyAttemptToPhraseBankEntry`
  maps `verdict: "NeedsReview"` to an incorrect result internally.
- `npx vitest run apps/api/src/practice/generate-phrase-batch.orchestrator.test.ts apps/api/src/practice/grade-attempts.orchestrator.test.ts apps/api/src/practice/phrase-bank.repo.test.ts`
  — all pass, using a mocked Mastra agent (the same `vi.mock("../mastra/mastra.js", …)` pattern the
  existing orchestrator tests already use) returning deterministic, hand-authored structured-output
  fixtures — never a live model call, since the mastery-transition proof must be repeatable on every
  run. Required cases: (a) a fixture where the mocked agent echoes a due entry's real id — asserts
  the resulting `phrases` row's `targetPhraseBankEntryId` is set and a `phrase_bank_appearances` row
  is written on grading; (b) a fixture echoing an id NOT in the due-entry set sent — asserts the row
  inserts successfully with `targetPhraseBankEntryId: null` and no FK error (SCENARIO 12); (c) a
  fixture where two items echo the same due-entry id — asserts only the first is linked (SCENARIO
  12); (d) three sequential mocked generate+grade cycles for the same tracked phrase, non-adjacent
  `sequenceNumber`s — asserts the entry reaches `status: "mastered"` after the third.
- Runtime proof (endpoint existence and shape, not the multi-cycle mastery claim — that is proven
  deterministically above): against a locally running API, `curl -s -X POST
  localhost:<port>/subjects/<id>/phrase-batches` then `curl -s localhost:<port>/subjects/<id>/phrase-bank`
  returns 200 with a body matching `phraseBankSummarySchema` (`{ active: [...], mastered: [...] }`).

**Frontend** *(Phase 2 only — see "Implementation Phases"; N/A until Phase 1's Backend DoD above is
proven)*
- `npx vitest run apps/web/src/practice/practice.collection.test.ts apps/web/src/practice/phrase-bank-panel.test.tsx`
  — all pass, driving `PhraseBankPanel` and the recycled/mastered badges with mocked API responses
  (React Testing Library), not a live backend or live LLM — same determinism requirement as the
  backend derivers, since a real recycle-then-master cycle can't be reliably forced through a live
  model in a test run.
- Runtime proof (structural, not a forced mastery cycle): with the web app running against the API
  above, loading `/practice/:subjectId` renders `data-testid="phrase-bank-panel"` without error, and
  a phrase card whose underlying `phrases` row has a non-null `target_phrase_bank_entry_id` (set via
  a direct DB insert for this check, not by waiting on a live batch) renders
  `data-testid="phrase-recycled-badge"`.

**Infrastructure**
N/A — not touched. No new cloud resources, IaC, or deploy pipeline changes; the database schema
change is an application-level Drizzle migration, proven above under Backend.
