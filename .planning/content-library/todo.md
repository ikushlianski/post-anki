---
type: todo
branch: To-Learn-List
task: content library
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [ ] 1. Track fetch history and embeddings for each source, and store duplicate suggestions
- [ ] 2. Detect duplicate and already-fetched sources by web address and content
- [ ] 3. List sources across all curricula along with their fetch status
- [ ] 4. Let a source be re-fetched and its content refreshed
- [ ] 5. Generate embeddings for sources so their similarity can be compared
- [ ] 6. Scan sources and identify likely duplicate pairs
- [ ] 7. Store and resolve duplicate suggestions, exposed through the API
- [ ] 8. Expose browsing sources, re-fetching, and reviewing duplicate suggestions through the API
- [ ] 9. Build a library browser with duplicate suggestions and a re-fetch action

## Manual steps

- [ ] Human review: confirm the plan is approved
- [ ] Review every decision made automatically during planning, especially that duplicates are only reported, never merged or deleted
- [ ] Confirm the similarity threshold reused from subject duplicate detection also works well for source content

## Notes

- This module's data changes are the largest among its sibling features; coordinate carefully so unrelated data changes don't land together.
- Source fetching logic is shared with other features; re-fetching here must not change their behaviour.
- Unlike duplicate detection for subjects, source duplicates are never merged or deleted; this is intentional, not an oversight.
