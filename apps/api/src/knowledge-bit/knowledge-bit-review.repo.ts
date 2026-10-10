import type { ReviewGrade } from "@post-anki/shared";
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
