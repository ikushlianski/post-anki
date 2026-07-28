---
type: scenarios
branch: decide-mode
state: confirmed
updated: 2026-07-28
---

# Scenarios: Opinion-First Decision Training mode (/decide)

All 4 scenarios run against the project's real e2e stack (`:3100` web / `:8031` api / `:5436`
postgres, per `project.json`), with the local `mock-openrouter` server standing in for the LLM
call — same mechanism `check-my-writing-mode`/`english-batch-practice` already use. Auth is the
project's single static bearer (`API_SHARED_SECRET`), already wired into every existing
action/fixture — nothing scenario-specific to set up.

Each `Acceptance` block is grouped **Code (BE)** / **Behavior (FE)** / **Integration (Infra)** /
**Observability** / **Tests**, per this project's standard contract.

---

## SCENARIO 1 — User reasons through a real decision, submits their own opinion first, and gets a structured gap analysis they can act on

**Narrative:** On `/decide`, the user describes a real decision they're facing ("Should we move
sessions from JWTs to server-side sessions?") and — before seeing any AI response — writes their
own opinion ("I'd keep JWTs because our API is already stateless and horizontally scaled"). Only
after submitting both does the mentor's evaluation appear: strengths in their reasoning, blind
spots they didn't address, sharp follow-up questions, and a verdict. Each blind spot is
individually actionable — not just read, but flaggable as something to revisit.

**Setup role:** Subject = the decide session itself (front door — created by a real form
submission through the real UI; the LLM's evaluation content is scenery, stubbed via
`mock-openrouter`). No pre-existing entity required — `/decide` is standalone, no subject/topic
scoping.

**UI clicking notes:** `decide-submit-button` is disabled until BOTH `decide-decision-input` and
`decide-opinion-input` hold non-whitespace text (two-field gate, not one — this is the
opinion-first mechanism itself: the button must not enable on the decision alone). Clicking submit
waits for the real `submitDecide`-matching network response (base64 `/_serverFn/` marker
technique, same as `checkWriting`'s action — not a DOM-visibility poll, per this project's
documented DOM-poll-race history). Success indicator: `decide-result` becomes visible with
`data-verdict` set; strengths/blindSpots/questions render as lists; each blind spot list item
carries its own `decide-blind-spot-item-<n>` with nested `decide-blind-spot-flag-button-<n>` and
`decide-blind-spot-dismiss-button-<n>`. No toast, no redirect — the result renders inline below
the form, matching the existing (pre-plan) UX exactly.

**Acceptance:**
```
Code (BE):
  - POST /decide-sessions accepts { decision: string (trimmed, min 1), opinion: string (trimmed,
    min 1) }. Calls decide.orchestrator.ts's submitDecideSession(decision, opinion), which:
      1. Calls the existing decide agent (AGENT_KEYS.decide) with structuredOutput against the
         UNCHANGED decideResultSchema ({ strengths: string[], blindSpots: string[],
         questions: string[], verdict: string }).
      2. On a thrown agent error, OR on result.object == null: returns 502
         { error: "evaluator_unavailable" }, no DB write in either case (unified — see spec.md's
         Route design section for why the old 200-FALLBACK branch was collapsed into this one).
      3. On success: inserts one decide_sessions row (id, decision, opinion, verdict, strengths,
         questions, createdAt) via newId("decidesession"), then inserts one decide_blind_spots
         row per string in blindSpots (id via newId("decideblindspot"), decideSessionId,
         description = the string, status = "pending", source = "decide", createdAt), and returns
         the full DecideSession shape: { id, decision, opinion, verdict, strengths, questions,
         blindSpots: [{id, description, status: "pending", resolvedAt: null}, ...], createdAt }.
  - Edge case: agent returns blindSpots: [] (a genuinely strong opinion with no gaps found) —
    decide_sessions row is still inserted, zero decide_blind_spots rows are inserted, response's
    blindSpots array is [].
  - Negative assertion: no decide_sessions row is EVER inserted before the agent call resolves —
    submitting and immediately checking the DB mid-request (via the mock's artificial delay, if
    the test needs to assert ordering) never shows a row.

Behavior (FE):
  - decide-submit-button starts disabled (both fields empty).
  - Typing into decide-decision-input alone (opinion still empty) keeps it disabled.
  - Typing into decide-opinion-input too (both non-whitespace) enables it.
  - Clicking submits, shows a busy state ("Evaluating…", matching existing button text), then
    renders decide-result with data-verdict, plus three lists (strengths/blind spots/questions)
    and the verdict text — this is the EXISTING rendering, unchanged in this plan except each
    blind-spot <li> now also renders its two action buttons.

Integration (Infra): mock-openrouter returns a fixture-defined decideResultSchema-shaped response
  for this test's specific decision/opinion pair (deterministic, not a live LLM call).

Observability: none new — no logging requirement beyond the existing log.error on agent failure.

Tests:
  [x] @decide-mode.S1 — e2e test written
  [x] decide.orchestrator.test.ts covers: successful generate → 1 session row + N blind-spot
      rows inserted with status "pending"; agent throw → 502, zero rows; result.object null →
      502, zero rows (both failure branches produce the identical response shape and DB
      outcome); blindSpots: [] → session row inserted, zero blind-spot rows.
```

