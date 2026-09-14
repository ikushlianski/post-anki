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
  subjectId: string;
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

// The push pool is `gaps.state`-only; `gap_mastery.scheduledForSequence` is a
// quiz-internal question counter (see gap-mastery.ts), not a due date, and
// post-mastery review is the 90-day `refresh` staleness path below.
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

      const depthDiff = rank(a.gap, a.c.depth) - rank(b.gap, b.c.depth);

      if (depthDiff !== 0) {
        return depthDiff;
      }

      return lastEvaluatedAtRank(a.gap) - lastEvaluatedAtRank(b.gap);
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
    .filter(
      (o) =>
        o.gap.state === "covered" &&
        isStale(o.gap.lastEvaluatedAt, now) &&
        !isPushExcluded(o.gap, now),
    )
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

// Bucketed by calendar day, not per-call — the daily-push card is refetched
// far more than once a day, and a per-call cursor would rotate on every click.
// Within a day's chosen subject, `important`/`wanted` priority still applies,
// but that priority no longer holds *across* subjects on a given day.
export function selectRotatingDailyPush(
  candidates: PushCandidate[],
  now: string,
): DailyPushPick {
  const bySubject = new Map<string, PushCandidate[]>();

  for (const c of candidates) {
    const bucket = bySubject.get(c.subjectId);

    if (bucket) {
      bucket.push(c);
    } else {
      bySubject.set(c.subjectId, [c]);
    }
  }

  const eligible = [...bySubject.entries()]
    .filter(([, cs]) => selectDailyPush(cs, now) !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  if (eligible.length === 0) {
    return selectDailyPush(candidates, now);
  }

  const dayIndex = Math.floor(new Date(now).getTime() / DAY_MS);
  const [, chosen] = eligible[dayIndex % eligible.length]!;

  return selectDailyPush(chosen, now);
}

// Same `gaps.state`-only pool as selectDailyPush above — see its comment.
// Unlike selectDailyPush's single winner-take-all pick, this is a queue of
// everything currently due: a stale mastered gap in one subject must still
// surface here even while a different subject has its own open gaps, so
// open and refresh items are combined rather than one gating the other out.
export function selectDueQueue(
  candidates: PushCandidate[],
  now: string,
): DueQueueItem[] {
  const open = candidates.flatMap((c) =>
    openGaps(c.gaps, c.depth)
      .filter((gap) => !isPushExcluded(gap, now))
      .map((gap) => ({ c, gap })),
  );

  const sortedOpen = [...open].sort((a, b) => {
    const aImportant = a.gap.triageState === "important";
    const bImportant = b.gap.triageState === "important";

    if (aImportant !== bImportant) {
      return aImportant ? -1 : 1;
    }

    if (a.gap.wanted !== b.gap.wanted) {
      return a.gap.wanted ? -1 : 1;
    }

    const depthDiff = rank(a.gap, a.c.depth) - rank(b.gap, b.c.depth);

    if (depthDiff !== 0) {
      return depthDiff;
    }

    return lastEvaluatedAtRank(a.gap) - lastEvaluatedAtRank(b.gap);
  });

  const interleavedOpen = interleaveBySubject(sortedOpen).map((item) =>
    toDueQueueItem(item.c, item.gap),
  );

  const refresh = candidates
    .flatMap((c) => c.gaps.map((gap) => ({ c, gap })))
    .filter(
      (o) =>
        o.gap.state === "covered" &&
        isStale(o.gap.lastEvaluatedAt, now) &&
        !isPushExcluded(o.gap, now),
    )
    .sort(
      (a, b) =>
        new Date(a.gap.lastEvaluatedAt ?? 0).getTime() -
        new Date(b.gap.lastEvaluatedAt ?? 0).getTime(),
    )
    .map((item) => toDueQueueItem(item.c, item.gap, "refresh"));

  return [...interleavedOpen, ...refresh];
}

// A subject with a large pile of high-priority gaps otherwise occupies the
// entire front of the queue, burying a subject with just one or two due
// items far down the list — grouped by subject, not curriculum, since one
// subject can own several curricula. Subject visit order follows where each
// subject's own best-ranked item already landed in `sorted`, so the most
// urgent subject still leads — it just doesn't also own the next N slots.
function interleaveBySubject<T extends { c: PushCandidate }>(sorted: T[]): T[] {
  const bySubject = new Map<string, T[]>();

  for (const item of sorted) {
    const bucket = bySubject.get(item.c.subjectId);

    if (bucket) {
      bucket.push(item);
    } else {
      bySubject.set(item.c.subjectId, [item]);
    }
  }

  const buckets = [...bySubject.values()];
  const result: T[] = [];
  let round = 0;

  while (result.length < sorted.length) {
    for (const bucket of buckets) {
      const item = bucket[round];

      if (item) {
        result.push(item);
      }
    }

    round += 1;
  }

  return result;
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

function lastEvaluatedAtRank(gap: Gap): number {
  return gap.lastEvaluatedAt ? new Date(gap.lastEvaluatedAt).getTime() : 0;
}
