# Review screen: on-demand grading and reversible decisions

## The ask
- The learner grades a card when they choose to, and a decided card stays visible so the decision can be taken back.

## What to do
- Item 1: after approve, reject or edit, the feedback box (grade) must not open by itself. Each card gets a visible "Grade this card" control that opens the same grading UI on demand, on pending and decided cards alike.
- Item 2: approved and rejected cards stay in the review table showing their decision as a status badge (Approved / Rejected) with a control to undo it back to pending. Undo uses the existing approve/reject API where possible; add a minimal API route only if none can reset a decision.
- Do item 1 fully, then item 2. Both touch the same review panel, so they run one after the other.

## Files to touch
- apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx, knowledge-bit-review-card-grades.tsx, knowledge-bit-review.api.ts and their co-located tests.
- apps/api/src/knowledge-bit/knowledge-bit-approval.controller.ts and knowledge-bit-approval.repo.ts only if undo needs a route.

## Done when
- Approving or rejecting never opens the feedback box on its own; grading works from the card. A decided card shows its status and can be reverted. vitest for touched files and `npx tsc --noEmit` pass.
