import { eq, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { getNewCardsPerDay } from "../admin-settings/admin-settings.repo.js";
import { learnAheadUntil } from "./knowledge-bit-review-queue-learning.repo.js";
import type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";
import type { KnowledgeBitReviewQueueClock } from "./knowledge-bit-review-queue.repo.js";
import {
  countNewCardsReviewedToday,
  getLocalDayWindow,
} from "./knowledge-bit-review.repo.js";

export async function readEligibleTotals(picked: Picked, now: Date, db: DbExecutor) {
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const learnAheadSql = sql`${learnAheadUntil(now).toISOString()}::timestamptz`;
  const [row] = await db
    .select({
      due: sql<number>`count(*) filter (where ${picked.dueAt} <= ${nowSql} and ${picked.phase} not in ('learning', 'relearning'))`.mapWith(Number),
      learning: sql<number>`count(*) filter (where ${picked.dueAt} <= ${learnAheadSql} and ${picked.phase} in ('learning', 'relearning'))`.mapWith(Number),
      fresh: sql<number>`count(*) filter (where ${picked.scheduleBitId} is null)`.mapWith(Number),
      nextDue: sql<Date | null>`min(${picked.dueAt}) filter (where ${picked.dueAt} > ${nowSql})`,
    })
    .from(picked)
    .where(eq(picked.pickRank, 1));

  return {
    due: row?.due ?? 0,
    learning: row?.learning ?? 0,
    fresh: row?.fresh ?? 0,
    nextDue: row?.nextDue ? new Date(row.nextDue) : null,
  };
}

export async function readNewRemainingToday(
  { tz, now }: KnowledgeBitReviewQueueClock,
  db: DbExecutor,
): Promise<{ remaining: number; dayEndsAt: Date }> {
  const { startsAt, endsAt } = await getLocalDayWindow(tz, now, db);
  const [newToday, limit] = await Promise.all([
    countNewCardsReviewedToday(startsAt, db),
    getNewCardsPerDay(db),
  ]);

  return { remaining: Math.max(0, limit - newToday), dayEndsAt: endsAt };
}
