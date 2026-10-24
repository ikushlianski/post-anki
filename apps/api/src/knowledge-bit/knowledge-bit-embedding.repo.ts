import { and, asc, eq, isNull } from "drizzle-orm";
import { bitNotDiscarded } from "./knowledge-bit-approval.repo.js";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";

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
    .where(and(isNull(knowledgeBits.embeddedAt), bitNotDiscarded))
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
