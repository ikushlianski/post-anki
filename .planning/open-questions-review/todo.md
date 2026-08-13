---
type: todo
branch: open-questions-review
task: Capture open questions raised mid-study and periodically resurface unanswered ones for review
state: open
updated: 2026-08-13
---
# Todo: Open questions review

## Decisions to make
Nothing to decide — every fork encountered during planning was resolved autonomously with a
logged default (`spec.md`'s "Decisions made autonomously", 8 items). Listed below purely for
morning sanity-check, not because anything is blocked.

## To review / clarify
- PM's original triage assumed a reusable "capture-inbox structure" from issue #78 existed. It
  does not — #78 is still open with its storage/screens checklist items unchecked, and no
  inbox/capture code exists anywhere in the repo (verified via `gh issue view 78` and a full-repo
  grep). This plan's capture UI and storage are built from scratch, sized closer to
  `question-feedback-memory`'s effort than the PM's "reuse an existing inbox" framing implied.
- `apps/api/src/feedback/feedback.controller.ts`'s `resolveProbeQuestionItem`/
  `resolveSocraticTurnItem` are being extracted to `apps/api/src/shared/study-item.ts` so this
  plan can reuse them instead of duplicating topic/item-text resolution logic. That's a small,
  behavior-preserving refactor of already-shipped code — flagging so it isn't mistaken for scope
  creep during review.
- If open-question volume ever grows well beyond a personal-app scale, the "show 3 oldest, live
  query, no schedule" resurfacing (spec.md Decision 2) would need revisiting toward something with
  actual scheduling — not a concern at today's scale, flagged only so it isn't silently assumed to
  scale indefinitely (same posture as `question-feedback-memory/todo.md`'s equivalent note).

## Manual steps
No manual steps required — no new env vars, no new secrets, no infra outside the generated
migration (applied via the existing `npm run db:migrate` step already used in this repo).

## Post-deploy checks
- After deploying, confirm a real captured question round-trips: capture during a live quiz/Socratic
  session → appears on `/today` on next visit → appears in `/open-questions` → answering or
  dismissing it removes it from both surfaces. This is the one behavior unit/integration tests
  alone don't fully cross-verify (the multi-page round-trip), matching `question-feedback-memory`'s
  equivalent manual check for its generation-injection path.
