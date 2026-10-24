import type { UndoReviewResult } from "@post-anki/shared";
import { voidPointEventByReviewIdInTx } from "../gamification/review-point-event.repo.js";
import { withSubjectLock } from "../shared/merge-lock.js";
import {
  hasLaterLiveReviewInTx,
  markKnowledgeBitReviewUndoneInTx,
  readKnowledgeBitReviewBitId,
  readKnowledgeBitReviewInTx,
} from "./knowledge-bit-review.repo.js";
import { deriveReviewUndo } from "./knowledge-bit-review-undo.js";
import {
  readKnowledgeBitScheduleInTx,
  replaceKnowledgeBitScheduleInTx,
} from "./knowledge-bit-schedule.repo.js";

export type UndoKnowledgeBitReviewOutcome =
  | ({ ok: true } & UndoReviewResult)
  | { ok: false; error: "review_not_found" | "not_latest" };

// Runs under the same per-bit lock as grading, and re-reads the review inside it.
export async function undoKnowledgeBitReview(
  reviewId: string,
  now: Date = new Date(),
): Promise<UndoKnowledgeBitReviewOutcome> {
  const knowledgeBitId = await readKnowledgeBitReviewBitId(reviewId);

  if (!knowledgeBitId) {
    return { ok: false, error: "review_not_found" };
  }

  return withSubjectLock(knowledgeBitId, async (tx) => {
    const review = await readKnowledgeBitReviewInTx(tx, reviewId);

    if (!review) {
      return { ok: false as const, error: "review_not_found" as const };
    }

    const [current, laterLiveReviewExists] = await Promise.all([
      readKnowledgeBitScheduleInTx(tx, knowledgeBitId),
      hasLaterLiveReviewInTx(tx, knowledgeBitId, review.reviewedAt, reviewId),
    ]);
    const outcome = deriveReviewUndo({
      review,
      snapshot: review.prevSchedule,
      current,
      laterLiveReviewExists,
      now,
    });

    if (!outcome.ok) {
      return outcome;
    }

    await replaceKnowledgeBitScheduleInTx(tx, knowledgeBitId, outcome.row);
    await markKnowledgeBitReviewUndoneInTx(tx, reviewId, now);
    await voidPointEventByReviewIdInTx(tx, reviewId, now);

    return { ok: true as const, knowledgeBitId };
  });
}
