---
type: spec
branch: 97-structure-generation-loading-state
task: "[Bug] Curriculum structure generation has no loading indicator in the web app (#97)"
state: planned
updated: 2026-08-14
---

# Plan: An honest in-progress state while the course structure is being drafted (#97)

## What this story is, in one paragraph

When a learner approves the researched sources for a new course, the web app tells them, in an
amber warning box, that **"No trustworthy sources were found (or all were removed)"** — while the
mentor is in fact successfully drafting their course from those exact sources. The issue was filed
as "no loading indicator" (a static page); the real defect is a *false negative shown during a
successful run*, which is strictly worse than silence. The cause is a single gap in the status
machine: `curricula.status` has no value that means "generation is running", so it sits at
`awaiting_source_approval` for the whole multi-second LLM call and the page keeps rendering the
source-approval panel — which, now that every source has just been flipped to `approved`, has an
empty pending list and falls into its empty-state branch. This story closes that window, wires the
already-built pending UI into it, and makes the two adjacent affordances (the approve button, a
draft that never returns) behave honestly too.

## The root cause, traced end to end (facts, each with its source)

1. `handleApproveSources` (`apps/api/src/curriculum/curriculum.controller.ts:264-291`) validates
   that the curriculum is `awaiting_source_approval`, then responds `202` with a **fabricated**
   body — `sendJson(res, 202, { ...curriculum, status: "curating" })` (`:287`) — and fires
   `generateCurriculumFromApprovedSources` as a floating promise (`:289`). **It never writes any
   status to the database.** The response claims `curating`; the row still says
   `awaiting_source_approval`.
2. `generateCurriculumFromApprovedSources`
   (`apps/api/src/curriculum/curriculum-parse.orchestrator.ts:168-173`) calls
   `approveAllPendingSources` — which only flips `sources.approvalStatus` — then
   `generateDraftStructure`.
3. `generateDraftStructure` (`apps/api/src/curriculum/curriculum-structure.ts:189-278`) writes a
   pending assistant turn carrying `"Drafting the first version of the structure…"` (`:199-204`),
   runs a trusted-source web search plus the architect agent under `p-retry` (`:243-251`), and only
   **then** calls `setCurriculumStatus(curriculumId, "shaping_structure")` (`:263`). For the entire
   duration of that call the row is still `awaiting_source_approval`.
4. On the web side, `SourceApprovalPanel.approve()`
   (`apps/web/src/curriculum/source-approval-panel.tsx:58-63`) clears its own `busy` flag and then
   calls `router.invalidate()`. With `staleTime: 0` (`apps/web/src/router.tsx:11`) that re-runs the
   route loader and genuinely refetches the curriculum detail.
5. The refetched status is still `awaiting_source_approval`, so
   `isAwaitingSourceApproval` (`apps/web/src/routes/curriculum.$curriculumId.tsx:68`) stays true and
   the route renders `SourceApprovalPanel` again (`:171-172`). But `pending` is now empty — every
   source was just approved in step 2 — so the panel takes its `pending.length === 0` branch and
   renders the amber `source-approval-empty` warning
   (`source-approval-panel.tsx:112-122`).

**The window is not a race — it is deterministic.** Nothing writes a status between approval and
the LLM call completing, so every learner who takes the researched-sources path sees this, every
time, for as long as the model takes.

### What is *not* broken, and must not be "fixed"

- **The LLM-failure path already works end to end.** `generateDraftStructure`'s `catch`
  (`curriculum-structure.ts:269-277`) marks the turn `failed`, sets status `failed`, and the route
  renders `FailedBanner` (`curriculum.$curriculumId.tsx:177-182`), which — because
  `hasStructureDraftAttempt` is true — shows "The mentor couldn't draft a structure for this
  course." plus a working **Retry drafting** button
  (`apps/web/src/curriculum/curriculum-lifecycle.tsx:76-96`). **No new failure UI is in scope.**
  What is missing is (a) an accurate in-progress state *before* that verdict, and (b) an escape for
  the case where no verdict ever arrives.
