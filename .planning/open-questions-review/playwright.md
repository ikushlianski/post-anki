---
type: playwright
branch: open-questions-review
task: "Capture open questions raised mid-study and periodically resurface unanswered ones for review"
state: confirmed
target-project: post-anki
target-feature: probe (capture), open-questions (list/resolve, new folder)
actions-snapshot-date: 2026-08-13
updated: 2026-08-13
---

# Playwright readiness — open questions review

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — A learner mid-quiz or mid-Socratic-chat can capture a question in one action without
  leaving the study flow. → S1, S2
- B2 — A captured question is not lost — it appears in a standing, revisitable list. → S3
- B3 — The system periodically resurfaces unanswered questions instead of leaving capture as a
  one-way drop. → S5, S8
- B4 — A learner can actually address a captured question — answer it or mark it no longer
  relevant — closing the loop the issue explicitly asks for. → S6, S7

**UX scenarios**
- U1 — Capture control mirrors the existing thumbs-feedback popover interaction the learner
  already knows (button → text field → save), attached at the same two study-flow surfaces. → S1, S2, S4, S10
- U2 — Empty states on both the `/today` banner and the `/open-questions` list read as calm
  ("nothing to review"), not broken. → S9
- U3 — The `/today` banner caps at 3 and links to the full list rather than dumping the whole
  backlog into the daily page. → S8

**Not e2e (verified at unit/integration only)**
- None — every scenario here has an observable browser-level effect (a rendered button, a row in a
  list, a banner, an inline answer field), unlike `gap-mastery-cascade-delete`'s DB-only scenario.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature (capture): `features/probe/` — the two capture call sites (`probe-session-quiz.tsx`,
  `socratic-chat.tsx`) already host `features/probe/actions/submit-item-feedback.action.ts` and its
  tests (`quiz-question-feedback/`, `socratic-turn-feedback/`); capture-question actions/tests join
  that same folder rather than forking a new one for two extra buttons on pages `probe` already owns
- Feature (review list + banner): `features/open-questions/` — new folder. `/open-questions` is a
  new route with no existing owner; `view-cross-cutting-nudge.action.ts` (the closest precedent,
  living under `features/probe/actions/` because it reads `/today`) shows this repo is willing to
  put a `/today`-reading action in whichever feature folder owns the underlying data, so the
  `/today` banner's own action (`view-open-questions-banner.action.ts`) is placed in
  `features/open-questions/actions/` alongside the list/resolve actions, since the banner and the
  list share the same backend and the same "open questions" concept — not in `probe`.
- Dev server: standard `npm run dev:pw` stack (e2e API `:8031`, web `:3100`, local Postgres `:5436`)
  — no new mock service needed (no LLM call anywhere in this feature per spec.md Decision 7).

## Action surface — snapshot

Existing, reusable as-is:
- `open-socratic-chat.action.ts`, `open-topic-quiz.action.ts`, `answer-single-select.action.ts`,
  `send-socratic-answer.action.ts` — get to the point in the flow where a question/turn is on
  screen, before capturing a question about it.
- `view-cross-cutting-nudge.action.ts` — pattern to copy for the new `/today` banner read, not
  reused directly (different testid).

New actions needed (gaps):
- `capture-open-question.action.ts` — click the capture button, type question text, save. Takes
  `{ page, itemTestId, questionText }`, mirrors `submit-item-feedback.action.ts`'s
  click-popover-fill-submit shape.
- `view-open-questions-list.action.ts` — `page.goto('/open-questions')` + `waitForHydration`.
- `answer-open-question.action.ts` — on the list page, fill the inline answer field for a given
  row and submit.
- `dismiss-open-question.action.ts` — click "Not needed" for a given row.
- `view-open-questions-banner.action.ts` — `page.goto('/today')` + `waitForHydration` (same shape
  as `view-cross-cutting-nudge.action.ts`, separate file since it reads a different testid/section).

## Scenario → action + state + testid map

