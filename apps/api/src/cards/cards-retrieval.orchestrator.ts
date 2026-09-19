import { rankBySimilarity } from "@post-anki/core";
import type { CardMatchResult } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { listEmbeddedCardVariants } from "./cards.repo.js";

export async function findTopMatchingCards(
  query: string,
  topK: number,
): Promise<CardMatchResult[]> {
  const variants = await listEmbeddedCardVariants();

  if (variants.length === 0) {
    return [];
  }

  const [embedded] = await embedTexts([{ id: "query", text: query }]);
  const ranked = rankBySimilarity(embedded!.embedding, variants, topK);

  return ranked.map((variant) => ({
    variantId: variant.id,
    prompt: variant.prompt,
    answer: variant.answer,
    topicId: variant.topicId,
    topicTitle: variant.topicTitle,
    similarity: variant.similarity,
    subjectId: variant.subjectId,
    subjectName: variant.subjectName,
    tags: variant.tags,
    domainNodeNames: variant.domainNodeNames,
  }));
}
