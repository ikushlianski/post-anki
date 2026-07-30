---
type: scenarios
branch: gap-mastery-cascade-delete
task: "Clean up orphaned gap_mastery rows left behind by gap/topic/module/curriculum deletion"
state: confirmed
updated: 2026-07-30
---

# Scenarios: gap_mastery cascade delete

Ticket tag for e2e: `@GAPMASTERYDEL` (unused by this plan — see note below). Target project:
`post-anki`. Target feature: none (no UI surface; this is a repository-layer fix under
`apps/api/src/{gap,topic,module,curriculum}`).

**Proof-mechanism note (mirrors `.planning/generalize-gap-tracking/scenarios.md` SCENARIO 8's own
precedent):** this plan has exactly one scenario, and it is a **vitest integration test**, not a
Playwright e2e test. Every reader of `gap_mastery` joins through `gaps`
(`listMasteryTrackedGapsAcrossSubjects` uses an INNER JOIN) — an orphaned `gap_mastery` row is
invisible to every screen in the app. A Playwright browser test cannot detect this defect in either
direction: the UI renders identically whether the orphan exists or not. The only way to prove "zero
orphaned rows remain" is to query the table directly, which is exactly what an integration test
does and a browser-driven test cannot. This scenario is tagged with a file-path checkbox, not
`@GAPMASTERYDEL.S1` — the scenario-coverage gate reads Playwright tags specifically, and an
integration-only test mistagged that way would falsely appear as missing e2e coverage.

---

## SCENARIO 1 — Deleting a gap's topic, module, or curriculum also deletes its gap_mastery row

A gap has an active `gap_mastery` row (created the normal way — a learner answered a probe-session
question tied to that gap, via `applyGapMasteryAttempt`). Separately, someone deletes the gap's
topic, or the module that owns that topic, or the curriculum that owns that module — any of the
four call sites that delete `gaps` rows. Today, the `gaps` row disappears but the `gap_mastery` row
is left behind forever, orphaned.

**Setup role:** subject = the deletion call itself (`deleteTopic` / `deleteModule` /
`deleteModules` / `clearCurriculumStructure`, invoked directly against a real transaction — not
through the browser UI, matching the concurrency-fix precedent's own integration-test-not-e2e
shape); scenery = the subject/curriculum/module/topic/gap hierarchy and the pre-existing
`gap_mastery` row, all seeded directly via SQL inserts in the test (mirrors
`gap-mastery-concurrency.integration.test.ts`'s `seedScenery` helper).

**UI clicking notes:** N/A — backend integration test, no browser involved. There is no UI change
in this item at all: no button, no confirmation dialog, no visible list changes, because the
`gap_mastery` table has no UI surface of its own.

**Acceptance:**
```
Code:
  - New function `deleteGapMasteryForGapIds(gapIds: string[], db: DbExecutor): Promise<void>` in
    gap-mastery.repo.ts, matching the existing DbExecutor-parameter convention already used by
    getGapMasteryRowsForUpdate in the same file. Body: `if (gapIds.length === 0) return;` then
    `await db.delete(gapMastery).where(inArray(gapMastery.gapId, gapIds));`.
  - topic.repo.ts `deleteTopic(topicId)`: wrap the existing body in
    `getDb().transaction(async (tx) => {...})`. Before `tx.delete(gaps).where(eq(gaps.topicId,
    topicId))`, select the gap ids for this topic
    (`tx.select({ id: gaps.id }).from(gaps).where(eq(gaps.topicId, topicId))`) and call
    `deleteGapMasteryForGapIds(gapIds, tx)`. `deleteLectureForTopic` /
    `deleteLectureSourceCandidatesForTopic` calls move inside the same transaction, taking `tx`
    if their signatures accept a DbExecutor, otherwise called with `getDb()` as before (verify
    signatures during implementation — unrelated to this fix's scope either way).
  - module.repo.ts `deleteModule(moduleId)`: same pattern — wrap in `getDb().transaction()`,
    collect the gap ids for every topic under this module (across the existing per-topic loop, or
    via one `inArray(gaps.topicId, topicIds)` select — implementer's choice, doesn't change
    behavior), call `deleteGapMasteryForGapIds` before `tx.delete(gaps)`.
  - curriculum.repo.ts `deleteModules(moduleIds)`: same pattern.
  - curriculum.repo.ts `clearCurriculumStructure(curriculumId)`: same pattern. (This function is
    the sole gaps-deletion path inside `deleteCurriculum` — no separate change needed in
    `deleteCurriculum` itself.)
  - Edge cases: a topic/module/curriculum with zero gaps (no-op delete, `gapIds.length === 0`
    short-circuits — no error, no unnecessary query); a gap with no `gap_mastery` row at all
    (never-attempted gap — the `inArray` delete matches zero rows, no error); deleting a
    module/curriculum that spans multiple topics each with their own gap_mastery rows (all deleted,
    not just the first topic's).
Behavior:
  - After any of the four deletions, `SELECT * FROM gap_mastery WHERE gap_id = ANY($1)` for the
    deleted gap ids returns zero rows.
  - No change to which `gaps` rows get deleted, no change to `gaps.state` semantics, no change to
    any existing return value or caller-visible behavior of the four functions — this is additive
    cleanup only.
BE: `gap_mastery` row(s) deleted in the same transaction as the `gaps` row(s) — proven directly by
    the integration test's post-delete query, not inferred from code review.
FE: None — no UI reads or writes `gap_mastery` directly.
Infra: None — no migration, no new table, no new environment variable.
Tests:
  [x] apps/api/src/gap/gap-mastery-cascade-delete.integration.test.ts — covers all four call sites
      in one file, one `describe` block, four `it` cases:
        1. deleteTopic on a topic whose gap has an active gap_mastery row → zero gap_mastery rows
           remain for that gap id.
        2. deleteModule on a module owning one topic with a mastery-tracked gap → same assertion.
        3. deleteModules (bulk) on two modules, each owning a topic with a mastery-tracked gap →
           zero gap_mastery rows remain for BOTH gap ids (proves the bulk path, not just the
           single-module path).
        4. clearCurriculumStructure (via deleteCurriculum) on a curriculum owning a module owning a
           topic with a mastery-tracked gap → zero gap_mastery rows remain.
      Every case seeds its own gap_mastery row directly via SQL insert (mirrors
      gap-mastery-concurrency.integration.test.ts's seedScenery pattern) BEFORE calling the
      deletion function, then queries gap_mastery directly by gap id AFTER, asserting an empty
      result — never inferring absence from the gaps table or from any API response.
```
