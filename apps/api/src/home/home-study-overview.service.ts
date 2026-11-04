import type { StudyOverview, StudyOverviewQuery } from "@post-anki/shared";
import { deriveUnscopedQueueCounts } from "../knowledge-bit/knowledge-bit-review-queue-counts.repo.js";
import { readQueueSnapshot, readReviewActivity } from "./home-study-overview.repo.js";

export async function getStudyOverview(
  query: StudyOverviewQuery,
  now: Date = new Date(),
): Promise<StudyOverview> {
  const clock = { tz: query.tz, now };
  const [snapshot, activity] = await Promise.all([
    readQueueSnapshot(clock),
    readReviewActivity({ ...clock, days: query.days }),
  ]);
  const derived = deriveUnscopedQueueCounts(
    snapshot.totals,
    snapshot.remaining,
    snapshot.dayEndsAt,
  );

  return {
    counts: derived.counts,
    reviewedToday: activity[activity.length - 1]?.count ?? 0,
    activity,
    nextDueAt: derived.nextDue?.toISOString() ?? null,
    hasCards: snapshot.hasCards,
  };
}
