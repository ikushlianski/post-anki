import type { ReviewGrade } from "@post-anki/shared";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
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
}

// Append-only: grading only ever inserts a history row, never edits or deletes one.
export async function insertKnowledgeBitReview(
  tx: Tx,
  row: KnowledgeBitReviewInsertRow,
): Promise<string> {
  const id = newId("kbreview");

  await tx.insert(knowledgeBitReviews).values({ id, ...row });

  return id;
}

export const NEW_CARDS_PER_DAY = 20;

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
