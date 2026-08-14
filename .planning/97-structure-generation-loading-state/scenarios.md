---
type: scenarios
branch: 97-structure-generation-loading-state
task: "[Bug] Curriculum structure generation has no loading indicator in the web app (#97)"
state: confirmed
updated: 2026-08-14
---

# Scenarios: An honest in-progress state while the structure is drafted (#97)

**27 acceptance criteria.**

**Proof mechanism.** Pure logic in `packages/core/src/curriculum/structure-draft.test.ts`; backend
status transitions in `apps/api/src/curriculum/curriculum-structure.test.ts` and a controller-level
test for the approve handler; rendering decisions as vitest + react-testing-library tests co-located
in `apps/web/src/curriculum/` (precedent: `lecture-panel.test.tsx`). One captured screenshot of the
drafting panel at `proof/curriculum/structure-draft-pending.png`, matching this repo's
`proof/<area>/*.png` convention. No new Playwright feature: the whole surface is a component render
decision reachable from props, and two verification-repo tests
(`home-page-tree-with-status-controls.test.ts:106`,
`add-sources-inline-error-on-deleted-curriculum.test.ts:133`) already poll for the post-approve
`shaping_structure` status this story makes true sooner.

**A note on what "loading indicator" means here.** The issue title implies a missing spinner. Every
criterion below is written against the real defect: a *wrong* message shown during a *successful*
run. Criteria 6-9 exist specifically to assert that no false state — neither the old one nor the one
a naive fix would introduce — is reachable at any point in the window.

## Master acceptance criteria list (27 items, each independently walkable)

**Backend — the status machine**

1. `handleApproveSources` writes `setCurriculumStatus(curriculumId, "shaping_structure")` and
   awaits it **before** `sendJson` and before dispatching
   `generateCurriculumFromApprovedSources`. Proven by asserting call order, not just that both
   happened.
2. `handleApproveSources`'s `202` body reports the real persisted status (`shaping_structure`), not
   the fabricated `{ ...curriculum, status: "curating" }` it sends today.
3. A second `POST /curricula/:id/approve-sources` for the same curriculum now returns `409
   not_awaiting_approval`, because the first call moved the status — where today both calls pass
   the guard and race into two generation attempts.
4. `generateDraftStructure` sets `shaping_structure` immediately after the placeholder-turn insert
   succeeds, and **before** the trusted-source search or the agent call. Proven by a test whose
   agent mock never resolves, asserting the status write already happened.
5. `generateDraftStructure`'s pending-turn-conflict branch still returns without writing any status
   — a second concurrent attempt must not touch a status the first one owns.
   `curriculum-structure.test.ts:429` ("backs off quietly…") still passes unmodified.
6. `generateDraftStructure` still rethrows a non-conflict placeholder-insert failure
   (`curriculum-structure.test.ts:439`) unmodified.
7. `handleApproveSources`'s dispatch `.catch` sets status `failed` in addition to logging, so a
   throw before the placeholder insert cannot strand a curriculum in `shaping_structure` with zero
   turns.
8. `retryDraftStructure` calls `finalizeStalePendingTurn` before `generateDraftStructure`. With a
   stale pending assistant turn present, the retry produces a real new generation attempt instead
   of the silent no-op the unique-index conflict causes today.
9. `handleRetryDraftStructure` accepts status `failed`, **or** status `shaping_structure` whose
   turns evaluate to `"stalled"`; every other status still returns `409 not_failed`. The stalled
   determination is made server-side from `getStructureTurns`, never read from the request.
10. `handleRetryDraftStructure` writes `shaping_structure` before its `202` and reports that status
    in the body.
11. The existing `setCurriculumStatus(..., "shaping_structure")` after a successful draft
    (`curriculum-structure.ts:263`) is left in place and is harmless as a repeat write.
12. No migration is generated and `curriculumStatusSchema` (`packages/shared/src/curriculum.ts:18`)
    is unchanged — proven by those files appearing in no diff.

**Pure logic — `packages/core/src/curriculum/structure-draft.ts`**

