// Pure cosine similarity between two equal-length embedding vectors.
// Returns a value in [-1, 1]; 1.0 for identical-direction vectors, 0.0 for
// orthogonal vectors. Throws on mismatched lengths rather than silently
// truncating/padding — a length mismatch here always means a bug upstream
// (comparing embeddings from two different models, or a malformed cache
// row), never a legitimate input to tolerate.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