---

## SCENARIO 2 — Decision history survives a reload, newest first

**Narrative:** After submitting two separate decisions in one sitting, the user reloads `/decide`.
Both past sessions are still there, most recent first, with their full evaluations intact — they
don't have to re-describe a decision they already reasoned through to see what the mentor said.

**Setup role:** Subject = the two decide sessions (front door — both created via real form
submissions in-test, in sequence). Scenery = none; a fresh e2e run's `decide_sessions` table
starts empty (no baseline seed needed — same posture `writing_checks`' S2 already established for
an analogous history-list scenario).

**UI clicking notes:** Submit session A (decision "X", opinion "reasoning about X"), wait for its
result to render, submit session B (decision "Y", opinion "reasoning about Y") the same way, then
`page.reload()`. History renders below the form as `decide-history-item-0` (session B, newest) and
`decide-history-item-1` (session A), each showing its decision text at minimum (collapsed by
default is acceptable — full detail is not required to prove ordering). **Ordering assertion is on
the user-supplied `decision` text only, not on mentor-generated verdict content** — `decision` is
echoed straight back from the request the test itself sent, so this scenario needs no
`mock-openrouter` prompt-discrimination capability at all (the exact gap `workplace-scenario-packs`
found and fixed for a different mock parameter — this scenario sidesteps it by construction rather
than assuming the mock discriminates correctly). A single shared fixture response is reused for
both A and B submissions; only the request-side decision/opinion text differs between them.

**Acceptance:**
```
Code (BE):
  - GET /decide-sessions returns all rows from decide_sessions ordered created_at DESC, each with
    its blindSpots nested (a join against decide_blind_spots per session, matching how
    getPhraseBank already nests child rows for its parent response).
  - Input/output shape: no query params, no pagination for this plan (matches writing_checks'
    unpaginated GET) — full history every time, acceptable at the App's current, small personal-use
    scale.

Behavior (FE):
  - decide.tsx fetches history via a plain REST GET + react-query (queryOptions + useQuery, same
    pattern check-writing established) on page load — NOT Electric (matches the established
    precedent: language-practice history-style reads stay off Electric per
    phrase-bank-panel.tsx's documented decision).
  - After a successful submitDecide mutation, queryClient.invalidateQueries refetches history so
    the new session appears without a manual reload (this is what makes S1's just-submitted
    session become S2's first history item without extra wiring).
  - Reloading re-fetches from GET /decide-sessions and renders the same two items in the same
    order — no resubmission, no re-call to the LLM.

Integration (Infra): mock-openrouter returns distinct, deterministic responses keyed to each
  fixture decision/opinion pair, so S2 can assert A's and B's specific verdict text order without
  the two responses colliding.

Observability: none new.

Tests:
  [x] @decide-mode.S2 — e2e test written
  [x] decide.repo.test.ts covers: listDecideSessions returns rows ordered DESC by createdAt, with
      nested blindSpots correctly attributed to their parent session (not cross-joined across
      sessions).
```

---

## SCENARIO 3 — Flagging a blind spot as a gap to revisit persists, proving the #57 seam is real

**Narrative:** After reading the mentor's evaluation, the user recognizes one blind spot as a real
gap in their thinking ("I hadn't considered session revocation") and clicks "Flag as a gap to
revisit" on it. It's marked, visibly, without losing the rest of the evaluation on screen — and
the flag survives a reload, proving this is a real, queryable signal (not a decorative click), the
concrete seam #57 will later fold into its own tracker.

**Setup role:** Subject = the blind-spot flag action itself (front door — the PATCH triggered by a
real button click). Scenery = one decide session with at least one blind spot — **scenery,
produced front-door; no seed path exists** for `decide_blind_spots` (there is no back door into
this table — a direct DB insert would bypass the exact code path S1 already proves, so setup uses
the same real `submitDecide` action S1 uses, just not asserted on here).

