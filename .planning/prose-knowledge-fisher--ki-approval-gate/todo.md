---
type: todo
direction: prose-knowledge-fisher
task: "Knowledge-item approval gate"
updated: 2026-10-03
---
# Todo: knowledge-item approval gate

## Decisions to make
Nothing to decide — see spec.md's "Decision made autonomously."

## To review / clarify
Nothing to review.

## Coding tasks
- [x] Block editing a bit's text once it is no longer pending
- [x] Block approving a bit that was already rejected
- [x] Phase 1: schema column + migration + approve/reject/edit API
- [x] Phase 2: block every learner-facing surface with the shared predicate
- [ ] Phase 3: review screen UI

## Manual steps
No manual steps required.

## Post-deploy checks
No post-deploy checks needed.

## Resolved
- Added an editor for the bit's own fact text and background on the review screen
- Locked Approve/Reject/Cancel while a variant save is still running
- Fixed review-item editor closing on failed edit save, discarding the draft
- Cleared stale Q&A locally when a bit-text edit changes the body
- Blocked Approve on a bit with zero live variants (stale or freshly pasted)

## Notes
- Phase 3 review slug ki-approval-gate-phase3 is stuck (3 consecutive FAILs) — do not re-dispatch review-factory against it; needs a fresh slug/human look next run
