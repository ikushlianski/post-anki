import type { RecordReviewInput, RecordReviewResult } from "@post-anki/shared";
import { withSubjectLock } from "../shared/merge-lock.js";
import { deriveGradeSchedule } from "./knowledge-bit-grade-schedule.js";
import { insertKnowledgeBitReview } from "./knowledge-bit-review.repo.js";
import {
  readKnowledgeBitScheduleInTx,
  upsertKnowledgeBitScheduleInTx,
} from "./knowledge-bit-schedule.repo.js";
import { getQuestionVariantById } from "./knowledge-bit-variant-attempt.repo.js";

export type RecordKnowledgeBitReviewOutcome =
  | ({ ok: true } & RecordReviewResult)
  | { ok: false; error: "variant_not_found" | "not_approved" };

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
    const previous = await readKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId);
    const next = deriveGradeSchedule(previous, input.grade, now);

    await upsertKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId, next, now);

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
          }
        : null,
      reviewedAt: now,
    });

    return {
      ok: true as const,
      reviewId,
      knowledgeBitId: variant.knowledgeBitId,
      phase: next.phase,
      dueAt: next.dueAt.toISOString(),
      intervalDays: next.intervalDays,
    };
  });
}
