---
type: scenarios
branch: curriculum-merge
state: confirmed
updated: 2026-07-31
---

# Scenarios — curriculum-merge

## SCENARIO 1 — Merging two curricula with real children reassigns every one, none orphaned or duplicated

The flagship scenario, the direct e2e counterpart to `ontology-split-merge`'s SCENARIO 1, one level
deeper: instead of merging subjects that own curricula, this merges two curricula that each own
real modules/topics/tags/sources. One subject owns two curricula — call them "React Hooks (old)"
and "React Hooks (new)", the exact duplicate the issue names as its motivating example. Each reaches
its taggable, real-modules-and-topics state via the same `studyTechnology` (docUrl against the
`mock-docs-site` fixture) → poll `awaiting_source_approval` → `POST .../approve-sources
{override:true}` → poll `shaping_structure` → `POST .../confirm-structure` → poll `ready` sequence
`ontology-split-merge`'s own SCENARIO 1 already proved necessary and sufficient (verified again here:
`curriculum.$curriculumId.tsx`'s `editable` flag, gating both manual module edits and the tag
picker, requires `status: 'ready' | 'confirmed'`). One module in each curriculum gets tagged (two
different tags, so the test can tell them apart after the merge). The user decides "React Hooks
(new)" is the one that survives and merges "React Hooks (old)" into it.

**UI clicking notes**: On the home page, the surviving subject's card lists both curricula. Each
curriculum row (`<li>`, next to its existing "Delete curriculum" button) gets a "Merge into…"
control — same confirm-arm pattern as `MergeSubjectButton`: click reveals a `<select>` of every
OTHER curriculum under the same subject card + Confirm/Cancel, click elsewhere/Cancel collapses it
back. Selecting "React Hooks (new)" and clicking Confirm submits immediately (no second modal); the
button shows a busy state, then the "React Hooks (old)" row disappears from the subject card's
curricula list entirely (its row was deleted) after a page-data refetch — matching
`DeleteCurriculumButton`'s existing `router.invalidate()`-after-mutation shape in the same file.

**Acceptance**:

- **BE**:
  - `POST /curricula/:targetId/merge` with `{ sourceCurriculumId }`: inside one `db.transaction()`
    via `withMergeLock`, acquires `pg_advisory_xact_lock(hashtext(id))` for both ids (sorted string
    order), re-reads both curricula post-lock, `UPDATE modules SET curriculum_id = target, "order" =
    "order" + :targetMaxOrder WHERE curriculum_id = source`, `UPDATE topics SET curriculum_id =
    target WHERE curriculum_id = source`, `UPDATE sources SET curriculum_id = target WHERE
    curriculum_id = source`, `UPDATE socratic_sessions SET curriculum_id = target WHERE curriculum_id
    = source`, `UPDATE probe_sessions SET curriculum_id = target WHERE curriculum_id = source`,
    `DELETE FROM curriculum_structure_turns WHERE curriculum_id = source`, `DELETE FROM
    structure_research_candidates WHERE curriculum_id = source`, `DELETE FROM curricula WHERE id =
    source`, commits, returns `{ targetCurriculumId, sourceCurriculumId, modulesMoved, topicsMoved,
    sourcesMoved, socraticSessionsMoved, probeSessionsMoved }`.
  - Input: `{ sourceCurriculumId: string }`, validated via `mergeCurriculaInput` (new schema in
    `packages/shared/src/curriculum.ts`).
  - Post-merge: `GET /curricula/:targetId` module count equals pre-merge target-count +
    pre-merge-source-count; same for topic count (duplicate-free — a distinct claim from
    orphan-free, both asserted). Both tag chips (target's own + the one that was on the source's
    module) are present on their respective modules under the target.
  - Zero-orphan proof, direct SQL: `count(*) FROM <table> WHERE curriculum_id = source` is 0 for
    `modules`, `topics`, `sources`, `socratic_sessions`, `probe_sessions`,
    `curriculum_structure_turns`, `structure_research_candidates`; `SELECT * FROM curricula WHERE id
    = source` returns no row.
  - Denormalization-invariant proof: `SELECT t.id FROM topics t JOIN modules m ON t.module_id = m.id
    WHERE t.curriculum_id <> m.curriculum_id` returns zero rows for the target after merge.
  - Deliberate-exclusion proof: `count(*) FROM llm_call_events WHERE curriculum_id = source` is
    greater than 0 after the merge (the structure-generation call from setup), proving this table
    was correctly left untouched rather than the reassignment silently no-op'ing on it.
- **FE**:
  - `MergeCurriculumButton` in `subject-section.tsx` — confirm-arm pattern, target `<select>` sourced
    from the same `curricula` array `SubjectSection` already receives (pre-filtered to the current
    subject by its caller), minus the curriculum itself.
  - After confirm, the merged-away curriculum's row is gone from the subject card's list; the
    surviving curriculum, when navigated into, shows both its own original modules and the moved
    modules, each still carrying its own tag chip.
- **Infra**: None.
- **Tests**:
  ```
  [x] @curriculum-merge.S1 — e2e test written
  ```

---

## SCENARIO 2 — The merge-target picker only ever offers another curriculum in the same subject

The curriculum-merge analogue of `ontology-split-merge`'s SCENARIO 2: guards the one hard
precondition (same-subject) at the UI layer as well as the API layer, defense in depth.

**UI clicking notes**: Two subjects each own one curriculum. Opening the merge picker on either
curriculum's row renders a `<select>` whose option list is every OTHER curriculum under **that same
subject's card** — since `SubjectSection` only ever receives the curricula already filtered to its
own subject (`curricula.filter((c) => c.subjectId === subject.id)` in `HomeView`), a curriculum
belonging to a different subject is never even in the array the picker is built from; there is
nothing to filter out at render time beyond excluding the curriculum's own id, unlike
`MergeSubjectButton`'s dropdown which needed an explicit `kind`/self filter over the full
`allSubjects` list.

