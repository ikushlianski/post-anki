import { cosineSimilarity } from "../subject-duplicate/cosine-similarity.js";

// Ranks items by cosine similarity to a query embedding, highest first.
export function rankBySimilarity<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  items: T[],
  topK: number,
): (T & { similarity: number })[] {
  return items
    .map((item) => ({ ...item, similarity: cosineSimilarity(queryEmbedding, item.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
