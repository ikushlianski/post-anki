# Scenarios

- [ ] Submitting `POST /knowledge-sources` with non-empty `text` creates a row with `kind: "prose"`, `status: "pending"`, the exact trimmed text in `rawText`, and returns it as 201 JSON
- [ ] Submitting empty or whitespace-only `text` returns a 400, no row created
- [ ] The migration applies cleanly against a real local Postgres and the new table's columns match schema.ts

## Files by scenario

| Scenario | Files |
|---|---|
| Create on valid text | knowledge-source.controller.ts, knowledge-source.repo.ts, schema.ts, migration |
| Reject empty text | knowledge-source.controller.ts |
| Migration applies cleanly | migration file, `npm run db:migrate` |
