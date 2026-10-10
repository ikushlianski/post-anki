import { cardPhaseSchema } from "@post-anki/shared";
import type { KnowledgeBitScheduleSnapshot } from "../db/schema.js";
import type { KnowledgeBitScheduleRow } from "./knowledge-bit-schedule.repo.js";

export interface ReviewUndoInput {
  review: { reviewedAt: Date; undoneAt: Date | null };
  snapshot: KnowledgeBitScheduleSnapshot | null;
  current: KnowledgeBitScheduleRow | null;
  laterLiveReviewExists: boolean;
  now: Date;
}

export type ReviewUndoOutcome =
  | { ok: false; error: "not_latest" }
  | { ok: true; row: KnowledgeBitScheduleRow };

function restoredGradeFields(
  snapshot: KnowledgeBitScheduleSnapshot | null,
  reviewedAt: Date,
): Omit<KnowledgeBitScheduleRow, "suspendedAt" | "buriedUntil"> {
  if (!snapshot) {
    return {
      easeFactor: 2.5,
      intervalDays: 0,
      dueAt: reviewedAt,
      lastReviewedAt: null,
      reviewCount: 0,
      phase: "new",
      learningStep: 0,
      lapses: 0,
    };
  }

  const phase = cardPhaseSchema.safeParse(snapshot.phase);

  return {
    easeFactor: snapshot.easeFactor,
    intervalDays: snapshot.intervalDays,
    dueAt: new Date(snapshot.dueAt),
    lastReviewedAt: snapshot.lastReviewedAt ? new Date(snapshot.lastReviewedAt) : null,
    reviewCount: snapshot.reviewCount,
    phase: phase.success ? phase.data : "review",
    learningStep: snapshot.learningStep ?? 0,
    lapses: snapshot.lapses ?? 0,
  };
}

export function deriveReviewUndo(input: ReviewUndoInput): ReviewUndoOutcome {
  const { review, snapshot, current, laterLiveReviewExists } = input;

  if (
    review.undoneAt ||
    laterLiveReviewExists ||
    !current ||
    current.lastReviewedAt?.getTime() !== review.reviewedAt.getTime()
  ) {
    return { ok: false, error: "not_latest" };
  }

  const causedSuspension = current.suspendedAt?.getTime() === review.reviewedAt.getTime();
  const restoredSuspendedAt = snapshot?.suspendedAt ? new Date(snapshot.suspendedAt) : null;

  return {
    ok: true,
    row: {
      ...restoredGradeFields(snapshot, review.reviewedAt),
      suspendedAt: causedSuspension ? restoredSuspendedAt : current.suspendedAt,
      buriedUntil: current.buriedUntil,
    },
  };
}
