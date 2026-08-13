---
type: e2e-tests
branch: open-questions-review
updated: 2026-08-13
---

# E2E test coverage — open-questions-review — Open questions review (issue #87)

Hand-authored in verification-repo per `/e2e` (this project has no `/write-playwright-tests` →
`/implement-playwright` pipeline artifact yet for this ticket — implementation and e2e were done
together in one executor pass). Status: **GREEN — all 10 scenarios pass against the real e2e
stack** (see "Final green run" below). Test files live in verification-repo, not this repo, per
this project's registration — capture (S1, S2) joins `features/probe/tests/` (the two capture call
sites `probe` already owns), the review list/resurfacing (S3–S10) lives in the new
`features/open-questions/` folder, per `playwright.md`'s Target section.

Note on file layout: this project's own established convention (confirmed across `practice/`,
`subject/`, `probe/`, `tree-growth/`, `resource-enrichment/`, `stats/`, `lecture/`, `curriculum/`,
`decide/`) is `tests/<scenario-slug>/test.ts` + a sibling `scenario.md`, followed here.

| Scenario | Test (tag) | Where I go / what I click | Asserts — UI | Asserts — persistence | Status |
|---|---|---|---|---|---|
| S1 — capture a question during a quiz question | `@open-questions-review.S1` (`capture-question-quiz`) | open a topic's quiz, click "❓ Ask later", type, save | "Saved for later" confirmation | one `open_questions` row, `source_type='probe_question'`, `status='open'`, `topic_id` resolved server-side | GREEN |
| S2 — capture a question during a Socratic turn | `@open-questions-review.S2` (`capture-question-socratic`) | open Socratic chat (with a declared gap), click the same capture control, type, save | same confirmation | one row, `source_type='socratic_turn'`, `topic_id` resolved from the turn's session | GREEN |
| S3 — captured question appears in the review list | `@open-questions-review.S3` (`captured-question-appears-in-review-list`) | seed 2 open questions under different topics, open `/open-questions` | both rows visible, oldest-first, each with its own topic | n/a (read-only) | GREEN |
| S4 — empty question text is rejected | `@open-questions-review.S4` (`empty-question-text-rejected`) | open the capture popover, leave text empty (and whitespace-only) | Save stays disabled both times | row count for the topic unchanged | GREEN |
| S5 — an open question surfaces on `/today` | `@open-questions-review.S5` (`open-question-surfaces-on-today-banner`) | seed one open question, load `/today` | banner shows the question + topic; still shows after reload | n/a (read-only) | GREEN |
| S6 — mark a question answered | `@open-questions-review.S6` (`mark-question-answered`) | seed one open question, open `/open-questions`, type an answer, submit | row leaves "Open" tab; "Answered / dismissed" tab shows `data-status="answered"` | `status='answered'`, `answer_text` matches, `resolved_at` set | GREEN |
| S7 — dismiss a question | `@open-questions-review.S7` (`dismiss-question`) | seed one open question, click "Not needed" | one click, no dialog; history tab shows `data-status="dismissed"` | `status='dismissed'`, `answer_text` null, `resolved_at` set | GREEN |
| S8 — banner caps at 3, links to full list | `@open-questions-review.S8` (`banner-caps-at-three`) | seed 5 open questions, load `/today` | only 3 oldest render; "+2 more" link goes to `/open-questions`, 5th row visible there | n/a (read-only) | GREEN |
| S9 — empty states render calmly | `@open-questions-review.S9` (`empty-states`) | zero open questions, load `/today` and `/open-questions` | both show an explicit empty marker, never absent | n/a (negative check) | GREEN |
| S10 — question text max length (1000 chars) | `@open-questions-review.S10` (`question-text-max-length`) | paste 1001+ chars in the popover; also a direct API POST | Save stays disabled client-side | direct API POST with the same oversized text returns 400; no row written either way | GREEN |

## Scenario → test mapping

- S1 → `verification-repo/projects/post-anki/post-anki/features/probe/tests/capture-question-quiz/test.ts`
- S2 → `verification-repo/projects/post-anki/post-anki/features/probe/tests/capture-question-socratic/test.ts`
- S3 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/captured-question-appears-in-review-list/test.ts`
- S4 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/empty-question-text-rejected/test.ts`
- S5 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/open-question-surfaces-on-today-banner/test.ts`
- S6 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/mark-question-answered/test.ts`
- S7 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/dismiss-question/test.ts`
- S8 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/banner-caps-at-three/test.ts`
- S9 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/empty-states/test.ts`
- S10 → `verification-repo/projects/post-anki/post-anki/features/open-questions/tests/question-text-max-length/test.ts`

## New actions, seeds, and data-testids added

- `features/probe/actions/capture-open-question.action.ts` — click-popover-fill-submit, mirrors
  `submit-item-feedback.action.ts`; stops after filling (without clicking submit) when the text is
  empty or over the 1000-char cap, since the caller is exercising the disabled-submit state itself.
- `features/open-questions/actions/{view-open-questions-list,view-open-questions-banner,answer-open-question,dismiss-open-question}.action.ts`
- `features/open-questions/seeds/seed-open-questions.ts` — `seedOpenQuestion` /
  `seedOpenQuestionsSequence` (direct-insert back door for pre-existing rows, mirrors
  `seed-gap-mastery.ts`).
- `data-testid`s (added to the source repo in the same change): `capture-question-${itemId}`,
  `capture-question-input-${itemId}`, `capture-question-submit-${itemId}`,
  `capture-question-saved-${itemId}`; `open-questions-banner`, `open-questions-banner-empty`,
  `open-question-banner-item-${id}`, `open-questions-banner-more-link`; `open-questions-list`,
  `open-questions-list-empty`, `open-question-row-${id}` (carries `data-status`),
  `open-question-text-${id}`, `open-question-topic-${id}`, `open-question-answer-input-${id}`,
  `open-question-answer-submit-${id}`, `open-question-dismiss-${id}`,
  `open-question-status-${id}`, `open-questions-filter-open`, `open-questions-filter-history`.

## Final green run

`npm run dev:pw -- -g "open-questions-review"` — 10/10 passed (1.3m). Full regression sweep of the
touched shared surfaces also green: `npm run dev:pw -- probe stats` — 23/23 passed (2.0m), covering
every existing `probe`/`stats` scenario (quiz, Socratic, feedback, GENGAP, study-chat, streak) plus
the 10 new ones, with no regressions from the `feedback.controller.ts` extraction or the
`probe-session-quiz.tsx`/`socratic-chat.tsx`/`today.tsx` edits.

## One test-authoring trap found and fixed during this pass

S10's action call originally clicked the disabled submit button for the over-max-length case and
timed out after 2 minutes — `captureOpenQuestion` now stops after filling (without clicking submit)
whenever the trimmed text is empty **or** over 1000 characters, matching the component's own
`canSubmit` condition exactly, rather than only handling the empty case.

S2 initially failed with "socratic chat never rendered an opening mentor message" — not an app bug:
a Socratic session only produces an opening turn when there's an open gap to probe (same
precondition `socratic-turn-feedback`'s existing test already relies on via `declareGap`). Fixed by
declaring a gap before opening the chat.
