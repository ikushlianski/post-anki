import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { readStudyPlanClock } from "../study-plan/study-plan-today.js";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";
import { getKnowledgeBitReviewQueue, type KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";
import { listActiveSubjectIds, listAlternates } from "./knowledge-bit-review-pack.repo.js";

export const PACK_CARD_LIMIT = 150;
export const PACK_ACTIVE_WINDOW_MS = 3 * 86_400_000;
export const PACK_DUE_HORIZON_MS = 24 * 3_600_000;

export interface ReviewPackCardRow extends KnowledgeBitReviewCardRow {
  alternates: KnowledgeBitReviewCardRow[];
}

export interface ReviewPackPayload {
  generatedAt: string;
  dueBefore: string;
  truncated: boolean;
  cards: ReviewPackCardRow[];
}

export async function buildReviewPack(tz: string, now: Date): Promise<ReviewPackPayload> {
  const dueCutoff = new Date(now.getTime() + PACK_DUE_HORIZON_MS);
  const empty = {
    generatedAt: now.toISOString(),
    dueBefore: dueCutoff.toISOString(),
    truncated: false,
    cards: [],
  };
  const subjectIds = await listActiveSubjectIds(new Date(now.getTime() - PACK_ACTIVE_WINDOW_MS));

  if (subjectIds.length === 0) {
    return empty;
  }

  const queue = await getKnowledgeBitReviewQueue(PACK_CARD_LIMIT, undefined, {
    tz,
    now,
    pack: { subjectIds, dueCutoff },
  });
  const [resolver, planClock] = await Promise.all([loadStudyOptionsResolver(), readStudyPlanClock(now)]);
  const alternates = await listAlternates(
    queue.cards.filter((card) => !card.cardKey).map((card) => ({
      knowledgeBitId: card.knowledgeBitId,
      variantId: card.variantId,
    })),
    now,
    (subjectId) => toScheduleOptions(resolver.resolvePlan(subjectId), planClock),
  );

  return {
    ...empty,
    truncated: queue.cards.length >= PACK_CARD_LIMIT,
    cards: queue.cards.map((card) => ({
      ...card,
      alternates: card.cardKey ? [] : (alternates.get(card.knowledgeBitId) ?? []),
    })),
  };
}
