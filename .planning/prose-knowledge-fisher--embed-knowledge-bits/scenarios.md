---
type: scenarios
item: embed-knowledge-bits
---

# Scenarios

- [ ] A knowledge bit with no embedding yet gets embedded and all three columns
      (`embedding`, `embeddingHash`, `embeddedAt`) are written together on the next scan
- [ ] A knowledge bit that already has a matching `embeddingHash` for its current body is skipped —
      no `embedTexts` call is made for it
- [ ] The scan caps at its batch limit per call, leaving any remainder for the next call
- [ ] The trigger route returns the scan's counts on success and is reachable only through the
      server's existing authorized-request gate
- [ ] Real Postgres: the selection query returns exactly the bits with `embeddedAt IS NULL`,
      nothing else, and the write-back persists all three columns correctly

## Files by scenario

| Scenario | Files |
|---|---|
| Embeds and stores an unembedded bit | `knowledge-bit-embedding.orchestrator.ts`, `knowledge-bit-embedding.orchestrator.test.ts` |
| Skips a bit with a matching hash | `knowledge-bit-embedding.orchestrator.ts`, `knowledge-bit-embedding.orchestrator.test.ts` |
| Batch cap | `knowledge-bit-embedding.orchestrator.ts`, `knowledge-bit-embedding.orchestrator.test.ts` |
| Trigger route + auth | `detect-knowledge-bits.controller.ts` (or new controller), `router-table.ts`, `server.ts`, matching `.test.ts` |
| Real-Postgres selection + write-back | new `knowledge-bit-embedding.repo.integration.test.ts` (kept separate from the already-826-line `migrations.integration.test.ts`) |