**Acceptance**:

- **BE**:
  - `curl -X POST` a merge with `sourceCurriculumId === targetId` → 400 `self_merge`, verified via
    direct SQL that neither curriculum's rows changed.
  - `curl -X POST` a merge between two curricula under **different** subjects → 400
    `different_subjects`, no writes, verified via direct SQL.
- **FE**:
  - A subject card that owns exactly one curriculum shows no merge-target options (an empty
    `<select>` beyond the placeholder, or the merge control itself renders no usable target) —
    matching the natural consequence of the picker only ever listing same-subject siblings.
  - A subject card that owns two curricula shows exactly one option in each curriculum's
    merge-target `<select>`: the other curriculum, never itself.
- **Infra**: None.
- **Tests**:
  ```
  [x] @curriculum-merge.S2 — e2e test written
  ```

---

## SCENARIO 3 — Two concurrent merges for the same source curriculum don't corrupt data (backend-only)

Mirrors `ontology-split-merge`'s own SCENARIO 5 (subject-merge concurrency) and this project's
`phrase-bank-concurrency-fix` precedent: a deliberately constructed concurrent pair of requests
proves the advisory lock actually serializes them, rather than trusting the transaction wrapper
alone. Not e2e — a UI can't reliably construct this exact interleaving; the lock's correctness is a
database-level property, proven the same way `ontology-split-merge` already proved it for subjects.

**Acceptance**:

- **BE**:
  - Seed (direct SQL, mirroring `gap-mastery-cascade-delete.integration.test.ts`'s harness): one
    subject; curriculum A (source) with one module/one topic; curricula B and C (two candidate
    targets) under the same subject.
  - Fire `POST /curricula/B/merge {sourceCurriculumId: A}` and `POST /curricula/C/merge
    {sourceCurriculumId: A}` concurrently (`Promise.all`, real HTTP or real function calls against a
    real Postgres connection pool — not mocked).
  - Exactly one of the two succeeds (`modulesMoved: 1, topicsMoved: 1`); the other returns a clean
    404 `not_found` (A no longer exists by the time its post-lock re-read runs) — never a 500, never
    both claiming success, never a state where A's module/topic ends up attached to neither B nor C.
  - Direct SQL check after both requests resolve: exactly one of B or C shows `count(*) FROM modules
    WHERE curriculum_id = <winner>` = 1; the loser shows 0; curriculum A no longer exists.
- **FE**: None — backend-only scenario, deliberate race exercised via direct concurrent calls, not
  browser clicks (a UI cannot reliably construct this interleaving).
- **Infra**: None.
- **Tests**:
  ```
  [x] curriculum-merge-concurrency.integration.test.ts covers: two concurrent merges targeting the
      same source curriculum — one succeeds with the expected moved counts, the other 404s cleanly,
      no partial/duplicated ownership of the source's modules
  ```

---

## SCENARIO 4 — A curriculum being merged away with a pending assistant structure-shaping turn refuses to merge; a pending turn on the survivor does not block it (backend-only)

The one genuinely new precondition curriculum merge needs that subject/tag merge never had to check
(see spec.md Decision #2). Not e2e: reliably landing a real curriculum in the exact
`role='assistant', status='pending'` window (the narrow moment between `submitStructureTurn`
inserting its placeholder row and the agent call resolving) via browser clicks against the mocked
LLM would be flaky-by-construction — this project's own mock-openrouter has no built-in "hang
forever" lever, so a real front-door reproduction would race the mock's real (fast) response every
time. A direct SQL seed of that exact row shape is the honest, deterministic way to set up this
precondition, mirroring how `ontology-split-merge`'s own DoD used a direct `domain_nodes` insert for
a state with no independent HTTP creation path.

**Acceptance**:

- **BE**:
  - Case 1 (source has the pending turn): seed curriculum B (source) with one
    `curriculum_structure_turns` row (`role: 'assistant', status: 'pending'`) inserted directly via
    SQL; curriculum A (target) has none. `POST /curricula/A/merge {sourceCurriculumId: B}` → 400
    `pending_structure_turn`. Direct SQL confirms neither A's nor B's
    `modules`/`topics`/`curriculum_structure_turns` rows changed — the merge is fully rejected, not
    partially applied.
  - Case 2 (target has the pending turn, source does not — the precondition is source-scoped, not
    symmetric, per Decision #2's verified reasoning that a pending turn on the survivor is never put
    at risk by this merge): seed curriculum A (target) with the pending row instead, B (source)
    clean. `POST /curricula/A/merge {sourceCurriculumId: B}` succeeds normally; A's own pending turn
    row is untouched afterward (still `pending`, same `id`).
  - Case 3: both curricula have a `curriculum_structure_turns` row but with `status: 'complete'`
    (not `pending`) → the merge proceeds normally; B's row is deleted (per Decision #2's normal-case
    behavior), A's own `complete` row is untouched.
- **FE**: None — backend-only scenario, same reasoning as above.
- **Infra**: None.
- **Tests**:
  ```
  [x] curriculum-merge-pending-turn-precondition.integration.test.ts covers: merge rejected with
      400 pending_structure_turn when the SOURCE has a pending assistant turn, no partial writes;
      merge SUCCEEDS when only the TARGET has a pending turn, which survives untouched; merge
      proceeds normally (deleting, not reassigning) when the turn is 'complete' on either side
  ```
