import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, knowledgeBitReviews, knowledgeBits, knowledgeSources, topics } from "../db/schema.js";
import { scopeCondition } from "../knowledge-bit/knowledge-bit-review-queue-picked.repo.js";

export interface RetentionRow {
  date: string;
  total: number;
  passed: number;
}

export interface HistoryRows {
  retention: RetentionRow[];
  gradeCounts: { grade: string; count: number }[];
  earliestReviewDate: string | null;
}

export interface HistoryInput {
  tz: string;
  now: Date;
  historyDays: number;
  granularity: "day" | "week";
  subjectIds: string[] | undefined;
}

function windowStart(input: HistoryInput): SQL | undefined {
  if (input.historyDays === 0) {
    return undefined;
  }

  const nowSql = sql`${input.now.toISOString()}::timestamptz`;

  return sql`${knowledgeBitReviews.reviewedAt} >= (((${nowSql} at time zone ${input.tz})::date - ${input.historyDays}::int)::timestamp at time zone ${input.tz})`;
}

export async function readReviewHistory(input: HistoryInput, db: DbExecutor = getDb()): Promise<HistoryRows> {
  const localReviewed = sql`(${knowledgeBitReviews.reviewedAt} at time zone ${input.tz})`;
  const bucket =
    input.granularity === "week"
      ? sql<string>`to_char(date_trunc('week', ${localReviewed})::date, 'YYYY-MM-DD')`
      : sql<string>`to_char(${localReviewed}::date, 'YYYY-MM-DD')`;
  const scoped = and(
    isNull(knowledgeBitReviews.undoneAt),
    scopeCondition(undefined, db, input.subjectIds),
    windowStart(input),
  );

  const [retention, gradeRows, earliest] = await Promise.all([
    db
      .select({
        date: bucket,
        total: sql<number>`count(*)`.mapWith(Number),
        passed: sql<number>`count(*) filter (where ${knowledgeBitReviews.grade} <> 'again')`.mapWith(Number),
      })
      .from(knowledgeBitReviews)
      .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitReviews.knowledgeBitId))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .where(and(scoped, sql`${knowledgeBitReviews.prevSchedule}->>'phase' = 'review'`))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        grade: knowledgeBitReviews.grade,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(knowledgeBitReviews)
      .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitReviews.knowledgeBitId))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .where(scoped)
      .groupBy(knowledgeBitReviews.grade),
    db
      .select({
        date: sql<string | null>`to_char(min(${localReviewed})::date, 'YYYY-MM-DD')`,
      })
      .from(knowledgeBitReviews)
      .where(isNull(knowledgeBitReviews.undoneAt)),
  ]);

  return {
    retention,
    gradeCounts: gradeRows,
    earliestReviewDate: earliest[0]?.date ?? null,
  };
}
