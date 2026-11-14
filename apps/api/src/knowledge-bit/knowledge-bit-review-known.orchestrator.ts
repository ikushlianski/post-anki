import {
  cardKeyFor,
  cardPhaseSchema,
  type RecordKnownReviewInput,
  type RecordReviewResult,
} from "@post-anki/shared";
import { reviewPointsForEventInTx } from "../gamification/gamification.service.js";
import { withSubjectLock } from "../shared/merge-lock.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { deriveKnownSchedule } from "./knowledge-bit-known-schedule.js";
import { insertKnowledgeBitReview } from "./knowledge-bit-review.repo.js";
import {
  readKnowledgeBitScheduleInTx,
  upsertKnowledgeBitScheduleInTx,
} from "./knowledge-bit-schedule.repo.js";
import { getQuestionVariantById } from "./knowledge-bit-variant-attempt.repo.js";

export type RecordKnownKnowledgeBitReviewOutcome =
  | ({ ok: true } & RecordReviewResult)
  | { ok: false; error: "variant_not_found" | "not_approved" };

export async function recordKnownKnowledgeBitReview(
  input: RecordKnownReviewInput,
  now: Date = new Date(),
  random: () => number = Math.random,
): Promise<RecordKnownKnowledgeBitReviewOutcome> {
  const variant = await getQuestionVariantById(input.variantId);

  if (!variant) {
    return { ok: false, error: "variant_not_found" };
  }

  if (variant.approvalState !== "approved") {
    return { ok: false, error: "not_approved" };
  }

  return withSubjectLock(variant.knowledgeBitId, async (tx) => {
    const cardKey = cardKeyFor(variant);
    const stored = await readKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId, cardKey);
    const previous = stored && stored.reviewCount > 0 ? stored : null;
    const next = deriveKnownSchedule(
      previous
        ? {
            easeFactor: previous.easeFactor,
            intervalDays: previous.intervalDays,
            phase: cardPhaseSchema.catch("review").parse(previous.phase),
            learningStep: previous.learningStep ?? 0,
            lapses: previous.lapses ?? 0,
          }
        : null,
      now,
      random,
    );

    await upsertKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId, cardKey, next, now);

    const reviewId = await insertKnowledgeBitReview(tx, {
      cardKey,
      buriedSiblings: null,
      knowledgeBitId: variant.knowledgeBitId,
      variantId: variant.id,
      grade: "easy",
      wasNew: next.wasNew,
      durationMs: null,
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
    });

    return {
      ok: true as const,
      reviewId,
      knowledgeBitId: variant.knowledgeBitId,
      phase: next.phase,
      dueAt: next.dueAt.toISOString(),
      intervalDays: next.intervalDays,
      lapses: next.lapses,
      leech: isLeech(next.lapses),
      suspended: stored?.suspendedAt != null,
      points: await reviewPointsForEventInTx(tx, null),
      cardKey,
      buriedVariantIds: [],
      followUp: null,
    };
  });
}
