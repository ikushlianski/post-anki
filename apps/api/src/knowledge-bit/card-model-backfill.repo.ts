import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  cardTriageDecisions,
  knowledgeBitFeedback,
  knowledgeBitFusionModels,
  knowledgeBits,
  knowledgeSources,
} from "../db/schema.js";
import type { CardModelBackfillCandidate } from "./card-model-backfill.js";

const UPDATE_CHUNK = 500;

export async function listUnstampedCardCandidates(db: DbExecutor = getDb()): Promise<CardModelBackfillCandidate[]> {
  const bits = await db
    .select({ bitId: knowledgeBits.id, sourceModelId: knowledgeSources.extractionModelId })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(isNull(knowledgeBits.generatedByModelId), sql`${knowledgeBits.origin} <> 'manual'`));

  if (bits.length === 0) {
    return [];
  }

  const [fusion, feedback] = await Promise.all([
    db
      .select({ bitId: knowledgeBitFusionModels.bitId, modelId: knowledgeBitFusionModels.modelId })
      .from(knowledgeBitFusionModels),
    db
      .selectDistinctOn([knowledgeBitFeedback.knowledgeBitId], {
        bitId: knowledgeBitFeedback.knowledgeBitId,
        modelId: knowledgeBitFeedback.modelId,
      })
      .from(knowledgeBitFeedback)
      .where(and(isNotNull(knowledgeBitFeedback.modelId), isNotNull(knowledgeBitFeedback.knowledgeBitId)))
      .orderBy(knowledgeBitFeedback.knowledgeBitId, desc(knowledgeBitFeedback.createdAt)),
  ]);
  const fusionByBit = new Map<string, string[]>();

  for (const row of fusion) {
    fusionByBit.set(row.bitId, [...(fusionByBit.get(row.bitId) ?? []), row.modelId]);
  }

  const feedbackByBit = new Map(feedback.map((row) => [row.bitId, row.modelId]));

  return bits.map((bit) => ({
    bitId: bit.bitId,
    sourceModelId: bit.sourceModelId,
    fusionModelIds: fusionByBit.get(bit.bitId) ?? [],
    feedbackModelId: feedbackByBit.get(bit.bitId) ?? null,
  }));
}

export async function stampCards(
  groups: ReadonlyMap<string, readonly string[]>,
  db: DbExecutor = getDb(),
): Promise<number> {
  let stamped = 0;

  for (const [modelId, bitIds] of groups) {
    for (let start = 0; start < bitIds.length; start += UPDATE_CHUNK) {
      const ids = bitIds.slice(start, start + UPDATE_CHUNK);
      const rows = await db
        .update(knowledgeBits)
        .set({ generatedByModelId: modelId })
        .where(and(inArray(knowledgeBits.id, ids), isNull(knowledgeBits.generatedByModelId)))
        .returning({ id: knowledgeBits.id });

      stamped += rows.length;
    }
  }

  return stamped;
}

export async function copyStampToRecords(
  db: DbExecutor = getDb(),
): Promise<{ decisions: number; feedback: number }> {
  const decisions = await db
    .update(cardTriageDecisions)
    .set({ extractionModelId: knowledgeBits.generatedByModelId })
    .from(knowledgeBits)
    .where(
      and(
        eq(knowledgeBits.id, cardTriageDecisions.knowledgeBitId),
        isNull(cardTriageDecisions.extractionModelId),
        isNotNull(knowledgeBits.generatedByModelId),
      ),
    )
    .returning({ id: cardTriageDecisions.id });
  const feedback = await db
    .update(knowledgeBitFeedback)
    .set({ modelId: knowledgeBits.generatedByModelId })
    .from(knowledgeBits)
    .where(
      and(
        eq(knowledgeBits.id, knowledgeBitFeedback.knowledgeBitId),
        isNull(knowledgeBitFeedback.modelId),
        isNotNull(knowledgeBits.generatedByModelId),
      ),
    )
    .returning({ id: knowledgeBitFeedback.id });

  return { decisions: decisions.length, feedback: feedback.length };
}
