import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";

export interface SimilarSourcePair {
  sourceAId: string;
  sourceBId: string;
  similarity: number;
}

interface PairRow extends Record<string, unknown> {
  a_id: string;
  b_id: string;
  similarity: number | string;
}

export async function findSimilarSourcePairs(threshold: number): Promise<SimilarSourcePair[]> {
  const result = await getDb().execute<PairRow>(sql`
    SELECT a.id AS a_id, b.id AS b_id, 1 - (a.embedding_vec <=> b.embedding_vec) AS similarity
    FROM sources a
    JOIN sources b ON a.id COLLATE "C" < b.id COLLATE "C"
    WHERE a.kind IN ('link', 'text')
      AND b.kind IN ('link', 'text')
      AND a.embedding_vec IS NOT NULL
      AND b.embedding_vec IS NOT NULL
      AND 1 - (a.embedding_vec <=> b.embedding_vec) >= ${threshold}
  `);

  return result.rows.map((row) => ({
    sourceAId: row.a_id,
    sourceBId: row.b_id,
    similarity: Number(row.similarity),
  }));
}
