---
type: debrief
branch: curriculum-merge
feature: curriculum-merge
updated: 2026-07-31
verdict: critical-issue-found
diagram-format: ascii
---

# Architecture Review: Curriculum merge

## What was reviewed

The third and final piece of `ontology-split-merge`'s original scope: a `POST /curricula/:targetId/merge`
endpoint that absorbs one curriculum into another within the same subject, reassigning every module,
topic, source, Socratic session, and probe session the absorbed curriculum owns. Shipped in the same
commit as a `withMergeLock` extraction that back-ports the identical locking preamble onto the two
already-shipped merges (`mergeSubjects`, `mergeTags`). Reviewed via `git diff d0a7796^ d0a7796` (the
merge commit and its parent) plus the full `.planning/curriculum-merge/` plan set and the `.planning/LOG.md`
entry, which stands in for a build record here since this work is already merged to `main`.

## Documentation found

Extensive and unusually rigorous: `spec.md` enumerates every child table with a `curriculum_id` (verified
by grep, not inferred from schema shape), names six autonomous decisions with their reasoning, and defines
a Definition of Done that includes a zero-orphan sweep, a duplicate-free count proof, a denormalization-
invariant proof, and a deliberate-exclusion proof for `llm_call_events`. `discussion.md`, `architecture.md`,
`scenarios.md`, `playwright.md`, and `state-fixtures.md` round out the plan. All read and cross-checked
against the actual diff — no drift found between what the plan describes and what shipped, with one
exception: the severity/reachability characterization of a race the plan itself already documented (see
Verdict).

## As-built architecture

```
 subject-section.tsx                  curriculum.$id.tsx
 "Merge into…" button        target   FailedBanner — only
 <select> shows curriculum ⚠ select   rendered when the
 NAME only, no status           has   viewed curriculum's
 badge                       no status status === 'failed'
    │                                        │
    │ POST /curricula/:tid/merge             │ click "Retry
    ▼                                        │ research" / "Reparse"
 mergeCurricula()                            ▼
 curriculum.repo.ts                 retryResearch() /
    │                               reparseCurriculum()
    ▼                               curriculum-parse.orchestrator.ts
 withMergeLock()                             │
 shared/merge-lock.ts                        ▼
 (same helper now backs             clearCurriculumStructure(id)
  mergeSubjects, mergeTags)         DELETE modules/topics WHERE
    │                               curriculum_id = id — no
    │ advisory lock, re-read,       provenance filter, no lock,
    │ txn                           no "was this merged in?"
    ▼                               check                     ⚠
 reassign modules/topics/
 sources/socratic/probe
 sessions onto target;
 delete source's structure
 turns + candidates; delete
 source curricula row
    │
    └── content now lives under target's curriculum_id ──────►
        (reachable to ANY later clear on that same id,
         no timing coincidence required — see Verdict)
```

Entry point: `subject-section.tsx`'s `MergeCurriculumButton`, one per curriculum row — clicking "Merge
into…" on a row makes THAT curriculum the source; the `<select>` you pick from supplies the target.
`mergeCurricula()` → `withMergeLock()` (shared lock/transaction preamble) → the reassignment body:
`UPDATE modules/topics/sources/socratic_sessions/probe_sessions SET curriculum_id = target`, `DELETE`
on the source's `curriculum_structure_turns`/`structure_research_candidates`, then `DELETE` the source's
own `curricula` row. `llm_call_events` is left pointing at the deleted source id on purpose (an append-only
log). No schema change, no new tables.

## Verdict