13. `STALE_PENDING_TURN_AGE_MS` is defined here and equals `5 * 60 * 1000`;
    `apps/api/src/curriculum/curriculum-structure.ts` imports it instead of declaring its own, and
    no second literal for this threshold exists anywhere in the repo.
14. `isStalePendingTurn(turn, now)` is `false` for an assistant `pending` turn at
    `createdAt + 4m 59s` and `true` at `createdAt + 5m`; `false` for any turn whose role is `user`
    or whose status is `complete` or `failed`, regardless of age.
15. `draftProgressState(turns, now)` returns `"drafting"` for a turn list with no snapshot anywhere
    whose last entry is a fresh assistant `pending` turn.
16. `draftProgressState` returns `"stalled"` for that same list once the pending turn crosses the
    threshold.
17. `draftProgressState` returns `"idle"` when **any** turn in the list carries a snapshot, even if
    the trailing turn is a fresh assistant `pending` turn — this is what keeps a mid-conversation
    edit turn on its existing Resend affordance rather than the draft-progress path.
18. `draftProgressState` returns `"idle"` for an empty turn list, and for a list whose last turn is
    `complete` or `failed`.

**Web — the drafting window**

19. With status `shaping_structure` and no snapshot, the page renders
    `data-testid="structure-draft-pending"` carrying the backend's own copy, "Drafting the first
    version of the structure…" — including when the turn list is empty (the moment between the
    controller's status write and the placeholder insert).
20. The `data-testid="source-approval-empty"` warning — "No trustworthy sources were found (or all
    were removed)…" — is **not** present at any point after approval succeeds. Asserted as an
    absence across the whole drafting window, since this is the defect being fixed.
21. While `draftProgressState` is `"drafting"`, the transcript does **not** render "That reply
    didn't come through." or `data-testid="structure-turn-resend"` for the live pending draft turn.
22. A genuinely stale pending turn in a conversation that already has a snapshot still renders the
    resend affordance exactly as it does today — the fix narrows `stuckPendingTurn`, it does not
    remove it.
23. `data-testid="structure-chat-input"`, `structure-chat-send` and `structure-chat-confirm` are
    rendered **only** when `draftProgressState` is `"idle"` — withheld while `"drafting"` *and*
    while `"stalled"`, since a stalled draft still has no snapshot to comment on and a message sent
    then would leave an orphan user turn. All three return once a snapshot exists.
24. The pending panel refreshes itself on a 2500 ms `router.invalidate()` interval while mounted and
    clears that interval on unmount — the same idiom, cadence and cleanup as `CuratingBanner`
    (`curriculum-lifecycle.tsx:16-22`). The learner never has to reload.
25. When `draftProgressState` is `"stalled"`, the panel replaces the drafting copy with a
    longer-than-expected message and offers a retry control that calls `retryDraftStructure` for
    this curriculum.

**Web — the approve action**

26. `SourceApprovalPanel.approve()` keeps `busy` set across `await router.invalidate()`, so the
    button reads "Generating…" continuously from click until the panel unmounts — it never re-arms
    to "Approve & generate" mid-flight.
27. A rejected approve request (e.g. the `409` from criterion 3) leaves the button usable again and
    renders an explanation in the panel's existing inline error paragraph, rather than a permanently
    disabled button with no message. The rejection genuinely propagates —
    `api-client.ts`'s `request()` throws `ApiError` on any non-2xx and `api.approveSources` does not
    swallow it — so `api.approveSources` maps the known codes (`not_awaiting_approval`,
    `no_approved_sources`) to a typed result the panel branches on, following
    `api.submitStructureTurn`'s precedent, with a `catch` retained only for unexpected failures.

---

## SCENARIO 1 — Approving researched sources shows drafting, never "no sources found"

**Given** a course created from a researched technology, sitting at `awaiting_source_approval` with
three pending candidate sources
**When** the learner clicks "Approve & generate" and the app refetches the page
**Then** the button stays "Generating…" until the panel is replaced, the page shows "Drafting the
first version of the structure…", and the amber "No trustworthy sources were found" warning is never
displayed at any point — including on the very first refetch, which can land in the new window where
the status is already `shaping_structure` but no placeholder turn has been written yet, so the
transcript is empty. That combination was previously impossible and the drafting copy must still
render for it.

