import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";

export interface SimilarSubjectPair {
  subjectAId: string;
  subjectBId: string;
  similarity: number;
}

interface PairRow extends Record<string, unknown> {
  a_id: string;
  b_id: string;
  similarity: number | string;
}

export async function findSimilarSubjectPairs(threshold: number): Promise<SimilarSubjectPair[]> {
  const result = await getDb().execute<PairRow>(sql`
    SELECT a.id AS a_id, b.id AS b_id, 1 - (a.embedding_vec <=> b.embedding_vec) AS similarity
    FROM subjects a
    JOIN subjects b ON a.id COLLATE "C" < b.id COLLATE "C"
    WHERE a.kind = 'architecture-mentor'
      AND b.kind = 'architecture-mentor'
      AND a.embedding_vec IS NOT NULL
      AND b.embedding_vec IS NOT NULL
      AND 1 - (a.embedding_vec <=> b.embedding_vec) >= ${threshold}
  `);

  return result.rows.map((row) => ({
    subjectAId: row.a_id,
    subjectBId: row.b_id,
    similarity: Number(row.similarity),
  }));
}
