---
type: playwright
branch: check-my-writing-mode
task: check-my-writing-mode
state: confirmed
target-project: post-anki
target-feature: features/practice
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Port "check my writing" to the English subject

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — Post-anki becomes a daily-use utility for real work writing (Slack messages, PR
  descriptions, emails), not just scheduled English drills — the actual differentiator the wishlist
  names. → S1
- B2 — Every piece of writing checked is kept, scoped to the subject, so the user can look back at
  what he's checked before without re-pasting it. → S2
- B3 — Empty submissions never reach the LLM or the database — no wasted cost, no junk history rows.
  → S3

**UX scenarios**
- U1 — Pasting text and clicking Check shows a score, verdict, feedback, and 1-2 native rewrites —
  the same visual pattern `batch-practice.tsx` already established for graded translations. → S1
- U2 — Checking two pieces of text and reloading the page shows both, most recent first, with no
  re-checking needed. → S2
- U3 — The Check button won't let you submit blank or whitespace-only text — it just stays
  disabled. → S3

**Not e2e (verified at unit/integration only, or intentionally not ported)**
- **Source app's S3 (new endpoint rejects unauthenticated requests) — not ported.** Post-anki's auth
  is one global gate (`apps/api/src/server.ts`'s `authorized()`), called once before ANY route
  dispatch — there is no per-route middleware to attach or forget on a new endpoint, unlike the
  source app's per-server-function `requireAdminMiddleware` (a real thing to forget, which is what
  that scenario existed to catch there). A new "new endpoint returns 401 with no auth header"
  scenario here would only be re-proving the same global gate every existing route already proves —
  not testing anything this ticket could plausibly get wrong. See `spec.md`'s "Route protection"
  section and `discussion.md` fork 5.
- **New route's wrong-subject-kind 404 guard — not a dedicated scenario.** The new route's loader
  copies `practice.$subjectId.tsx`'s existing `subject.kind !== 'language-practice' → notFound()`
  check verbatim (3 lines, no new logic). Already proven by that parent route's own existing tests
  (`subject-card-branches-by-kind` and the practice-page tests exercise the identical guard). See
  `discussion.md` fork 7.
- Orchestrator/repo unit tests (`writing-check.orchestrator.test.ts`, `writing-check.repo.test.ts`,
  named in `spec.md`'s Backend DoD) are genuinely unit-level (mocked agent, direct repo calls) —
  listed there, not here, since they don't drive the UI.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/practice/` (the one existing language-practice feature folder — no separate
  `features/check-writing/`; this is a language-practice concern, already owned by this folder)
- Target DB: the project's standard e2e Postgres (`localhost:5436`, `e2e/docker-compose.yml`)
- Dev server URL: `http://localhost:3100` (web) / `http://localhost:8031` (api), per `project.json`

## Action surface — snapshot

Actions already available in `features/practice/actions/` at planning time:
- `openPracticePage` — navigates to `/practice/:subjectId`.
- `generatePhraseBatch`, `answerAndSubmitChunk`, `changeLevel`, `changePack`, `continueChunk` — none
  of this ticket's scenarios need them (check-writing is a sibling surface, not a batch-practice
  flow).

New for this ticket (the one real action gap):
- `checkWriting({ page, subjectId, text }) -> { score, verdict, feedback, nativeAlternatives }` —
  mirrors `submitChunk`'s network-response-wait pattern (waits on the real `checkWriting`
  server-fn RPC response, not a DOM poll — this project has a documented history of DOM-poll races,
  see `fix-duplicate-generatenextbatch-call`). Navigation to `/practice/:subjectId/check-writing`
  itself is not part of this action — each scenario navigates explicitly (mirrors `openPracticePage`
  being a separate, composable step from the batch-practice actions).

