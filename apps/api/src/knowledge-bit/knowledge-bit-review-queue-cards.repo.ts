import { and, asc, count, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { cardPhaseSchema } from "@post-anki/shared";
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
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { previewGradeIntervals } from "./knowledge-bit-grade-schedule.js";
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

export function toCard(
  row: Omit<
    KnowledgeBitReviewCardRow,
    "phase" | "leech" | "intervalPreview" | "kind" | "sourceLinks" | "subjectId"
  > & {
    subjectId?: string | null;
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
): KnowledgeBitReviewCardRow {
  const { isNew, easeFactor, intervalDays, phase, learningStep, lapses, sourceLinks, subjectId, ...card } =
    row;
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
    sourceLinks: sourceLinks ?? [],
    subjectId: subjectId ?? null,
    kind: card.kind as KnowledgeBitQuestionVariantKind,
    phase: isNew ? "new" : storedPhase,
    leech: isLeech(lapses ?? 0),
    intervalPreview: previewGradeIntervals(state, now),
  };
}

// Scoped queues keep fair cycling by review count; topic scope sorts due bits first.
export async function listScopedCards(
  limit: number,
  scope: SQL,
  filter: KnowledgeBitReviewCardsFilter,
  now: Date,
  db: DbExecutor,
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
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      background: knowledgeBits.background,
      isAiGenerated: knowledgeBits.isAiGenerated,
      sourceLinks: knowledgeBits.sourceLinks,
      subjectId: knowledgeSources.subjectId,
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
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
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
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.answer,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.background,
      knowledgeBits.isAiGenerated,
      knowledgeBits.sourceLinks,
      knowledgeSources.subjectId,
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

  return rows.map((row) => toCard(row, now));
}

export async function listPickedCards(
  picked: Picked,
  kind: "due" | "new",
  limit: number,
  now: Date,
  db: DbExecutor,
): Promise<KnowledgeBitReviewCardRow[]> {
  if (limit <= 0) {
    return [];
  }

  const condition =
    kind === "due" ? lte(picked.dueAt, now) : isNull(picked.scheduleBitId);
  const rows = await db
    .select({
      variantId: picked.variantId,
      knowledgeBitId: picked.knowledgeBitId,
      kind: picked.kind,
      prompt: picked.prompt,
      answer: picked.answer,
      background: picked.background,
      isAiGenerated: picked.isAiGenerated,
      sourceLinks: picked.sourceLinks,
      subjectId: picked.subjectId,
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
        ? [asc(phaseRank(picked)), asc(picked.dueAt)]
        : [asc(picked.bitCreatedAt)]),
      asc(picked.variantId),
    )
    .limit(limit);

  return rows.map((row) => toCard(row, now));
}
