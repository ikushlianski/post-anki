import { and, asc, count, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { cardPhaseSchema, isOrderedListKind } from "@post-anki/shared";
import type { DbExecutor } from "../db/client.js";
import {
  curricula,
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  topics,
} from "../db/schema.js";
import { variantCardKeySql } from "./knowledge-bit-card-key.js";
import { cardSubjectIdSql } from "./knowledge-bit-card-subject.js";
import { DEFAULT_STEP_OPTIONS } from "./knowledge-bit-learning-steps.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { previewGradeIntervals, type ScheduleOptions } from "./knowledge-bit-grade-schedule.js";
import { rollingPhraseFront } from "./meeting-phrase-rolling-front.js";
import { phaseRank } from "./knowledge-bit-review-queue-learning.repo.js";
import {
  eligibility,
  pickedVariants,
  type Picked,
} from "./knowledge-bit-review-queue-picked.repo.js";
import type {
  KnowledgeBitReviewCardRow,
  KnowledgeBitReviewCardsFilter,
} from "./knowledge-bit-review-queue.repo.js";

export type StepsFor = (subjectId: string | null) => ScheduleOptions;

export const defaultStepsFor: StepsFor = () => DEFAULT_STEP_OPTIONS;

export function toCard(
  row: Omit<
    KnowledgeBitReviewCardRow,
    "phase" | "leech" | "intervalPreview" | "kind" | "sourceLinks" | "subjectId" | "sentence"
  > & {
    subjectId?: string | null;
    sentence?: string | null;
    body?: string | null;
    reviewCount?: number | null;
    cardSubjectId?: string | null;
    kind: string;
    sourceLinks: string[] | null;
    isNew: boolean;
    easeFactor: number | null;
    intervalDays: number | null;
    phase: string | null;
    learningStep: number | null;
    lapses: number | null;
  },
  now: Date,
  stepsFor: StepsFor = defaultStepsFor,
): KnowledgeBitReviewCardRow {
  const {
    isNew,
    easeFactor,
    intervalDays,
    phase,
    learningStep,
    lapses,
    sourceLinks,
    subjectId,
    cardSubjectId,
    sentence,
    body,
    reviewCount,
    ...card
  } = row;
  const rolled = body
    ? rollingPhraseFront({
        kind: card.kind,
        prompt: card.prompt,
        answer: card.answer,
        reviewCount: isNew ? 0 : (reviewCount ?? 0),
      })
    : null;
  const parsed = cardPhaseSchema.safeParse(phase);
  const storedPhase = parsed.success ? parsed.data : "review";
  const state =
    easeFactor === null || intervalDays === null
      ? null
      : {
          easeFactor,
          intervalDays,
          phase: storedPhase,
          learningStep: learningStep ?? 0,
          lapses: lapses ?? 0,
        };

  return {
    ...card,
    ...(rolled ? { prompt: rolled } : {}),
    sourceLinks: sourceLinks ?? [],
    subjectId: subjectId ?? null,
    kind: card.kind as KnowledgeBitQuestionVariantKind,
    ...(card.aiSuggestion && body ? { originalPhrase: body } : {}),
    ...(sentence && (card.kind === "cloze" || isOrderedListKind(card.kind)) ? { sentence } : {}),
    phase: isNew ? "new" : storedPhase,
    leech: isLeech(lapses ?? 0),
    intervalPreview: previewGradeIntervals(state, now, stepsFor(cardSubjectId ?? null)),
  };
}

const notYetDueRank = (picked: Picked, now: Date) =>
  sql<number>`case when ${picked.dueAt} > ${now.toISOString()}::timestamptz then 1 else 0 end`;

// Scoped queues keep fair cycling by review count; topic scope sorts due bits first.
export async function listScopedCards(
  limit: number,
  scope: SQL,
  filter: KnowledgeBitReviewCardsFilter,
  now: Date,
  db: DbExecutor,
  stepsFor: StepsFor = defaultStepsFor,
): Promise<KnowledgeBitReviewCardRow[]> {
  const reviewCount = count(knowledgeBitReviews.id);
  const dueRank = sql<number>`min(case when ${knowledgeBitSchedules.knowledgeBitId} is null or ${knowledgeBitSchedules.dueAt} <= now() then 0 else 1 end)`;
  const picked = pickedVariants(scope, now, db);
  const pickedVariantIds = db
    .select({ variantId: picked.variantId })
    .from(picked)
    .where(eq(picked.pickRank, 1));

  const rows = await db
    .select({
      variantId: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBits.id,
      kind: knowledgeBitQuestionVariants.kind,
      cardKey: variantCardKeySql,
      prompt: knowledgeBitQuestionVariants.prompt,
      context: knowledgeBitQuestionVariants.context,
      answer: knowledgeBitQuestionVariants.answer,
      sentence: knowledgeBitQuestionVariants.sentence,
      background: knowledgeBits.background,
      body: knowledgeBits.body,
      reviewCount: knowledgeBitSchedules.reviewCount,
      isAiGenerated: knowledgeBits.isAiGenerated,
      aiSuggestion: knowledgeBits.aiSuggestion,
      sourceLinks: knowledgeBits.sourceLinks,
      subjectId: knowledgeSources.subjectId,
      cardSubjectId: cardSubjectIdSql,
      easeFactor: knowledgeBitSchedules.easeFactor,
      intervalDays: knowledgeBitSchedules.intervalDays,
      phase: knowledgeBitSchedules.phase,
      learningStep: knowledgeBitSchedules.learningStep,
      lapses: knowledgeBitSchedules.lapses,
      isNew: sql<boolean>`bool_and(${knowledgeBitSchedules.reviewCount} is null or ${knowledgeBitSchedules.reviewCount} = 0)`,
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(knowledgeBitReviews, eq(knowledgeBitReviews.variantId, knowledgeBitQuestionVariants.id))
    .leftJoin(
      knowledgeBitSchedules,
      and(
        eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id),
        eq(knowledgeBitSchedules.cardKey, variantCardKeySql),
      ),
    )
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(
      and(
        eligibility(scope, now),
        inArray(knowledgeBitQuestionVariants.id, pickedVariantIds),
      ),
    )
    .groupBy(
      knowledgeBitQuestionVariants.id,
      knowledgeBitQuestionVariants.kind,
      knowledgeBitQuestionVariants.order,
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.context,
      knowledgeBitQuestionVariants.answer,
      knowledgeBitQuestionVariants.sentence,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.background,
      knowledgeBits.body,
      knowledgeBitSchedules.reviewCount,
      knowledgeBits.isAiGenerated,
      knowledgeBits.aiSuggestion,
      knowledgeBits.sourceLinks,
      knowledgeSources.subjectId,
      curricula.subjectId,
      knowledgeBits.topicId,
      knowledgeBitSchedules.easeFactor,
      knowledgeBitSchedules.intervalDays,
      knowledgeBitSchedules.phase,
      knowledgeBitSchedules.learningStep,
      knowledgeBitSchedules.lapses,
    )
    .orderBy(
      ...(filter.topicId ? [asc(dueRank)] : []),
      asc(reviewCount),
      asc(knowledgeBitQuestionVariants.createdAt),
    )
    .limit(limit);

  return rows.map((row) => toCard(row, now, stepsFor));
}

export async function listPickedCards(
  picked: Picked,
  kind: "due" | "new",
  limit: number,
  now: Date,
  db: DbExecutor,
  stepsFor: StepsFor = defaultStepsFor,
  dueCutoff: Date = now,
): Promise<KnowledgeBitReviewCardRow[]> {
  if (limit <= 0) {
    return [];
  }

  const condition =
    kind === "due" ? lte(picked.dueAt, dueCutoff) : isNull(picked.scheduleBitId);
  const rows = await db
    .select({
      variantId: picked.variantId,
      knowledgeBitId: picked.knowledgeBitId,
      kind: picked.kind,
      cardKey: picked.cardKey,
      prompt: picked.prompt,
      context: picked.context,
      answer: picked.answer,
      sentence: picked.sentence,
      background: picked.background,
      body: picked.body,
      reviewCount: picked.reviewCount,
      isAiGenerated: picked.isAiGenerated,
      aiSuggestion: picked.aiSuggestion,
      sourceLinks: picked.sourceLinks,
      subjectId: picked.subjectId,
      cardSubjectId: picked.cardSubjectId,
      easeFactor: picked.easeFactor,
      intervalDays: picked.intervalDays,
      phase: picked.phase,
      learningStep: picked.learningStep,
      lapses: picked.lapses,
      isNew: sql<boolean>`${picked.scheduleBitId} is null`,
    })
    .from(picked)
    .where(and(eq(picked.pickRank, 1), condition))
    .orderBy(
      ...(kind === "due"
        ? [asc(notYetDueRank(picked, now)), asc(phaseRank(picked)), asc(picked.dueAt)]
        : [asc(picked.bitCreatedAt)]),
      asc(picked.variantId),
    )
    .limit(limit);

  return rows.map((row) => toCard(row, now, stepsFor));
}

export async function listPickedNewCards(
  picked: Picked,
  freshBySubject: { subjectId: string | null; fresh: number }[],
  allowance: { remainingFor: (subjectId: string | null) => number },
  limit: number,
  now: Date,
  db: DbExecutor,
  stepsFor: StepsFor = defaultStepsFor,
): Promise<KnowledgeBitReviewCardRow[]> {
  const batches = await Promise.all(
    freshBySubject
      .filter((entry) => entry.fresh > 0)
      .map(async ({ subjectId }) => {
        const take = Math.min(limit, allowance.remainingFor(subjectId));

        if (take <= 0) {
          return [];
        }

        return db
          .select({
            variantId: picked.variantId,
            knowledgeBitId: picked.knowledgeBitId,
            kind: picked.kind,
            cardKey: picked.cardKey,
            prompt: picked.prompt,
            context: picked.context,
            answer: picked.answer,
            sentence: picked.sentence,
            background: picked.background,
            body: picked.body,
            reviewCount: picked.reviewCount,
            isAiGenerated: picked.isAiGenerated,
            aiSuggestion: picked.aiSuggestion,
            sourceLinks: picked.sourceLinks,
            subjectId: picked.subjectId,
            cardSubjectId: picked.cardSubjectId,
            bitCreatedAt: picked.bitCreatedAt,
            easeFactor: picked.easeFactor,
            intervalDays: picked.intervalDays,
            phase: picked.phase,
            learningStep: picked.learningStep,
            lapses: picked.lapses,
            isNew: sql<boolean>`true`,
          })
          .from(picked)
          .where(
            and(
              eq(picked.pickRank, 1),
              isNull(picked.scheduleBitId),
              subjectId === null ? isNull(picked.cardSubjectId) : eq(picked.cardSubjectId, subjectId),
            ),
          )
          .orderBy(asc(picked.bitCreatedAt), asc(picked.variantId))
          .limit(take);
      }),
  );

  return batches
    .flat()
    .sort(
      (a, b) =>
        a.bitCreatedAt.getTime() - b.bitCreatedAt.getTime() || a.variantId.localeCompare(b.variantId),
    )
    .slice(0, limit)
    .map(({ bitCreatedAt: _bitCreatedAt, ...row }) => toCard(row, now, stepsFor));
}
