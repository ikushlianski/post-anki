---
type: scenarios
task: add-knowledge-screen
---

# Scenarios

1. **Single block submit** — learner types one block, clicks submit → one knowledge source
   created via `{ text }`, form clears, confirmation shown.
2. **Batch submit** — learner clicks "+ Add another block" twice, fills all three, submits → one
   call via `{ texts: [...] }`, form clears, confirmation shows the count created.
3. **Drops blank extra blocks** — learner adds a second block, leaves it empty, submits with only
   the first filled → submits as a single `{ text }` call (blank block silently dropped), not a
   `{ texts }` call with an empty string.
4. **All blocks empty** — submit button is disabled; no call is made.
5. **Remove a block** — learner adds a second block, then removes it before submit → back to the
   single-block submit path (scenario 1).
6. **Server validation error surfaces** — the API 400s (e.g. network/server error) → an inline
   error message shows, the form is NOT cleared, learner can retry.
7. **Nav entry point** — the sidebar has an "Add knowledge" link that navigates to the new route.

### Files by scenario
| Scenario | Files |
|---|---|
| 1, 3, 4, 5, 6 | add-knowledge-form.tsx, knowledge-source.api.ts, api-client.ts |
| 2 | add-knowledge-form.tsx, knowledge-source.api.ts, api-client.ts |
| 7 | sidebar.tsx, add-knowledge.tsx |
