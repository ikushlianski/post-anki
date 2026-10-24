import { reviewGradeSchema, type ReviewGrade } from "@post-anki/shared";
import { and, eq, gt, gte, isNull, ne, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitReviews, type KnowledgeBitScheduleSnapshot } from "../db/schema.js";
import type { Tx } from "../shared/merge-lock.js";
import { newId } from "../shared/id.js";

export interface KnowledgeBitReviewInsertRow {
  knowledgeBitId: string;
  variantId: string;
  grade: ReviewGrade;
  wasNew: boolean;
  durationMs: number | null;
  prevSchedule: KnowledgeBitScheduleSnapshot | null;
  reviewedAt: Date;
  requestId?: string;
}

// Append-only: grading only ever inserts a history row, never edits or deletes one.
export async function insertKnowledgeBitReview(
  tx: Tx,
  row: KnowledgeBitReviewInsertRow,
): Promise<string> {
  const id = newId("kbreview");

  await tx.insert(knowledgeBitReviews).values({ id, ...row, requestId: row.requestId ?? null });

  return id;
}

export interface LocalDayWindow {
  startsAt: Date;
  endsAt: Date;
}

export async function getLocalDayWindow(
  tz: string,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<LocalDayWindow> {
  const localDay = sql`date_trunc('day', ${now.toISOString()}::timestamptz at time zone ${tz})`;
  const result = await db.execute<{ starts_at: Date; ends_at: Date }>(
    sql`select ${localDay} at time zone ${tz} as starts_at, (${localDay} + interval '1 day') at time zone ${tz} as ends_at`,
  );
  const row = result.rows[0]!;
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);

  return { startsAt, endsAt };
}

export async function countNewCardsReviewedToday(
  startsAt: Date,
  db: DbExecutor = getDb(),
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(knowledgeBitReviews)
    .where(
      and(
        eq(knowledgeBitReviews.wasNew, true),
        isNull(knowledgeBitReviews.undoneAt),
        gte(knowledgeBitReviews.reviewedAt, startsAt),
      ),
    );

  return row?.total ?? 0;
}

export interface KnowledgeBitReviewRecord {
  id: string;
  knowledgeBitId: string;
  prevSchedule: KnowledgeBitScheduleSnapshot | null;
  reviewedAt: Date;
  undoneAt: Date | null;
}

export async function readKnowledgeBitReviewInTx(
  tx: Tx,
  id: string,
): Promise<KnowledgeBitReviewRecord | null> {
  const rows = await tx
    .select({
      id: knowledgeBitReviews.id,
      knowledgeBitId: knowledgeBitReviews.knowledgeBitId,
      prevSchedule: knowledgeBitReviews.prevSchedule,
      reviewedAt: knowledgeBitReviews.reviewedAt,
      undoneAt: knowledgeBitReviews.undoneAt,
    })
    .from(knowledgeBitReviews)
    .where(eq(knowledgeBitReviews.id, id))
    .limit(1);

  return rows[0] ?? null;
}

export interface KnowledgeBitReviewByRequestRecord {
  id: string;
  knowledgeBitId: string;
  grade: ReviewGrade;
  prevSchedule: KnowledgeBitScheduleSnapshot | null;
  reviewedAt: Date;
}

export async function readKnowledgeBitReviewByRequestIdInTx(
  tx: Tx,
  requestId: string,
): Promise<KnowledgeBitReviewByRequestRecord | null> {
  const rows = await tx
    .select({
      id: knowledgeBitReviews.id,
      knowledgeBitId: knowledgeBitReviews.knowledgeBitId,
      grade: knowledgeBitReviews.grade,
      prevSchedule: knowledgeBitReviews.prevSchedule,
      reviewedAt: knowledgeBitReviews.reviewedAt,
    })
    .from(knowledgeBitReviews)
    .where(eq(knowledgeBitReviews.requestId, requestId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  return { ...row, grade: reviewGradeSchema.parse(row.grade) };
}

export async function readKnowledgeBitReviewBitId(
  id: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const rows = await db
    .select({ knowledgeBitId: knowledgeBitReviews.knowledgeBitId })
    .from(knowledgeBitReviews)
    .where(eq(knowledgeBitReviews.id, id))
    .limit(1);

  return rows[0]?.knowledgeBitId ?? null;
}

export async function hasLaterLiveReviewInTx(
  tx: Tx,
  knowledgeBitId: string,
  reviewedAt: Date,
  id: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: knowledgeBitReviews.id })
    .from(knowledgeBitReviews)
    .where(
      and(
        eq(knowledgeBitReviews.knowledgeBitId, knowledgeBitId),
        isNull(knowledgeBitReviews.undoneAt),
        ne(knowledgeBitReviews.id, id),
        gt(knowledgeBitReviews.reviewedAt, reviewedAt),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

// The one sanctioned update of this otherwise append-only table.
export async function markKnowledgeBitReviewUndoneInTx(
  tx: Tx,
  id: string,
  now: Date,
): Promise<void> {
  await tx
    .update(knowledgeBitReviews)
    .set({ undoneAt: now })
    .where(eq(knowledgeBitReviews.id, id));
}
