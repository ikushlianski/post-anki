import type {
  DepthLevel,
  Gap,
  GapVerdict,
  TopicProgress,
} from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";
import { deriveTopicStatus } from "./progress";

const CALIBRATION_STALE_AFTER_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// Read-time-only staleness signal (#26/#42's minimal calibration reset): a gap
// whose classification hasn't been re-evaluated in 60+ days should be probed
// at a softer depth next time, without ever mutating `gap.depth` itself —
// mutating it would also change which gaps `inScopeGaps` treats as in scope.
export function isCalibrationStale(lastEvaluatedAt: string | null, now: string): boolean {
  if (!lastEvaluatedAt) {
    return false;
  }

  return new Date(now).getTime() - new Date(lastEvaluatedAt).getTime() >
    CALIBRATION_STALE_AFTER_DAYS * DAY_MS;
}

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
