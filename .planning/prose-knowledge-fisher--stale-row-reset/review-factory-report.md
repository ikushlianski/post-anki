---
type: review-factory-report
item: stale-row-reset
state: stuck
updated: 2026-09-24T02:50:00.000Z
---

# stale-row-reset — review-factory report

**STUCK — failed the local verification gate 3 times in a row.**

Last failing check: Pass 2 structured-verdict, **architecture** dimension — `knowledge-bit.repo.test.ts`
grew to 473 lines (project's 300-line-per-file rule), and one test body carries a 2-line explanatory
comment (project's no-comments-in-tests rule). Both are style/organization issues, not correctness
bugs — Pass 2's correctness, security, and tests dimensions all PASSed, and the real-Postgres
ownership-token race fix itself (the reason for attempts 1 and 2) is verified sound.

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

## Next step

Do not re-attempt this slug automatically. A human (or a fresh, deliberately-scoped follow-up item)
should apply the two logged fixes and run review-factory once more, fresh, starting from Pass 1.
