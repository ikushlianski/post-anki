export type KnownCardVerdict = "exact" | "near" | "related";

export interface KnownCardCandidate {
  id: string;
  body: string;
  question: string | null;
  answer: string | null;
  similarity: number;
}

export interface JudgedKnownCard {
  id: string;
  verdict: KnownCardVerdict;
  overlap: string;
  reason: string;
  question: string;
  answer: string;
}

export interface KnownCardsContext {
  knowledgeSourceId: string | null;
  chunkIndex: number;
}

export class KnownCardsLedgeredError extends Error {
  constructor(readonly stage: "embed" | "judge", cause: unknown) {
    super(`known_cards_${stage}_failed`, { cause });
  }
}
