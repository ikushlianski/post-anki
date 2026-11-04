import { asc, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { knowledgeBitReviews, knowledgeBitSchedules } from "../db/schema.js";
import { awardReviewPointInTx } from "./review-point-event.repo.js";

const cardId = (knowledgeBitId: string, cardKey: string) => `${knowledgeBitId}\u0000${cardKey}`;

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
  const currentInterval = new Map(schedules.map((row) => [cardId(row.knowledgeBitId, row.cardKey), row.intervalDays]));
  const nextPrevInterval = new Map<string, number>();

  for (let i = reviews.length - 1; i >= 0; i -= 1) {
    const review = reviews[i]!;
    const id = cardId(review.knowledgeBitId, review.cardKey);
    const intervalDaysAfter = nextPrevInterval.get(id) ?? currentInterval.get(id) ?? 0;

    await db.transaction((tx) =>
      awardReviewPointInTx(tx, {
        reviewId: review.id,
        knowledgeBitId: review.knowledgeBitId,
        reviewedAt: review.reviewedAt,
        intervalDaysAfter,
      }),
    );

    nextPrevInterval.set(id, review.prevSchedule?.intervalDays ?? 0);
  }

  return { reviewed: reviews.length };
}
