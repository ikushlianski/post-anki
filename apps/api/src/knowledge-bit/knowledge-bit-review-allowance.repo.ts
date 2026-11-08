import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { curricula, knowledgeBitReviews, knowledgeBits, knowledgeSources, topics } from "../db/schema.js";
import {
  loadStudyOptionsResolver,
  type StudyOptionsResolver,
} from "../subject-study-options/subject-study-options-resolver.js";
import { cardSubjectIdSql } from "./knowledge-bit-card-subject.js";
import type { Picked } from "./knowledge-bit-review-queue-picked.repo.js";
import { getLocalDayWindow } from "./knowledge-bit-review.repo.js";
import { reviewRemaining } from "./subject-today-rollup.js";

export interface ReviewAllowance {
  dayEndsAt: Date;
  remainingFor: (subjectId: string | null) => number;
}

export interface DueReviewsBySubject {
  subjectId: string | null;
  due: number;
}

const reviewPhaseBefore = sql`(${knowledgeBitReviews.prevSchedule}->>'phase' is null or ${knowledgeBitReviews.prevSchedule}->>'phase' = 'review')`;

export async function countReviewPhaseAnswersTodayBySubject(
  startsAt: Date,
  db: DbExecutor,
): Promise<Map<string | null, number>> {
  const rows = await db
    .select({
      subjectId: cardSubjectIdSql,
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(knowledgeBitReviews)
    .leftJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitReviews.knowledgeBitId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        eq(knowledgeBitReviews.wasNew, false),
        isNull(knowledgeBitReviews.undoneAt),
        gte(knowledgeBitReviews.reviewedAt, startsAt),
        reviewPhaseBefore,
      ),
    )
    .groupBy(cardSubjectIdSql);

  return new Map(rows.map((row) => [row.subjectId, row.total]));
}

export async function readReviewAllowance(
  clock: { tz: string; now: Date },
  db: DbExecutor,
  resolver?: StudyOptionsResolver,
): Promise<ReviewAllowance> {
  const { startsAt, endsAt } = await getLocalDayWindow(clock.tz, clock.now, db);
  const [usedBySubject, options] = await Promise.all([
    countReviewPhaseAnswersTodayBySubject(startsAt, db),
    resolver ?? loadStudyOptionsResolver(db),
  ]);

  return {
    dayEndsAt: endsAt,
    remainingFor: (subjectId) =>
      reviewRemaining(options.resolve(subjectId).effective.maxReviewsPerDay, usedBySubject.get(subjectId) ?? 0),
  };
}

export async function readDueReviewsBySubject(
  picked: Picked,
  dueCutoff: Date,
  db: DbExecutor,
): Promise<DueReviewsBySubject[]> {
  const cutoffSql = sql`${dueCutoff.toISOString()}::timestamptz`;
  const rows = await db
    .select({
      subjectId: picked.cardSubjectId,
      due: sql<number>`count(*)`.mapWith(Number),
    })
    .from(picked)
    .where(
      and(
        eq(picked.pickRank, 1),
        sql`${picked.dueAt} <= ${cutoffSql}`,
        sql`${picked.phase} not in ('learning', 'relearning')`,
      ),
    )
    .groupBy(picked.cardSubjectId);

  return rows.map((row) => ({ subjectId: row.subjectId, due: row.due }));
}
