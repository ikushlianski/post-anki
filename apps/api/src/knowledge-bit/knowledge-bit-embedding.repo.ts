import { and, asc, cosineDistance, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { applyEfSearch } from "../db/vector-search.js";

export interface KnowledgeBitForEmbeddingScan {
  id: string;
  body: string;
  embeddingHash: string | null;
}

export async function listKnowledgeBitsForEmbeddingScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForEmbeddingScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      embeddingHash: knowledgeBits.embeddingHash,
    })
    .from(knowledgeBits)
    .where(and(isNull(knowledgeBits.embeddedAt), eq(knowledgeBits.approvalState, "approved")))
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

// Body guard: no-ops if the body changed since the scan read it, so the next scan retries.
export async function updateKnowledgeBitEmbedding(
  id: string,
  embedding: number[],
  embeddingHash: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeBits)
    .set({ embedding, embeddingVec: embedding, embeddingHash, embeddedAt: new Date() })
    .where(and(eq(knowledgeBits.id, id), eq(knowledgeBits.body, expectedBody)));
}

export interface ApprovedBitForEmbedding extends KnowledgeBitForEmbeddingScan {
  embeddedAt: Date | null;
}

export async function listApprovedBitsForEmbedding(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<ApprovedBitForEmbedding[]> {
  if (ids.length === 0) {
    return [];
  }

  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      embeddingHash: knowledgeBits.embeddingHash,
      embeddedAt: knowledgeBits.embeddedAt,
    })
    .from(knowledgeBits)
    .where(and(inArray(knowledgeBits.id, ids), eq(knowledgeBits.approvalState, "approved")));
}

export interface ActiveVariantForEmbedding {
  id: string;
  prompt: string;
  answer: string;
  embeddingHash: string | null;
  embeddedAt: Date | null;
}

export async function listActiveVariantsForBitsEmbedding(
  bitIds: string[],
  db: DbExecutor = getDb(),
): Promise<ActiveVariantForEmbedding[]> {
  if (bitIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: knowledgeBitQuestionVariants.id,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      embeddingHash: knowledgeBitQuestionVariants.embeddingHash,
      embeddedAt: knowledgeBitQuestionVariants.embeddedAt,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );
}

export interface SimilarApprovedBit {
  id: string;
  body: string;
  similarity: number;
}

export async function searchApprovedBitsByEmbedding(
  queryEmbedding: number[],
  topK: number,
  minSimilarity: number,
  subjectId?: string,
): Promise<SimilarApprovedBit[]> {
  const distance = cosineDistance(knowledgeBits.embeddingVec, queryEmbedding);
  const similarity = sql<number>`1 - (${distance})`;

  const rows = await getDb().transaction(async (tx) => {
    await applyEfSearch(tx, topK, subjectId !== undefined);

    return tx
      .select({ id: knowledgeBits.id, body: knowledgeBits.body, similarity })
      .from(knowledgeBits)
      .where(
        and(
          isNotNull(knowledgeBits.embeddingVec),
          eq(knowledgeBits.approvalState, "approved"),
          Number.isFinite(minSimilarity) ? sql`${similarity} >= ${minSimilarity}` : undefined,
          subjectId
            ? inArray(
                knowledgeBits.knowledgeSourceId,
                tx
                  .select({ id: knowledgeSources.id })
                  .from(knowledgeSources)
                  .where(eq(knowledgeSources.subjectId, subjectId)),
              )
            : undefined,
        ),
      )
      .orderBy(distance)
      .limit(topK);
  });

  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}
