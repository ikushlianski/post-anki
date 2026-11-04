import { eq, sql } from "drizzle-orm";
import type { StudyOverviewActivityDay } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  readEligibleTotals,
  readNewRemainingToday,
} from "../knowledge-bit/knowledge-bit-review-queue-counts.repo.js";
import { pickedVariants } from "../knowledge-bit/knowledge-bit-review-queue-picked.repo.js";

export async function readReviewActivity(
  input: { tz: string; now: Date; days: number },
  db: DbExecutor = getDb(),
): Promise<StudyOverviewActivityDay[]> {
  const { tz, now, days } = input;
  const today = sql`(${now.toISOString()}::timestamptz at time zone ${tz})::date`;
  const result = await db.execute<{ date: string; count: number }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as date, count(r.id)::int as count
    from generate_series(${today} - (${days}::int - 1), ${today}, interval '1 day') as d(day)
    left join knowledge_bit_reviews r
      on r.undone_at is null and (r.reviewed_at at time zone ${tz})::date = d.day::date
    group by d.day
    order by d.day
  `);

  return result.rows.map((row) => ({
    date: row.date,
    count: Number(row.count),
  }));
}

export async function readQueueSnapshot(
  clock: { tz: string; now: Date },
  db: DbExecutor = getDb(),
) {
  const picked = pickedVariants(undefined, clock.now, db);
  const [totals, newToday, [cardRow]] = await Promise.all([
    readEligibleTotals(picked, clock.now, db),
    readNewRemainingToday(clock, db),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(picked)
      .where(eq(picked.pickRank, 1)),
  ]);

  return {
    totals,
    remaining: newToday.remaining,
    dayEndsAt: newToday.dayEndsAt,
    hasCards: (cardRow?.total ?? 0) > 0,
  };
}
