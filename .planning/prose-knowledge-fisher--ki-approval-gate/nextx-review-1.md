# nextx review 1: review screen restyle, approve/reject with feedback

Verdict: FAIL (needs-changes). One High finding. Severity gate applied: only Critical/High reported.

Checked and fine
- Feedback box is optional: empty or whitespace-only text calls approve/reject with no feedback and no note write (item-actions test and panel.feedback test cover it).
- The decision survives a failed note save: the note is written after the decision call inside its own try/catch, so a note failure does not block removing the card (tested).
- Accessibility: all actions are real <button type="button">; the textarea has a label tied by useId/htmlFor; aria-expanded on the toggles; disabled and focus-visible/ring styles present.
- Ownership: the API has no per-user concept (no userId/ownerId anywhere in apps/api/src); the note is written by the server-issued feedbackId returned from the decision call, and updateKnowledgeBitFeedback only allows note on approved/rejected rows and reasons on rejected only. No cross-record attach path was added by this change.
- No `any` in the touched feature files. Tests assert outcomes (note stored on the right record, card removed on note failure, nothing written when empty).
- `cd apps/web && npx vitest run src/knowledge-bit`: 29 files, 275 tests pass. The API integration test for note-on-approved was not run (needs DB).

Findings

1. High: typed feedback can vanish with no message
- Symptom: the reviewer writes "Approve/Reject with feedback", the card disappears as if it worked, but the text was never saved and nothing tells them.
- Module: review panel decision handlers (apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx, saveDecisionNote, ~line 183).
- Mechanism: saveDecisionNote swallows any failure and also silently returns when the decision gave no feedbackId (always the case for manual-origin cards, which KnowledgeBitReviewDraftCard also renders the feedback box for), while this feedback is a learning signal fed back into extraction, so silent loss corrupts that signal.
- Fix: make saveDecisionNote return a boolean and, on false, surface a visible message (for rejects, prefill the follow-up strip note with the typed text and show its "Couldn't save the note." error; for approves, show a short notice or keep the row with a retry), and hide the feedback buttons for manual-origin cards. Add a test asserting the message appears when the note save fails.

Lower-severity notes (not gating)
- The reject follow-up strip starts with an empty note box, so typing there silently replaces the note just entered.
- knowledge-bit-review-panel.tsx remains over 300 lines.

END-OF-REPORT
