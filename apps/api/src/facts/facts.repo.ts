import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { facts } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { efSearchFor } from "../db/vector-search.js";

export interface InsertFactWithTopicInput {
  body: string;
  source: string;
  sourceRef: string;
  tags: string[];
  topicId: string;
}

export async function insertFactWithTopic(input: InsertFactWithTopicInput): Promise<void> {
  await getDb()
    .insert(facts)
    .values({ id: newId("fact"), ...input })
    .onConflictDoNothing({ target: facts.sourceRef });
}

export interface FactForEmbeddingScan {
  id: string;
  body: string;
  embeddingHash: string | null;
}

export async function listFactsForEmbeddingScan(): Promise<FactForEmbeddingScan[]> {
  return getDb()
    .select({ id: facts.id, body: facts.body, embeddingHash: facts.embeddingHash })
    .from(facts);
}

export async function updateFactEmbedding(
  factId: string,
  embedding: number[],
  hash: string,
): Promise<void> {
  await getDb()
    .update(facts)
    .set({ embedding, embeddingVec: embedding, embeddingHash: hash, embeddedAt: new Date() })
    .where(eq(facts.id, factId));
}

export interface EmbeddedFact {
  id: string;
  body: string;
  tags: string[];
  similarity: number;
}

export async function hasEmbeddedFacts(): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: facts.id })
    .from(facts)
    .where(isNotNull(facts.embeddingVec))
    .limit(1);

  return row !== undefined;
}

export async function searchEmbeddedFacts(
  queryEmbedding: number[],
  topK: number,
  minSimilarity: number,
): Promise<EmbeddedFact[]> {
  const distance = cosineDistance(facts.embeddingVec, queryEmbedding);
  const similarity = sql<number>`1 - (${distance})`;

  const rows = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('hnsw.ef_search', ${String(efSearchFor(topK))}, true)`);

    return tx
      .select({ id: facts.id, body: facts.body, tags: facts.tags, similarity })
      .from(facts)
      .where(
        and(
          isNotNull(facts.embeddingVec),
          Number.isFinite(minSimilarity) ? sql`${similarity} >= ${minSimilarity}` : undefined,
        ),
      )
      .orderBy(distance)
      .limit(topK);
  });

  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}
