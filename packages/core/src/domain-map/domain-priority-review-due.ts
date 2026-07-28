const MS_PER_DAY = 24 * 60 * 60 * 1000;

// SCENARIO 2 (.planning/domain-priority-review/scenarios.md) — the pure
// review-due deriver. `now` is always an explicit parameter, never read
// internally via Date.now() — this is deliberate, allowed wall-clock use
// (spec.md's Decisions #5), distinct from domainNodeProgress()'s
// zero-wall-clock rule (which exists so maturity never passively decays;
// review-due bookkeeping isn't maturity).
export function isDomainPriorityReviewDue(
  lastReviewedAt: string | null,
  now: Date,
  thresholdDays = 30,
): boolean {
  if (lastReviewedAt === null) {
    return true;
  }

  const elapsedMs = now.getTime() - new Date(lastReviewedAt).getTime();

  return elapsedMs >= thresholdDays * MS_PER_DAY;
}