**The merge implementation itself is sound.** `withMergeLock` is a genuine lift-and-shift, not a
behavior-changing refactor — confirmed by reading the diffs on `subject.repo.ts` (10 lines removed, one
call added, zero other changes) and `tag.repo.ts` (same shape, 30-line total diff). Both wrappers replace
a callback opened one level deep with another callback opened one level deep, which is why the diffs show
no re-indentation noise — real evidence the bodies are untouched, not a coincidence. The `self_merge` check
still runs before the transaction opens in both the old and new code. The reassignment set matches the
plan's enumerated table exactly, the two new integration tests assert real post-conditions against a real
Postgres instance (not mocks) — the concurrency test proves exactly-one-winner/one-clean-404 with direct
row-count assertions, the precondition test proves the pending-turn check is source-scoped and not
symmetric. I also independently checked the module-order offset math (`order = order + targetMaxOrder`)
against the codebase's actual ordering convention (`nextOrder`/`saveCurriculumPlan` are both 1-indexed,
not 0-indexed) — it lands correctly, no off-by-one collision.

**The critical issue is not in what was built — it's in how the plan characterizes an already-known
residual race.** Spec.md's Decision #5 names two deferred races and correctly identifies Instance B
(`reparseCurriculum`/`retryResearch`'s `clearCurriculumStructure()` deleting modules a concurrent merge
just moved in) as worse than Instance A — real data loss, not mere invisibility. That part is accurate.
But the plan then frames both instances together as requiring "the same operator to fire two separate UI
actions on the same curriculum within roughly the same sub-second window," and defers both under this
project's standing precedent for narrow-timing residual races. That framing is correct for Instance A. It
is not correct for Instance B, and the gap matters:

`clearCurriculumStructure(curriculumId)` deletes every row currently under that `curriculum_id` — it has
no concept of "how it got there" or "how long it's been there." So Instance B is not actually a timing
race at all. It is a deterministic, two-step sequence with no time pressure between the steps:

1. Merge curriculum B (real content) into curriculum A, where A happens to be sitting at status `failed`
   — reachable by ordinary, uninformed use, not a rare mistake: `mergeCurricula` has no status
   precondition on either side, and the target `<select>` in `subject-section.tsx` renders only
   `option.name` — the `StatusBadge` that shows a curriculum's status is rendered in the row list, never
   in the picker, so a user has no visual signal that the curriculum they just chose as the survivor is
   currently failed. B's row (the source) is deleted by the merge — its content now exists in exactly one
   place: under A.
2. At any later time — seconds, hours, or days afterward, no coincidence required — the user opens A's
   page, sees the still-present `FailedBanner` (merging never touches status), and clicks "Retry research"
   or "Reparse," the ordinary recovery action for a failed curriculum. `clearCurriculumStructure(A)` wipes
   every module/topic A currently owns, including B's content that has nothing to do with why A originally
   failed. There is no surviving copy anywhere — this is total, not partial, loss of B's material.

The exposure is also not limited to "the target happened to already be failed at merge time." I traced
every `setCurriculumStatus(..., "failed")` call site: one of them is `mergeSourcesIntoCurriculum`'s catch
block (`curriculum-parse.orchestrator.ts`), reached from the ordinary "add more sources" form
(`AddSourcesForm`) that renders on any normal, `ready` curriculum page. So a curriculum that absorbed
merged-in content while healthy can independently fail later through routine use, and the same
`FailedBanner`-driven retry then destroys everything it owns at that point — original content and
merged-in content alike. This is pre-existing `clearCurriculumStructure` behavior, not introduced by this
feature, but it widens the practical exposure created by `mergeCurricula` giving that pre-existing
destructive operation new content to destroy.

One more reason this matters for how the fix gets prioritized: spec.md's own named fast-follow — "give
`reparseCurriculum`/`retryResearch` the same `withMergeLock`-style advisory lock" — does not close this.
A lock only serializes operations that overlap in time; two actions an hour apart both acquire it
uncontended and the delete proceeds exactly as it does today. The fix needs to be a different kind of
change (see below), not the one already on record as the deferred remedy.

## Proposed alternative

