import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitReviews,
  knowledgeBits,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { cardSubjectIdSql } from "../knowledge-bit/knowledge-bit-card-subject.js";
import type { LocalDateRange } from "@post-anki/shared";

export interface TimeWindow {
  startsAt: Date;
  endsAt: Date;
}

export async function getRangeWindow(
  tz: string,
  range: LocalDateRange,
  db: DbExecutor = getDb(),
): Promise<TimeWindow> {
  const result = await db.execute<{ starts_at: Date; ends_at: Date }>(
    sql`select (${range.start}::timestamp at time zone ${tz}) as starts_at, (${range.end}::timestamp at time zone ${tz}) as ends_at`,
  );
  const row = result.rows[0]!;

  return { startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) };
}

export async function countReviewsBySubject(
  window: TimeWindow,
  db: DbExecutor = getDb(),
): Promise<Map<string, { reviews: number; newCards: number }>> {
  const rows = await db
    .select({
      subjectId: cardSubjectIdSql,
      reviews: sql<number>`count(*)`.mapWith(Number),
      newCards: sql<number>`count(*) filter (where ${knowledgeBitReviews.wasNew})`.mapWith(Number),
    })
    .from(knowledgeBitReviews)
    .leftJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitReviews.knowledgeBitId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        isNull(knowledgeBitReviews.undoneAt),
        gte(knowledgeBitReviews.reviewedAt, window.startsAt),
        lt(knowledgeBitReviews.reviewedAt, window.endsAt),
      ),
    )
    .groupBy(cardSubjectIdSql);

  const bySubject = new Map<string, { reviews: number; newCards: number }>();

  for (const row of rows) {
    if (row.subjectId !== null) {
      bySubject.set(row.subjectId, { reviews: row.reviews, newCards: row.newCards });
    }
  }

  return bySubject;
}

export async function countReviewsInWindow(window: TimeWindow, db: DbExecutor = getDb()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(knowledgeBitReviews)
    .where(
      and(
        isNull(knowledgeBitReviews.undoneAt),
        gte(knowledgeBitReviews.reviewedAt, window.startsAt),
        lt(knowledgeBitReviews.reviewedAt, window.endsAt),
      ),
    );

  return row?.total ?? 0;
}

export async function countSourcesBySubject(
  window: TimeWindow,
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      subjectId: knowledgeSources.subjectId,
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(knowledgeSources)
    .where(
      and(gte(knowledgeSources.createdAt, window.startsAt), lt(knowledgeSources.createdAt, window.endsAt)),
    )
    .groupBy(knowledgeSources.subjectId);

  const bySubject = new Map<string, number>();

  for (const row of rows) {
    if (row.subjectId !== null) {
      bySubject.set(row.subjectId, row.total);
    }
  }

  return bySubject;
}
