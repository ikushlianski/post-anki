import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { scoreReview, MASTERED_INTERVAL_DAYS } from "@post-anki/core";
import type { PointsReason } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBits,
  knowledgeSources,
  reviewPointEvents,
  subjects,
  topics,
} from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { Tx } from "../shared/merge-lock.js";

const REVIEW_EVENT_TYPE = "review";

export interface AwardReviewPointInput {
  reviewId: string;
  knowledgeBitId: string;
  reviewedAt: Date;
  intervalDaysAfter: number;
}

export interface ReviewPointEventRecord {
  reviewId: string;
  knowledgeBitId: string;
  awardedDay: string;
  points: number;
  reason: PointsReason;
}

function toDayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function toRecord(row: typeof reviewPointEvents.$inferSelect): ReviewPointEventRecord {
  return {
    reviewId: row.reviewId,
    knowledgeBitId: row.knowledgeBitId,
    awardedDay: row.awardedDay,
    points: row.points,
    reason: row.reason as PointsReason,
  };
}

export async function readPointEventByReviewIdInTx(
  tx: Tx,
  reviewId: string,
): Promise<ReviewPointEventRecord | null> {
  const rows = await tx
    .select()
    .from(reviewPointEvents)
    .where(eq(reviewPointEvents.reviewId, reviewId))
    .limit(1);

  return rows[0] ? toRecord(rows[0]) : null;
}

async function resolveBitSubjectIdInTx(tx: Tx, knowledgeBitId: string): Promise<string | null> {
  const rows = await tx
    .select({
      curriculumSubjectId: curricula.subjectId,
      sourceSubjectId: knowledgeSources.subjectId,
    })
    .from(knowledgeBits)
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(eq(knowledgeBits.id, knowledgeBitId))
    .limit(1);

  return rows[0]?.curriculumSubjectId ?? rows[0]?.sourceSubjectId ?? null;
}

export async function awardReviewPointInTx(
  tx: Tx,
  input: AwardReviewPointInput,
): Promise<ReviewPointEventRecord> {
  const { points, reason } = scoreReview();

  await tx
    .insert(reviewPointEvents)
    .values({
      id: newId("rpe"),
      eventType: REVIEW_EVENT_TYPE,
      reviewId: input.reviewId,
      knowledgeBitId: input.knowledgeBitId,
      subjectId: await resolveBitSubjectIdInTx(tx, input.knowledgeBitId),
      awardedDay: toDayKey(input.reviewedAt),
      points,
      reason,
      intervalDaysAfter: input.intervalDaysAfter,
    })
    .onConflictDoNothing({ target: reviewPointEvents.reviewId });

  const stored = await readPointEventByReviewIdInTx(tx, input.reviewId);

  if (!stored) {
    throw new Error("review point event missing after award");
  }

  return stored;
}

export async function voidPointEventByReviewIdInTx(
  tx: Tx,
  reviewId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(reviewPointEvents)
    .set({ voidedAt: now })
    .where(and(eq(reviewPointEvents.reviewId, reviewId), isNull(reviewPointEvents.voidedAt)));
}

const liveReview = () =>
  and(isNull(reviewPointEvents.voidedAt), eq(reviewPointEvents.eventType, REVIEW_EVENT_TYPE));

export async function sumPoints(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${reviewPointEvents.points}), 0)::int` })
    .from(reviewPointEvents)
    .where(isNull(reviewPointEvents.voidedAt));

  return rows[0]?.total ?? 0;
}

export async function sumPointsForDay(day: string, db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${reviewPointEvents.points}), 0)::int` })
    .from(reviewPointEvents)
    .where(and(eq(reviewPointEvents.awardedDay, day), isNull(reviewPointEvents.voidedAt)));

  return rows[0]?.total ?? 0;
}

export async function countMasteredCards(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(distinct ${reviewPointEvents.knowledgeBitId})::int` })
    .from(reviewPointEvents)
    .where(
      and(
        liveReview(),
        gte(reviewPointEvents.intervalDaysAfter, MASTERED_INTERVAL_DAYS),
      ),
    );

  return rows[0]?.total ?? 0;
}

export async function countReviews(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviewPointEvents)
    .where(liveReview());

  return rows[0]?.total ?? 0;
}

export async function countReviewsBySubject(
  db: DbExecutor = getDb(),
): Promise<{ subjectId: string; subjectName: string; reviews: number }[]> {
  return db
    .select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      reviews: sql<number>`count(*)::int`,
    })
    .from(reviewPointEvents)
    .innerJoin(subjects, eq(subjects.id, reviewPointEvents.subjectId))
    .where(liveReview())
    .groupBy(subjects.id, subjects.name)
    .orderBy(subjects.name);
}
