import { cosineSimilarity } from "./cosine-similarity";

// Decisions #1 (spec.md): 0.86 on text-embedding-3-small-family vectors.
// Explicitly an untuned starting value, not validated against this
// project's real subject data — DoD asserts behavior (a near-duplicate pair
// produces a suggestion, an unrelated pair doesn't), never this exact
// number.
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.86;

export interface EmbeddedSubject {
  id: string;
  embedding: number[];
}

export interface DuplicatePairCandidate {
  subjectAId: string;
  subjectBId: string;
  similarity: number;
}

// All-pairs cosine comparison over every subject with ANY cached embedding
// (architecture.md: this input is never capped — only the embedding call
// itself is). Pure and side-effect-free; the orchestrator decides which
// subjects to pass in and what to do with the pairs returned. subjectAId/
// subjectBId are returned in canonical lexicographic order regardless of
// input order, so callers (and the DB's partial unique index) always see
// one consistent identity for a given pair.
export function findDuplicatePairs(
  subjects: EmbeddedSubject[],
  threshold: number = DUPLICATE_SIMILARITY_THRESHOLD,
): DuplicatePairCandidate[] {
  const pairs: DuplicatePairCandidate[] = [];

  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      const left = subjects[i]!;
      const right = subjects[j]!;
      const similarity = cosineSimilarity(left.embedding, right.embedding);

      if (similarity >= threshold) {
        const [subjectAId, subjectBId] = [left.id, right.id].sort();

        pairs.push({ subjectAId: subjectAId!, subjectBId: subjectBId!, similarity });
      }
    }
  }

  return pairs;
}
