import type { DepthLevel } from "@post-anki/shared";
import { DEPTH_TARGET_PERCENT } from "@post-anki/shared";

// SCENARIO 1 (.planning/domain-priority-review/scenarios.md) — the pure
// priority-distance deriver. Independent of domainNodeProgress() (the
// percentage rollup, unchanged) and never written to the `gaps` table —
// this is a derived display value, computed on read, deliberately never
// called "gap" anywhere (see spec.md's Decisions #3).
export function domainPriorityDistance(
  targetDepth: DepthLevel | null,
  percent: number,
): number | null {
  if (targetDepth === null) {
    return null;
  }

  return Math.max(0, DEPTH_TARGET_PERCENT[targetDepth] - percent);
}
