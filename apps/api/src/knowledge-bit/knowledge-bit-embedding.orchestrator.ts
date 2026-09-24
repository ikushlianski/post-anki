import { hashContent, selectSubjectsForScan } from "@post-anki/core";
import type { EmbeddingScanCounts } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import {
  listKnowledgeBitsForEmbeddingScan,
  updateKnowledgeBitEmbedding,
} from "./knowledge-bit-embedding.repo.js";

const EMBEDDING_CAP = 200;
const SCAN_LIMIT = 500;

export async function embedKnowledgeBits(): Promise<EmbeddingScanCounts> {
  const rows = await listKnowledgeBitsForEmbeddingScan(SCAN_LIMIT);
  const candidates = rows.map((bit) => ({
    id: bit.id,
    contentHash: hashContent(bit.body),
    cachedHash: bit.embeddingHash,
  }));

  const { toEmbed, reused, capped } = selectSubjectsForScan(candidates, EMBEDDING_CAP);

  if (toEmbed.length > 0) {
    const bodyById = new Map(rows.map((bit) => [bit.id, bit.body]));
    const embedded = await embedTexts(toEmbed.map((id) => ({ id, text: bodyById.get(id)! })));

    for (const result of embedded) {
      await updateKnowledgeBitEmbedding(
        result.id,
        result.embedding,
        hashContent(bodyById.get(result.id)!),
      );
    }
  }

  return { embeddedCount: toEmbed.length, reusedCount: reused.length, capped };
}
