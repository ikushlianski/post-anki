import type { Gap, ProbeScope } from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";

export function shouldReplenish(
  total: number,
  answered: number,
  floor: number,
): boolean {
  return total - answered <= floor;
}

/**
 * A curriculum-wide calibration probe is a single one-shot batch, not an
 * ongoing practice queue — it never grows mid-session, on either the server
 * (probe-session.service.ts's `maybeReplenish`) or the client
 * (probe-session-quiz.tsx's refetch-on-low). Every other scope keeps
 * replenishing today.
 */
export function isOneShotProbeScope(scope: ProbeScope): boolean {
  return scope === "curriculum";
}

// Issue #96 — a strong CUMULATIVE accuracy signal within this session (not
// prior topic maturity, which selectQuizDifficultyMix already uses for
// difficulty mix) is what lets the ongoing-practice replenish loop above
// stop growing a session the learner has already demonstrated they don't
// need more of. MIN_SAMPLE loosely mirrors gap-mastery's own
// MASTERY_THRESHOLD (3 correct-in-a-row masters ONE gap,
// packages/core/src/mastery/mastery-state.ts:20) scaled up slightly for a
// coarser whole-session judgment spanning potentially many different gaps;
// the accuracy check allows one miss in the sample rather than demanding a
// literal perfect run. Integer comparison (cross-multiplication), not
// floating-point division, so there is no rounding edge case to test around.
export const EARLY_MASTERY_MIN_SAMPLE = 5;
const EARLY_MASTERY_ACCURACY_NUMERATOR = 4;
const EARLY_MASTERY_ACCURACY_DENOMINATOR = 5;

export function hasEarlyMasterySignal(correct: number, answered: number): boolean {
  return (
    answered >= EARLY_MASTERY_MIN_SAMPLE &&
    correct * EARLY_MASTERY_ACCURACY_DENOMINATOR >= answered * EARLY_MASTERY_ACCURACY_NUMERATOR
  );
}

/**
 * Ranks gaps the same way `nextGapToProbe` (packages/core/src/curriculum/gap.ts)
 * already ranks a single next gap to probe — wanted-first, then
 * shallower-depth-first — but returns the full ordering instead of just the
 * top pick. `nextGapToProbe` never needed more than one result before this
 * call site existed; a replenish batch needs an ordered list so the
 * generation prompt can prioritize the gaps the learner has demonstrably not
 * yet covered, rather than resampling the topic's whole original gap list
 * uniformly the way the very first batch does.
 *
 * Callers are expected to pass already-open, in-scope gaps (e.g. the output
 * of `openGaps`) — this function only orders, it doesn't filter by state.
 */
export function rankGapsForReplenish(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => {
    if (a.wanted !== b.wanted) {
      return a.wanted ? -1 : 1;
    }

    return DEPTH_RANK[a.depth] - DEPTH_RANK[b.depth];
  });
}