### S1 — Capture a question during a quiz question
**Composes actions:** `open-topic-quiz.action.ts` → `capture-open-question.action.ts`
**Action gaps:** `capture-open-question.action.ts` (new)
**Pre-test state:** a confirmed curriculum with one topic and at least one ready quiz question —
reuse `features/probe/fixtures/mock-data` seed used by `quiz-single-select`.
**Required `data-testid`:** `capture-question-${itemId}` (button), `capture-question-input-${itemId}`
(textarea), `capture-question-submit-${itemId}` (save), `capture-question-saved-${itemId}`
(confirmation) — mirrors `item-feedback-*` testid naming exactly.

### S2 — Capture a question during a Socratic turn
**Composes actions:** `open-socratic-chat.action.ts` → `capture-open-question.action.ts`
**Action gaps:** none beyond S1's
**Pre-test state:** same as `socratic-chat` tests' existing fixture
**Required `data-testid`:** same pattern, keyed by `turnId`

### S3 — Captured question appears in the review list
**Composes actions:** S1 or S2's capture, then `view-open-questions-list.action.ts`
**Action gaps:** `view-open-questions-list.action.ts` (new)
**Pre-test state:** one open question seeded or captured in-test
**Required `data-testid`:** `open-questions-list`, `open-question-row-${id}`,
`open-question-text-${id}`, `open-question-topic-${id}`

### S4 — Empty question text is rejected
**Composes actions:** `capture-open-question.action.ts` with empty string
**Action gaps:** none
**Pre-test state:** same as S1
**Required `data-testid`:** submit button must be `disabled` when input is empty — assert via
existing testid, no new one needed

### S5 — Surfaces on `/today` as a banner
**Composes actions:** capture (S1/S2), then `view-open-questions-banner.action.ts`
**Action gaps:** `view-open-questions-banner.action.ts` (new)
**Pre-test state:** one open question seeded; a `/today` push must also be seeded (reuse
`gengap`/`dailyPush` fixture precedent) since `TodayPage` requires `push` to render meaningfully
**Required `data-testid`:** `open-questions-banner`, `open-question-banner-item-${id}`

### S6 — Mark a question answered
**Composes actions:** `view-open-questions-list.action.ts` → `answer-open-question.action.ts`
**Action gaps:** `answer-open-question.action.ts` (new)
**Pre-test state:** one open question seeded
**Required `data-testid`:** `open-question-answer-input-${id}`, `open-question-answer-submit-${id}`;
the row element carries `data-status="answered"` after submit (attribute value change on the
existing row, decided now — not deferred to implementation) plus a visible
`open-question-status-${id}` badge reflecting the same state

### S7 — Dismiss a question
**Composes actions:** `view-open-questions-list.action.ts` → `dismiss-open-question.action.ts`
**Action gaps:** `dismiss-open-question.action.ts` (new)
**Pre-test state:** one open question seeded
**Required `data-testid:`** `open-question-dismiss-${id}`

### S8 — Banner caps at 3, links to full list
**Composes actions:** seed 5 open questions, `view-open-questions-banner.action.ts`
**Action gaps:** none beyond S5's
**Pre-test state:** 5 open questions seeded via a new `features/open-questions/seeds/` helper
(mirrors `features/probe/seeds/seed-gap-mastery.ts`'s precedent for seeding rows Playwright can't
reach through the UI fast enough)
**Required `data-testid`:** `open-questions-banner-more-link` (the "+2 more" link to `/open-questions`)

### S9 — Empty states (no open questions)
**Composes actions:** `view-open-questions-banner.action.ts`, `view-open-questions-list.action.ts`
on a fixture with zero open questions
**Action gaps:** none
**Required `data-testid`:** `open-questions-banner-empty` — the banner's content area always
renders this explicit marker when there are zero open questions (decided now: never simply absent,
so a Playwright assertion can't confuse "empty" with "broken loader"); `open-questions-list-empty`
on `/open-questions` for the same reason

### S10 — Question text max length (1000 chars)
**Composes actions:** `capture-open-question.action.ts` with a 1001-char string
**Action gaps:** none
**Required `data-testid`:** none new — asserts client-side validation state on the existing submit
button/testid from S1

## Seeds needed

`features/open-questions/seeds/seed-open-questions.ts` — direct-insert helper for scenarios that
need N pre-existing rows without going through capture UI first (S5 baseline, S8's 5-row banner
cap, S6/S7's pre-test state), mirroring `features/probe/seeds/seed-gap-mastery.ts`.
