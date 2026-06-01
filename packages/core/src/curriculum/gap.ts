import type {
  DepthLevel,
  Gap,
  GapVerdict,
  TopicProgress,
} from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";
import { deriveTopicStatus } from "./progress";

export function inScopeGaps(gaps: Gap[], depth: DepthLevel): Gap[] {
  const ceiling = DEPTH_RANK[depth];

  return gaps.filter(
    (g) => g.state !== "skipped" && DEPTH_RANK[g.depth] <= ceiling,
  );
}

export function applyGapVerdicts(
  gaps: Gap[],
  verdicts: GapVerdict[],
  now: string,
): Gap[] {
  const coveredById = new Map(verdicts.map((v) => [v.gapId, v.covered]));

  return gaps.map((gap) => {
    if (!coveredById.has(gap.id) || gap.state === "skipped") {
      return gap;
    }

    return {
      ...gap,
      state: coveredById.get(gap.id) ? "covered" : "open",
      lastEvaluatedAt: now,
    };
  });
}

export function gapMaturity(gaps: Gap[], depth: DepthLevel): number {
  const scoped = inScopeGaps(gaps, depth);

  if (scoped.length === 0) {
    return 0;
  }

  const covered = scoped.filter((g) => g.state === "covered").length;

  return Math.round((covered / scoped.length) * 100);
}

export function progressFromGaps(
  gaps: Gap[],
  depth: DepthLevel,
  attempts: number,
  now: string,
): TopicProgress {
  const maturity = gapMaturity(gaps, depth);

  return {
    status: deriveTopicStatus(maturity, attempts),
    maturity,
    attempts,
    lastInteractedAt: gaps.some((g) => g.lastEvaluatedAt) ? now : null,
  };
}

export function openGaps(gaps: Gap[], depth: DepthLevel): Gap[] {
  return inScopeGaps(gaps, depth).filter((g) => g.state === "open");
}

export function nextGapToProbe(gaps: Gap[], depth: DepthLevel): Gap | null {
  const open = openGaps(gaps, depth);

  if (open.length === 0) {
    return null;
  }

  const ranked = [...open].sort((a, b) => {
    if (a.wanted !== b.wanted) {
      return a.wanted ? -1 : 1;
    }

    return DEPTH_RANK[a.depth] - DEPTH_RANK[b.depth];
  });

  return ranked[0]!;
}
