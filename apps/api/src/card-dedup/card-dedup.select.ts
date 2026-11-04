import { CARD_DEDUP_BORDERLINE_THRESHOLD, CARD_DEDUP_DUPLICATE_THRESHOLD } from "./card-dedup.config.js";

export type SimilarityBand = "duplicate" | "borderline" | "distinct";

export interface DuplicateMatch {
  bitId: string;
  similarity: number;
  reason: string | null;
  similarBitIds: string[];
}

export function classifySimilarity(similarity: number): SimilarityBand {
  if (similarity >= CARD_DEDUP_DUPLICATE_THRESHOLD) {
    return "duplicate";
  }

  return similarity >= CARD_DEDUP_BORDERLINE_THRESHOLD ? "borderline" : "distinct";
}
