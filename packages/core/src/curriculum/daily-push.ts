import type { DepthLevel, Gap } from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";
import { openGaps } from "./gap";

const STALE_AFTER_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PushCandidate = {
  topicId: string;
  topicTitle: string;
  curriculumId: string;
  curriculumName: string;
  depth: DepthLevel;
  gaps: Gap[];
};

export type DailyPushPick = {
  topicId: string;
  topicTitle: string;
  curriculumId: string;
  curriculumName: string;
  gap: Gap;
  reason: "wanted" | "weakest" | "refresh";
} | null;

export function isStale(lastEvaluatedAt: string | null, now: string): boolean {
  if (!lastEvaluatedAt) {
    return false;
  }

  return new Date(now).getTime() - new Date(lastEvaluatedAt).getTime() >
    STALE_AFTER_DAYS * DAY_MS;
}

export function selectDailyPush(
  candidates: PushCandidate[],
  now: string,
): DailyPushPick {
  const open = candidates.flatMap((c) =>
    openGaps(c.gaps, c.depth).map((gap) => ({ c, gap })),
  );

  const wanted = open.filter((o) => o.gap.wanted);
  const pool = wanted.length > 0 ? wanted : open;

  if (pool.length > 0) {
    const ranked = [...pool].sort((a, b) => {
      if (a.gap.wanted !== b.gap.wanted) {
        return a.gap.wanted ? -1 : 1;
      }

      return rank(a.gap, a.c.depth) - rank(b.gap, b.c.depth);
    });

    const top = ranked[0]!;

    return {
      topicId: top.c.topicId,
      topicTitle: top.c.topicTitle,
      curriculumId: top.c.curriculumId,
      curriculumName: top.c.curriculumName,
      gap: top.gap,
      reason: top.gap.wanted ? "wanted" : "weakest",
    };
  }

  const refresh = candidates
    .flatMap((c) => c.gaps.map((gap) => ({ c, gap })))
    .filter((o) => o.gap.state === "covered" && isStale(o.gap.lastEvaluatedAt, now))
    .sort(
      (a, b) =>
        new Date(a.gap.lastEvaluatedAt ?? 0).getTime() -
        new Date(b.gap.lastEvaluatedAt ?? 0).getTime(),
    );

  const stale = refresh[0];

  if (stale) {
    return {
      topicId: stale.c.topicId,
      topicTitle: stale.c.topicTitle,
      curriculumId: stale.c.curriculumId,
      curriculumName: stale.c.curriculumName,
      gap: stale.gap,
      reason: "refresh",
    };
  }

  return null;
}

function rank(gap: Gap, depth: DepthLevel): number {
  return DEPTH_RANK[gap.depth] - DEPTH_RANK[depth];
}