*Covers 1, 2, 19, 20, 26.*

## SCENARIO 2 — The status is already correct by the time the client can look

**Given** the approve request has returned
**When** the client immediately refetches the curriculum detail
**Then** the persisted status is `shaping_structure`, because the status was written and awaited
before the response was sent — not left to a floating promise the refetch could outrun.

*Covers 1, 2, 4.*

## SCENARIO 3 — A live draft is not mistaken for a crashed one

**Given** the draft is genuinely in flight, with a pending assistant turn written seconds ago
**When** the page refreshes on its polling interval
**Then** the transcript shows the drafting state and offers no "That reply didn't come through."
message and no Resend button, and the chat composer and "Build this course" control are absent —
there is nothing yet to give feedback on.

*Covers 21, 23, 24.*

## SCENARIO 4 — Editing mid-conversation keeps its existing recovery affordance

**Given** a course already showing a drafted structure, where the learner sent an edit message and
the server died mid-turn, leaving a pending turn older than five minutes
**When** the learner returns to the page
**Then** the resend affordance renders exactly as it does today, because the conversation already
carries a snapshot and is therefore not in a draft-progress state.

*Covers 17, 22.*

## SCENARIO 5 — The draft completes and the page moves on by itself

**Given** the learner is watching the drafting panel
**When** the model returns and the placeholder turn is updated with a snapshot
**Then** within one polling tick the panel fills in with the drafted module tree, the study-time
estimate, the composer and the "Build this course" button, with no reload and no manual action.

*Covers 11, 23, 24.*

## SCENARIO 6 — The draft fails and the learner gets the existing verdict

**Given** the drafting agent exhausts its retries and throws
**When** the polling tick refetches the page
**Then** the status is `failed`, the drafting panel is gone, and the existing amber "The mentor
couldn't draft a structure for this course." banner with its working "Retry drafting" button is
shown — the pre-existing failure path, unchanged by this story.

*Covers 24, and asserts no regression to the `failed` path.*

## SCENARIO 7 — The draft hangs and the learner is not left staring at a spinner

**Given** the generation stopped responding — the process was killed, or the model call hung with no
timeout — leaving a pending draft turn and status `shaping_structure`
**When** more than five minutes pass and the panel refreshes
**Then** the copy changes from "Drafting…" to a longer-than-expected message with a retry control —
and no chat composer, since there is still nothing to comment on — and using that control produces a
real new generation attempt: the stranded pending turn is finalized first, so the retry is not
swallowed as "already in progress".

*Covers 8, 9, 10, 16, 23, 25.*

## SCENARIO 8 — Two tabs cannot both start a generation

**Given** the learner has the course open in two tabs, both showing the approval panel
**When** they click "Approve & generate" in the second tab after the first has already started
**Then** the request is refused with `not_awaiting_approval`, the second tab's button becomes usable
again and shows an explanation instead of hanging disabled forever, and only one generation attempt
runs.

*Covers 3, 5, 27.*

## SCENARIO 9 — A generation that dies before it starts does not strand the course

**Given** the approve handler has written `shaping_structure` and dispatched the generation
**When** that dispatch throws before the placeholder turn is inserted
**Then** the course lands on `failed` with its existing retry banner, rather than sitting in
`shaping_structure` with an empty transcript and no way forward.

*Covers 7.*

## SCENARIO 10 — Existing behaviour is preserved

**Given** the current test suite
**When** it is run after these changes
**Then** `curriculum-structure.test.ts`'s conflict back-off, rethrow, stale-turn and
llm-call-event cases all pass unmodified; no migration is generated; `curriculumStatusSchema` is
untouched; and the API's staleness threshold and the web app's progress rendering read the same
constant from `packages/core`.

*Covers 5, 6, 12, 13, 14, 15, 18.*
