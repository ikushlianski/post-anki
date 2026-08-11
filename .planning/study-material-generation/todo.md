---
type: todo
branch: To-Learn-List
task: AI study-material generation
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [ ] 1. Check whether a topic has enough real source material to work with
- [ ] 2. Have lecture generation check existing course material before searching the web
- [ ] 3. Stop lecture generation from inventing content when there is no real source material
- [ ] 4. Build the instructions used to generate each kind of study material
- [ ] 5. Store generated study materials for each topic
- [ ] 6. Add an assistant that writes study material from source content
- [ ] 7. Wire up generating and saving study material, refusing when there is nothing to ground it in
- [ ] 8. Expose creating and viewing study materials through the API
- [ ] 9. Show study materials alongside the lecture on a topic's page

## Manual steps

- [ ] Get human review and sign-off on the plan
- [ ] Review every decision made automatically during planning, making sure flagged items are
      truly fixed, not skipped
- [ ] Update older tests that expect the old fallback behavior, since it is being removed

## Notes

- This is the only one of the four modules that changes existing lecture-generation behavior
  rather than only adding new features — review that fix separately before the new study-material
  work.
- The check for usable source material is shared by lecture generation and study materials —
  build it once, do not duplicate it.
- Reuse the existing way of pulling source text and citable links from a course — do not rebuild
  it.
- Never auto-generate study material through nudges or scheduled jobs. Treat any move to
  pre-generate material while a learner is just browsing as a decision to check with a person
  first.
