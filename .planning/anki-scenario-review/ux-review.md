# UX review: what a daily Anki user would miss

These items are added after the 8 core gaps in report.md. They're ranked by value to someone who reviews every day. All are in the `classic-anki-review` direction of `.planning/todo.md`.

1. **Keyboard shortcuts (Space to reveal, 1-4 to grade).** Anki users review hundreds of cards a day without touching the mouse. The review screen has no key handling at all, only click buttons (apps/web/src/routes/knowledge.answer.tsx).
2. **Next interval on each grade button.** Anki shows "<10m / 1d / 3d / 7d" so you can see what each grade does before you press it. The schedule already exists server-side, so the buttons can preview it (apps/api/src/knowledge-bit/knowledge-bit-schedule.repo.ts).
3. **Minute-level learning steps.** A failed or new card should come back in about 1 and then 10 minutes in the same session. Today the shortest interval is 1 day (`MIN_INTERVAL_DAYS`/`RESET_INTERVAL_DAYS` in knowledge-bit-schedule.repo.ts), so a forgotten card isn't relearned the same day.
4. **Daily new-card cap with due/new counts.** Without a cap, pasting a long article floods the queue. Anki shows "new / learning / due" counts at the top of a session. There's no such limit or count today (knowledge.answer.tsx loads batches of 5 forever).
5. **Undo last grade.** Misclicks happen daily. The schedule is overwritten in place with no history to restore (knowledge-bit-schedule.repo.ts upsert), so undo needs the previous state kept.
6. **Session progress and summary.** "12 left", then "done: 40 cards, 85% correct, 18 min" is the main reward loop. The screen has no progress indicator or end state beyond the batch loop (knowledge.answer.tsx `next()` refetches silently).
7. **Done-for-today screen.** When nothing is due, it should say so and show when the next card is due. Today it says "Nothing to answer right now." (knowledge.answer.tsx).
8. **Edit a card during review.** Anki users fix bad cards the moment they hit them. Editing exists only on the approval page (apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx), not while reviewing.
9. **Suspend / bury.** Users need to remove a bad card or skip one for today without deleting it. No suspend or bury state exists in the schema or UI (grep over apps/api/src/db/schema.ts and the web knowledge-bit folder found none).
10. **Leech handling.** Cards failed many times waste time and signal a badly written card. Anki tags them and suspends them automatically after 8 lapses. The schedule tracks no lapse count (knowledge-bit-schedule.repo.ts).
11. **Approval ergonomics.** Approving 20 suggestions one by one with the mouse is slow. Keyboard approve/reject and "approve all from this source" (or bulk select) make the step quick. Approval currently happens per item via click only (apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx).
12. **Hide the chat panel before reveal.** The chat panel renders above the answer box before you've answered (knowledge.answer.tsx), so it can give away the answer and invites looking it up instead of recalling. In Anki mode, show it only after reveal.

Considered and left out of the top 12: mobile-specific layout (the page is already a narrow single column), image/audio on cards, a card browser with search, and deck options per source.
END-OF-REPORT
