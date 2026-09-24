---
type: review-factory-report
item: stale-row-reset
state: done
updated: 2026-09-24T02:58:00.000Z
---

# stale-row-reset — review-factory report

**DONE.** The `stale-row-reset` slug itself hit `stuck: true` after 3 consecutive failed
invocations (see attempt history below) — per review-factory's own rule, that slug was not
re-attempted. The only remaining gap was two style/organization findings from Pass 2's last
structured verdict (file over the 300-line cap, one test-body comment), not a correctness or
security issue — Pass 2's correctness/security/tests dimensions all PASSed, and the real-Postgres
ownership-token race fix itself (the reason for attempts 1 and 2) was verified sound across two
independent passes. Those two findings were fixed and re-verified as a separate, freshly-scoped
follow-up item (`stale-row-reset-cleanup`, Direct tier — a mechanical reorg with no design
judgment), which PASSed cleanly. The combined result is now done.

## Attempt history

- **Attempt 1** — FAIL. Structured verdict found a genuine race: a late-finishing scan could write
  over a row a second scan had already reclaimed after a stale-processing reset. No fix yet.
- **Attempt 2** — FAIL. Ownership-token (`claimedAt`) fix applied and unit-tested, but the
  structured verdict's tests dimension FAILed — the token check was only proven against a hand-built
  mock, never against real Postgres.
- **Attempt 3** — FAIL overall (Pass 1 PASS, Pass 2 FAIL).
  - Pass 1: plan-correspondence PASS, mechanical checks PASS, structured verdict PASS on all four
    dimensions (real-Postgres integration tests for the token round-trip and stale-token rejection
    were added and confirmed to genuinely exercise Postgres, not just exist).
  - Pass 2: plan-correspondence PASS, mechanical checks PASS, structured verdict — correctness PASS,
    security PASS, tests PASS, **architecture FAIL** (file length + test comment, both logged as new
    `todo.md` items).

## Bankable progress

The race-condition fix itself (`claimedAt` ownership token in
`apps/api/src/knowledge-bit/knowledge-bit.repo.ts` and
`apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts`) is correctness/security/tests
clean across two independent passes. What remains is purely file organization — splitting
`knowledge-bit.repo.test.ts` and removing one comment — not a design or correctness question.

## Cleanup follow-up (`stale-row-reset-cleanup`)

- Pass 1 (Direct tier, single pass): plan-correspondence PASS, mechanical checks PASS, structured
  verdict PASS on all four dimensions (correctness, security, tests, architecture).
- File split: `knowledge-bit.repo.test.ts` (175 lines), new `knowledge-bit.repo.reset.test.ts`
  (110 lines), new shared `knowledge-bit-repo.test-mock-db.ts` helper (205 lines) — all under the
  300-line cap. The flagged test-body comment was removed.
