import { hashContent, selectSubjectsForScan } from "@post-anki/core";
import { embedTexts } from "../shared/embeddings-client.js";
import { log } from "../shared/log.js";
import {
  listActiveVariantsForBitsEmbedding,
  listApprovedBitsForEmbedding,
  searchApprovedBitsByEmbedding,
  updateKnowledgeBitEmbedding,
  type SimilarApprovedBit,
} from "./knowledge-bit-embedding.repo.js";
import { updateQuestionVariantEmbedding } from "./knowledge-bit-question-variant.repo.js";

const EMBEDDING_CAP = 200;

function variantText(prompt: string, answer: string): string {
  return `${prompt}\n${answer}`;
}

interface EmbedItem {
  id: string;
  text: string;
  hash: string;
  cachedHash: string | null;
}

async function embedItems(
  items: EmbedItem[],
  save: (id: string, embedding: number[], hash: string, text: string) => Promise<void>,
): Promise<void> {
  const { toEmbed } = selectSubjectsForScan(
    items.map((item) => ({ id: item.id, contentHash: item.hash, cachedHash: item.cachedHash })),
    EMBEDDING_CAP,
  );

  if (toEmbed.length === 0) {
    return;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const embedded = await embedTexts(toEmbed.map((id) => ({ id, text: byId.get(id)!.text })));

  for (const result of embedded) {
    const item = byId.get(result.id)!;

    await save(item.id, result.embedding, item.hash, item.text);
  }
}

export async function embedApprovedKnowledgeBits(bitIds: string[]): Promise<void> {
  try {
    const bits = await listApprovedBitsForEmbedding(bitIds);

    await embedItems(
      bits.map((bit) => ({
        id: bit.id,
        text: bit.body,
        hash: hashContent(bit.body),
        cachedHash: bit.embeddedAt ? bit.embeddingHash : null,
      })),
      (id, embedding, hash, text) => updateKnowledgeBitEmbedding(id, embedding, hash, text),
    );
  } catch (err) {
    log.error({ err, bitIds }, "knowledge_bit_embed_on_approval_failed");
  }

  try {
    const approvedIds = (await listApprovedBitsForEmbedding(bitIds)).map((bit) => bit.id);
    const variants = await listActiveVariantsForBitsEmbedding(approvedIds);

    await embedItems(
      variants.map((variant) => {
        const text = variantText(variant.prompt, variant.answer);

        return {
          id: variant.id,
          text,
          hash: hashContent(text),
          cachedHash: variant.embeddedAt ? variant.embeddingHash : null,
        };
      }),
      (id, embedding, hash) => updateQuestionVariantEmbedding(id, embedding, hash),
    );
  } catch (err) {
    log.error({ err, bitIds }, "knowledge_bit_variant_embed_on_approval_failed");
  }
}

export async function findSimilarApprovedKnowledgeBits(
  query: string,
  topK: number,
  minSimilarity = -Infinity,
  subjectId?: string,
): Promise<SimilarApprovedBit[]> {
  const [embedded] = await embedTexts([{ id: "query", text: query }]);

  if (!embedded) {
    return [];
  }

  return searchApprovedBitsByEmbedding(embedded.embedding, topK, minSimilarity, subjectId);
}
