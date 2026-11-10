import {
  cardKeyFor,
  cardPhaseSchema,
  type RecordReviewInput,
  type RecordReviewResult,
  type ReviewCard,
} from "@post-anki/shared";
import type { KnowledgeBitScheduleSnapshot } from "../db/schema.js";
import { withSubjectLock, type Tx } from "../shared/merge-lock.js";
import { reviewPointsForEventInTx } from "../gamification/gamification.service.js";
import {
  awardReviewPointInTx,
  readPointEventByReviewIdInTx,
} from "../gamification/review-point-event.repo.js";
import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { readCardSubjectId } from "./knowledge-bit-card-subject.js";
import { readStudyPlanClock, type StudyPlanClock } from "../study-plan/study-plan-today.js";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";
import {
  deriveGradeSchedule,
  type GradeScheduleState,
  type ScheduleOptions,
} from "./knowledge-bit-grade-schedule.js";
import { deriveLeechOutcome } from "./knowledge-bit-grade-schedule-leech.js";
import {
  getLocalDayWindow,
  insertKnowledgeBitReview,
  readKnowledgeBitReviewByRequestIdInTx,
  type KnowledgeBitReviewByRequestRecord,
} from "./knowledge-bit-review.repo.js";
import {
  readKnowledgeBitScheduleInTx,
  upsertKnowledgeBitScheduleInTx,
} from "./knowledge-bit-schedule.repo.js";
import {
  buryCardSiblingsInTx,
  listActiveCardVariantsInTx,
  variantIdsForKeys,
} from "./knowledge-bit-sibling-burial.repo.js";
import { getQuestionVariantById } from "./knowledge-bit-variant-attempt.repo.js";
import { pickAlternateVariant } from "./knowledge-bit-review-alt-variant.repo.js";
import {
  isSupersededBy,
  recordSupersededReviewInTx,
  supersededResult,
} from "./knowledge-bit-review-superseded.js";
import { recordRehearsalInTx } from "./knowledge-bit-review-rehearsal.orchestrator.js";

export type RecordKnowledgeBitReviewOutcome =
  | ({ ok: true } & RecordReviewResult)
  | { ok: false; error: "variant_not_found" | "not_approved" };

async function readStepOptionsInTx(
  tx: Tx,
  knowledgeBitId: string,
  now: Date,
): Promise<{ options: ScheduleOptions; clock: StudyPlanClock }> {
  const [subjectId, resolver, clock] = await Promise.all([
    readCardSubjectId(knowledgeBitId, tx),
    loadStudyOptionsResolver(tx),
    readStudyPlanClock(now, tx),
  ]);

  return { options: toScheduleOptions(resolver.resolvePlan(subjectId), clock), clock };
}

function toGradeState(snapshot: KnowledgeBitScheduleSnapshot): GradeScheduleState {
  return {
    easeFactor: snapshot.easeFactor,
    intervalDays: snapshot.intervalDays,
    phase: cardPhaseSchema.catch("review").parse(snapshot.phase),
    learningStep: snapshot.learningStep ?? 0,
    lapses: snapshot.lapses ?? 0,
  };
}

async function followUpFor(
  tx: Tx,
  knowledgeBitId: string,
  variantId: string,
  cardKey: string,
  grade: RecordReviewInput["grade"],
  options: ScheduleOptions,
  now: Date,
): Promise<ReviewCard | null> {
  if (cardKey !== "" || grade === "again") {
    return null;
  }

  return pickAlternateVariant(knowledgeBitId, variantId, now, tx, () => options);
}

