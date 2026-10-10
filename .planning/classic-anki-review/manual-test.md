# Manual test: classic Anki review (UI only, cheapest steps first)

## Setup
- In `apps/api`, export `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev` before starting. `apps/api/.env` points at PRODUCTION, so never rely on it.
- Set `OPENROUTER_API_KEY`, or run the e2e-local mock-openrouter instead (no token cost).
- Start with `npm run dev` and open the web URL it prints. Use dev mode only: `vite build` already fails at `apps/web/src/routes/__root.tsx:128`, which is not part of this test.

## Steps (run in order; each needs the one before)
1. Go to /knowledge/review with an empty database. Expect "Done for today" (step 9 is checked again at the end). No grade buttons.
2. Go to /add-knowledge, paste 2-3 short paragraphs of text, and submit. Expect the save to be confirmed straight away, with no wait.
3. Wait up to about a minute and do NOT trigger any scan. Expect suggestions to appear on their own, not after the 5-minute timer.
4. Look at the sidebar. Expect "Approve suggestions (N)" with N matching the pending suggestions, "Review" and "Answer (typed)".
5. Open /knowledge-bit-review. Expect each bit to show its cards labelled "Front / back", "Why question" or "Fill in the blank". Expect a front/back card on bits whose generation has finished.
6. Press j and k. Expect the focus to move between bits. Press a on one bit. Expect it approved and N in the sidebar to drop by 1. Press r on another. Expect it rejected.
7. Click "Approve all ready" (or "Approve all from this source"). Expect the rest to be approved and the sidebar count to reach 0 or the remaining unready bits only.
8. Open /knowledge/review from the sidebar. Expect the question only, with a "Show answer" button, no answer text and no grade buttons. Expect counts for new, learning and review to be visible, and a progress line.
9. Expect the first card of each bit to be the front/back type, not fill-in-the-blank or why-question.
10. Press Space. Expect the answer to show with four grade buttons, each with its key number (1-4) and a next-interval label (for a new card: 1 day, 1 day, 1 day, 4 days). Typing in the chat box must not reveal or grade.
11. Press 3 (Good) on a new card. Expect the next card, unrevealed, and the counts to change.
12. Learning steps: on a new card press Space, then 1 (Again). Expect the interval label to have said about 1 minute. Keep grading other cards. Expect the Again card to come back within a few minutes, before due review and new cards, and the "Learning" count to include it.
13. Undo: grade a card, press z. Expect the same card back at the front, question side up, and the progress "done" count to go down by 1. Press z until nothing is left. Expect the Undo button to be disabled.
14. Bury: press - on a card. Expect it to leave the session. Press z. Expect it to come back.
15. Suspend: press @ on a card. Expect it to leave the session, and expect it not to appear in /knowledge/answer. Press z. Expect it to come back. Suspend one again and leave it suspended.
16. Edit: reveal a card, press e, change the answer text, then press Ctrl/Cmd+Enter. Expect the card to stay revealed with the new text. While the editor is open, 1-4 and Space do nothing, and Esc cancels the edit.
17. Summary: click "End session". Expect cards reviewed, a count for each of Again/Hard/Good/Easy, the recalled percentage, new cards studied, total and average time, and the counts for suspended, buried and edited.
18. Done for today: grade every remaining card in /knowledge/review. Expect "Done for today" and a "Next card due ..." line (the Again card will be due soon, or a no-more-scheduled line if nothing is). Press z. Expect the last card to come back for review.
19. Typed mode: open /knowledge/answer. Expect the typed answer box, AI grading and the schedule update as before. Expect no front/back cards here and no suspended card. Expect a "Switch to Anki review" link back to /knowledge/review.

## Pass means
Steps 3, 9, 12, 15 and 19 are the highest-risk ones. If any fails, note the step number and what you saw.

END-OF-REPORT
