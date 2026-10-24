import { hashContent, selectSubjectsForScan } from "@post-anki/core";
import type { EmbeddingScanCounts } from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { listFactsForEmbeddingScan, updateFactEmbedding } from "./facts.repo.js";

const EMBEDDING_CAP = 200;

export async function embedFacts(): Promise<EmbeddingScanCounts> {
  const rows = await listFactsForEmbeddingScan();
  const candidates = rows.map((fact) => ({
    id: fact.id,
    contentHash: hashContent(fact.body),
    cachedHash: fact.embeddingHash,
  }));

  const { toEmbed, reused, capped } = selectSubjectsForScan(candidates, EMBEDDING_CAP);

  let savedCount = 0;

  if (toEmbed.length > 0) {
    const bodyById = new Map(rows.map((fact) => [fact.id, fact.body]));
    const embedded = await embedTexts(toEmbed.map((id) => ({ id, text: bodyById.get(id)! })));

    for (const result of embedded) {
      await updateFactEmbedding(result.id, result.embedding, hashContent(bodyById.get(result.id)!));
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
