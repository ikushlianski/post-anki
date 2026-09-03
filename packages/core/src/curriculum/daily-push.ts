import type { DepthLevel, Gap } from "@post-anki/shared";
import { DEPTH_RANK } from "@post-anki/shared";
import { isPushExcluded, openGaps } from "./gap";

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
  reason: "important" | "wanted" | "weakest" | "refresh";
} | null;

export type DueQueueItem = {
  topicId: string;
  topicTitle: string;
  curriculumId: string;
  curriculumName: string;
  gap: Gap;
  reason: "important" | "wanted" | "weakest" | "refresh";
};

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
    openGaps(c.gaps, c.depth)
      .filter((gap) => !isPushExcluded(gap, now))
      .map((gap) => ({ c, gap })),
  );

  // Priority tiers, highest first (issue #29): an `important`-triaged gap
  // always wins over a merely `wanted` one when both are eligible — "appears
  // within 5-7 days" is verified here as selection weight, not a literal
  // timer (no code path in this repo can assert wall-clock delivery).
  const important = open.filter((o) => o.gap.triageState === "important");
  const wanted = open.filter((o) => o.gap.wanted);
  const pool = important.length > 0 ? important : wanted.length > 0 ? wanted : open;

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
      reason: top.gap.triageState === "important" ? "important" : top.gap.wanted ? "wanted" : "weakest",
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

export function selectDueQueue(
  candidates: PushCandidate[],
  now: string,
): DueQueueItem[] {
  const open = candidates.flatMap((c) =>
    openGaps(c.gaps, c.depth)
      .filter((gap) => !isPushExcluded(gap, now))
      .map((gap) => ({ c, gap })),
  );

  if (open.length > 0) {
    const ranked = [...open].sort((a, b) => {
      const aImportant = a.gap.triageState === "important";
      const bImportant = b.gap.triageState === "important";

      if (aImportant !== bImportant) {
        return aImportant ? -1 : 1;
      }

      if (a.gap.wanted !== b.gap.wanted) {
        return a.gap.wanted ? -1 : 1;
      }

      return rank(a.gap, a.c.depth) - rank(b.gap, b.c.depth);
    });

    return ranked.map((item) => toDueQueueItem(item.c, item.gap));
  }

  const refresh = candidates
    .flatMap((c) => c.gaps.map((gap) => ({ c, gap })))
    .filter((o) => o.gap.state === "covered" && isStale(o.gap.lastEvaluatedAt, now))
    .sort(
      (a, b) =>
        new Date(a.gap.lastEvaluatedAt ?? 0).getTime() -
        new Date(b.gap.lastEvaluatedAt ?? 0).getTime(),
    );

  return refresh.map((item) => toDueQueueItem(item.c, item.gap, "refresh"));
}

function toDueQueueItem(
  c: PushCandidate,
  gap: Gap,
  reason?: DueQueueItem["reason"],
): DueQueueItem {
  return {
    topicId: c.topicId,
    topicTitle: c.topicTitle,
    curriculumId: c.curriculumId,
    curriculumName: c.curriculumName,
    gap,
    reason: reason ?? (gap.triageState === "important" ? "important" : gap.wanted ? "wanted" : "weakest"),
  };
}

function rank(gap: Gap, depth: DepthLevel): number {
  return DEPTH_RANK[gap.depth] - DEPTH_RANK[depth];
}
