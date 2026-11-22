import { loadStudyOptionsResolver } from "../subject-study-options/subject-study-options-resolver.js";
import { readStudyPlanClock } from "../study-plan/study-plan-today.js";
import { toScheduleOptions } from "./knowledge-bit-schedule-options.js";
import { getKnowledgeBitReviewQueue, type KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";
import { listSkippedSubjects } from "../subject-day-skip/subject-day-skip.repo.js";
import { loadSubjectPathLabels } from "../subject/subject-path-labels.js";
import { groupReviewCardsBySubject, type GroupedReviewCardRow } from "./knowledge-bit-review-subject-groups.js";
import { listActiveSubjectIds, listAlternates } from "./knowledge-bit-review-pack.repo.js";

export const PACK_CARD_LIMIT = 150;
export const PACK_ACTIVE_WINDOW_MS = 3 * 86_400_000;
export const PACK_DUE_HORIZON_MS = 24 * 3_600_000;

export interface ReviewPackCardRow extends GroupedReviewCardRow {
  alternates: KnowledgeBitReviewCardRow[];
}

export interface ReviewPackPayload {
  generatedAt: string;
  dueBefore: string;
  truncated: boolean;
  dayKey: string;
  skippedSubjectIds: string[];
  cards: ReviewPackCardRow[];
}

export async function buildReviewPack(tz: string, now: Date): Promise<ReviewPackPayload> {
  const dueCutoff = new Date(now.getTime() + PACK_DUE_HORIZON_MS);
  const [skipped, activeSubjectIds] = await Promise.all([
    listSkippedSubjects({ tz, now }),
    listActiveSubjectIds(new Date(now.getTime() - PACK_ACTIVE_WINDOW_MS)),
  ]);
  const empty = {
    generatedAt: now.toISOString(),
    dueBefore: dueCutoff.toISOString(),
    truncated: false,
    dayKey: skipped.dayKey,
    skippedSubjectIds: skipped.subjectIds,
    cards: [],
  };
  const skippedSet = new Set(skipped.subjectIds);
  const subjectIds = activeSubjectIds.filter((id) => !skippedSet.has(id));

  if (subjectIds.length === 0) {
    return empty;
  }

  const queue = await getKnowledgeBitReviewQueue(PACK_CARD_LIMIT, undefined, {
    tz,
    now,
    pack: { subjectIds, dueCutoff },
  });
  const [resolver, planClock, labels] = await Promise.all([
    loadStudyOptionsResolver(),
    readStudyPlanClock(now),
    loadSubjectPathLabels(),
  ]);
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
    cards: groupReviewCardsBySubject(queue.cards, labels).map((card) => ({
      ...card,
      alternates: card.cardKey ? [] : (alternates.get(card.knowledgeBitId) ?? []),
    })),
  };
}