```
 curriculum.$id.tsx                subject-section.tsx
 FailedBanner shows target         <select> now shows
 curriculum's own history —        "Name (status)" for
 unchanged                         every option        ✚
    │                                  │
    │ click Retry / Reparse            │ pick a target
    ▼                                  ▼
 retryResearch()/reparseCurriculum()  mergeCurricula() — refuses
    │                                 non-'ready'/'failed-empty'
    ▼                                 targets, or warns before
 clearCurriculumStructure(id)         confirm             ✚
 now scoped: only deletes modules/
 topics whose provenance is this
 curriculum's OWN research/parse
 attempt, never rows a merge
 reassigned in — tracked via a
 nullable `merged_from_curriculum_id`
 on modules, or a per-row "origin"
 marker set at reassignment time  ✚
```

Two independent, complementary changes — either alone reduces the risk, both together close it:

1. **Scope the destructive clear to provenance, not to current ownership.** `clearCurriculumStructure`
   should never delete a module/topic that arrived via a merge from another curriculum — only rows that
   trace back to this curriculum's own research/parse history. This requires marking reassigned rows at
   merge time (a nullable "moved in from" marker, or a lightweight append-only log the clear step
   consults) so the delete can filter on it. This is the change that actually closes the gap — a lock
   cannot, since the two triggering actions may be arbitrarily far apart in time.
2. **Make the hazard visible before it happens**, independent of #1: show status in the merge-target
   `<select>` (the picker already has the `Curriculum` object with `.status` in scope — it just isn't
   rendered), and/or refuse `mergeCurricula` when the target is `failed` (a failed curriculum is not a
   place a user is likely to intend to leave content, and there is no other legitimate reason to target
   one). This closes the "picked an unlabeled failed curriculum by accident" entry path specifically,
   though not the "target failed later via `mergeSourcesIntoCurriculum`" path — which is why #1 is the
   change that matters most.

Cost: #2 is small — a few lines in the picker and one status check in `mergeCurricula`. #1 is a real,
scoped piece of work (a schema-adjacent marker, or an audit-log-style provenance table — the kind of
mechanism wishlist issue #62's audit trail would also want) but does not require touching the withMergeLock
extraction, the reassignment logic, or either already-shipped merge — it is additive to `clearCurriculumStructure`
alone.

## Questions a reviewer would ask

1. Given `clearCurriculumStructure` deletes by current `curriculum_id` with no provenance check, should
   Decision #5's Instance B be re-filed as a "sequential reachable bug" rather than a "residual race,"
   and re-triaged against this project's data-loss bar rather than its narrow-timing-race precedent?
2. Since the merge-target `<select>` already has each `Curriculum` object (including `.status`) in scope,
   is there a reason status wasn't surfaced in the picker, or was this just not considered during the
   frontend pass?
3. Should `mergeCurricula` refuse a `failed` (or `curating`) target outright, the way it already refuses a
   source with a pending structure turn — closing the most common accidental-entry path at the same layer
   the other precondition already lives?
4. `mergeSourcesIntoCurriculum`'s own failure path sets a `ready` curriculum with real, already-approved
   content to `failed`, after which the exact same `clearCurriculumStructure` wipe is one click away via
   the FailedBanner — was this interaction (independent of `mergeCurricula`) already a known risk before
   this feature, or is it new information from this review?
5. `tag_assignments`, `socratic_sessions`, and `probe_session_questions` that reference a module/topic
   `clearCurriculumStructure` deletes are left pointing at now-nonexistent ids — is that orphaning
   considered acceptable today (same class of "harmless dangling reference" as `llm_call_events`), or is
   it undocumented because nobody has traced this path before?
6. Two modules both titled "Introduction" can now sit side by side under one curriculum after a merge
   (Decision #1's verified, deliberate non-reconciliation) — worth a lightweight distinguishing cue (e.g.
   grouping merged-in modules under a visual divider) even without attempting real title matching?
7. `mergeCurricula` has no precondition on either curriculum's `status` at all (only the source's pending-
   turn check) — was a broader status gate considered and rejected, or is its absence simply because
   `mergeSubjects`/`mergeTags` never needed one and the pattern was followed without re-deriving it for
   curricula specifically?
