import { and, isNull, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitReviews } from "../db/schema.js";

export interface LearningDailyRow {
  date: string;
  reviews: number;
  newCards: number;
  passed: number;
  studyMs: number;
}

export interface LearningHourlyRow {
  hour: number;
  reviews: number;
}

export interface LearningAccuracyRow {
  overallTotal: number;
  overallPassed: number;
  last7Total: number;
  last7Passed: number;
}

export interface LearningRows {
  daily: LearningDailyRow[];
  hourly: LearningHourlyRow[];
  accuracy: LearningAccuracyRow;
}

export interface LearningWindow {
  tz: string;
  startDate: string;
  last7StartDate: string;
}

export async function readLearningRows(window: LearningWindow, db: DbExecutor = getDb()): Promise<LearningRows> {
  const local = sql`(${knowledgeBitReviews.reviewedAt} at time zone ${window.tz})`;
  const live = isNull(knowledgeBitReviews.undoneAt);
  const inWindow = and(live, sql`${local}::date >= ${window.startDate}::date`);
  const passedAgg = sql<number>`count(*) filter (where ${knowledgeBitReviews.grade} <> 'again')`.mapWith(Number);

  const [daily, hourly, accuracy] = await Promise.all([
    db
      .select({
        date: sql<string>`to_char(${local}::date, 'YYYY-MM-DD')`,
        reviews: sql<number>`count(*)`.mapWith(Number),
        newCards: sql<number>`count(*) filter (where ${knowledgeBitReviews.wasNew})`.mapWith(Number),
        passed: passedAgg,
        studyMs: sql<number>`coalesce(sum(${knowledgeBitReviews.durationMs}), 0)`.mapWith(Number),
      })
      .from(knowledgeBitReviews)
      .where(inWindow)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        hour: sql<number>`extract(hour from ${local})::int`.mapWith(Number),
        reviews: sql<number>`count(*)`.mapWith(Number),
      })
      .from(knowledgeBitReviews)
      .where(inWindow)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        overallTotal: sql<number>`count(*)`.mapWith(Number),
        overallPassed: passedAgg,
        last7Total: sql<number>`count(*) filter (where ${local}::date >= ${window.last7StartDate}::date)`.mapWith(Number),
        last7Passed:
          sql<number>`count(*) filter (where ${knowledgeBitReviews.grade} <> 'again' and ${local}::date >= ${window.last7StartDate}::date)`.mapWith(
            Number,
          ),
      })
      .from(knowledgeBitReviews)
      .where(live),
  ]);

  return {
    daily,
    hourly,
    accuracy: accuracy[0] ?? { overallTotal: 0, overallPassed: 0, last7Total: 0, last7Passed: 0 },
  };
}
