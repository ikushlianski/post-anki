import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { facts } from "../db/schema.js";

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
    .set({ embedding, embeddingHash: hash, embeddedAt: new Date() })
    .where(eq(facts.id, factId));
}

export interface EmbeddedFact {
  id: string;
  body: string;
  tags: string[];
  embedding: number[];
}

export async function listEmbeddedFacts(): Promise<EmbeddedFact[]> {
  const rows = await getDb()
    .select({ id: facts.id, body: facts.body, tags: facts.tags, embedding: facts.embedding })
    .from(facts)
    .where(isNotNull(facts.embedding));

  return rows.map((row) => ({ ...row, embedding: row.embedding! }));
}
