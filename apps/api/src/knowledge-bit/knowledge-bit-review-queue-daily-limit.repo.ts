import { and, gte, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitReviews } from "../db/schema.js";
import { getMaxReviewsPerDay } from "../admin-settings/admin-settings.repo.js";
import { getLocalDayWindow } from "./knowledge-bit-review.repo.js";

export interface DailyReviewLimit {
  reviewedToday: number;
  limit: number;
  reached: boolean;
  dayEndsAt: Date;
}

export function isDailyLimitReached(reviewedToday: number, limit: number): boolean {
  return limit > 0 && reviewedToday >= limit;
}

export async function readDailyReviewLimit(
  clock: { tz: string; now: Date },
  db: DbExecutor,
): Promise<DailyReviewLimit> {
  const { startsAt, endsAt } = await getLocalDayWindow(clock.tz, clock.now, db);
  const [[row], limit] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(knowledgeBitReviews)
      .where(and(isNull(knowledgeBitReviews.undoneAt), gte(knowledgeBitReviews.reviewedAt, startsAt))),
    getMaxReviewsPerDay(db),
  ]);
  const reviewedToday = row?.total ?? 0;

  return { reviewedToday, limit, reached: isDailyLimitReached(reviewedToday, limit), dayEndsAt: endsAt };
}
