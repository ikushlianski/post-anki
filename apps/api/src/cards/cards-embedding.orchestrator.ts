import { hashContent, selectSubjectsForScan } from "@post-anki/core";
import type { EmbeddingScanCounts } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import {
  listCardVariantsForEmbeddingScan,
  listCardVariantsForTopic,
  updateCardVariantEmbedding,
  type CardVariantForEmbeddingScan,
} from "./cards.repo.js";

// Bounds only the paid embedding call this run, per scan (mirrors
// subject-duplicate.orchestrator.ts's own EMBEDDING_CAP).
const EMBEDDING_CAP = 200;

function contentTextFor(variant: Pick<CardVariantForEmbeddingScan, "prompt" | "answer">): string {
  return `${variant.prompt}\n${variant.answer}`;
}

async function embedVariants(
  variants: CardVariantForEmbeddingScan[],
): Promise<EmbeddingScanCounts> {
  const scanCandidates = variants.map((variant) => ({
    id: variant.id,
    contentHash: hashContent(contentTextFor(variant)),
    cachedHash: variant.embeddingHash,
  }));

  const { toEmbed, reused, capped } = selectSubjectsForScan(scanCandidates, EMBEDDING_CAP);

  let savedCount = 0;

  if (toEmbed.length > 0) {
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
    const toEmbedItems = toEmbed.map((id) => ({
      id,
      text: contentTextFor(variantsById.get(id)!),
    }));

    const freshlyEmbedded = await embedTexts(toEmbedItems);

    for (const result of freshlyEmbedded) {
      const variant = variantsById.get(result.id)!;

      await updateCardVariantEmbedding(
        result.id,
        result.embedding,
        hashContent(contentTextFor(variant)),
      );
      savedCount += 1;
    }
  }

  return {
    embeddedCount: savedCount,
    reusedCount: reused.length,
    capped,
    ...(toEmbed.length > savedCount ? { skippedCount: toEmbed.length - savedCount } : {}),
  };
}

export async function triggerCardEmbeddingScan(): Promise<EmbeddingScanCounts> {
  return embedVariants(await listCardVariantsForEmbeddingScan());
}

// Scoped sibling of triggerCardEmbeddingScan — one topic's own variants only.
export async function embedVariantsForTopic(topicId: string): Promise<void> {
  await embedVariants(await listCardVariantsForTopic(topicId));
}
