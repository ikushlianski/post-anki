import { hashContent, selectSubjectsForScan } from "@post-anki/core";
import type { EmbeddingScanCounts } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import {
  listQuestionVariantsForEmbeddingScan,
  updateQuestionVariantEmbedding,
} from "./knowledge-bit-question-variant.repo.js";

const EMBEDDING_CAP = 200;
const SCAN_LIMIT = 500;

function embeddingText(prompt: string, answer: string): string {
  return `${prompt}\n${answer}`;
}

export async function embedKnowledgeBitQuestionVariants(): Promise<EmbeddingScanCounts> {
  const rows = await listQuestionVariantsForEmbeddingScan(SCAN_LIMIT);
  const candidates = rows.map((variant) => ({
    id: variant.id,
    contentHash: hashContent(embeddingText(variant.prompt, variant.answer)),
    cachedHash: variant.embeddingHash,
  }));

  const { toEmbed, reused, capped } = selectSubjectsForScan(candidates, EMBEDDING_CAP);

  if (toEmbed.length > 0) {
    const rowById = new Map(rows.map((variant) => [variant.id, variant]));
    const embedded = await embedTexts(
      toEmbed.map((id) => ({ id, text: embeddingText(rowById.get(id)!.prompt, rowById.get(id)!.answer) })),
    );

    for (const result of embedded) {
      const variant = rowById.get(result.id)!;

      await updateQuestionVariantEmbedding(
        result.id,
        result.embedding,
        hashContent(embeddingText(variant.prompt, variant.answer)),
      );
    }
  }

  return { embeddedCount: toEmbed.length, reusedCount: reused.length, capped };
}
