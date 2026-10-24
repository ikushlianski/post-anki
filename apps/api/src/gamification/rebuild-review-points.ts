import { asc, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { knowledgeBitReviews, knowledgeBitSchedules } from "../db/schema.js";
import { awardReviewPointInTx } from "./review-point-event.repo.js";

export async function rebuildReviewPoints(): Promise<{ reviewed: number }> {
  const db = getDb();
  const [reviews, schedules] = await Promise.all([
    db
      .select()
      .from(knowledgeBitReviews)
      .where(isNull(knowledgeBitReviews.undoneAt))
      .orderBy(asc(knowledgeBitReviews.reviewedAt)),
    db.select().from(knowledgeBitSchedules),
  ]);
  const currentInterval = new Map(schedules.map((row) => [row.knowledgeBitId, row.intervalDays]));
  const nextPrevInterval = new Map<string, number>();

  for (let i = reviews.length - 1; i >= 0; i -= 1) {
    const review = reviews[i]!;
    const intervalDaysAfter =
      nextPrevInterval.get(review.knowledgeBitId) ?? currentInterval.get(review.knowledgeBitId) ?? 0;

    await db.transaction((tx) =>
      awardReviewPointInTx(tx, {
        reviewId: review.id,
        knowledgeBitId: review.knowledgeBitId,
        reviewedAt: review.reviewedAt,
        intervalDaysAfter,
      }),
    );

    nextPrevInterval.set(review.knowledgeBitId, review.prevSchedule?.intervalDays ?? 0);
  }

  return { reviewed: reviews.length };
}
