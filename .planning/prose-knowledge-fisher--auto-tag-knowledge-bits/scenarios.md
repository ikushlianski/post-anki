---
type: scenarios
item: auto-tag-knowledge-bits
---

# Scenarios

- [ ] A knowledge bit with no tags yet gets 1-3 tags assigned and `taggedAt` is set on the next scan
- [ ] A candidate tag name that closely matches an existing tag reuses that exact tag — no
      near-duplicate is created (this is the folded-in "reuse close-match tag" behavior)
- [ ] A bit whose tagging fails (agent error, or every candidate name fails validation) gets
      `tagFailedAt` set and does not block the rest of the batch from being processed
- [ ] The scan caps its per-call batch of paid LLM calls, leaving any remainder for the next call
- [ ] The trigger route returns the scan's counts on success and is reachable only through the
      server's existing authorized-request gate
- [ ] Real Postgres: the selection query returns exactly the bits with `taggedAt IS NULL AND
      tagFailedAt IS NULL`, nothing else, and a tag assignment persists correctly end to end
      (tag created/reused, `tag_assignments` row written, `taggedAt` set)

## Files by scenario

| Scenario | Files |
|---|---|
| Embeds... no — tags a bit and sets taggedAt | `knowledge-bit-tagging.orchestrator.ts`, `.test.ts` |
| Reuses a close-match tag | `knowledge-bit-tagging.orchestrator.ts`, `.test.ts` (mocks `assignTagForAutoTag`'s real close-match path is already covered by the stuck slug's own tests — this test proves the orchestrator calls it per candidate, not a re-test of the matcher itself) |
| Per-bit failure isolation | `knowledge-bit-tagging.orchestrator.ts`, `.test.ts` |
| Batch cap | `knowledge-bit-tagging.orchestrator.ts`, `.test.ts` |
| Trigger route + auth | `detect-knowledge-bits.controller.ts` (or a sibling file), `router-table.ts`, `server.ts`, matching `.test.ts` |
| Real-Postgres selection + write-back | new `knowledge-bit-tagging.repo.integration.test.ts`, kept separate from `migrations.integration.test.ts` per the embed-knowledge-bits precedent |
