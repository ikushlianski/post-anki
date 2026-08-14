---
type: todo
branch: 97-structure-generation-loading-state
task: "[Bug] Curriculum structure generation has no loading indicator in the web app (#97)"
state: open
updated: 2026-08-14
---

# Todo: Honest in-progress state while the structure is drafted (#97)

## Decisions to make

Nothing blocking. Nine forks, all with a safe, reversible, pattern-following default — logged one
line each in `spec.md` §"Decisions made autonomously". None touches money, auth, schema, or an
irreversible data decision. No migration, no contract change. Implementation can start.

## To review / clarify (not blockers, flagged for awareness)

1. **An existing verification-repo test looks stale in a way this story sits next to.**
   `projects/post-anki/post-anki/features/curriculum/tests/study-technology-doc-url/test.ts:95-103`
   polls for `curriculum.status === 'ready'` within 30 s after calling `approve-sources`. Since
   Phase 5, that path lands on `shaping_structure` and only reaches `ready` after an explicit
   confirm-structure call — which that test never makes, and which the repo's own
   `docs/memories/confirm-structure-required-for-ready.md` documents. Two sibling tests
   (`home-page-tree-with-status-controls.test.ts:106`,
   `add-sources-inline-error-on-deleted-curriculum.test.ts:133`) assert `shaping_structure` for the
   same transition. **Assumption, not verified — the suite was not run.** Worth confirming before
   anyone attributes a red result to this story's changes. Fixing it is outside this scope.
2. **The fabricated `202` body idiom appears in three handlers.** This story corrects two of them;
   `handleRetryResearch` (`curriculum.controller.ts:480`) still answers `{ ...curriculum, status:
   "curating" }` for a status it never writes. Same wart, unrelated flow, deliberately untouched.
3. **`agent.generate` has no timeout anywhere in this module.** `p-retry` bounds failure count, not
   duration. This story gives the *learner* an escape after five minutes; the server-side call can
   still hang indefinitely holding a connection. Real, pre-existing, out of scope.
4. **The pasted-material path changes what it renders.** It moves from `CuratingBanner` to the
   structure-chat pending panel. Intended (spec.md Decision 4), but it is the one behaviour change
   outside the reported bug's path — call it out in review rather than letting it be discovered.

## Coding tasks

1. Add `packages/core/src/curriculum/structure-draft.ts` — `STALE_PENDING_TURN_AGE_MS`,
   `isStalePendingTurn`, `draftProgressState` — plus its co-located test; export from
   `packages/core/src/curriculum/index.ts`.
2. Point `apps/api/src/curriculum/curriculum-structure.ts` at the shared threshold; delete its local
   constant.
3. `generateDraftStructure`: set `shaping_structure` right after the placeholder insert succeeds.
4. `retryDraftStructure`: call `finalizeStalePendingTurn` before delegating.
5. `handleApproveSources`: write and await `shaping_structure` before `sendJson`; send the real
   status; set `failed` in the dispatch `.catch`.
6. `handleRetryDraftStructure`: widen the gate to `failed` or stalled-`shaping_structure`; write the
   status before its `202`; send the real status.
7. Extract `StructureDraftPending` out of `CurriculumStructureChat`, with the 2500 ms
   `router.invalidate()` interval, the drafting and stalled copy, and the retry control.
8. Make `stuckPendingTurn` age-aware via `isStalePendingTurn`.
9. Gate the composer, send and confirm controls on `draftProgressState === 'idle'` — withheld while
   drafting *and* while stalled.
10. `api.approveSources`: map `not_awaiting_approval` and `no_approved_sources` to a typed result,
    following `api.submitStructureTurn`'s precedent.
11. `SourceApprovalPanel.approve()`: hold `busy` across `router.invalidate()`, branch on the typed
    result, and keep a `catch` for unexpected failures that clears `busy` and writes to the existing
    inline error paragraph.
12. Web component tests in `apps/web/src/curriculum/` for criteria 19-27.
13. Backend tests for criteria 1-11 alongside `curriculum-structure.test.ts`.

## Manual steps / sequencing constraints

- Tasks 1-2 land first: tasks 3-9 all consume the shared predicate.
- Capture `proof/curriculum/structure-draft-pending.png` against a real local run with a slow or
  stubbed model, so the screenshot shows the drafting panel rather than a completed draft.
