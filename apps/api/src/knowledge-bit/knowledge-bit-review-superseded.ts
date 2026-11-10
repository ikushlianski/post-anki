import type { RecordReviewResult } from "@post-anki/shared";
import type { Tx } from "../shared/merge-lock.js";
import { reviewPointsForEventInTx } from "../gamification/gamification.service.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { insertKnowledgeBitReview } from "./knowledge-bit-review.repo.js";
import {
  readKnowledgeBitScheduleInTx,
  type KnowledgeBitScheduleRow,
} from "./knowledge-bit-schedule.repo.js";

interface SupersededTarget {
  knowledgeBitId: string;
  cardKey: string;
}

export function isSupersededBy(schedule: KnowledgeBitScheduleRow | null, reviewedAt: Date): boolean {
  return Boolean(schedule?.lastReviewedAt && schedule.lastReviewedAt >= reviewedAt);
}

// A grade older than the card's current schedule leaves a void row (for retry idempotency) and
// changes nothing else: no schedule write, burial, points or review count.
export async function recordSupersededReviewInTx(
  tx: Tx,
  target: SupersededTarget & {
    variantId: string;
    grade: Parameters<typeof insertKnowledgeBitReview>[1]["grade"];
    reviewedAt: Date;
    requestId?: string;
    durationMs: number | null;
  },
): Promise<RecordReviewResult> {
  const reviewId = await insertKnowledgeBitReview(tx, {
    cardKey: target.cardKey,
    buriedSiblings: null,
    knowledgeBitId: target.knowledgeBitId,
    variantId: target.variantId,
    grade: target.grade,
    wasNew: false,
    durationMs: target.durationMs,
    prevSchedule: null,
    reviewedAt: target.reviewedAt,
    requestId: target.requestId,
    undoneAt: new Date(),
  });

  return supersededResult(tx, reviewId, target);
}

export async function supersededResult(
  tx: Tx,
  reviewId: string,
  target: SupersededTarget,
): Promise<RecordReviewResult> {
  const current = await readKnowledgeBitScheduleInTx(tx, target.knowledgeBitId, target.cardKey);

  return {
    reviewId,
    knowledgeBitId: target.knowledgeBitId,
    phase: current?.phase ?? "review",
    dueAt: (current?.dueAt ?? new Date()).toISOString(),
    intervalDays: current?.intervalDays ?? 0,
    lapses: current?.lapses ?? 0,
    leech: isLeech(current?.lapses ?? 0),
    suspended: current?.suspendedAt != null,
    points: await reviewPointsForEventInTx(tx, null),
    cardKey: target.cardKey,
    buriedVariantIds: [],
    followUp: null,
    superseded: true,
  };
}
