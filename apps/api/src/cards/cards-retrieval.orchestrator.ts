import type { CardMatchResult } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { hasEmbeddedFacts, searchEmbeddedFacts, type EmbeddedFact } from "../facts/facts.repo.js";
import {
  hasEmbeddedCardVariants,
  searchEmbeddedCardVariants,
  type EmbeddedCardVariant,
} from "./cards.repo.js";

type Candidate =
  | ({ kind: "card" } & EmbeddedCardVariant)
  | ({ kind: "fact" } & EmbeddedFact);

function toMatch(candidate: Candidate): CardMatchResult {
  if (candidate.kind === "fact") {
    return {
      variantId: candidate.id,
      kind: "fact",
      prompt: candidate.body,
      answer: "",
      topicId: "facts",
      topicTitle: "Reading notes",
      similarity: candidate.similarity,
      subjectId: "",
      subjectName: "",
      tags: candidate.tags,
      domainNodeNames: [],
    };
  }

  return {
    variantId: candidate.id,
    kind: "card",
    prompt: candidate.prompt,
    answer: candidate.answer,
    topicId: candidate.topicId,
    topicTitle: candidate.topicTitle,
    similarity: candidate.similarity,
    subjectId: candidate.subjectId,
    subjectName: candidate.subjectName,
    tags: candidate.tags,
    domainNodeNames: candidate.domainNodeNames,
  };
}

export async function findTopMatchingCards(
  query: string,
  topK: number,
  minSimilarity = -Infinity,
): Promise<CardMatchResult[]> {
  const [hasVariants, hasFacts] = await Promise.all([hasEmbeddedCardVariants(), hasEmbeddedFacts()]);

  if (!hasVariants && !hasFacts) {
    return [];
  }

  const [embedded] = await embedTexts([{ id: "query", text: query }]);
  const queryEmbedding = embedded!.embedding;

  const [variants, facts] = await Promise.all([
    hasVariants ? searchEmbeddedCardVariants(queryEmbedding, topK, minSimilarity) : [],
    hasFacts ? searchEmbeddedFacts(queryEmbedding, topK, minSimilarity) : [],
  ]);
  const candidates: Candidate[] = [
    ...variants.map((variant) => ({ kind: "card" as const, ...variant })),
    ...facts.map((fact) => ({ kind: "fact" as const, ...fact })),
  ];

  return candidates
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(toMatch);
}
