import { cosineSimilarity } from "../subject-duplicate/cosine-similarity.js";

// text-embedding-3-small: unrelated pairs typically score under ~0.3.
export const MIN_MATCH_SIMILARITY = 0.3;

// Ranks items by cosine similarity to a query embedding, highest first.
export function rankBySimilarity<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  items: T[],
  topK: number,
  minSimilarity = -Infinity,
): (T & { similarity: number })[] {
  return items
    .map((item) => ({ ...item, similarity: cosineSimilarity(queryEmbedding, item.embedding) }))
    .filter((item) => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
