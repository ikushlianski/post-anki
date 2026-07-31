---
type: spec
branch: curriculum-merge-provenance
task: "Fix #68 — make clearCurriculumStructure provenance-aware"
complexity: medium
state: confirmed
updated: 2026-07-31
---
# Spec: Make clearCurriculumStructure provenance-aware

### Single phase implementation.

### Derivers

None. This fix has no new pure-computation rule worth a dedicated deriver — the "should this row
survive a clear" logic is a single SQL filter condition (`merged_from_curriculum_id IS NULL`)
applied at the query layer, not a business rule with branching logic that benefits from being
isolated and unit-tested in isolation from the database. The one piece of logic worth naming —
"preserve an existing marker rather than overwrite it on a second merge" — is expressed as a
single `coalesce()` SQL expression at the write site, same reasoning.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 — merge then later unrelated failure then retry preserves merged-in content | `apps/api/src/curriculum/curriculum.repo.ts` (`clearCurriculumStructure` gains the protective filter; `mergeCurricula`'s `movedModules`/`movedTopics` updates write the marker) | None | None |
| SCENARIO 2 — all-native curriculum reparses exactly as before | `apps/api/src/curriculum/curriculum.repo.ts` (`clearCurriculumStructure`'s default path — no change needed beyond SCENARIO 1's edit, verified by test) | None | None |
| SCENARIO 3 — deleteCurriculum still removes everything, merged-in or not | `apps/api/src/curriculum/curriculum.repo.ts` (`deleteCurriculum` passes `{ includeMergedIn: true }`) | None | None |
| SCENARIO 4 — merge chain preserves provenance through more than one hop | `apps/api/src/curriculum/curriculum.repo.ts` (`mergeCurricula`'s `coalesce()` write) | None | None |
| SCENARIO 5 — clearCurriculumStructure defaults to protective; one caller opts out | `apps/api/src/curriculum/curriculum.repo.ts` (function signature + both call sites) | None | None |

### Files to create

```
apps/api/src/db/migrations/
  00XX_<drizzle-generated-name>.sql       — adds modules.merged_from_curriculum_id,
                                             topics.merged_from_curriculum_id (nullable text,
                                             no default); generated via `drizzle-kit generate`,
                                             never hand-written (constitution: migrations are
                                             generated, never pushed)
apps/api/src/curriculum/
  curriculum-merge-provenance.integration.test.ts
                                           — new integration test, real Postgres, no mocks,
                                             following the existing
                                             curriculum-merge-*.integration.test.ts pattern.
                                             Covers SCENARIOS 1-5 directly against
                                             clearCurriculumStructure/mergeCurricula/
                                             deleteCurriculum (not the LLM-backed orchestrator
                                             functions — reparseCurriculum/retryResearch/
                                             mergeSourcesIntoCurriculum call an LLM agent, which
                                             the existing test suite never mocks; the test
                                             instead calls clearCurriculumStructure directly,
                                             which is the exact first step those orchestrator
                                             functions perform, and separately sets status to
                                             'failed' via setCurriculumStatus to stand in for
                                             "A failed later through unrelated ordinary use" —
                                             faithful to the sequence without needing an LLM
                                             mock the rest of this suite doesn't have either)
```

### Files to modify

```
apps/api/src/db/schema.ts
  modules table    — add mergedFromCurriculumId: text("merged_from_curriculum_id"), nullable
  topics table     — add mergedFromCurriculumId: text("merged_from_curriculum_id"), nullable
                     (naming/shape matches curricula.domainNodeId's existing convention:
                     nullable, additive, no default, no .references() FK)

apps/api/src/curriculum/curriculum.repo.ts
  clearCurriculumStructure(curriculumId, options?: { includeMergedIn?: boolean })
                     — options defaults to {} / includeMergedIn defaults to false.
                       topicRows select, tx.delete(topics), tx.delete(modules) all add
                       `isNull(topics.mergedFromCurriculumId)` /
                       `isNull(modules.mergedFromCurriculumId)` to their WHERE clause unless
                       includeMergedIn is true. Import `isNull` from drizzle-orm (not yet
                       imported in this file).
  mergeCurricula     — movedModules/movedTopics update .set() calls add
                       `mergedFromCurriculumId: sql`coalesce(${modules.mergedFromCurriculumId},
                       ${sourceId})`` (and the topics equivalent) so an already-merged-in row
                       keeps its original marker through a second merge (SCENARIO 4).
  deleteCurriculum   — calls `clearCurriculumStructure(curriculumId, { includeMergedIn: true })`
                       instead of the no-args call, with a one-line comment explaining why
                       (full deletion must not leave orphaned merged-in rows behind).

docs/architecture/curriculum-merge/architecture.md   — new file (none existed for this feature
                       before; only review.md, the debrief, existed). Describes the current-state
                       shape of clearCurriculumStructure's provenance-aware contract and the
                       merge write side, framed for a first-time reader — not a diff against the
                       pre-fix behavior. Carries this plan's flowchart diagram.
```

### Data model changes

Two nullable columns, `modules.merged_from_curriculum_id` and `topics.merged_from_curriculum_id`
(text, no default, no FK). See `architecture.md`'s "Data model evolution" and "Rollout" sections
for the full reasoning, including the stated limitation that this does not retroactively protect
merges that happened before this migration ships.

### Documentation changes

`docs/architecture/curriculum-merge/architecture.md` — created. This repo's own convention (seen
across `docs/architecture/ontology-audit-trail/`, `docs/architecture/domain-node-merge/`, etc.)
is a flat feature-slug layout, not the domain/component taxonomy described in the constitution's
generic fallback — no `docs/architecture/README.md` or domain subfolders exist anywhere in this
repo, so the existing local pattern is followed rather than introducing a domain taxonomy that
has never been used here. `docs/architecture/curriculum-merge/` already exists (holding the
original feature's `review.md`); this adds the architecture doc that was never written for that
feature, covering both the original merge behavior and this fix's provenance contract as current
state.

### Decisions made autonomously

- **Protective-by-default over an opt-in flag.** `clearCurriculumStructure` defaults to
  filtering out merged-in rows; only `deleteCurriculum` explicitly opts into full deletion via
  `{ includeMergedIn: true }`. Rejected the inverse (default to full deletion, callers opt into
  protection) because that reproduces the exact failure shape of the original bug — safety
  depending on every caller remembering a flag, rather than being safe unless a caller
  deliberately asks otherwise. Reversible: the flag can be renamed/inverted later with a
  one-line change to both call sites if this turns out wrong.
- **Preserve the marker across merge chains via `coalesce()`, don't overwrite it.** A module
  merged into A and later re-merged (as part of A) into Z must stay flagged as non-native to Z,
  not get relabeled as "native to A" the moment it moves a second time. Reversible: this is one
  SQL expression, easy to change if a future need for "most recent merge source" instead of
  "original merge source" arises.
- **Scope the column to `modules`/`topics` only** — not `sources`, `socratic_sessions`, or
  `probe_sessions` — because `clearCurriculumStructure` only ever deletes rows from those two
  tables. Matches the review doc's own proposal exactly; adding the marker anywhere
  `clearCurriculumStructure` doesn't reach would be tracking provenance with no consumer.
- **Test against `clearCurriculumStructure`/`mergeCurricula`/`deleteCurriculum` directly, not
  the LLM-backed orchestrator functions** (`reparseCurriculum`, `retryResearch`,
  `mergeSourcesIntoCurriculum`). The existing integration-test suite for this feature never mocks
  the Mastra agent call those functions make; testing at the repo layer exercises the exact
  sequence of operations those functions perform (clear-then-regenerate) without requiring a new
  mocking pattern this suite doesn't otherwise use. `setCurriculumStatus(id, 'failed')` stands in
  directly for "failed later through ordinary use," which is exactly what
  `mergeSourcesIntoCurriculum`'s own catch block does.
- **Leave `mergeSourcesIntoCurriculum`'s `deleteModules(freeModuleIds)` path untouched** — a
  related but distinct risk (see `architecture.md`), out of scope for this issue's specific,
  reviewed fix. Flagged as a candidate follow-up rather than folded in here.
- **No index on the new column.** At this project's current scale (personal, single-user), a
  sequential scan filtered by `curriculum_id` (already the primary access pattern, presumably
  already indexed or small enough not to need one — matches the rest of this schema's existing
  indexing posture) is sufficient; adding one now would be speculative.
- **Migration file generated at implementation time**, not pre-generated during planning, per
  the constitution's migrations-are-generated rule — `/implement-ie` runs `drizzle-kit generate`
  as part of the wiring/migrations implementation step.
- **Plan auto-confirmed by grand-loop (no human present to review) — consistency gate passed
  with 0 gaps.**
- **Consistency gate: PASS — 10/10 checks, 0 gaps** (scenario→acceptance, deriver→scenario [N/A,
  justified], scenario→coverage, diagram→scenario/architecture, todo→spec, constitution,
  scenario→files-by-scenario, documentation, conversation coverage, BAML [N/A]). Full check
  results recorded in the planning session; every scenario in `scenarios.md` has a row in this
  file's "Files by scenario" table, every diagram maps to a real scenario/structural change, and
  every autonomous decision reached during design (including the two limitations surfaced by an
  independent advisor pass — retroactive-protection scope and the reparse/retry-research
  duplication interaction) is written into this file and `architecture.md`, not left only in
  conversation.

### Implementation order

1. Add `mergedFromCurriculumId` to `modules` and `topics` in `apps/api/src/db/schema.ts`.
2. Generate the migration (`drizzle-kit generate`) and run it against the local/e2e DB.
3. Update `clearCurriculumStructure` to accept `{ includeMergedIn?: boolean }` and filter its
   three queries (topicRows select, topics delete, modules delete) accordingly — covers
   SCENARIO 5.
4. Update `mergeCurricula`'s `movedModules`/`movedTopics` updates to write the marker via
   `coalesce()` — covers SCENARIO 1 and SCENARIO 4.
5. Update `deleteCurriculum` to pass `{ includeMergedIn: true }` — covers SCENARIO 3.
6. Write `curriculum-merge-provenance.integration.test.ts` covering SCENARIOS 1, 2, 3, 4 against
   a real Postgres instance.
7. Write `docs/architecture/curriculum-merge/architecture.md`.
8. `tsc --noEmit` and lint clean; run the new integration test plus the existing
   `curriculum-merge-*.integration.test.ts` suite and `gap-mastery-cascade-delete.integration.test.ts`
   to confirm no regression to `deleteCurriculum`'s full-deletion behavior.

### Definition of Done — per layer

**Backend**

Run, against a real local Postgres (`DATABASE_URL`/`E2E_DATABASE_URL`, matching the existing
integration-test convention):

```
npx vitest run apps/api/src/curriculum/curriculum-merge-provenance.integration.test.ts
```

Expected: all tests in this file pass, specifically including a test named along the lines of
`"clearCurriculumStructure preserves merged-in modules/topics when a target that absorbed a
merge fails later through unrelated use and is retried"` (SCENARIO 1) — asserting, after
`mergeCurricula(A, B)` then `setCurriculumStatus(A, 'failed')` then
`clearCurriculumStructure(A)`: B's originally-merged-in module/topic row ids still exist in the
`modules`/`topics` tables with unchanged titles, while A's own native module/topic row ids no
longer exist. A second test (SCENARIO 3) asserts `deleteCurriculum(A)` still removes 100% of
modules/topics under A, merged-in or not, and the `curricula` row itself. A third test
(SCENARIO 4) asserts a two-hop merge chain (B into A, then A into Z) leaves B's original modules
still marked non-native (and therefore still protected) under Z.

Also run the pre-existing suite to confirm no regression:

```
npx vitest run apps/api/src/curriculum/curriculum-merge-concurrency.integration.test.ts apps/api/src/curriculum/curriculum-merge-target-failed-precondition.integration.test.ts apps/api/src/curriculum/curriculum-merge-pending-turn-precondition.integration.test.ts apps/api/src/gap/gap-mastery-cascade-delete.integration.test.ts
```

Expected: all pass unchanged — the concurrency/precondition tests never merge anything before
clearing, so the new filter matches 100% of their rows either way; the gap-mastery cascade test
exercises `deleteCurriculum` on a curriculum with no merged content, so it is unaffected by
`includeMergedIn` either way.

Also confirm typecheck and lint are clean, per the constitution's quality gate:

```
npx tsc --noEmit
```

Expected: zero errors, including in `apps/api/src/curriculum/curriculum.repo.ts` and
`apps/api/src/db/schema.ts`.

**Frontend**

N/A — not touched. This issue and the review doc's proposed fix are both scoped to
`clearCurriculumStructure`'s server-side deletion logic; no API response shape, controller, or
UI component changes. Confirmed while reading `getCurriculumDetail`/`buildModules` — the new
column is read/written only inside `curriculum.repo.ts` and never spread into any API response
object, so no shared type (`packages/shared/src/module.ts`, `topic.ts`) needs a new field.

**Infrastructure**

N/A — not touched. The one infrastructure-adjacent artifact is the Drizzle migration file
itself, covered under Backend above (generated via `drizzle-kit generate`, applied through the
project's existing migrate script, never hand-pushed).

### Scope boundary

Out of scope, named explicitly rather than silently dropped:
- Retroactive protection for merges that happened before this fix ships (see `architecture.md`'s
  Rollout section).
- Full provenance-awareness of `reparseCurriculum`/`retryResearch` end-to-end: this fix stops
  `clearCurriculumStructure` from deleting merged-in modules/topics, but `parseCurriculum`
  (called after the clear, inside `reparseCurriculum`) still regenerates from
  `getCurriculumSourceRows(A)`, which can still include B's moved-in sources — meaning B's
  content can end up duplicated (preserved modules plus freshly regenerated ones covering the
  same material), not lost. `retryResearch`'s unconditional `deleteAllCurriculumSources(A)` has
  the mirror gap: B's modules/topics survive, but the sources that justified them are deleted.
  Named in full in `architecture.md`'s Rollout section; not closed here since it would mean
  extending provenance tracking to `sources`, beyond what issue #68 and its review doc specified.
- `mergeSourcesIntoCurriculum`'s `deleteModules(freeModuleIds)` path, which has its own,
  distinct, provenance-blind module-deletion risk (see `architecture.md`).
- Any UI change to surface provenance to the learner (e.g. a "merged in from X" badge on a
  module) — not requested by the issue or the review doc's proposed fix, and would be a genuine
  new feature, not a bug fix.
- Extending `ontology_merges` (#62) — already ruled out with reasoning in
  `docs/architecture/ontology-audit-trail/architecture.md`.
