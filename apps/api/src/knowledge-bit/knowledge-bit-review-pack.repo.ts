import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
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
import { toCard, type StepsFor } from "./knowledge-bit-review-queue-cards.repo.js";
import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";
import {
  variantKindRankSql,
  variantLastShownAtSql,
} from "./knowledge-bit-review-queue-picked.repo.js";

export const MAX_ALTERNATES_PER_BIT = 2;

export async function listActiveSubjectIds(
  since: Date,
  db: DbExecutor = getDb(),
): Promise<string[]> {
  const rows = await db
    .select({ subjectId: cardSubjectIdSql })
    .from(knowledgeBitReviews)
    .leftJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitReviews.knowledgeBitId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(isNull(knowledgeBitReviews.undoneAt), gte(knowledgeBitReviews.reviewedAt, since)))
    .groupBy(cardSubjectIdSql);

  return rows.flatMap((row) => (row.subjectId ? [row.subjectId] : []));
}

export interface AlternatePick {
  knowledgeBitId: string;
  variantId: string;
}

// Other active plain-card wordings of each picked bit, least recently shown first.
export async function listAlternates(
  picks: AlternatePick[],
  now: Date,
  stepsFor: StepsFor,
  db: DbExecutor = getDb(),
): Promise<Map<string, KnowledgeBitReviewCardRow[]>> {
  const alternates = new Map<string, KnowledgeBitReviewCardRow[]>();

  if (picks.length === 0) {
    return alternates;
  }

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
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          picks.map((pick) => pick.knowledgeBitId),
        ),
        isNull(knowledgeBitQuestionVariants.supersededAt),
        sql`${variantCardKeySql} = ''`,
      ),
    )
    .orderBy(
      variantLastShownAtSql,
      variantKindRankSql,
      knowledgeBitQuestionVariants.createdAt,
      knowledgeBitQuestionVariants.id,
    );
  const pickedByBit = new Map(picks.map((pick) => [pick.knowledgeBitId, pick.variantId]));

  for (const row of rows) {
    const list = alternates.get(row.knowledgeBitId) ?? [];

    if (row.variantId !== pickedByBit.get(row.knowledgeBitId) && list.length < MAX_ALTERNATES_PER_BIT) {
      list.push(toCard(row, now, stepsFor));
      alternates.set(row.knowledgeBitId, list);
    }
  }

  return alternates;
}
