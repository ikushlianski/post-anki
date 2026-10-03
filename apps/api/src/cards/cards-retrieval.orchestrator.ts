import { rankBySimilarity } from "@post-anki/core";
import type { CardMatchResult } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { listEmbeddedFacts, type EmbeddedFact } from "../facts/facts.repo.js";
import { listEmbeddedCardVariants, type EmbeddedCardVariant } from "./cards.repo.js";

type Candidate =
  | ({ kind: "card" } & EmbeddedCardVariant)
  | ({ kind: "fact" } & EmbeddedFact);

function toMatch(candidate: Candidate & { similarity: number }): CardMatchResult {
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
  const [variants, facts] = await Promise.all([listEmbeddedCardVariants(), listEmbeddedFacts()]);
  const candidates: Candidate[] = [
    ...variants.map((variant) => ({ kind: "card" as const, ...variant })),
    ...facts.map((fact) => ({ kind: "fact" as const, ...fact })),
  ];

  if (candidates.length === 0) {
    return [];
  }

  const [embedded] = await embedTexts([{ id: "query", text: query }]);

  return rankBySimilarity(embedded!.embedding, candidates, topK, minSimilarity).map(toMatch);
}
