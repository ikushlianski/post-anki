import type { LlmCallAudit } from "../llm-call-events/llm-call-audit.js";
import { searchApprovedBitsByEmbedding } from "../knowledge-bit/knowledge-bit-embedding.repo.js";
import { embedTexts } from "../shared/embeddings-client.js";
import { MINING_DUPLICATE_SIMILARITY, MINING_OP_EMBED } from "./card-synthesis-mining.config.js";

export async function hasNearDuplicateOverview(title: string, audit: LlmCallAudit): Promise<boolean> {
  const [first] = await embedTexts([{ id: "intent", text: title }], { ...audit, op: MINING_OP_EMBED });

  if (!first) {
    throw new Error("card_synthesis_embedding_missing");
  }

  const similar = await searchApprovedBitsByEmbedding(first.embedding, 1, MINING_DUPLICATE_SIMILARITY);

  return similar.length > 0;
}
