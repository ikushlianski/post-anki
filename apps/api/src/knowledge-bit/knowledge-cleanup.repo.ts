import { and, eq, inArray } from "drizzle-orm";
import type { KnowledgeDeletionCounts } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  cardTriageSessions,
  facts,
  knowledgeBitFeedback,
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeBitVariantAttempts,
  knowledgeSourceExtractionGrade,
  knowledgeSources,
  tagAssignments,
  topicCardVariants,
} from "../db/schema.js";

function emptyCounts(): KnowledgeDeletionCounts {
  return {
    knowledgeBits: 0,
    questionVariants: 0,
    variantAttempts: 0,
    schedules: 0,
    reviews: 0,
    feedback: 0,
    tagAssignments: 0,
    knowledgeSources: 0,
    extractionGrades: 0,
    topicCardVariants: 0,
    facts: 0,
    triageSessions: 0,
  };
}

const rows = (result: { rowCount: number | null }): number => result.rowCount ?? 0;

export async function purgeKnowledgeBits(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<KnowledgeDeletionCounts> {
  return db.transaction((tx) => purgeBitsIn([...new Set(ids)], tx));
}

export async function deleteKnowledgeSource(
  sourceId: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeDeletionCounts> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .for("update");

    const bitRows = await tx
      .select({ id: knowledgeBits.id })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.knowledgeSourceId, sourceId));

    const counts = await purgeBitsIn(
      bitRows.map((row) => row.id),
      tx,
    );

    counts.feedback += rows(
      await tx.delete(knowledgeBitFeedback).where(eq(knowledgeBitFeedback.knowledgeSourceId, sourceId)),
    );
    counts.extractionGrades = rows(
      await tx
        .delete(knowledgeSourceExtractionGrade)
        .where(eq(knowledgeSourceExtractionGrade.knowledgeSourceId, sourceId)),
    );
    counts.knowledgeSources = rows(await tx.delete(knowledgeSources).where(eq(knowledgeSources.id, sourceId)));

    return counts;
  });
}

export async function clearAllKnowledge(db: DbExecutor = getDb()): Promise<KnowledgeDeletionCounts> {
  return db.transaction(async (tx) => {
    const counts = emptyCounts();

    await tx.select({ id: knowledgeSources.id }).from(knowledgeSources).for("update");
    await tx.select({ id: knowledgeBits.id }).from(knowledgeBits).for("update");

    counts.variantAttempts = rows(await tx.delete(knowledgeBitVariantAttempts));
    counts.reviews = rows(await tx.delete(knowledgeBitReviews));
    counts.schedules = rows(await tx.delete(knowledgeBitSchedules));
    counts.feedback = rows(await tx.delete(knowledgeBitFeedback));
    counts.tagAssignments = rows(
      await tx.delete(tagAssignments).where(eq(tagAssignments.nodeType, "knowledgeBit")),
    );
    counts.questionVariants = rows(await tx.delete(knowledgeBitQuestionVariants));
    counts.knowledgeBits = rows(await tx.delete(knowledgeBits));
    counts.extractionGrades = rows(await tx.delete(knowledgeSourceExtractionGrade));
    counts.knowledgeSources = rows(await tx.delete(knowledgeSources));
    counts.topicCardVariants = rows(await tx.delete(topicCardVariants));
    counts.facts = rows(await tx.delete(facts));
    counts.triageSessions = rows(await tx.delete(cardTriageSessions));

    return counts;
  });
}

async function purgeBitsIn(bitIds: string[], db: DbExecutor): Promise<KnowledgeDeletionCounts> {
  const counts = emptyCounts();

  if (bitIds.length === 0) {
    return counts;
  }

  const existing = await db
    .select({ id: knowledgeBits.id })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, bitIds))
    .for("update");

  const variantRows = await db
    .select({ id: knowledgeBitQuestionVariants.id })
    .from(knowledgeBitQuestionVariants)
    .where(inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds));

  const variantIds = variantRows.map((row) => row.id);

  if (variantIds.length > 0) {
    counts.variantAttempts = rows(
      await db
        .delete(knowledgeBitVariantAttempts)
        .where(inArray(knowledgeBitVariantAttempts.variantId, variantIds)),
    );
  }

  counts.reviews = rows(
    await db.delete(knowledgeBitReviews).where(inArray(knowledgeBitReviews.knowledgeBitId, bitIds)),
  );
  counts.schedules = rows(
    await db.delete(knowledgeBitSchedules).where(inArray(knowledgeBitSchedules.knowledgeBitId, bitIds)),
  );
  counts.feedback = rows(
    await db.delete(knowledgeBitFeedback).where(inArray(knowledgeBitFeedback.knowledgeBitId, bitIds)),
  );
  counts.tagAssignments = rows(
    await db
      .delete(tagAssignments)
      .where(and(eq(tagAssignments.nodeType, "knowledgeBit"), inArray(tagAssignments.nodeId, bitIds))),
  );
  counts.questionVariants = rows(
    await db
      .delete(knowledgeBitQuestionVariants)
      .where(inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds)),
  );
  counts.knowledgeBits = rows(
    await db.delete(knowledgeBits).where(
      inArray(
        knowledgeBits.id,
        existing.map((row) => row.id),
      ),
    ),
  );

  return counts;
}