**UI clicking notes:** Clicking `decide-blind-spot-flag-button-0` sends `PATCH
/decide-blind-spots/:id { status: "accepted" }`, waits for that real network response (not a DOM
poll), then updates that blind spot's rendered state — e.g. `decide-blind-spot-item-0` gains
`data-status="accepted"` and the flag button becomes disabled/relabeled "Flagged" while the dismiss
button disappears (mutually exclusive actions on one row). No page reload, no navigation.
Dismissing (`decide-blind-spot-dismiss-button-<n>` → `status: "rejected"`) follows the identical
mechanism for the negative case. After a `page.reload()`, `GET /decide-sessions`' nested
`blindSpots` reflects the persisted `status`, so the flagged state is still shown.

**Acceptance:**
```
Code (BE):
  - PATCH /decide-blind-spots/:id accepts { status: "accepted" | "rejected" } (shared
    resolveDecideBlindSpotInput schema, mirrors resolvePrioritySuggestionInput's shape exactly).
  - Sets status to the given value and resolvedAt = now(); returns the updated
    DecideBlindSpot shape { id, description, status, resolvedAt }.
  - Edge case: PATCH against a non-existent blind-spot id returns 404 not_found (mirrors
    handleCurateGap's existing-row check).
  - Negative assertion: PATCH never touches decide_sessions or other blind spots on the same
    session — only the targeted row's status/resolvedAt change.

Behavior (FE):
  - Clicking flag/dismiss calls the new resolveDecideBlindSpot server function, awaits the real
    network response, then updates local render state for that one blind spot (optimistic update
    acceptable, but the test asserts on the POST-response state, not the optimistic one, per this
    project's no-DOM-poll convention).
  - The two buttons are mutually exclusive per row: after one resolves, only a "Flagged"/"Dismissed"
    label remains for that row; the sibling button disappears — proven by asserting BOTH buttons'
    visibility before and after the click (the tinker/state-transition check for this control).

Integration (Infra): none beyond the standard e2e stack — no mock-openrouter involvement (this
  scenario doesn't call the LLM at all, only the persisted session from setup).

Observability: none new.

Tests:
  [x] @decide-mode.S3 — e2e test written
  [x] decide.repo.test.ts covers: updateDecideBlindSpotStatus sets status + resolvedAt for the
      targeted row only; returns null/throws for a non-existent id (whichever this codebase's
      existing repo-not-found convention uses — mirror gap.repo.ts's pattern).
```

---

## SCENARIO 4 — Whitespace-only decision or opinion never reaches the agent or the database

**Narrative:** The user tries to submit with an empty or whitespace-only decision or opinion — the
button simply won't let them; no wasted LLM call, no junk history row appears later.

**Setup role:** Subject = the input-validation gate (front door — real typing/clearing in the real
form). No scenery required.

**UI clicking notes:** Typing only spaces into `decide-decision-input` (with a valid opinion
already present) keeps `decide-submit-button` disabled. Filling the decision with real text enables
it. Clearing the decision back to whitespace-only re-disables it (the required tinker step, same
pattern `check-writing`'s S3 established for `check-writing-submit-button`). The same check is
repeated for `decide-opinion-input` independently, since S1 already established the two-field gate
— this scenario specifically proves EACH field is independently validated, not just "both
non-empty at submit time."

**Acceptance:**
```
Code (BE):
  - decideInput (packages/shared/src/decide.ts) gains .trim().min(1) on both decision and opinion
    (currently just .min(1), which a whitespace-only string still satisfies — this is a real,
    fixable gap in the existing shared schema, in scope for this plan since it's the exact
    validator this new persisted flow depends on).
  - POST /decide-sessions with { decision: "   ", opinion: "real opinion" } returns 400
    invalid_input before decide.orchestrator.ts / the agent is ever called; no decide_sessions row
    inserted. Same for the reverse (valid decision, whitespace opinion) and both-whitespace.

Behavior (FE):
  - decide-submit-button's enabled state is computed from
    decision.trim().length > 0 && opinion.trim().length > 0 (client-side mirror of the
    server-side validator — belt and suspenders, matches check-writing's pattern).

Integration (Infra): none — this scenario never reaches mock-openrouter.

Observability: none new.

Tests:
  [x] @decide-mode.S4 — e2e test written
  [x] Shared schema unit coverage (packages/shared/src/decide.test.ts, new file): decideInput
      rejects { decision: "   ", opinion: "x" }, { decision: "x", opinion: "   " }, and
      { decision: "", opinion: "" }; accepts trimmed non-empty values on both.
```
