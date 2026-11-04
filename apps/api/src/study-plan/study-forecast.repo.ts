import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { cardSubjectIdSql } from "../knowledge-bit/knowledge-bit-card-subject.js";
import { scheduleIsActiveCard } from "../knowledge-bit/knowledge-bit-card-unit.js";
import { scopeCondition } from "../knowledge-bit/knowledge-bit-review-queue-picked.repo.js";

export interface ForecastCardRow {
  subjectId: string | null;
  dueOffset: number;
  intervalDays: number;
  easeFactor: number;
}

export async function readForecastCardRows(
  input: { tz: string; now: Date; horizonDays: number; subjectIds: string[] },
  db: DbExecutor,
): Promise<ForecastCardRow[]> {
  const { tz, now, horizonDays, subjectIds } = input;
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const effectiveDue = sql`greatest(${knowledgeBitSchedules.dueAt}, coalesce(${knowledgeBitSchedules.buriedUntil}, ${knowledgeBitSchedules.dueAt}))`;
  const localDay = (instant: ReturnType<typeof sql>) => sql`((${instant}) at time zone ${tz})::date`;
  const dueOffset = sql<number>`(${localDay(effectiveDue)} - ${localDay(nowSql)})`.mapWith(Number);

  const rows = await db
    .select({
      subjectId: cardSubjectIdSql,
      dueOffset,
      intervalDays: knowledgeBitSchedules.intervalDays,
      easeFactor: knowledgeBitSchedules.easeFactor,
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
        sql`${knowledgeBitSchedules.reviewCount} > 0`,
        or(isNull(knowledgeBits.topicId), ne(topics.learningStatus, "skipping")),
        bitApproved,
        scheduleIsActiveCard(db),
        lt(dueOffset, horizonDays),
      ),
    );

  return rows;
}
