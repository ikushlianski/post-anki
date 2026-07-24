import type { Gap } from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";

export function shouldReplenish(
  total: number,
  answered: number,
  floor: number,
): boolean {
  return total - answered <= floor;
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
