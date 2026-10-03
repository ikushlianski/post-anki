import { and, asc, eq, isNull, ne } from "drizzle-orm";
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
    .where(and(isNull(knowledgeBits.embeddedAt), ne(knowledgeBits.approvalState, "rejected")))
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
    .set({ embedding, embeddingHash, embeddedAt: new Date() })
    .where(and(eq(knowledgeBits.id, id), eq(knowledgeBits.body, expectedBody)));
}
