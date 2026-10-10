import { and, asc, count, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { CardPhase, KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBits,
  knowledgeBitSchedules,
  tagAssignments,
  topics,
} from "../db/schema.js";
import { bitApproved } from "./knowledge-bit-approval.repo.js";

export interface KnowledgeBitReviewCardRow {
  variantId: string;
  knowledgeBitId: string;
  kind: KnowledgeBitQuestionVariantKind;
  prompt: string;
  answer: string;
  background: string | null;
  phase: CardPhase;
}

export interface KnowledgeBitReviewCardsFilter {
  tagId?: string;
  topicId?: string;
  knowledgeBitId?: string;
}

// Anki-mode cards: typed-queue eligibility, but with the reference answer and never the bit body.
// Fair cycling by review count; topic scope sorts due bits first.
export async function listKnowledgeBitReviewCards(
  limit: number,
  filter: KnowledgeBitReviewCardsFilter | undefined,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitReviewCardRow[]> {
  const reviewCount = count(knowledgeBitReviews.id);
  const dueRank = sql<number>`min(case when ${knowledgeBitSchedules.knowledgeBitId} is null or ${knowledgeBitSchedules.dueAt} <= now() then 0 else 1 end)`;
  const isNew = sql<boolean>`bool_and(${knowledgeBitSchedules.knowledgeBitId} is null)`;

  const topicNotDropped = or(isNull(knowledgeBits.topicId), ne(topics.learningStatus, "skipping"));
  const variantActive = isNull(knowledgeBitQuestionVariants.supersededAt);

  const scopeCondition = filter?.knowledgeBitId
    ? eq(knowledgeBits.id, filter.knowledgeBitId)
    : filter?.topicId
      ? eq(knowledgeBits.topicId, filter.topicId)
      : filter?.tagId
        ? inArray(
            knowledgeBits.id,
            db
              .select({ id: tagAssignments.nodeId })
              .from(tagAssignments)
              .where(
                and(
                  eq(tagAssignments.tagId, filter.tagId),
                  eq(tagAssignments.nodeType, "knowledgeBit"),
                ),
              ),
          )
        : undefined;

  const rows = await db
    .select({
      variantId: knowledgeBitQuestionVariants.id,
      knowledgeBitId: knowledgeBits.id,
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      background: knowledgeBits.background,
      isNew,
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(knowledgeBitReviews, eq(knowledgeBitReviews.variantId, knowledgeBitQuestionVariants.id))
    .leftJoin(knowledgeBitSchedules, eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBits.id))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .where(and(scopeCondition, topicNotDropped, variantActive, bitApproved))
    .groupBy(
      knowledgeBitQuestionVariants.id,
      knowledgeBitQuestionVariants.kind,
      knowledgeBitQuestionVariants.prompt,
      knowledgeBitQuestionVariants.answer,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBits.id,
      knowledgeBits.background,
    )
    .orderBy(
      ...(filter?.topicId ? [asc(dueRank)] : []),
      asc(reviewCount),
      asc(knowledgeBitQuestionVariants.createdAt),
    )
    .limit(limit);

  return rows.map(({ isNew: newCard, ...row }) => ({
    ...row,
    kind: row.kind as KnowledgeBitQuestionVariantKind,
    phase: newCard ? "new" : "review",
  }));
}