- **The pasted-material path is not the reported bug.** It skips source approval entirely.
  (Correction to the triage note: `createCurriculum` sets status **`"curating"`**, not `draft` —
  `apps/api/src/curriculum/curriculum.repo.ts:184` — but either value lands in `isCurating`, so
  `CuratingBanner` renders and the learner does get honest feedback there today.)
- **The pending UI already exists and is correct.** `CurriculumStructureChat`'s `!snapshot` branch
  (`apps/web/src/curriculum/curriculum-structure-chat.tsx:292-296`) renders exactly the backend's
  placeholder copy under `data-testid="structure-draft-pending"`. It is simply unreachable during
  the window, because the route only mounts that component for status `shaping_structure`.

### The second false state, which the naive fix would create

`stuckPendingTurn` (`curriculum-structure-chat.tsx:52-64`) treats *any* trailing assistant turn
with `status === "pending"` as evidence that the server crashed mid-turn, and renders **"That
reply didn't come through."** with a Resend button (`:317-332`). Its own comment explains the
assumption: a pending turn "is normally impossible to observe — the API call that writes it blocks
until the turn resolves." That assumption holds for chat turns (`submitStructureTurn` is
synchronous over HTTP) but **not** for the initial draft, which is dispatched as a floating promise
and is therefore observably pending for its whole lifetime. So merely making the chat panel render
during drafting would replace one false error ("no sources found") with another ("that reply didn't
come through") — the same bug class. This is why the fix includes an age-aware, snapshot-aware
predicate rather than just a status flip.

## The design

### 1. Backend — give the status machine a value for "generation is running"

Reuse the existing `shaping_structure` status; do not add an enum value (see Decision 1). The
structure-shaping stage *begins* when drafting begins — the draft is its first turn, not a
prelude to it.

Three writes, deliberately overlapping:

- **`handleApproveSources` — write `shaping_structure` synchronously, before `sendJson` and before
  the dispatch.** This is the load-bearing one. Writing it inside `generateDraftStructure` alone
  would shrink the false-empty window from "the whole LLM call" to "a ~10ms race against the
  client's refetch" — better, but still a state a learner can observe. Writing it before the `202`
  leaves the response ordered strictly after the row is correct, so the client's post-approve
  refetch **cannot** see `awaiting_source_approval`. Also replace the fabricated
  `{ ...curriculum, status: "curating" }` body with the truthful status.
- **`generateDraftStructure` — write `shaping_structure` immediately after the placeholder-turn
  insert succeeds.** Entry-point-agnostic backstop covering the pasted-material create path
  (`curriculum.controller.ts:216`) and `retryDraftStructure`. Placed *after* the insert so the
  conflict back-off branch (`curriculum-structure.ts:206-217`) still returns without touching a
  status another in-flight attempt owns.
- **Leave the existing `setCurriculumStatus(..., "shaping_structure")` at `:263` in place.** It
  becomes a no-op re-write of the same value. Removing it would enlarge the diff and delete the
  guarantee for any future caller that reaches success by another route.

Two robustness follow-ons on the same paths:

- **`handleApproveSources`'s dispatch `.catch` must also set status `failed`.** Once the controller
  writes `shaping_structure` up front, a throw *before* the placeholder insert (the only failure
  `generateDraftStructure` re-raises rather than absorbing) would otherwise strand the curriculum in
  `shaping_structure` with zero turns and no way back. The `.catch` currently only logs.
- **`retryDraftStructure` must call `finalizeStalePendingTurn` first.** Today it delegates straight
  to `generateDraftStructure`, whose first act is a placeholder insert guarded by the
  `curriculum_structure_turns_pending_assistant_unique` index. If the previous attempt died leaving
  a pending row, that insert raises a unique violation, is swallowed as "already in progress"
  (`:206-217`), and the retry becomes a **silent no-op** — the user clicks Retry and nothing
  happens, forever. `finalizeStalePendingTurn` already exists (`:161-179`) and already refuses to
  touch a turn younger than the staleness threshold; it is simply never called on this path.

### 2. Shared pure logic — one threshold, one predicate, both sides

New file `packages/core/src/curriculum/structure-draft.ts`, exported from
`packages/core/src/curriculum/index.ts`. Pure, no I/O, unit-tested with vitest. The web app already
imports from `@post-anki/core` (`estimateStructureStudyTime` in `curriculum-structure-chat.tsx:12`),
so this is an established dependency direction, not a new one.

- `STALE_PENDING_TURN_AGE_MS` — moved here from `curriculum-structure.ts:149`, which imports it back
  rather than keeping a second copy. The API's staleness rule and the web app's "is this still
  legitimately running?" rule must be the same number or the two surfaces will disagree about
  whether a turn is alive.
- `isStalePendingTurn(turn, now)` — assistant + `pending` + older than the threshold.
- **Time in, always as an ISO string.** Both functions take `createdAt` exactly as
  `structureTurnSchema` declares it — `z.string()`
  (`packages/shared/src/curriculum.ts:237`) — and never a `Date`. The predicate now runs at three
  call sites (the approve/retry controller, the orchestrator's stale sweep, the web panel); pinning
  the input shape here is what stops them drifting into three different coercions.
- `draftProgressState(turns, now)` → `"idle" | "drafting" | "stalled"`. Returns non-`idle` **only
  when no turn anywhere in the conversation carries a snapshot** — that absence is precisely what
  distinguishes the initial draft from a mid-conversation edit turn, which already has its own
  Resend affordance and must keep it. `"drafting"` while the trailing pending turn is fresh,
  `"stalled"` once it crosses the threshold.

That single predicate is what keeps the age-aware `stuckPendingTurn` fix and the extended retry gate
from firing on the wrong thing.

### 3. Web — render the in-progress state, and stop rendering the false ones

- **Extract the `!snapshot` branch of `CurriculumStructureChat` into a `StructureDraftPending`
  component**, keeping `data-testid="structure-draft-pending"` and the copy verbatim. It owns a
  `setInterval(() => void router.invalidate(), 2500)` — the same idiom, cadence and cleanup as
  `CuratingBanner` (`curriculum-lifecycle.tsx:16-22`), which is the repo's established way of
  waiting on background work. Mount/unmount gates the polling, so no conditional-effect logic lands
  inside an already-498-line component.

  **Why `router.invalidate()` and not `refetchInterval` on `structureTurnsQuery`:** on success only
  the turns change, but on failure `curricula.status` becomes `failed` and `FailedBanner` must take
  over — a turns-query `refetchInterval` would never observe that. One invalidate tick refreshes the
  detail query *and* the turns query through the loader, because `staleTime: 0`. It would also poll
  through the entire normal shaping conversation, since that same query backs the whole chat.
- **Make `stuckPendingTurn` age-aware** via `isStalePendingTurn`. A fresh, live pending turn stops
  rendering "That reply didn't come through." The existing behaviour for a genuinely stale turn is
  unchanged.
- **Suppress the chat composer and the Build button unless `draftProgressState` is `"idle"`.**
  Deliberately gated on `"idle"`, not on `!== "drafting"`: a stalled draft is still a
  `shaping_structure` curriculum with no snapshot, so re-offering the composer at the five-minute
  mark would hand the learner back the exact orphan-turn trap described below, at the worst possible
  moment. The stalled panel offers retry and nothing else.
  With the status now `shaping_structure`, `handleSubmitStructureTurn`'s gate
  (`curriculum.controller.ts:333-341`) passes, so a learner could type into the composer mid-draft;
  `submitStructureTurn` writes the user turn **before** hitting the pending-index guard
  (`curriculum-structure.ts:365-373`), leaving an orphan user message in the transcript and
  surfacing "Still working on your last message". Not offering the control is the honest answer:
  there is nothing to give feedback on until a draft exists. (Build is already `disabled` without a
  snapshot; it should not be visible either.)
- **Handle the stall.** When `draftProgressState` is `"stalled"`, `StructureDraftPending` swaps to
  "This is taking longer than expected — the mentor may not have finished." plus a **Retry
  drafting** button calling the existing `retryDraftStructure` server fn. This is the only escape
  from a hung generation: there is **no timeout on `agent.generate`** (`p-retry` bounds *failures*,
  not duration — `curriculum-structure.ts:79-87`) and nothing sweeps stranded pending draft turns.
  The backend gate for that button is widened accordingly (below).

### 4. Backend — let the stall actually be retried

`handleRetryDraftStructure` (`curriculum.controller.ts:494-520`) is gated to status `failed` only,
on the stated grounds that "the retry button that dispatches here only ever renders for a curriculum
already sitting at that status." That is no longer true once the stalled state can offer it. Widen
the gate to: status `failed`, **or** status `shaping_structure` where `draftProgressState` is
`"stalled"` — evaluated server-side against `getStructureTurns`, never trusted from the client. Same
handler also gets the synchronous `shaping_structure` write before its `202` (closing the identical
race on the retry path, where the client currently re-reads `failed` and keeps showing
`FailedBanner`) and the same truthful-body fix.

### 5. Web — the approve button itself

Two defects in `SourceApprovalPanel.approve()` (`source-approval-panel.tsx:58-63`), both the same
class as the headline bug:

- `setBusy(false)` runs **before** `await router.invalidate()`, so for the duration of the refetch
  the still-mounted panel re-arms its button from "Generating…" back to "Approve & generate" — a
  live-looking control for an action already in flight. `busy` must stay set across the invalidate;
  the panel unmounts on the next render, so it never needs clearing on the success path.
- `approve()` has **no `try`/`catch`**. Today the request effectively cannot fail. Once the
  controller's `awaiting_source_approval` guard actually bites (it now will — the status changes),
  a second approve from another tab returns `409`, and — verified, not assumed — `request()`
  throws an `ApiError` carrying the status and the API's own `error` code
  (`apps/web/src/curriculum/api-client.ts:68-96`), which `api.approveSources` (`:654-662`) does not
  swallow. So the promise genuinely rejects, `busy` is never cleared, and the learner is left with a
  permanently dead button and no explanation.

  The fix follows this repo's own precedent for an *expected* 409 rather than raw
  exception-catching: `api.submitStructureTurn` converts its known error codes into a discriminated
  `SubmitStructureTurnResult` that the component branches on (`curriculum.api.ts:132-139`,
  consumed at `curriculum-structure-chat.tsx:109-117`). `api.approveSources` should do the same —
  map `not_awaiting_approval` and `no_approved_sources` to a typed `{ ok: false, code }` result the
  panel renders in its existing inline `error` paragraph (`source-approval-panel.tsx:141`) — with a
  `catch` retained for genuinely unexpected failures whose only job is to clear `busy` and say so.

`remove()` and `addLink()` share the same `setBusy(false)`-before-invalidate ordering and are
deliberately left alone: those actions do not unmount the panel, so the re-arm is correct there.

## Decisions made autonomously

1. **Reuse `shaping_structure`; do not add a status value.** `curriculumStatusSchema`
   (`packages/shared/src/curriculum.ts:18-26`) is a zod enum over a plain text column consumed by
   the web app, the bot and several server-side switches; a new value is a contract change rippling
   through all of them for no behavioural gain. `shaping_structure` already names the stage whose
   *first step* is the draft, the route loader already prefetches the turns query for it
   (`curriculum.$curriculumId.tsx:39-41`), and two existing e2e tests already poll for exactly this
   status immediately after approve (`home-page-tree-with-status-controls.test.ts:106`,
   `add-sources-inline-error-on-deleted-curriculum.test.ts:133`) — making it true *sooner* is
   consistent with what they already assert.
2. **Rejected `curating`, despite the fabricated 202 body already claiming it.** It would work with
   a one-line change and `CuratingBanner` already polls. Rejected because its copy ("The mentor is
   reading your sources…") describes source parsing, not drafting; it does not surface the
   placeholder the issue's "Done when" asks for; and it makes the learner watch one panel get
   replaced wholesale by a different one, instead of a single panel that fills itself in.
3. **Write the status in both the controller and `generateDraftStructure`.** Not redundancy —
   different guarantees. The controller write makes the false state *impossible* for the reported
   path; the `generateDraftStructure` write makes it *unlikely* for every other entry point, without
   auditing each one. See §1.
4. **Accepted the behaviour change on the pasted-material path.** With the write inside
   `generateDraftStructure`, pasted-material drafting moves from `CuratingBanner` to the
   structure-chat pending panel. Not a regression: both are honest, and the chat panel is the
   surface that then fills in with the draft, so the learner watches one continuous thing. It also
   makes every course-creation entry point show the same drafting state. If a reviewer disagrees,
   restricting the write to the approve path is a two-line rollback.
5. **Stall handling is client-detected with an explicit retry, not a background reaper.** No
   scheduler runs on this path, and the existing precedent in this exact module is the same shape:
   `finalizeStalePendingTurn` heals a stranded turn lazily, on the next action, rather than on a
   timer. A reaper is a whole new operational surface for a case that resolves with one click.
6. **The staleness threshold moves to `packages/core` rather than being duplicated in the web app.**
   Two independently-drifting definitions of "still running" across API and web is a bug waiting to
   be filed.
7. **No new failure UI.** The `failed` path is already complete and correct; adding a second failure
   surface would compete with `FailedBanner`. Every criterion below about failure asserts the
   *existing* behaviour still holds.
8. **Fixed the fabricated `status: "curating"` 202 body only on the two handlers whose semantics
   this story changes.** `handleRetryResearch` (`:480`) has the identical wart and is left alone —
   unrelated cleanup does not belong in a bug fix.
9. **Proof is a web component test plus a captured screenshot, not a new Playwright feature.** The
   repo's convention for UI-facing proof is a PNG under `proof/<area>/` or `e2e/proof/<area>/`
   captured by a verification-repo test. This bug's whole surface is a component-level render
   decision reachable from props, so `apps/web/src/curriculum/` vitest + RTL tests (precedent:
   `lecture-panel.test.tsx`) prove it directly and cheaply. Two verification-repo tests already
   cover the status transition itself; a screenshot of the drafting panel goes to
   `proof/curriculum/structure-draft-pending.png`.

## Architecture

### Business logic changes

- Approving sources immediately puts the course into the structure-shaping stage, instead of
  leaving it parked in "awaiting approval" until the model replies.
- The learner sees "Drafting the first version of the structure…" for the whole generation, on a
  panel that refreshes itself, instead of a warning claiming no usable sources were found.
- A generation that never returns (crash, or a model call that hangs — neither of which has a
  timeout today) becomes recoverable by the learner instead of a permanent "Drafting…".
- Retrying a failed draft now works when a stranded pending turn exists, where it was previously a
  silent no-op.

### Architectural changes

- `curricula.status` gains an honest representation of the "generation running" window. The
  controller becomes responsible for entering the stage; the orchestrator keeps responsibility for
  leaving it (`ready`-ward or `failed`-ward). No new status value, no schema change, no migration.
- "Is this draft still legitimately in flight?" becomes one shared, unit-tested pure predicate in
  `packages/core` rather than an assumption re-derived on each side — the API's staleness sweep and
  the web app's progress rendering now provably agree.
- No new API endpoint, no new query, no contract change to any DTO.

## Quality gates

- `npx tsc --noEmit` clean across `apps/api`, `apps/web`, `packages/core`, `packages/shared`.
- Project lint clean; report any pre-existing errors rather than fixing them here.
- `npx vitest run` green — in particular `apps/api/src/curriculum/curriculum-structure.test.ts`,
  whose `generateDraftStructure` cases (`:424-444`) assert the conflict back-off and the
  rethrow-on-unrelated-failure behaviour that the new early status write sits directly beside.
- No comments added to any touched file (repo style rule).

## Explicitly out of scope

- Adding a timeout to `agent.generate`, or any change to the `p-retry` policy.
- A background sweeper for stranded pending turns.
- Streaming or per-step progress detail from the drafting agent — the placeholder copy is the
  contract for this story.
- Any change to `handleRetryResearch`, `mergeSourcesIntoCurriculum`, or the `curating` window on
  the legacy `parseCurriculum` path.
- Closing or re-labelling issue #97, or moving it on the board.
