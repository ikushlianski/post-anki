import { cardPhaseSchema, type RecordReviewInput, type RecordReviewResult } from "@post-anki/shared";
import type { KnowledgeBitScheduleSnapshot } from "../db/schema.js";
import { withSubjectLock } from "../shared/merge-lock.js";
import { deriveGradeSchedule, type GradeScheduleState } from "./knowledge-bit-grade-schedule.js";
import { deriveLeechOutcome } from "./knowledge-bit-grade-schedule-leech.js";
import {
  insertKnowledgeBitReview,
  readKnowledgeBitReviewByRequestIdInTx,
  type KnowledgeBitReviewByRequestRecord,
} from "./knowledge-bit-review.repo.js";
import {
  readKnowledgeBitScheduleInTx,
  upsertKnowledgeBitScheduleInTx,
} from "./knowledge-bit-schedule.repo.js";
import { getQuestionVariantById } from "./knowledge-bit-variant-attempt.repo.js";

export type RecordKnowledgeBitReviewOutcome =
  | ({ ok: true } & RecordReviewResult)
  | { ok: false; error: "variant_not_found" | "not_approved" };

function toGradeState(snapshot: KnowledgeBitScheduleSnapshot): GradeScheduleState {
  return {
    easeFactor: snapshot.easeFactor,
    intervalDays: snapshot.intervalDays,
    phase: cardPhaseSchema.catch("review").parse(snapshot.phase),
    learningStep: snapshot.learningStep ?? 0,
    lapses: snapshot.lapses ?? 0,
  };
}

// A retry carrying an already-stored requestId gets the result re-derived from the stored
// pre-grade snapshot, so the schedule is not changed a second time.
function replayStoredReview(stored: KnowledgeBitReviewByRequestRecord): RecordReviewResult {
  const previous = stored.prevSchedule ? toGradeState(stored.prevSchedule) : null;
  const next = deriveGradeSchedule(previous, stored.grade, stored.reviewedAt);
  const leech = deriveLeechOutcome(previous?.lapses ?? 0, next.lapses);

  return {
    reviewId: stored.id,
    knowledgeBitId: stored.knowledgeBitId,
    phase: next.phase,
    dueAt: next.dueAt.toISOString(),
    intervalDays: next.intervalDays,
    lapses: next.lapses,
    leech: leech.leech,
    suspended: leech.autoSuspend || stored.prevSchedule?.suspendedAt != null,
  };
}

// Self-graded review: no LLM. Schedule update and history row commit together under the same
// per-bit lock typed grading uses, so concurrent grades of one bit apply one after the other.
export async function recordKnowledgeBitReview(
  input: RecordReviewInput,
  now: Date = new Date(),
): Promise<RecordKnowledgeBitReviewOutcome> {
  const variant = await getQuestionVariantById(input.variantId);

  if (!variant) {
    return { ok: false, error: "variant_not_found" };
  }

  if (variant.approvalState !== "approved") {
    return { ok: false, error: "not_approved" };
  }

  return withSubjectLock(variant.knowledgeBitId, async (tx) => {
    if (input.requestId) {
      const replayed = await readKnowledgeBitReviewByRequestIdInTx(tx, input.requestId);

      if (replayed) {
        return { ok: true as const, ...replayStoredReview(replayed) };
      }
    }

    const stored = await readKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId);
    const previous = stored && stored.reviewCount > 0 ? stored : null;
    const next = deriveGradeSchedule(previous, input.grade, now);
    const leech = deriveLeechOutcome(previous?.lapses ?? 0, next.lapses);

    await upsertKnowledgeBitScheduleInTx(
      tx,
      variant.knowledgeBitId,
      { ...next, suspendedAt: leech.autoSuspend ? now : undefined },
      now,
    );

    const reviewId = await insertKnowledgeBitReview(tx, {
      knowledgeBitId: variant.knowledgeBitId,
      variantId: variant.id,
      grade: input.grade,
      wasNew: next.wasNew,
      durationMs: input.durationMs ?? null,
      prevSchedule: previous
        ? {
            easeFactor: previous.easeFactor,
            intervalDays: previous.intervalDays,
            dueAt: previous.dueAt.toISOString(),
            lastReviewedAt: previous.lastReviewedAt?.toISOString() ?? null,
            reviewCount: previous.reviewCount,
            phase: previous.phase,
            learningStep: previous.learningStep,
            lapses: previous.lapses,
            suspendedAt: previous.suspendedAt?.toISOString() ?? null,
            buriedUntil: previous.buriedUntil?.toISOString() ?? null,
          }
        : null,
      reviewedAt: now,
      requestId: input.requestId,
    });

    return {
      ok: true as const,
      reviewId,
      knowledgeBitId: variant.knowledgeBitId,
      phase: next.phase,
      dueAt: next.dueAt.toISOString(),
      intervalDays: next.intervalDays,
      lapses: next.lapses,
      leech: leech.leech,
      suspended: leech.autoSuspend || stored?.suspendedAt != null,
    };
  });
}
