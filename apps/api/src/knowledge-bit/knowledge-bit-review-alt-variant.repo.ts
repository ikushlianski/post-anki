import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import {
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeSources,
  curricula,
  topics,
} from "../db/schema.js";
import { variantCardKeySql } from "./knowledge-bit-card-key.js";
import { cardSubjectIdSql } from "./knowledge-bit-card-subject.js";
import { variantKindRankSql, variantLastShownAtSql } from "./knowledge-bit-review-queue-picked.repo.js";
import { defaultStepsFor, toCard, type StepsFor } from "./knowledge-bit-review-queue-cards.repo.js";
import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";

// The next wording of the same plain (cardKey '') card, least recently shown first. Null when the
// card has fewer than two active wordings.
export async function pickAlternateVariant(
  knowledgeBitId: string,
  excludeVariantId: string,
  now: Date,
  db: DbExecutor,
  stepsFor: StepsFor = defaultStepsFor,
): Promise<KnowledgeBitReviewCardRow | null> {
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
      isNew: sql<boolean>`${knowledgeBitSchedules.reviewCount} is null or ${knowledgeBitSchedules.reviewCount} = 0`,
    })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
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
        eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBitId),
        isNull(knowledgeBitQuestionVariants.supersededAt),
        sql`${variantCardKeySql} = ''`,
      ),
    )
    .orderBy(
      asc(variantLastShownAtSql),
      asc(variantKindRankSql),
      asc(knowledgeBitQuestionVariants.createdAt),
      asc(knowledgeBitQuestionVariants.id),
    );

  if (rows.length < 2) {
    return null;
  }

  const alternate = rows.find((row) => row.variantId !== excludeVariantId);

  return alternate ? toCard(alternate, now, stepsFor) : null;
}