**Mock-openrouter responder gap (not an "action" but an equally real planning-time gap):** a new
`writing-check` responder in `verification-repo/projects/post-anki/post-anki/mock-openrouter/
responses.ts`, matched by `ctx.schemaProps.includes('nativeAlternatives') &&
!ctx.schemaProps.includes('gradedAnswers')` (the new agent's schema top-level keys are
`score`/`verdict`/`feedback`/`nativeAlternatives` directly, with no wrapping key — this cannot
collide with `grade-batch`'s `gradedAnswers`-key match; confirmed by grep, no other existing
responder's schema carries `nativeAlternatives` as a top-level key). Must be placed before the
generic catch-alls (`study-chat`, `web-grounding`), same constraint the two existing practice
responders already document. **This mock has no enqueue/response-queue mechanism** (confirmed by
reading the file — every responder is a pure function of the request; the source app's
`dequeueStub` FIFO idiom does not port), so S2's two different graded results are selected by
matching the submitted text inside `ctx.userText` (the agent's prompt embeds the submitted text
verbatim), the same content-branching technique already used for `ENRICHMENT_REDUNDANT_MARKER`.

## Scenario → action + state + testid map

### S1 — User checks a piece of writing and gets a score + rewrites

**Composes actions:** `checkWriting` (new), plus the existing `subject`-feature action that creates
a `language-practice`-kind subject (reused, not this ticket's own — see Action surface above).

**Action gaps:** `checkWriting({ page, subjectId, text: string }) -> { score: number, verdict: 'Ok'
| 'NeedsReview' | 'NeedsDeepDive', feedback: string, nativeAlternatives: string[] }` — navigates to
`/practice/{subjectId}/check-writing` if not already there, fills `check-writing-input`, clicks
`check-writing-submit-button`, waits for the `checkWriting` server-fn RPC response, then reads back
`check-writing-result-score` / `-verdict` / `-alternatives` from the DOM.

**Pre-test state:** a fresh `language-practice`-kind subject (front door — created via the existing
`subject` feature's creation action, no new creation path needed).

**Required `data-testid` attributes:**
- `check-writing-input` — the textarea
- `check-writing-submit-button` — the Check button
- `check-writing-result` — the result card container (`data-verdict` attribute)
- `check-writing-result-score`, `check-writing-result-verdict`, `check-writing-result-alternatives`

**Fixture variants:** `grade-freeform-slack-message` (mock-data: `MOCK_WRITING_CHECK_SLACK_MESSAGE`,
verdict `Ok`, score 9).

**Vision check candidate:** no (testid + text assertions are sufficient).

---

### S2 — Checked entries persist across reload and appear newest-first

**Composes actions:** `checkWriting` (called twice, once per fixture).

**Action gaps:** none beyond S1's `checkWriting`.

**Pre-test state:** same `language-practice`-kind subject as S1 (front door for the subject's
creation; the two `writing_checks` rows this scenario creates are themselves front door too — see
`state-fixtures.md`).

**Required `data-testid` attributes:**
- `check-writing-history` — the history list container
- `check-writing-history-item-{i}`, `check-writing-history-item-score-{i}`,
  `check-writing-history-item-verdict-{i}` — per-row

**Fixture variants:** `grade-freeform-slack-message` (verdict `Ok`, score 9, submitted first) +
`grade-freeform-stiff-email` (mock-data: `MOCK_WRITING_CHECK_STIFF_EMAIL`, verdict `NeedsReview`,
score 5, submitted second — deliberately different so the test can distinguish entries by content,
not just position).

**Vision check candidate:** no.

---

### S3 — Empty/whitespace-only text cannot be submitted

**Composes actions:** none — drives `check-writing-input`/`check-writing-submit-button` directly
inline (typing + attribute assertions), since `checkWriting` (the action) asserts *success*, which
never happens here by design.

**Action gaps:** none beyond S1's `checkWriting` (not used here).

**Pre-test state:** same `language-practice`-kind subject as S1/S2.

**Required `data-testid` attributes:** `check-writing-input`, `check-writing-submit-button` (both
reused from S1).

**Fixture variants:** none — no LLM call is ever expected to fire.

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `checkWriting` | S1, S2 (×2) | No — single-ticket action within an already-consolidated feature area; promote only if a future ticket composes it independently |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | `additive-seed` (subject creation) + front-door writes | mock-openrouter selects `MOCK_WRITING_CHECK_SLACK_MESSAGE` by matching the submitted text, no queue involved |
| S2 | `additive-seed` (subject creation) + front-door writes | mock-openrouter selects between the two fixtures by matching each submission's own text — order-independent, no queue |
| S3 | `additive-seed` (subject creation) | no fixtures — no LLM call ever fires |

## Open questions

None carried forward — see `scenarios.md`'s own "Open questions" for why the source app's two open
items don't apply here.
