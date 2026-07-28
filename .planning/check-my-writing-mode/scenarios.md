---
type: scenarios
branch: check-my-writing-mode
state: confirmed
updated: 2026-07-28
---

# Scenarios: Port "check my writing" to the English subject

All 3 scenarios run against the project's real e2e stack (`:3100` web / `:8031` api / `:5436`
postgres, per `project.json`), with the local `mock-openrouter` server standing in for the LLM call
(no real OpenRouter call — same mechanism `english-batch-practice`/`phrase-bank-mastery` already
use). Auth is the project's single static bearer (`API_SHARED_SECRET`) already wired into every
existing action/fixture — nothing scenario-specific to set up.

Each `Acceptance` block is grouped **Code (BE)** / **Behavior (FE)** / **Integration (Infra)** /
**Observability** / **Tests**, per this project's standard contract.

---

## SCENARIO 1 — User checks a piece of writing and gets a native-soundingness score + rewrites

**Narrative:** On a `language-practice` subject's practice page, the user clicks through to
`/practice/:subjectId/check-writing`, pastes a realistic work Slack message ("hey can u take a
look at this PR when u get a sec") into the input, and clicks Check. Once grading completes, they
see a 0-10 score, a verdict, feedback, and 1-2 full native rewrites — the same result-card shape
`batch-practice.tsx` already established for graded translations, applied to freeform text.

**Setup role:** Subject = the check submission + result rendering (front door — a real
`checkWriting` action triggered by a real button click; the LLM response itself is scenery, stubbed
via `mock-openrouter`). Scenery = the `language-practice` subject the test navigates to (created via
the existing `subject` feature's action, not this ticket's own UI) — a fresh subject's
`writing_checks` table scope starts empty.

**UI clicking notes:** `check-writing-submit-button` is disabled until `check-writing-input` holds
non-whitespace text (same gating philosophy as `submit-chunk-button`'s `!allChunkAnswered` gate).
Clicking submit waits for the real `checkWriting`-matching network response (base64
`/_serverFn/`-marker technique, generalized from `submit-chunk.action.ts`'s existing
`isGradeBatchResponse` — this project has a documented history of DOM-poll races,
`fix-duplicate-generatenextbatch-call`, so a DOM-visibility wait on `check-writing-result` is
explicitly the wrong pattern to copy). Success indicator: `check-writing-result` becomes visible
with `data-verdict` set to the graded verdict; no toast, no redirect, no chunk/batch concept (a
single one-shot submission, unlike `batch-practice`).

**Acceptance:**
```
Code (BE):
  - createWritingCheckAgent() (apps/api/src/mastra/writing-check.agent.ts) is a new Agent whose
    instructions grade freeform text (not a translation) for native-soundingness, using the same
    7-10/5-6/0-4 Ok/NeedsReview/NeedsDeepDive bands as gradeBatch's instructions, and explicitly
    require 1-2 full rewrites of the ENTIRE text even when the score is high. Registered under
    AGENT_KEYS.writingCheck in mastra.ts, alongside the existing 9 entries — none edited.
  - writingCheckAgentSchema (apps/api/src/practice/writing-check.schemas.ts):
    z.object({ score: z.number().int().min(0).max(10), verdict: verdictSchema, feedback:
    z.string(), nativeAlternatives: z.array(z.string()).min(1).max(2) }) — one aggregate object,
    not an array of per-item results (unlike gradeBatchSchema's gradedAnswers).
  - gradeAndStoreWritingCheck(subjectId, text) (writing-check.orchestrator.ts): calls
    getMastra().getAgent(AGENT_KEYS.writingCheck).generate(prompt, { structuredOutput: { schema:
    writingCheckAgentSchema } }), then insertWritingCheck(subjectId, text, result) — a single-row
    INSERT into writing_checks (id via newId(), subjectId, text, score, verdict, feedback,
    nativeAlternatives as a plain JS string[] bound to the jsonb column). Returns the full
    persisted row.
  - POST /subjects/:id/writing-checks (practice.controller.ts handleCreateWritingCheck): validates
    body against submitWritingCheckInput (z.object({ text: z.string().trim().min(1).max(5000) })),
    guarded by the existing requireLanguagePracticeSubject(res, subjectId) (400
    not_a_language_practice_subject if the subject isn't language-practice-kind), calls
    gradeAndStoreWritingCheck, responds 200 with the persisted row.
Behavior (FE):
  - Navigating to /practice/:subjectId/check-writing for a language-practice subject renders
    check-writing-input (empty textarea) and check-writing-submit-button (disabled on load).
  - Typing non-whitespace content into check-writing-input enables check-writing-submit-button.
  - After clicking submit and the checkWriting response resolves, check-writing-result becomes
    visible with data-verdict="<verdict>", showing check-writing-result-score (e.g. "9"),
    check-writing-result-verdict (human label, mirrors batch-practice's VERDICT_LABELS), the
    feedback sentence, and check-writing-result-alternatives (a list of 1-2 items).
Integration (Infra):
  - Post-anki's mock-openrouter has no response-queue/enqueue mechanism (confirmed by reading
    responses.ts — every responder is a pure function of the request; the source app's BAML
    dequeueStub FIFO idiom does not port). The test submits the exact text the
    grade-freeform-slack-message fixture is keyed to; the new `writing-check` responder
    (schemaProps includes nativeAlternatives, excludes gradedAnswers — cannot collide with
    grade-batch's matcher) selects MOCK_WRITING_CHECK_SLACK_MESSAGE by matching that text inside
    ctx.userText (the agent prompt embeds the submitted text verbatim — same technique this mock
    already uses for ENRICHMENT_REDUNDANT_MARKER). The score/verdict/alternatives rendered in
    check-writing-result are asserted against the fixture's exact values, proving the UI renders
    the server's real response, not a client-fabricated one.
  - A real GET /subjects/:id/writing-checks (or a direct SELECT via a query helper) immediately
    after confirms exactly one row was inserted with subject_id matching the test's subject.
Observability: n/a — no logging requirement for this scenario.
Tests:
  [x] @check-my-writing-mode.S1 — e2e test written
```

---

## SCENARIO 2 — Checked entries persist across reload and appear newest-first in a history list

**Narrative:** The user checks two different texts back-to-back on the same subject — a casual
Slack message (graded `Ok`) and a stiffer PR description (graded `NeedsReview`). Without
resubmitting anything, reloading the page shows both entries in `check-writing-history`,
most-recently-checked first, with the same score/verdict each was originally graded with.

**Setup role:** Subject = the persisted `writing_checks` rows + the history list surviving a real
page reload (front door — two real submissions followed by a real `page.reload()`). Scenery = the
`language-practice` subject (as S1); the two LLM responses are stubbed (scenery), same as S1.

**UI clicking notes:** Submit text A (Slack-message fixture), wait for its result card, submit text
B (PR-description fixture) — the input clears and re-disables between submissions (matches
`batch-practice`'s fresh-input-per-item pattern, applied to consecutive single-shot checks). Then
`page.reload()`; wait for `check-writing-history-item-0` and `-1` to both become visible (a real
GET round trip after reload, not instantaneous). Assert ordering: `-item-0` is text B (submitted
last), `-item-1` is text A. **Identify each history item by its distinct fixture content
(score/verdict), not by raw `created_at` values** — this project's own documented near-simultaneous
insert collision (`fix-duplicate-generatenextbatch-call` bug #6, and this same caveat already
carried in `phrase-bank-mastery`'s S2) means two stub-mode INSERTs moments apart can land at
adjacent-or-identical millisecond resolution.

**Acceptance:**
```
Code (BE): (reuses gradeAndStoreWritingCheck/agent/schema from S1 verbatim — this scenario is about
  persistence + ordering, not grading)
  - getWritingChecksForSubject(subjectId) (writing-check.repo.ts): SELECT * FROM writing_checks
    WHERE subject_id = $1 ORDER BY created_at DESC.
  - GET /subjects/:id/writing-checks (practice.controller.ts handleListWritingChecks): guarded by
    requireLanguagePracticeSubject, returns getWritingChecksForSubject(subjectId) as JSON array.
Behavior (FE):
  - checkWritingHistoryQuery(subjectId) (writing-check.api.ts, mirrors phraseBankQuery's
    queryOptions shape) + useQuery in check-writing.tsx renders check-writing-history (data-testid)
    with one check-writing-history-item-{i} per row, already server-sorted newest-first (no
    client-side re-sort needed, unlike phrase-bank's status grouping).
  - After a successful submit, queryClient.invalidateQueries({ queryKey:
    checkWritingHistoryQuery(subjectId).queryKey }) refetches the history list — mirrors
    practice.$subjectId.tsx's existing refreshPhraseBank() pattern for the Phrase Bank panel.
  - After page.reload() with zero resubmission, both check-writing-history-item-0 and -1 are
    visible again, same order, same check-writing-history-item-score-{i}/-verdict-{i} values as
    originally rendered.
Integration (Infra):
  - Querying writing_checks directly for the test's subject_id after both submissions returns
    exactly 2 rows; ORDER BY created_at DESC matches the UI's rendered order; each row's
    score/verdict/native_alternatives columns match their respective submitted-text-matched fixture exactly —
    native_alternatives is a genuine array via the driver (jsonb column), not a stringified blob.
Observability: n/a
Tests:
  [x] @check-my-writing-mode.S2 — e2e test written
```

---

## SCENARIO 3 — Empty or whitespace-only text cannot be submitted

**Narrative:** The user leaves `check-writing-input` empty, or types only spaces/newlines. The
Check button stays disabled the whole time — no `checkWriting` call ever fires, no `writing_checks`
row is created. Typing real content afterward enables the button normally (the tinker flip-and-
revert).

**Setup role:** Subject = the validation boundary itself (front door — real typing into the real
input, observing the real disabled state; no seeded precondition beyond the subject itself, which
is scenery). Scenery = the `language-practice` subject.

**UI clicking notes:** Type only whitespace (e.g. `"   \n  "`) into `check-writing-input`;
`check-writing-submit-button` must remain disabled — assert via the `disabled` attribute, not by
clicking and hoping nothing happens. Required tinker: type whitespace-only → assert disabled;
append real text (e.g. `"   hello"`) → assert enabled; clear back to whitespace-only → assert
re-disabled — proves the gate is live-reactive to input changes, not evaluated once on mount.

**Acceptance:**
```
Code (BE):
  - submitWritingCheckInput (z.object({ text: z.string().trim().min(1).max(5000) }),
    packages/shared/src/practice.ts) rejects a whitespace-only payload server-side too — defense in
    depth, in case a caller drives the endpoint directly, bypassing the disabled button. On
    rejection (400 invalid_input), no row is inserted into writing_checks and
    gradeAndStoreWritingCheck/the agent is never invoked (validation happens before the handler
    body runs).
Behavior (FE):
  - check-writing-submit-button carries the disabled attribute whenever check-writing-input's
    TRIMMED value is empty (covers both a truly empty string and a whitespace/newline-only string —
    trimming happens client-side for the disabled check, mirroring the server validator's own
    .trim().min(1)).
  - Typing non-whitespace content removes disabled; clearing back to whitespace-only re-adds it
    (the required tinker step).
Integration (Infra):
  - No network request matching the checkWriting server-fn RPC marker is observed while the button
    stays disabled (a short page.waitForResponse race against a timeout, expecting the timeout to
    win).
  - The writing_checks row count for the test's subject (via getWritingChecksForSubject or a direct
    query) is unchanged before and after the whitespace-only attempt.
Observability: n/a
Tests:
  [x] @check-my-writing-mode.S3 — e2e test written
```

---

## Open questions

None carried forward. The source app's own two open items (401-mechanism discretion, exact history
truncation length) don't apply here: the auth question is moot (see `spec.md`'s "Route protection"
section), and history-item truncation is implementer's visual discretion — no scenario asserts on
it beyond score/verdict/ordering, same allowance the source app gave itself.
