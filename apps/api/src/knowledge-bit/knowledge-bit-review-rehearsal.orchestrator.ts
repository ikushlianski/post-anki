import { cardPhaseSchema, type RecordReviewInput, type RecordReviewResult } from "@post-anki/shared";
import { reviewPointsForEventInTx } from "../gamification/gamification.service.js";
import type { Tx } from "../shared/merge-lock.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { readKnowledgeBitScheduleInTx } from "./knowledge-bit-schedule.repo.js";
import { insertRehearsalAttemptInTx } from "./knowledge-bit-variant-attempt-rehearsal.repo.js";

// A rehearsal only logs an attempt: the schedule, review log, points and review count stay as
// they were, and the result echoes the unchanged schedule.
export async function recordRehearsalInTx(
  tx: Tx,
  variant: { id: string; knowledgeBitId: string },
  cardKey: string,
  input: RecordReviewInput,
  now: Date,
): Promise<RecordReviewResult> {
  const attemptId = await insertRehearsalAttemptInTx(tx, {
    variantId: variant.id,
    grade: input.grade,
    requestId: input.requestId,
    createdAt: now,
  });
  const schedule = await readKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId, cardKey);
  const reviewed = schedule && schedule.reviewCount > 0 ? schedule : null;

  return {
    reviewId: attemptId,
    knowledgeBitId: variant.knowledgeBitId,
    phase: reviewed ? cardPhaseSchema.catch("review").parse(reviewed.phase) : "new",
    dueAt: (reviewed?.dueAt ?? now).toISOString(),
    intervalDays: reviewed?.intervalDays ?? 0,
    lapses: reviewed?.lapses ?? 0,
    leech: isLeech(reviewed?.lapses ?? 0),
    suspended: schedule?.suspendedAt != null,
    points: await reviewPointsForEventInTx(tx, null),
    cardKey,
    buriedVariantIds: [],
    followUp: null,
  };
}