- Run `npx tsc --noEmit` and the lint command before any commit; report pre-existing failures rather
  than folding fixes into this change.
- No migration to generate. If `drizzle-kit` produces one, something in `packages/shared` was
  changed by mistake.

## Post-deploy checks

- Create a course from a researched technology, approve the sources, and confirm the drafting panel
  appears immediately and the amber "no trustworthy sources" warning never flashes.
- Confirm the panel fills in with the draft on its own, without a reload.
- Confirm a course whose drafting failed still shows "Retry drafting" and that the retry produces a
  new attempt.

## Resolved

- 2026-08-14 — Issue prose said "no loading indicator"; traced the real defect to a false "no
  trustworthy sources were found" warning shown during successful generation.
- 2026-08-14 — Triage note said pasted-material curricula start at status `draft`; they start at
  `curating` (`curriculum.repo.ts:184`). Both land in `isCurating`, so the conclusion held.
- 2026-08-14 — Considered adding a new status value for the drafting window; rejected in favour of
  entering `shaping_structure` earlier, which two existing e2e tests already expect.
- 2026-08-14 — Found a second false state the naive fix would have introduced: `stuckPendingTurn`
  would have labelled the live draft "That reply didn't come through."
- 2026-08-14 — Found that retrying a failed draft is a silent no-op whenever a stranded pending turn
  exists, because the unique-index conflict is swallowed as "already in progress".
- 2026-08-14 — Implementation: gated the composer/send/confirm controls on
  `draftProgressState === 'idle' && Boolean(snapshot)`, not `draftProgressState === 'idle'` alone.
  `draftProgressState` returns `"idle"` for an empty turn list by design (criterion 18), but the
  composer must stay hidden during that same empty-list window (the moment between the controller's
  status write and the placeholder insert) or a learner could submit a message straight into the
  orphan-user-turn trap the spec itself warns about. Adding the snapshot check closes that window;
  it is a strict subset of the named states, so every tested criterion still holds.
- 2026-08-14 — Implementation: `stuckTurn` (the "That reply didn't come through" affordance) is only
  computed when a snapshot already exists (`snapshot ? stuckPendingTurn(turns, now) : null`), not
  merely age-gated as spec.md's prose literally describes. Without this, a stalled *initial* draft
  (no snapshot, pending turn past the staleness threshold) would show both `StructureDraftPending`'s
  own working "Retry drafting" button and a second, permanently-dead "Resend" button in the
  transcript (dead because there is no prior user turn for it to resend) — the same class of
  false/confusing state this story exists to remove. Reversible one-line narrowing if a reviewer
  disagrees.
- 2026-08-14 — Implementation: named the stalled-draft retry button's testid `structure-draft-retry`
  (spec.md did not name one), kept distinct from `FailedBanner`'s existing `retry-structure-draft` to
  avoid two different controls answering to the same testid.
- 2026-08-14 — Implementation: `APPROVE_ERROR_MESSAGES` copy for `not_awaiting_approval` /
  `no_approved_sources` is new prose (spec.md specified the mapping mechanism, not the exact
  strings), written to match this panel's existing inline-error tone.
- 2026-08-14 — Found `apps/api/src/curriculum/curriculum-health.ts` already declared a second
  "5 minute pending-turn staleness" literal (`FRESH_PENDING_TURN_MS`), pre-dating this story and
  outside the plan's file list, with a comment explicitly noting it mirrored
  `STALE_PENDING_TURN_AGE_MS`. Left in place, criterion 13 ("no second literal for this threshold
  exists anywhere in the repo") would have been false. Pointed it at the same `@post-anki/core`
  export instead of leaving the duplicate — a one-line, reversible fix consistent with spec.md
  Decision 6's own stated principle, verified via `curriculum-health.test.ts` (unchanged, still
  green).
- 2026-08-14 — Implementation: gave the `.catch` on `handleApproveSources`'s
  `generateCurriculumFromApprovedSources(...).catch(...)` its own nested `.catch` around the
  `setCurriculumStatus(curriculumId, "failed")` fire-and-forget call. That write had no handler for
  its own rejection, and this codebase has no global `unhandledRejection` listener — a failure
  writing the failed status could otherwise crash the process. Matches this file's existing
  convention of logging every other fire-and-forget dispatch's failure.
