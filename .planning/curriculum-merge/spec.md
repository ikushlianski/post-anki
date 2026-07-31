---
type: spec
branch: curriculum-merge
task: "Add curriculum-level merge — two duplicate curricula within the same subject (issue #60)"
complexity: medium
state: confirmed
updated: 2026-07-31
verification:
  targetDb: post-anki-e2e (local Docker Postgres, :5436)
  playwrightPlan: .planning/curriculum-merge/playwright.md
  stateFixtures: .planning/curriculum-merge/state-fixtures.md
---

# Spec: Curriculum merge

## What this ships

One new "merge" operation, reachable from the app: from a subject's card on the home page, absorb
one curriculum into another curriculum in the **same subject**. Every module, topic, gap, tag
assignment, gap-mastery row, lecture, source, and Socratic/probe session state owned by the
absorbed curriculum is preserved and correctly attached to the surviving curriculum; the absorbed
curriculum's own row is deleted. This is the piece of issue #56's original "split or merge
subjects/courses/tags" scope that `ontology-split-merge` deliberately deferred (see that plan's
Decision #2) — it completes the merge trio (Subject, Tag, Curriculum) using the exact same
mechanism, generalized to a nested child set.

No schema migration. No new tables or columns.

## Scope boundary

**In scope**: merge only, for two curricula sharing the same `subjectId`.

**Out of scope, logged as fast-follows or explicitly rejected**:

- **Module/topic reconciliation.** No attempt to detect or merge similarly-titled modules/topics
  between the two curricula. See Decision #1 — verified safe as a deliberate simplification, not a
  placeholder for later work forced by time pressure.
- **Cross-subject curriculum merge.** A curriculum has exactly one owning subject; merging across
  subjects would mean picking a winner for a field with no natural "target survives" answer here
  the way `mergeSubjects`' `kind` restriction did. Rejected outright — the issue's own scope names
  "same subject" duplicates.
- **Split, for any entity.** Same reasoning `ontology-split-merge` already gave: a strict
  reassignment has no judgment call about where a child goes; split does.
- **Closing the `saveCurriculumPlan`/`createCurriculum`-vs-merge concurrency window.** See Decision
  #5 — the same class of residual race `ontology-split-merge` already documented and deferred for
  `createCurriculum`-vs-subject-merge.
- **An audit trail for this merge (or the other two).** Tracked separately as wishlist issue #62.

## Data model

No changes. Every table this merge touches (`curricula`, `modules`, `topics`, `sources`,
`socratic_sessions`, `probe_sessions`, `curriculum_structure_turns`,
`structure_research_candidates`, `llm_call_events`, plus `gaps`/`gap_mastery`/`tag_assignments`/
`lectures` which are untouched by construction — see below) keeps its current shape. Pure
reassignment/deletion over existing columns.

## The full child-table enumeration (verified by grep, not inferred from schema column names)

Every table with a `curriculum_id` (or, for `tag_assignments`, a `node_id` that can point at a
module/topic owned by a curriculum) column, and what merge does to it:

