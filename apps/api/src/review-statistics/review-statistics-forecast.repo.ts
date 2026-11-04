import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { scheduleIsActiveCard } from "../knowledge-bit/knowledge-bit-card-unit.js";
import { scopeCondition } from "../knowledge-bit/knowledge-bit-review-queue-picked.repo.js";

export interface ForecastRows {
  today: string;
  overdue: number;
  dayCounts: { offset: number; count: number }[];
}

export async function readLocalToday(tz: string, now: Date, db: DbExecutor = getDb()): Promise<string> {
  const result = await db.execute<{ today: string }>(
    sql`select to_char((${now.toISOString()}::timestamptz at time zone ${tz})::date, 'YYYY-MM-DD') as today`,
  );

  return result.rows[0]?.today ?? now.toISOString().slice(0, 10);
}

export async function readDueForecast(
  input: { tz: string; now: Date; horizonDays: number; subjectIds: string[] | undefined },
  db: DbExecutor = getDb(),
): Promise<ForecastRows> {
  const { tz, now, horizonDays, subjectIds } = input;
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const effectiveDue = sql`greatest(${knowledgeBitSchedules.dueAt}, coalesce(${knowledgeBitSchedules.buriedUntil}, ${knowledgeBitSchedules.dueAt}))`;
  const localDay = (instant: ReturnType<typeof sql>) => sql`((${instant}) at time zone ${tz})::date`;
  const offset = sql<number>`(${localDay(effectiveDue)} - ${localDay(nowSql)})`.mapWith(Number);

  const rows = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${effectiveDue} <= ${nowSql})`.mapWith(Number),
      offset,
      count: sql<number>`count(*) filter (where ${effectiveDue} > ${nowSql})`.mapWith(Number),
    })
    .from(knowledgeBitSchedules)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitSchedules.knowledgeBitId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        scopeCondition(undefined, db, subjectIds),
        isNull(knowledgeBitSchedules.suspendedAt),
        gt(knowledgeBitSchedules.reviewCount, 0),
        or(isNull(knowledgeBits.topicId), ne(topics.learningStatus, "skipping")),
        bitApproved,
        scheduleIsActiveCard(db),
      ),
    )
    .groupBy(sql`2`);

  const today = await readLocalToday(tz, now, db);

  return {
    today,
    overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
    dayCounts: rows
      .filter((row) => row.count > 0 && row.offset >= 0 && row.offset < horizonDays)
      .map((row) => ({ offset: row.offset, count: row.count })),
  };
}