// A retry carrying an already-stored requestId gets the result re-derived from the stored
// pre-grade snapshot, so the schedule is not changed a second time.
async function replayStoredReview(
  tx: Tx,
  stored: KnowledgeBitReviewByRequestRecord,
): Promise<RecordReviewResult> {
  if (stored.undoneAt) {
    return supersededResult(tx, stored.id, stored);
  }

  const previous = stored.prevSchedule ? toGradeState(stored.prevSchedule) : null;
  const { options } = await readStepOptionsInTx(tx, stored.knowledgeBitId, stored.reviewedAt);
  const next = deriveGradeSchedule(previous, stored.grade, stored.reviewedAt, options);
  const leech = deriveLeechOutcome(previous?.lapses ?? 0, next.lapses);
  const points = await reviewPointsForEventInTx(tx, await readPointEventByReviewIdInTx(tx, stored.id));
  const variants = await listActiveCardVariantsInTx(tx, stored.knowledgeBitId);
  const buriedKeys = (stored.buriedSiblings ?? []).map((sibling) => sibling.cardKey);

  return {
    reviewId: stored.id,
    knowledgeBitId: stored.knowledgeBitId,
    phase: next.phase,
    dueAt: next.dueAt.toISOString(),
    intervalDays: next.intervalDays,
    lapses: next.lapses,
    leech: leech.leech,
    suspended: leech.autoSuspend || stored.prevSchedule?.suspendedAt != null,
    points,
    cardKey: stored.cardKey,
    buriedVariantIds: variantIdsForKeys(variants, buriedKeys),
    followUp: await followUpFor(
      tx,
      stored.knowledgeBitId,
      stored.variantId,
      stored.cardKey,
      stored.grade,
      options,
      stored.reviewedAt,
    ),
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
        return { ok: true as const, ...(await replayStoredReview(tx, replayed)) };
      }
    }

    const cardKey = cardKeyFor(variant);

    if (input.rehearsal) {
      return { ok: true as const, ...(await recordRehearsalInTx(tx, variant, cardKey, input, now)) };
    }

    const stored = await readKnowledgeBitScheduleInTx(tx, variant.knowledgeBitId, cardKey);
    const previous = stored && stored.reviewCount > 0 ? stored : null;

    if (input.reviewedAt && isSupersededBy(previous, now)) {
      return {
        ok: true as const,
        ...(await recordSupersededReviewInTx(tx, {
          knowledgeBitId: variant.knowledgeBitId,
          variantId: variant.id,
          cardKey,
          grade: input.grade,
          reviewedAt: now,
          requestId: input.requestId,
          durationMs: input.durationMs ?? null,
        })),
      };
    }

    const { options, clock } = await readStepOptionsInTx(tx, variant.knowledgeBitId, now);
    const next = deriveGradeSchedule(previous, input.grade, now, options);
    const leech = deriveLeechOutcome(previous?.lapses ?? 0, next.lapses);

    await upsertKnowledgeBitScheduleInTx(
      tx,
      variant.knowledgeBitId,
      cardKey,
      { ...next, suspendedAt: leech.autoSuspend ? now : undefined },
      now,
    );

    const activeVariants = await listActiveCardVariantsInTx(tx, variant.knowledgeBitId);
    const buried =
      cardKey !== "" && input.burySiblings !== false
        ? await buryCardSiblingsInTx(
            tx,
            variant.knowledgeBitId,
            cardKey,
            [...new Set(activeVariants.map((active) => active.cardKey))],
            (await getLocalDayWindow(input.tz ?? clock.timeZone, now, tx)).endsAt,
          )
        : [];

    const reviewId = await insertKnowledgeBitReview(tx, {
      cardKey,
      buriedSiblings: buried.length > 0 ? buried : null,
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

    const event = await awardReviewPointInTx(tx, {
      reviewId,
      knowledgeBitId: variant.knowledgeBitId,
      reviewedAt: now,
      intervalDaysAfter: next.intervalDays,
    });
    const points = await reviewPointsForEventInTx(tx, event);

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
      points,
      cardKey,
      buriedVariantIds: variantIdsForKeys(
        activeVariants,
        buried.map((sibling) => sibling.cardKey),
      ),
      followUp: await followUpFor(
        tx,
        variant.knowledgeBitId,
        variant.id,
        cardKey,
        input.grade,
        options,
        now,
      ),
    };
  });
}