| Table | Column | Action on merge | Why |
|---|---|---|---|
| `modules` | `curriculum_id` | **Reassign** to target, `order` offset past target's current max | Becomes additional modules under the target — see Decision #1 |
| `topics` | `curriculum_id` (denormalized alongside `module_id`) | **Reassign** to target, same statement as its owning module | `getCurriculumDetail` fetches topics by `curriculum_id` directly — orphaned if forgotten (see Decision #1 and the DoD's invariant check) |
| `sources` | `curriculum_id` | **Reassign** to target | Becomes additional sources under the target, same "no data loss" principle as modules |
| `socratic_sessions` | `curriculum_id` | **Reassign** to target | Denormalized alongside `topic_id`; the topic's id doesn't change, but this column would dangle if left alone |
| `probe_sessions` | `curriculum_id` (nullable) | **Reassign** to target where set | Set for module/topic-scoped sessions (verified: `probe_session.repo.ts` never sets `scope`/`scopeId` to a curriculum — `probeScopeSchema` is `module \| topic \| tag` — so no `scopeId` reassignment is needed here, only the separate `curriculumId` column) |
| `curriculum_structure_turns` | `curriculum_id` | **Delete** (source's rows only) | See Decision #2 — reassigning risks a real constraint violation and always produces an incoherent interleaved chat thread |
| `structure_research_candidates` | `curriculum_id` | **Delete** (source's rows only) | Same reasoning as its sibling table above — Phase-5 shaping scaffolding, not learner-facing content |
| `llm_call_events` | `curriculum_id` (nullable) | **Left alone** (rows keep pointing at the deleted source id) | See Decision #3 — an append-only observability log; reassigning would falsify which curriculum an LLM call actually ran against. Verified `admin-observability.controller.ts` already tolerates a missing name lookup (`namesByCurriculumId.get(e.curriculumId) ?? null`) |
| `gaps` | `topic_id` (not `curriculum_id`) | **Untouched** | Keyed by `topic_id`, which is stable across the topic's `curriculum_id` reassignment |
| `gap_mastery` | `gap_id` (not `curriculum_id`) | **Untouched** | Same reasoning, one hop further |
| `tag_assignments` | `node_id` (module/topic id, not `curriculum_id`) | **Untouched** | Same reasoning as `mergeTags`' own subject-merge no-op case — verified module/topic ids never change |
| `lectures`, `lecture_sections`, `lecture_citations`, `lecture_source_candidates` | `topic_id`/`lecture_id` (not `curriculum_id`) | **Untouched** | Same reasoning |
| `probe_session_questions` | `topic_id`/`session_id` (not `curriculum_id`) | **Untouched** | Same reasoning |

`curricula.domain_node_id` on the source row is simply lost when the source row is deleted — see
Decision #4.

## New endpoint

| Method | Path | Body | Behavior |
|---|---|---|---|
| POST | `/curricula/:targetId/merge` | `{ sourceCurriculumId: string }` | Absorbs `sourceCurriculumId` into `:targetId`. Target survives (keeps name/description/status/all its own fields); source is deleted. |

Matches this codebase's existing action-verb sub-path convention (`/curricula/:id/confirm-structure`,
`/subjects/:id/merge`, `/tags/:id/merge`).

### `POST /curricula/:targetId/merge` — behavior contract

Preconditions (checked inside the transaction, after acquiring locks — never before, for the same
check-then-act reason `mergeSubjects`/`mergeTags` already establish):

1. `targetId !== sourceCurriculumId` → 400 `self_merge`.
2. Both curricula exist → 404 `not_found`.
3. Both curricula have the same `subjectId` → 400 `different_subjects`.
4. The SOURCE curriculum does not have a `curriculum_structure_turns` row with `role='assistant' AND
   status='pending'` → 400 `pending_structure_turn` (see Decision #2 — this is the one real new
   precondition curriculum merge needs that subject/tag merge never had to check. Scoped to the
   source only, not the target — see Decision #2 for why a target-side check was considered and
   rejected as unjustified by any real mechanism).

Procedure, inside one `db.transaction()` (via the shared `withMergeLock` helper — see Decision
#6/architecture.md):

1. Acquire `pg_advisory_xact_lock(hashtext(id))` for both `targetId` and `sourceCurriculumId`, in
   sorted string order.
2. Re-read both curricula inside the lock. Either missing → 404 `not_found`.
3. Re-check `subjectId` match and the source's pending-turn precondition against the
   freshly-read/re-queried state.
4. `UPDATE modules SET curriculum_id = target, "order" = "order" + :targetMaxOrder WHERE
   curriculum_id = source` — one statement computes the offset and the reassignment together.
   `:targetMaxOrder` = `MAX(order)` over the target's existing modules (0 if it has none).
5. `UPDATE topics SET curriculum_id = target WHERE curriculum_id = source` — topic `order` is
   scoped by `module_id`, not `curriculum_id` (verified: `sortForDisplay` is only ever called with
   modules-of-one-curriculum or topics-of-one-module, never topics-of-one-curriculum), so no offset
   is needed here.
6. `UPDATE sources SET curriculum_id = target WHERE curriculum_id = source`.
7. `UPDATE socratic_sessions SET curriculum_id = target WHERE curriculum_id = source`.
8. `UPDATE probe_sessions SET curriculum_id = target WHERE curriculum_id = source`.
9. `DELETE FROM curriculum_structure_turns WHERE curriculum_id = source`.
10. `DELETE FROM structure_research_candidates WHERE curriculum_id = source`.
11. `DELETE FROM curricula WHERE id = source` — direct delete, not `deleteCurriculum()` (same
    reasoning `mergeSubjects` already established for bypassing `deleteSubject()`: by the time this
    delete runs, every module/topic has already been moved off the source, so calling
    `deleteCurriculum()` instead would be a no-op-equivalent cascade followed by the same row
    delete — not a shortcut past something real. `llm_call_events` and `sources` rows referencing
    the source id are the two places `deleteCurriculum()` and this merge diverge — `sources` are
    already moved by step 6 above, and `deleteCurriculum()` never touches `llm_call_events` either,
    so no behavior is actually skipped).
12. Commit. Return `{ targetCurriculumId, sourceCurriculumId, modulesMoved, topicsMoved,
    sourcesMoved, socraticSessionsMoved, probeSessionsMoved }`.

No changes needed to `gaps`, `gap_mastery`, `tag_assignments`, `lectures`,
`lecture_sections`/`lecture_citations`/`lecture_source_candidates`, or `probe_session_questions` —
verified by grep (see discussion.md) that none of them reference `curriculum_id`, only
`topic_id`/`module_id`/`gap_id`/`lecture_id`, all of which are stable across this reassignment.

## Frontend

- `apps/web/src/subject/subject-section.tsx` — new `MergeCurriculumButton` component, added next to
  the existing `DeleteCurriculumButton` inside each curriculum `<li>`. Same confirm-arm interaction
  pattern (click "Merge into…" → `<select>` of every OTHER curriculum in the same `curricula` prop
  (already subject-filtered by the caller — `HomeView`'s `curricula.filter((c) => c.subjectId ===
  subject.id)`) → Confirm/Cancel). No new prop needed on `SubjectSection` — the same-subject
  filtering is a free byproduct of the data it already receives, unlike `MergeSubjectButton` which
  needed a separate `allSubjects` prop for its cross-subject picker.
- `apps/web/src/curriculum/curriculum.api.ts` (where `deleteCurriculum` already lives, already
  imported into `subject-section.tsx`) — new `mergeCurriculum` server function
  (`createServerFn({ method: 'POST' })`, matches `deleteCurriculum`'s existing shape).
- New testids, mirroring `MergeSubjectButton`'s exact naming: `curriculum-merge-button-${id}`,
  `curriculum-merge-target-select-${id}`, `curriculum-merge-confirm-${id}`,
  `curriculum-merge-cancel-${id}`.

## Files to create

```
apps/api/src/shared/
  merge-lock.ts               — withMergeLock(targetId, sourceId, run) helper (see Decision #6)
```

## Files to modify

```
apps/api/src/
  curriculum/curriculum.repo.ts       — + mergeCurricula(targetId, sourceId)
  curriculum/curriculum.controller.ts — + handleMergeCurricula
  router.ts                           — + POST /curricula/:id/merge
  subject/subject.repo.ts             — mergeSubjects refactored onto withMergeLock (Decision #6)
  tag/tag.repo.ts                     — mergeTags refactored onto withMergeLock (Decision #6)

apps/web/src/
  subject/subject-section.tsx         — + MergeCurriculumButton
  curriculum/curriculum.api.ts        — + mergeCurriculum server fn

packages/shared/src/
  curriculum.ts                       — + mergeCurriculaInput, mergeCurriculaResultSchema
                                         (naming matches the repo function mergeCurricula, per
                                         the existing mergeSubjectsInput→mergeSubjects,
                                         mergeTagsInput→mergeTags convention)
```

## Decisions made autonomously

1. **Module/topic reconciliation: B's modules become additional modules under A, no matching
   attempted.** Verified safe by reading the schema directly: no unique index on `modules.title` or
   `topics.title` (`db/schema.ts`'s `modules`/`topics` table defs carry no `uniqueIndex` at all), and
   module/topic ids are stable across the `curriculum_id` reassignment — `gaps`, `gap_mastery`,
   `lectures`, `tag_assignments`, `probe_session_questions` all keep resolving correctly with zero
   additional writes, the same way `mergeSubjects` verified `tag_assignments` needs no touch because
   module/topic ids don't change when their owning curriculum's `subject_id` changes. This matches
   the project's own established pattern (shipping the simple, safe version first — see
   `phrase-bank-concurrency-fix`'s primary-fix-now/residual-logged-later precedent) rather than
   attempting title-similarity matching, which is a genuinely harder, separately-plannable problem
   (structurally the same category as `ontology-split-merge`'s deferred "split" scope). Two
   consequences that follow from this and are load-bearing, not incidental: (a) `topics.curriculum_id`
   must be reassigned in the SAME statement class as `modules.curriculum_id` — `getCurriculumDetail`
   fetches topics by `curriculum_id` directly, so a forgotten topic reassignment renders the moved
   modules with zero topics under them, silently; (b) the source's modules get their `order` offset
   past the target's current max order before reassignment (one `UPDATE ... SET "order" = "order" +
   :targetMaxOrder` alongside the `curriculum_id` write), since `sortForDisplay`'s non-strict mode
   breaks same-priority ties on raw `order` value and two independently-numbered module sequences
   landing under one curriculum with duplicate `order` values would visually interleave in a
   confusing way (JS `Array.sort` is stable, so it wouldn't crash — but the resulting order would
   depend on incidental DB row-fetch order, not on anything meaningful).

2. **`curriculum_structure_turns` and `structure_research_candidates` are DELETED for the source, not
   reassigned — with a new precondition rejecting the merge outright if the SOURCE curriculum has a
   pending assistant turn.** Found via an independent architect review of this plan before writing
   it: `curriculum_structure_turns_pending_assistant_unique` is a partial unique index on
   `(curriculum_id) WHERE role='assistant' AND status='pending'`. A naive
   `UPDATE curriculum_structure_turns SET curriculum_id = target WHERE curriculum_id = source` would
   violate that constraint — and abort the whole merge transaction with a raw Postgres error, not a
   clean 400 — whenever BOTH curricula happen to have a pending assistant turn at merge time. That
   case is not a rare edge: "notice a duplicate exists while shaping the second one" (both curricula
   sitting in `shaping_structure` with an in-flight draft) is a plausible, maybe even the *modal*,
   real-world trigger for wanting to merge two curricula in the first place. Even in the narrower
   window where the constraint wouldn't fire, `curriculum_structure_turns.order` is a per-curriculum
   monotonic sequence (`insertStructureTurn` = `max(existing) + 1`) — reassigning two independent
   chat histories into one curriculum interleaves them into a thread that reads as nonsense. Both
   problems are avoided the same way: these two tables are Phase-5 draft-structure-shaping
   scaffolding for the curriculum that's about to stop existing, not learner-facing structural
   content the way a module/topic/gap/tag is — so deleting the source's rows (not reassigning them)
   is not user-visible data loss the way losing a module would be, and the merge additionally
   refuses outright (400 `pending_structure_turn`, re-checked *inside* the lock) when the source has
   an assistant turn still mid-generation, since deleting a turn currently being written to is a
   different, worse hazard than deleting settled scaffolding.

   **Scoped to the source only, not the target — verified, not assumed.** A first draft of this
   precondition checked both ids symmetrically "to be safe." Traced this through before committing
   to it: the target's own `curriculum_structure_turns` rows are never touched by this merge (only
   the source's are deleted), and a pending turn resolving in the background
   (`generateDraftStructure`/`retryDraftStructure`'s fire-and-forget dispatch calling
   `updateStructureTurn`) writes back to that same turn row by its own id — it never touches
   `modules`/`topics`, since real module/topic rows are only ever written by the explicit,
   user-triggered `confirmStructure` (read in full: it calls `saveCurriculumPlan` directly, with no
   `clearCurriculumStructure()` call first). So there is no concrete mechanism by which a pending
   turn on the TARGET is put at risk by this merge, and checking it anyway would reject legitimate
   merges (e.g. "I'm mid-conversation shaping curriculum A's structure and want to fold duplicate B
   into it right now") for a hazard that doesn't exist under this design. The precondition is
   source-only for this reason, not by oversight.

3. **`llm_call_events.curriculum_id` is deliberately left dangling — not reassigned, not deleted.**
   It's an append-only observability log (`generateWithRetry`'s post-hoc write, one row per finished
   LLM call). Reassigning it would misrepresent history: the call ran against the source curriculum,
   and rewriting that after the fact makes the log lie about what actually happened. Verified this is
   safe, not just directionally reasonable: `admin-observability.controller.ts`'s only consumer reads
   `namesByCurriculumId.get(e.curriculumId) ?? null` — a dangling id after the source curriculum is
   deleted just renders `curriculumName: null` in the admin view, not an error. Excluded from this
   plan's zero-orphan proof scope for exactly this reason — its rows are *expected* to still
   reference the deleted id after a merge, and a SELECT that expected 0 there would be asserting the
   wrong thing. The DoD proves this as an **unchanged-count** claim (snapshot the count before the
   merge, assert the identical count after) rather than a bare "count > 0" — a bare lower-bound check
   would depend on test setup happening to produce at least one `llm_call_events` row and would be
   asserting something about setup, not about the merge; an unchanged count is the actual claim this
   decision makes, true regardless of how many rows setup produced.

   **Documented consequence: reassigning `sources` (Decision, reassignment-set table above) can
   change the target's displayed origin badge.** `resolveCurriculumOrigin()` derives
   `Curriculum.origin` from the set of `sources.kind` values a curriculum owns, and
   `subject-section.tsx` renders a "🔎 Researched" `OriginBadge` when `origin === 'research'`. Moving
   the source curriculum's `sources` rows onto the target can flip the target's origin from
   `'sources'` to `'research'` (or vice versa, depending on which side had which kind of source) —
   this is a correct, intended side effect of "the target now genuinely owns more sources", not a
   bug, but is worth naming since S1's Acceptance asserts on DOM state and an implementer should not
   be surprised by the badge changing. Similarly, if the source curriculum had any
   `approval_status: 'pending'` sources, they move to the target still `pending` — if the target's
   own status has already advanced past `awaiting_source_approval`, no existing UI path re-surfaces
   them for approval (the source-approval panel is gated on curriculum status, not on a per-source
   check). Neither is fixed here; both are named so they're recognized as consequences of Decision
   #3's reassignment choice rather than mistaken for bugs during implementation or review.

4. **`curricula.domain_node_id` on the source is simply dropped when the source row is deleted — not
   reassigned.** The target survives keeping its own `domain_node_id` (or lack of one), matching
   `mergeSubjects`' own "target survives with its own fields" precedent exactly. This is a real,
   small, documented semantic loss: if the source curriculum was placed on a domain-map node, that
   node loses its placed curriculum the moment the source is merged away — nothing else takes its
   place on that node. Adjacent to wishlist issue #61 (domain-node merge), not fixed here; a domain
   node that ends up with zero placed curricula after this kind of merge is a legitimate,
   pre-existing possible state today anyway (any curriculum can be deleted outright via
   `DELETE /curricula/:id` with the same effect on its node).

5. **The `saveCurriculumPlan`-vs-merge concurrency window is documented, not closed, in this pass —
   two concrete instances, both verified by reading the actual call sites, not hypothesized.** Same
   class of gap as `ontology-split-merge`'s already-documented and deferred
   `createCurriculum`-vs-subject-merge race (see `docs/architecture/ontology-split-merge/
   review.md`):
   - **Instance A (source-side, invisibility, not corruption):** `saveCurriculumPlan` (called from
     `confirmStructure`/`parseCurriculum`) writes `modules`/`topics` rows under a `curriculumId` it
     read earlier in the same handler, with no re-check and no shared lock against a concurrent
     merge of that same curriculum. If a merge deletes the curriculum in the narrow window between
     that read and the write, the resulting rows land under a `curriculum_id` that no longer
     resolves to any `curricula` row — silently unreachable from the UI, not corrupted data.
   - **Instance B (target-side, real data loss, found while resolving whether the
     `pending_structure_turn` precondition needed a target-side check too — see Decision #2's
     verification note):** `reparseCurriculum`/`retryResearch` (triggered by
     `POST /curricula/:id/reparse` and `POST /curricula/:id/retry-research`) both call
     `clearCurriculumStructure(curriculumId)` — which deletes EVERY module/topic/gap for that
     curriculum id — before regenerating from scratch. If a user fires "reparse curriculum A" and
     "merge B into A" as two separate actions within the same narrow window, and the reparse's clear
     step runs after the merge's reassignment, it deletes not just A's own original modules but also
     the modules the merge just moved in from B — real, silent data loss, not mere invisibility.
     This is a materially worse instance of the same class of gap than Instance A, and is logged
     here explicitly rather than being narrowed into a false sense of safety by only checking for
     pending structure-shaping turns (which don't protect against this at all).

   Triggering either instance requires the same operator to fire two separate UI actions on the same
   curriculum within roughly the same sub-second window — this project's single-user framing and its
   own established precedent (ship the primary fix, log the residual race, per
   `phrase-bank-concurrency-fix` and `ontology-split-merge`'s own Decision #6) make deferring both
   consistent, not a new corner cut. Closing Instance B fully would mean giving `reparseCurriculum`/
   `retryResearch` the same `withMergeLock`-style advisory lock on the curriculum id they operate on
   — a real, scoped fast-follow now that the mechanism exists, not attempted in this pass.

6. **Extract a shared `withMergeLock(targetId, sourceId, run)` helper
   (`apps/api/src/shared/merge-lock.ts`) and back-port `mergeSubjects`/`mergeTags` onto it in the
   same commit.** This is the third copy-paste of the identical self-merge-guard +
   sorted-pair-advisory-lock + transaction-open preamble (`mergeSubjects`, `mergeTags`, now
   `mergeCurricula`) — the locking preamble is byte-for-byte identical across all three (~10 lines);
   what differs is entirely the reassignment body each one runs once the lock is held, which the
   helper leaves untouched by taking a callback. Extracting now (rather than after a fourth copy)
   is justified by a concrete safety argument, not just DRY-for-its-own-sake: `ontology-split-merge`
   already shipped two integration test files
   (`features/subject/tests/merge-subjects-full-reassignment.test.ts`'s implicit lock-and-precondition
   coverage plus a dedicated subject-merge-concurrency integration test, and `tag`'s dedupe test) that
   independently prove the current locking behavior — so refactoring `mergeSubjects`/`mergeTags` onto
   the shared helper in the same commit as this feature is verifiable, not risky: those existing
   tests must be re-run and stay green as part of this change (see Definition of Done, Backend). If
   they don't stay green, the back-port does not ship and `mergeSubjects`/`mergeTags` keep their
   current, working, copy-pasted implementations untouched — the new `mergeCurricula` does not depend
   on the back-port happening to ship correctly.

## Definition of Done — per layer

**Backend.**
- `npx vitest run -w @post-anki/api` clean, including `mergeSubjects`/`mergeTags`'s existing test
  suites re-run green against the `withMergeLock`-refactored code (Decision #6) — if either existing
  suite regresses, the back-port is reverted to keep `mergeSubjects`/`mergeTags` on their current
  working implementations and only `mergeCurricula` ships on the new helper; note explicitly in the
  build log which outcome occurred.
- Real `curl` + direct-SQL sequence against a running local API + local Postgres, mirroring
  `ontology-split-merge/spec.md`'s own DoD bar exactly:
  1. `POST /subjects` once (one subject; both curricula live under it).
  2. `POST /curricula` under that subject with a `docUrl` pointed at the e2e stack's
     `mock-docs-site` fixture (curriculum A); poll to `awaiting_source_approval`;
     `POST /curricula/:id/approve-sources {override: true}`; poll to `shaping_structure`;
     `POST /curricula/:id/confirm-structure`; poll to `ready` — the same sequence
     `ontology-split-merge`'s own DoD already verified against the real route table, now producing
     real `modules`/`topics` rows for A. Repeat the full sequence for curriculum B under the same
     subject.
  3. `POST /tags` + `POST /tags/:id/assignments` to tag one of A's real modules, and separately one
     of B's real modules — proving both survive the merge, not just one.
  4. `POST /curricula/:aId/sources` (or the add-sources endpoint) to add one extra source to B, so
     B's `sources` reassignment (step 6 of the procedure) has something real to move.
  5. Record pre-merge counts: `modulesA`, `topicsA`, `modulesB`, `topicsB` via
     `GET /curricula/:id` for both, and `llmCallEventsB = SELECT count(*) FROM llm_call_events
     WHERE curriculum_id = :bId` via direct SQL.
  6. `POST /curricula/:aId/merge { sourceCurriculumId: bId }`.
  7. `GET /curricula/:aId` — module count equals `modulesA + modulesB`; topic count equals
     `topicsA + topicsB` (the **duplicate-free** claim — distinct from orphan-free, both required).
     Both of B's tagged module and A's tagged module still carry their tag chip.
  8. `GET /curricula?subjectId=:subjectId` — B no longer appears; A does.
  9. **Zero-orphan proof, direct SQL, for every table in the reassignment set (Decision table
     above)** — `SELECT count(*) FROM <table> WHERE curriculum_id = :bId` expected `0` for:
     `modules`, `topics`, `sources`, `socratic_sessions`, `probe_sessions`,
     `curriculum_structure_turns`, `structure_research_candidates`. `SELECT * FROM curricula WHERE
     id = :bId` expected no row.
  10. **Denormalization-invariant proof** — `SELECT t.id FROM topics t JOIN modules m ON
      t.module_id = m.id WHERE t.curriculum_id <> m.curriculum_id` for every topic under A after
      the merge, expected zero rows. This is the single check that fails loudly if
      `topics.curriculum_id` reassignment is ever dropped from the implementation (Decision #1).
  11. **Deliberate-exclusion proof** — assert `SELECT count(*) FROM llm_call_events WHERE
      curriculum_id = :bId` after the merge equals `llmCallEventsB` from step 5, unchanged. An
      unchanged count (not a bare "greater than 0") is the actual claim Decision #3 makes — true
      regardless of how many rows setup happened to produce, and it proves the merge never writes
      this table rather than merely asserting something about test setup.
- Integration test proving the **pending-structure-turn precondition** (Decision #2, source-only):
  seed curriculum B (source) with a `curriculum_structure_turns` row (`role: 'assistant', status:
  'pending'`) via direct SQL insert (no HTTP path creates a row in this exact state deterministically
  — `submitStructureTurn`'s own pending-placeholder window is a real but unreliable-to-hit-via-HTTP
  race, so a direct insert is the correct, honest test setup here, not a workaround); curriculum A
  (target) has no pending turn. `POST /curricula/:aId/merge {sourceCurriculumId: bId}` returns 400
  `pending_structure_turn`; direct SQL confirms neither curriculum's `modules`/`topics`/
  `curriculum_structure_turns` rows changed. A second case in the same file seeds the pending turn
  on the TARGET (A) instead, with the source (B) clean, and asserts the merge SUCCEEDS — proving the
  precondition is source-scoped, not symmetric, per Decision #2's verified reasoning. Exact scenario
  tag: `@curriculum-merge.S4`.
- Integration test proving the **double-merge race** (mirrors `ontology-split-merge`'s own S5):
  two concurrent `POST /curricula/:targetId/merge {sourceCurriculumId}` calls for the *same* source
  — one succeeds (modules/topics moved, source gone), the other returns a clean 404, never a 500 and
  never a partially-moved state. Exact scenario tag: `@curriculum-merge.S3`.

**Frontend.** e2e proof, exact scenario tags (see scenarios.md for full narrative):
- `@curriculum-merge.S1` — merging two curricula with real children (modules, topics, a tag on each
  side, an extra source) via the UI reassigns every child, none orphaned or duplicated, verified
  both in the DOM (the surviving curriculum's module list shows both sets, both tag chips present)
  and via a direct DB read (the same zero-orphan/duplicate-free/invariant proofs listed above,
  run against the e2e Postgres instance).
- `@curriculum-merge.S2` — the merge-target picker on any curriculum only ever offers OTHER curricula
  from the SAME subject (never itself, never a curriculum belonging to a different subject).

**Infrastructure.** N/A — no schema migration, no new service, no env var, no deploy change.

## Documentation changes

`docs/architecture/ontology-split-merge.md` already exists (a sibling file to the
`docs/architecture/ontology-split-merge/` directory, which holds the point-in-time `review.md`
debrief and its diagram — verified by directory listing, not assumed) and covers the subject/tag
merge mechanism. This plan commits to updating that top-level doc during implementation to describe
curriculum merge as the third instance of the same mechanism — adding the reassignment-table diagram
from `architecture.md` below and a short note on the one new precondition (the source-side pending
structure turn check) that the other two entity types never needed. No new parallel doc is opened,
since this is the same mechanism generalized, not a new one. `review.md` itself is left untouched —
it's a dated debrief of what had shipped as of 2026-07-28, not a living doc.
