import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { curricula, knowledgeBitReviews, knowledgeBits, knowledgeSources, topics } from "../db/schema.js";
import { cardSubjectIdSql } from "./knowledge-bit-card-subject.js";
import { HALF_LIFE_DAYS, WINDOW_DAYS } from "./knowledge-bit-review-queue-parent-mix.js";

// Recency-decayed review count per card subject over the last WINDOW_DAYS before dayStart.
export async function readSubjectActivity(
  db: DbExecutor,
  dayStart: Date,
): Promise<Map<string, number>> {
  const windowStart = new Date(dayStart.getTime() - WINDOW_DAYS * 86_400_000);
  const ageDays = sql`extract(epoch from (${dayStart.toISOString()}::timestamptz - ${knowledgeBitReviews.reviewedAt})) / 86400.0`;
  const rows = await db
    .select({
      subjectId: cardSubjectIdSql,
      activity: sql<number>`sum(exp(-ln(2::float8) * ${ageDays} / ${HALF_LIFE_DAYS}::float8))`.mapWith(Number),
    })
    .from(knowledgeBitReviews)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitReviews.knowledgeBitId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        isNull(knowledgeBitReviews.undoneAt),
        gte(knowledgeBitReviews.reviewedAt, windowStart),
        lt(knowledgeBitReviews.reviewedAt, dayStart),
      ),
    )
    .groupBy(cardSubjectIdSql);

  return new Map(
    rows.flatMap((row): [string, number][] => (row.subjectId === null ? [] : [[row.subjectId, row.activity]])),
  );
}
