import type { DepthHeadroom, DepthLevel } from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";

const DEPTH_LADDER = (Object.keys(DEPTH_RANK) as DepthLevel[]).sort(
  (a, b) => DEPTH_RANK[a] - DEPTH_RANK[b],
);

export function deriveDepthHeadroom(
  electedDepth: DepthLevel,
  availableDepth: DepthLevel,
): DepthHeadroom | null {
  if (DEPTH_RANK[availableDepth] <= DEPTH_RANK[electedDepth]) {
    return null;
  }

  const nextDepth = DEPTH_LADDER.find(
    (depth) => DEPTH_RANK[depth] === DEPTH_RANK[electedDepth] + 1,
  );

  if (!nextDepth) {
    return null;
  }

  return { nextDepth, topDepth: availableDepth };
}
